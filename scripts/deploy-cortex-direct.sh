#!/bin/bash
#
# Deploy Cortex directly from GitHub without git clone
# Uses kubectl apply -f with GitHub raw URLs
#

set -e

PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
K3S_MASTER_VMID=310
GITHUB_RAW="https://raw.githubusercontent.com/ry-ops/cortex-docker/docker-container"

# Check for ANTHROPIC_API_KEY
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Cortex Direct Deployment (No Git Required)                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Helper to execute on VM
exec_vm() {
    local cmd=$1
    local desc=$2

    echo "→ $desc"

    response=$(curl -k -s -X POST \
        "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/exec" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"command\":[\"bash\",\"-c\",\"$cmd\"]}")

    pid=$(echo "$response" | jq -r '.data.pid // empty')

    if [ -z "$pid" ]; then
        echo "  ✗ Failed to start command"
        return 1
    fi

    # Wait and get result
    sleep 3

    result=$(curl -k -s -X GET \
        "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    exitcode=$(echo "$result" | jq -r '.data.exitcode // -1')

    if [ "$exitcode" -eq 0 ]; then
        echo "  ✓ Success"
        return 0
    else
        echo "  ✗ Failed (exit: $exitcode)"
        # Show error if available
        stderr_b64=$(echo "$result" | jq -r '.data["err-data"] // empty')
        if [ -n "$stderr_b64" ]; then
            echo "$stderr_b64" | base64 -d 2>/dev/null
        fi
        return 1
    fi
}

# Step 1: Create namespace
echo "Step 1: Creating cortex-system namespace"
exec_vm "kubectl create namespace cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating namespace"
echo ""

# Step 2: Create secrets
echo "Step 2: Creating secrets"
exec_vm "kubectl create secret generic anthropic-api-key --from-literal=api-key='$ANTHROPIC_API_KEY' -n cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating ANTHROPIC_API_KEY secret"
echo ""

# Step 3: Deploy core manifests
echo "Step 3: Deploying Cortex core components"

# Deploy each key manifest file
for file in \
    "k8s/cortex-k3s/namespace.yaml" \
    "k8s/cortex-k3s/rbac.yaml" \
    "k8s/cortex-k3s/configmap.yaml" \
    "k8s/cortex-k3s/pvc.yaml" \
    "k8s/cortex-k3s/coordinator-master.yaml" \
    "k8s/cortex-k3s/development-master.yaml" \
    "k8s/cortex-k3s/security-master.yaml" \
    "k8s/cortex-k3s/cicd-master.yaml" \
    "k8s/cortex-k3s/dashboard.yaml" \
    "k8s/cortex-k3s/workers-scaledobjects.yaml"
do
    exec_vm "kubectl apply -f $GITHUB_RAW/$file" \
        "Deploying $file"
done

echo ""

# Step 4: Verify
echo "Step 4: Verifying deployment"
exec_vm "kubectl get pods -n cortex-system" \
    "Listing pods"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete!                                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
