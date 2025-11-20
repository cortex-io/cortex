#!/usr/bin/env bash
#
# Real-time Event Streaming Server
# Part of Q2 Week 13-14: Event Streaming Infrastructure
#
# Provides real-time access to event stream with filtering, search, and replay
#
# Usage:
#   ./event-stream-server.sh start    # Start streaming server
#   ./event-stream-server.sh stop     # Stop streaming server
#   ./event-stream-server.sh tail     # Tail live events
#   ./event-stream-server.sh query    # Query historical events
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly EVENT_STREAM_DIR="${EVENT_STREAM_DIR:-coordination/observability/events}"
readonly STREAM_PIPE="/tmp/commit-relay-event-stream.pipe"
readonly STREAM_PID_FILE="/tmp/commit-relay-event-stream.pid"

#
# Start streaming server
#
start_streaming_server() {
    if [[ -f "$STREAM_PID_FILE" ]]; then
        local existing_pid=$(cat "$STREAM_PID_FILE")
        if kill -0 "$existing_pid" 2>/dev/null; then
            echo "Event streaming server already running (PID: $existing_pid)"
            return 0
        fi
    fi

    echo "Starting event streaming server..."

    # Create named pipe for streaming
    [[ -p "$STREAM_PIPE" ]] || mkfifo "$STREAM_PIPE"

    # Start background streaming process
    (
        while true; do
            # Watch for new events and stream them
            tail -F "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | while read -r line; do
                echo "$line" > "$STREAM_PIPE" &
            done
            sleep 1
        done
    ) &

    local server_pid=$!
    echo "$server_pid" > "$STREAM_PID_FILE"

    echo "Event streaming server started (PID: $server_pid)"
    echo "Stream available at: $STREAM_PIPE"
}

#
# Stop streaming server
#
stop_streaming_server() {
    if [[ ! -f "$STREAM_PID_FILE" ]]; then
        echo "Event streaming server not running"
        return 0
    fi

    local server_pid=$(cat "$STREAM_PID_FILE")

    if kill -0 "$server_pid" 2>/dev/null; then
        echo "Stopping event streaming server (PID: $server_pid)..."
        kill "$server_pid"
        rm -f "$STREAM_PID_FILE"
        rm -f "$STREAM_PIPE"
        echo "Server stopped"
    else
        echo "Server process not found, cleaning up..."
        rm -f "$STREAM_PID_FILE"
        rm -f "$STREAM_PIPE"
    fi
}

#
# Tail live events with optional filtering
#
tail_events() {
    local category="${1:-}"
    local event_type="${2:-}"
    local severity="${3:-}"

    echo "Tailing live events..."
    echo "Press Ctrl+C to stop"
    echo ""

    local jq_filter="."

    if [[ -n "$category" ]]; then
        jq_filter="$jq_filter | select(.category == \"$category\")"
    fi

    if [[ -n "$event_type" ]]; then
        jq_filter="$jq_filter | select(.event_type == \"$event_type\")"
    fi

    if [[ -n "$severity" ]]; then
        jq_filter="$jq_filter | select(.severity == \"$severity\")"
    fi

    tail -F "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
        jq --unbuffered -c "$jq_filter" | \
        while read -r event; do
            # Pretty print each event
            echo "$event" | jq '.'
            echo "---"
        done
}

#
# Query historical events
#
query_events() {
    local query_type="${1:-all}"
    local args="${2:-}"

    case "$query_type" in
        "category")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -c "select(.category == \"$args\")"
            ;;
        "type")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -c "select(.event_type == \"$args\")"
            ;;
        "trace")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -c "select(.trace_id == \"$args\")"
            ;;
        "severity")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -c "select(.severity == \"$args\")"
            ;;
        "since")
            local since_time="$args"
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -c "select(.timestamp >= \"$since_time\")"
            ;;
        "all")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null
            ;;
        *)
            echo "Unknown query type: $query_type" >&2
            echo "Available: category, type, trace, severity, since, all" >&2
            return 1
            ;;
    esac
}

#
# Replay events from a specific trace
#
replay_trace() {
    local trace_id="${1:?Trace ID required}"

    echo "Replaying trace: $trace_id"
    echo ""

    cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
        jq -c "select(.trace_id == \"$trace_id\")" | \
        jq -s 'sort_by(.timestamp)' | \
        jq -r '.[] | "\(.timestamp) [\(.event_type)] \(.data | tostring)"'
}

