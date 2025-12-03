#!/usr/bin/env bash
# Event Replay Tool - Replay archived events for debugging and testing
#
# Usage:
#   ./event-replay.sh --event-id <event_id>              # Replay single event
#   ./event-replay.sh --date <YYYY-MM-DD>                # Replay all events from date
#   ./event-replay.sh --type <pattern> --date <date>     # Replay filtered events
#   ./event-replay.sh --source <pattern> --date <date>   # Replay by source
#   ./event-replay.sh --dry-run --date <date>            # Show what would be replayed
#   ./event-replay.sh --verbose --date <date>            # Verbose output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARCHIVE_DIR="$PROJECT_ROOT/coordination/events/archive"
QUEUE_DIR="$PROJECT_ROOT/coordination/events/queue"
HANDLERS_DIR="$SCRIPT_DIR/handlers"
LIB_DIR="$SCRIPT_DIR/lib"

# Source utilities
source "$LIB_DIR/event-validator.sh"
source "$LIB_DIR/event-logger.sh"

# Configuration
DRY_RUN=false
VERBOSE=false
DIRECT_INVOKE=true  # Invoke handlers directly vs re-queueing
EVENT_ID=""
DATE_FILTER=""
TYPE_FILTER=""
SOURCE_FILTER=""
PRIORITY_FILTER=""
CORRELATION_FILTER=""

