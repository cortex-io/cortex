#!/usr/bin/env bash
################################################################################
# Cortex K3s Deployment Verification Script
# Monitors pod status and verifies successful deployment
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_section() { echo -e "\n${BLUE}======================================================================${NC}\n  $*\n${BLUE}======================================================================${NC}"; }

# Configuration
NAMESPACE="cortex-system"
EXPECTED_PODS=5
DASHBOARD_URL="http://10.88.145.201"
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.kube/k3s-cortex-config.yaml}"

# Expected pods
declare -a EXPECTED_POD_NAMES=(
  "coordinator-master"
  "development-master"
  "security-master"
  "cicd-master"
  "dashboard"
)

log_section "Cortex K3s Deployment Verification"

# Check kubeconfig
if [ ! -f "$KUBECONFIG_FILE" ]; then
  log_error "Kubeconfig not found: $KUBECONFIG_FILE"
  log_info "Please ensure you have copied the kubeconfig from the K3s cluster"
  exit 1
fi

export KUBECONFIG="$KUBECONFIG_FILE"
log_info "Using kubeconfig: $KUBECONFIG_FILE"

# Check kubectl connectivity
log_section "Testing Kubernetes API Connectivity"
if ! kubectl cluster-info &>/dev/null; then
  log_error "Cannot connect to Kubernetes cluster"
  log_info "Network may be unreachable. Please check VPN/network connectivity."
  exit 1
fi

log_success "Connected to Kubernetes cluster"

# Check namespace
log_section "Checking Namespace"
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  log_error "Namespace '$NAMESPACE' not found"
  exit 1
fi

log_success "Namespace '$NAMESPACE' exists"

# Get pod status
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
IMAGE_PULL_ERRORS=$(kubectl get pods -n "$NAMESPACE" -o json | jq -r '.items[] | select(.status.containerStatuses[]?.state.waiting?.reason == "ImagePullBackOff") | .metadata.name' 2>/dev/null || echo "")

if [ -n "$IMAGE_PULL_ERRORS" ]; then
  log_warn "Pods with ImagePullBackOff errors:"
  echo "$IMAGE_PULL_ERRORS" | while read -r pod; do
    echo "  - $pod"
    # Show detailed status
    kubectl describe pod "$pod" -n "$NAMESPACE" | grep -A 10 "Events:" || true
  done
  echo ""
  log_info "These pods are waiting for Docker images to be available in GHCR"
fi

# Check for CrashLoopBackOff
CRASH_LOOP_ERRORS=$(kubectl get pods -n "$NAMESPACE" -o json | jq -r '.items[] | select(.status.containerStatuses[]?.state.waiting?.reason == "CrashLoopBackOff") | .metadata.name' 2>/dev/null || echo "")

if [ -n "$CRASH_LOOP_ERRORS" ]; then
  log_error "Pods in CrashLoopBackOff:"
  echo "$CRASH_LOOP_ERRORS" | while read -r pod; do
    echo "  - $pod"
    # Show logs
    log_info "Last 20 lines of logs for $pod:"
    kubectl logs "$pod" -n "$NAMESPACE" --tail=20 2>/dev/null || log_warn "Cannot retrieve logs"
  done
fi

# Check each expected pod
log_section "Verifying Expected Pods"
echo ""

ALL_RUNNING=true
for pod_name in "${EXPECTED_POD_NAMES[@]}"; do
  POD_STATUS=$(kubectl get pods -n "$NAMESPACE" -l "app=$pod_name" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")

  if [ "$POD_STATUS" = "Running" ]; then
    log_success "$pod_name: $POD_STATUS"
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
LOADBALANCER_IP=$(kubectl get service dashboard -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

if [ -n "$LOADBALANCER_IP" ]; then
  log_success "LoadBalancer IP assigned: $LOADBALANCER_IP"
else
  log_warn "LoadBalancer IP not yet assigned"
fi

# Test dashboard accessibility
log_section "Testing Dashboard Accessibility"

if curl -s --connect-timeout 5 "$DASHBOARD_URL" >/dev/null 2>&1; then
  log_success "Dashboard is accessible at $DASHBOARD_URL"
else
  log_warn "Dashboard is not accessible at $DASHBOARD_URL"
  log_info "This may be due to network routing or the service not being ready yet"
fi

# Overall status
log_section "Deployment Status Summary"
echo ""

if [ "$RUNNING_PODS" -eq "$EXPECTED_PODS" ] && [ "$ALL_RUNNING" = true ]; then
  log_success "ALL PODS ARE RUNNING SUCCESSFULLY!"
  log_success "Deployment Status: COMPLETE"
  exit 0
elif [ "$RUNNING_PODS" -gt 0 ]; then
  log_warn "PARTIAL DEPLOYMENT"
  log_warn "$RUNNING_PODS out of $EXPECTED_PODS pods are running"
  log_info "Waiting for remaining pods to start..."
  exit 2
else
  log_error "NO PODS ARE RUNNING"
  log_error "Deployment Status: FAILED"
  exit 1
fi
