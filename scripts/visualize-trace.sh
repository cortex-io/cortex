#!/bin/bash
# scripts/visualize-trace.sh
# Timeline visualization for distributed traces

set -euo pipefail

# Source dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(dirname "$SCRIPT_DIR")}"

source "$SCRIPT_DIR/lib/correlation.sh"
source "$SCRIPT_DIR/lib/traced-logging.sh"

# Colors for visualization
COLOR_RESET='\033[0m'
COLOR_BOLD='\033[1m'
COLOR_DIM='\033[2m'
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'
COLOR_BLUE='\033[0;34m'
COLOR_MAGENTA='\033[0;35m'
COLOR_CYAN='\033[0;36m'
COLOR_WHITE='\033[0;37m'

# Display usage
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] CORRELATION_ID

Timeline visualization for distributed traces.

OPTIONS:
    -w, --width NUM         Timeline width in characters (default: 80)
    -g, --gantt             Show Gantt-style timeline
    -t, --tree              Show hierarchical tree view
    -s, --sequence          Show sequence diagram
    -a, --ascii             Use ASCII-only characters
    -o, --output FILE       Save visualization to file
    -h, --help              Show this help message

EXAMPLES:
    # Timeline visualization
    $(basename "$0") corr-1732741200-a3f4b2-coordinator

    # Gantt chart
    $(basename "$0") --gantt corr-1732741200-a3f4b2-coordinator

    # Hierarchical tree
    $(basename "$0") --tree corr-1732741200-a3f4b2-coordinator

    # Save to file
    $(basename "$0") --gantt -o trace.txt corr-1732741200-a3f4b2-coordinator

EOF
}

# Parse arguments
VISUALIZATION="timeline"
WIDTH=80
ASCII_ONLY=false
OUTPUT_FILE=""
CORRELATION_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--width)
            WIDTH="$2"
            shift 2
            ;;
        -g|--gantt)
            VISUALIZATION="gantt"
            shift
            ;;
        -t|--tree)
            VISUALIZATION="tree"
            shift
            ;;
        -s|--sequence)
            VISUALIZATION="sequence"
            shift
            ;;
        -a|--ascii)
            ASCII_ONLY=true
            shift
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
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

if [ -z "$CORRELATION_ID" ]; then
    echo "Error: Correlation ID required" >&2
    usage
    exit 1
fi

# Box drawing characters
if [ "$ASCII_ONLY" = true ]; then
    BOX_HORIZONTAL="-"
    BOX_VERTICAL="|"
    BOX_DOWN_RIGHT="+"
    BOX_DOWN_LEFT="+"
    BOX_UP_RIGHT="+"
    BOX_UP_LEFT="+"
    BOX_VERTICAL_RIGHT="+"
    BOX_VERTICAL_LEFT="+"
    BOX_DOWN_HORIZONTAL="+"
    BOX_UP_HORIZONTAL="+"
    BOX_VERTICAL_HORIZONTAL="+"
    ARROW_RIGHT="->"
    ARROW_DOWN="|"
    BULLET="*"
else
    BOX_HORIZONTAL="─"
    BOX_VERTICAL="│"
    BOX_DOWN_RIGHT="┌"
    BOX_DOWN_LEFT="┐"
    BOX_UP_RIGHT="└"
    BOX_UP_LEFT="┘"
    BOX_VERTICAL_RIGHT="├"
    BOX_VERTICAL_LEFT="┤"
    BOX_DOWN_HORIZONTAL="┬"
    BOX_UP_HORIZONTAL="┴"
    BOX_VERTICAL_HORIZONTAL="┼"
    ARROW_RIGHT="→"
    ARROW_DOWN="↓"
    BULLET="•"
fi

# Get trace data
get_trace_data() {
    local trace_dir="${CORTEX_HOME}/coordination/traces"
    local trace_file="$trace_dir/${CORRELATION_ID}.jsonl"

    if [ ! -f "$trace_file" ]; then
        echo "Error: Trace not found for correlation_id: $CORRELATION_ID" >&2
        exit 1
    fi

    jq -s 'sort_by(.timestamp)' "$trace_file"
}

