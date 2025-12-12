#!/bin/bash
set -e

# Deploy Cortex Monitoring Stack
# This script deploys Prometheus and Grafana with Cortex dashboards

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
K8S_DIR="${SCRIPT_DIR}/../../k8s/monitoring"

echo "========================================"
echo "Deploying Cortex Monitoring Stack"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Create monitoring namespace
echo -e "\n${YELLOW}[1/10] Creating monitoring namespace...${NC}"
kubectl apply -f "${K8S_DIR}/prometheus-namespace.yaml"
echo -e "${GREEN}✓ Namespace created${NC}"

# Step 2: Deploy Prometheus RBAC
echo -e "\n${YELLOW}[2/10] Deploying Prometheus RBAC...${NC}"
kubectl apply -f "${K8S_DIR}/prometheus-rbac.yaml"
echo -e "${GREEN}✓ RBAC configured${NC}"

# Step 3: Deploy Prometheus ConfigMap
echo -e "\n${YELLOW}[3/10] Deploying Prometheus configuration...${NC}"
kubectl apply -f "${K8S_DIR}/prometheus-config.yaml"
echo -e "${GREEN}✓ Configuration deployed${NC}"

# Step 4: Create Prometheus PVC
echo -e "\n${YELLOW}[4/10] Creating Prometheus storage...${NC}"
kubectl apply -f "${K8S_DIR}/prometheus-pvc.yaml"
echo -e "${GREEN}✓ Storage created${NC}"

# Step 5: Deploy Prometheus
echo -e "\n${YELLOW}[5/10] Deploying Prometheus...${NC}"
kubectl apply -f "${K8S_DIR}/prometheus-deployment.yaml"
kubectl apply -f "${K8S_DIR}/prometheus-service.yaml"
echo -e "${GREEN}✓ Prometheus deployed${NC}"

# Wait for Prometheus to be ready
echo -e "\n${YELLOW}Waiting for Prometheus to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=300s
echo -e "${GREEN}✓ Prometheus is ready${NC}"

# Step 6: Deploy Grafana Secret
echo -e "\n${YELLOW}[6/10] Creating Grafana secrets...${NC}"
kubectl apply -f "${K8S_DIR}/grafana-secret.yaml"
echo -e "${GREEN}✓ Secrets created${NC}"

# Step 7: Create Grafana PVC
echo -e "\n${YELLOW}[7/10] Creating Grafana storage...${NC}"
kubectl apply -f "${K8S_DIR}/grafana-pvc.yaml"
echo -e "${GREEN}✓ Storage created${NC}"

# Step 8: Deploy Grafana ConfigMaps
echo -e "\n${YELLOW}[8/10] Deploying Grafana configuration...${NC}"
kubectl apply -f "${K8S_DIR}/grafana-datasource.yaml"
kubectl apply -f "${K8S_DIR}/grafana-dashboard-provider.yaml"

# Generate dashboard ConfigMap
echo -e "${YELLOW}Generating dashboard ConfigMap...${NC}"
"${SCRIPT_DIR}/create-dashboard-configmap.sh"
kubectl apply -f "${K8S_DIR}/grafana-dashboards-configmap.yaml"
echo -e "${GREEN}✓ Configuration deployed${NC}"

# Step 9: Deploy Grafana
echo -e "\n${YELLOW}[9/10] Deploying Grafana...${NC}"
kubectl apply -f "${K8S_DIR}/grafana-deployment.yaml"
kubectl apply -f "${K8S_DIR}/grafana-service.yaml"
echo -e "${GREEN}✓ Grafana deployed${NC}"

# Wait for Grafana to be ready
echo -e "\n${YELLOW}Waiting for Grafana to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=grafana -n monitoring --timeout=300s
echo -e "${GREEN}✓ Grafana is ready${NC}"

# Step 10: Deploy ServiceMonitors (optional)
echo -e "\n${YELLOW}[10/10] Deploying ServiceMonitors...${NC}"
if kubectl apply -f "${K8S_DIR}/servicemonitor-cortex.yaml" 2>/dev/null; then
  echo -e "${GREEN}✓ ServiceMonitors deployed${NC}"
else
  echo -e "${YELLOW}⚠ ServiceMonitors not supported (Prometheus Operator not installed)${NC}"
fi

# Get access information
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

echo -e "\n========================================"
echo -e "${GREEN}Monitoring Stack Deployed Successfully!${NC}"
echo -e "========================================"
echo ""
echo -e "Access Information:"
echo -e "  Prometheus: http://${NODE_IP}:30003"
echo -e "  Grafana:    http://${NODE_IP}:30002"
echo ""
echo -e "Grafana Credentials:"
echo -e "  Username: admin"
echo -e "  Password: CortexMonitoring2025!"
echo ""
echo -e "Next Steps:"
echo -e "  1. Verify Prometheus is scraping Cortex: http://${NODE_IP}:30003/targets"
echo -e "  2. Login to Grafana and explore dashboards"
echo -e "  3. Run validation: ${SCRIPT_DIR}/validate-monitoring.sh"
echo ""
echo -e "Dashboard URLs (after login):"
echo -e "  - Cortex Autoscaling: http://${NODE_IP}:30002/d/cortex-autoscaling"
echo -e "  - Cortex Masters:     http://${NODE_IP}:30002/d/cortex-masters"
echo -e "  - Cortex Workers:     http://${NODE_IP}:30002/d/cortex-workers"
echo ""
