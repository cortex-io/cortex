#!/usr/bin/env bash
################################################################################
# Cortex Pod Verification Script (Direct kubectl)
# Requires network access to K3s cluster or run from within cluster network
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_section() { echo -e "\n${BLUE}======================================================================${NC}\n  $*\n${BLUE}======================================================================${NC}"; }

# Configuration
NAMESPACE="cortex-system"
EXPECTED_PODS=5
LOADBALANCER_IP="10.88.145.201"
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.kube/k3s-cortex-config.yaml}"

# Expected pods
declare -a EXPECTED_POD_NAMES=(
  "coordinator-master"
  "development-master"
  "security-master"
  "cicd-master"
  "dashboard"
)

log_section "Cortex K3s Pod Verification"

# Check kubeconfig
if [ ! -f "$KUBECONFIG_FILE" ]; then
    log_error "Kubeconfig not found: $KUBECONFIG_FILE"
    log_info "Please ensure kubeconfig is available"
    exit 1
fi

export KUBECONFIG="$KUBECONFIG_FILE"
log_info "Using kubeconfig: $KUBECONFIG_FILE"

# Check kubectl
if ! command -v kubectl >/dev/null 2>&1; then
    log_error "kubectl not found in PATH"
    log_info "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# Test cluster connectivity
log_section "Testing K3s Cluster Connectivity"

if ! kubectl cluster-info >/dev/null 2>&1; then
    log_error "Cannot connect to K3s cluster"
    log_info "Cluster API may be unreachable. Check network connectivity."
    log_info "K3s API should be at: https://10.88.145.180:6443"
    log_info ""
    log_info "Troubleshooting steps:"
    log_info "  1. Verify VPN connection to 10.88.145.x network"
    log_info "  2. Check firewall rules allow port 6443"
    log_info "  3. Verify K3s master VM is running (Proxmox VM 310)"
    log_info "  4. Try SSH to K3s master: ssh root@10.88.145.180"
    log_info ""
    log_info "Alternative: Run this script from Proxmox console or K3s master VM"
    exit 1
fi

log_success "Connected to K3s cluster"
kubectl cluster-info
echo ""

# Check namespace
log_section "Checking Namespace '$NAMESPACE'"

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    log_error "Namespace '$NAMESPACE' not found"
    log_info "Creating namespace..."
    kubectl create namespace "$NAMESPACE"
    log_success "Namespace created"
else
    log_success "Namespace '$NAMESPACE' exists"
fi

# Get all pods
log_section "Checking Pod Status"
echo ""

kubectl get pods -n "$NAMESPACE" -o wide

echo ""

# Count pods by status
TOTAL_PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l | tr -d ' ')
RUNNING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
PENDING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l | tr -d ' ')
FAILED_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l | tr -d ' ')

log_info "Total pods: $TOTAL_PODS"
log_info "Running pods: $RUNNING_PODS"
log_info "Pending pods: $PENDING_PODS"
log_info "Failed pods: $FAILED_PODS"

# Check for ImagePullBackOff
log_section "Checking for Image Pull Errors"

IMAGE_PULL_ERRORS=$(kubectl get pods -n "$NAMESPACE" -o json | \
    jq -r '.items[] | select(.status.containerStatuses[]?.state.waiting?.reason == "ImagePullBackOff") | .metadata.name' 2>/dev/null || echo "")

if [ -n "$IMAGE_PULL_ERRORS" ]; then
    log_warn "Pods with ImagePullBackOff errors:"
    echo "$IMAGE_PULL_ERRORS" | while read -r pod; do
        echo "  - $pod"
        kubectl describe pod "$pod" -n "$NAMESPACE" | grep -A 15 "Events:" || true
    done
    echo ""
    log_info "These pods cannot pull Docker images from ghcr.io/ry-ops"
    log_info "Verify images exist: https://github.com/ry-ops?tab=packages"
else
    log_success "No ImagePullBackOff errors"
fi

# Check for CrashLoopBackOff
log_section "Checking for Crash Loops"

CRASH_LOOP_ERRORS=$(kubectl get pods -n "$NAMESPACE" -o json | \
    jq -r '.items[] | select(.status.containerStatuses[]?.state.waiting?.reason == "CrashLoopBackOff") | .metadata.name' 2>/dev/null || echo "")

if [ -n "$CRASH_LOOP_ERRORS" ]; then
    log_error "Pods in CrashLoopBackOff:"
    echo "$CRASH_LOOP_ERRORS" | while read -r pod; do
        echo "  - $pod"
        log_info "Last 20 lines of logs for $pod:"
        kubectl logs "$pod" -n "$NAMESPACE" --tail=20 2>/dev/null || log_warn "Cannot retrieve logs"
        echo ""
    done
else
    log_success "No CrashLoopBackOff errors"
fi

# Check each expected pod
log_section "Verifying Expected Pods"
echo ""

