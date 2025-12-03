#!/usr/bin/env bash
# Handler for task.assigned events
# Updates assignment tracking and logs routing decisions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-task-assigned] $*" >&2
}

handle_task_assigned() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id task_id worker_id master worker_type assignment_strategy
    event_id=$(echo "$event_json" | jq -r '.event_id')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // "unknown"')
    master=$(echo "$event_json" | jq -r '.metadata.master // .payload.master // "unknown"')
    worker_type=$(echo "$event_json" | jq -r '.payload.worker_type // "unknown"')
    assignment_strategy=$(echo "$event_json" | jq -r '.payload.assignment_strategy // "manual"')

    log "Task assigned: $task_id -> $worker_id (type: $worker_type, master: $master, strategy: $assignment_strategy)"

    # Record assignment in tracking file
    local assignments_file="$PROJECT_ROOT/coordination/metrics/task-assignments.jsonl"
    mkdir -p "$(dirname "$assignments_file")"

    local assignment_entry
    assignment_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg master "$master" \
        --arg type "$worker_type" \
        --arg strategy "$assignment_strategy" \
        '{
            timestamp: $ts,
            task_id: $task,
            worker_id: $worker,
            master: $master,
            worker_type: $type,
            assignment_strategy: $strategy,
            status: "assigned"
        }')

    echo "$assignment_entry" | jq -c '.' >> "$assignments_file"
    log "Assignment tracked"

    # Update task queue status
    local task_queue="$PROJECT_ROOT/coordination/task-queue.json"
    if [[ -f "$task_queue" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg task "$task_id" \
            --arg worker "$worker_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '
            .tasks |= map(
                if .id == $task then
                    .status = "assigned" |
                    .worker_id = $worker |
                    .assigned_at = $ts
                else
                    .
                end
            )
            ' "$task_queue" > "$temp_file"

        mv "$temp_file" "$task_queue"
        log "Task queue updated: $task_id assigned to $worker_id"
    fi

    # Update worker pool status
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    if [[ -f "$pool_file" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg worker "$worker_id" \
            --arg task "$task_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '
            .workers |= map(
                if .id == $worker then
                    .status = "busy" |
                    .current_task = $task |
                    .last_assigned = $ts
                else
                    .
                end
            )
            ' "$pool_file" > "$temp_file"

        mv "$temp_file" "$pool_file"
        log "Worker pool updated: $worker_id marked busy"
    fi

    # Record routing decision
    local routing_log="$PROJECT_ROOT/coordination/routing/routing-decisions.jsonl"
    mkdir -p "$(dirname "$routing_log")"

    local routing_entry
    routing_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg master "$master" \
        --arg type "$worker_type" \
        --arg strategy "$assignment_strategy" \
        --arg decision_type "task_assignment" \
        '{
            timestamp: $ts,
            decision_type: $decision_type,
            task_id: $task,
            worker_id: $worker,
            master: $master,
            worker_type: $type,
            assignment_strategy: $strategy
        }')

    echo "$routing_entry" | jq -c '.' >> "$routing_log"
    log "Routing decision logged"

    # Update assignment statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/assignment-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_assignments": 0, "by_strategy": {}, "by_worker_type": {}, "by_master": {}}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg strategy "$assignment_strategy" \
        --arg type "$worker_type" \
        --arg master "$master" \
        '
        .total_assignments += 1 |
        .by_strategy[$strategy] = ((.by_strategy[$strategy] // 0) + 1) |
        .by_worker_type[$type] = ((.by_worker_type[$type] // 0) + 1) |
        .by_master[$master] = ((.by_master[$master] // 0) + 1)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Assignment statistics updated"

    # Create routing decision event for learning
    local routing_event
    routing_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
        "routing.decision_made" \
        "on-task-assigned-handler" \
        "$(jq -n \
            --arg task "$task_id" \
            --arg worker "$worker_id" \
            --arg type "$worker_type" \
            --arg strategy "$assignment_strategy" \
            '{
                task_id: $task,
                worker_id: $worker,
                worker_type: $type,
                assignment_strategy: $strategy,
                decision: "assigned"
            }')" \
        "$task_id" \
        "medium")

    echo "$routing_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
    log "Routing event created for learning system"

    # Log to dashboard events
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "task_assigned" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg type "$worker_type" \
        --arg master "$master" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            task_id: $task,
            worker_id: $worker,
            worker_type: $type,
            master: $master
        }')

    echo "$dashboard_entry" | jq -c '.' >> "$dashboard_log"
    log "Dashboard event logged"

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_task_assigned "$1"
