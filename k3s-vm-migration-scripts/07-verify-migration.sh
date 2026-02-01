#!/bin/bash
#
# Migration Verification Script
# Run this on the k3s master VM to verify the cluster is ready
#

set -euo pipefail

echo "========================================="
echo "k3s Migration Verification Script"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check status
check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}[PASS]${NC} $2"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $2"
        return 1
    fi
}

check_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

PASS_COUNT=0
FAIL_COUNT=0

# Check 1: Cluster nodes
echo ""
echo "========================================="
echo "1. Checking Cluster Nodes"
echo "========================================="
NODES=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
if [ $NODES -eq 3 ]; then
    check_status 0 "All 3 nodes are present"
    ((PASS_COUNT++))
    kubectl get nodes -o wide
else
    check_status 1 "Expected 3 nodes, found $NODES"
    ((FAIL_COUNT++))
fi

# Check 2: Node readiness
echo ""
echo "========================================="
echo "2. Checking Node Readiness"
echo "========================================="
NOT_READY=$(kubectl get nodes --no-headers 2>/dev/null | grep -v " Ready " | wc -l)
if [ $NOT_READY -eq 0 ]; then
    check_status 0 "All nodes are Ready"
    ((PASS_COUNT++))
else
    check_status 1 "$NOT_READY nodes are not Ready"
    ((FAIL_COUNT++))
fi

# Check 3: Core pods
echo ""
echo "========================================="
echo "3. Checking Core System Pods"
echo "========================================="
CORE_PODS=$(kubectl get pods -n kube-system --no-headers 2>/dev/null | grep -v "Running" | wc -l)
if [ $CORE_PODS -eq 0 ]; then
    check_status 0 "All kube-system pods are Running"
    ((PASS_COUNT++))
else
    check_status 1 "$CORE_PODS pods in kube-system are not Running"
    ((FAIL_COUNT++))
    kubectl get pods -n kube-system | grep -v "Running"
fi

# Check 4: MetalLB
echo ""
echo "========================================="
echo "4. Checking MetalLB"
echo "========================================="
if kubectl get namespace metallb-system &>/dev/null; then
    METALLB_PODS=$(kubectl get pods -n metallb-system --no-headers 2>/dev/null | grep -v "Running" | wc -l)
    if [ $METALLB_PODS -eq 0 ]; then
        check_status 0 "MetalLB pods are Running"
        ((PASS_COUNT++))
    else
        check_status 1 "$METALLB_PODS MetalLB pods are not Running"
        ((FAIL_COUNT++))
    fi

    # Check IP pool
    if kubectl get ipaddresspool -n metallb-system k3s-pool &>/dev/null; then
        check_status 0 "MetalLB IP pool configured"
        ((PASS_COUNT++))
    else
        check_status 1 "MetalLB IP pool not found"
        ((FAIL_COUNT++))
    fi
else
    check_status 1 "MetalLB namespace not found"
    ((FAIL_COUNT++))
    ((FAIL_COUNT++))
fi

# Check 5: NFS Provisioner
echo ""
echo "========================================="
echo "5. Checking NFS Provisioner"
echo "========================================="
if kubectl get namespace nfs-provisioner &>/dev/null; then
    NFS_PODS=$(kubectl get pods -n nfs-provisioner --no-headers 2>/dev/null | grep -v "Running" | wc -l)
    if [ $NFS_PODS -eq 0 ]; then
        check_status 0 "NFS provisioner pods are Running"
        ((PASS_COUNT++))
    else
        check_status 1 "$NFS_PODS NFS provisioner pods are not Running"
        ((FAIL_COUNT++))
    fi

    # Check storage class
    if kubectl get storageclass nfs-client &>/dev/null; then
        check_status 0 "NFS storage class exists"
        ((PASS_COUNT++))
    else
        check_status 1 "NFS storage class not found"
        ((FAIL_COUNT++))
    fi
else
    check_status 1 "NFS provisioner namespace not found"
    ((FAIL_COUNT++))
    ((FAIL_COUNT++))
fi

