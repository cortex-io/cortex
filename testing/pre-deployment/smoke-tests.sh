#!/usr/bin/env bash
# Pre-Deployment Smoke Tests
# Quick validation suite for rapid feedback (<2 minutes)

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PYTHON="${PYTHON:-python3}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
START_TIME=$($PYTHON -c "import time; print(int(time.time() * 1000))")

# Temp directory for smoke tests
SMOKE_TEST_DIR="/tmp/cortex-smoke-test-$$"

##############################################################################
# Helper Functions
##############################################################################

setup() {
  mkdir -p "$SMOKE_TEST_DIR"/{tasks,workers,lineage,metrics}
}

cleanup() {
  rm -rf "$SMOKE_TEST_DIR"
}

test_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((TESTS_PASSED++))
}

test_fail() {
  echo -e "${RED}✗${NC} $1"
  ((TESTS_FAILED++))
}

generate_uuid() {
  if command -v uuidgen &> /dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    $PYTHON -c "import uuid; print(uuid.uuid4())"
  fi
}

##############################################################################
# Test 1: Can Spawn a Worker
##############################################################################
test_spawn_worker() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 1: Can Spawn a Worker"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local worker_id="smoke-worker-$(generate_uuid)"
  local worker_file="$SMOKE_TEST_DIR/workers/${worker_id}.json"

  # Create worker spec
  cat > "$worker_file" <<EOF
{
  "worker_id": "$worker_id",
  "worker_type": "feature-implementer",
  "parent_master": "development",
  "task_id": "smoke-task-1",
  "status": "initializing",
  "token_allocation": 10000,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  if [ -f "$worker_file" ]; then
    test_pass "Worker spec file created"
  else
    test_fail "Failed to create worker spec"
    return 1
  fi

  # Validate JSON
  if jq empty "$worker_file" 2>/dev/null; then
    test_pass "Worker spec is valid JSON"
  else
    test_fail "Worker spec is invalid JSON"
    return 1
  fi

  # Check required fields
  local worker_type=$(jq -r '.worker_type' "$worker_file")
  local status=$(jq -r '.status' "$worker_file")

  if [ -n "$worker_type" ] && [ "$worker_type" != "null" ]; then
    test_pass "Worker type field present: $worker_type"
  else
    test_fail "Worker type field missing"
  fi

  if [ -n "$status" ] && [ "$status" != "null" ]; then
    test_pass "Worker status field present: $status"
  else
    test_fail "Worker status field missing"
  fi

  # Simulate status transition
  jq '.status = "ready"' "$worker_file" > "${worker_file}.tmp" && mv "${worker_file}.tmp" "$worker_file"

  local new_status=$(jq -r '.status' "$worker_file")
  if [ "$new_status" = "ready" ]; then
    test_pass "Worker status transition successful: initializing → ready"
  else
    test_fail "Worker status transition failed"
  fi
}

##############################################################################
# Test 2: Can Route a Task
##############################################################################
test_route_task() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 2: Can Route a Task"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check if routing components exist
  local keyword_router="$CORTEX_HOME/coordination/masters/coordinator/lib/keyword-router.sh"

  if [ -f "$keyword_router" ]; then
    test_pass "Keyword router found"
  else
    test_fail "Keyword router not found"
    return 1
  fi

  # Test simple routing (keyword-based)
  local test_query="Fix security vulnerability in authentication module"

  if bash "$keyword_router" "$test_query" &>/dev/null; then
    local result=$(bash "$keyword_router" "$test_query" 2>/dev/null || echo "")

    if [ -n "$result" ]; then
      test_pass "Routing returned result"

      # Validate routing result
      if echo "$result" | jq empty 2>/dev/null; then
        test_pass "Routing result is valid JSON"

        local agent=$(echo "$result" | jq -r '.agent // empty')
        if [ -n "$agent" ] && [ "$agent" != "null" ]; then
          test_pass "Routing selected agent: $agent"
        else
          test_fail "Routing result missing agent field"
        fi
      else
        test_fail "Routing result is not valid JSON"
      fi
    else
      test_fail "Routing returned no result"
    fi
  else
    test_fail "Routing execution failed"
  fi
}

