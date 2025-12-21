#!/bin/bash
# K3s Cluster Status Checker

K3S_USER="k3s"
MASTER01="10.88.145.190"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                K3s Cluster Status Check                            ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Check existing nodes
echo "Existing Cluster Nodes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${K3S_USER}@${MASTER01}" "kubectl get nodes" 2>/dev/null; then
    echo ""
    NODE_COUNT=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${K3S_USER}@${MASTER01}" "kubectl get nodes --no-headers | wc -l" 2>/dev/null | tr -d ' ')
    echo "Current node count: $NODE_COUNT"

    if [ "$NODE_COUNT" == "7" ]; then
        echo "✓ SUCCESS: All 7 nodes are in the cluster!"
    elif [ "$NODE_COUNT" == "3" ]; then
        echo "⚠ Only 3 nodes - expansion needed"
    else
        echo "⚠ Unexpected node count"
    fi
else
    echo "✗ Cannot connect to k3s-master01"
    exit 1
fi

echo ""
echo "New VM IP Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check new VMs
declare -a NEW_VMS=(
    "k3s-master02:10.88.145.193"
    "k3s-master03:10.88.145.196"
    "k3s-worker03:10.88.145.194"
    "k3s-worker04:10.88.145.195"
)

NEW_VMS_OK=0
NEW_VMS_TOTAL=4

for vm in "${NEW_VMS[@]}"; do
    IFS=':' read -r name ip <<< "$vm"
    printf "%-15s (%s) ... " "$name" "$ip"

    if ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no "${K3S_USER}@${ip}" "hostname" 2>/dev/null | grep -q "$name"; then
        echo "✓ OK"
        ((NEW_VMS_OK++))
    else
        echo "✗ NOT ACCESSIBLE"
    fi
done

echo ""
echo "Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$NODE_COUNT" == "7" ]; then
    echo "✓ Cluster expansion COMPLETE!"
    echo "  - 7 nodes active in cluster"
    echo "  - 3 server nodes (HA etcd quorum)"
    echo "  - 4 worker nodes"
    echo ""
    echo "Next steps: Deploy workloads!"
elif [ "$NEW_VMS_OK" == "4" ] && [ "$NODE_COUNT" == "3" ]; then
    echo "⚠ IPs are fixed but nodes not yet joined to cluster"
    echo ""
    echo "Run: ./complete-cluster-setup.sh"
elif [ "$NEW_VMS_OK" -lt "$NEW_VMS_TOTAL" ]; then
    echo "⚠ $((NEW_VMS_TOTAL - NEW_VMS_OK)) of $NEW_VMS_TOTAL new VMs need IP fixes"
    echo ""
    echo "Next step: Fix IPs via Proxmox console"
    echo "See: QUICK-REFERENCE.txt"
    echo "Or:  README-START-HERE.md"
else
    echo "⚠ Unknown state - manual investigation needed"
fi

echo ""
