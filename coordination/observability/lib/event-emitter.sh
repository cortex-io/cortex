#!/usr/bin/env bash
#
# Event Emitter Library for Unified Observability
# Part of Q2 Week 13-14: Event Streaming Infrastructure
#
# Usage:
#   source coordination/observability/lib/event-emitter.sh
#   emit_event "task_created" "task" '{"task_id":"task-123","priority":"high"}'
#

set -euo pipefail

# Configuration
readonly EVENT_STREAM_DIR="${EVENT_STREAM_DIR:-coordination/observability/events}"
readonly EVENT_BUFFER_DIR="${EVENT_BUFFER_DIR:-coordination/observability/events/.buffer}"
readonly EVENT_SCHEMA="${EVENT_SCHEMA:-coordination/observability/schemas/event-schema.json}"
readonly ENABLE_VALIDATION="${ENABLE_VALIDATION:-false}"  # Disabled by default for performance
readonly ENABLE_BUFFERING="${ENABLE_BUFFERING:-true}"     # Enabled by default for async emission
readonly BUFFER_FLUSH_SIZE="${BUFFER_FLUSH_SIZE:-100}"
readonly BUFFER_FLUSH_INTERVAL="${BUFFER_FLUSH_INTERVAL:-5}"

# Initialize directories
mkdir -p "$EVENT_STREAM_DIR" "$EVENT_BUFFER_DIR"

# Cache static values for performance
readonly CACHED_HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
readonly CACHED_PID=$$

# Global trace context (can be set externally)
export TRACE_ID="${TRACE_ID:-}"
export SPAN_ID="${SPAN_ID:-}"
export PARENT_SPAN_ID="${PARENT_SPAN_ID:-}"

#
# Generate a unique event ID
#
generate_event_id() {
    local timestamp=$(date +%s%N | cut -b1-13)
    local random=$(openssl rand -hex 4)
    echo "evt-${timestamp}-${random}"
}

#
# Generate a trace ID
#
generate_trace_id() {
    local timestamp=$(date +%s%N | cut -b1-13)
    local random=$(openssl rand -hex 6)
    echo "trace-${timestamp}-${random}"
}

#
# Generate a span ID
#
generate_span_id() {
    local random=$(openssl rand -hex 6)
    echo "span-${random}"
}

#
# Get current trace context or create new one
#
ensure_trace_context() {
    if [[ -z "$TRACE_ID" ]]; then
        export TRACE_ID=$(generate_trace_id)
    fi
    if [[ -z "$SPAN_ID" ]]; then
        export SPAN_ID=$(generate_span_id)
    fi
}

#
# Start a new span within current trace
#
start_span() {
    local span_name="${1:-unnamed_span}"

    ensure_trace_context

    export PARENT_SPAN_ID="$SPAN_ID"
    export SPAN_ID=$(generate_span_id)

    # Emit span start event
    emit_event "span_started" "system" "{\"span_name\":\"$span_name\",\"parent_span_id\":\"$PARENT_SPAN_ID\"}" "debug"
}

#
# End current span
#
end_span() {
    local duration_ms="${1:-0}"

    emit_event "span_ended" "system" "{\"duration_ms\":$duration_ms}" "debug"

    # Restore parent span
    if [[ -n "$PARENT_SPAN_ID" ]]; then
        export SPAN_ID="$PARENT_SPAN_ID"
        export PARENT_SPAN_ID=""
    fi
}

#
# Validate event against schema using jq
# Returns 0 if valid, 1 if invalid
#
validate_event() {
    local event_json="$1"

    if [[ "$ENABLE_VALIDATION" != "true" ]]; then
        return 0
    fi

    if [[ ! -f "$EVENT_SCHEMA" ]]; then
        echo "Warning: Event schema not found at $EVENT_SCHEMA" >&2
        return 0
    fi

    # Basic validation using jq
    if ! echo "$event_json" | jq empty 2>/dev/null; then
        echo "Error: Invalid JSON in event" >&2
        return 1
    fi

    # Check required fields
    local required_fields=("event_id" "timestamp" "event_type" "category" "source")
    for field in "${required_fields[@]}"; do
        if ! echo "$event_json" | jq -e ".$field" >/dev/null 2>&1; then
            echo "Error: Missing required field: $field" >&2
            return 1
        fi
    done

    return 0
}

#
# Enrich event with system metadata
#
enrich_event() {
    local event_json="$1"

    # Use cached values for performance
    # Merge in context
    echo "$event_json" | jq -c --arg hostname "$CACHED_HOSTNAME" \
                                --arg pid "$CACHED_PID" \
                                '.context.hostname = $hostname | .context.pid = ($pid | tonumber)' 2>/dev/null || echo "$event_json"
}

#
# Write event to buffer (for async batching)
#
buffer_event() {
    local event_json="$1"
    local buffer_file="$EVENT_BUFFER_DIR/buffer-$(date +%s).jsonl"

    echo "$event_json" >> "$buffer_file"

    # Check if buffer needs flushing
    local buffer_size=$(find "$EVENT_BUFFER_DIR" -name "buffer-*.jsonl" -exec cat {} \; | wc -l)
    if [[ $buffer_size -ge $BUFFER_FLUSH_SIZE ]]; then
        flush_buffer &  # Async flush
    fi
}

#
# Flush buffer to main event stream
#
flush_buffer() {
    local stream_file="$EVENT_STREAM_DIR/events-$(date +%Y-%m-%d).jsonl"

    # Move all buffer files to stream
    if ls "$EVENT_BUFFER_DIR"/buffer-*.jsonl >/dev/null 2>&1; then
        cat "$EVENT_BUFFER_DIR"/buffer-*.jsonl >> "$stream_file"
        rm -f "$EVENT_BUFFER_DIR"/buffer-*.jsonl
    fi
}

