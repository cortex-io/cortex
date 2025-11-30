#!/usr/bin/env bash
# scripts/test-tracing.sh
# Test distributed tracing functionality with example workflow

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(dirname "$SCRIPT_DIR")}"

source "$SCRIPT_DIR/lib/correlation.sh"
source "$SCRIPT_DIR/lib/traced-logging.sh"

# Colors
COLOR_RESET='\033[0m'
COLOR_BOLD='\033[1m'
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[0;33m'
COLOR_CYAN='\033[0;36m'
COLOR_RED='\033[0;31m'

echo -e "${COLOR_BOLD}Testing Distributed Tracing System${COLOR_RESET}\n"

# Test 1: Correlation ID Generation
echo -e "${COLOR_CYAN}Test 1: Correlation ID Generation${COLOR_RESET}"
test_correlation_id=$(generate_correlation_id "test-coordinator")
echo "  Generated: $test_correlation_id"

if [[ "$test_correlation_id" =~ ^corr-[0-9]+-[a-f0-9]+-test-coordinator$ ]]; then
    echo -e "  ${COLOR_GREEN}✓ Format valid${COLOR_RESET}"
else
    echo -e "  ${COLOR_RED}✗ Format invalid${COLOR_RESET}"
    exit 1
fi
echo ""

# Test 2: Span ID Generation
echo -e "${COLOR_CYAN}Test 2: Span ID Generation${COLOR_RESET}"
test_span_id=$(generate_span_id "test-operation")
echo "  Generated: $test_span_id"

if [[ "$test_span_id" =~ ^span-[0-9]+-[a-f0-9]+-test-operation$ ]]; then
    echo -e "  ${COLOR_GREEN}✓ Format valid${COLOR_RESET}"
else
    echo -e "  ${COLOR_RED}✗ Format invalid${COLOR_RESET}"
    exit 1
fi
echo ""

# Test 3: Simulate Multi-Step Workflow
echo -e "${COLOR_CYAN}Test 3: Simulating Multi-Step Workflow${COLOR_RESET}"

# Step 1: Coordinator receives task
echo -e "${COLOR_BLUE}Step 1: Coordinator receives task${COLOR_RESET}"
task_correlation_id=$(init_task_trace "task-test-001" "coordinator")
echo "  Task correlation ID: $task_correlation_id"

traced_log_info "Task created: task-test-001" \
    '{"task_type": "security_scan", "priority": "high"}'

start_traced_operation "task_routing"
sleep 0.2  # Simulate work
traced_log_info "Routing task to security master" \
    '{"target_master": "security", "confidence": 0.95}'
end_traced_operation "task_routing" "success"

echo ""

# Step 2: Handoff to security master
echo -e "${COLOR_BLUE}Step 2: Handoff to security master${COLOR_RESET}"
init_handoff_trace "coordinator" "security" "$task_correlation_id"
traced_log_handoff_event "coordinator" "security" "task-test-001" "created"

# Security master picks up task
set_trace_context "$task_correlation_id"
traced_log_info "Security master received task" \
    '{"task_id": "task-test-001", "master": "security"}'

echo ""

# Step 3: Security master spawns worker
echo -e "${COLOR_BLUE}Step 3: Security master spawns worker${COLOR_RESET}"
worker_correlation_id=$(init_worker_trace "worker-scan-001" "$task_correlation_id")
set_trace_context "$worker_correlation_id" "$task_correlation_id"

traced_log_worker_event "worker-scan-001" "spawned" \
    '{"worker_type": "scan-worker", "parent_task": "task-test-001"}'

echo ""

# Step 4: Worker executes
echo -e "${COLOR_BLUE}Step 4: Worker executes scan${COLOR_RESET}"
start_traced_operation "vulnerability_scan"

traced_log_info "Scanning repository" \
    '{"repo": "test/repo", "scan_type": "comprehensive"}'

sleep 0.3  # Simulate scan

traced_log_metric "vulnerabilities_found" "3" "count"
traced_log_metric "scan_duration" "0.3" "seconds"

end_traced_operation "vulnerability_scan" "success"

traced_log_worker_event "worker-scan-001" "completed" \
    '{"vulnerabilities": 3, "status": "success"}'

echo ""

# Step 5: Worker reports back
echo -e "${COLOR_BLUE}Step 5: Worker completion trace${COLOR_RESET}"
complete_trace_span "success" \
    '{"worker_id": "worker-scan-001", "vulnerabilities_found": 3}'

echo ""

# Step 6: Security master spawns fix worker
echo -e "${COLOR_BLUE}Step 6: Security master spawns fix worker${COLOR_RESET}"
set_trace_context "$task_correlation_id"  # Back to task context

fix_worker_correlation_id=$(init_worker_trace "worker-fix-001" "$task_correlation_id")
set_trace_context "$fix_worker_correlation_id" "$task_correlation_id"

traced_log_worker_event "worker-fix-001" "spawned" \
    '{"worker_type": "fix-worker", "parent_task": "task-test-001"}'

start_traced_operation "apply_fixes"
sleep 0.4  # Simulate fix application

traced_log_info "Applied fixes" \
    '{"fixes_applied": 3, "success": true}'

traced_log_metric "fix_success_rate" "100" "percentage"

end_traced_operation "apply_fixes" "success"

complete_trace_span "success" \
    '{"worker_id": "worker-fix-001", "fixes_applied": 3}'

echo ""

# Step 7: Task completion
echo -e "${COLOR_BLUE}Step 7: Task completion${COLOR_RESET}"
set_trace_context "$task_correlation_id"  # Back to task context

traced_log_task_event "task-test-001" "completed" \
    '{"status": "success", "vulnerabilities_fixed": 3}'

complete_trace_span "success" \
    '{"task_id": "task-test-001", "total_workers": 2, "outcome": "all_fixed"}'

echo ""

# Test 4: View trace
echo -e "${COLOR_CYAN}Test 4: Viewing Generated Trace${COLOR_RESET}"
echo "  Correlation ID: $task_correlation_id"

# Check trace file exists
trace_file="$CORTEX_HOME/coordination/traces/${task_correlation_id}.jsonl"
if [ -f "$trace_file" ]; then
    event_count=$(wc -l < "$trace_file" | tr -d ' ')
    echo -e "  ${COLOR_GREEN}✓ Trace file created${COLOR_RESET}"
    echo "  Event count: $event_count"
else
    echo -e "  ${COLOR_RED}✗ Trace file not found${COLOR_RESET}"
    exit 1
fi

echo ""

# Test 5: Verify trace summary
echo -e "${COLOR_CYAN}Test 5: Trace Summary${COLOR_RESET}"
summary=$(get_trace_summary "$task_correlation_id")
echo "$summary" | jq '{
    correlation_id,
    event_count,
    start_time,
    end_time
}'

