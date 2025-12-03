#!/usr/bin/env bash
# Handler for task.completed events
# Updates task metrics and triggers learning

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-task-complete] $*" >&2
}

handle_task_complete() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id task_id worker_id duration_ms tokens_used master
    event_id=$(echo "$event_json" | jq -r '.event_id')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // .source // "unknown"')
    duration_ms=$(echo "$event_json" | jq -r '.payload.duration_ms // 0')
    tokens_used=$(echo "$event_json" | jq -r '.payload.tokens_used // 0')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')

    log "Task completed: $task_id (worker: $worker_id, duration: ${duration_ms}ms, tokens: $tokens_used)"

    # Record completion metrics
    local metrics_file="$PROJECT_ROOT/coordination/metrics/task-completion-metrics.jsonl"
    mkdir -p "$(dirname "$metrics_file")"

    local metric_entry
    metric_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg master "$master" \
        --argjson duration "$duration_ms" \
        --argjson tokens "$tokens_used" \
        '{
            timestamp: $ts,
            task_id: $task,
            worker_id: $worker,
            master: $master,
            duration_ms: $duration,
            tokens_used: $tokens,
            status: "completed"
        }')

    echo "$metric_entry" | jq -c '.' >> "$metrics_file"
    log "Completion metric recorded"

    # Update task queue status
    local task_queue="$PROJECT_ROOT/coordination/task-queue.json"
    if [[ -f "$task_queue" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg task "$task_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '
            .tasks |= map(
                if .id == $task then
                    .status = "completed" |
                    .completed_at = $ts
                else
                    .
                end
            )
            ' "$task_queue" > "$temp_file"

        mv "$temp_file" "$task_queue"
        log "Task queue updated: $task_id marked completed"
    fi

    # Log to dashboard
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "task_completed" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg master "$master" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            task_id: $task,
            worker_id: $worker,
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

handle_task_complete "$1"