# Calculate duration between events
calculate_durations() {
    local events="$1"

    echo "$events" | jq '
        . as $all |
        [range(0; length)] |
        map(
            . as $i |
            $all[$i] + {
                index: $i,
                duration_from_start: (
                    if $i > 0 then
                        (($all[$i].timestamp | fromdateiso8601) - ($all[0].timestamp | fromdateiso8601))
                    else
                        0
                    end
                ),
                duration_to_next: (
                    if $i < (length - 1) then
                        (($all[$i + 1].timestamp | fromdateiso8601) - ($all[$i].timestamp | fromdateiso8601))
                    else
                        0
                    end
                )
            }
        )
    '
}

# Timeline visualization
visualize_timeline() {
    local events=$(get_trace_data)
    local events_with_duration=$(calculate_durations "$events")

    echo -e "${COLOR_BOLD}Timeline Visualization: $CORRELATION_ID${COLOR_RESET}"
    echo -e "${COLOR_DIM}$(printf '%*s' "$WIDTH" '' | tr ' ' "$BOX_HORIZONTAL")${COLOR_RESET}\n"

    local total_duration=$(echo "$events_with_duration" | jq -r '
        (.[0].timestamp | fromdateiso8601) as $start |
        (.[-1].timestamp | fromdateiso8601) as $end |
        $end - $start
    ')

    echo -e "${COLOR_CYAN}Total Duration: ${total_duration}s${COLOR_RESET}\n"

    # Calculate scale (timeline width / total duration)
    local scale_factor=1
    if [ "$total_duration" -gt 0 ]; then
        scale_factor=$(echo "scale=2; ($WIDTH - 40) / $total_duration" | bc)
    fi

    # Display events
    echo "$events_with_duration" | jq -r '.[] |
        "\(.index)\t\(.timestamp)\t\(.event_type)\t\(.duration_from_start)\t\(.duration_to_next)\t\(.event_data.action // .event_data.task_id // .event_data.worker_id // "N/A")"
    ' | while IFS=$'\t' read -r index timestamp event_type duration_from_start duration_to_next action; do
        # Calculate position on timeline
        local position=$(echo "scale=0; $duration_from_start * $scale_factor" | bc)

        # Color code event types
        local event_color="$COLOR_RESET"
        local event_symbol="$BULLET"
        case "$event_type" in
            task_lifecycle)
                event_color="$COLOR_GREEN"
                event_symbol="T"
                ;;
            worker_lifecycle)
                event_color="$COLOR_BLUE"
                event_symbol="W"
                ;;
            handoff)
                event_color="$COLOR_MAGENTA"
                event_symbol="H"
                ;;
            operation_start)
                event_color="$COLOR_CYAN"
                event_symbol="S"
                ;;
            operation_end)
                event_color="$COLOR_CYAN"
                event_symbol="E"
                ;;
            span_completion)
                event_color="$COLOR_GREEN"
                event_symbol="C"
                ;;
            log)
                event_color="$COLOR_YELLOW"
                event_symbol="L"
                ;;
            *)
                event_color="$COLOR_WHITE"
                event_symbol="$BULLET"
                ;;
        esac

        # Format time (HH:MM:SS)
        local time_str=$(echo "$timestamp" | sed 's/.*T\([0-9:]*\).*/\1/')

        # Draw timeline marker
        printf "${COLOR_DIM}%5s${COLOR_RESET} ${COLOR_DIM}%s${COLOR_RESET} " "$index" "$time_str"
        printf "%*s" "$position" "" | tr ' ' ' '
        echo -e "${event_color}${event_symbol}${COLOR_RESET} ${COLOR_DIM}+${duration_to_next}s${COLOR_RESET} $action ${COLOR_DIM}[$event_type]${COLOR_RESET}"
    done

    echo ""
}

