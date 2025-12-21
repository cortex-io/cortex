#!/bin/bash
# Quick verification script for K3s VM IP fixes

echo "================================================================"
echo "K3s VM IP Verification"
echo "================================================================"
echo ""

K3S_USER="k3s"

# VM name:IP pairs
VMS=(
    "k3s-master02:10.88.145.193"
    "k3s-master03:10.88.145.196"
    "k3s-worker03:10.88.145.194"
    "k3s-worker04:10.88.145.195"
)

ALL_OK=true

for vm in "${VMS[@]}"; do
    IFS=':' read -r name ip <<< "$vm"
    echo -n "Testing $name ($ip)... "

    # Try SSH connection with short timeout
    if ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no "${K3S_USER}@${ip}" "hostname" 2>/dev/null | grep -q "$name"; then
        echo "OK"
    else
        echo "FAILED"
        ALL_OK=false
    fi
done

echo ""
echo "================================================================"

if $ALL_OK; then
    echo "SUCCESS: All VMs accessible at new IPs!"
    echo "================================================================"
    echo ""
    echo "Ready to join cluster. Run:"
    echo "  ./join-nodes-to-cluster.py"
    echo ""
    exit 0
else
    echo "FAILED: Some VMs not accessible"
    echo "================================================================"
    echo ""
    echo "Please complete the IP fixes via Proxmox console."
    echo "See: PROXMOX-CONSOLE-STEPS.md"
    echo ""
    exit 1
fi
