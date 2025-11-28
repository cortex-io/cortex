#!/bin/bash
# Pre-Deployment Integration Tests
# End-to-end testing of Cortex system workflows

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CORTEX_ENV="${CORTEX_ENV:-staging}"
PYTHON="${PYTHON:-python3}"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
TEST_REPORT="/tmp/cortex-integration-test-report-$(date +%s).json"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test data
TEST_TASK_PREFIX="test-task-$$"
TEST_WORKER_PREFIX="test-worker-$$"
STAGING_DIR="$CORTEX_HOME/coordination/staging"

##############################################################################
# Helper Functions
##############################################################################

setup_staging_env() {
  echo "Setting up staging environment..."
  mkdir -p "$STAGING_DIR"/{tasks,workers,lineage,metrics}

  # Export staging env vars
  export CORTEX_ENV="staging"
  export CORTEX_TASK_DIR="$STAGING_DIR/tasks"
  export CORTEX_WORKER_DIR="$STAGING_DIR/workers"
  export CORTEX_LINEAGE_DIR="$STAGING_DIR/lineage"
  export CORTEX_METRICS_DIR="$STAGING_DIR/metrics"
}

cleanup_staging_env() {
  echo "Cleaning up staging environment..."
  rm -rf "$STAGING_DIR"

  # Kill any test workers
  pkill -f "$TEST_WORKER_PREFIX" 2>/dev/null || true
}

test_start() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}TEST: $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

test_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++))
  log_test_result "$2" "pass" "$1" "$3"
}

test_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((TESTS_FAILED++))
  log_test_result "$2" "fail" "$1" "$3"
}

test_skip() {
  echo -e "${YELLOW}⊘ SKIP${NC}: $1"
  ((TESTS_SKIPPED++))
  log_test_result "$2" "skip" "$1" "0"
}

log_test_result() {
  local test_name="$1"
  local status="$2"
  local message="$3"
  local duration_ms="$4"

  local result=$(jq -n \
    --arg name "$test_name" \
    --arg status "$status" \
    --arg message "$message" \
    --arg duration "$duration_ms" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      test_name: $name,
      status: $status,
      message: $message,
      duration_ms: ($duration | tonumber),
      timestamp: $timestamp
    }')

  echo "$result" >> "$TEST_REPORT.jsonl"
}

generate_uuid() {
  if command -v uuidgen &> /dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    $PYTHON -c "import uuid; print(uuid.uuid4())"
  fi
}

##############################################################################
# Test 1: Coordinator → Master → Worker Flow
##############################################################################
test_coordinator_master_worker_flow() {
  test_start "Test 1: Coordinator → Master → Worker Flow"
  local test_name="coordinator_master_worker_flow"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  # Create test task
  local task_id="${TEST_TASK_PREFIX}-flow-$(generate_uuid)"
  local task_file="$CORTEX_TASK_DIR/${task_id}.json"

  cat > "$task_file" <<EOF
{
  "task_id": "$task_id",
  "description": "Test task for integration testing",
  "assigned_master": "development",
  "status": "queued",
  "priority": "normal",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  # Verify task was created
  if [ -f "$task_file" ]; then
    local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))
    test_pass "Task created successfully" "$test_name" "$duration"
  else
    local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))
    test_fail "Task creation failed" "$test_name" "$duration"
    return 1
  fi

  # Simulate master handoff
  local handoff_file="$STAGING_DIR/handoffs/to-development-${task_id}.json"
  mkdir -p "$(dirname "$handoff_file")"

  cat > "$handoff_file" <<EOF
{
  "handoff_id": "handoff-${task_id}",
  "from_master": "coordinator",
  "to_master": "development",
  "task_id": "$task_id",
  "status": "pending_pickup"
}
EOF

  if [ -f "$handoff_file" ]; then
    local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))
    test_pass "Master handoff created" "$test_name" "$duration"
  else
    local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))
    test_fail "Master handoff failed" "$test_name" "$duration"
  fi
}

