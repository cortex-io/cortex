#!/bin/bash
#
# Deploy Cortex to K3s Cluster (LXC Containers 310-312)
# This script must be run ON the Proxmox host (10.88.140.164)
#
# Usage: bash deploy-cortex-to-k3s.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
K3S_MASTER_CT=310
K3S_WORKER1_CT=311
K3S_WORKER2_CT=312
GITHUB_REPO="https://github.com/ry-ops/cortex-docker.git"
DEPLOY_PATH="/tmp/cortex-docker"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Cortex Deployment to K3s Cluster (Containers 310-312)    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Verify containers are running
echo -e "${GREEN}Step 1: Verifying K3s containers${NC}"
for ctid in $K3S_MASTER_CT $K3S_WORKER1_CT $K3S_WORKER2_CT; do
    status=$(pct status $ctid | awk '{print $2}')
    if [ "$status" = "running" ]; then
        echo -e "${GREEN}  ✓ Container ${ctid}: RUNNING${NC}"
    else
        echo -e "${RED}  ✗ Container ${ctid}: ${status}${NC}"
        echo -e "${RED}  Start it with: pct start ${ctid}${NC}"
        exit 1
    fi
done
echo ""

# Step 2: Verify K3s cluster is healthy
echo -e "${GREEN}Step 2: Verifying K3s cluster health${NC}"
echo -e "${YELLOW}→ Checking nodes...${NC}"
pct exec $K3S_MASTER_CT -- kubectl get nodes

if [ $? -ne 0 ]; then
    echo -e "${RED}  ✗ K3s cluster not responding${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ K3s cluster healthy${NC}"
echo ""

# Step 3: Clone/update Cortex repository inside K3s master
echo -e "${GREEN}Step 3: Cloning Cortex repository${NC}"
echo -e "${YELLOW}→ Cloning to ${DEPLOY_PATH}...${NC}"

pct exec $K3S_MASTER_CT -- bash -c "
    if [ -d '${DEPLOY_PATH}' ]; then
        echo '  Repository exists, pulling latest...'
        cd ${DEPLOY_PATH} && git pull
    else
        echo '  Cloning repository...'
        git clone ${GITHUB_REPO} ${DEPLOY_PATH}
    fi
"

echo -e "${GREEN}  ✓ Repository ready${NC}"
echo ""

# Step 4: Check for required secrets
echo -e "${GREEN}Step 4: Checking secrets${NC}"

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}  ✗ ANTHROPIC_API_KEY environment variable not set${NC}"
    echo -e "${YELLOW}  Please set it: export ANTHROPIC_API_KEY='your-key'${NC}"
    echo -e "${YELLOW}  Then run this script again${NC}"
    exit 1
fi

echo -e "${GREEN}  ✓ ANTHROPIC_API_KEY found${NC}"
echo ""

# Step 5: Create Kubernetes secrets
echo -e "${GREEN}Step 5: Creating Kubernetes secrets${NC}"

echo -e "${YELLOW}→ Creating cortex-system namespace...${NC}"
pct exec $K3S_MASTER_CT -- kubectl create namespace cortex-system --dry-run=client -o yaml | pct exec $K3S_MASTER_CT -- kubectl apply -f -

echo -e "${YELLOW}→ Creating anthropic-api-key secret...${NC}"
pct exec $K3S_MASTER_CT -- kubectl create secret generic anthropic-api-key \
    --from-literal=api-key="${ANTHROPIC_API_KEY}" \
    -n cortex-system \
    --dry-run=client -o yaml | pct exec $K3S_MASTER_CT -- kubectl apply -f -

echo -e "${GREEN}  ✓ Secrets created${NC}"
echo ""

# Step 6: Deploy Cortex core
echo -e "${GREEN}Step 6: Deploying Cortex core${NC}"
echo -e "${YELLOW}→ Applying K8s manifests...${NC}"

pct exec $K3S_MASTER_CT -- bash -c "cd ${DEPLOY_PATH} && kubectl apply -k k8s/cortex-k3s/"

echo -e "${GREEN}  ✓ Cortex core deployed${NC}"
echo ""

# Step 7: Wait for pods to be ready
echo -e "${GREEN}Step 7: Waiting for Cortex pods${NC}"
echo -e "${YELLOW}→ Waiting up to 5 minutes for pods to be ready...${NC}"

