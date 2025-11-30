#!/usr/bin/env bash
# scripts/show-trace.sh
# Trace aggregation and viewer for distributed tracing

set -euo pipefail

# Source dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(dirname "$SCRIPT_DIR")}"

source "$SCRIPT_DIR/lib/correlation.sh"
source "$SCRIPT_DIR/lib/traced-logging.sh"

# Colors for output
COLOR_RESET='\033[0m'
COLOR_BOLD='\033[1m'
COLOR_DIM='\033[2m'
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'
COLOR_BLUE='\033[0;34m'
COLOR_MAGENTA='\033[0;35m'
COLOR_CYAN='\033[0;36m'

# Display usage
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] [CORRELATION_ID]

Trace aggregation and viewer for distributed tracing.

OPTIONS:
    -l, --list              List recent traces
    -s, --summary           Show summary only
    -f, --full              Show full trace details (default)
    -j, --json              Output as JSON
    -v, --verbose           Verbose output
    -n, --limit NUM         Limit number of traces (default: 20)
    -t, --type TYPE         Filter by event type
    -h, --help              Show this help message

EXAMPLES:
    # List recent traces
    $(basename "$0") --list

    # Show specific trace
    $(basename "$0") corr-1732741200-a3f4b2-coordinator

    # Show trace summary as JSON
    $(basename "$0") --summary --json corr-1732741200-a3f4b2-coordinator

    # List last 50 traces
    $(basename "$0") --list --limit 50

EOF
}

# Parse arguments
MODE="full"
OUTPUT_FORMAT="text"
VERBOSE=false
LIMIT=20
EVENT_TYPE=""
CORRELATION_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--list)
            MODE="list"
            shift
            ;;
        -s|--summary)
            MODE="summary"
            shift
            ;;
        -f|--full)
            MODE="full"
            shift
            ;;
        -j|--json)
            OUTPUT_FORMAT="json"
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -n|--limit)
            LIMIT="$2"
            shift 2
            ;;
        -t|--type)
            EVENT_TYPE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
        *)
            CORRELATION_ID="$1"
            shift
            ;;
    esac
done

# List traces
list_traces_display() {
    local traces=$(list_traces "$LIMIT")

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        echo "$traces" | jq -s '.'
        return 0
    fi

    echo -e "${COLOR_BOLD}Recent Traces:${COLOR_RESET}\n"

    echo "$traces" | jq -r '
        "Correlation ID\tStart Time\tEvents\tDuration",
        "─────────────────────────────────────────────────────────────────────────────",
        (
            . |
            @text "\(.correlation_id)\t\(.start_time)\t\(.event_count)\t\(
                if .end_time != .start_time then
                    ((.end_time | fromdateiso8601) - (.start_time | fromdateiso8601) | tostring + \"s\")
                else
                    \"0s\"
                end
            )"
        )
    ' | column -t -s $'\t'
}

# Show trace summary
show_trace_summary() {
    local correlation_id="$1"

    local summary=$(get_trace_summary "$correlation_id")

    if [ $? -ne 0 ]; then
        echo -e "${COLOR_RED}Error: Trace not found for correlation_id: $correlation_id${COLOR_RESET}" >&2
        exit 1
    fi

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        echo "$summary"
        return 0
    fi

    # Text format
    echo -e "${COLOR_BOLD}Trace Summary${COLOR_RESET}"
    echo -e "${COLOR_DIM}─────────────────────────────────────────────────────────────${COLOR_RESET}\n"

    echo -e "${COLOR_CYAN}Correlation ID:${COLOR_RESET} $(echo "$summary" | jq -r '.correlation_id')"
    echo -e "${COLOR_CYAN}Start Time:${COLOR_RESET}     $(echo "$summary" | jq -r '.start_time')"
    echo -e "${COLOR_CYAN}End Time:${COLOR_RESET}       $(echo "$summary" | jq -r '.end_time')"
    echo -e "${COLOR_CYAN}Event Count:${COLOR_RESET}    $(echo "$summary" | jq -r '.event_count')"

    local start_ts=$(echo "$summary" | jq -r '.start_time | fromdateiso8601')
    local end_ts=$(echo "$summary" | jq -r '.end_time | fromdateiso8601')
    local duration=$((end_ts - start_ts))
    echo -e "${COLOR_CYAN}Duration:${COLOR_RESET}       ${duration}s"

    echo ""
    echo -e "${COLOR_BOLD}Event Types:${COLOR_RESET}"
    echo "$summary" | jq -r '.events | group_by(.event_type) | map({type: .[0].event_type, count: length}) | .[] | "  \(.type): \(.count)"'
}