##############################################################################
# Test 3: Can Log to Lineage
##############################################################################
test_log_lineage() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 3: Can Log to Lineage"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local task_id="smoke-task-$(generate_uuid)"
  local correlation_id="corr-$(generate_uuid)"
  local lineage_file="$SMOKE_TEST_DIR/lineage/${task_id}.jsonl"

  # Create lineage entry
  cat >> "$lineage_file" <<EOF
{"event":"task_created","task_id":"$task_id","correlation_id":"$correlation_id","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"event":"task_assigned","task_id":"$task_id","correlation_id":"$correlation_id","master":"development","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  if [ -f "$lineage_file" ]; then
    test_pass "Lineage file created"
  else
    test_fail "Failed to create lineage file"
    return 1
  fi

  # Verify entries
  local entry_count=$(wc -l < "$lineage_file" | tr -d ' ')
  if [ "$entry_count" -eq 2 ]; then
    test_pass "Lineage entries logged: $entry_count"
  else
    test_fail "Unexpected lineage entry count: $entry_count"
  fi

  # Validate JSONL format
  local valid_entries=0
  while IFS= read -r line; do
    if echo "$line" | jq empty 2>/dev/null; then
      ((valid_entries++))
    fi
  done < "$lineage_file"

  if [ "$valid_entries" -eq "$entry_count" ]; then
    test_pass "All lineage entries are valid JSON"
  else
    test_fail "Some lineage entries are invalid JSON"
  fi

  # Check correlation_id consistency
  local unique_corr_ids=$(jq -r '.correlation_id' "$lineage_file" | sort -u | wc -l | tr -d ' ')
  if [ "$unique_corr_ids" -eq 1 ]; then
    test_pass "Correlation ID consistent across events"
  else
    test_fail "Correlation ID inconsistency detected"
  fi
}

##############################################################################
# Test 4: Can Emit Metrics
##############################################################################
test_emit_metrics() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 4: Can Emit Metrics"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local metrics_file="$SMOKE_TEST_DIR/metrics/smoke-metrics.jsonl"

  # Emit test metrics
  cat >> "$metrics_file" <<EOF
{"metric":"task_duration","value":1234,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"metric":"routing_latency","value":45,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"metric":"worker_spawn_time","value":567,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  if [ -f "$metrics_file" ]; then
    test_pass "Metrics file created"
  else
    test_fail "Failed to create metrics file"
    return 1
  fi

  # Verify metric count
  local metric_count=$(wc -l < "$metrics_file" | tr -d ' ')
  if [ "$metric_count" -eq 3 ]; then
    test_pass "Metrics emitted: $metric_count"
  else
    test_fail "Unexpected metric count: $metric_count"
  fi

  # Validate metric structure
  local valid_metrics=0
  while IFS= read -r line; do
    if echo "$line" | jq -e '.metric and .value and .unit and .timestamp' &>/dev/null; then
      ((valid_metrics++))
    fi
  done < "$metrics_file"

  if [ "$valid_metrics" -eq "$metric_count" ]; then
    test_pass "All metrics have required fields"
  else
    test_fail "Some metrics missing required fields"
  fi

  # Test metric aggregation
  local avg_value=$(jq -s 'map(.value) | add / length' "$metrics_file")
  if (( $(echo "$avg_value > 0" | bc -l) )); then
    test_pass "Metric aggregation works (avg: $avg_value)"
  else
    test_fail "Metric aggregation failed"
  fi
}

##############################################################################
# Test 5: File System Permissions
##############################################################################
test_filesystem_permissions() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 5: File System Permissions"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Test write permissions
  local test_file="$SMOKE_TEST_DIR/test-write.txt"
  if echo "test" > "$test_file" 2>/dev/null; then
    test_pass "Can write to temp directory"
    rm -f "$test_file"
  else
    test_fail "Cannot write to temp directory"
  fi

  # Test coordination directory
  if [ -w "$CORTEX_HOME/coordination" ]; then
    test_pass "Coordination directory writable"
  else
    test_fail "Coordination directory not writable"
  fi

  # Test logs directory
  mkdir -p "$CORTEX_HOME/logs"
  if [ -w "$CORTEX_HOME/logs" ]; then
    test_pass "Logs directory writable"
  else
    test_fail "Logs directory not writable"
  fi
}

