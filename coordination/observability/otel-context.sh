#!/usr/bin/env bash
# OpenTelemetry Context Propagation
# Handles trace ID, span ID generation and context passing

set -euo pipefail

# ==============================================================================
# TRACE CONTEXT GENERATION
# ==============================================================================

# Generate a random 16-byte trace ID (32 hex characters)
generate_trace_id() {
    local trace_id=$(openssl rand -hex 16 2>/dev/null || \
                     cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 32 | head -n 1)
    echo "$trace_id"
}

# Generate a random 8-byte span ID (16 hex characters)
generate_span_id() {
    local span_id=$(openssl rand -hex 8 2>/dev/null || \
                    cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 16 | head -n 1)
    echo "$span_id"
}

# Generate a timestamp in nanoseconds since epoch
generate_timestamp_ns() {
    local timestamp_sec=$(date +%s)
    local timestamp_ns="${timestamp_sec}000000000"
    echo "$timestamp_ns"
}

# Generate ISO 8601 timestamp
generate_timestamp_iso() {
    # Try GNU date with nanoseconds, fallback to basic ISO 8601
    if date --version 2>/dev/null | grep -q "GNU"; then
        date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
    else
        # macOS/BSD date doesn't support %N, use basic format
        date -u +"%Y-%m-%dT%H:%M:%SZ"
    fi
}

# ==============================================================================
# CONTEXT MANAGEMENT
# ==============================================================================

# Create a new trace context
# Returns: JSON with trace_id, span_id, timestamp
create_trace_context() {
    local trace_id=$(generate_trace_id)
    local span_id=$(generate_span_id)
    local timestamp=$(generate_timestamp_iso)

    jq -nc \
        --arg trace_id "$trace_id" \
        --arg span_id "$span_id" \
        --arg timestamp "$timestamp" \
        '{
            trace_id: $trace_id,
            span_id: $span_id,
            parent_span_id: null,
            timestamp: $timestamp,
            trace_flags: "01"
        }'
}

# Create a child span from parent context
# Args: parent_trace_id, parent_span_id
create_child_span() {
    local parent_trace_id="$1"
    local parent_span_id="$2"
    local new_span_id=$(generate_span_id)
    local timestamp=$(generate_timestamp_iso)

    jq -nc \
        --arg trace_id "$parent_trace_id" \
        --arg span_id "$new_span_id" \
        --arg parent_span_id "$parent_span_id" \
        --arg timestamp "$timestamp" \
        '{
            trace_id: $trace_id,
            span_id: $span_id,
            parent_span_id: $parent_span_id,
            timestamp: $timestamp,
            trace_flags: "01"
        }'
}

# Extract trace context from task metadata
# Args: task_file_path
extract_trace_context() {
    local task_file="$1"

    if [[ ! -f "$task_file" ]]; then
        echo "{}" >&2
        return 1
    fi

    jq -r '.trace_context // {}' "$task_file" 2>/dev/null || echo "{}"
}

# Inject trace context into task metadata
# Args: task_file_path, trace_context_json
inject_trace_context() {
    local task_file="$1"
    local trace_context="$2"

    if [[ ! -f "$task_file" ]]; then
        echo "Error: Task file not found: $task_file" >&2
        return 1
    fi

    # Create temp file with trace context injected
    local temp_file="${task_file}.tmp"
    jq --argjson ctx "$trace_context" '. + {trace_context: $ctx}' "$task_file" > "$temp_file"
    mv "$temp_file" "$task_file"
}

# ==============================================================================
# W3C TRACE CONTEXT FORMAT
# ==============================================================================

# Format context as W3C traceparent header
# Args: trace_id, span_id
format_traceparent() {
    local trace_id="$1"
    local span_id="$2"
    local version="00"
    local trace_flags="01"

    echo "${version}-${trace_id}-${span_id}-${trace_flags}"
}

# Parse W3C traceparent header
# Args: traceparent_string
parse_traceparent() {
    local traceparent="$1"

    IFS='-' read -r version trace_id span_id trace_flags <<< "$traceparent"

    jq -nc \
        --arg trace_id "$trace_id" \
        --arg span_id "$span_id" \
        --arg trace_flags "$trace_flags" \
        '{
            trace_id: $trace_id,
            span_id: $span_id,
            trace_flags: $trace_flags
        }'
}

# ==============================================================================
# ENVIRONMENT VARIABLE CONTEXT
# ==============================================================================

# Export context to environment variables (for child processes)
export_context_env() {
    local trace_id="$1"
    local span_id="$2"

    export OTEL_TRACE_ID="$trace_id"
    export OTEL_SPAN_ID="$span_id"
    export OTEL_TRACEPARENT=$(format_traceparent "$trace_id" "$span_id")
}

# Import context from environment variables
import_context_env() {
    if [[ -n "${OTEL_TRACE_ID:-}" && -n "${OTEL_SPAN_ID:-}" ]]; then
        jq -nc \
            --arg trace_id "$OTEL_TRACE_ID" \
            --arg span_id "$OTEL_SPAN_ID" \
            '{
                trace_id: $trace_id,
                span_id: $span_id
            }'
    else
        echo "{}"
    fi
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f generate_trace_id
export -f generate_span_id
export -f generate_timestamp_ns
export -f generate_timestamp_iso
export -f create_trace_context
export -f create_child_span
export -f extract_trace_context
export -f inject_trace_context
export -f format_traceparent
export -f parse_traceparent
export -f export_context_env
export -f import_context_env