#
# Get event statistics
#
get_statistics() {
    local timeframe="${1:-today}"

    echo "Event Statistics ($timeframe)"
    echo ""

    local files=""
    case "$timeframe" in
        "today")
            files="$EVENT_STREAM_DIR/events-$(date +%Y-%m-%d).jsonl"
            ;;
        "week")
            files=$(find "$EVENT_STREAM_DIR" -name "events-*.jsonl" -mtime -7)
            ;;
        "all")
            files=$(find "$EVENT_STREAM_DIR" -name "events-*.jsonl")
            ;;
    esac

    if [[ -z "$files" ]] || ! ls $files >/dev/null 2>&1; then
        echo "No events found for timeframe: $timeframe"
        return 0
    fi

    cat $files | jq -s '{
        total: length,
        by_category: group_by(.category) | map({(.[0].category): length}) | add,
        by_type: group_by(.event_type) | map({(.[0].event_type): length}) | add,
        by_severity: group_by(.severity) | map({(.[0].severity): length}) | add,
        time_range: {
            earliest: (map(.timestamp) | min),
            latest: (map(.timestamp) | max)
        }
    }'
}

#
# Search events by keyword
#
search_events() {
    local keyword="${1:?Search keyword required}"

    echo "Searching for: $keyword"
    echo ""

    cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
        jq -c "select(. | tostring | contains(\"$keyword\"))"
}

#
# Export events to different formats
#
export_events() {
    local format="${1:-json}"
    local output_file="${2:-/dev/stdout}"

    case "$format" in
        "json")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | jq -s '.' > "$output_file"
            ;;
        "csv")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null | \
                jq -r '[.event_id, .timestamp, .event_type, .category, .severity, .source] | @csv' > "$output_file"
            ;;
        "ndjson")
            cat "$EVENT_STREAM_DIR"/events-*.jsonl 2>/dev/null > "$output_file"
            ;;
        *)
            echo "Unknown export format: $format" >&2
            echo "Available: json, csv, ndjson" >&2
            return 1
            ;;
    esac

    if [[ "$output_file" != "/dev/stdout" ]]; then
        echo "Events exported to: $output_file"
    fi
}

#
# Main command dispatcher
#
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        "start")
            start_streaming_server
            ;;
        "stop")
            stop_streaming_server
            ;;
        "restart")
            stop_streaming_server
            sleep 1
            start_streaming_server
            ;;
        "tail")
            tail_events "$@"
            ;;
        "query")
            query_events "$@"
            ;;
        "replay")
            replay_trace "$@"
            ;;
        "stats")
            get_statistics "$@"
            ;;
        "search")
            search_events "$@"
            ;;
        "export")
            export_events "$@"
            ;;
        "help"|"-h"|"--help")
            echo "Event Streaming Server"
            echo ""
            echo "Usage: $0 <command> [args...]"
            echo ""
            echo "Commands:"
            echo "  start                 Start streaming server"
            echo "  stop                  Stop streaming server"
            echo "  restart               Restart streaming server"
            echo "  tail [category] [type] [severity]"
            echo "                        Tail live events with optional filters"
            echo "  query <type> <value>  Query historical events"
            echo "                        Types: category, type, trace, severity, since, all"
            echo "  replay <trace_id>     Replay all events from a trace"
            echo "  stats [timeframe]     Show event statistics"
            echo "                        Timeframes: today, week, all"
            echo "  search <keyword>      Search events by keyword"
            echo "  export <format> [file]"
            echo "                        Export events (json, csv, ndjson)"
            echo "  help                  Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 tail task                    # Tail all task events"
            echo "  $0 tail worker worker_failed    # Tail worker failures"
            echo "  $0 query category error         # Query all error events"
            echo "  $0 query trace trace-123        # Get all events in trace"
            echo "  $0 replay trace-123             # Replay trace chronologically"
            echo "  $0 stats week                   # Weekly statistics"
            echo "  $0 search 'task-456'            # Search for task-456"
            echo "  $0 export csv events.csv        # Export to CSV"
            ;;
        *)
            echo "Unknown command: $command" >&2
            echo "Run '$0 help' for usage information" >&2
            return 1
            ;;
    esac
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