# Check 6: Flux
echo ""
echo "========================================="
echo "6. Checking Flux"
echo "========================================="
if kubectl get namespace flux-system &>/dev/null; then
    FLUX_PODS=$(kubectl get pods -n flux-system --no-headers 2>/dev/null | grep -v "Running" | wc -l)
    if [ $FLUX_PODS -eq 0 ]; then
        check_status 0 "Flux pods are Running"
        ((PASS_COUNT++))
    else
        check_status 1 "$FLUX_PODS Flux pods are not Running"
        ((FAIL_COUNT++))
    fi

    # Check if flux CLI is available
    if command -v flux &> /dev/null; then
        check_status 0 "Flux CLI is installed"
        ((PASS_COUNT++))
    else
        check_warning "Flux CLI not found in PATH"
    fi
else
    check_status 1 "Flux namespace not found"
    ((FAIL_COUNT++))
    ((FAIL_COUNT++))
fi

# Check 7: Traefik
echo ""
echo "========================================="
echo "7. Checking Traefik"
echo "========================================="
if kubectl get namespace traefik &>/dev/null; then
    TRAEFIK_PODS=$(kubectl get pods -n traefik --no-headers 2>/dev/null | grep -v "Running" | wc -l)
    if [ $TRAEFIK_PODS -eq 0 ]; then
        check_status 0 "Traefik pods are Running"
        ((PASS_COUNT++))
    else
        check_status 1 "$TRAEFIK_PODS Traefik pods are not Running"
        ((FAIL_COUNT++))
    fi

    # Check LoadBalancer service
    TRAEFIK_LB=$(kubectl get svc -n traefik traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
    if [ ! -z "$TRAEFIK_LB" ]; then
        check_status 0 "Traefik LoadBalancer IP assigned: $TRAEFIK_LB"
        ((PASS_COUNT++))
    else
        check_status 1 "Traefik LoadBalancer IP not assigned"
        ((FAIL_COUNT++))
    fi
else
    check_warning "Traefik namespace not found (may not be deployed yet)"
fi

# Check 8: Monitoring
echo ""
echo "========================================="
echo "8. Checking Monitoring Stack"
echo "========================================="
if kubectl get namespace monitoring &>/dev/null; then
    MONITORING_PODS=$(kubectl get pods -n monitoring --no-headers 2>/dev/null | grep -v "Running\|Completed" | wc -l)
    if [ $MONITORING_PODS -eq 0 ]; then
        check_status 0 "Monitoring pods are Running"
        ((PASS_COUNT++))
    else
        check_status 1 "$MONITORING_PODS monitoring pods are not Running"
        ((FAIL_COUNT++))
    fi
else
    check_warning "Monitoring namespace not found (may not be deployed yet)"
fi

# Check 9: LoadBalancer Services
echo ""
echo "========================================="
echo "9. Checking LoadBalancer Services"
echo "========================================="
echo ""
kubectl get svc -A | grep LoadBalancer
echo ""
LB_PENDING=$(kubectl get svc -A --no-headers 2>/dev/null | grep LoadBalancer | grep "<pending>" | wc -l)
if [ $LB_PENDING -eq 0 ]; then
    check_status 0 "All LoadBalancer services have IPs assigned"
    ((PASS_COUNT++))
else
    check_status 1 "$LB_PENDING LoadBalancer services are pending"
    ((FAIL_COUNT++))
fi

# Check 10: Storage Classes
echo ""
echo "========================================="
echo "10. Checking Storage Classes"
echo "========================================="
kubectl get storageclass
echo ""
SC_COUNT=$(kubectl get storageclass --no-headers 2>/dev/null | wc -l)
if [ $SC_COUNT -gt 0 ]; then
    check_status 0 "$SC_COUNT storage classes found"
    ((PASS_COUNT++))
else
    check_status 1 "No storage classes found"
    ((FAIL_COUNT++))
fi

# Summary
echo ""
echo "========================================="
echo "SUMMARY"
echo "========================================="
echo -e "${GREEN}Passed:${NC} $PASS_COUNT"
echo -e "${RED}Failed:${NC} $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All checks passed! Cluster is ready for migration.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review service endpoints and IPs"
    echo "2. Test application functionality"
    echo "3. Verify data migration if needed"
    echo "4. Prepare for DNS cutover"
    exit 0
else
    echo -e "${RED}Some checks failed. Please review and fix issues before proceeding.${NC}"
    echo ""
    echo "Troubleshooting commands:"
    echo "  kubectl get pods -A | grep -v Running"
    echo "  kubectl describe pod <pod-name> -n <namespace>"
    echo "  kubectl logs <pod-name> -n <namespace>"
    echo "  flux get all -A"
    echo "  flux logs -A --follow"
    exit 1
fi