pct exec $K3S_MASTER_CT -- kubectl wait --for=condition=ready pod \
    -l app.cortex.ai/component=master \
    -n cortex-system \
    --timeout=300s || echo -e "${YELLOW}  Some pods may still be starting...${NC}"

echo ""

# Step 8: Deploy monitoring stack
echo -e "${GREEN}Step 8: Deploying monitoring stack${NC}"
echo -e "${YELLOW}→ Creating monitoring namespace...${NC}"
pct exec $K3S_MASTER_CT -- kubectl create namespace monitoring --dry-run=client -o yaml | pct exec $K3S_MASTER_CT -- kubectl apply -f -

echo -e "${YELLOW}→ Deploying Prometheus, Grafana, AlertManager...${NC}"
pct exec $K3S_MASTER_CT -- bash -c "cd ${DEPLOY_PATH} && kubectl apply -f k8s/monitoring/"

echo -e "${GREEN}  ✓ Monitoring deployed${NC}"
echo ""

# Step 9: Deploy MCP servers (optional - requires Helm)
echo -e "${GREEN}Step 9: Deploying MCP servers (optional)${NC}"
echo -e "${YELLOW}→ Checking if Helm is available...${NC}"

if pct exec $K3S_MASTER_CT -- which helm > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Helm found${NC}"

    echo -e "${YELLOW}→ Creating cortex-mcp namespace...${NC}"
    pct exec $K3S_MASTER_CT -- kubectl create namespace cortex-mcp --dry-run=client -o yaml | pct exec $K3S_MASTER_CT -- kubectl apply -f -

    echo -e "${YELLOW}→ Installing MCP servers via Helm...${NC}"
    pct exec $K3S_MASTER_CT -- bash -c "cd ${DEPLOY_PATH} && helm upgrade --install cortex-mcp ./helm/umbrella-chart -n cortex-mcp --create-namespace"

    echo -e "${GREEN}  ✓ MCP servers deployed${NC}"
else
    echo -e "${YELLOW}  ⚠ Helm not found - skipping MCP server deployment${NC}"
    echo -e "${YELLOW}  Install Helm to deploy MCP servers: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash${NC}"
fi
echo ""

# Step 10: Verify deployment
echo -e "${GREEN}Step 10: Verifying deployment${NC}"

echo -e "${YELLOW}→ Cortex System Pods:${NC}"
pct exec $K3S_MASTER_CT -- kubectl get pods -n cortex-system

echo ""
echo -e "${YELLOW}→ Monitoring Pods:${NC}"
pct exec $K3S_MASTER_CT -- kubectl get pods -n monitoring

echo ""
echo -e "${YELLOW}→ MCP Server Pods:${NC}"
pct exec $K3S_MASTER_CT -- kubectl get pods -n cortex-mcp 2>/dev/null || echo -e "${YELLOW}  (cortex-mcp namespace not found - MCP servers not deployed)${NC}"

echo ""
echo -e "${YELLOW}→ KEDA ScaledObjects:${NC}"
pct exec $K3S_MASTER_CT -- kubectl get scaledobjects -n cortex-system 2>/dev/null || echo -e "${YELLOW}  (KEDA not installed)${NC}"

echo ""

# Step 11: Display access information
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Deployment Complete!                                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Access Dashboard:${NC}"
echo -e "  ${YELLOW}kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001${NC}"
echo -e "  Then open: ${BLUE}http://localhost:3001${NC}"
echo ""
echo -e "${GREEN}Access Grafana:${NC}"
echo -e "  ${YELLOW}kubectl port-forward -n monitoring svc/grafana 3000:3000${NC}"
echo -e "  Then open: ${BLUE}http://localhost:3000${NC}"
echo -e "  Login: ${BLUE}admin / admin${NC} (change on first login)"
echo ""
echo -e "${GREEN}Check Status:${NC}"
echo -e "  ${YELLOW}kubectl get pods -n cortex-system${NC}"
echo -e "  ${YELLOW}kubectl get pods -n monitoring${NC}"
echo -e "  ${YELLOW}kubectl logs -n cortex-system deployment/coordinator-master${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo -e "  1. Monitor pods: ${YELLOW}watch kubectl get pods -n cortex-system${NC}"
echo -e "  2. View logs: ${YELLOW}kubectl logs -f -n cortex-system deployment/coordinator-master${NC}"
echo -e "  3. Test workflow: Create a task and verify master coordination"
echo -e "  4. Check scaling: ${YELLOW}kubectl get scaledobjects -n cortex-system${NC}"
echo ""
