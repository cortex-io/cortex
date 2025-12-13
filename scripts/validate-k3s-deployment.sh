#!/bin/bash
# Validate Cortex K3s Deployment
# Checks: Pods, Services, NFS, Wazuh, GitOps

set -e

KUBECONFIG_PATH="${KUBECONFIG_PATH:-$HOME/.kube/cortex-k3s-config}"
export KUBECONFIG="$KUBECONFIG_PATH"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

echo "=========================================="
echo "  CORTEX K3S DEPLOYMENT VALIDATION"
echo "=========================================="
echo ""

# Check 1: Cluster connectivity
echo "1. Cluster Connectivity"
if kubectl cluster-info &>/dev/null; then
    pass "K3s cluster accessible"
else
    fail "Cannot connect to K3s cluster"
    exit 1
fi

# Check 2: Namespace
echo ""
echo "2. Namespace"
if kubectl get namespace cortex-system &>/dev/null; then
    pass "cortex-system namespace exists"
else
    fail "cortex-system namespace not found"
fi

# Check 3: Masters running
echo ""
echo "3. Cortex Masters"
masters=("coordinator-master" "security-master" "development-master" "cicd-master")
for master in "${masters[@]}"; do
    if kubectl get deployment "$master" -n cortex-system &>/dev/null; then
        ready=$(kubectl get deployment "$master" -n cortex-system -o jsonpath='{.status.readyReplicas}')
        if [ "$ready" = "1" ]; then
            pass "$master: Running"
        else
            warn "$master: Not ready ($ready/1)"
        fi
    else
        fail "$master: Not found"
    fi
done

# Check 4: NFS PVC
echo ""
echo "4. Storage (NFS)"
if kubectl get pvc cortex-coordination-pvc -n cortex-system &>/dev/null; then
    status=$(kubectl get pvc cortex-coordination-pvc -n cortex-system -o jsonpath='{.status.phase}')
    if [ "$status" = "Bound" ]; then
        pass "NFS PVC: Bound"
    else
        warn "NFS PVC: $status"
    fi
else
    fail "NFS PVC not found"
fi

# Check 5: Wazuh agents
echo ""
echo "5. Wazuh Integration"
agent_count=$(kubectl get pods -n cortex-system -l app=wazuh-agent --no-headers 2>/dev/null | wc -l)
if [ "$agent_count" -gt 0 ]; then
    pass "Wazuh agents deployed ($agent_count agents)"
else
    warn "No Wazuh agents found"
fi

# Check 6: Dashboard
echo ""
echo "6. Dashboard"
if kubectl get svc cortex-dashboard -n cortex-system &>/dev/null; then
    lb_ip=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -n "$lb_ip" ]; then
        pass "Dashboard: http://$lb_ip"
    else
        warn "Dashboard service exists, waiting for LoadBalancer IP..."
    fi
else
    fail "Dashboard service not found"
fi

# Check 7: Flux (if installed)
echo ""
echo "7. GitOps (Flux)"
if kubectl get namespace flux-system &>/dev/null; then
    flux_pods=$(kubectl get pods -n flux-system --no-headers 2>/dev/null | grep Running | wc -l)
    if [ "$flux_pods" -gt 0 ]; then
        pass "Flux CD running ($flux_pods pods)"
    else
        warn "Flux namespace exists but no running pods"
    fi
else
    warn "Flux not installed (GitOps disabled)"
fi

# Summary
echo ""
echo "=========================================="
echo "  VALIDATION COMPLETE"
echo "=========================================="
echo ""

# Get all pods status
echo "Pod Status:"
kubectl get pods -n cortex-system -o wide

echo ""
echo "Services:"
kubectl get svc -n cortex-system

echo ""
echo "Full deployment details:"
echo "  kubectl get all -n cortex-system"
echo "  kubectl logs -n cortex-system deployment/coordinator-master"
