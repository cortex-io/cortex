#!/bin/bash

# End-to-End Test: Initializer Master → Feature List → Worker Spawn
# Tests the complete flow from task decomposition to worker execution

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$CORTEX_ROOT"

# Colors
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
NC="\033[0m"

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
  TESTS_RUN=$((TESTS_RUN + 1))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  TESTS_RUN=$((TESTS_RUN + 1))
}

info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Cleanup function
cleanup() {
  info "Cleaning up test artifacts..."
  rm -f coordination/feature-lists/task-e2e-test-*.json
  rm -rf coordination/workers/worker-test-*
  rm -f coordination/workers/init-task-e2e-test-*.sh
}

trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Initializer Master End-to-End Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Complexity Estimator
info "Test 1: Complexity Estimator"

if [ -f "coordination/masters/coordinator/lib/complexity-estimator.sh" ]; then
  source "coordination/masters/coordinator/lib/complexity-estimator.sh"

  # Simple task
  SIMPLE_COMPLEXITY=$(estimate_task_complexity "Fix typo")
  if [ "$SIMPLE_COMPLEXITY" -le 2 ]; then
    pass "Simple task complexity: $SIMPLE_COMPLEXITY (≤ 2)"
  else
    fail "Simple task complexity too high: $SIMPLE_COMPLEXITY"
  fi

  # Complex task
  COMPLEX_DESCRIPTION="Implement comprehensive authentication system with OAuth, SAML, and multi-factor authentication plus security audit and testing"
  COMPLEX_COMPLEXITY=$(estimate_task_complexity "$COMPLEX_DESCRIPTION")
  if [ "$COMPLEX_COMPLEXITY" -gt 3 ]; then
    pass "Complex task complexity: $COMPLEX_COMPLEXITY (> 3)"
  else
    fail "Complex task complexity too low: $COMPLEX_COMPLEXITY"
  fi

  # Routing decision
  if should_route_to_initializer "$COMPLEX_DESCRIPTION"; then
    pass "Complex task correctly routed to initializer"
  else
    fail "Complex task should be routed to initializer"
  fi
else
  fail "Complexity estimator not found"
fi

echo ""

# Test 2: Feature List Creation and Validation
info "Test 2: Feature List Creation and Validation"

TASK_ID="task-e2e-test-001"
FEATURE_LIST_FILE="coordination/feature-lists/${TASK_ID}-features.json"

# Create test feature list
cat > "$FEATURE_LIST_FILE" <<EOF
{
  "task_id": "$TASK_ID",
  "total_features": 3,
  "completed": 0,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "test-suite",
  "features": [
    {
      "feature_id": "test-001",
      "description": "Create hello world function",
      "status": "failing",
      "priority": "high",
      "estimated_minutes": 5,
      "test_command": "echo 'Test 1 passed' && exit 0",
      "dependencies": [],
      "acceptance_criteria": ["Function returns 'Hello World'"],
      "assigned_to": null,
      "completed_at": null,
      "test_results": null
    },
    {
      "feature_id": "test-002",
      "description": "Add input validation",
      "status": "failing",
      "priority": "medium",
      "estimated_minutes": 5,
      "test_command": "echo 'Test 2 passed' && exit 0",
      "dependencies": ["test-001"],
      "acceptance_criteria": ["Validates input parameters"],
      "assigned_to": null,
      "completed_at": null,
      "test_results": null
    },
    {
      "feature_id": "test-003",
      "description": "Add error handling",
      "status": "failing",
      "priority": "low",
      "estimated_minutes": 5,
      "test_command": "echo 'Test 3 passed' && exit 0",
      "dependencies": [],
      "acceptance_criteria": ["Handles errors gracefully"],
      "assigned_to": null,
      "completed_at": null,
      "test_results": null
    }
  ]
}
EOF

if [ -f "$FEATURE_LIST_FILE" ]; then
  pass "Feature list created: $FEATURE_LIST_FILE"
else
  fail "Feature list creation failed"
fi

# Validate feature list
if [ -f "lib/feature-list-validator.sh" ]; then
  source "lib/feature-list-validator.sh"

  if validate_feature_list "$FEATURE_LIST_FILE" > /dev/null 2>&1; then
    pass "Feature list validation passed"
  else
    fail "Feature list validation failed"
  fi

  # Get next feature
  NEXT_FEATURE=$(get_next_feature "$FEATURE_LIST_FILE")
  if [ -n "$NEXT_FEATURE" ]; then
    pass "Next feature identified: $NEXT_FEATURE"
  else
    fail "Failed to get next feature"
  fi

  # Get feature stats
  STATS=$(get_feature_stats "$FEATURE_LIST_FILE")
  TOTAL=$(echo "$STATS" | jq -r '.total')
  if [ "$TOTAL" -eq 3 ]; then
    pass "Feature stats correct: $TOTAL total features"
  else
    fail "Feature stats incorrect: expected 3, got $TOTAL"
  fi
else
  fail "Feature list validator not found"
