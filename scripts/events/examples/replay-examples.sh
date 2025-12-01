#!/usr/bin/env bash
# Event Replay Examples - Real-world usage scenarios

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPLAY_SCRIPT="$SCRIPT_DIR/../event-replay.sh"

echo "Event Replay Examples"
echo "====================="
echo ""

# Example 1: Debug a specific failed event
example_debug_failed_event() {
    echo "Example 1: Debug a specific failed event"
    echo "-----------------------------------------"
    echo ""
    echo "# Step 1: Find the failed event ID from logs"
    echo 'grep "status.*failed" coordination/events/worker-events.jsonl | jq -r ".event_id" | tail -1'
    echo ""
    echo "# Step 2: Replay the event with verbose output"
    echo "./scripts/events/event-replay.sh --event-id evt_20251201_093827_abc123 --verbose"
    echo ""
    echo "# Step 3: Fix the handler if needed"
    echo "vim scripts/events/handlers/on-worker-complete.sh"
    echo ""
    echo "# Step 4: Replay again to verify fix"
    echo "./scripts/events/event-replay.sh --event-id evt_20251201_093827_abc123"
    echo ""
}

# Example 2: Test handler modifications
example_test_handler() {
    echo "Example 2: Test handler modifications"
    echo "-------------------------------------"
    echo ""
    echo "# After modifying a handler, test with historical events"
    echo ""
    echo "# Step 1: Dry-run to see what will be replayed"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --type 'worker.completed' \\"
    echo "    --date 2025-12-01 \\"
    echo "    --dry-run"
    echo ""
    echo "# Step 2: Run for real with verbose output"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --type 'worker.completed' \\"
    echo "    --date 2025-12-01 \\"
    echo "    --verbose"
    echo ""
    echo "# Step 3: Verify the results"
    echo "tail -f coordination/events/worker-events.jsonl | jq '.'"
    echo ""
}

# Example 3: Investigate production incident
example_investigate_incident() {
    echo "Example 3: Investigate production incident"
    echo "------------------------------------------"
    echo ""
    echo "# Replay all high-priority events from incident day"
    echo ""
    echo "# Step 1: Preview events"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --date 2025-12-01 \\"
    echo "    --priority high \\"
    echo "    --dry-run \\"
    echo "    --verbose"
    echo ""
    echo "# Step 2: Replay and log output"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --date 2025-12-01 \\"
    echo "    --priority high \\"
    echo "    --verbose \\"
    echo "    2>&1 | tee incident-replay-\$(date +%Y%m%d-%H%M%S).log"
    echo ""
    echo "# Step 3: Analyze failures"
    echo "grep ERROR incident-replay-*.log"
    echo ""
}

# Example 4: Recover from handler failure
example_recover_handler_failure() {
    echo "Example 4: Recover from handler failure"
    echo "---------------------------------------"
    echo ""
    echo "# If events failed to process, re-queue them"
    echo ""
    echo "# Step 1: Find failed events in archive"
    echo "ls -la coordination/events/archive/failed/"
    echo ""
    echo "# Step 2: Re-queue all failed events"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --date 2025-12-01 \\"
    echo "    --queue"
    echo ""
    echo "# Step 3: Process the queue"
    echo "./scripts/events/event-dispatcher.sh"
    echo ""
}

# Example 5: Audit security events
example_audit_security() {
    echo "Example 5: Audit security events"
    echo "--------------------------------"
    echo ""
    echo "# Replay all security events to verify handling"
    echo ""
    echo "# Step 1: Preview security events"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --type 'security.*' \\"
    echo "    --date 2025-12-01 \\"
    echo "    --dry-run \\"
    echo "    --verbose"
    echo ""
    echo "# Step 2: Replay critical security events"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --type 'security.*' \\"
    echo "    --priority critical \\"
    echo "    --date 2025-12-01 \\"
    echo "    --verbose"
    echo ""
}

# Example 6: Trace task execution
example_trace_task() {
    echo "Example 6: Trace task execution"
    echo "-------------------------------"
    echo ""
    echo "# Replay all events for a specific task"
    echo ""
    echo "# Step 1: Find task correlation ID"
    echo 'grep "task-security-scan-001" coordination/events/*.jsonl | jq -r ".correlation_id" | head -1'
    echo ""
    echo "# Step 2: Replay all events for this task"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --correlation task-security-scan-001 \\"
    echo "    --date 2025-12-01 \\"
    echo "    --verbose"
    echo ""
}

