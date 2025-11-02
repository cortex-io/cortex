#!/bin/bash
# scripts/lib/logging.sh
# Structured logging utilities for commit-relay

# Log levels
declare -r LOG_LEVEL_DEBUG=0
declare -r LOG_LEVEL_INFO=1
declare -r LOG_LEVEL_WARN=2
declare -r LOG_LEVEL_ERROR=3
declare -r LOG_LEVEL_CRITICAL=4

# Current log level (default: INFO)
COMMIT_RELAY_LOG_LEVEL="${COMMIT_RELAY_LOG_LEVEL:-$LOG_LEVEL_INFO}"

# Log directory
LOG_DIR="${COMMIT_RELAY_HOME:-$(pwd)}/agents/logs/system"
mkdir -p "$LOG_DIR"

# Get log level number from string
get_log_level_number() {
    local level=$(echo "$1" | tr '[:lower:]' '[:upper:]')
    case "$level" in
        DEBUG) echo $LOG_LEVEL_DEBUG ;;
        INFO) echo $LOG_LEVEL_INFO ;;
        WARN|WARNING) echo $LOG_LEVEL_WARN ;;
        ERROR) echo $LOG_LEVEL_ERROR ;;
        CRITICAL) echo $LOG_LEVEL_CRITICAL ;;
        *) echo $LOG_LEVEL_INFO ;;
    esac
}

# Log message with level
log() {
    local level=$1
    local message=$2
    local context="${3:-}"

    # Check if should log based on level
    local level_num=$(get_log_level_number "$level")
    if [ "$level_num" -lt "$COMMIT_RELAY_LOG_LEVEL" ]; then
        return 0
    fi

    local timestamp=$(date -Iseconds 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")
    local pid=$$

    # Console output with colors
    local color=""
    local level_upper=$(echo "$level" | tr '[:lower:]' '[:upper:]')
    case "$level_upper" in
        DEBUG) color="\033[0;36m" ;;    # Cyan
        INFO) color="\033[0;32m" ;;     # Green
        WARN) color="\033[0;33m" ;;     # Yellow
        ERROR) color="\033[0;31m" ;;    # Red
        CRITICAL) color="\033[1;31m" ;; # Bold Red
    esac
    local reset="\033[0m"

    echo -e "${color}[$timestamp] $level:${reset} $message" >&2

    # Structured JSONL log
    local log_file="$LOG_DIR/$(date +%Y-%m-%d).jsonl"
    local json_message=$(jq -n \
        --arg ts "$timestamp" \
        --arg lvl "$level" \
        --arg msg "$message" \
        --arg ctx "$context" \
        --arg pid "$pid" \
        '{timestamp: $ts, level: $lvl, message: $msg, context: $ctx, pid: $pid}')

    echo "$json_message" >> "$log_file"

    # Send to dashboard if significant
    if [ "$level_num" -ge "$LOG_LEVEL_ERROR" ]; then
        broadcast_dashboard_event "system_$level" "$message" 2>/dev/null || true
    fi
}

# Convenience functions
log_debug() { log "DEBUG" "$1" "${2:-}"; }
log_info() { log "INFO" "$1" "${2:-}"; }
log_warn() { log "WARN" "$1" "${2:-}"; }
log_error() { log "ERROR" "$1" "${2:-}"; }
log_critical() { log "CRITICAL" "$1" "${2:-}"; }

# Broadcast event to dashboard
broadcast_dashboard_event() {
    local event_type=$1
    local event_data=$2

    local event_file="${COMMIT_RELAY_HOME:-$(pwd)}/coordination/dashboard-events.jsonl"

    if [ ! -w "$event_file" ]; then
        return 0
    fi

    local event_id="evt-$(date +%s)-$$"
    local timestamp=$(date -Iseconds 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")

    local event=$(jq -n \
        --arg id "$event_id" \
        --arg ts "$timestamp" \
        --arg type "$event_type" \
        --arg data "$event_data" \
        '{id: $id, timestamp: $ts, type: $type, data: $data, source: "automation"}')

    echo "$event" >> "$event_file"
}

# Log section headers
log_section() {
    local title=$1
    log_info ""
    log_info "=========================================="
    log_info "$title"
    log_info "=========================================="
}