# Statistics
REPLAY_COUNT=0
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $*" >&2
    fi
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Usage information
usage() {
    cat << EOF
Event Replay Tool - Replay archived events for debugging

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --event-id <id>         Replay specific event by ID
    --date <YYYY-MM-DD>     Replay all events from specific date
    --type <pattern>        Filter by event type (regex pattern, e.g. "worker.*")
    --source <pattern>      Filter by event source (regex pattern)
    --priority <level>      Filter by priority (critical|high|medium|low)
    --correlation <id>      Filter by correlation ID
    --dry-run               Show what would be replayed without executing
    --verbose               Enable verbose output
    --queue                 Re-queue events instead of direct handler invocation
    --help                  Show this help message

EXAMPLES:
    # Replay specific event
    $0 --event-id evt_20251201_123456_abc123

    # Replay all events from a date
    $0 --date 2025-12-01

    # Replay only worker events from a date
    $0 --type "worker.*" --date 2025-12-01

    # Replay failed events
    $0 --date 2025-12-01 --source ".*" --verbose

    # Dry run to preview
    $0 --date 2025-12-01 --dry-run

    # Replay high priority security events
    $0 --type "security.*" --priority high --date 2025-12-01

    # Replay all events for a specific task
    $0 --correlation task-123 --date 2025-12-01

NOTES:
    - By default, handlers are invoked directly for immediate execution
    - Use --queue to re-queue events for normal dispatcher processing
    - Dry-run mode validates events and shows what would be replayed
    - Archive directory: $ARCHIVE_DIR
    - Event queue: $QUEUE_DIR

EOF
    exit 1
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --event-id)
                EVENT_ID="$2"
                shift 2
                ;;
            --date)
                DATE_FILTER="$2"
                shift 2
                ;;
            --type)
                TYPE_FILTER="$2"
                shift 2
                ;;
            --source)
                SOURCE_FILTER="$2"
                shift 2
                ;;
            --priority)
                PRIORITY_FILTER="$2"
                shift 2
                ;;
            --correlation)
                CORRELATION_FILTER="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --queue)
                DIRECT_INVOKE=false
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ -z "$EVENT_ID" && -z "$DATE_FILTER" ]]; then
        log_error "Must specify either --event-id or --date"
        usage
    fi

    if [[ -n "$DATE_FILTER" ]]; then
        if ! [[ "$DATE_FILTER" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
            log_error "Invalid date format. Use YYYY-MM-DD"
            exit 1
        fi
    fi

    if [[ -n "$PRIORITY_FILTER" ]]; then
        if ! [[ "$PRIORITY_FILTER" =~ ^(critical|high|medium|low)$ ]]; then
            log_error "Invalid priority. Use: critical, high, medium, or low"
            exit 1
        fi
    fi
}

# Find event file by ID
find_event_by_id() {
    local event_id="$1"

    log_verbose "Searching for event ID: $event_id"

    # Search in archive
    local found_file
    found_file=$(find "$ARCHIVE_DIR" -type f -name "${event_id}.json" 2>/dev/null | head -1)

    if [[ -z "$found_file" ]]; then
        # Try failed directory
        found_file=$(find "$ARCHIVE_DIR/failed" -type f -name "${event_id}.json" 2>/dev/null | head -1)
    fi

    if [[ -z "$found_file" ]]; then
        # Try invalid directory
        found_file=$(find "$ARCHIVE_DIR/invalid" -type f -name "${event_id}.json" 2>/dev/null | head -1)
    fi

    echo "$found_file"
}

# Find events by date and filters
find_events_by_date() {
    local date="$1"
    local date_dir="$ARCHIVE_DIR/$date"

    if [[ ! -d "$date_dir" ]]; then
        log_error "No archived events found for date: $date"
        exit 1
    fi

    log_verbose "Searching for events in: $date_dir"

    # Find all event files
    find "$date_dir" -type f -name "*.json" 2>/dev/null | sort
}

# Check if event matches filters
event_matches_filters() {
    local event_json="$1"

    # Extract fields
    local event_type
    local source
    local priority
    local correlation_id

    event_type=$(echo "$event_json" | jq -r '.event_type')
    source=$(echo "$event_json" | jq -r '.source')
    priority=$(echo "$event_json" | jq -r '.metadata.priority // "medium"')
    correlation_id=$(echo "$event_json" | jq -r '.correlation_id // ""')

    # Check type filter
    if [[ -n "$TYPE_FILTER" ]]; then
        if ! echo "$event_type" | grep -qE "$TYPE_FILTER"; then
            log_verbose "Event filtered out by type: $event_type (filter: $TYPE_FILTER)"
            return 1
        fi
    fi

    # Check source filter
    if [[ -n "$SOURCE_FILTER" ]]; then
        if ! echo "$source" | grep -qE "$SOURCE_FILTER"; then
            log_verbose "Event filtered out by source: $source (filter: $SOURCE_FILTER)"
            return 1
        fi
    fi

    # Check priority filter
    if [[ -n "$PRIORITY_FILTER" ]]; then
        if [[ "$priority" != "$PRIORITY_FILTER" ]]; then
            log_verbose "Event filtered out by priority: $priority (filter: $PRIORITY_FILTER)"
            return 1
        fi
    fi

    # Check correlation filter
    if [[ -n "$CORRELATION_FILTER" ]]; then
        if [[ "$correlation_id" != "$CORRELATION_FILTER" ]]; then
            log_verbose "Event filtered out by correlation: $correlation_id (filter: $CORRELATION_FILTER)"
            return 1
        fi
    fi

    return 0
}

# Get handler for event type
get_handler() {
    local event_type="$1"
    local handler=""

    case "$event_type" in
        worker.completed)
            handler="$HANDLERS_DIR/on-worker-complete.sh"
            ;;
        worker.failed)
            handler="$HANDLERS_DIR/on-worker-failed.sh"
            ;;
        worker.heartbeat)
            handler="$HANDLERS_DIR/on-worker-heartbeat.sh"
            ;;
        task.completed)
            handler="$HANDLERS_DIR/on-task-complete.sh"
            ;;
        task.failed)
            handler="$HANDLERS_DIR/on-task-failure.sh"
            ;;
        security.scan_completed | security.vulnerability_found)
            handler="$HANDLERS_DIR/on-security-alert.sh"
            ;;
        routing.decision_made)
            handler="$HANDLERS_DIR/on-routing-decision.sh"
            ;;
        learning.pattern_detected)
            handler="$HANDLERS_DIR/on-learning-pattern.sh"
            ;;
        system.cleanup_needed)
            handler="$HANDLERS_DIR/on-cleanup-needed.sh"
            ;;
        system.health_alert)
            handler="$HANDLERS_DIR/on-health-alert.sh"
            ;;
        *)
            log_verbose "No handler defined for event type: $event_type"
            handler=""
            ;;
    esac

    echo "$handler"
}

