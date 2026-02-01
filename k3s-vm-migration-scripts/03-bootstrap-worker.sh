#!/bin/bash
#
# k3s Worker Bootstrap Script
# Run this on each NEW worker VM (10.88.145.181, 10.88.145.182)
#

set -euo pipefail

# Configuration
K3S_VERSION="v1.33.6+k3s1"
K3S_URL="https://10.88.145.180:6443"

echo "========================================="
echo "k3s Worker Bootstrap Script"
echo "Version: $K3S_VERSION"
echo "Master URL: $K3S_URL"
echo "========================================="

# Check for node token
if [ -z "${K3S_TOKEN:-}" ]; then
    echo ""
    echo "ERROR: K3S_TOKEN environment variable not set"
    echo ""
    echo "Please set it by running:"
    echo "  export K3S_TOKEN='<token-from-master>'"
    echo ""
    echo "To get the token, run on master:"
    echo "  cat /var/lib/rancher/k3s/server/node-token"
    exit 1
fi

# Get current IP
WORKER_IP=$(hostname -I | awk '{print $1}')
echo "Worker IP: $WORKER_IP"

# Install prerequisites
echo ""
echo "[1/4] Installing prerequisites..."
apt-get update
apt-get install -y curl nfs-common open-iscsi

# Install k3s agent
echo ""
echo "[2/4] Installing k3s agent..."
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_VERSION sh -s - agent \
  --token "$K3S_TOKEN" \
  --server "$K3S_URL" \
  --node-ip="$WORKER_IP" \
  --node-external-ip="$WORKER_IP"

# Wait for agent to be ready
echo ""
echo "[3/4] Waiting for k3s-agent to be ready..."
sleep 20
systemctl status k3s-agent --no-pager

# Verify (requires kubectl on worker, optional)
echo ""
echo "[4/4] Verifying installation..."
if command -v kubectl &> /dev/null; then
    kubectl get nodes
else
    echo "kubectl not available on worker, verify from master"
fi

echo ""
echo "========================================="
echo "k3s Worker Bootstrap Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Verify node joined: kubectl get nodes (on master)"
echo "2. Repeat for other workers"
echo "3. Proceed with Phase 3: Install MetalLB"
