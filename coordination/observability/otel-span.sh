#!/usr/bin/env bash
# OpenTelemetry Span Generation
# Creates and manages spans for distributed tracing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/otel-context.sh"

# Get project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# ==============================================================================
# SPAN CREATION
# ==============================================================================

# Create a new span
# Args: name, kind, trace_context_json, attributes_json
create_span() {
    local name="$1"
    local kind="${2:-INTERNAL}"  # INTERNAL, SERVER, CLIENT, PRODUCER, CONSUMER
    local trace_context="${3:-}"
    local attributes="${4:-}"

    # Default to empty objects if not provided
    [[ -z "$trace_context" ]] && trace_context="{}"
    [[ -z "$attributes" ]] && attributes="{}"

    local trace_id=$(echo "$trace_context" | jq -r '.trace_id // empty' 2>/dev/null || echo "")
    local parent_span_id=$(echo "$trace_context" | jq -r '.span_id // empty' 2>/dev/null || echo "")

    # Generate new trace context if none provided
    if [[ -z "$trace_id" ]]; then
        trace_id=$(generate_trace_id)
    fi

    local span_id=$(generate_span_id)
    local start_time=$(generate_timestamp_iso)

    # Build span JSON
    jq -nc \
        --arg trace_id "$trace_id" \
        --arg span_id "$span_id" \
        --arg parent_span_id "${parent_span_id:-null}" \
        --arg name "$name" \
        --arg kind "$kind" \
        --arg start_time "$start_time" \
        --argjson attributes "$attributes" \
        '{
            trace_id: $trace_id,
            span_id: $span_id,
            parent_span_id: ($parent_span_id | if . == "null" then null else . end),
            name: $name,
            kind: $kind,
            start_time: $start_time,
            end_time: null,
            status: {code: "UNSET"},
            attributes: $attributes,
            events: [],
            links: []
        }'
}

# End a span
# Args: span_json, status_code, status_message
end_span() {
    local span="$1"
    local status_code="${2:-OK}"  # UNSET, OK, ERROR
    local status_message="${3:-}"
    local end_time=$(generate_timestamp_iso)

    echo "$span" | jq \
        --arg end_time "$end_time" \
        --arg status_code "$status_code" \
        --arg status_message "$status_message" \
        '. + {
            end_time: $end_time,
            status: {
                code: $status_code,
                message: (if $status_message == "" then null else $status_message end)
            }
        }'
}

# Add event to span
# Args: span_json, event_name, event_attributes_json
add_span_event() {
    local span="$1"
    local event_name="$2"
    local event_attributes="${3:-{}}"
    local timestamp=$(generate_timestamp_iso)

    echo "$span" | jq \
        --arg name "$event_name" \
        --arg timestamp "$timestamp" \
        --argjson attributes "$event_attributes" \
        '.events += [{
            name: $name,
            timestamp: $timestamp,
            attributes: $attributes
        }]'
}

# Set span attribute
# Args: span_json, key, value
set_span_attribute() {
    local span="$1"
    local key="$2"
    local value="$3"

    echo "$span" | jq \
        --arg key "$key" \
        --arg value "$value" \
        '.attributes[$key] = $value'
}

# ==============================================================================
# CONVENIENCE FUNCTIONS
# ==============================================================================

# Create a span for a master operation
# Args: master_name, operation, task_id, trace_context
create_master_span() {
    local master_name="$1"
    local operation="$2"
    local task_id="$3"
    local trace_context="${4:-{}}"

    local attributes=$(jq -nc \
        --arg master "$master_name" \
        --arg operation "$operation" \
        --arg task_id "$task_id" \
        '{
            "service.name": "cortex",
            "cortex.master": $master,
            "cortex.operation": $operation,
            "cortex.task_id": $task_id
        }')

    create_span "master.$master_name.$operation" "INTERNAL" "$trace_context" "$attributes"
}

# Create a span for a worker operation
# Args: worker_id, worker_type, task_id, trace_context
create_worker_span() {
    local worker_id="$1"
    local worker_type="$2"
    local task_id="$3"
    local trace_context="${4:-{}}"

    local attributes=$(jq -nc \
        --arg worker_id "$worker_id" \
        --arg worker_type "$worker_type" \
        --arg task_id "$task_id" \
        '{
            "service.name": "cortex",
            "cortex.worker_id": $worker_id,
            "cortex.worker_type": $worker_type,
            "cortex.task_id": $task_id
        }')

    create_span "worker.$worker_type" "INTERNAL" "$trace_context" "$attributes"
}

# Create a span for task routing
# Args: task_id, task_type, selected_master, confidence, trace_context
create_routing_span() {
    local task_id="$1"
    local task_type="$2"
    local selected_master="$3"
    local confidence="$4"
    local trace_context="${5:-{}}"

    local attributes=$(jq -nc \
        --arg task_id "$task_id" \
        --arg task_type "$task_type" \
        --arg master "$selected_master" \
        --arg confidence "$confidence" \
        '{
            "service.name": "cortex",
            "cortex.task_id": $task_id,
            "cortex.task_type": $task_type,
            "cortex.routed_to": $master,
            "cortex.routing_confidence": $confidence
        }')

    create_span "moe.route" "INTERNAL" "$trace_context" "$attributes"
}

# ==============================================================================
# SPAN PERSISTENCE
# ==============================================================================

# Save span to file
# Args: span_json, output_file
save_span() {
    local span="$1"
    local output_file="${2:-}"

    if [[ -z "$output_file" ]]; then
        # Default to traces directory with trace_id
        local trace_id=$(echo "$span" | jq -r '.trace_id')
        local span_id=$(echo "$span" | jq -r '.span_id')
        output_file="$PROJECT_ROOT/coordination/observability/traces/${trace_id}_${span_id}.json"
    fi

    echo "$span" | jq '.' > "$output_file"
}

# Append span to trace file (JSONL format)
# Args: span_json
append_span_to_trace() {
    local span="$1"
    local trace_id=$(echo "$span" | jq -r '.trace_id')
    local trace_file="$PROJECT_ROOT/coordination/observability/traces/${trace_id}.jsonl"

    echo "$span" | jq -c '.' >> "$trace_file"
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f create_span
export -f end_span
export -f add_span_event
export -f set_span_attribute
export -f create_master_span
export -f create_worker_span
export -f create_routing_span
export -f save_span
export -f append_span_to_trace