# Replay single event
replay_event() {
    local event_file="$1"
    local event_json

    if [[ ! -f "$event_file" ]]; then
        log_error "Event file not found: $event_file"
        ((FAILED_COUNT++))
        return 1
    fi

    event_json=$(cat "$event_file")

    # Validate event
    if ! validate_event "$event_json" > /dev/null 2>&1; then
        log_error "Invalid event in file: $event_file"
        ((FAILED_COUNT++))
        return 1
    fi

    # Check filters
    if ! event_matches_filters "$event_json"; then
        log_verbose "Event skipped by filters: $(basename "$event_file")"
        ((SKIPPED_COUNT++))
        return 0
    fi

    # Extract event details
    local event_id event_type priority source
    event_id=$(echo "$event_json" | jq -r '.event_id')
    event_type=$(echo "$event_json" | jq -r '.event_type')
    priority=$(echo "$event_json" | jq -r '.metadata.priority // "medium"')
    source=$(echo "$event_json" | jq -r '.source')

    ((REPLAY_COUNT++))

    log_info "Replaying event: $event_id"
    log_verbose "  Type: $event_type"
    log_verbose "  Source: $source"
    log_verbose "  Priority: $priority"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "  [DRY-RUN] Would replay this event"
        ((SUCCESS_COUNT++))
        return 0
    fi

    # Replay method: direct invocation or re-queue
    if [[ "$DIRECT_INVOKE" == "true" ]]; then
        # Direct handler invocation
        local handler
        handler=$(get_handler "$event_type")

        if [[ -z "$handler" ]]; then
            log_warn "No handler available for: $event_type"
            ((SKIPPED_COUNT++))
            return 0
        fi

        if [[ ! -x "$handler" ]]; then
            log_error "Handler not executable: $handler"
            ((FAILED_COUNT++))
            return 1
        fi

        log_verbose "  Invoking handler: $handler"

        # Create temporary file for handler
        local temp_file
        temp_file=$(mktemp)
        echo "$event_json" > "$temp_file"

        if "$handler" "$temp_file" > /dev/null 2>&1; then
            log_info "  Handler executed successfully"
            ((SUCCESS_COUNT++))
            rm -f "$temp_file"
            return 0
        else
            log_error "  Handler failed"
            ((FAILED_COUNT++))
            rm -f "$temp_file"
            return 1
        fi
    else
        # Re-queue for dispatcher processing
        log_verbose "  Re-queueing event for dispatcher"

        mkdir -p "$QUEUE_DIR"
        local queue_file="$QUEUE_DIR/${event_id}.json"

        echo "$event_json" > "$queue_file"
        log_info "  Event queued: $queue_file"
        ((SUCCESS_COUNT++))
        return 0
    fi
}

# Replay by event ID
replay_by_id() {
    local event_id="$1"

    log_info "Searching for event ID: $event_id"

    local event_file
    event_file=$(find_event_by_id "$event_id")

    if [[ -z "$event_file" ]]; then
        log_error "Event not found: $event_id"
        exit 1
    fi

    log_info "Found event at: $event_file"

    replay_event "$event_file"
}

# Replay by date
replay_by_date() {
    local date="$1"

    log_info "Replaying events from date: $date"

    if [[ -n "$TYPE_FILTER" ]]; then
        log_info "Type filter: $TYPE_FILTER"
    fi
    if [[ -n "$SOURCE_FILTER" ]]; then
        log_info "Source filter: $SOURCE_FILTER"
    fi
    if [[ -n "$PRIORITY_FILTER" ]]; then
        log_info "Priority filter: $PRIORITY_FILTER"
    fi
    if [[ -n "$CORRELATION_FILTER" ]]; then
        log_info "Correlation filter: $CORRELATION_FILTER"
    fi

    local event_files
    event_files=$(find_events_by_date "$date")

    if [[ -z "$event_files" ]]; then
        log_warn "No events found for date: $date"
        exit 0
    fi

    local total_events
    total_events=$(echo "$event_files" | wc -l | tr -d ' ')
    log_info "Found $total_events event(s) to process"

    # Process each event
    while IFS= read -r event_file; do
        if [[ -n "$event_file" ]]; then
            replay_event "$event_file"
        fi
    done <<< "$event_files"
}

# Print summary
print_summary() {
    echo ""
    log_info "========================================="
    log_info "Event Replay Summary"
    log_info "========================================="
    log_info "Total processed:  $REPLAY_COUNT"
    log_info "Successful:       $SUCCESS_COUNT"
    log_info "Failed:           $FAILED_COUNT"
    log_info "Skipped:          $SKIPPED_COUNT"
    log_info "========================================="

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Mode: DRY RUN (no events were actually replayed)"
    elif [[ "$DIRECT_INVOKE" == "true" ]]; then
        log_info "Mode: DIRECT INVOCATION"
    else
        log_info "Mode: RE-QUEUED FOR DISPATCHER"
        log_info "Run event-dispatcher.sh to process queued events"
    fi
    echo ""
}

# Main execution
main() {
    log_info "Event Replay Tool Starting..."

    if [[ $# -eq 0 ]]; then
        usage
    fi

    parse_args "$@"
    validate_args

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY-RUN MODE: No events will be replayed"
    fi

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "VERBOSE MODE: Enabled"
    fi

    # Replay events
    if [[ -n "$EVENT_ID" ]]; then
        replay_by_id "$EVENT_ID"
    elif [[ -n "$DATE_FILTER" ]]; then
        replay_by_date "$DATE_FILTER"
    fi

    # Print summary
    print_summary

    # Exit with appropriate code
    if [[ $FAILED_COUNT -gt 0 ]]; then
        exit 1
    fi

    exit 0
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
