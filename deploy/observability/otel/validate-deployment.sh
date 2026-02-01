#!/bin/bash
# Validate OpenTelemetry deployment for Cortex
# This script checks that all components are properly deployed and configured

set -e

NAMESPACE="monitoring"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "OpenTelemetry Deployment Validation"
echo "=========================================="
echo ""

# Track results
ERRORS=0
WARNINGS=0
SUCCESS=0

# Function to print status
print_status() {
    local status=$1
    local message=$2

    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}✓${NC} $message"
        ((SUCCESS++))
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
        ((WARNINGS++))
    else
        echo -e "${RED}✗${NC} $message"
        ((ERRORS++))
    fi
}

# Check 1: Namespace exists
echo "1. Checking namespace..."
if kubectl get namespace $NAMESPACE &> /dev/null; then
    print_status "OK" "Namespace '$NAMESPACE' exists"
else
    print_status "ERROR" "Namespace '$NAMESPACE' not found"
fi

# Check 2: ConfigMap exists
echo ""
echo "2. Checking ConfigMap..."
if kubectl get configmap otel-collector-config -n $NAMESPACE &> /dev/null; then
    print_status "OK" "ConfigMap 'otel-collector-config' exists"
else
    print_status "ERROR" "ConfigMap 'otel-collector-config' not found"
fi

# Check 3: Deployment exists
echo ""
echo "3. Checking Deployment..."
if kubectl get deployment otel-collector -n $NAMESPACE &> /dev/null; then
    print_status "OK" "Deployment 'otel-collector' exists"

    # Check replicas
    DESIRED=$(kubectl get deployment otel-collector -n $NAMESPACE -o jsonpath='{.spec.replicas}')
    READY=$(kubectl get deployment otel-collector -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')

    if [ "$READY" = "$DESIRED" ]; then
        print_status "OK" "All replicas ready ($READY/$DESIRED)"
    else
        print_status "WARN" "Not all replicas ready ($READY/$DESIRED)"
    fi
else
    print_status "ERROR" "Deployment 'otel-collector' not found"
fi

# Check 4: Pods are running
echo ""
echo "4. Checking Pods..."
POD_COUNT=$(kubectl get pods -n $NAMESPACE -l app=otel-collector --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')

if [ "$POD_COUNT" -gt 0 ]; then
    print_status "OK" "$POD_COUNT pod(s) running"

    # Check pod restarts
    RESTARTS=$(kubectl get pods -n $NAMESPACE -l app=otel-collector -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' | awk '{for(i=1;i<=NF;i++) sum+=$i} END {print sum}')
    if [ "$RESTARTS" -gt 5 ]; then
        print_status "WARN" "High restart count: $RESTARTS (check logs)"
    else
        print_status "OK" "Low restart count: $RESTARTS"
    fi
else
    print_status "ERROR" "No running pods found"
fi

# Check 5: Service exists
echo ""
echo "5. Checking Service..."
if kubectl get service otel-collector -n $NAMESPACE &> /dev/null; then
    print_status "OK" "Service 'otel-collector' exists"

    # Check endpoints
    ENDPOINTS=$(kubectl get endpoints otel-collector -n $NAMESPACE -o jsonpath='{.subsets[*].addresses[*].ip}' | wc -w | tr -d ' ')
    if [ "$ENDPOINTS" -gt 0 ]; then
        print_status "OK" "Service has $ENDPOINTS endpoint(s)"
    else
        print_status "ERROR" "Service has no endpoints"
    fi
else
    print_status "ERROR" "Service 'otel-collector' not found"
fi

# Check 6: ServiceMonitor exists
echo ""
echo "6. Checking ServiceMonitor..."
if kubectl get servicemonitor otel-collector -n $NAMESPACE &> /dev/null 2>&1; then
    print_status "OK" "ServiceMonitor 'otel-collector' exists"
else
    print_status "WARN" "ServiceMonitor 'otel-collector' not found (Prometheus Operator may not be installed)"
fi

# Check 7: ServiceAccount and RBAC
echo ""
echo "7. Checking RBAC..."
if kubectl get serviceaccount otel-collector -n $NAMESPACE &> /dev/null; then
    print_status "OK" "ServiceAccount 'otel-collector' exists"
else
    print_status "ERROR" "ServiceAccount 'otel-collector' not found"
fi

if kubectl get clusterrole otel-collector &> /dev/null; then
    print_status "OK" "ClusterRole 'otel-collector' exists"
else
    print_status "ERROR" "ClusterRole 'otel-collector' not found"
fi

if kubectl get clusterrolebinding otel-collector &> /dev/null; then
    print_status "OK" "ClusterRoleBinding 'otel-collector' exists"
else
    print_status "ERROR" "ClusterRoleBinding 'otel-collector' not found"
fi

# Check 8: Health endpoint
echo ""
echo "8. Checking health endpoint..."
if POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=otel-collector -o jsonpath='{.items[0].metadata.name}' 2>/dev/null); then
    if kubectl exec -n $NAMESPACE $POD_NAME -- wget -q -O- http://localhost:13133/health 2>&1 | grep -q "Server available"; then
        print_status "OK" "Health endpoint responding"
    else
        print_status "WARN" "Health endpoint not responding correctly"
    fi
else
    print_status "WARN" "Cannot check health endpoint (no pod found)"
fi

# Check 9: Collector metrics
echo ""
echo "9. Checking collector metrics..."
if POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=otel-collector -o jsonpath='{.items[0].metadata.name}' 2>/dev/null); then
    if kubectl exec -n $NAMESPACE $POD_NAME -- wget -q -O- http://localhost:8888/metrics 2>&1 | grep -q "otelcol"; then
        print_status "OK" "Collector internal metrics available"
    else
        print_status "WARN" "Collector metrics not available"
    fi
else
    print_status "WARN" "Cannot check metrics (no pod found)"
fi

# Check 10: Prometheus exporter
echo ""
echo "10. Checking Prometheus exporter..."
if POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=otel-collector -o jsonpath='{.items[0].metadata.name}' 2>/dev/null); then
    if kubectl exec -n $NAMESPACE $POD_NAME -- wget -q -O- http://localhost:8889/metrics 2>&1 | grep -q "cortex"; then
        print_status "OK" "Prometheus exporter exposing metrics"
    else
        print_status "WARN" "Prometheus exporter may not be configured correctly"
    fi
