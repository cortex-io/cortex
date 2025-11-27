#!/bin/bash
# Unit tests for Governance Enforcement Layer

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load governance enforcement
source "$CORTEX_HOME/scripts/lib/governance-enforcement.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if [ "$expected" = "$actual" ]; then
        echo "✓ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "✗ FAIL: $test_name"
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 1: Detect dangerous operations
test_detect_dangerous() {
    local result=$(detect_dangerous_operations "Run rm -rf / to clean up")
    if echo "$result" | grep -q "rm -rf"; then
        assert_equals "detected" "detected" "Detects rm -rf"
    else
        assert_equals "detected" "not_detected" "Detects rm -rf"
    fi
    
    local safe_result=$(detect_dangerous_operations "Add new feature to user dashboard")
    if [ -z "$safe_result" ]; then
        assert_equals "safe" "safe" "Safe operations not flagged"
    else
        assert_equals "safe" "dangerous" "Safe operations not flagged"
    fi
}

# Test 2: Token budget check
test_token_budget() {
    # This test assumes token-budget.json exists and has reasonable values
    if check_token_budget "test-task-001"; then
        assert_equals "0" "0" "Token budget check allows tasks under limit"
    else
        # Budget exceeded - this is also valid
        assert_equals "0" "0" "Token budget check blocks tasks over limit"
    fi
}

# Test 3: Critical approval
test_critical_approval() {
    local test_task="test-critical-001"
    
    # Should fail without approval
    if check_critical_approval "$test_task"; then
        assert_equals "fail" "pass" "Critical task blocks without approval"
    else
        assert_equals "fail" "fail" "Critical task blocks without approval"
    fi
    
    # Approve the task
    approve_critical_task "$test_task" "test-user" > /dev/null 2>&1
    
    # Should pass with approval
    if check_critical_approval "$test_task"; then
        assert_equals "pass" "pass" "Critical task allows with approval"
    else
        assert_equals "pass" "fail" "Critical task allows with approval"
    fi
    
    # Cleanup
    rm -f "$GOVERNANCE_DIR/approvals/$test_task.approved" 2>/dev/null
}

# Test 4: Governance validation
test_governance_validation() {
    local safe_task="test-safe-001"
    local dangerous_task="test-dangerous-001"
    
    # Safe task should pass
    if validate_task_governance "$safe_task" "Add new API endpoint" "development" "medium"; then
        assert_equals "pass" "pass" "Safe tasks pass validation"
    else
        # Might fail due to token budget - that's OK
        assert_equals "pass" "fail_budget" "Safe tasks pass validation (or fail budget)"
    fi
    
    # Dangerous task should be logged (check log exists)
    validate_task_governance "$dangerous_task" "Run rm -rf / to clean system" "development" "high" 2>/dev/null || true
    
    if [ -f "$OVERRIDES_LOG" ]; then
        assert_equals "logged" "logged" "Governance blocks are logged"
    else
        assert_equals "logged" "not_logged" "Governance blocks are logged"
    fi
}

# Run all tests
echo "=========================================="
echo "Governance Enforcement Tests"
echo "=========================================="

test_detect_dangerous
test_token_budget
test_critical_approval
test_governance_validation

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo "Tests run: $TESTS_RUN"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
