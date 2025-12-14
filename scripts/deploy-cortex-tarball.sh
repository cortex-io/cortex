#!/bin/bash
#
# Deploy Cortex via tarball download (no git required)
#

set -e

PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
K3S_MASTER_VMID=310

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Cortex Deployment via Tarball (No Git)                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

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
    [ -z "$pid" ] && echo "  ✗ Failed" && return 1

    sleep 3

    result=$(curl -k -s -X GET \
        "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    exitcode=$(echo "$result" | jq -r '.data.exitcode // -1')

    if [ "$exitcode" -eq 0 ]; then
        echo "  ✓ Success"
        # Show output if available
        stdout_b64=$(echo "$result" | jq -r '.data["out-data"] // empty')
        if [ -n "$stdout_b64" ]; then
            echo "$stdout_b64" | base64 -d 2>/dev/null | head -20
        fi
        return 0
    else
        echo "  ✗ Failed (exit: $exitcode)"
        stderr_b64=$(echo "$result" | jq -r '.data["err-data"] // empty')
        [ -n "$stderr_b64" ] && echo "$stderr_b64" | base64 -d 2>/dev/null
        return 1
    fi
}

echo "Step 1: Downloading Cortex repository tarball"
exec_vm "cd /tmp && curl -sL https://github.com/ry-ops/cortex-docker/archive/refs/heads/docker-container.tar.gz -o cortex.tar.gz" \
    "Downloading tarball"

exec_vm "cd /tmp && tar -xzf cortex.tar.gz" \
    "Extracting tarball"

exec_vm "cd /tmp && mv cortex-docker-docker-container cortex-docker 2>/dev/null || true" \
    "Renaming directory"
echo ""

echo "Step 2: Creating namespace and secrets"
exec_vm "kubectl create namespace cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating cortex-system namespace"

exec_vm "kubectl create secret generic anthropic-api-key --from-literal=api-key='$ANTHROPIC_API_KEY' -n cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating ANTHROPIC_API_KEY secret"
echo ""

echo "Step 3: Deploying Cortex via Kustomize"
exec_vm "cd /tmp/cortex-docker && kubectl apply -k k8s/cortex-k3s/" \
    "Applying K8s manifests"
echo ""

echo "Step 4: Waiting for pods"
exec_vm "kubectl wait --for=condition=ready pod -l app.cortex.ai/component=master -n cortex-system --timeout=180s || echo 'Pods still starting...'" \
    "Waiting for master pods"
echo ""

echo "Step 5: Deploying monitoring"
exec_vm "kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating monitoring namespace"

exec_vm "cd /tmp/cortex-docker && kubectl apply -f k8s/monitoring/" \
    "Deploying Prometheus, Grafana"
echo ""

echo "Step 6: Verification"
exec_vm "kubectl get pods -n cortex-system" \
    "Cortex pods"

echo ""
exec_vm "kubectl get scaledobjects -n cortex-system 2>/dev/null || echo 'KEDA not installed'" \
    "ScaledObjects"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete!                                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Access Dashboard: kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001"
echo "View Logs: kubectl logs -n cortex-system deployment/coordinator-master"
echo ""