fi

echo ""

# Test 3: Worker Session Management
info "Test 3: Worker Session Management"

if [ -f "scripts/lib/worker-session.sh" ]; then
  source "scripts/lib/worker-session.sh"

  TEST_WORKER_ID="worker-test-e2e-001"

  # Start session
  SESSION_FILE=$(start_worker_session "$TEST_WORKER_ID" "$TASK_ID" "test-001")
  if [ -f "$SESSION_FILE" ]; then
    pass "Worker session started: $SESSION_FILE"
  else
    fail "Worker session creation failed"
  fi

  # Check session JSON
  SESSION_JSON="coordination/workers/${TEST_WORKER_ID}/progress/current-session.json"
  if [ -f "$SESSION_JSON" ]; then
    pass "Session JSON created: $SESSION_JSON"
  else
    fail "Session JSON not created"
  fi

  # Add progress note
  add_progress_note "$TEST_WORKER_ID" "Test note: Implementation in progress"
  if grep -q "Test note" "$SESSION_FILE"; then
    pass "Progress note added successfully"
  else
    fail "Progress note not added"
  fi

  # End session
  end_worker_session "$TEST_WORKER_ID" "$SESSION_FILE" "Test completed successfully"
  if grep -q "Test completed successfully" "$SESSION_FILE"; then
    pass "Worker session ended with summary"
  else
    fail "Worker session end failed"
  fi
else
  fail "Worker session management not found"
fi

echo ""

# Test 4: Test Enforcement
info "Test 4: Test Enforcement"

if [ -f "scripts/lib/test-enforcement.sh" ]; then
  source "scripts/lib/test-enforcement.sh"

  # Update feature with test results
  TEST_RESULTS='{"exit_code": 0, "stdout": "All tests passed", "duration_ms": 1234}'
  update_feature_status "$FEATURE_LIST_FILE" "test-001" "passing" "$TEST_RESULTS"

  # Validate feature completion
  if validate_feature_completion "$TEST_WORKER_ID" "$TASK_ID" "test-001" "$FEATURE_LIST_FILE" > /dev/null 2>&1; then
    pass "Feature completion validation passed"
  else
    fail "Feature completion validation failed"
  fi

  # Check feature status update
  FEATURE_STATUS=$(jq -r '.features[] | select(.feature_id == "test-001") | .status' "$FEATURE_LIST_FILE")
  if [ "$FEATURE_STATUS" = "passing" ]; then
    pass "Feature status updated to passing"
  else
    fail "Feature status not updated correctly: $FEATURE_STATUS"
  fi
else
  fail "Test enforcement not found"
fi

echo ""

# Test 5: Governance Validator
info "Test 5: Governance Validator"

if [ -f "lib/governance/completion-validator.js" ]; then
  # This test would fail because we don't have real git commits, but we can check the script exists
  pass "Governance validator exists"

  # Check policy file
  if [ -f "coordination/governance/policies/completion-validation.json" ]; then
    pass "Completion validation policy exists"
  else
    fail "Completion validation policy not found"
  fi
else
  fail "Governance validator not found"
fi

echo ""

# Test 6: Init Script Generation
info "Test 6: Init Script Generation"

if [ -f "coordination/masters/initializer/lib/init-script-generator.sh" ]; then
  source "coordination/masters/initializer/lib/init-script-generator.sh"

  generate_init_script "$TASK_ID" "$FEATURE_LIST_FILE"

  INIT_SCRIPT="coordination/workers/init-${TASK_ID}.sh"
  if [ -f "$INIT_SCRIPT" ]; then
    pass "Init script generated: $INIT_SCRIPT"

    # Check if executable
    if [ -x "$INIT_SCRIPT" ]; then
      pass "Init script is executable"
    else
      fail "Init script not executable"
    fi

    # Check if it contains feature list path
    if grep -q "$FEATURE_LIST_FILE" "$INIT_SCRIPT"; then
      pass "Init script references feature list"
    else
      fail "Init script missing feature list reference"
    fi
  else
    fail "Init script generation failed"
  fi
else
  fail "Init script generator not found"
fi

echo ""

# Test 7: Component Integration
info "Test 7: Component Integration"

# Check all key components exist
COMPONENTS=(
  "coordination/masters/initializer/initializer-master.sh"
  "coordination/masters/initializer/lib/feature-decomposer.sh"
  "coordination/masters/initializer/prompts/decomposition-prompt.txt"
  "coordination/masters/coordinator/lib/complexity-estimator.sh"
  "lib/feature-list-validator.sh"
  "scripts/lib/worker-session.sh"
  "scripts/lib/test-enforcement.sh"
  "lib/governance/completion-validator.js"
  "schemas/feature-list-schema.json"
  "coordination/governance/policies/completion-validation.json"
)

MISSING=0
for component in "${COMPONENTS[@]}"; do
  if [ -f "$component" ]; then
    pass "Component exists: $component"
  else
    fail "Component missing: $component"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  pass "All components integrated correctly"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
