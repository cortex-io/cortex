#!/bin/bash
# Cortex K3s Deployment Verification Script
# Validates all components are deployed correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Cortex K3s Deployment Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Helper functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# 1. Check cluster connectivity
echo -e "${BLUE}[1/10] Checking K3s cluster connectivity...${NC}"
if kubectl cluster-info &> /dev/null; then
    check_pass "Cluster is reachable"
    CLUSTER_VERSION=$(kubectl version --short 2>/dev/null | grep Server | awk '{print $3}')
    echo -e "       Kubernetes version: ${CLUSTER_VERSION}"
else
    check_fail "Cannot connect to K3s cluster"
    echo -e "${RED}Ensure KUBECONFIG is set and cluster is running${NC}"
    exit 1
fi
echo ""

# 2. Check nodes
echo -e "${BLUE}[2/10] Checking cluster nodes...${NC}"
NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
READY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready " || true)

if [[ $NODE_COUNT -ge 3 ]] && [[ $READY_NODES -eq $NODE_COUNT ]]; then
    check_pass "All $NODE_COUNT nodes are Ready"
    kubectl get nodes -o wide
elif [[ $READY_NODES -gt 0 ]]; then
    check_warn "$READY_NODES/$NODE_COUNT nodes are Ready (expected 3 for VMs 310-312)"
    kubectl get nodes
else
    check_fail "No nodes are in Ready state"
fi
echo ""

# 3. Check namespaces
echo -e "${BLUE}[3/10] Checking namespaces...${NC}"
NAMESPACES=("cortex-system" "cortex-mcp" "cortex-workers" "monitoring")
for ns in "${NAMESPACES[@]}"; do
    if kubectl get namespace "$ns" &> /dev/null; then
        check_pass "Namespace $ns exists"
    else
        check_fail "Namespace $ns is missing"
    fi
done
echo ""

# 4. Check secrets
echo -e "${BLUE}[4/10] Checking secrets...${NC}"
if kubectl get secret cortex-credentials -n cortex-system &> /dev/null; then
    check_pass "cortex-credentials secret exists"

    # Check if secret has required keys
    if kubectl get secret cortex-credentials -n cortex-system -o jsonpath='{.data.anthropic-api-key}' | base64 -d | grep -q "sk-"; then
        check_pass "anthropic-api-key is configured"
    else
        check_warn "anthropic-api-key may not be valid (doesn't start with 'sk-')"
    fi

    if kubectl get secret cortex-credentials -n cortex-system -o jsonpath='{.data.github-token}' | base64 -d | wc -c | grep -q "[1-9]"; then
        check_pass "github-token is configured"
    else
        check_warn "github-token appears to be empty"
    fi
else
    check_fail "cortex-credentials secret is missing"
    echo -e "${YELLOW}Create with: kubectl create secret generic cortex-credentials --namespace=cortex-system --from-literal=anthropic-api-key=YOUR_KEY --from-literal=github-token=YOUR_TOKEN${NC}"
fi
echo ""

# 5. Check storage
echo -e "${BLUE}[5/10] Checking storage (PVCs)...${NC}"
PVCS=("coordination-storage")
for pvc in "${PVCS[@]}"; do
    if kubectl get pvc "$pvc" -n cortex-system &> /dev/null; then
        STATUS=$(kubectl get pvc "$pvc" -n cortex-system -o jsonpath='{.status.phase}')
        if [[ "$STATUS" == "Bound" ]]; then
            check_pass "PVC $pvc is Bound"
        else
            check_warn "PVC $pvc is $STATUS (expected Bound)"
        fi
    else
        check_fail "PVC $pvc is missing"
    fi
done
echo ""

# 6. Check master deployments
echo -e "${BLUE}[6/10] Checking master deployments...${NC}"
MASTERS=("coordinator-master" "security-master" "development-master" "cicd-master" "inventory-master")
for master in "${MASTERS[@]}"; do
    if kubectl get deployment "$master" -n cortex-system &> /dev/null; then
        READY=$(kubectl get deployment "$master" -n cortex-system -o jsonpath='{.status.readyReplicas}')
        DESIRED=$(kubectl get deployment "$master" -n cortex-system -o jsonpath='{.spec.replicas}')

        if [[ "$READY" == "$DESIRED" ]] && [[ "$READY" -gt 0 ]]; then
            check_pass "Master $master is ready ($READY/$DESIRED replicas)"
        else
            check_warn "Master $master is not ready ($READY/$DESIRED replicas)"
        fi
    else
        check_fail "Master $master deployment is missing"
    fi
done
echo ""

