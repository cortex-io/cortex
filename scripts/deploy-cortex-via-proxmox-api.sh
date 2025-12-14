#!/bin/bash
#
# Deploy Cortex to K3s Cluster via Proxmox Guest Agent API
# Uses cortex-k3s-display token with PVEAdmin role
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
K3S_MASTER_VMID=310
GITHUB_REPO="https://github.com/ry-ops/cortex-docker.git"
DEPLOY_PATH="/tmp/cortex-docker"

# Check for ANTHROPIC_API_KEY
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}ERROR: ANTHROPIC_API_KEY environment variable not set${NC}"
    echo -e "${YELLOW}Please set it: export ANTHROPIC_API_KEY='your-key'${NC}"
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Cortex Deployment to K3s via Proxmox Guest Agent API     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper function to execute command via guest agent
exec_on_vm() {
    local vmid=$1
    local cmd=$2
    local description=$3

    echo -e "${YELLOW}→ $description${NC}"

    # Submit command via guest agent
    local response=$(curl -k -s -X POST \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/pve01/qemu/${vmid}/agent/exec" \
        -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"command\":[\"bash\",\"-c\",\"$cmd\"]}")

    # Get PID
    local pid=$(echo "$response" | jq -r '.data.pid // empty')

    if [ -z "$pid" ]; then
        echo -e "${RED}  ✗ Failed to execute command${NC}"
        echo "$response" | jq .
        return 1
    fi

    # Wait for command to complete and get result
    sleep 2

    local status_response=$(curl -k -s -X GET \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/pve01/qemu/${vmid}/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}")

    local exitcode=$(echo "$status_response" | jq -r '.data.exitcode // -1')
    local stdout_b64=$(echo "$status_response" | jq -r '.data["out-data"] // empty')
    local stderr_b64=$(echo "$status_response" | jq -r '.data["err-data"] // empty')

    # Decode output
    if [ -n "$stdout_b64" ]; then
        local stdout=$(echo "$stdout_b64" | base64 -d 2>/dev/null || echo "")
        if [ -n "$stdout" ]; then
            echo "$stdout"
        fi
    fi

    if [ -n "$stderr_b64" ]; then
        local stderr=$(echo "$stderr_b64" | base64 -d 2>/dev/null || echo "")
        if [ -n "$stderr" ]; then
            echo -e "${RED}$stderr${NC}" >&2
        fi
    fi

    if [ "$exitcode" -eq 0 ]; then
        echo -e "${GREEN}  ✓ Success${NC}"
        return 0
    else
        echo -e "${RED}  ✗ Failed (exit code: $exitcode)${NC}"
        return 1
    fi
}

# Step 1: Verify K3s cluster
echo -e "${GREEN}Step 1: Verifying K3s cluster${NC}"
exec_on_vm $K3S_MASTER_VMID "kubectl get nodes" "Checking K3s nodes"
echo ""

# Step 2: Clone/update Cortex repository
echo -e "${GREEN}Step 2: Cloning Cortex repository${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "if [ -d '$DEPLOY_PATH' ]; then cd $DEPLOY_PATH && git pull; else git clone $GITHUB_REPO $DEPLOY_PATH; fi" \
    "Cloning cortex-docker to $DEPLOY_PATH"
echo ""

# Step 3: Create Kubernetes namespace and secrets
echo -e "${GREEN}Step 3: Creating Kubernetes namespace and secrets${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl create namespace cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating cortex-system namespace"

exec_on_vm $K3S_MASTER_VMID \
    "kubectl create secret generic anthropic-api-key --from-literal=api-key='$ANTHROPIC_API_KEY' -n cortex-system --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating anthropic-api-key secret"
echo ""

# Step 4: Deploy Cortex core
echo -e "${GREEN}Step 4: Deploying Cortex core${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "cd $DEPLOY_PATH && kubectl apply -k k8s/cortex-k3s/" \
    "Applying Cortex K8s manifests"
echo ""

# Step 5: Wait for pods to be ready
echo -e "${GREEN}Step 5: Waiting for Cortex pods${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl wait --for=condition=ready pod -l app.cortex.ai/component=master -n cortex-system --timeout=300s || echo 'Some pods may still be starting...'" \
    "Waiting for master pods (up to 5 minutes)"
echo ""

# Step 6: Deploy monitoring stack
echo -e "${GREEN}Step 6: Deploying monitoring stack${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -" \
    "Creating monitoring namespace"

exec_on_vm $K3S_MASTER_VMID \
    "cd $DEPLOY_PATH && kubectl apply -f k8s/monitoring/" \
    "Deploying Prometheus, Grafana, AlertManager"
echo ""

# Step 7: Verify deployment
echo -e "${GREEN}Step 7: Verifying deployment${NC}"

echo -e "${YELLOW}→ Cortex System Pods:${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl get pods -n cortex-system" \
    "Listing cortex-system pods"

echo ""
echo -e "${YELLOW}→ Monitoring Pods:${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl get pods -n monitoring" \
    "Listing monitoring pods"

echo ""
echo -e "${YELLOW}→ KEDA ScaledObjects:${NC}"
exec_on_vm $K3S_MASTER_VMID \
    "kubectl get scaledobjects -n cortex-system 2>/dev/null || echo 'KEDA not installed'" \
    "Listing ScaledObjects"

echo ""

# Step 8: Display access information
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Deployment Complete!                                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo -e "  1. Access Dashboard: ${YELLOW}kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001${NC}"
echo -e "  2. Access Grafana: ${YELLOW}kubectl port-forward -n monitoring svc/grafana 3000:3000${NC}"
echo -e "  3. View logs: ${YELLOW}kubectl logs -n cortex-system deployment/coordinator-master${NC}"
echo -e "  4. Monitor pods: ${YELLOW}watch kubectl get pods -n cortex-system${NC}"
echo ""
echo -e "${GREEN}Cortex Phases 4-8 Deployment: ${BLUE}COMPLETE${NC} 🚀"
echo ""
