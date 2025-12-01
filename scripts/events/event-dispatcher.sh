#!/usr/bin/env bash
# Event Dispatcher - Routes events to appropriate handlers
# This is NOT a daemon - it runs once and exits when queue is empty

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUEUE_DIR="$PROJECT_ROOT/coordination/events/queue"
ARCHIVE_DIR="$PROJECT_ROOT/coordination/events/archive"
HANDLERS_DIR="$SCRIPT_DIR/handlers"
LIB_DIR="$SCRIPT_DIR/lib"

# Source utilities
source "$LIB_DIR/event-validator.sh"
source "$LIB_DIR/event-logger.sh"

# Logging
log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >&2
}

# Process single event
process_event() {
    local event_file="$1"
    local event_json

    if [[ ! -f "$event_file" ]]; then
        log "ERROR: Event file not found: $event_file"
        return 1
    fi

    event_json=$(cat "$event_file")

    # Validate event
    if ! validate_event "$event_json" > /dev/null 2>&1; then
        log "ERROR: Invalid event in file: $event_file"
        mv "$event_file" "$ARCHIVE_DIR/invalid/"
        return 1
    fi

    # Extract event details
    local event_id event_type priority
    event_id=$(echo "$event_json" | jq -r '.event_id')
    event_type=$(echo "$event_json" | jq -r '.event_type')
    priority=$(echo "$event_json" | jq -r '.metadata.priority // "medium"')

    log "Processing event: $event_id (type: $event_type, priority: $priority)"

    # Determine handler based on event type
    local handler=""
    case "$event_type" in
        worker.started)
            handler="$HANDLERS_DIR/on-worker-started.sh"
            ;;
        worker.completed)
            handler="$HANDLERS_DIR/on-worker-complete.sh"
            ;;
        worker.failed)
            handler="$HANDLERS_DIR/on-worker-failed.sh"
            ;;
        worker.heartbeat)
            handler="$HANDLERS_DIR/on-worker-heartbeat.sh"
            ;;
        task.created)
            handler="$HANDLERS_DIR/on-task-created.sh"
            ;;
        task.assigned)
            handler="$HANDLERS_DIR/on-task-assigned.sh"
            ;;
        task.completed)
            handler="$HANDLERS_DIR/on-task-complete.sh"
            ;;
        task.failed)
            handler="$HANDLERS_DIR/on-task-failure.sh"
            ;;
        security.scan_completed)
            handler="$HANDLERS_DIR/on-security-scan-completed.sh"
            ;;
        security.vulnerability_found)
            handler="$HANDLERS_DIR/on-security-alert.sh"
            ;;
        routing.decision_made)
            handler="$HANDLERS_DIR/on-routing-decision.sh"
            ;;
        learning.pattern_detected)
            handler="$HANDLERS_DIR/on-learning-pattern.sh"
            ;;
        learning.model_updated)
            handler="$HANDLERS_DIR/on-learning-model-updated.sh"
            ;;
        system.cleanup_needed)
            handler="$HANDLERS_DIR/on-cleanup-needed.sh"
            ;;
        system.health_alert)
            handler="$HANDLERS_DIR/on-health-alert.sh"
            ;;
        daemon.started)
            handler="$HANDLERS_DIR/on-system-startup.sh"
            ;;
        daemon.stopped)
            handler="$HANDLERS_DIR/on-system-shutdown.sh"
            ;;
        *)
            log "WARNING: No handler for event type: $event_type"
            handler=""
            ;;
    esac

    # Execute handler if exists
    if [[ -n "$handler" && -x "$handler" ]]; then
        log "Executing handler: $handler"
        if "$handler" "$event_file"; then
            log "Handler completed successfully: $handler"
        else
            log "ERROR: Handler failed: $handler"
            mv "$event_file" "$ARCHIVE_DIR/failed/"
            return 1
        fi
    else
        log "WARNING: Handler not found or not executable: $handler"
    fi

    # Archive processed event
    local date_dir
    date_dir=$(date +%Y-%m-%d)
    mkdir -p "$ARCHIVE_DIR/$date_dir"
    mv "$event_file" "$ARCHIVE_DIR/$date_dir/"

    log "Event processed and archived: $event_id"
    return 0
}

# Process all events in queue
process_queue() {
    local processed=0
    local failed=0

    # Create archive directories
    mkdir -p "$ARCHIVE_DIR"/{invalid,failed}

    # Process events by priority (high first)
    for priority in critical high medium low; do
        log "Processing $priority priority events..."

        # Find events with this priority
        while IFS= read -r -d '' event_file; do
            local event_json
            event_json=$(cat "$event_file" 2>/dev/null || echo "{}")

            local event_priority
            event_priority=$(echo "$event_json" | jq -r '.metadata.priority // "medium"' 2>/dev/null || echo "medium")

            if [[ "$event_priority" == "$priority" ]]; then
                if process_event "$event_file"; then
                    ((processed++))
                else
                    ((failed++))
                fi
            fi
        done < <(find "$QUEUE_DIR" -name "*.json" -print0 2>/dev/null || true)
    done

    # Process any remaining events without priority
    while IFS= read -r -d '' event_file; do
        if process_event "$event_file"; then
            ((processed++))
        else
            ((failed++))
        fi
    done < <(find "$QUEUE_DIR" -name "*.json" -print0 2>/dev/null || true)

    log "Queue processing complete: $processed processed, $failed failed"
    return 0
}

# Main execution
main() {
    log "Event dispatcher starting..."

    # Check if queue directory exists
    if [[ ! -d "$QUEUE_DIR" ]]; then
        log "Queue directory does not exist: $QUEUE_DIR"
        mkdir -p "$QUEUE_DIR"
        log "Queue is empty, exiting"
        exit 0
    fi

    # Check if queue has events
    local event_count
    event_count=$(find "$QUEUE_DIR" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

    if [[ "$event_count" -eq 0 ]]; then
        log "Queue is empty, exiting"
        exit 0
    fi

    log "Found $event_count events in queue"

    # Process the queue
    process_queue

    log "Event dispatcher finished"
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
