#!/bin/bash
#
# k3s Master Bootstrap Script
# Run this on the NEW master VM (10.88.145.180)
#

set -euo pipefail

# Configuration
K3S_VERSION="v1.33.6+k3s1"
MASTER_IP="10.88.145.180"

echo "========================================="
echo "k3s Master Bootstrap Script"
echo "Version: $K3S_VERSION"
echo "Master IP: $MASTER_IP"
echo "========================================="

# Verify we're running on the correct host
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [ "$CURRENT_IP" != "$MASTER_IP" ]; then
    echo "ERROR: This script should run on $MASTER_IP but current IP is $CURRENT_IP"
    echo "Hostname: $(hostname)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install prerequisites
echo ""
echo "[1/6] Installing prerequisites..."
apt-get update
apt-get install -y curl nfs-common open-iscsi

# Install k3s master
echo ""
echo "[2/6] Installing k3s master..."
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_VERSION sh -s - server \
  --write-kubeconfig-mode 644 \
  --disable traefik \
  --disable servicelb \
  --cluster-cidr=10.42.0.0/16 \
  --service-cidr=10.43.0.0/16 \
  --node-ip=$MASTER_IP \
  --node-external-ip=$MASTER_IP \
  --tls-san=$MASTER_IP

# Wait for k3s to be ready
echo ""
echo "[3/6] Waiting for k3s to be ready..."
sleep 30
systemctl status k3s --no-pager

# Configure kubectl
echo ""
echo "[4/6] Configuring kubectl access..."
mkdir -p ~/.kube
cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
chmod 600 ~/.kube/config
sed -i "s|https://127.0.0.1:6443|https://$MASTER_IP:6443|g" ~/.kube/config

# Save node token
echo ""
echo "[5/6] Saving node token..."
cat /var/lib/rancher/k3s/server/node-token > /root/k3s-node-token
chmod 600 /root/k3s-node-token

# Verify cluster
echo ""
echo "[6/6] Verifying cluster..."
kubectl get nodes -o wide

echo ""
echo "========================================="
echo "k3s Master Bootstrap Complete!"
echo "========================================="
echo ""
echo "Node Token (for workers):"
cat /root/k3s-node-token
echo ""
echo "Next steps:"
echo "1. Save the node token above"
echo "2. Run 03-bootstrap-worker.sh on worker nodes"
echo "3. Proceed with Phase 3: Install MetalLB"