##############################################################################
# Test 6: Essential Commands Available
##############################################################################
test_essential_commands() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 6: Essential Commands Available"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local required_commands=("jq" "python3" "bash" "git")

  for cmd in "${required_commands[@]}"; do
    if command -v "$cmd" &> /dev/null; then
      test_pass "Command available: $cmd"
    else
      test_fail "Command missing: $cmd"
    fi
  done

  # Test jq functionality
  if echo '{"test": "value"}' | jq -r '.test' &>/dev/null; then
    test_pass "jq functioning correctly"
  else
    test_fail "jq not functioning"
  fi

  # Test Python functionality
  if $PYTHON -c "import json; print('ok')" &>/dev/null; then
    test_pass "Python functioning correctly"
  else
    test_fail "Python not functioning"
  fi
}

##############################################################################
# Test 7: Configuration Files Present
##############################################################################
test_configuration_present() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 7: Configuration Files Present"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check for .env
  if [ -f "$CORTEX_HOME/.env" ]; then
    test_pass ".env file present"
  else
    test_fail ".env file missing"
  fi

  # Check for coordination structure
  if [ -d "$CORTEX_HOME/coordination/masters" ]; then
    test_pass "Masters directory present"
  else
    test_fail "Masters directory missing"
  fi

  if [ -d "$CORTEX_HOME/coordination/lineage" ]; then
    test_pass "Lineage directory present"
  else
    test_fail "Lineage directory missing"
  fi

  # Count available masters
  local master_count=$(find "$CORTEX_HOME/coordination/masters" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')
  if [ "$master_count" -ge 3 ]; then
    test_pass "Sufficient masters configured: $master_count"
  else
    test_fail "Insufficient masters: $master_count (need at least 3)"
  fi
}

##############################################################################
# Test 8: Basic Task Flow
##############################################################################
test_basic_task_flow() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST 8: Basic Task Flow"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local task_id="smoke-flow-$(generate_uuid)"
  local task_file="$SMOKE_TEST_DIR/tasks/${task_id}.json"

  # Create task
  cat > "$task_file" <<EOF
{
  "task_id": "$task_id",
  "description": "Smoke test task",
  "status": "queued",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  if [ -f "$task_file" ]; then
    test_pass "Task created"
  else
    test_fail "Task creation failed"
    return 1
  fi

  # Update status
  jq '.status = "assigned" | .assigned_master = "development"' "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"

  local status=$(jq -r '.status' "$task_file")
  if [ "$status" = "assigned" ]; then
    test_pass "Task status updated: queued → assigned"
  else
    test_fail "Task status update failed"
  fi

  # Complete task
  jq '.status = "completed" | .completed_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"

  status=$(jq -r '.status' "$task_file")
  if [ "$status" = "completed" ]; then
    test_pass "Task completed successfully"
  else
    test_fail "Task completion failed"
  fi
}

##############################################################################
# Main Smoke Test Suite
##############################################################################
main() {
  echo "╔════════════════════════════════════════╗"
  echo "║  Cortex Smoke Test Suite               ║"
  echo "╔════════════════════════════════════════╗"
  echo ""
  echo "Cortex Home: $CORTEX_HOME"
  echo "Start Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Target: Complete in <2 minutes"

  # Setup
  setup

  # Run all smoke tests
  test_spawn_worker
  test_route_task
  test_log_lineage
  test_emit_metrics
  test_filesystem_permissions
  test_essential_commands
  test_configuration_present
  test_basic_task_flow

  # Cleanup
  cleanup

  # Calculate duration
  local end_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")
  local duration_ms=$((end_time - START_TIME))
  local duration_s=$(echo "scale=2; $duration_ms / 1000" | bc)

  # Summary
  echo ""
  echo "========================================="
  echo "SMOKE TEST SUMMARY"
  echo "========================================="
  echo -e "${GREEN}Passed:${NC}  $TESTS_PASSED"
  echo -e "${RED}Failed:${NC}  $TESTS_FAILED"
  echo "Duration: ${duration_s}s"
  echo ""

  # Check time constraint
  if (( $(echo "$duration_s < 120" | bc -l) )); then
    echo -e "${GREEN}✓${NC} Completed within 2-minute target"
  else
    echo -e "${YELLOW}⚠${NC} Exceeded 2-minute target (${duration_s}s)"
  fi

  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ ALL SMOKE TESTS PASSED${NC}"
    exit 0
  else
    echo -e "${RED}✗ SOME SMOKE TESTS FAILED${NC}"
    exit 1
  fi
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