echo ""

# Test 6: Query logs by correlation
echo -e "${COLOR_CYAN}Test 6: Query Logs by Correlation ID${COLOR_RESET}"
log_count=$(query_logs_by_correlation "$task_correlation_id" | jq 'length')
echo "  Logs found: $log_count"

if [ "$log_count" -gt 0 ]; then
    echo -e "  ${COLOR_GREEN}✓ Logs queryable by correlation ID${COLOR_RESET}"
else
    echo -e "  ${COLOR_YELLOW}⚠ No logs found (may be at different log level)${COLOR_RESET}"
fi

echo ""

# Test 7: List traces
echo -e "${COLOR_CYAN}Test 7: List Recent Traces${COLOR_RESET}"
recent_traces=$(list_traces 5)
trace_count=$(echo "$recent_traces" | jq -s 'length')
echo "  Recent traces: $trace_count"

if [ "$trace_count" -gt 0 ]; then
    echo -e "  ${COLOR_GREEN}✓ Trace listing works${COLOR_RESET}"
else
    echo -e "  ${COLOR_RED}✗ No traces found${COLOR_RESET}"
    exit 1
fi

echo ""

# Summary
echo -e "${COLOR_BOLD}Test Summary${COLOR_RESET}"
echo -e "${COLOR_GREEN}✓ All tests passed${COLOR_RESET}"
echo ""
echo "Generated test trace: $task_correlation_id"
echo ""
echo "View trace with:"
echo "  ./scripts/show-trace.sh $task_correlation_id"
echo "  ./scripts/show-trace.sh --verbose $task_correlation_id"
echo "  ./scripts/visualize-trace.sh --gantt $task_correlation_id"
echo "  ./scripts/visualize-trace.sh --tree $task_correlation_id"
echo ""
echo "Query logs with:"
echo "  source scripts/lib/traced-logging.sh"
echo "  query_logs_by_correlation \"$task_correlation_id\""
echo ""