# Example 7: Batch replay multiple dates
example_batch_replay() {
    echo "Example 7: Batch replay multiple dates"
    echo "--------------------------------------"
    echo ""
    echo "# Replay events from multiple dates"
    echo ""
    cat << 'EOF'
#!/bin/bash
for date in 2025-11-28 2025-11-29 2025-11-30 2025-12-01; do
    echo "Replaying events from: $date"
    ./scripts/events/event-replay.sh \
        --date "$date" \
        --type "worker.failed" \
        --verbose
done
EOF
    echo ""
}

# Example 8: Custom filtering
example_custom_filter() {
    echo "Example 8: Custom filtering with multiple criteria"
    echo "------------------------------------------------"
    echo ""
    echo "# Replay high-priority worker failures from specific source"
    echo ""
    echo "./scripts/events/event-replay.sh \\"
    echo "    --type 'worker.failed' \\"
    echo "    --priority high \\"
    echo "    --source 'worker-implementation-.*' \\"
    echo "    --date 2025-12-01 \\"
    echo "    --verbose"
    echo ""
}

# Example 9: Performance testing
example_performance_test() {
    echo "Example 9: Performance testing with event replay"
    echo "-----------------------------------------------"
    echo ""
    echo "# Test handler performance with historical events"
    echo ""
    echo "# Step 1: Replay with timing"
    echo "time ./scripts/events/event-replay.sh \\"
    echo "    --date 2025-12-01 \\"
    echo "    --type 'worker.*'"
    echo ""
    echo "# Step 2: Analyze timing for each event"
    echo "./scripts/events/event-replay.sh \\"
    echo "    --date 2025-12-01 \\"
    echo "    --verbose \\"
    echo "    2>&1 | grep 'Handler executed' | wc -l"
    echo ""
}

# Example 10: Integration testing
example_integration_test() {
    echo "Example 10: Integration testing"
    echo "-------------------------------"
    echo ""
    echo "# Test complete workflow by replaying event chain"
    echo ""
    cat << 'EOF'
#!/bin/bash
# Create test events
./scripts/events/lib/event-logger.sh --create \
    "worker.started" "test-worker" '{"test": true}' "test-123" "low"

./scripts/events/lib/event-logger.sh --create \
    "worker.completed" "test-worker" '{"result": "success"}' "test-123" "low"

# Process them
./scripts/events/event-dispatcher.sh

# Replay to verify
./scripts/events/event-replay.sh \
    --correlation test-123 \
    --date $(date +%Y-%m-%d) \
    --verbose
EOF
    echo ""
}

# Main menu
main() {
    echo "Choose an example to display:"
    echo ""
    echo "1. Debug a specific failed event"
    echo "2. Test handler modifications"
    echo "3. Investigate production incident"
    echo "4. Recover from handler failure"
    echo "5. Audit security events"
    echo "6. Trace task execution"
    echo "7. Batch replay multiple dates"
    echo "8. Custom filtering"
    echo "9. Performance testing"
    echo "10. Integration testing"
    echo "all. Show all examples"
    echo ""

    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <example_number|all>"
        echo ""
        echo "Example: $0 1"
        echo "         $0 all"
        exit 1
    fi

    case "$1" in
        1) example_debug_failed_event ;;
        2) example_test_handler ;;
        3) example_investigate_incident ;;
        4) example_recover_handler_failure ;;
        5) example_audit_security ;;
        6) example_trace_task ;;
        7) example_batch_replay ;;
        8) example_custom_filter ;;
        9) example_performance_test ;;
        10) example_integration_test ;;
        all)
            example_debug_failed_event
            example_test_handler
            example_investigate_incident
            example_recover_handler_failure
            example_audit_security
            example_trace_task
            example_batch_replay
            example_custom_filter
            example_performance_test
            example_integration_test
            ;;
        *)
            echo "Invalid example number: $1"
            exit 1
            ;;
    esac
}

# Run main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
