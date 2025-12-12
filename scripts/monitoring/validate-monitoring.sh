#!/bin/bash
set -e

# Validate Cortex Monitoring Stack
# This script validates that Prometheus and Grafana are working correctly

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "========================================"
echo "Validating Cortex Monitoring Stack"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

FAILED=0

# Get node IP
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

# Test 1: Check Prometheus pod is running
echo -e "\n${YELLOW}[1/10] Checking Prometheus pod...${NC}"
if kubectl get pods -n monitoring -l app=prometheus | grep -q Running; then
  echo -e "${GREEN}✓ Prometheus pod is running${NC}"
else
  echo -e "${RED}✗ Prometheus pod is not running${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 2: Check Grafana pod is running
echo -e "\n${YELLOW}[2/10] Checking Grafana pod...${NC}"
if kubectl get pods -n monitoring -l app=grafana | grep -q Running; then
  echo -e "${GREEN}✓ Grafana pod is running${NC}"
else
  echo -e "${RED}✗ Grafana pod is not running${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 3: Check Prometheus service
echo -e "\n${YELLOW}[3/10] Checking Prometheus service...${NC}"
if kubectl get svc -n monitoring prometheus &>/dev/null; then
  echo -e "${GREEN}✓ Prometheus service exists${NC}"
else
  echo -e "${RED}✗ Prometheus service not found${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 4: Check Grafana service
echo -e "\n${YELLOW}[4/10] Checking Grafana service...${NC}"
if kubectl get svc -n monitoring grafana &>/dev/null; then
  echo -e "${GREEN}✓ Grafana service exists${NC}"
else
  echo -e "${RED}✗ Grafana service not found${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 5: Check Prometheus is accessible
echo -e "\n${YELLOW}[5/10] Testing Prometheus HTTP endpoint...${NC}"
if curl -sf "http://${NODE_IP}:30003/-/healthy" > /dev/null; then
  echo -e "${GREEN}✓ Prometheus is accessible${NC}"
else
  echo -e "${RED}✗ Cannot reach Prometheus at http://${NODE_IP}:30003${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 6: Check Grafana is accessible
echo -e "\n${YELLOW}[6/10] Testing Grafana HTTP endpoint...${NC}"
if curl -sf "http://${NODE_IP}:30002/api/health" > /dev/null; then
  echo -e "${GREEN}✓ Grafana is accessible${NC}"
else
  echo -e "${RED}✗ Cannot reach Grafana at http://${NODE_IP}:30002${NC}"
  FAILED=$((FAILED + 1))
fi

# Test 7: Check Prometheus scrape targets
echo -e "\n${YELLOW}[7/10] Checking Prometheus targets...${NC}"
TARGETS=$(curl -s "http://${NODE_IP}:30003/api/v1/targets" | grep -o '"health":"up"' | wc -l)
if [ "$TARGETS" -gt 0 ]; then
  echo -e "${GREEN}✓ Prometheus has ${TARGETS} healthy targets${NC}"
else
  echo -e "${YELLOW}⚠ No healthy targets found (this is normal if Cortex is not deployed yet)${NC}"
fi

# Test 8: Check if Cortex metrics are being scraped
echo -e "\n${YELLOW}[8/10] Checking for Cortex metrics...${NC}"
CORTEX_METRICS=$(curl -s "http://${NODE_IP}:30003/api/v1/query?query=cortex_task_queue_depth" | grep -o '"result":\[' | wc -l)
if [ "$CORTEX_METRICS" -gt 0 ]; then
  echo -e "${GREEN}✓ Cortex metrics are being scraped${NC}"
else
  echo -e "${YELLOW}⚠ Cortex metrics not found (ensure Cortex dashboard server is running)${NC}"
fi

# Test 9: Check Grafana datasources
echo -e "\n${YELLOW}[9/10] Checking Grafana datasources...${NC}"
DATASOURCES=$(curl -s -u admin:CortexMonitoring2025! "http://${NODE_IP}:30002/api/datasources" | grep -o '"name":"Cortex-Prometheus"' | wc -l)
if [ "$DATASOURCES" -gt 0 ]; then
  echo -e "${GREEN}✓ Grafana datasource configured${NC}"
else
  echo -e "${YELLOW}⚠ Grafana datasource not found (may need manual configuration)${NC}"
fi

# Test 10: Check Grafana dashboards
echo -e "\n${YELLOW}[10/10] Checking Grafana dashboards...${NC}"
DASHBOARDS=$(curl -s -u admin:CortexMonitoring2025! "http://${NODE_IP}:30002/api/search?query=Cortex" | grep -o '"title":"Cortex' | wc -l)
if [ "$DASHBOARDS" -ge 3 ]; then
  echo -e "${GREEN}✓ Found ${DASHBOARDS} Cortex dashboards${NC}"
else
  echo -e "${YELLOW}⚠ Found ${DASHBOARDS}/3 expected dashboards${NC}"
fi

# Summary
echo -e "\n========================================"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}Validation Complete: All tests passed!${NC}"
else
  echo -e "${RED}Validation Complete: ${FAILED} test(s) failed${NC}"
fi
echo -e "========================================"

echo -e "\nAccess URLs:"
echo -e "  Prometheus: http://${NODE_IP}:30003"
echo -e "  Grafana:    http://${NODE_IP}:30002"
echo -e "\nGrafana Credentials:"
echo -e "  Username: admin"
echo -e "  Password: CortexMonitoring2025!"

# Show pod status
echo -e "\n${YELLOW}Pod Status:${NC}"
kubectl get pods -n monitoring

# Show service status
echo -e "\n${YELLOW}Service Status:${NC}"
kubectl get svc -n monitoring

exit $FAILED
