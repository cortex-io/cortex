#!/usr/bin/env bash
# OpenTelemetry Master Instrumentation
# Wraps master operations with tracing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/otel-span.sh"
source "$SCRIPT_DIR/otel-exporter.sh"

# ==============================================================================
# MASTER OPERATION TRACING
# ==============================================================================

# Start a master operation with tracing
# Args: master_name, operation, task_id, task_file (optional)
# Returns: span_json
start_master_operation() {
    local master_name="$1"
    local operation="$2"
    local task_id="$3"
    local task_file="${4:-}"

    # Extract existing trace context from task if available
    local trace_context="{}"
    if [[ -n "$task_file" && -f "$task_file" ]]; then
        trace_context=$(extract_trace_context "$task_file" 2>/dev/null || echo "{}")
    fi

    # Import from environment if no task file
    if [[ "$trace_context" == "{}" ]]; then
        trace_context=$(import_context_env)
    fi

    # Create master span
    local span=$(create_master_span "$master_name" "$operation" "$task_id" "$trace_context")

    # Export context to environment for child processes
    local trace_id=$(echo "$span" | jq -r '.trace_id')
    local span_id=$(echo "$span" | jq -r '.span_id')
    export_context_env "$trace_id" "$span_id"

    # Inject trace context into task file if provided
    if [[ -n "$task_file" && -f "$task_file" ]]; then
        local new_context=$(echo "$span" | jq '{trace_id, span_id, parent_span_id}')
        inject_trace_context "$task_file" "$new_context" 2>/dev/null || true
    fi

    echo "$span"
}

# End a master operation
# Args: span_json, status_code (OK/ERROR), status_message (optional)
end_master_operation() {
    local span="$1"
    local status_code="${2:-OK}"
    local status_message="${3:-}"

    # End span
    span=$(end_span "$span" "$status_code" "$status_message")

    # Export span
    export_span "$span"

    echo "$span"
}

# Add event to master operation
# Args: span_json, event_name, event_details (optional)
add_master_event() {
    local span="$1"
    local event_name="$2"
    local event_details="${3:-{}}"

    add_span_event "$span" "$event_name" "$event_details"
}

# ==============================================================================
# CONVENIENCE WRAPPERS
# ==============================================================================

# Trace a master task execution
# Args: master_name, task_id, task_file, command_to_execute
trace_master_task() {
    local master_name="$1"
    local task_id="$2"
    local task_file="$3"
    shift 3
    local command=("$@")

    # Start tracing
    local span=$(start_master_operation "$master_name" "execute_task" "$task_id" "$task_file")

    # Execute command
    local exit_code=0
    "${command[@]}" || exit_code=$?

    # End tracing
    if [[ $exit_code -eq 0 ]]; then
        end_master_operation "$span" "OK"
    else
        end_master_operation "$span" "ERROR" "Command failed with exit code $exit_code"
    fi

    return $exit_code
}

# Trace a master analysis operation
# Args: master_name, task_id, task_file
trace_master_analysis() {
    local master_name="$1"
    local task_id="$2"
    local task_file="$3"

    start_master_operation "$master_name" "analyze" "$task_id" "$task_file"
}

# Trace master routing decision
# Args: master_name, task_id, selected_worker_type
trace_master_routing() {
    local master_name="$1"
    local task_id="$2"
    local selected_worker_type="$3"

    local span=$(start_master_operation "$master_name" "route_to_worker" "$task_id")
    span=$(set_span_attribute "$span" "cortex.worker_type" "$selected_worker_type")
    end_master_operation "$span" "OK"
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f start_master_operation
export -f end_master_operation
export -f add_master_event
export -f trace_master_task
export -f trace_master_analysis
export -f trace_master_routing
