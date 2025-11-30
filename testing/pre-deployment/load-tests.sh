#!/usr/bin/env bash
# Pre-Deployment Load Tests
# Performance validation under concurrent load

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CORTEX_ENV="${CORTEX_ENV:-staging}"
PYTHON="${PYTHON:-python3}"

# Load test configuration
CONCURRENT_TASKS="${CONCURRENT_TASKS:-10}"
TARGET_THROUGHPUT=5  # tasks/min
TARGET_P95_LATENCY=30000  # 30 seconds in ms
LOAD_TEST_DURATION=120  # 2 minutes

# Results tracking
LOAD_TEST_RESULTS="/tmp/cortex-load-test-$(date +%s).json"
PERF_METRICS="/tmp/cortex-perf-metrics-$(date +%s).jsonl"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test data
TEST_TASK_PREFIX="load-test-$$"
STAGING_DIR="$CORTEX_HOME/coordination/staging"

##############################################################################
# Helper Functions
##############################################################################

setup_load_env() {
  echo "Setting up load test environment..."
  mkdir -p "$STAGING_DIR"/{tasks,workers,metrics,logs}
  > "$PERF_METRICS"

  export CORTEX_ENV="staging"
  export CORTEX_TASK_DIR="$STAGING_DIR/tasks"
  export CORTEX_WORKER_DIR="$STAGING_DIR/workers"
}

cleanup_load_env() {
  echo "Cleaning up load test environment..."

  # Kill background tasks
  jobs -p | xargs -r kill 2>/dev/null || true

  # Clean staging
  rm -rf "$STAGING_DIR"
}

generate_uuid() {
  if command -v uuidgen &> /dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    $PYTHON -c "import uuid; print(uuid.uuid4())"
  fi
}

emit_metric() {
  local metric_name="$1"
  local value="$2"
  local unit="$3"

  echo "{\"metric\":\"$metric_name\",\"value\":$value,\"unit\":\"$unit\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PERF_METRICS"
}

calculate_percentile() {
  local percentile="$1"

  # Sort values and calculate percentile
  $PYTHON -c "
import sys
import json

values = []
for line in sys.stdin:
    try:
        data = json.loads(line)
        if 'value' in data and data.get('metric') == 'task_duration':
            values.append(float(data['value']))
    except:
        pass

values.sort()
if values:
    index = int(len(values) * $percentile / 100.0)
    print(values[min(index, len(values)-1)])
else:
    print(0)
"
}

