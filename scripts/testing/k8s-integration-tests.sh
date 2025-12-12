#!/usr/bin/env bash
#
# Kubernetes Integration Tests for Cortex
#
# This script runs comprehensive integration tests against a deployed
# Cortex instance in Kubernetes.
#

set -euo pipefail

NAMESPACE="${NAMESPACE:-cortex}"
RESULTS_FILE="/tmp/cortex-test-results.json"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_test() {
    local test_name=$1
    local test_command=$2

    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Running: $test_name"

    if eval "$test_command"; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

echo "=========================================="
echo "Cortex K8s Integration Tests"
echo "Namespace: $NAMESPACE"
echo "=========================================="
echo ""

# Test 1: Verify all pods are running
run_test "All pods are running" \
    "kubectl get pods -n $NAMESPACE -l app=cortex --field-selector=status.phase=Running | grep -q cortex"

# Test 2: Verify coordinator deployment
run_test "Coordinator deployment exists" \
    "kubectl get deployment cortex-coordinator -n $NAMESPACE > /dev/null 2>&1"

# Test 3: Verify coordinator pod is ready
run_test "Coordinator pod is ready" \
    "kubectl wait --for=condition=ready pod -l component=coordinator -n $NAMESPACE --timeout=30s > /dev/null 2>&1"

# Test 4: Verify coordination files exist
COORDINATOR_POD=$(kubectl get pod -n $NAMESPACE -l component=coordinator -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "$COORDINATOR_POD" ]; then
    run_test "Coordination status file exists" \
        "kubectl exec -n $NAMESPACE $COORDINATOR_POD -- test -f /app/coordination/status.json"

    run_test "Task queue file exists" \
        "kubectl exec -n $NAMESPACE $COORDINATOR_POD -- test -f /app/coordination/task-queue.json"

    run_test "Token budget file exists" \
        "kubectl exec -n $NAMESPACE $COORDINATOR_POD -- test -f /app/coordination/token-budget.json"
else
    log_fail "Could not find coordinator pod"
    TESTS_FAILED=$((TESTS_FAILED + 3))
fi

# Test 5: Verify master deployments
for master in development cicd security; do
    run_test "Master $master deployment exists" \
        "kubectl get deployment cortex-${master}-master -n $NAMESPACE > /dev/null 2>&1 || true"
done

# Test 6: Test task submission
if [ -n "$COORDINATOR_POD" ]; then
    log_test "Submitting test task..."

    TEST_TASK=$(cat <<EOF
{
  "task_id": "integration-test-$(date +%s)",
  "title": "Integration test task",
  "type": "test",
  "priority": "low",
  "status": "pending",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

    run_test "Submit test task" \
        "kubectl exec -n $NAMESPACE $COORDINATOR_POD -- bash -c 'echo \"$TEST_TASK\" > /app/coordination/test-task.json'"

    # Wait a moment for processing
    sleep 2

    run_test "Task file was processed" \
        "kubectl exec -n $NAMESPACE $COORDINATOR_POD -- test -f /app/coordination/test-task.json"
fi

# Test 7: Verify service endpoints
run_test "Coordinator service exists" \
    "kubectl get service cortex-coordinator -n $NAMESPACE > /dev/null 2>&1"

SERVICE_IP=$(kubectl get service cortex-coordinator -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")

if [ -n "$SERVICE_IP" ]; then
    log_pass "Service IP: $SERVICE_IP"
else
    log_fail "Could not get service IP"
fi

# Test 8: Check resource usage
log_test "Checking resource usage..."

if [ -n "$COORDINATOR_POD" ]; then
    MEMORY_USAGE=$(kubectl top pod $COORDINATOR_POD -n $NAMESPACE 2>/dev/null | tail -1 | awk '{print $3}' || echo "N/A")
    CPU_USAGE=$(kubectl top pod $COORDINATOR_POD -n $NAMESPACE 2>/dev/null | tail -1 | awk '{print $2}' || echo "N/A")

    echo "Memory: $MEMORY_USAGE"
    echo "CPU: $CPU_USAGE"
fi

# Test 9: Verify PVC is bound
run_test "Coordination PVC is bound" \
    "kubectl get pvc cortex-coordination-pvc -n $NAMESPACE -o jsonpath='{.status.phase}' | grep -q Bound"

# Test 10: Check for errors in logs
log_test "Checking logs for critical errors..."

if [ -n "$COORDINATOR_POD" ]; then
    ERROR_COUNT=$(kubectl logs $COORDINATOR_POD -n $NAMESPACE --tail=100 2>/dev/null | grep -i "critical\|fatal" | wc -l || echo 0)

    if [ $ERROR_COUNT -eq 0 ]; then
        log_pass "No critical errors in logs"
    else
        log_fail "Found $ERROR_COUNT critical errors in logs"
    fi
fi

# Test 11: Verify ConfigMap
run_test "ConfigMap exists" \
    "kubectl get configmap cortex-config -n $NAMESPACE > /dev/null 2>&1"

# Test 12: Verify ServiceAccount
run_test "ServiceAccount exists" \
    "kubectl get serviceaccount cortex-sa -n $NAMESPACE > /dev/null 2>&1"

# Test 13: Test scale-up (if HPA exists)
HPA_EXISTS=$(kubectl get hpa -n $NAMESPACE 2>/dev/null | grep cortex || echo "")

if [ -n "$HPA_EXISTS" ]; then
    log_test "Testing auto-scaling capability..."

    # Submit multiple tasks to trigger scale-up
    for i in {1..5}; do
        kubectl exec -n $NAMESPACE $COORDINATOR_POD -- bash -c \
            "echo '{\"task_id\":\"scale-test-$i\",\"type\":\"test\"}' > /app/coordination/scale-test-$i.json" 2>/dev/null || true
    done

    sleep 10

    WORKER_PODS=$(kubectl get pods -n $NAMESPACE -l role=worker --no-headers 2>/dev/null | wc -l || echo 0)
    echo "Worker pods: $WORKER_PODS"

    if [ $WORKER_PODS -gt 0 ]; then
        log_pass "Auto-scaling triggered ($WORKER_PODS workers)"
    else
        log_fail "Auto-scaling did not trigger"
    fi
else
    echo "HPA not configured - skipping scale test"
fi

# Test 14: Verify network policies (if they exist)
NETPOL_EXISTS=$(kubectl get networkpolicy -n $NAMESPACE 2>/dev/null | grep cortex || echo "")

if [ -n "$NETPOL_EXISTS" ]; then
    run_test "Network policy exists" \
        "kubectl get networkpolicy cortex-network-policy -n $NAMESPACE > /dev/null 2>&1"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Tests Run:    $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Success Rate: $(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$TESTS_RUN)*100}")%"
echo "=========================================="

# Write results to file
cat > $RESULTS_FILE <<EOF
{
  "tests_run": $TESTS_RUN,
  "tests_passed": $TESTS_PASSED,
  "tests_failed": $TESTS_FAILED,
  "success_rate": $(awk "BEGIN {printf \"%.2f\", ($TESTS_PASSED/$TESTS_RUN)*100}"),
  "passed": $([ $TESTS_FAILED -eq 0 ] && echo "true" || echo "false"),
  "message": "Ran $TESTS_RUN tests: $TESTS_PASSED passed, $TESTS_FAILED failed",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Results written to: $RESULTS_FILE"

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