# Show full trace details
show_trace_full() {
    local correlation_id="$1"

    local trace_dir="${CORTEX_HOME}/coordination/traces"
    local trace_file="$trace_dir/${correlation_id}.jsonl"

    if [ ! -f "$trace_file" ]; then
        echo -e "${COLOR_RED}Error: Trace not found for correlation_id: $correlation_id${COLOR_RESET}" >&2
        exit 1
    fi

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        jq -s '.' "$trace_file"
        return 0
    fi

    # Text format with timeline
    echo -e "${COLOR_BOLD}Full Trace: $correlation_id${COLOR_RESET}"
    echo -e "${COLOR_DIM}─────────────────────────────────────────────────────────────${COLOR_RESET}\n"

    local events=$(cat "$trace_file" | jq -s '.')
    local event_count=$(echo "$events" | jq 'length')

    echo -e "${COLOR_CYAN}Total Events:${COLOR_RESET} $event_count\n"

    # Filter by event type if specified
    local filter="."
    if [ -n "$EVENT_TYPE" ]; then
        filter="map(select(.event_type == \"$EVENT_TYPE\"))"
        events=$(echo "$events" | jq "$filter")
        echo -e "${COLOR_YELLOW}Filtered by event type: $EVENT_TYPE${COLOR_RESET}\n"
    fi

    # Display timeline
    echo -e "${COLOR_BOLD}Timeline:${COLOR_RESET}\n"

    echo "$events" | jq -r '.[] |
        "\(.timestamp)\t\(.event_type)\t\(.span_id // "N/A")\t\(.event_data.action // .event_data.task_id // .event_data.worker_id // "N/A")"
    ' | while IFS=$'\t' read -r timestamp event_type span_id action; do
        # Color code event types
        local event_color="$COLOR_RESET"
        case "$event_type" in
            task_lifecycle) event_color="$COLOR_GREEN" ;;
            worker_lifecycle) event_color="$COLOR_BLUE" ;;
            handoff) event_color="$COLOR_MAGENTA" ;;
            log) event_color="$COLOR_YELLOW" ;;
            operation_start|operation_end) event_color="$COLOR_CYAN" ;;
            span_completion) event_color="$COLOR_GREEN" ;;
        esac

        echo -e "${COLOR_DIM}$timestamp${COLOR_RESET} ${event_color}[$event_type]${COLOR_RESET} ${COLOR_DIM}span:$span_id${COLOR_RESET} - $action"
    done

    echo ""

    # Show event details if verbose
    if [ "$VERBOSE" = true ]; then
        echo -e "\n${COLOR_BOLD}Event Details:${COLOR_RESET}\n"

        echo "$events" | jq -r '.[] |
            "┌─ \(.timestamp) [\(.event_type)]",
            "│  Span: \(.span_id // "N/A")",
            (if .parent_span_id then "│  Parent: \(.parent_span_id)" else empty end),
            "│  Data: \(.event_data | tostring)",
            "└─"
        '
    fi
}

# Show trace with logs
show_trace_with_logs() {
    local correlation_id="$1"

    echo -e "${COLOR_BOLD}Trace with Logs: $correlation_id${COLOR_RESET}"
    echo -e "${COLOR_DIM}─────────────────────────────────────────────────────────────${COLOR_RESET}\n"

    # Get trace events
    local trace_dir="${CORTEX_HOME}/coordination/traces"
    local trace_file="$trace_dir/${correlation_id}.jsonl"

    if [ ! -f "$trace_file" ]; then
        echo -e "${COLOR_RED}Error: Trace not found${COLOR_RESET}" >&2
        exit 1
    fi

    # Get logs
    local logs=$(query_logs_by_correlation "$correlation_id")

    # Merge and sort by timestamp
    local combined=$(jq -s 'flatten | sort_by(.timestamp)' <(cat "$trace_file") <(echo "$logs"))

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        echo "$combined"
        return 0
    fi

    # Display timeline with both trace events and logs
    echo "$combined" | jq -r '.[] |
        if .event_type then
            "[\(.timestamp)] TRACE [\(.event_type)] \(.event_data.action // .event_data)"
        elif .level then
            "[\(.timestamp)] LOG [\(.level)] \(.message)"
        else
            "[\(.timestamp)] UNKNOWN"
        end
    '
}

# Find related traces (parent/child relationships)
find_related_traces() {
    local correlation_id="$1"

    local trace_dir="${CORTEX_HOME}/coordination/traces"

    # Search all traces for references to this correlation ID
    echo -e "${COLOR_BOLD}Related Traces:${COLOR_RESET}\n"

    find "$trace_dir" -maxdepth 1 -name "corr-*.jsonl" -type f | while read -r trace_file; do
        local related=$(grep -l "$correlation_id" "$trace_file" 2>/dev/null || true)
        if [ -n "$related" ]; then
            local related_id=$(basename "$related" .jsonl)
            if [ "$related_id" != "$correlation_id" ]; then
                echo -e "  ${COLOR_CYAN}→${COLOR_RESET} $related_id"

                # Show relationship type
                local relationship=$(grep "$correlation_id" "$trace_file" | jq -r 'select(.event_data.parent_correlation_id == "'"$correlation_id"'") | .event_data.action' | head -1)
                if [ -n "$relationship" ]; then
                    echo -e "    ${COLOR_DIM}Relationship: $relationship${COLOR_RESET}"
                fi
            fi
        fi
    done
}

# Main execution
main() {
    case "$MODE" in
        list)
            list_traces_display
            ;;
        summary)
            if [ -z "$CORRELATION_ID" ]; then
                echo -e "${COLOR_RED}Error: Correlation ID required for summary mode${COLOR_RESET}" >&2
                usage
                exit 1
            fi
            show_trace_summary "$CORRELATION_ID"
            ;;
        full)
            if [ -z "$CORRELATION_ID" ]; then
                echo -e "${COLOR_RED}Error: Correlation ID required for full mode${COLOR_RESET}" >&2
                usage
                exit 1
            fi

            if [ "$VERBOSE" = true ]; then
                show_trace_with_logs "$CORRELATION_ID"
                echo ""
                find_related_traces "$CORRELATION_ID"
            else
                show_trace_full "$CORRELATION_ID"
            fi
            ;;
        *)
            echo -e "${COLOR_RED}Error: Invalid mode${COLOR_RESET}" >&2
            usage
            exit 1
            ;;
    esac
}

# Run main
main
