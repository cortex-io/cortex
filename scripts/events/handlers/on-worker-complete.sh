#!/usr/bin/env bash
# Handler for worker.completed events
# Triggers learning updates and performance tracking

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-worker-complete] $*" >&2
}

handle_worker_complete() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id worker_id task_id status duration tokens master
    event_id=$(echo "$event_json" | jq -r '.event_id')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // .source')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    status=$(echo "$event_json" | jq -r '.payload.status // "completed"')
    duration=$(echo "$event_json" | jq -r '.payload.duration_ms // 0')
    tokens=$(echo "$event_json" | jq -r '.payload.tokens_used // 0')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')

    log "Worker completed: $worker_id (task: $task_id, duration: ${duration}ms, tokens: $tokens)"

    # Update worker performance metrics
    local metrics_file="$PROJECT_ROOT/coordination/metrics/worker-performance.jsonl"
    mkdir -p "$(dirname "$metrics_file")"

    local metric_entry
    metric_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg worker "$worker_id" \
        --arg task "$task_id" \
        --arg master "$master" \
        --argjson duration "$duration" \
        --argjson tokens "$tokens" \
        '{
            timestamp: $ts,
            worker_id: $worker,
            task_id: $task,
            master: $master,
            duration_ms: $duration,
            tokens_used: $tokens,
            status: "completed"
        }')

    echo "$metric_entry" | jq -c '.' >> "$metrics_file"
    log "Performance metric recorded"

    # Trigger auto-learning if appropriate
    if [[ "$status" == "completed" && "$tokens" -gt 0 ]]; then
        log "Triggering auto-learning for successful completion"

        # Create and log learning event
        local learning_event
        learning_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "learning.pattern_detected" \
            "on-worker-complete-handler" \
            "$(jq -n \
                --arg worker "$worker_id" \
                --arg task "$task_id" \
                --argjson tokens "$tokens" \
                --argjson duration "$duration" \
                '{
                    worker_id: $worker,
                    task_id: $task,
                    tokens_used: $tokens,
                    duration_ms: $duration,
                    outcome: "success"
                }')" \
            "$task_id" \
            "medium")

        "$PROJECT_ROOT/scripts/events/lib/event-logger.sh" "$learning_event"
        log "Learning event created and logged"
    fi

    # Update worker pool state
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    if [[ -f "$pool_file" ]]; then
        # Update worker status to available
        local temp_file
        temp_file=$(mktemp)

        jq --arg worker "$worker_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '
            if .active_workers then
                .active_workers |= map(
                    if .worker_id == $worker then
                        .status = "available" |
                        .last_completed = $ts
                    else
                        .
                    end
                )
            else
                .
            end
            ' "$pool_file" > "$temp_file"

        mv "$temp_file" "$pool_file"
        log "Worker pool updated: $worker_id marked available"
    fi

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_worker_complete "$1"
