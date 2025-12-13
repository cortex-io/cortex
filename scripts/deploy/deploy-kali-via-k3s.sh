#!/bin/bash
################################################################################
# Deploy Kali Linux via K3s Cluster
# Executes deployment as Kubernetes Job
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Deploying Kali Linux via K3s Cluster ==="

# Check if kubectl is configured
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl not found"
    exit 1
fi

# Set kubeconfig
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-cortex-config.yaml}"

echo "Testing K3s connectivity..."
if ! kubectl cluster-info &> /dev/null; then
    echo "Error: Cannot connect to K3s cluster"
    echo "Trying via Proxmox API..."

    # Execute kubectl via Proxmox QEMU agent in K3s master (VM 310)
    echo "Executing via Proxmox API to K3s master..."

    PID=$(curl -k -s -X POST "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/exec" \
        -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33" \
        --data-urlencode "command=/bin/bash" \
        --data-urlencode "command=-c" \
        --data-urlencode "command=kubectl apply -f - <<'EOFMANIFEST'
$(cat $CORTEX_ROOT/k8s/jobs/kali-deployment-job.yaml)
EOFMANIFEST" 2>/dev/null | jq -r '.data.pid')

    echo "Command PID: $PID"
    sleep 3

    # Get output
    OUTPUT=$(curl -k -s "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/exec-status?pid=$PID" \
        -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33" 2>/dev/null | \
        jq -r '.data["out-data"] // empty')

    if [ -n "$OUTPUT" ]; then
        echo "$OUTPUT" | base64 -d 2>/dev/null || echo "Decoding failed"
    fi

    exit 0
fi

echo "Connected to K3s cluster"

# Apply the Job
echo "Applying Kali deployment job..."
kubectl apply -f "$CORTEX_ROOT/k8s/jobs/kali-deployment-job.yaml"

# Watch job progress
echo ""
echo "Watching job progress (Ctrl+C to stop watching)..."
kubectl wait --for=condition=complete --timeout=600s job/kali-deployment -n cortex-system || true

# Get job status
echo ""
echo "=== Job Status ==="
kubectl get job kali-deployment -n cortex-system

# Get pod logs
echo ""
echo "=== Job Logs ==="
POD=$(kubectl get pods -n cortex-system -l app=kali-deployment -o jsonpath='{.items[0].metadata.name}')
if [ -n "$POD" ]; then
    kubectl logs "$POD" -n cortex-system
else
    echo "No pod found for job"
fi

echo ""
echo "=== Deployment Complete ==="
