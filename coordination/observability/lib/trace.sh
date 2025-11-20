#!/bin/bash
# coordination/observability/lib/trace.sh
# Bash tracing library for commit-relay observability
#
# Usage:
#   source coordination/observability/lib/trace.sh
#   trace_operation_start "operation-name" "operation-id"
#   trace_operation_event "event-type" "status" '{"key":"value"}'
#   trace_operation_end "operation-name" "final-status"

# Prevent re-sourcing
if [ -n "${TRACE_LIB_LOADED:-}" ]; then
    return 0
fi
TRACE_LIB_LOADED=1

# Configuration
TRACE_ENABLED="${OBSERVABILITY_ENABLED:-true}"
TRACE_EVENT_DIR="${COMMIT_RELAY_HOME}/coordination/observability/events"
TRACE_EVENT_FILE="$TRACE_EVENT_DIR/all-events.jsonl"

# Ensure event directory exists
mkdir -p "$TRACE_EVENT_DIR" 2>/dev/null || true

# Generate trace ID if not already set
if [ -z "${TRACE_ID:-}" ]; then
    TRACE_ID="trace-$(date +%s)-$(uuidgen 2>/dev/null | cut -d'-' -f1 || echo $RANDOM)"
    export TRACE_ID
fi

# Initialize span counter
SPAN_COUNTER="${SPAN_COUNTER:-0}"

# Generate span ID
generate_span_id() {
    SPAN_COUNTER=$((SPAN_COUNTER + 1))
    echo "${TRACE_ID}.${SPAN_COUNTER}"
}

# Emit a trace event
trace_emit() {
    if [ "$TRACE_ENABLED" != "true" ]; then
        return 0
    fi

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)
    local event_type="$1"
    local status="$2"
    local metadata="${3:-{}}"

    # Build event JSON (compact single-line for JSONL)
    local event=$(cat <<EOF_EVENT
{
  "timestamp": "$timestamp",
  "trace_id": "${TRACE_ID}",
  "span_id": "${CURRENT_SPAN_ID:-${TRACE_ID}.0}",
  "parent_span_id": "${PARENT_SPAN_ID:-}",
  "event_type": "$event_type",
  "status": "$status",
  "component": "${COMPONENT:-script}",
  "component_id": "${COMPONENT_ID:-${CALLING_SCRIPT:-unknown}}",
  "principal": "${COMMIT_RELAY_PRINCIPAL:-system}",
  "metadata": $metadata,
  "context": {
    "hostname": "$(hostname 2>/dev/null || echo unknown)",
    "pid": $$,
    "pwd": "$(pwd)"
  }
}
EOF_EVENT
)

    # Append to event file (compact JSON for JSONL format)
    echo "$event" | jq -c '.' >> "$TRACE_EVENT_FILE" 2>/dev/null || true
}

# Start a traced operation
trace_operation_start() {
    local operation="$1"
    local operation_id="${2:-auto-$(date +%s)}"

    # Generate new span
    CURRENT_SPAN_ID=$(generate_span_id)
    export CURRENT_SPAN_ID

    # Store operation start time
    OPERATION_START_TIME=$(date +%s)
    export OPERATION_START_TIME

    # Emit start event
    trace_emit "operation.start" "info" "{\"operation\":\"$operation\",\"operation_id\":\"$operation_id\"}"
}

# Emit an event during operation
trace_operation_event() {
    local event_type="$1"
    local status="$2"
    local metadata="${3:-{}}"

    trace_emit "$event_type" "$status" "$metadata"
}

# End a traced operation
trace_operation_end() {
    local operation="$1"
    local final_status="${2:-success}"

    # Calculate duration
    local duration=0
    if [ -n "${OPERATION_START_TIME:-}" ]; then
        local end_time=$(date +%s)
        duration=$((end_time - OPERATION_START_TIME))
    fi

    # Emit end event
    trace_emit "operation.end" "$final_status" "{\"operation\":\"$operation\",\"duration_seconds\":$duration}"
}

# Convenience aliases (match init-common.sh API)
trace_start() {
    trace_operation_start "$@"
}

trace_event() {
    trace_operation_event "$@"
}

trace_end() {
    trace_operation_end "$@"
}

# Export functions
export -f trace_emit 2>/dev/null || true
export -f trace_operation_start 2>/dev/null || true
export -f trace_operation_event 2>/dev/null || true
export -f trace_operation_end 2>/dev/null || true
export -f trace_start 2>/dev/null || true
export -f trace_event 2>/dev/null || true
export -f trace_end 2>/dev/null || true

# Log that trace library is loaded
if [ "${COMMIT_RELAY_LOG_LEVEL:-1}" -le 0 ] 2>/dev/null; then
    echo "[TRACE] Observability trace library loaded (trace_id: $TRACE_ID)" >&2
fi
