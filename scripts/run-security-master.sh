#!/bin/bash
# scripts/run-security-master.sh
# Security Master Agent - Autonomous security scanning and remediation
# Part of Phase 1: Script-Triggered Automation

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

# Agent configuration
AGENT_ID="security"
AGENT_TYPE="master"
TOKEN_BUDGET_ALLOCATED=30000

# Acquire lock to prevent concurrent runs
if ! acquire_lock "$AGENT_ID"; then
    log_error "Another instance of $AGENT_ID is already running"
    exit 1
fi

# Trap to ensure lock is released on exit
trap "release_lock $AGENT_ID" EXIT

handle_security_scan() {
    local task_id=$1
    local task_data=$2

    log_info "Handling security scan for task: $task_id"

    # Extract task details
    local repository=$(echo "$task_data" | jq -r '.context.repository // empty')
    local branch=$(echo "$task_data" | jq -r '.context.branch // "main"')
    local scan_types=$(echo "$task_data" | jq -r '.context.scan_types // ["dependencies", "static-analysis", "secrets"]')

    if [ -z "$repository" ]; then
        log_error "No repository specified in task $task_id"
        local error_data=$(jq -nc '{error: "No repository specified"}')
        update_task_status "$task_id" "failed" "$error_data"
        return 1
    fi

    log_info "Repository: $repository"
    log_info "Branch: $branch"

    # Check token budget
    local estimated_tokens=8000
    if ! check_token_budget "$AGENT_ID" "$estimated_tokens"; then
        log_error "Insufficient token budget for scan worker"
        local blocked_data=$(jq -nc '{reason: "insufficient_tokens"}')
        update_task_status "$task_id" "blocked" "$blocked_data"
        return 1
    fi

    # Spawn scan worker
    log_info "Spawning scan-worker for task $task_id"

    local scope_json=$(cat <<EOF
{
  "repository": "$repository",
  "branch": "$branch",
  "description": "Security scan for $repository",
  "scan_types": $scan_types
}
EOF
)

    # Spawn worker using spawn-worker.sh
    if "$SCRIPT_DIR/spawn-worker.sh" \
        --type scan-worker \
        --task-id "$task_id" \
        --master "$AGENT_ID" \
        --repo "$repository" \
        --priority high \
        --scope "$scope_json"; then

        log_success "Scan worker spawned successfully for task $task_id"

        # Update task with worker reference
        local worker_data=$(jq -nc '{status: "scan_worker_spawned"}')
        update_task_status "$task_id" "in_progress" "$worker_data"
    else
        log_error "Failed to spawn scan worker for task $task_id"
        local spawn_fail_data=$(jq -nc '{error: "worker_spawn_failed"}')
        update_task_status "$task_id" "failed" "$spawn_fail_data"
        return 1
    fi
}

handle_security_fix() {
    local task_id=$1
    local task_data=$2

    log_info "Handling security fix for task: $task_id"

    # Extract task details
    local repository=$(echo "$task_data" | jq -r '.context.repository // empty')
    local vulnerabilities=$(echo "$task_data" | jq -r '.context.vulnerabilities // []')
    local vuln_count=$(echo "$vulnerabilities" | jq 'length')

    if [ -z "$repository" ]; then
        log_error "No repository specified in task $task_id"
        local error_data=$(jq -nc '{error: "No repository specified"}')
        update_task_status "$task_id" "failed" "$error_data"
        return 1
    fi

    log_info "Repository: $repository"
    log_info "Vulnerabilities to fix: $vuln_count"

    # Check if we have scan results
    if [ "$vuln_count" -eq 0 ]; then
        log_warn "No vulnerabilities specified - may need to run scan first"
        local no_vuln_data=$(jq -nc '{reason: "no_vulnerabilities_specified"}')
        update_task_status "$task_id" "blocked" "$no_vuln_data"
        return 1
    fi

    # Check token budget for fix worker
    local estimated_tokens=5000
    if ! check_token_budget "$AGENT_ID" "$estimated_tokens"; then
        log_error "Insufficient token budget for fix worker"
        local blocked_data=$(jq -nc '{reason: "insufficient_tokens"}')
        update_task_status "$task_id" "blocked" "$blocked_data"
        return 1
    fi

    # Spawn fix worker
    log_info "Spawning fix-worker for task $task_id"

    local context_json=$(cat <<EOF
{
  "parent_task": "$task_id",
  "repository": "$repository",
  "vulnerabilities": $vulnerabilities,
  "priority": "high"
}
EOF
)

    # Spawn worker using spawn-worker.sh
    if "$SCRIPT_DIR/spawn-worker.sh" \
        --type fix-worker \
        --task-id "$task_id" \
        --master "$AGENT_ID" \
        --repo "$repository" \
        --priority high \
        --context "$context_json"; then

        log_success "Fix worker spawned successfully for task $task_id"

        # Update task with worker reference
        local fix_worker_data=$(jq -nc '{status: "fix_worker_spawned"}')
        update_task_status "$task_id" "in_progress" "$fix_worker_data"
    else
        log_error "Failed to spawn fix worker for task $task_id"
        local spawn_fail_data=$(jq -nc '{error: "worker_spawn_failed"}')
        update_task_status "$task_id" "failed" "$spawn_fail_data"
        return 1
    fi
}

# Start execution
log_section "Security Master Agent Starting"
log_info "Agent: $AGENT_ID"
log_info "Type: $AGENT_TYPE"
log_info "Working Directory: $COMMIT_RELAY_HOME"

cd "$COMMIT_RELAY_HOME"

# Pull latest coordination state
log_info "Pulling latest coordination state..."
git pull origin main --quiet || log_warn "Failed to pull latest state"

# Check for pending security tasks
log_section "Checking for Pending Security Tasks"

PENDING_TASKS=$(get_pending_tasks "security-scan")
TASK_COUNT=$(echo "$PENDING_TASKS" | jq 'length')

log_info "Found $TASK_COUNT pending security scan tasks"

if [ "$TASK_COUNT" -eq 0 ]; then
    log_info "No pending security tasks - checking for security-fix tasks"

    PENDING_TASKS=$(get_pending_tasks "security-fix")
    TASK_COUNT=$(echo "$PENDING_TASKS" | jq 'length')

    if [ "$TASK_COUNT" -eq 0 ]; then
        log_info "No pending security tasks found"
        log_section "Security Master Agent Complete (No Work)"
        exit 0
    fi
fi

# Process each pending task
log_section "Processing Security Tasks"

for i in $(seq 0 $((TASK_COUNT - 1))); do
    TASK=$(echo "$PENDING_TASKS" | jq -r ".[$i]")
    TASK_ID=$(echo "$TASK" | jq -r '.id')
    TASK_TYPE=$(echo "$TASK" | jq -r '.type')
    TASK_PRIORITY=$(echo "$TASK" | jq -r '.priority // "medium"')

    log_info "Processing task: $TASK_ID (type: $TASK_TYPE, priority: $TASK_PRIORITY)"

    # Update task status to in_progress
    TASK_UPDATE_DATA=$(jq -nc --arg agent "$AGENT_ID" '{assigned_to: $agent}')
    update_task_status "$TASK_ID" "in_progress" "$TASK_UPDATE_DATA"

    case "$TASK_TYPE" in
        security-scan)
            handle_security_scan "$TASK_ID" "$TASK"
            ;;
        security-fix)
            handle_security_fix "$TASK_ID" "$TASK"
            ;;
        *)
            log_warn "Unknown task type: $TASK_TYPE"
            ;;
    esac
done


log_section "Security Master Agent Complete"
log_success "Processed $TASK_COUNT security tasks"

exit 0
