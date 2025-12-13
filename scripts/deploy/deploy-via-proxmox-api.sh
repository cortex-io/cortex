#!/bin/bash
set -euo pipefail

# Deploy cortex-resource-manager via Proxmox API to K3s VM
# This script uses Proxmox API to execute kubectl commands on the K3s control plane

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$CORTEX_ROOT/k8s/services/resource-manager"

# Proxmox configuration
PROXMOX_HOST="${PROXMOX_HOST:-10.88.140.164}"
PROXMOX_PORT="${PROXMOX_PORT:-8006}"
PROXMOX_USER="${PROXMOX_USER:-root@pam}"
PROXMOX_TOKEN_NAME="${PROXMOX_TOKEN_NAME:-cortex-deploy}"
PROXMOX_TOKEN_VALUE="${PROXMOX_TOKEN_VALUE:-15d84996-1afe-4c00-9e5c-c6c5aa12da33}"

# K3s VM configuration
K3S_NODE="${K3S_NODE:-101}"  # CT ID or VM ID for K3s control plane
K3S_IP="${K3S_IP:-10.88.145.180}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to execute command on K3s node via Proxmox API
proxmox_exec() {
    local node="$1"
    local vmid="$2"
    local command="$3"

    local api_url="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${node}/lxc/${vmid}/exec"

    curl -s -k -X POST "$api_url" \
        -H "Authorization: PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}" \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"$command\"}"
}

# Main deployment
log_info "Deploying cortex-resource-manager via Proxmox API..."
log_info "Target: K3s VM $K3S_NODE at $K3S_IP"

# Create combined manifest
log_info "Creating combined manifest..."
cat > /tmp/resource-manager-manifest.yaml <<EOF
# Combined manifest for cortex-resource-manager
---
$(cat "$K8S_DIR/namespace.yaml")
---
$(cat "$K8S_DIR/serviceaccount.yaml")
---
$(cat "$K8S_DIR/configmap.yaml")
---
$(cat "$K8S_DIR/service.yaml")
---
$(cat "$K8S_DIR/deployment.yaml")
EOF

log_success "Combined manifest created"

# Copy manifest to K3s node using SSH (more reliable than Proxmox API for file transfer)
log_info "Copying manifest to K3s node..."
if command -v ssh &> /dev/null; then
    # Try SSH first
    if scp -o StrictHostKeyChecking=no /tmp/resource-manager-manifest.yaml "root@${K3S_IP}:/tmp/" &> /dev/null; then
        log_success "Manifest copied via SSH"

        # Apply manifest
        log_info "Applying manifest..."
        ssh -o StrictHostKeyChecking=no "root@${K3S_IP}" "kubectl apply -f /tmp/resource-manager-manifest.yaml" || {
            log_error "Failed to apply manifest"
            exit 1
        }

        # Wait for rollout
        log_info "Waiting for deployment rollout..."
        ssh -o StrictHostKeyChecking=no "root@${K3S_IP}" "kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s" || {
            log_error "Deployment rollout failed"
            exit 1
        }

        # Get status
        log_info "Deployment status:"
        ssh -o StrictHostKeyChecking=no "root@${K3S_IP}" "kubectl get pods -n cortex-system -l app=cortex-resource-manager -o wide"

        log_success "Deployment complete!"
        exit 0
    fi
fi

# Fallback: Use kubectl with local kubeconfig
log_info "SSH not available, using local kubectl..."
export KUBECONFIG="$HOME/.kube/k3s-cortex-config.yaml"

if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to K3s cluster. Please check network connectivity to $K3S_IP:6443"
    log_info "Ensure the K3s API server is accessible from this machine."
    exit 1
fi

log_info "Applying manifest..."
kubectl apply -f /tmp/resource-manager-manifest.yaml

log_info "Waiting for deployment rollout..."
kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s

log_info "Deployment status:"
kubectl get pods -n cortex-system -l app=cortex-resource-manager -o wide

log_success "Deployment complete!"
