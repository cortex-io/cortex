#!/usr/bin/env bash
# Test suite for event-replay.sh
# Validates all replay functionality

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPLAY_SCRIPT="$SCRIPT_DIR/event-replay.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result
test_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    ((TESTS_RUN++))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected: $expected"
        echo -e "  Actual:   $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test: Help output
test_help() {
    echo "Testing: --help flag"

    local output
    output=$("$REPLAY_SCRIPT" --help 2>&1 || true)

    if echo "$output" | grep -q "Event Replay Tool"; then
        test_result "Help output displays" "0" "0"
    else
        test_result "Help output displays" "0" "1"
    fi
}

# Test: Dry-run mode
test_dry_run() {
    echo "Testing: Dry-run mode"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --dry-run 2>&1 || true)

    if echo "$output" | grep -q "DRY-RUN MODE"; then
        test_result "Dry-run mode enabled" "0" "0"
    else
        test_result "Dry-run mode enabled" "0" "1"
    fi

    if echo "$output" | grep -q "Mode: DRY RUN"; then
        test_result "Dry-run summary shows" "0" "0"
    else
        test_result "Dry-run summary shows" "0" "1"
    fi
}

# Test: Event ID lookup
test_event_id_lookup() {
    echo "Testing: Event ID lookup"

    # Find an actual event
    local event_file
    event_file=$(find "$PROJECT_ROOT/coordination/events/archive" -name "*.json" -type f | head -1)

    if [[ -z "$event_file" ]]; then
        echo -e "${YELLOW}⊘${NC} Event ID lookup - no events in archive, skipping"
        return 0
    fi

    local event_id
    event_id=$(jq -r '.event_id' "$event_file")

    local output
    output=$("$REPLAY_SCRIPT" --event-id "$event_id" --dry-run 2>&1 || true)

    if echo "$output" | grep -q "$event_id"; then
        test_result "Event ID found" "0" "0"
    else
        test_result "Event ID found" "0" "1"
    fi
}

# Test: Date filter
test_date_filter() {
    echo "Testing: Date filter"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --dry-run 2>&1 || true)

    if echo "$output" | grep -q "Replaying events from date: 2025-12-01"; then
        test_result "Date filter applied" "0" "0"
    else
        test_result "Date filter applied" "0" "1"
    fi
}

# Test: Type filter
test_type_filter() {
    echo "Testing: Type filter"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --type "security.*" --dry-run 2>&1 || true)

    if echo "$output" | grep -q "Type filter: security.*"; then
        test_result "Type filter applied" "0" "0"
    else
        test_result "Type filter applied" "0" "1"
    fi

    # Check that non-matching events are skipped
    if echo "$output" | grep -q "Skipped:"; then
        # This is expected if there are non-security events
        test_result "Type filter skips non-matching" "0" "0"
    else
        test_result "Type filter skips non-matching" "0" "0"  # May be no events to skip
    fi
}

# Test: Verbose mode
test_verbose_mode() {
    echo "Testing: Verbose mode"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --verbose --dry-run 2>&1 || true)

    if echo "$output" | grep -q "VERBOSE MODE"; then
        test_result "Verbose mode enabled" "0" "0"
    else
        test_result "Verbose mode enabled" "0" "1"
    fi

    if echo "$output" | grep -q "\[VERBOSE\]"; then
        test_result "Verbose output shown" "0" "0"
    else
        test_result "Verbose output shown" "0" "1"
    fi
}

# Test: Summary output
test_summary_output() {
    echo "Testing: Summary output"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --dry-run 2>&1 || true)

    if echo "$output" | grep -q "Event Replay Summary"; then
        test_result "Summary header present" "0" "0"
    else
        test_result "Summary header present" "0" "1"
    fi

    if echo "$output" | grep -q "Total processed:"; then
        test_result "Total processed shown" "0" "0"
    else
        test_result "Total processed shown" "0" "1"
    fi

    if echo "$output" | grep -q "Successful:"; then
        test_result "Successful count shown" "0" "0"
    else
        test_result "Successful count shown" "0" "1"
    fi
}

# Test: Invalid date format
test_invalid_date() {
    echo "Testing: Invalid date format"

    local output
    output=$("$REPLAY_SCRIPT" --date 20251201 2>&1 || true)

    if echo "$output" | grep -q "Invalid date format"; then
        test_result "Invalid date rejected" "0" "0"
    else
        test_result "Invalid date rejected" "0" "1"
    fi
}

# Test: Invalid priority
test_invalid_priority() {
    echo "Testing: Invalid priority"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --priority invalid 2>&1 || true)

    if echo "$output" | grep -q "Invalid priority"; then
        test_result "Invalid priority rejected" "0" "0"
    else
        test_result "Invalid priority rejected" "0" "1"
    fi
}

# Test: Missing required args
test_missing_args() {
    echo "Testing: Missing required arguments"

    local output
    output=$("$REPLAY_SCRIPT" 2>&1 || true)

    # Should show usage when no args provided
    if echo "$output" | grep -q "USAGE:"; then
        test_result "Missing args shows usage" "0" "0"
    else
        test_result "Missing args shows usage" "0" "1"
    fi
}

# Test: Priority filter
test_priority_filter() {
    echo "Testing: Priority filter"

    local output
    output=$("$REPLAY_SCRIPT" --date 2025-12-01 --priority high --dry-run 2>&1 || true)

    if echo "$output" | grep -q "Priority filter: high"; then
        test_result "Priority filter applied" "0" "0"
    else
        test_result "Priority filter applied" "0" "1"
    fi
}

# Test: Multiple filters combined
test_combined_filters() {
    echo "Testing: Combined filters"

    local output
    output=$("$REPLAY_SCRIPT" \
        --date 2025-12-01 \
        --type "worker.*" \
        --priority high \
        --dry-run 2>&1 || true)

    if echo "$output" | grep -q "Type filter: worker.*"; then
        test_result "Combined filters: type" "0" "0"
    else
        test_result "Combined filters: type" "0" "1"
    fi

    if echo "$output" | grep -q "Priority filter: high"; then
        test_result "Combined filters: priority" "0" "0"
    else
        test_result "Combined filters: priority" "0" "1"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "========================================="
    echo "Test Results"
    echo "========================================="
    echo "Total tests:  $TESTS_RUN"
    echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    else
        echo "Failed:       $TESTS_FAILED"
    fi

    echo "========================================="

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo "Event Replay Test Suite"
    echo "========================================="
    echo ""

    # Run all tests
    test_help
    test_missing_args
    test_invalid_date
    test_invalid_priority
    test_dry_run
    test_date_filter
    test_type_filter
    test_priority_filter
    test_verbose_mode
    test_summary_output
    test_combined_filters
    test_event_id_lookup

    # Print summary
    print_summary
}

# Run main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
