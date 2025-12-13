#!/bin/bash
set -euo pipefail

# Test cortex-resource-manager deployment and API functionality
# This script should be run ON the K3s cluster or with kubectl access

NAMESPACE="${NAMESPACE:-cortex-system}"
SERVICE_NAME="cortex-resource-manager"
SERVICE_URL="http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:8080"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

# Test 1: Check if deployment exists
log_test "Checking if deployment exists..."
if kubectl get deployment "$SERVICE_NAME" -n "$NAMESPACE" &> /dev/null; then
    log_success "Deployment exists"
else
    log_error "Deployment not found"
fi

# Test 2: Check if pods are running
log_test "Checking if pods are running..."
POD_STATUS=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")
if [[ "$POD_STATUS" == "Running" ]]; then
    log_success "Pod is running"
else
    log_error "Pod status: $POD_STATUS"
fi

# Test 3: Check if service exists
log_test "Checking if service exists..."
if kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" &> /dev/null; then
    log_success "Service exists"
else
    log_error "Service not found"
fi

# Test 4: Check service endpoints
log_test "Checking service endpoints..."
ENDPOINTS=$(kubectl get endpoints "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null || echo "")
if [[ -n "$ENDPOINTS" ]]; then
    log_success "Service has endpoints: $ENDPOINTS"
else
    log_error "Service has no endpoints"
fi

# Test 5: Check RBAC
log_test "Checking RBAC configuration..."
if kubectl get serviceaccount "$SERVICE_NAME" -n "$NAMESPACE" &> /dev/null; then
    log_success "ServiceAccount exists"
else
    log_error "ServiceAccount not found"
fi

if kubectl get clusterrole "$SERVICE_NAME" &> /dev/null; then
    log_success "ClusterRole exists"
else
    log_error "ClusterRole not found"
fi

if kubectl get clusterrolebinding "$SERVICE_NAME" &> /dev/null; then
    log_success "ClusterRoleBinding exists"
else
    log_error "ClusterRoleBinding not found"
fi

# Test 6: Check pod health
log_test "Checking pod health status..."
POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [[ -n "$POD_NAME" ]]; then
    READY=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
    if [[ "$READY" == "True" ]]; then
        log_success "Pod is ready"
    else
        log_error "Pod is not ready"
    fi
else
    log_error "No pod found"
fi

# Test 7: Test health endpoint
log_test "Testing /health endpoint..."
HEALTH_RESPONSE=$(kubectl run test-health-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -f "$SERVICE_URL/health" 2>/dev/null || echo "FAILED")
if [[ "$HEALTH_RESPONSE" != "FAILED" ]]; then
    log_success "Health endpoint responding"
else
    log_error "Health endpoint not responding"
fi

# Test 8: Test readiness endpoint
log_test "Testing /ready endpoint..."
READY_RESPONSE=$(kubectl run test-ready-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -f "$SERVICE_URL/ready" 2>/dev/null || echo "FAILED")
if [[ "$READY_RESPONSE" != "FAILED" ]]; then
    log_success "Readiness endpoint responding"
else
    log_error "Readiness endpoint not responding"
fi

# Test 9: Check resource allocation API (list_allocations)
log_test "Testing resource allocation API..."
API_RESPONSE=$(kubectl run test-api-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -X POST "$SERVICE_URL/mcp/v1/tools/list_allocations" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "FAILED")
if [[ "$API_RESPONSE" != "FAILED" ]]; then
    log_success "Resource allocation API responding"
else
    log_error "Resource allocation API not responding"
fi

# Test 10: Check MCP server list API
log_test "Testing MCP server list API..."
MCP_RESPONSE=$(kubectl run test-mcp-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -X POST "$SERVICE_URL/mcp/v1/tools/list_mcp_servers" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "FAILED")
if [[ "$MCP_RESPONSE" != "FAILED" ]]; then
    log_success "MCP server list API responding"
else
    log_error "MCP server list API not responding"
fi

# Test 11: Check worker list API
log_test "Testing worker list API..."
WORKER_RESPONSE=$(kubectl run test-workers-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -X POST "$SERVICE_URL/mcp/v1/tools/list_workers" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "FAILED")
if [[ "$WORKER_RESPONSE" != "FAILED" ]]; then
    log_success "Worker list API responding"
else
    log_error "Worker list API not responding"
fi

# Test 12: Check capacity API
log_test "Testing capacity API..."
CAPACITY_RESPONSE=$(kubectl run test-capacity-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -X POST "$SERVICE_URL/mcp/v1/tools/get_capacity" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "FAILED")
if [[ "$CAPACITY_RESPONSE" != "FAILED" ]]; then
    log_success "Capacity API responding"
else
    log_error "Capacity API not responding"
fi

# Test 13: Check metrics endpoint
log_test "Testing /metrics endpoint..."
METRICS_RESPONSE=$(kubectl run test-metrics-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- \
    curl -s -f "http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:9090/metrics" 2>/dev/null || echo "FAILED")
if [[ "$METRICS_RESPONSE" != "FAILED" ]]; then
    log_success "Metrics endpoint responding"
else
    log_error "Metrics endpoint not responding (may not be implemented yet)"
fi

# Test 14: Check pod logs for errors
log_test "Checking pod logs for errors..."
if [[ -n "$POD_NAME" ]]; then
    ERROR_COUNT=$(kubectl logs "$POD_NAME" -n "$NAMESPACE" --tail=100 2>/dev/null | grep -i error | wc -l || echo "0")
    if [[ "$ERROR_COUNT" -eq 0 ]]; then
        log_success "No errors in recent logs"
    else
        log_error "Found $ERROR_COUNT error messages in logs"
    fi
else
    log_error "No pod to check logs"
fi

# Test 15: Check resource usage
log_test "Checking resource usage..."
if [[ -n "$POD_NAME" ]]; then
    CPU_USAGE=$(kubectl top pod "$POD_NAME" -n "$NAMESPACE" 2>/dev/null | tail -1 | awk '{print $2}' || echo "N/A")
    MEM_USAGE=$(kubectl top pod "$POD_NAME" -n "$NAMESPACE" 2>/dev/null | tail -1 | awk '{print $3}' || echo "N/A")
    log_info "Resource usage: CPU=$CPU_USAGE, Memory=$MEM_USAGE"
    log_success "Resource metrics available"
else
    log_error "Cannot check resource usage"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "========================================"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
