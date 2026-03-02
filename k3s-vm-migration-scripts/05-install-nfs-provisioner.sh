#!/bin/bash
#
# NFS Subdir External Provisioner Installation Script
# Run this on the k3s master VM
#

set -euo pipefail

# Configuration
NFS_SERVER="10.88.145.173"
NFS_PATH="/export/k3s-vm"
STORAGE_CLASS_NAME="nfs-client"

echo "========================================="
echo "NFS Provisioner Installation Script"
echo "NFS Server: $NFS_SERVER"
echo "NFS Path: $NFS_PATH"
echo "Storage Class: $STORAGE_CLASS_NAME"
echo "========================================="

# Verify kubectl access
if ! kubectl get nodes &>/dev/null; then
    echo "ERROR: Cannot connect to Kubernetes cluster"
    exit 1
fi

# Verify NFS server is accessible
echo ""
echo "[1/5] Verifying NFS server accessibility..."
if ! showmount -e $NFS_SERVER &>/dev/null; then
    echo "WARNING: Cannot connect to NFS server at $NFS_SERVER"
    echo "Make sure the NFS server is accessible and NFS client is installed"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Add NFS provisioner Helm repository
echo ""
echo "[2/5] Adding NFS provisioner Helm repository..."
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update

# Create namespace
echo ""
echo "[3/5] Creating nfs-provisioner namespace..."
kubectl create namespace nfs-provisioner --dry-run=client -o yaml | kubectl apply -f -

# Install NFS provisioner
echo ""
echo "[4/5] Installing NFS provisioner..."
helm upgrade --install nfs-provisioner \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --set nfs.server=$NFS_SERVER \
  --set nfs.path=$NFS_PATH \
  --set storageClass.name=$STORAGE_CLASS_NAME \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Delete \
  --set storageClass.allowVolumeExpansion=true \
  --wait

# Wait for provisioner to be ready
echo ""
echo "[5/5] Waiting for provisioner to be ready..."
kubectl wait --namespace nfs-provisioner \
  --for=condition=ready pod \
  --selector=app=nfs-subdir-external-provisioner \
  --timeout=120s

# Verify installation
echo ""
echo "========================================="
echo "NFS Provisioner Installation Complete!"
echo "========================================="
echo ""
echo "Storage Classes:"
kubectl get storageclass
echo ""
echo "NFS Provisioner Pod:"
kubectl get pods -n nfs-provisioner

echo ""
echo "Next steps:"
echo "1. Test NFS provisioner with a PVC"
echo "2. Proceed with Phase 5: Bootstrap Flux"
