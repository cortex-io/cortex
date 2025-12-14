#!/bin/bash
#
# Deploy Cortex to K3s Cluster via Proxmox API
# This script uses the Proxmox API to execute commands on K3s VMs
#

set -e

# Configuration
PROXMOX_HOST="${PROXMOX_HOST:-10.88.140.164}"
PROXMOX_PORT="${PROXMOX_PORT:-8006}"
PROXMOX_NODE="${PROXMOX_NODE:-pve01}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33}"

K3S_MASTER_VMID=310
K3S_WORKER1_VMID=311
K3S_WORKER2_VMID=312

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to execute command on VM via Proxmox
exec_on_vm() {
    local vmid=$1
    local command=$2

    echo -e "${YELLOW}→ Executing on VM ${vmid}: ${command}${NC}"

    # Using Proxmox guest agent exec API
    local result=$(curl -k -s -X POST \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec" \
        -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"command\":\"${command}\"}")

    echo "$result" | jq -r '.data'
}

# Helper function to upload file to VM
upload_to_vm() {
    local vmid=$1
    local local_file=$2
    local remote_path=$3

    echo -e "${YELLOW}→ Uploading ${local_file} to VM ${vmid}:${remote_path}${NC}"

    # Note: This would require file upload via Proxmox API or SCP
    # For now, we'll use git clone on the VM instead
    echo -e "${YELLOW}  (Will use git clone instead)${NC}"
}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Cortex Deployment to K3s via Proxmox API                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Verify VM Status
echo -e "${GREEN}Step 1: Verifying K3s VMs${NC}"
for vmid in $K3S_MASTER_VMID $K3S_WORKER1_VMID $K3S_WORKER2_VMID; do
    status=$(curl -k -s -X GET \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current" \
        -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" | jq -r '.data.status')

    if [ "$status" = "running" ]; then
        echo -e "${GREEN}  ✓ VM ${vmid}: RUNNING${NC}"
    else
        echo -e "${RED}  ✗ VM ${vmid}: ${status}${NC}"
        exit 1
    fi
done
echo ""

# Step 2: Clone Cortex Repository on K3s Master
echo -e "${GREEN}Step 2: Cloning Cortex repository on K3s master${NC}"
exec_on_vm $K3S_MASTER_VMID "cd /tmp && git clone https://github.com/ry-ops/cortex-docker.git cortex || (cd cortex && git pull)"
echo ""

# Step 3: Create Kubernetes Secrets
echo -e "${GREEN}Step 3: Creating Kubernetes secrets${NC}"
echo -e "${YELLOW}  Note: You'll need to set ANTHROPIC_API_KEY environment variable${NC}"

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}  ✗ ANTHROPIC_API_KEY not set${NC}"
    echo -e "${YELLOW}  Please set it: export ANTHROPIC_API_KEY='your-key'${NC}"
    exit 1
fi

# Create anthropic API key secret
exec_on_vm $K3S_MASTER_VMID "kubectl create secret generic anthropic-api-key --from-literal=api-key='${ANTHROPIC_API_KEY}' -n cortex-system --dry-run=client -o yaml | kubectl apply -f -"
echo ""

# Step 4: Deploy Cortex Core
echo -e "${GREEN}Step 4: Deploying Cortex core to K3s${NC}"
exec_on_vm $K3S_MASTER_VMID "cd /tmp/cortex && kubectl apply -k k8s/cortex-k3s/"
echo ""

# Step 5: Wait for pods
echo -e "${GREEN}Step 5: Waiting for Cortex pods to be ready${NC}"
exec_on_vm $K3S_MASTER_VMID "kubectl wait --for=condition=ready pod -l app.cortex.ai/component=master -n cortex-system --timeout=300s || true"
echo ""

# Step 6: Deploy Monitoring
echo -e "${GREEN}Step 6: Deploying monitoring stack${NC}"
exec_on_vm $K3S_MASTER_VMID "cd /tmp/cortex && kubectl apply -f k8s/monitoring/"
echo ""

# Step 7: Verify Deployment
echo -e "${GREEN}Step 7: Verifying deployment${NC}"
exec_on_vm $K3S_MASTER_VMID "kubectl get pods -n cortex-system"
exec_on_vm $K3S_MASTER_VMID "kubectl get pods -n monitoring"
echo ""

# Step 8: Get Dashboard URL
echo -e "${GREEN}Step 8: Dashboard Access${NC}"
echo -e "${YELLOW}  Port forward to access dashboard:${NC}"
echo -e "  ${GREEN}kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001${NC}"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete!                                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