#
# Write event directly to stream (synchronous)
#
write_event_direct() {
    local event_json="$1"
    local stream_file="$EVENT_STREAM_DIR/events-$(date +%Y-%m-%d).jsonl"

    echo "$event_json" >> "$stream_file"
}

#
# Main event emission function
#
# Arguments:
#   $1 - event_type (required): Type of event from schema enum
#   $2 - category (required): Event category (task/worker/master/system/error/learning/routing)
#   $3 - data (required): JSON object with event-specific data
#   $4 - severity (optional): Event severity (debug/info/warn/error/critical), default: info
#   $5 - source (optional): Event source, default: script name
#
emit_event() {
    local event_type="${1:?Event type required}"
    local category="${2:?Category required}"
    local data="${3:?Data required}"
    local severity="${4:-info}"
    local source="${5:-$(basename "${BASH_SOURCE[1]}" .sh)}"

    local start_time=$(date +%s%N)

    # Ensure trace context
    ensure_trace_context

    # Generate event ID
    local event_id=$(generate_event_id)

    # Get timestamp
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S%z")

    # Build event JSON
    local event_json=$(jq -n \
        --arg event_id "$event_id" \
        --arg timestamp "$timestamp" \
        --arg event_type "$event_type" \
        --arg category "$category" \
        --arg source "$source" \
        --arg severity "$severity" \
        --arg trace_id "$TRACE_ID" \
        --arg span_id "$SPAN_ID" \
        --arg parent_span_id "$PARENT_SPAN_ID" \
        --argjson data "$data" \
        '{
            event_id: $event_id,
            timestamp: $timestamp,
            event_type: $event_type,
            category: $category,
            source: $source,
            severity: $severity,
            trace_id: $trace_id,
            span_id: $span_id,
            parent_span_id: (if $parent_span_id != "" then $parent_span_id else null end),
            data: $data,
            metadata: {},
            tags: [],
            metrics: {},
            context: {}
        }')

    # Enrich event
    event_json=$(enrich_event "$event_json")

    # Validate event
    if ! validate_event "$event_json"; then
        echo "Error: Event validation failed for $event_type" >&2
        return 1
    fi

    # Write event (buffered or direct)
    if [[ "$ENABLE_BUFFERING" == "true" ]]; then
        buffer_event "$event_json"
    else
        write_event_direct "$event_json"
    fi

    # Calculate overhead
    local end_time=$(date +%s%N)
    local duration_ns=$((end_time - start_time))
    local duration_ms=$((duration_ns / 1000000))

    # Warn if overhead exceeds 10ms
    if [[ $duration_ms -gt 10 ]]; then
        echo "Warning: Event emission took ${duration_ms}ms (exceeds 10ms target)" >&2
    fi

    return 0
}

#
# Emit task event (convenience wrapper)
#
emit_task_event() {
    local event_type="$1"
    local task_id="$2"
    local data="$3"
    local severity="${4:-info}"

    local enriched_data=$(echo "$data" | jq --arg task_id "$task_id" '. + {task_id: $task_id}')
    emit_event "$event_type" "task" "$enriched_data" "$severity"
}

#
# Emit worker event (convenience wrapper)
#
emit_worker_event() {
    local event_type="$1"
    local worker_id="$2"
    local data="$3"
    local severity="${4:-info}"

    local enriched_data=$(echo "$data" | jq --arg worker_id "$worker_id" '. + {worker_id: $worker_id}')
    emit_event "$event_type" "worker" "$enriched_data" "$severity"
}

#
# Emit error event (convenience wrapper)
#
emit_error_event() {
    local error_message="$1"
    local error_code="${2:-unknown}"
    local data="${3:-{}}"

    local error_data=$(echo "$data" | jq --arg msg "$error_message" \
                                          --arg code "$error_code" \
                                          '. + {error_message: $msg, error_code: $code}')
    emit_event "error_occurred" "error" "$error_data" "error"
}

#
# Query events by criteria
#
query_events() {
    local category="${1:-}"
    local event_type="${2:-}"
    local since="${3:-}"  # ISO timestamp or relative like "1h"

    local stream_file="$EVENT_STREAM_DIR/events-$(date +%Y-%m-%d).jsonl"

    if [[ ! -f "$stream_file" ]]; then
        echo "[]"
        return
    fi

    local jq_filter="."

    if [[ -n "$category" ]]; then
        jq_filter="$jq_filter | select(.category == \"$category\")"
    fi

    if [[ -n "$event_type" ]]; then
        jq_filter="$jq_filter | select(.event_type == \"$event_type\")"
    fi

    cat "$stream_file" | jq -s "map($jq_filter)"
}

#
# Get event count by category
#
get_event_stats() {
    local stream_file="$EVENT_STREAM_DIR/events-$(date +%Y-%m-%d).jsonl"

    if [[ ! -f "$stream_file" ]]; then
        echo '{"total": 0, "by_category": {}, "by_severity": {}}'
        return
    fi

    cat "$stream_file" | jq -s '{
        total: length,
        by_category: group_by(.category) | map({key: .[0].category, value: length}) | from_entries,
        by_severity: group_by(.severity) | map({key: .[0].severity, value: length}) | from_entries
    }'
}

# Auto-flush buffer on script exit
trap flush_buffer EXIT

# Export functions
export -f emit_event
export -f emit_task_event
export -f emit_worker_event
export -f emit_error_event
export -f start_span
export -f end_span
export -f query_events
export -f get_event_stats
