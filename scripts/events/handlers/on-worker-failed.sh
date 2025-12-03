#!/usr/bin/env bash
# Handler for worker.failed events
# Tracks worker failures and triggers recovery

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-worker-failed] $*" >&2
}

handle_worker_failed() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id worker_id task_id error_type error_msg master
    event_id=$(echo "$event_json" | jq -r '.event_id')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // .source')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    error_type=$(echo "$event_json" | jq -r '.payload.error_type // "unknown"')
    error_msg=$(echo "$event_json" | jq -r '.payload.error_message // "No error message"')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')

    log "Worker failed: $worker_id (task: $task_id, error: $error_type)"

    # Record failure
    local failures_file="$PROJECT_ROOT/coordination/metrics/worker-failures.jsonl"
    mkdir -p "$(dirname "$failures_file")"

    local failure_entry
    failure_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg worker "$worker_id" \
        --arg task "$task_id" \
        --arg master "$master" \
        --arg error_type "$error_type" \
        --arg error_msg "$error_msg" \
        '{
            timestamp: $ts,
            worker_id: $worker,
            task_id: $task,
            master: $master,
            error_type: $error_type,
            error_message: $error_msg,
            status: "failed"
        }')

    echo "$failure_entry" | jq -c '.' >> "$failures_file"
    log "Worker failure recorded"

    # Update worker pool status
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    if [[ -f "$pool_file" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg worker "$worker_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg error "$error_msg" \
            '
            .workers |= map(
                if .id == $worker then
                    .status = "failed" |
                    .last_error = $error |
                    .last_failure = $ts
                else
                    .
                end
            )
            ' "$pool_file" > "$temp_file"

        mv "$temp_file" "$pool_file"
        log "Worker pool updated: $worker_id marked failed"
    fi

    # Create task failure event if task was assigned
    if [[ "$task_id" != "unknown" && "$task_id" != "null" ]]; then
        log "Creating task failure event for task: $task_id"

        local task_failure_event
        task_failure_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "task.failed" \
            "on-worker-failed-handler" \
            "$(jq -n \
                --arg task "$task_id" \
                --arg worker "$worker_id" \
                --arg error_type "$error_type" \
                --arg error_msg "$error_msg" \
                '{
                    task_id: $task,
                    worker_id: $worker,
                    error_type: $error_type,
                    error_message: $error_msg,
                    reason: "worker_failure"
                }')" \
            "$task_id" \
            "high")

        echo "$task_failure_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Task failure event created"
    fi

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_worker_failed "$1"