# Gantt chart visualization
visualize_gantt() {
    local events=$(get_trace_data)
    local events_with_duration=$(calculate_durations "$events")

    echo -e "${COLOR_BOLD}Gantt Chart: $CORRELATION_ID${COLOR_RESET}"
    echo -e "${COLOR_DIM}$(printf '%*s' "$WIDTH" '' | tr ' ' "$BOX_HORIZONTAL")${COLOR_RESET}\n"

    # Group events by span_id to show operations
    local operations=$(echo "$events_with_duration" | jq -s '
        group_by(.span_id) |
        map({
            span_id: .[0].span_id,
            start_time: .[0].timestamp,
            end_time: .[-1].timestamp,
            duration: ((.[-1].timestamp | fromdateiso8601) - (.[0].timestamp | fromdateiso8601)),
            event_count: length,
            first_event: .[0].event_type,
            last_event: .[-1].event_type
        })
    ' <(echo "$events_with_duration"))

    local total_duration=$(echo "$operations" | jq -r '
        map(.duration) | max
    ')

    local scale_factor=1
    if [ "$total_duration" -gt 0 ]; then
        scale_factor=$(echo "scale=2; ($WIDTH - 50) / $total_duration" | bc)
    fi

    echo -e "${COLOR_CYAN}Operations:${COLOR_RESET}\n"

    echo "$operations" | jq -r '.[] |
        "\(.span_id)\t\(.duration)\t\(.event_count)\t\(.first_event)"
    ' | while IFS=$'\t' read -r span_id duration event_count first_event; do
        local bar_length=$(echo "scale=0; $duration * $scale_factor" | bc)
        if [ "$bar_length" -lt 1 ]; then
            bar_length=1
        fi

        # Truncate span_id for display
        local short_span=$(echo "$span_id" | cut -c1-30)

        # Color based on event type
        local bar_color="$COLOR_GREEN"
        case "$first_event" in
            task_lifecycle) bar_color="$COLOR_GREEN" ;;
            worker_lifecycle) bar_color="$COLOR_BLUE" ;;
            handoff) bar_color="$COLOR_MAGENTA" ;;
            operation_start|operation_end) bar_color="$COLOR_CYAN" ;;
        esac

        # Draw bar
        printf "%-30s ${COLOR_DIM}|${COLOR_RESET}" "$short_span"
        echo -ne "${bar_color}"
        printf '%*s' "$bar_length" '' | tr ' ' '█'
        echo -e "${COLOR_RESET} ${COLOR_DIM}${duration}s (${event_count} events)${COLOR_RESET}"
    done

    echo ""
}

# Tree visualization (hierarchical)
visualize_tree() {
    local events=$(get_trace_data)

    echo -e "${COLOR_BOLD}Hierarchical Tree: $CORRELATION_ID${COLOR_RESET}"
    echo -e "${COLOR_DIM}$(printf '%*s' "$WIDTH" '' | tr ' ' "$BOX_HORIZONTAL")${COLOR_RESET}\n"

    # Build parent-child relationships
    local tree=$(echo "$events" | jq -s '
        . as $all |
        group_by(.span_id) |
        map({
            span_id: .[0].span_id,
            parent_span_id: .[0].parent_span_id,
            events: .
        })
    ')

    # Find root nodes (no parent)
    local roots=$(echo "$tree" | jq '[.[] | select(.parent_span_id == null or .parent_span_id == "")]')

    # Recursive tree drawing
    draw_tree_node() {
        local node="$1"
        local indent="$2"
        local is_last="$3"

        local span_id=$(echo "$node" | jq -r '.span_id')
        local event_count=$(echo "$node" | jq -r '.events | length')
        local first_event=$(echo "$node" | jq -r '.events[0]')
        local event_type=$(echo "$first_event" | jq -r '.event_type')
        local action=$(echo "$first_event" | jq -r '.event_data.action // .event_data.task_id // .event_data.worker_id // "N/A"')

        # Color based on event type
        local color="$COLOR_RESET"
        case "$event_type" in
            task_lifecycle) color="$COLOR_GREEN" ;;
            worker_lifecycle) color="$COLOR_BLUE" ;;
            handoff) color="$COLOR_MAGENTA" ;;
            operation_start|operation_end) color="$COLOR_CYAN" ;;
        esac

        # Draw node
        if [ "$is_last" = "true" ]; then
            echo -ne "${indent}${COLOR_DIM}${BOX_UP_RIGHT}${BOX_HORIZONTAL}${COLOR_RESET} "
        else
            echo -ne "${indent}${COLOR_DIM}${BOX_VERTICAL_RIGHT}${BOX_HORIZONTAL}${COLOR_RESET} "
        fi

        local short_span=$(echo "$span_id" | cut -c1-25)
        echo -e "${color}${short_span}${COLOR_RESET} ${COLOR_DIM}(${event_count} events)${COLOR_RESET} - $action"

        # Find children
        local children=$(echo "$tree" | jq --arg parent "$span_id" '[.[] | select(.parent_span_id == $parent)]')
        local child_count=$(echo "$children" | jq 'length')

        if [ "$child_count" -gt 0 ]; then
            local new_indent="${indent}"
            if [ "$is_last" = "true" ]; then
                new_indent="${indent}  "
            else
                new_indent="${indent}${COLOR_DIM}${BOX_VERTICAL}${COLOR_RESET} "
            fi

            local child_index=0
            echo "$children" | jq -c '.[]' | while read -r child; do
                child_index=$((child_index + 1))
                local is_last_child="false"
                if [ "$child_index" -eq "$child_count" ]; then
                    is_last_child="true"
                fi
                draw_tree_node "$child" "$new_indent" "$is_last_child"
            done
        fi
    }

    # Draw each root
    local root_count=$(echo "$roots" | jq 'length')
    local root_index=0
    echo "$roots" | jq -c '.[]' | while read -r root; do
        root_index=$((root_index + 1))
        local is_last="false"
        if [ "$root_index" -eq "$root_count" ]; then
            is_last="true"
        fi
        draw_tree_node "$root" "" "$is_last"
    done

    echo ""
}

