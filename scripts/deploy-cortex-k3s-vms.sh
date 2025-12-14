#!/bin/bash
#
# Deploy Cortex to K3s Cluster (VMs 310-312)
# Run this script ON the Proxmox host
#
# Usage:  export ANTHROPIC_API_KEY='your-key' && bash scripts/deploy-cortex-k3s-vms.sh
#

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

K3S_MASTER_IP="10.88.145.180"
GITHUB_REPO="https://github.com/ry-ops/cortex-docker.git"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Cortex Deployment to K3s Cluster (VMs 310-312)           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY environment variable not set"
    exit 1
fi

echo -e "${GREEN}Step 1: Cloning repository on K3s master${NC}"
ssh root@${K3S_MASTER_IP} "cd /tmp && git clone ${GITHUB_REPO} || (cd cortex-docker && git pull)"

echo -e "${GREEN}Step 2: Creating secrets${NC}"
ssh root@${K3S_MASTER_IP} "kubectl create namespace cortex-system --dry-run=client -o yaml | kubectl apply -f -"
ssh root@${K3S_MASTER_IP} "kubectl create secret generic anthropic-api-key --from-literal=api-key='${ANTHROPIC_API_KEY}' -n cortex-system --dry-run=client -o yaml | kubectl apply -f -"

echo -e "${GREEN}Step 3: Deploying Cortex${NC}"
ssh root@${K3S_MASTER_IP} "cd /tmp/cortex-docker && kubectl apply -k k8s/cortex-k3s/"

echo -e "${GREEN}Step 4: Deploying monitoring${NC}"
ssh root@${K3S_MASTER_IP} "kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -"
ssh root@${K3S_MASTER_IP} "cd /tmp/cortex-docker && kubectl apply -f k8s/monitoring/"

echo -e "${GREEN}Step 5: Verifying deployment${NC}"
ssh root@${K3S_MASTER_IP} "kubectl get pods -n cortex-system"
ssh root@${K3S_MASTER_IP} "kubectl get pods -n monitoring"

echo ""
echo -e "${BLUE}✓ Deployment complete!${NC}"
