#!/bin/bash
set -euo pipefail

# Deploy cortex-resource-manager to K3s cluster
# Usage: ./deploy-resource-manager.sh [--verify-only]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$CORTEX_ROOT/k8s/services/resource-manager"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-cortex-config.yaml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl not found. Please install kubectl."
    exit 1
fi

# Export kubeconfig
export KUBECONFIG

# Verify kubectl connectivity
log_info "Verifying K3s cluster connectivity..."
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to K3s cluster. Check kubeconfig at: $KUBECONFIG"
    exit 1
fi
log_success "Connected to K3s cluster"

# Verify-only mode
if [[ "${1:-}" == "--verify-only" ]]; then
    log_info "Running in verify-only mode..."

    # Check if namespace exists
    if kubectl get namespace cortex-system &> /dev/null; then
        log_success "Namespace cortex-system exists"
    else
        log_warn "Namespace cortex-system does not exist"
    fi

    # Check if deployment exists
    if kubectl get deployment cortex-resource-manager -n cortex-system &> /dev/null; then
        log_success "Deployment cortex-resource-manager exists"
        kubectl get deployment cortex-resource-manager -n cortex-system
    else
        log_warn "Deployment cortex-resource-manager does not exist"
    fi

    # Check if pods are running
    if kubectl get pods -n cortex-system -l app=cortex-resource-manager &> /dev/null; then
        log_info "Pods status:"
        kubectl get pods -n cortex-system -l app=cortex-resource-manager
    fi

    exit 0
fi

# Deploy manifests
log_info "Deploying cortex-resource-manager to cortex-system namespace..."

# Create namespace if it doesn't exist
kubectl apply -f "$K8S_DIR/namespace.yaml"
log_success "Namespace created/updated"

# Apply RBAC
kubectl apply -f "$K8S_DIR/serviceaccount.yaml"
log_success "ServiceAccount and RBAC created/updated"

# Apply ConfigMap
kubectl apply -f "$K8S_DIR/configmap.yaml"
log_success "ConfigMap created/updated"

# Apply Service
kubectl apply -f "$K8S_DIR/service.yaml"
log_success "Service created/updated"

# Apply ServiceMonitor (if Prometheus operator is available)
if kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
    kubectl apply -f "$K8S_DIR/servicemonitor.yaml"
    log_success "ServiceMonitor created/updated"
else
    log_warn "ServiceMonitor CRD not found. Skipping ServiceMonitor creation."
fi

# Apply Deployment
kubectl apply -f "$K8S_DIR/deployment.yaml"
log_success "Deployment created/updated"

# Wait for deployment rollout
log_info "Waiting for deployment to complete (timeout: 5 minutes)..."
if kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s; then
    log_success "Deployment rollout completed"
else
    log_error "Deployment rollout failed or timed out"

    log_info "Deployment status:"
    kubectl get deployment cortex-resource-manager -n cortex-system

    log_info "Pod status:"
    kubectl get pods -n cortex-system -l app=cortex-resource-manager

    log_info "Recent pod events:"
    kubectl get events -n cortex-system --sort-by='.lastTimestamp' | grep cortex-resource-manager | tail -10

    exit 1
fi

# Get pod status
log_info "Pod status:"
kubectl get pods -n cortex-system -l app=cortex-resource-manager -o wide

# Get service endpoints
log_info "Service endpoints:"
kubectl get endpoints cortex-resource-manager -n cortex-system

# Check pod logs for startup
POD_NAME=$(kubectl get pods -n cortex-system -l app=cortex-resource-manager -o jsonpath='{.items[0].metadata.name}')
if [[ -n "$POD_NAME" ]]; then
    log_info "Recent logs from pod $POD_NAME:"
    kubectl logs -n cortex-system "$POD_NAME" --tail=20 || log_warn "Could not fetch logs"
fi

# Test health endpoint
log_info "Testing health endpoint..."
if kubectl run test-health-check --image=curlimages/curl:latest --rm -i --restart=Never -- \
    curl -s -f http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health &> /dev/null; then
    log_success "Health check passed"
else
    log_warn "Health check failed or timed out (this is normal if the pod is still starting)"
fi

log_success "Deployment complete!"
log_info "Service is available at: cortex-resource-manager.cortex-system.svc.cluster.local:8080"
log_info ""
log_info "To view logs: kubectl logs -n cortex-system -l app=cortex-resource-manager -f"
log_info "To verify status: $0 --verify-only"
