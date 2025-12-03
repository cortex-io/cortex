#!/usr/bin/env bash
# Handler for task.created events
# Logs task creation, updates task metrics, and notifies about high-priority tasks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-task-created] $*" >&2
}

handle_task_created() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id task_id task_type priority master description
    event_id=$(echo "$event_json" | jq -r '.event_id')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    task_type=$(echo "$event_json" | jq -r '.payload.task_type // "unknown"')
    priority=$(echo "$event_json" | jq -r '.metadata.priority // "medium"')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')
    description=$(echo "$event_json" | jq -r '.payload.description // "No description provided"')

    log "Task created: $task_id (type: $task_type, priority: $priority, master: $master)"

    # Record task creation in metrics
    local metrics_file="$PROJECT_ROOT/coordination/metrics/task-creation-metrics.jsonl"
    mkdir -p "$(dirname "$metrics_file")"

    local metric_entry
    metric_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg type "$task_type" \
        --arg priority "$priority" \
        --arg master "$master" \
        --arg desc "$description" \
        '{
            timestamp: $ts,
            task_id: $task,
            task_type: $type,
            priority: $priority,
            master: $master,
            description: $desc,
            status: "created"
        }')

    echo "$metric_entry" | jq -c '.' >> "$metrics_file"
    log "Task creation metric recorded"

    # Update task statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/task-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_tasks": 0, "by_priority": {}, "by_type": {}, "by_master": {}}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg priority "$priority" \
        --arg type "$task_type" \
        --arg master "$master" \
        '
        .total_tasks += 1 |
        .by_priority[$priority] = ((.by_priority[$priority] // 0) + 1) |
        .by_type[$type] = ((.by_type[$type] // 0) + 1) |
        .by_master[$master] = ((.by_master[$master] // 0) + 1)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Task statistics updated"

    # Add task to task queue if not already present
    local task_queue="$PROJECT_ROOT/coordination/task-queue.json"
    if [[ -f "$task_queue" ]]; then
        # Check if task already exists
        local task_exists
        task_exists=$(jq --arg task "$task_id" '.tasks // [] | any(.id == $task)' "$task_queue")

        if [[ "$task_exists" == "false" ]]; then
            temp_file=$(mktemp)

            jq --arg task "$task_id" \
                --arg type "$task_type" \
                --arg priority "$priority" \
                --arg master "$master" \
                --arg desc "$description" \
                --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                '
                .tasks += [{
                    id: $task,
                    type: $type,
                    priority: $priority,
                    master: $master,
                    description: $desc,
                    status: "pending",
                    created_at: $ts
                }]
                ' "$task_queue" > "$temp_file"

            mv "$temp_file" "$task_queue"
            log "Task added to queue: $task_id"
        else
            log "Task already exists in queue: $task_id"
        fi
    fi

    # Create high-priority alert for critical/high priority tasks
    if [[ "$priority" == "high" || "$priority" == "critical" ]]; then
        log "High-priority task detected: $priority"

        # Create system alert event
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-task-created-handler" \
            "$(jq -n \
                --arg task "$task_id" \
                --arg type "$task_type" \
                --arg priority "$priority" \
                --arg desc "$description" \
                '{
                    alert_type: "high_priority_task",
                    task_id: $task,
                    task_type: $type,
                    priority: $priority,
                    description: $desc,
                    requires_attention: true
                }')" \
            "$task_id" \
            "$priority")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "High-priority alert created"
    fi

    # Log to dashboard events for visibility
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "task_created" \
        --arg task "$task_id" \
        --arg type "$task_type" \
        --arg priority "$priority" \
        --arg master "$master" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            task_id: $task,
            task_type: $type,
            priority: $priority,
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

handle_task_created "$1"