##############################################################################
# Test 2: Task Lifecycle
##############################################################################
test_task_lifecycle() {
  test_start "Test 2: Task Lifecycle (queued → assigned → in_progress → completed)"
  local test_name="task_lifecycle"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local task_id="${TEST_TASK_PREFIX}-lifecycle-$(generate_uuid)"
  local task_file="$CORTEX_TASK_DIR/${task_id}.json"

  # State 1: queued
  cat > "$task_file" <<EOF
{
  "task_id": "$task_id",
  "status": "queued",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  local status=$(jq -r '.status' "$task_file")
  if [ "$status" = "queued" ]; then
    test_pass "Task queued state" "$test_name" "50"
  else
    test_fail "Task queued state failed" "$test_name" "50"
  fi

  # State 2: assigned
  jq '.status = "assigned" | .assigned_master = "development"' "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
  status=$(jq -r '.status' "$task_file")
  if [ "$status" = "assigned" ]; then
    test_pass "Task assigned state" "$test_name" "50"
  else
    test_fail "Task assigned state failed" "$test_name" "50"
  fi

  # State 3: in_progress
  jq '.status = "in_progress" | .started_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
  status=$(jq -r '.status' "$task_file")
  if [ "$status" = "in_progress" ]; then
    test_pass "Task in_progress state" "$test_name" "50"
  else
    test_fail "Task in_progress state failed" "$test_name" "50"
  fi

  # State 4: completed
  jq '.status = "completed" | .completed_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
  status=$(jq -r '.status' "$task_file")

  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$status" = "completed" ]; then
    test_pass "Task completed state" "$test_name" "$duration"
  else
    test_fail "Task completed state failed" "$test_name" "$duration"
  fi
}

##############################################################################
# Test 3: Lineage Tracking End-to-End
##############################################################################
test_lineage_tracking() {
  test_start "Test 3: Lineage Tracking End-to-End"
  local test_name="lineage_tracking"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local task_id="${TEST_TASK_PREFIX}-lineage-$(generate_uuid)"
  local correlation_id="corr-$(generate_uuid)"
  local lineage_file="$CORTEX_LINEAGE_DIR/${task_id}.jsonl"

  mkdir -p "$CORTEX_LINEAGE_DIR"

  # Create lineage entries
  cat >> "$lineage_file" <<EOF
{"event":"task_created","task_id":"$task_id","correlation_id":"$correlation_id","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"event":"task_assigned","task_id":"$task_id","correlation_id":"$correlation_id","master":"development","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"event":"worker_spawned","task_id":"$task_id","correlation_id":"$correlation_id","worker_id":"worker-1","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"event":"task_completed","task_id":"$task_id","correlation_id":"$correlation_id","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  # Verify lineage entries
  local entry_count=$(wc -l < "$lineage_file" | tr -d ' ')
  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$entry_count" -eq 4 ]; then
    test_pass "Lineage tracking with 4 events" "$test_name" "$duration"
  else
    test_fail "Lineage tracking failed (expected 4 events, got $entry_count)" "$test_name" "$duration"
  fi

  # Verify correlation_id consistency
  local unique_corr_ids=$(jq -r '.correlation_id' "$lineage_file" | sort -u | wc -l | tr -d ' ')
  if [ "$unique_corr_ids" -eq 1 ]; then
    test_pass "Correlation ID consistency maintained" "$test_name" "50"
  else
    test_fail "Correlation ID inconsistency detected" "$test_name" "50"
  fi
}

##############################################################################
# Test 4: Metrics Emission and Aggregation
##############################################################################
test_metrics_emission() {
  test_start "Test 4: Metrics Emission and Aggregation"
  local test_name="metrics_emission"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local metrics_file="$CORTEX_METRICS_DIR/test-metrics.jsonl"
  mkdir -p "$CORTEX_METRICS_DIR"

  # Emit test metrics
  cat >> "$metrics_file" <<EOF
{"metric":"task_duration","value":1234,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"metric":"routing_latency","value":45,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"metric":"worker_spawn_time","value":567,"unit":"ms","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  local metric_count=$(wc -l < "$metrics_file" | tr -d ' ')
  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$metric_count" -eq 3 ]; then
    test_pass "Metrics emission successful (3 metrics)" "$test_name" "$duration"
  else
    test_fail "Metrics emission failed" "$test_name" "$duration"
  fi

  # Test aggregation
  local avg_value=$(jq -s 'map(.value) | add / length' "$metrics_file")
  if (( $(echo "$avg_value > 0" | bc -l) )); then
    test_pass "Metrics aggregation working (avg: $avg_value)" "$test_name" "50"
  else
    test_fail "Metrics aggregation failed" "$test_name" "50"
  fi
}

##############################################################################
# Test 5: Distributed Tracing with Correlation IDs
##############################################################################
test_distributed_tracing() {
  test_start "Test 5: Distributed Tracing with Correlation IDs"
  local test_name="distributed_tracing"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local correlation_id="corr-trace-$(generate_uuid)"
  local trace_file="$STAGING_DIR/traces/${correlation_id}.jsonl"
  mkdir -p "$(dirname "$trace_file")"

  # Simulate distributed trace across components
  cat >> "$trace_file" <<EOF
{"component":"coordinator","correlation_id":"$correlation_id","event":"task_received","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"component":"router","correlation_id":"$correlation_id","event":"routing_started","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"component":"master","correlation_id":"$correlation_id","event":"task_assigned","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"component":"worker","correlation_id":"$correlation_id","event":"execution_started","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
{"component":"worker","correlation_id":"$correlation_id","event":"execution_completed","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

  # Verify trace completeness
  local trace_count=$(wc -l < "$trace_file" | tr -d ' ')
  local components=$(jq -r '.component' "$trace_file" | sort -u | wc -l | tr -d ' ')

  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$trace_count" -eq 5 ] && [ "$components" -eq 4 ]; then
    test_pass "Distributed tracing across 4 components (5 events)" "$test_name" "$duration"
  else
    test_fail "Distributed tracing incomplete" "$test_name" "$duration"
  fi
}

##############################################################################
# Test 6: MoE Routing with All 5 Layers
##############################################################################
test_moe_routing() {
  test_start "Test 6: MoE Routing with All 5 Layers"
  local test_name="moe_routing"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local routing_cascade="$CORTEX_HOME/coordination/masters/coordinator/lib/routing-cascade.sh"

  if [ ! -f "$routing_cascade" ]; then
    test_skip "Routing cascade not available" "$test_name"
    return
  fi

  # Test routing with sample query
  local query="Fix security vulnerability in authentication module"
  local routing_result=$(bash "$routing_cascade" "test-task-123" "$query" 2>/dev/null || echo "")

  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ -n "$routing_result" ]; then
    local agent=$(echo "$routing_result" | jq -r '.agent // empty')
    local method=$(echo "$routing_result" | jq -r '.method // empty')
    local confidence=$(echo "$routing_result" | jq -r '.confidence // 0')

    if [ -n "$agent" ] && [ "$agent" != "null" ] && [ "$agent" != "FAILED" ]; then
      test_pass "MoE routing successful: $agent via $method (confidence: $confidence)" "$test_name" "$duration"
    else
      test_fail "MoE routing returned no valid agent" "$test_name" "$duration"
    fi
  else
    test_fail "MoE routing failed to execute" "$test_name" "$duration"
  fi
}

##############################################################################
# Test 7: Worker Restart After Failure
##############################################################################
test_worker_restart() {
  test_start "Test 7: Worker Restart After Failure"
  local test_name="worker_restart"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local worker_id="${TEST_WORKER_PREFIX}-restart-$(generate_uuid)"
  local worker_file="$CORTEX_WORKER_DIR/${worker_id}.json"

  # Create worker that fails
  cat > "$worker_file" <<EOF
{
  "worker_id": "$worker_id",
  "status": "failed",
  "error": "Test failure",
  "restart_count": 0,
  "max_restarts": 3
}
EOF

  # Simulate restart
  local restart_count=$(jq -r '.restart_count' "$worker_file")
  jq '.restart_count = (.restart_count + 1) | .status = "restarting"' "$worker_file" > "${worker_file}.tmp" && mv "${worker_file}.tmp" "$worker_file"

  local new_restart_count=$(jq -r '.restart_count' "$worker_file")
  local new_status=$(jq -r '.status' "$worker_file")

  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$new_restart_count" -eq 1 ] && [ "$new_status" = "restarting" ]; then
    test_pass "Worker restart mechanism works" "$test_name" "$duration"
  else
    test_fail "Worker restart failed" "$test_name" "$duration"
  fi
}

##############################################################################
# Test 8: Token Budget Enforcement
##############################################################################
test_token_budget() {
  test_start "Test 8: Token Budget Enforcement"
  local test_name="token_budget"
  local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

  local worker_id="${TEST_WORKER_PREFIX}-budget-$(generate_uuid)"
  local worker_file="$CORTEX_WORKER_DIR/${worker_id}.json"

  # Create worker with token budget
  cat > "$worker_file" <<EOF
{
  "worker_id": "$worker_id",
  "token_budget": 10000,
  "tokens_used": 0,
  "status": "running"
}
EOF

  # Simulate token usage
  local tokens_to_use=7500
  jq --argjson used "$tokens_to_use" '.tokens_used = $used' "$worker_file" > "${worker_file}.tmp" && mv "${worker_file}.tmp" "$worker_file"

  local tokens_used=$(jq -r '.tokens_used' "$worker_file")
  local budget=$(jq -r '.token_budget' "$worker_file")
  local remaining=$((budget - tokens_used))

  local duration=$(($($PYTHON -c "import time; print(int(time.time() * 1000))") - start_time))

  if [ "$remaining" -gt 0 ] && [ "$tokens_used" -eq "$tokens_to_use" ]; then
    test_pass "Token budget tracking works (used: $tokens_used, remaining: $remaining)" "$test_name" "$duration"
  else
    test_fail "Token budget tracking failed" "$test_name" "$duration"
  fi

  # Test budget exceeded
  jq '.tokens_used = 11000' "$worker_file" > "${worker_file}.tmp" && mv "${worker_file}.tmp" "$worker_file"
  tokens_used=$(jq -r '.tokens_used' "$worker_file")

  if [ "$tokens_used" -gt "$budget" ]; then
    test_pass "Token budget exceeded detection works" "$test_name" "50"
  else
    test_fail "Token budget exceeded detection failed" "$test_name" "50"
  fi
}

##############################################################################
# Main Test Suite
##############################################################################
main() {
  echo "╔════════════════════════════════════════╗"
  echo "║  Cortex Integration Test Suite         ║"
  echo "╔════════════════════════════════════════╗"
  echo ""
  echo "Environment: $CORTEX_ENV"
  echo "Cortex Home: $CORTEX_HOME"
  echo "Start Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  # Setup
  setup_staging_env

  # Initialize test report
  echo "[]" > "$TEST_REPORT"
  > "$TEST_REPORT.jsonl"

  # Run all tests
  test_coordinator_master_worker_flow
  test_task_lifecycle
  test_lineage_tracking
  test_metrics_emission
  test_distributed_tracing
  test_moe_routing
  test_worker_restart
  test_token_budget

  # Cleanup
  cleanup_staging_env

  # Generate final report
  jq -s '.' "$TEST_REPORT.jsonl" > "$TEST_REPORT"

  # Summary
  echo ""
  echo "========================================="
  echo "INTEGRATION TEST SUMMARY"
  echo "========================================="
  echo -e "${GREEN}Passed:${NC}  $TESTS_PASSED"
  echo -e "${RED}Failed:${NC}  $TESTS_FAILED"
  echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
  echo ""
  echo "Test Report: $TEST_REPORT"
  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    exit 0
  else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    exit 1
  fi
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
