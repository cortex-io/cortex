#!/usr/bin/env bash
# Handler for task.failed events
# Triggers failure pattern analysis and auto-fix

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-task-failure] $*" >&2
}

handle_task_failure() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id task_id worker_id error_type error_msg master
    event_id=$(echo "$event_json" | jq -r '.event_id')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // .source // "unknown"')
    error_type=$(echo "$event_json" | jq -r '.payload.error_type // "unknown"')
    error_msg=$(echo "$event_json" | jq -r '.payload.error_message // "No error message"')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')

    log "Task failed: $task_id (worker: $worker_id, error: $error_type)"

    # Record failure in patterns database
    local patterns_file="$PROJECT_ROOT/coordination/patterns/failure-patterns.jsonl"
    mkdir -p "$(dirname "$patterns_file")"

    local failure_entry
    failure_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg worker "$worker_id" \
        --arg master "$master" \
        --arg error_type "$error_type" \
        --arg error_msg "$error_msg" \
        '{
            timestamp: $ts,
            task_id: $task,
            worker_id: $worker,
            master: $master,
            error_type: $error_type,
            error_message: $error_msg
        }')

    echo "$failure_entry" | jq -c '.' >> "$patterns_file"
    log "Failure pattern recorded"

    # Check for repeated failures (simple pattern detection)
    local recent_failures
    recent_failures=$(tail -100 "$patterns_file" 2>/dev/null | \
        jq -s --arg error "$error_type" 'map(select(.error_type == $error)) | length' || echo "0")

    if [[ "$recent_failures" -gt 3 ]]; then
        log "WARNING: Repeated failure pattern detected: $error_type ($recent_failures recent occurrences)"

        # Create health alert event
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-task-failure-handler" \
            "$(jq -n \
                --arg error "$error_type" \
                --argjson count "$recent_failures" \
                --arg msg "$error_msg" \
                '{
                    alert_type: "repeated_failure",
                    error_type: $error,
                    occurrence_count: $count,
                    sample_message: $msg
                }')" \
            "$task_id" \
            "high")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Health alert created for repeated failures"
    fi

    # Trigger auto-fix if error is known
    case "$error_type" in
        "timeout"|"connection_error"|"rate_limit")
            log "Triggering auto-fix for known error type: $error_type"

            # Create auto-fix event (would be handled by separate handler)
            local autofix_payload
            autofix_payload=$(jq -n \
                --arg task "$task_id" \
                --arg worker "$worker_id" \
                --arg error "$error_type" \
                '{
                    failed_task_id: $task,
                    worker_id: $worker,
                    error_type: $error,
                    action: "retry_with_backoff"
                }')

            # For now, just log the fix attempt
            log "Auto-fix recommended: retry with backoff for $error_type"
            ;;
        *)
            log "No auto-fix available for error type: $error_type"
            ;;
    esac

    # Update task queue status
    local task_queue="$PROJECT_ROOT/coordination/task-queue.json"
    if [[ -f "$task_queue" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg task "$task_id" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg error "$error_msg" \
            '
            .tasks |= map(
                if .id == $task then
                    .status = "failed" |
                    .error = $error |
                    .failed_at = $ts
                else
                    .
                end
            )
            ' "$task_queue" > "$temp_file"

        mv "$temp_file" "$task_queue"
        log "Task queue updated: $task_id marked as failed"
    fi

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_task_failure "$1"