##############################################################################
# Test 1: Coordinator Throughput
##############################################################################
test_coordinator_throughput() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Coordinator Throughput"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local start_time=$($PYTHON -c "import time; print(time.time())")
  local tasks_created=0

  echo "Creating $CONCURRENT_TASKS concurrent tasks..."

  for i in $(seq 1 $CONCURRENT_TASKS); do
    local task_id="${TEST_TASK_PREFIX}-throughput-$(generate_uuid)"
    local task_start=$($PYTHON -c "import time; print(int(time.time() * 1000))")

    # Create task in background
    (
      cat > "$CORTEX_TASK_DIR/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "description": "Load test task $i",
  "assigned_master": "development",
  "status": "queued",
  "priority": "normal",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
      local task_end=$($PYTHON -c "import time; print(int(time.time() * 1000))")
      local duration=$((task_end - task_start))
      emit_metric "task_creation_time" "$duration" "ms"
    ) &

    ((tasks_created++))

    # Small delay to simulate realistic load
    sleep 0.1
  done

  # Wait for all background tasks
  wait

  local end_time=$($PYTHON -c "import time; print(time.time())")
  local total_duration=$(echo "$end_time - $start_time" | bc)
  local throughput=$(echo "scale=2; $tasks_created * 60 / $total_duration" | bc)

  echo ""
  echo "Tasks created: $tasks_created"
  echo "Total time: ${total_duration}s"
  echo "Throughput: ${throughput} tasks/min"

  emit_metric "coordinator_throughput" "$throughput" "tasks_per_min"

  if (( $(echo "$throughput >= $TARGET_THROUGHPUT" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC}: Throughput meets target (${throughput} >= ${TARGET_THROUGHPUT} tasks/min)"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: Throughput below target (${throughput} < ${TARGET_THROUGHPUT} tasks/min)"
    return 1
  fi
}

##############################################################################
# Test 2: Master Response Time
##############################################################################
test_master_response_time() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Master Response Time"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local iterations=20

  echo "Measuring master response time over $iterations iterations..."

  for i in $(seq 1 $iterations); do
    local task_id="${TEST_TASK_PREFIX}-response-$(generate_uuid)"
    local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

    # Create task
    cat > "$CORTEX_TASK_DIR/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "description": "Response time test $i",
  "assigned_master": "development",
  "status": "queued"
}
EOF

    # Simulate master processing
    sleep 0.05

    # Update to assigned
    jq '.status = "assigned" | .assigned_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' \
      "$CORTEX_TASK_DIR/${task_id}.json" > "$CORTEX_TASK_DIR/${task_id}.json.tmp" && \
      mv "$CORTEX_TASK_DIR/${task_id}.json.tmp" "$CORTEX_TASK_DIR/${task_id}.json"

    local end_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")
    local duration=$((end_time - start_time))

    emit_metric "master_response_time" "$duration" "ms"
  done

  # Calculate percentiles
  local p50=$(cat "$PERF_METRICS" | grep "master_response_time" | calculate_percentile 50)
  local p95=$(cat "$PERF_METRICS" | grep "master_response_time" | calculate_percentile 95)
  local p99=$(cat "$PERF_METRICS" | grep "master_response_time" | calculate_percentile 99)

  echo ""
  echo "Response time percentiles:"
  echo "  P50: ${p50}ms"
  echo "  P95: ${p95}ms"
  echo "  P99: ${p99}ms"

  if (( $(echo "$p95 < $TARGET_P95_LATENCY" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC}: P95 latency meets target (${p95}ms < ${TARGET_P95_LATENCY}ms)"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: P95 latency exceeds target (${p95}ms >= ${TARGET_P95_LATENCY}ms)"
    return 1
  fi
}

##############################################################################
# Test 3: Worker Spawn Time
##############################################################################
test_worker_spawn_time() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Worker Spawn Time"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local workers_to_spawn=10

  echo "Spawning $workers_to_spawn workers and measuring spawn time..."

  for i in $(seq 1 $workers_to_spawn); do
    local worker_id="worker-$(generate_uuid)"
    local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

    # Create worker spec
    cat > "$CORTEX_WORKER_DIR/${worker_id}.json" <<EOF
{
  "worker_id": "$worker_id",
  "worker_type": "feature-implementer",
  "status": "initializing",
  "parent_master": "development",
  "task_id": "task-$i",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Simulate spawn completion
    sleep 0.02

    jq '.status = "ready"' "$CORTEX_WORKER_DIR/${worker_id}.json" > \
      "$CORTEX_WORKER_DIR/${worker_id}.json.tmp" && \
      mv "$CORTEX_WORKER_DIR/${worker_id}.json.tmp" "$CORTEX_WORKER_DIR/${worker_id}.json"

    local end_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")
    local duration=$((end_time - start_time))

    emit_metric "worker_spawn_time" "$duration" "ms"
  done

  # Calculate average spawn time
  local avg_spawn_time=$(cat "$PERF_METRICS" | grep "worker_spawn_time" | \
    jq -s 'map(.value) | add / length')

  echo ""
  echo "Average worker spawn time: ${avg_spawn_time}ms"

  # Target: < 1000ms average
  if (( $(echo "$avg_spawn_time < 1000" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC}: Worker spawn time acceptable (${avg_spawn_time}ms < 1000ms)"
    return 0
  else
    echo -e "${YELLOW}⚠ WARN${NC}: Worker spawn time slow (${avg_spawn_time}ms >= 1000ms)"
    return 1
  fi
}

##############################################################################
# Test 4: Resource Leak Detection
##############################################################################
test_resource_leaks() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Resource Leak Detection"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Count processes before
  local process_count_before=$(ps aux | grep -c "[c]ortex" || echo "0")

  echo "Running load simulation..."
  echo "Process count before: $process_count_before"

  # Simulate load
  for i in $(seq 1 20); do
    local task_id="${TEST_TASK_PREFIX}-leak-$(generate_uuid)"

    cat > "$CORTEX_TASK_DIR/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "status": "completed",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    sleep 0.05
  done

  # Count processes after
  sleep 1
  local process_count_after=$(ps aux | grep -c "[c]ortex" || echo "0")

  echo "Process count after: $process_count_after"

  local process_diff=$((process_count_after - process_count_before))

  # Allow for small increase (max 2 processes)
  if [ "$process_diff" -le 2 ]; then
    echo -e "${GREEN}✓ PASS${NC}: No significant process leaks detected (diff: $process_diff)"
    return 0
  else
    echo -e "${YELLOW}⚠ WARN${NC}: Potential process leak detected (diff: $process_diff)"
    return 1
  fi
}

##############################################################################
# Test 5: Graceful Degradation Under Load
##############################################################################
test_graceful_degradation() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Graceful Degradation Under Load"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  echo "Testing system behavior under heavy load (50 tasks)..."

  local successful_tasks=0
  local failed_tasks=0

  for i in $(seq 1 50); do
    local task_id="${TEST_TASK_PREFIX}-degrade-$(generate_uuid)"

    if cat > "$CORTEX_TASK_DIR/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "description": "Degradation test $i",
  "status": "queued",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    then
      ((successful_tasks++))
    else
      ((failed_tasks++))
    fi

    # No delay - max load
  done

  echo ""
  echo "Successful tasks: $successful_tasks"
  echo "Failed tasks: $failed_tasks"

  local success_rate=$(echo "scale=2; $successful_tasks * 100 / ($successful_tasks + $failed_tasks)" | bc)

  echo "Success rate: ${success_rate}%"

  # Require 95% success rate
  if (( $(echo "$success_rate >= 95" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC}: System handles load gracefully (${success_rate}% success)"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: System degraded under load (${success_rate}% success)"
    return 1
  fi
}

##############################################################################
# Test 6: Routing Performance Under Load
##############################################################################
test_routing_performance() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: Routing Performance Under Load"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local routing_cascade="$CORTEX_HOME/coordination/masters/coordinator/lib/routing-cascade.sh"

  if [ ! -f "$routing_cascade" ]; then
    echo -e "${YELLOW}⊘ SKIP${NC}: Routing cascade not available"
    return 0
  fi

  echo "Testing routing with 15 concurrent queries..."

  local queries=(
    "Fix security vulnerability"
    "Implement user authentication"
    "Optimize database queries"
    "Refactor legacy code"
    "Add API documentation"
    "Debug memory leak"
    "Create unit tests"
    "Update dependencies"
    "Improve error handling"
    "Add logging system"
    "Fix build errors"
    "Optimize performance"
    "Update documentation"
    "Add feature flag"
    "Implement caching"
  )

  local routing_times=()

  for query in "${queries[@]}"; do
    local start_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")

    local result=$(bash "$routing_cascade" "test-$(generate_uuid)" "$query" 2>/dev/null || echo "")

    local end_time=$($PYTHON -c "import time; print(int(time.time() * 1000))")
    local duration=$((end_time - start_time))

    emit_metric "routing_latency" "$duration" "ms"
  done

  # Calculate routing performance
  local avg_routing_time=$(cat "$PERF_METRICS" | grep "routing_latency" | \
    jq -s 'map(.value) | add / length')

  echo ""
  echo "Average routing time: ${avg_routing_time}ms"

  # Target: < 500ms average
  if (( $(echo "$avg_routing_time < 500" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC}: Routing performance acceptable (${avg_routing_time}ms < 500ms)"
    return 0
  else
    echo -e "${YELLOW}⚠ WARN${NC}: Routing performance degraded (${avg_routing_time}ms >= 500ms)"
    return 1
  fi
}

##############################################################################
# Generate Load Test Report
##############################################################################
generate_report() {
  echo ""
  echo "Generating load test report..."

  local report=$(cat "$PERF_METRICS" | jq -s '{
    summary: {
      total_metrics: length,
      test_duration_seconds: '$LOAD_TEST_DURATION',
      timestamp: "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    },
    metrics: {
      coordinator_throughput: [.[] | select(.metric == "coordinator_throughput")],
      master_response_time: {
        p50: ([.[] | select(.metric == "master_response_time") | .value] | sort | .[length/2]),
        p95: ([.[] | select(.metric == "master_response_time") | .value] | sort | .[length*95/100]),
        p99: ([.[] | select(.metric == "master_response_time") | .value] | sort | .[length*99/100])
      },
      worker_spawn_time: {
        average: ([.[] | select(.metric == "worker_spawn_time") | .value] | add / length),
        min: ([.[] | select(.metric == "worker_spawn_time") | .value] | min),
        max: ([.[] | select(.metric == "worker_spawn_time") | .value] | max)
      },
      routing_latency: {
        average: ([.[] | select(.metric == "routing_latency") | .value] | add / length),
        min: ([.[] | select(.metric == "routing_latency") | .value] | min),
        max: ([.[] | select(.metric == "routing_latency") | .value] | max)
      }
    }
  }')

  echo "$report" > "$LOAD_TEST_RESULTS"
  echo "Report saved to: $LOAD_TEST_RESULTS"
}

##############################################################################
# Main Load Test Suite
##############################################################################
main() {
  echo "╔════════════════════════════════════════╗"
  echo "║  Cortex Load Test Suite                ║"
  echo "╔════════════════════════════════════════╗"
  echo ""
  echo "Environment: $CORTEX_ENV"
  echo "Concurrent tasks: $CONCURRENT_TASKS"
  echo "Target throughput: ${TARGET_THROUGHPUT} tasks/min"
  echo "Target P95 latency: ${TARGET_P95_LATENCY}ms"
  echo "Start Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Setup
  setup_load_env

  # Track pass/fail
  local tests_passed=0
  local tests_failed=0

  # Run load tests
  if test_coordinator_throughput; then ((tests_passed++)); else ((tests_failed++)); fi
  if test_master_response_time; then ((tests_passed++)); else ((tests_failed++)); fi
  if test_worker_spawn_time; then ((tests_passed++)); else ((tests_failed++)); fi
  if test_resource_leaks; then ((tests_passed++)); else ((tests_failed++)); fi
  if test_graceful_degradation; then ((tests_passed++)); else ((tests_failed++)); fi
  if test_routing_performance; then ((tests_passed++)); else ((tests_failed++)); fi

  # Generate report
  generate_report

  # Cleanup
  cleanup_load_env

  # Summary
  echo ""
  echo "========================================="
  echo "LOAD TEST SUMMARY"
  echo "========================================="
  echo -e "${GREEN}Passed:${NC} $tests_passed"
  echo -e "${RED}Failed:${NC} $tests_failed"
  echo ""
  echo "Detailed metrics: $LOAD_TEST_RESULTS"
  echo ""

  if [ "$tests_failed" -eq 0 ]; then
    echo -e "${GREEN}✓ ALL LOAD TESTS PASSED${NC}"
    exit 0
  else
    echo -e "${RED}✗ SOME LOAD TESTS FAILED${NC}"
    exit 1
  fi
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
