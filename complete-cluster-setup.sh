#!/bin/bash
# Complete K3s cluster setup script
# This handles verification and automatic joining after IP fixes

set -e

K3S_USER="k3s"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "================================================================"
echo "K3s HA Cluster Complete Setup"
echo "================================================================"
echo ""
echo "This script will:"
echo "  1. Verify IP fixes are complete"
echo "  2. Join new nodes to the cluster"
echo "  3. Verify final cluster state"
echo ""

# Step 1: Check if IPs are fixed
echo "Step 1: Verifying IP fixes..."
echo "================================================================"

if ! "$SCRIPT_DIR/verify-ips.sh"; then
    echo ""
    echo "IPs not fixed yet. Please complete manual console fixes first:"
    echo ""
    echo "Open Proxmox UI: https://10.88.140.164:8006"
    echo ""
    echo "For each VM, open console and run:"
    echo ""
    echo "VM 303 (k3s-master02) -> 10.88.145.193:"
    echo "  sudo sed -i 's/10.88.145.190/10.88.145.193/g' /etc/netplan/00-installer-config.yaml"
    echo "  sudo hostnamectl set-hostname k3s-master02"
    echo "  sudo netplan apply && sudo reboot"
    echo ""
    echo "VM 304 (k3s-worker03) -> 10.88.145.194:"
    echo "  sudo sed -i 's/10.88.145.191/10.88.145.194/g' /etc/netplan/00-installer-config.yaml"
    echo "  sudo hostnamectl set-hostname k3s-worker03"
    echo "  sudo netplan apply && sudo reboot"
    echo ""
    echo "VM 305 (k3s-worker04) -> 10.88.145.195:"
    echo "  sudo sed -i 's/10.88.145.191/10.88.145.195/g' /etc/netplan/00-installer-config.yaml"
    echo "  sudo hostnamectl set-hostname k3s-worker04"
    echo "  sudo netplan apply && sudo reboot"
    echo ""
    echo "VM 306 (k3s-master03) -> 10.88.145.196:"
    echo "  sudo sed -i 's/10.88.145.190/10.88.145.196/g' /etc/netplan/00-installer-config.yaml"
    echo "  sudo hostnamectl set-hostname k3s-master03"
    echo "  sudo netplan apply && sudo reboot"
    echo ""
    echo "After fixing, run this script again."
    exit 1
fi

echo ""
echo "IP fixes verified! Proceeding to join nodes..."
echo ""

# Step 2: Join nodes to cluster
echo "Step 2: Joining nodes to cluster..."
echo "================================================================"

if ! "$SCRIPT_DIR/join-nodes-to-cluster.py"; then
    echo ""
    echo "Some nodes may have failed to join. Check the output above."
    exit 1
fi

echo ""
echo "================================================================"
echo "Setup Complete!"
echo "================================================================"
echo ""
echo "Your K3s HA cluster now has 7 nodes:"
echo "  - 3 server nodes (k3s-master01, k3s-master02, k3s-master03)"
echo "  - 4 worker nodes (k3s-worker01, k3s-worker02, k3s-worker03, k3s-worker04)"
echo ""
echo "To verify:"
echo "  ssh k3s@10.88.145.190 \"kubectl get nodes -o wide\""
echo ""
