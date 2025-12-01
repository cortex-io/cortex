#!/usr/bin/env bash
# Test script for event-driven architecture
# Verifies event creation, validation, dispatch, and handling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

log_info() {
    echo -e "${YELLOW}→${NC} $*"
}

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_func="$2"

    log_info "Running: $test_name"

    if $test_func; then
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Event ID generation
test_event_id_generation() {
    local event_id
    event_id=$("$SCRIPT_DIR/lib/event-validator.sh" --generate-id)

    if [[ "$event_id" =~ ^evt_[0-9]{8}_[0-9]{6}_[a-z0-9]+$ ]]; then
        return 0
    else
        echo "Generated invalid event ID: $event_id" >&2
        return 1
    fi
}

# Test 2: Event validation
test_event_validation() {
    local test_event
    test_event=$(cat <<EOF
{
  "event_id": "evt_20251201_120000_test123",
  "event_type": "worker.completed",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S%z")",
  "source": "test-worker",
  "payload": {
    "worker_id": "test-worker-001",
    "status": "completed"
  }
}
EOF
)

    if "$SCRIPT_DIR/lib/event-validator.sh" "$test_event" >/dev/null 2>&1; then
        return 0
    else
        echo "Event validation failed" >&2
        return 1
    fi
}

# Test 3: Event creation
test_event_creation() {
    local event_json
    event_json=$("$SCRIPT_DIR/lib/event-logger.sh" --create \
        "worker.completed" \
        "test-source" \
        '{"test": "data"}' \
        "test-correlation-123" \
        "medium")

    if echo "$event_json" | jq -e '.event_id' >/dev/null 2>&1; then
        return 0
    else
        echo "Event creation failed" >&2
        return 1
    fi
}

# Test 4: Event logging
test_event_logging() {
    local event_json
    event_json=$("$SCRIPT_DIR/lib/event-logger.sh" --create \
        "worker.completed" \
        "test-worker-logging" \
        '{"worker_id": "test-001", "status": "completed"}' \
        "test-task-001" \
        "low")

    if echo "$event_json" | "$SCRIPT_DIR/lib/event-logger.sh"; then
        # Check if event was logged
        local events_dir="$PROJECT_ROOT/coordination/events"
        if [[ -f "$events_dir/worker-events.jsonl" ]]; then
            return 0
        else
            echo "Event log file not created" >&2
            return 1
        fi
    else
        echo "Event logging failed" >&2
        return 1
    fi
}

# Test 5: Event dispatcher
test_event_dispatcher() {
    # Create a test event
    local event_json
    event_json=$("$SCRIPT_DIR/lib/event-logger.sh" --create \
        "worker.heartbeat" \
        "test-worker-dispatcher" \
        '{"worker_id": "test-002", "heartbeat_time": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' \
        "test-dispatcher" \
        "low")

    # Log it
    echo "$event_json" | "$SCRIPT_DIR/lib/event-logger.sh" >/dev/null 2>&1

    # Run dispatcher
    if "$SCRIPT_DIR/event-dispatcher.sh" >/dev/null 2>&1; then
        # Check if queue is now empty
        local queue_dir="$PROJECT_ROOT/coordination/events/queue"
        local remaining_events
        remaining_events=$(find "$queue_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

        if [[ "$remaining_events" -eq 0 ]]; then
            return 0
        else
            echo "Queue not empty after dispatch: $remaining_events events remaining" >&2
            return 1
        fi
    else
        echo "Event dispatcher failed" >&2
        return 1
    fi
}

# Test 6: Worker complete handler
test_worker_complete_handler() {
    local event_file="$PROJECT_ROOT/coordination/events/queue/test-worker-complete.json"
    mkdir -p "$(dirname "$event_file")"

    cat > "$event_file" <<EOF
{
  "event_id": "evt_$(date +%Y%m%d_%H%M%S)_testworker",
  "event_type": "worker.completed",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S%z")",
  "source": "test-worker-handler",
  "correlation_id": "test-task-handler-001",
  "payload": {
    "worker_id": "test-worker-handler-001",
    "task_id": "test-task-handler-001",
    "status": "completed",
    "duration_ms": 5000,
    "tokens_used": 1500
  }
}
EOF

    if "$SCRIPT_DIR/handlers/on-worker-complete.sh" "$event_file" >/dev/null 2>&1; then
        # Check if metrics were recorded
        local metrics_file="$PROJECT_ROOT/coordination/metrics/worker-performance.jsonl"
        if [[ -f "$metrics_file" ]] && grep -q "test-worker-handler-001" "$metrics_file"; then
            return 0
        else
            echo "Worker metrics not recorded" >&2
            return 1
        fi
    else
        echo "Worker complete handler failed" >&2
        return 1
    fi
}

# Test 7: Task failure handler
test_task_failure_handler() {
    local event_file="$PROJECT_ROOT/coordination/events/queue/test-task-failure.json"
    mkdir -p "$(dirname "$event_file")"

    cat > "$event_file" <<EOF
{
  "event_id": "evt_$(date +%Y%m%d_%H%M%S)_testfail",
  "event_type": "task.failed",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S%z")",
  "source": "test-task-handler",
  "correlation_id": "test-task-failure-001",
  "payload": {
    "task_id": "test-task-failure-001",
    "worker_id": "test-worker-003",
    "error_type": "timeout",
    "error_message": "Task exceeded timeout threshold"
  }
}
EOF

    if "$SCRIPT_DIR/handlers/on-task-failure.sh" "$event_file" >/dev/null 2>&1; then
        # Check if failure was recorded
        local patterns_file="$PROJECT_ROOT/coordination/patterns/failure-patterns.jsonl"
        if [[ -f "$patterns_file" ]] && grep -q "test-task-failure-001" "$patterns_file"; then
            return 0
        else
            echo "Failure pattern not recorded" >&2
            return 1
        fi
    else
        echo "Task failure handler failed" >&2
        return 1
    fi
}

# Main test execution
main() {
    echo "========================================="
    echo "  Cortex Event-Driven Architecture Test"
    echo "========================================="
    echo ""

    # Run tests
    run_test "Event ID Generation" test_event_id_generation
    run_test "Event Validation" test_event_validation
    run_test "Event Creation" test_event_creation
    run_test "Event Logging" test_event_logging
    run_test "Event Dispatcher" test_event_dispatcher
    run_test "Worker Complete Handler" test_worker_complete_handler
    run_test "Task Failure Handler" test_task_failure_handler

    echo ""
    echo "========================================="
    echo "  Test Results"
    echo "========================================="
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        return 0
    else
        log_error "$TESTS_FAILED test(s) failed"
        return 1
    fi
}

main "$@"