# 7. Check dashboard
echo -e "${BLUE}[7/10] Checking dashboard...${NC}"
if kubectl get deployment cortex-dashboard -n cortex-system &> /dev/null; then
    READY=$(kubectl get deployment cortex-dashboard -n cortex-system -o jsonpath='{.status.readyReplicas}')
    DESIRED=$(kubectl get deployment cortex-dashboard -n cortex-system -o jsonpath='{.spec.replicas}')

    if [[ "$READY" == "$DESIRED" ]] && [[ "$READY" -gt 0 ]]; then
        check_pass "Dashboard is ready ($READY/$DESIRED replicas)"

        # Check service
        if kubectl get svc cortex-dashboard -n cortex-system &> /dev/null; then
            SVC_TYPE=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.spec.type}')
            check_pass "Dashboard service exists (type: $SVC_TYPE)"

            if [[ "$SVC_TYPE" == "LoadBalancer" ]]; then
                EXTERNAL_IP=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
                if [[ -n "$EXTERNAL_IP" ]]; then
                    echo -e "       ${GREEN}Dashboard URL: http://${EXTERNAL_IP}${NC}"
                else
                    check_warn "LoadBalancer IP pending (may take a few minutes)"
                fi
            fi
        else
            check_fail "Dashboard service is missing"
        fi
    else
        check_warn "Dashboard is not ready ($READY/$DESIRED replicas)"
    fi
else
    check_fail "Dashboard deployment is missing"
fi
echo ""

# 8. Check KEDA operator and workers
echo -e "${BLUE}[8/10] Checking KEDA and worker autoscaling...${NC}"
if kubectl get deployment keda-operator -n keda &> /dev/null; then
    check_pass "KEDA operator is deployed"

    # Check ScaledObjects
    SCALEDOBJECTS=$(kubectl get scaledobject -n cortex-workers --no-headers 2>/dev/null | wc -l | tr -d ' ')
    if [[ $SCALEDOBJECTS -ge 9 ]]; then
        check_pass "Worker ScaledObjects are configured ($SCALEDOBJECTS found, expected 9)"
    elif [[ $SCALEDOBJECTS -gt 0 ]]; then
        check_warn "Only $SCALEDOBJECTS worker ScaledObjects found (expected 9)"
    else
        check_fail "No worker ScaledObjects found"
    fi
else
    check_warn "KEDA operator not found (workers won't autoscale)"
    echo -e "${YELLOW}Install KEDA: kubectl apply -f https://github.com/kedacore/keda/releases/download/v2.12.0/keda-2.12.0.yaml${NC}"
fi
echo ""

# 9. Check monitoring stack
echo -e "${BLUE}[9/10] Checking monitoring stack...${NC}"
MONITORING_COMPONENTS=("prometheus" "grafana" "alertmanager")
for component in "${MONITORING_COMPONENTS[@]}"; do
    if kubectl get deployment "$component" -n monitoring &> /dev/null; then
        READY=$(kubectl get deployment "$component" -n monitoring -o jsonpath='{.status.readyReplicas}')
        DESIRED=$(kubectl get deployment "$component" -n monitoring -o jsonpath='{.spec.replicas}')

        if [[ "$READY" == "$DESIRED" ]] && [[ "$READY" -gt 0 ]]; then
            check_pass "$component is ready ($READY/$DESIRED replicas)"
        else
            check_warn "$component is not ready ($READY/$DESIRED replicas)"
        fi
    else
        check_warn "$component is not deployed"
    fi
done

# Check ServiceMonitors
SERVICE_MONITORS=$(kubectl get servicemonitor -n monitoring --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [[ $SERVICE_MONITORS -ge 3 ]]; then
    check_pass "ServiceMonitors are configured ($SERVICE_MONITORS found)"
else
    check_warn "Only $SERVICE_MONITORS ServiceMonitors found"
fi
echo ""

# 10. Check MCP servers
echo -e "${BLUE}[10/10] Checking MCP servers...${NC}"
MCP_DEPLOYMENTS=$(kubectl get deployment -n cortex-mcp --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [[ $MCP_DEPLOYMENTS -gt 0 ]]; then
    check_pass "MCP servers are deployed ($MCP_DEPLOYMENTS deployments)"

    # List MCP servers
    echo -e "${BLUE}       MCP Servers:${NC}"
    kubectl get deployment -n cortex-mcp -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas
else
    check_warn "No MCP servers deployed yet"
    echo -e "${YELLOW}Deploy with: helm install cortex-mcp ./helm/umbrella-chart -n cortex-mcp${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Passed:  $CHECKS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed:   $CHECKS_FAILED${NC}"
echo ""

# Overall status
if [[ $CHECKS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ Deployment verification PASSED${NC}"

    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}⚠ Review warnings above for potential issues${NC}"
    fi

    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Access dashboard: kubectl port-forward svc/cortex-dashboard -n cortex-system 8080:80"
    echo "2. Access Grafana: kubectl port-forward svc/grafana -n monitoring 3000:3000"
    echo "3. View logs: kubectl logs deployment/coordinator-master -n cortex-system -f"
    echo "4. Monitor workers: kubectl get pods -n cortex-workers -w"

    exit 0
else
    echo -e "${RED}✗ Deployment verification FAILED${NC}"
    echo -e "${RED}Fix the failed checks above before proceeding${NC}"
    exit 1
fi
