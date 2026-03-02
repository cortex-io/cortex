#!/bin/bash
#
# MetalLB Installation and Configuration Script
# Run this on the k3s master VM
#

set -euo pipefail

# Configuration
METALLB_VERSION="0.14.9"
IP_POOL_NAME="k3s-pool"
IP_RANGE="10.88.145.200-10.88.145.210"

echo "========================================="
echo "MetalLB Installation Script"
echo "Version: $METALLB_VERSION"
echo "IP Range: $IP_RANGE"
echo "========================================="

# Verify kubectl access
if ! kubectl get nodes &>/dev/null; then
    echo "ERROR: Cannot connect to Kubernetes cluster"
    echo "Make sure kubectl is configured correctly"
    exit 1
fi

# Install Helm if not present
if ! command -v helm &> /dev/null; then
    echo ""
    echo "[1/6] Installing Helm..."
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
else
    echo ""
    echo "[1/6] Helm already installed"
fi

# Add MetalLB Helm repository
echo ""
echo "[2/6] Adding MetalLB Helm repository..."
helm repo add metallb https://metallb.github.io/metallb
helm repo update

# Create namespace
echo ""
echo "[3/6] Creating metallb-system namespace..."
kubectl create namespace metallb-system --dry-run=client -o yaml | kubectl apply -f -

# Install MetalLB
echo ""
echo "[4/6] Installing MetalLB..."
helm upgrade --install metallb metallb/metallb \
  --namespace metallb-system \
  --version $METALLB_VERSION \
  --wait

# Wait for MetalLB to be ready
echo ""
echo "[5/6] Waiting for MetalLB pods to be ready..."
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=metallb \
  --timeout=300s

# Configure IPAddressPool
echo ""
echo "[6/6] Configuring MetalLB IP pool..."
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: $IP_POOL_NAME
  namespace: metallb-system
spec:
  addresses:
  - $IP_RANGE
  autoAssign: true
  avoidBuggyIPs: false
EOF

# Configure L2Advertisement
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: k3s-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - $IP_POOL_NAME
EOF

# Verify installation
echo ""
echo "========================================="
echo "MetalLB Installation Complete!"
echo "========================================="
echo ""
echo "Verification:"
kubectl get pods -n metallb-system
echo ""
kubectl get ipaddresspool -n metallb-system
echo ""
kubectl get l2advertisement -n metallb-system

echo ""
echo "Next steps:"
echo "1. Test MetalLB with a LoadBalancer service"
echo "2. Proceed with Phase 4: Configure NFS Storage"