else
    print_status "WARN" "Cannot check Prometheus exporter (no pod found)"
fi

# Check 11: Resource usage
echo ""
echo "11. Checking resource usage..."
if command -v kubectl &> /dev/null && kubectl top pods -n $NAMESPACE -l app=otel-collector &> /dev/null 2>&1; then
    RESOURCE_INFO=$(kubectl top pods -n $NAMESPACE -l app=otel-collector --no-headers 2>/dev/null | head -1)
    if [ -n "$RESOURCE_INFO" ]; then
        CPU=$(echo $RESOURCE_INFO | awk '{print $2}')
        MEM=$(echo $RESOURCE_INFO | awk '{print $3}')
        print_status "OK" "Resource usage: CPU=$CPU, Memory=$MEM"

        # Check if memory is approaching limit (512Mi)
        MEM_VALUE=$(echo $MEM | sed 's/Mi//')
        if [ "$MEM_VALUE" -gt 400 ] 2>/dev/null; then
            print_status "WARN" "Memory usage high (>400Mi): $MEM"
        fi
    else
        print_status "WARN" "Could not retrieve resource usage"
    fi
else
    print_status "WARN" "Metrics server not available (cannot check resource usage)"
fi

# Check 12: Recent logs for errors
echo ""
echo "12. Checking recent logs..."
if POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=otel-collector -o jsonpath='{.items[0].metadata.name}' 2>/dev/null); then
    ERROR_COUNT=$(kubectl logs -n $NAMESPACE $POD_NAME --tail=100 2>/dev/null | grep -i "error\|fatal\|panic" | wc -l | tr -d ' ')

    if [ "$ERROR_COUNT" -eq 0 ]; then
        print_status "OK" "No errors in recent logs"
    elif [ "$ERROR_COUNT" -lt 5 ]; then
        print_status "WARN" "Found $ERROR_COUNT error(s) in recent logs (check logs for details)"
    else
        print_status "ERROR" "Found $ERROR_COUNT error(s) in recent logs (investigate immediately)"
    fi
else
    print_status "WARN" "Cannot check logs (no pod found)"
fi

# Check 13: Auto-instrumentation (optional)
echo ""
echo "13. Checking auto-instrumentation..."
if kubectl get crd instrumentations.opentelemetry.io &> /dev/null 2>&1; then
    print_status "OK" "OpenTelemetry Operator CRD installed"

    if kubectl get instrumentation cortex-instrumentation -n cortex &> /dev/null 2>&1; then
        print_status "OK" "Cortex instrumentation configured"
    else
        print_status "WARN" "Cortex instrumentation not configured (optional)"
    fi
else
    print_status "WARN" "OpenTelemetry Operator not installed (auto-instrumentation unavailable)"
fi

# Check 14: HPA
echo ""
echo "14. Checking HorizontalPodAutoscaler..."
if kubectl get hpa otel-collector -n $NAMESPACE &> /dev/null 2>&1; then
    print_status "OK" "HPA 'otel-collector' exists"

    HPA_STATUS=$(kubectl get hpa otel-collector -n $NAMESPACE -o jsonpath='{.status.currentReplicas}/{.status.desiredReplicas}')
    print_status "OK" "HPA status: $HPA_STATUS replicas"
else
    print_status "WARN" "HPA not found (autoscaling disabled)"
fi

# Summary
echo ""
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo -e "${GREEN}Success: $SUCCESS${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Errors: $ERRORS${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! OTel deployment is healthy.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Deployment is functional but has warnings. Review above.${NC}"
    exit 0
else
    echo -e "${RED}✗ Deployment has errors. Please review and fix issues above.${NC}"
    echo ""
    echo "Troubleshooting commands:"
    echo "  kubectl logs -n $NAMESPACE -l app=otel-collector"
    echo "  kubectl describe pod -n $NAMESPACE -l app=otel-collector"
    echo "  kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'"
    exit 1
fi