ALL_RUNNING=true
for pod_name in "${EXPECTED_POD_NAMES[@]}"; do
    POD_STATUS=$(kubectl get pods -n "$NAMESPACE" -l "app=$pod_name" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")

    if [ "$POD_STATUS" = "Running" ]; then
        # Check if container is actually ready
        READY=$(kubectl get pods -n "$NAMESPACE" -l "app=$pod_name" -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")

        if [ "$READY" = "True" ]; then
            log_success "$pod_name: Running (Ready)"
        else
            log_warn "$pod_name: Running (Not Ready)"
            ALL_RUNNING=false
        fi
    elif [ "$POD_STATUS" = "NotFound" ]; then
        log_error "$pod_name: Not Found"
        ALL_RUNNING=false
    else
        log_warn "$pod_name: $POD_STATUS"
        ALL_RUNNING=false
    fi
done

echo ""

# Check services
log_section "Checking Services"

kubectl get services -n "$NAMESPACE" -o wide

echo ""

# Check LoadBalancer IP
LOADBALANCER_ACTUAL=$(kubectl get service dashboard -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

if [ -n "$LOADBALANCER_ACTUAL" ]; then
    log_success "LoadBalancer IP assigned: $LOADBALANCER_ACTUAL"

    if [ "$LOADBALANCER_ACTUAL" = "$LOADBALANCER_IP" ]; then
        log_success "LoadBalancer IP matches expected: $LOADBALANCER_IP"
    else
        log_warn "LoadBalancer IP differs from expected"
        log_info "  Expected: $LOADBALANCER_IP"
        log_info "  Actual:   $LOADBALANCER_ACTUAL"
    fi
else
    log_warn "LoadBalancer IP not yet assigned"
    log_info "Service may still be provisioning LoadBalancer"
fi

# Test dashboard accessibility
log_section "Testing Dashboard Accessibility"

DASHBOARD_URL="http://${LOADBALANCER_ACTUAL:-$LOADBALANCER_IP}"

if curl -s --connect-timeout 5 "$DASHBOARD_URL" >/dev/null 2>&1; then
    log_success "Dashboard is accessible at $DASHBOARD_URL"

    # Try to get dashboard title
    DASHBOARD_TITLE=$(curl -s "$DASHBOARD_URL" | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' || echo "")
    if [ -n "$DASHBOARD_TITLE" ]; then
        log_info "Dashboard title: $DASHBOARD_TITLE"
    fi
else
    log_warn "Dashboard is not accessible at $DASHBOARD_URL"
    log_info "Dashboard may still be starting up or LoadBalancer not fully configured"
fi

# Check pod logs for errors
log_section "Checking Pod Logs for Errors"

for pod_name in "${EXPECTED_POD_NAMES[@]}"; do
    POD=$(kubectl get pods -n "$NAMESPACE" -l "app=$pod_name" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -n "$POD" ]; then
        ERROR_COUNT=$(kubectl logs "$POD" -n "$NAMESPACE" --tail=100 2>/dev/null | grep -i "error\|fatal\|exception" | wc -l | tr -d ' ')

        if [ "$ERROR_COUNT" -gt 0 ]; then
            log_warn "$pod_name: Found $ERROR_COUNT error lines in logs"
            kubectl logs "$POD" -n "$NAMESPACE" --tail=100 2>/dev/null | grep -i "error\|fatal\|exception" | head -10
        else
            log_success "$pod_name: No errors in recent logs"
        fi
    fi
done

# Generate verification report
log_section "Generating Verification Report"

REPORT_FILE="/Users/ryandahlberg/Projects/cortex/coordination/pod-verification-$(date +%Y%m%d-%H%M%S).json"

cat > "$REPORT_FILE" <<EOF
{
  "verification_id": "pod-verify-$(date +%Y%m%d-%H%M%S)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "namespace": "$NAMESPACE",
  "expected_pods": $EXPECTED_PODS,
  "total_pods": $TOTAL_PODS,
  "running_pods": $RUNNING_PODS,
  "pending_pods": $PENDING_PODS,
  "failed_pods": $FAILED_PODS,
  "loadbalancer_ip": "${LOADBALANCER_ACTUAL:-NotAssigned}",
  "expected_loadbalancer_ip": "$LOADBALANCER_IP",
  "dashboard_url": "$DASHBOARD_URL",
  "all_pods_running": $([ "$ALL_RUNNING" = true ] && echo "true" || echo "false"),
  "status": "$([ "$RUNNING_PODS" -eq "$EXPECTED_PODS" ] && echo 'complete' || echo 'partial')",
  "pod_status": {
    "coordinator_master": "$(kubectl get pods -n $NAMESPACE -l app=coordinator-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'NotFound')",
    "development_master": "$(kubectl get pods -n $NAMESPACE -l app=development-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'NotFound')",
    "security_master": "$(kubectl get pods -n $NAMESPACE -l app=security-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'NotFound')",
    "cicd_master": "$(kubectl get pods -n $NAMESPACE -l app=cicd-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'NotFound')",
    "dashboard": "$(kubectl get pods -n $NAMESPACE -l app=dashboard -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'NotFound')"
  }
}
EOF

log_success "Verification report saved to: $REPORT_FILE"

# Overall status
log_section "Deployment Verification Summary"
echo ""

if [ "$RUNNING_PODS" -eq "$EXPECTED_PODS" ] && [ "$ALL_RUNNING" = true ]; then
    log_success "ALL PODS ARE RUNNING SUCCESSFULLY!"
    log_success "Deployment Status: COMPLETE"

    echo ""
    echo "Access Cortex Dashboard at: ${CYAN}$DASHBOARD_URL${NC}"
    echo ""

    exit 0
elif [ "$RUNNING_PODS" -gt 0 ]; then
    log_warn "PARTIAL DEPLOYMENT"
    log_warn "$RUNNING_PODS out of $EXPECTED_PODS pods are running"
    log_info "Check pod logs and events above for issues"

    exit 2
else
    log_error "NO PODS ARE RUNNING"
    log_error "Deployment Status: FAILED"
    log_info "Verify that manifests were applied:"
    log_info "  kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/config/"
    log_info "  kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/masters/"
    log_info "  kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/services/"

    exit 1
fi
