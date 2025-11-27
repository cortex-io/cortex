#!/bin/bash
# Example lineage entry generator for testing
# Creates a complete task lifecycle with all event types
#
# Usage: ./example-lineage-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Load lineage library
source "$CORTEX_HOME/scripts/lib/lineage.sh"

echo "Generating example task lineage for testing..."

# Simulate a complete task lifecycle
TASK_ID="task-example-security-scan-001"
SESSION_ID="session-example-001"
export CORTEX_SESSION_ID="$SESSION_ID"
export CORTEX_TRACE_ID="trace-example-001"
export CORTEX_PRINCIPAL="system"

echo "Step 1: Task Creation"
log_task_created "$TASK_ID" "user-ryan" '{"priority":"high","type":"security","source":"manual_request"}'
sleep 1

echo "Step 2: Task Assignment to Security Master"
log_task_assigned "$TASK_ID" "coordinator-master" "security-master" "high"
sleep 1

echo "Step 3: Security Master Starts Task"
log_task_started "$TASK_ID" "security-master" '{"master_type":"security","session_start":true}'
sleep 1

echo "Step 4: Spawn Scan Worker"
WORKER1_ID="worker-scan-001"
log_worker_spawned "$TASK_ID" "security-master" "$WORKER1_ID" "scan-worker" '{"priority":"high","token_budget":8000}'
sleep 1

echo "Step 5: Scan Worker Starts Execution"
log_worker_started "$TASK_ID" "$WORKER1_ID" "scan-worker" '{"repository":"cortex","branch":"main"}'
sleep 1

echo "Step 6: Scan Worker Progress Update (25%)"
log_worker_progress "$TASK_ID" "$WORKER1_ID" 25 '{"current_step":"scanning dependencies"}'
sleep 1

echo "Step 7: Scan Worker Progress Update (50%)"
log_worker_progress "$TASK_ID" "$WORKER1_ID" 50 '{"current_step":"analyzing code"}'
sleep 1

echo "Step 8: Scan Worker Progress Update (75%)"
log_worker_progress "$TASK_ID" "$WORKER1_ID" 75 '{"current_step":"generating report"}'
sleep 1

echo "Step 9: Scan Worker Completes"
log_worker_completed "$TASK_ID" "$WORKER1_ID" "success" '{"completion_status":"success","deliverables":["scan-report.json","vulnerabilities.json"],"token_usage":{"input_tokens":5000,"output_tokens":3000,"total_tokens":8000},"duration_ms":420000,"vulnerabilities_found":3}'
sleep 1

echo "Step 10: Spawn Fix Worker for Vulnerabilities"
WORKER2_ID="worker-fix-002"
log_worker_spawned "$TASK_ID" "security-master" "$WORKER2_ID" "fix-worker" '{"priority":"high","token_budget":5000,"parent_worker":"worker-scan-001"}'
sleep 1

echo "Step 11: Fix Worker Starts Execution"
log_worker_started "$TASK_ID" "$WORKER2_ID" "fix-worker" '{"vulnerabilities_to_fix":3}'
sleep 1

echo "Step 12: Fix Worker Progress (33%)"
log_worker_progress "$TASK_ID" "$WORKER2_ID" 33 '{"current_step":"fixing dependency vulnerability"}'
sleep 1

echo "Step 13: Fix Worker Progress (66%)"
log_worker_progress "$TASK_ID" "$WORKER2_ID" 66 '{"current_step":"updating configurations"}'
sleep 1

echo "Step 14: Fix Worker Completes"
log_worker_completed "$TASK_ID" "$WORKER2_ID" "success" '{"completion_status":"success","deliverables":["fixes.json","updated-dependencies.json"],"token_usage":{"input_tokens":3000,"output_tokens":2000,"total_tokens":5000},"duration_ms":300000,"fixes_applied":3}'
sleep 1

echo "Step 15: Create Handoff to Development Master"
HANDOFF_ID="handoff-sec-to-dev-001"
log_handoff_created "$TASK_ID" "$HANDOFF_ID" "security-master" "development-master" '{"handoff_reason":"Security fixes ready for integration","deliverables":["fixes.json","scan-report.json"]}'
sleep 1

echo "Step 16: Development Master Accepts Handoff"
log_handoff_accepted "$TASK_ID" "$HANDOFF_ID" "development-master" '{"acceptance_timestamp":"2025-11-27T12:15:00Z"}'
sleep 1

echo "Step 17: Spawn Implementation Worker"
WORKER3_ID="worker-implementation-003"
log_worker_spawned "$TASK_ID" "development-master" "$WORKER3_ID" "implementation-worker" '{"priority":"medium","token_budget":10000}'
sleep 1

echo "Step 18: Implementation Worker Starts"
log_worker_started "$TASK_ID" "$WORKER3_ID" "implementation-worker" '{"task":"integrate security fixes"}'
sleep 1

echo "Step 19: Implementation Worker Completes"
log_worker_completed "$TASK_ID" "$WORKER3_ID" "success" '{"completion_status":"success","deliverables":["integration-pr.json","test-results.json"],"token_usage":{"input_tokens":7000,"output_tokens":3000,"total_tokens":10000},"duration_ms":600000}'
sleep 1

echo "Step 20: Handoff Completed"
log_handoff_completed "$TASK_ID" "$HANDOFF_ID" "development-master" '{"completion_status":"success","deliverables":["integration-pr.json"]}'
sleep 1

echo "Step 21: Task Completed"
log_task_completed "$TASK_ID" "security-master" "success" '{"completion_status":"success","total_workers":3,"total_deliverables":["scan-report.json","vulnerabilities.json","fixes.json","integration-pr.json","test-results.json"],"total_token_usage":{"total_tokens":23000},"total_duration_ms":1320000,"vulnerabilities_found":3,"vulnerabilities_fixed":3}'

echo ""
echo "Example lineage generation complete!"
echo ""
echo "Query examples:"
echo "  ./scripts/query-lineage.sh --task $TASK_ID"
echo "  ./scripts/query-lineage.sh --timeline $TASK_ID"
echo "  ./scripts/query-lineage.sh --workers $TASK_ID"
echo "  ./scripts/query-lineage.sh --summary $TASK_ID"
echo "  ./scripts/query-lineage.sh --duration $TASK_ID"
