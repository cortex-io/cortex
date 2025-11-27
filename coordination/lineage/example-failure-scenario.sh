#!/bin/bash
# Example failure scenario lineage for testing
# Demonstrates task failures, worker failures, blocking, and escalation
#
# Usage: ./example-failure-scenario.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Load lineage library
source "$CORTEX_HOME/scripts/lib/lineage.sh"

echo "Generating failure scenario lineage for testing..."

TASK_ID="task-example-failed-deployment-002"
export CORTEX_SESSION_ID="session-example-002"
export CORTEX_TRACE_ID="trace-example-002"
export CORTEX_PRINCIPAL="system"

echo "Step 1: Task Creation"
log_task_created "$TASK_ID" "user-ryan" '{"priority":"critical","type":"deployment","source":"manual_request"}'
sleep 1

echo "Step 2: Task Assignment to CI/CD Master"
log_task_assigned "$TASK_ID" "coordinator-master" "cicd-master" "critical"
sleep 1

echo "Step 3: CI/CD Master Starts Task"
log_task_started "$TASK_ID" "cicd-master" '{"deployment_target":"production"}'
sleep 1

echo "Step 4: Task Blocked - Waiting for Dependency"
log_task_blocked "$TASK_ID" "cicd-master" "Waiting for dependency: task-example-security-scan-001" '{"blocked_by":["task-example-security-scan-001"],"blocking_reason":"security_scan_required"}'
sleep 2

echo "Step 5: Task Unblocked - Dependency Completed"
log_task_unblocked "$TASK_ID" "cicd-master" "Dependency task-example-security-scan-001 completed successfully" '{"unblocked_at":"2025-11-27T12:25:00Z"}'
sleep 1

echo "Step 6: Spawn Deployment Worker"
WORKER1_ID="worker-deployment-001"
log_worker_spawned "$TASK_ID" "cicd-master" "$WORKER1_ID" "deployment-worker" '{"priority":"critical","token_budget":5000,"environment":"production"}'
sleep 1

echo "Step 7: Deployment Worker Starts"
log_worker_started "$TASK_ID" "$WORKER1_ID" "deployment-worker" '{"deployment_phase":"pre-flight_checks"}'
sleep 1

echo "Step 8: Worker Progress (20%)"
log_worker_progress "$TASK_ID" "$WORKER1_ID" 20 '{"current_step":"running pre-flight checks"}'
sleep 1

echo "Step 9: Worker Progress (40%)"
log_worker_progress "$TASK_ID" "$WORKER1_ID" 40 '{"current_step":"building deployment artifacts"}'
sleep 1

echo "Step 10: Worker Failed - Build Error"
log_worker_failed "$TASK_ID" "$WORKER1_ID" "Build failed: missing dependency" '{"error_type":"build_error","progress_at_failure":40}'
sleep 1

echo "Step 11: Spawn Retry Worker"
WORKER2_ID="worker-deployment-002"
log_worker_spawned "$TASK_ID" "cicd-master" "$WORKER2_ID" "deployment-worker" '{"priority":"critical","token_budget":5000,"retry_attempt":1,"previous_worker":"worker-deployment-001"}'
sleep 1

echo "Step 12: Retry Worker Starts"
log_worker_started "$TASK_ID" "$WORKER2_ID" "deployment-worker" '{"deployment_phase":"dependency_resolution"}'
sleep 1

echo "Step 13: Worker Progress (30%)"
log_worker_progress "$TASK_ID" "$WORKER2_ID" 30 '{"current_step":"installing missing dependencies"}'
sleep 1

echo "Step 14: Worker Progress (60%)"
log_worker_progress "$TASK_ID" "$WORKER2_ID" 60 '{"current_step":"rebuilding deployment artifacts"}'
sleep 1

echo "Step 15: Worker Progress (80%)"
log_worker_progress "$TASK_ID" "$WORKER2_ID" 80 '{"current_step":"deploying to production"}'
sleep 1

echo "Step 16: Worker Failed Again - Deployment Error"
log_worker_failed "$TASK_ID" "$WORKER2_ID" "Deployment failed: insufficient permissions" '{"error_type":"permission_error","progress_at_failure":80}'
sleep 1

echo "Step 17: Task Escalated - Requires Manual Intervention"
log_task_escalated "$TASK_ID" "cicd-master" "Multiple worker failures - requires manual intervention" '{"escalation_reason":"repeated_worker_failures","failed_workers":["worker-deployment-001","worker-deployment-002"],"escalation_level":"critical","requires_approval":true}'
sleep 1

echo "Step 18: Task Reassigned to Operations Master"
log_task_reassigned "$TASK_ID" "cicd-master" "operations-master" "Escalated deployment requires ops team" '{"reassignment_reason":"escalation","original_master":"cicd-master"}'
sleep 1

echo "Step 19: Task Failed"
log_task_failed "$TASK_ID" "operations-master" "Deployment aborted after multiple failures" '{"failure_reason":"deployment_aborted","failed_workers":2,"total_attempts":2,"requires_manual_fix":true,"rollback_required":false}'

echo ""
echo "Failure scenario lineage generation complete!"
echo ""
echo "Query examples:"
echo "  ./scripts/query-lineage.sh --task $TASK_ID"
echo "  ./scripts/query-lineage.sh --timeline $TASK_ID"
echo "  ./scripts/query-lineage.sh --failed"
echo "  ./scripts/query-lineage.sh --summary $TASK_ID"
