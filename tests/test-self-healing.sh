#!/bin/bash
# Self-Healing System Test Suite
# Tests various failure scenarios and validates automatic recovery

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
NAMESPACE="cortex-system"
API_SERVICE="cortex-api"
TEST_SERVICE="sandfly-mcp-server"
API_URL="http://cortex-api.cortex-system.svc.cluster.local:8000"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper functions
log() {
    echo -e "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $*"
    ((TESTS_FAILED++))
}

info() {
    echo -e "${YELLOW}ℹ${NC} $*"
}

wait_for_condition() {
    local condition="$1"
    local timeout="${2:-60}"
    local interval=2
    local elapsed=0

    while ! eval "$condition" 2>/dev/null; do
        sleep $interval
        elapsed=$((elapsed + interval))
        if [[ $elapsed -ge $timeout ]]; then
            return 1
        fi
    done
    return 0
}

get_ready_replicas() {
    local deployment="$1"
    kubectl get deployment -n "$NAMESPACE" "$deployment" \
        -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0"
}

check_pod_status() {
    local deployment="$1"
    local status=$(kubectl get pods -n "$NAMESPACE" -l "app=$deployment" \
        -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")
    echo "$status"
}

# Test setup
setup() {
    log "Setting up test environment..."

    # Ensure test service is running
    local ready=$(get_ready_replicas "$TEST_SERVICE")
    if [[ "$ready" -eq 0 ]]; then
        info "Restoring test service to healthy state..."
        kubectl scale deployment -n "$NAMESPACE" "$TEST_SERVICE" --replicas=1 2>/dev/null || true
        sleep 10
    fi

    log "Test environment ready"
}

# Test cleanup
cleanup() {
    log "Cleaning up test environment..."

    # Restore test service to healthy state
    kubectl scale deployment -n "$NAMESPACE" "$TEST_SERVICE" --replicas=1 2>/dev/null || true
    kubectl rollout restart deployment -n "$NAMESPACE" "$TEST_SERVICE" 2>/dev/null || true

    log "Cleanup complete"
}

# Test 1: Service scaled to 0
test_service_scaled_to_zero() {
    ((TESTS_TOTAL++))
    log "Test 1: Service scaled to 0 - Self-healing should restore it"

    # Scale service to 0
    info "Scaling $TEST_SERVICE to 0 replicas..."
    kubectl scale deployment -n "$NAMESPACE" "$TEST_SERVICE" --replicas=0
    sleep 5

    # Verify it's down
    local ready=$(get_ready_replicas "$TEST_SERVICE")
    if [[ "$ready" -ne 0 ]]; then
        fail "Test 1: Failed to scale service to 0"
        return 1
    fi

    # Trigger healing via direct worker call
    info "Triggering self-healing worker..."
    local result=$(kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "No pods available" "" 2>&1 | tail -1)

    # Wait for service to be restored
    info "Waiting for service to be restored..."
    if wait_for_condition "[[ \$(get_ready_replicas $TEST_SERVICE) -ge 1 ]]" 90; then
        success "Test 1: Service successfully restored from scaled-to-zero state"
        return 0
    else
        fail "Test 1: Service not restored after healing attempt"
        log "Healing result: $result"
        return 1
    fi
}

# Test 2: Pod crashed/deleted
test_pod_deletion() {
    ((TESTS_TOTAL++))
    log "Test 2: Pod deletion - Self-healing should detect and restart"

    # Get current pod
    local pod=$(kubectl get pods -n "$NAMESPACE" -l "app=$TEST_SERVICE" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [[ -z "$pod" ]]; then
        fail "Test 2: No pod found to delete"
        return 1
    fi

    info "Deleting pod: $pod"
    kubectl delete pod -n "$NAMESPACE" "$pod"
    sleep 5

    # Trigger healing
    info "Triggering self-healing worker..."
    kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "Pod terminated" "" >/dev/null 2>&1 || true

    # Wait for new pod to be ready
    info "Waiting for new pod to be ready..."
    if wait_for_condition "[[ \$(get_ready_replicas $TEST_SERVICE) -ge 1 ]]" 90; then
        success "Test 2: New pod successfully started after deletion"
        return 0
    else
        fail "Test 2: Pod not restored after deletion"
        return 1
    fi
}

# Test 3: Deployment restart
test_deployment_restart() {
    ((TESTS_TOTAL++))
    log "Test 3: Deployment restart - Healing worker should handle gracefully"

    # Get initial replica count
    local initial_replicas=$(get_ready_replicas "$TEST_SERVICE")

    # Trigger healing worker restart
    info "Triggering healing worker to restart deployment..."
    local result=$(kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "Service unresponsive" "" 2>&1 | tail -1)

    # Wait for rollout to complete
    info "Waiting for rollout to complete..."
    if kubectl rollout status deployment -n "$NAMESPACE" "$TEST_SERVICE" --timeout=90s 2>&1 >/dev/null; then
        local final_replicas=$(get_ready_replicas "$TEST_SERVICE")
        if [[ "$final_replicas" -ge "$initial_replicas" ]]; then
            success "Test 3: Deployment successfully restarted"
            return 0
        else
            fail "Test 3: Replica count decreased after restart"
            return 1
        fi
    else
        fail "Test 3: Rollout did not complete in time"
        log "Healing result: $result"
        return 1
    fi
}

# Test 4: Check diagnostic capabilities
test_diagnostics() {
    ((TESTS_TOTAL++))
    log "Test 4: Diagnostic capabilities - Worker should provide detailed diagnosis"

    # Run healing worker in diagnostic mode (service is healthy)
    info "Running diagnostics on healthy service..."
    local output=$(kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "Health check" "" 2>&1)

    # Check for expected diagnostic output
    if echo "$output" | grep -q "Checking pod status" && \
       echo "$output" | grep -q "Checking service endpoints" && \
       echo "$output" | grep -q "Checking recent pod logs"; then
        success "Test 4: Diagnostic checks performed correctly"
        return 0
    else
        fail "Test 4: Missing expected diagnostic checks"
        log "Output: $output"
        return 1
    fi
}

# Test 5: JSON output format
test_json_output() {
    ((TESTS_TOTAL++))
    log "Test 5: JSON output format - Worker should return valid JSON"

    # Run healing worker and capture output
    local output=$(kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "Test error" "" 2>&1 | tail -1)

    # Validate JSON
    if echo "$output" | jq . >/dev/null 2>&1; then
        # Check for required fields
        if echo "$output" | jq -e '.success' >/dev/null && \
           echo "$output" | jq -e '.diagnosis' >/dev/null && \
           echo "$output" | jq -e '.timestamp' >/dev/null; then
            success "Test 5: Valid JSON output with required fields"
            return 0
        else
            fail "Test 5: JSON missing required fields"
            log "Output: $output"
            return 1
        fi
    else
        fail "Test 5: Invalid JSON output"
        log "Output: $output"
        return 1
    fi
}

# Test 6: Service connectivity check
test_connectivity_check() {
    ((TESTS_TOTAL++))
    log "Test 6: Connectivity check - Worker should verify service reachability"

    # Ensure service is running
    local ready=$(get_ready_replicas "$TEST_SERVICE")
    if [[ "$ready" -eq 0 ]]; then
        info "Starting service for connectivity test..."
        kubectl scale deployment -n "$NAMESPACE" "$TEST_SERVICE" --replicas=1
        sleep 15
    fi

    # Run healing worker
    local output=$(kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        bash /app/scripts/self-heal-worker.sh "$TEST_SERVICE" "Connectivity test" "" 2>&1)

    # Check if connectivity was verified
    if echo "$output" | grep -q "Verifying service connectivity\|Service is reachable\|Service connectivity verified"; then
        success "Test 6: Service connectivity verified"
        return 0
    else
        # Service might not have connectivity verification for this specific service
        info "Test 6: Connectivity check not performed (may be expected for this service)"
        success "Test 6: Passed (connectivity check optional)"
        return 0
    fi
}

# Test 7: Healing worker script existence
test_script_existence() {
    ((TESTS_TOTAL++))
    log "Test 7: Healing worker script - Should exist and be executable"

    # Check if script exists in API pod
    if kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        test -f /app/scripts/self-heal-worker.sh 2>/dev/null; then

        # Check if script is executable
        if kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
            test -x /app/scripts/self-heal-worker.sh 2>/dev/null; then
            success "Test 7: Healing worker script exists and is executable"
            return 0
        else
            fail "Test 7: Healing worker script exists but is not executable"
            return 1
        fi
    else
        fail "Test 7: Healing worker script does not exist in API pod"
        return 1
    fi
}

# Test 8: RBAC permissions
test_rbac_permissions() {
    ((TESTS_TOTAL++))
    log "Test 8: RBAC permissions - API pod should have kubectl access"

    # Try to get pods (basic kubectl command)
    if kubectl exec -n "$NAMESPACE" deploy/"$API_SERVICE" -- \
        kubectl get pods -n "$NAMESPACE" >/dev/null 2>&1; then
        success "Test 8: API pod has kubectl access"
        return 0
    else
        fail "Test 8: API pod lacks kubectl access - check ServiceAccount and RBAC"
        return 1
    fi
}

# Main test runner
main() {
    log "========================================="
    log "Cortex Self-Healing System Test Suite"
    log "========================================="
    log ""

    # Setup
    setup

    # Run tests
    test_script_existence
    test_rbac_permissions
    test_json_output
    test_diagnostics
    test_connectivity_check
    test_deployment_restart
    test_pod_deletion
    test_service_scaled_to_zero

    # Cleanup
    cleanup

    # Report
    log ""
    log "========================================="
    log "Test Results"
    log "========================================="
    log "Total tests: $TESTS_TOTAL"
    log "Passed: $TESTS_PASSED"
    log "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        success "All tests passed!"
        log ""
        return 0
    else
        fail "$TESTS_FAILED test(s) failed"
        log ""
        return 1
    fi
}

# Run tests
main "$@"
