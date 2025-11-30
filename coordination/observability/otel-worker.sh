#!/usr/bin/env bash
# OpenTelemetry Worker Instrumentation
# Wraps worker operations with tracing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/otel-span.sh"
source "$SCRIPT_DIR/otel-exporter.sh"

# ==============================================================================
# WORKER LIFECYCLE TRACING
# ==============================================================================

# Start worker lifecycle span
# Args: worker_id, worker_type, task_id, task_file (optional)
# Returns: span_json
start_worker_span() {
    local worker_id="$1"
    local worker_type="$2"
    local task_id="$3"
    local task_file="${4:-}"

    # Extract existing trace context from task
    local trace_context="{}"
    if [[ -n "$task_file" && -f "$task_file" ]]; then
        trace_context=$(extract_trace_context "$task_file" 2>/dev/null || echo "{}")
    fi

    # Import from environment if no task file
    if [[ "$trace_context" == "{}" ]]; then
        trace_context=$(import_context_env)
    fi

    # Create worker span
    local span=$(create_worker_span "$worker_id" "$worker_type" "$task_id" "$trace_context")

    # Export context to environment
    local trace_id=$(echo "$span" | jq -r '.trace_id')
    local span_id=$(echo "$span" | jq -r '.span_id')
    export_context_env "$trace_id" "$span_id"

    echo "$span"
}

# End worker span
# Args: span_json, status_code (OK/ERROR), status_message (optional)
end_worker_span() {
    local span="$1"
    local status_code="${2:-OK}"
    local status_message="${3:-}"

    # End span
    span=$(end_span "$span" "$status_code" "$status_message")

    # Export span
    export_span "$span"

    echo "$span"
}

# Add worker event
# Args: span_json, event_name, event_details (optional)
add_worker_event() {
    local span="$1"
    local event_name="$2"
    local event_details="${3:-{}}"

    add_span_event "$span" "$event_name" "$event_details"
}

# ==============================================================================
# WORKER LIFECYCLE HOOKS
# ==============================================================================

# Hook: Worker started
worker_started_hook() {
    local worker_id="$1"
    local worker_type="$2"
    local task_id="$3"
    local task_file="${4:-}"

    local span=$(start_worker_span "$worker_id" "$worker_type" "$task_id" "$task_file")
    span=$(add_worker_event "$span" "worker.started" '{"event": "lifecycle"}')

    # Store span for later retrieval
    local trace_id=$(echo "$span" | jq -r '.trace_id')
    local span_file="/tmp/cortex-worker-span-${worker_id}.json"
    echo "$span" > "$span_file"

    echo "$span"
}

# Hook: Worker completed
worker_completed_hook() {
    local worker_id="$1"
    local exit_code="${2:-0}"

    local span_file="/tmp/cortex-worker-span-${worker_id}.json"

    if [[ ! -f "$span_file" ]]; then
        echo "Warning: No span found for worker $worker_id" >&2
        return 0
    fi

    local span=$(cat "$span_file")
    span=$(add_worker_event "$span" "worker.completed" "{\"exit_code\": $exit_code}")

    if [[ $exit_code -eq 0 ]]; then
        end_worker_span "$span" "OK"
    else
        end_worker_span "$span" "ERROR" "Worker failed with exit code $exit_code"
    fi

    rm -f "$span_file"
}

# Hook: Worker failed
worker_failed_hook() {
    local worker_id="$1"
    local error_message="${2:-Unknown error}"

    local span_file="/tmp/cortex-worker-span-${worker_id}.json"

    if [[ ! -f "$span_file" ]]; then
        echo "Warning: No span found for worker $worker_id" >&2
        return 0
    fi

    local span=$(cat "$span_file")
    span=$(add_worker_event "$span" "worker.failed" "{\"error\": \"$error_message\"}")
    end_worker_span "$span" "ERROR" "$error_message"

    rm -f "$span_file"
}

# Hook: Worker heartbeat
worker_heartbeat_hook() {
    local worker_id="$1"
    local heartbeat_count="${2:-0}"

    local span_file="/tmp/cortex-worker-span-${worker_id}.json"

    if [[ ! -f "$span_file" ]]; then
        return 0
    fi

    local span=$(cat "$span_file")
    span=$(add_worker_event "$span" "worker.heartbeat" "{\"count\": $heartbeat_count}")

    # Update span file
    echo "$span" > "$span_file"
}

# ==============================================================================
# CONVENIENCE WRAPPERS
# ==============================================================================

# Wrap worker execution with tracing
# Args: worker_id, worker_type, task_id, task_file, command_to_execute
trace_worker_execution() {
    local worker_id="$1"
    local worker_type="$2"
    local task_id="$3"
    local task_file="$4"
    shift 4
    local command=("$@")

    # Start tracing
    worker_started_hook "$worker_id" "$worker_type" "$task_id" "$task_file"

    # Execute command
    local exit_code=0
    "${command[@]}" || exit_code=$?

    # End tracing
    worker_completed_hook "$worker_id" "$exit_code"

    return $exit_code
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f start_worker_span
export -f end_worker_span
export -f add_worker_event
export -f worker_started_hook
export -f worker_completed_hook
export -f worker_failed_hook
export -f worker_heartbeat_hook
export -f trace_worker_execution