# Sequence diagram visualization
visualize_sequence() {
    local events=$(get_trace_data)

    echo -e "${COLOR_BOLD}Sequence Diagram: $CORRELATION_ID${COLOR_RESET}"
    echo -e "${COLOR_DIM}$(printf '%*s' "$WIDTH" '' | tr ' ' "$BOX_HORIZONTAL")${COLOR_RESET}\n"

    # Extract participants (components)
    local participants=$(echo "$events" | jq -r '[.[].event_data.component // .[].event_data.from_master // .[].event_data.to_master // "unknown"] | unique | .[]')

    # Display participants
    echo -e "${COLOR_CYAN}Participants:${COLOR_RESET}"
    echo "$participants" | nl -w2 -s'. '
    echo ""

    # Display interactions
    echo -e "${COLOR_CYAN}Interactions:${COLOR_RESET}\n"

    echo "$events" | jq -r '.[] |
        "\(.timestamp)\t\(.event_type)\t\(.event_data.from_master // "N/A")\t\(.event_data.to_master // .event_data.component // "N/A")\t\(.event_data.action // "N/A")"
    ' | while IFS=$'\t' read -r timestamp event_type from_component to_component action; do
        local time_str=$(echo "$timestamp" | sed 's/.*T\([0-9:]*\).*/\1/')

        # Color based on event type
        local color="$COLOR_RESET"
        case "$event_type" in
            handoff) color="$COLOR_MAGENTA" ;;
            task_lifecycle) color="$COLOR_GREEN" ;;
            worker_lifecycle) color="$COLOR_BLUE" ;;
        esac

        if [ "$event_type" = "handoff" ]; then
            echo -e "${COLOR_DIM}$time_str${COLOR_RESET} ${from_component} ${color}${ARROW_RIGHT}${COLOR_RESET} ${to_component}: $action"
        else
            echo -e "${COLOR_DIM}$time_str${COLOR_RESET} ${color}[$event_type]${COLOR_RESET} ${to_component}: $action"
        fi
    done

    echo ""
}

# Main execution
main() {
    local output=""

    case "$VISUALIZATION" in
        timeline)
            output=$(visualize_timeline)
            ;;
        gantt)
            output=$(visualize_gantt)
            ;;
        tree)
            output=$(visualize_tree)
            ;;
        sequence)
            output=$(visualize_sequence)
            ;;
        *)
            echo "Error: Invalid visualization type" >&2
            exit 1
            ;;
    esac

    if [ -n "$OUTPUT_FILE" ]; then
        # Strip ANSI color codes for file output
        echo "$output" | sed 's/\x1b\[[0-9;]*m//g' > "$OUTPUT_FILE"
        echo "Visualization saved to: $OUTPUT_FILE"
    else
        echo "$output"
    fi
}

# Run main
main
