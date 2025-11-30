#!/usr/bin/env bash
# scripts/query-lineage.sh
# Query and analyze task lineage data
# Provides complete observability into task lifecycle and execution patterns
#
# Usage:
#   ./scripts/query-lineage.sh --task task-001
#   ./scripts/query-lineage.sh --type worker_spawned
#   ./scripts/query-lineage.sh --actor security-master
#   ./scripts/query-lineage.sh --stats
#   ./scripts/query-lineage.sh --timeline task-001

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/lineage.sh"

# Color definitions
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
MAGENTA="\033[0;35m"
NC="\033[0m"  # No Color

# ==============================================================================
# USAGE
# ==============================================================================

usage() {
    cat <<EOF
${CYAN}Task Lineage Query Tool${NC}
Complete observability into task lifecycle and execution patterns

${YELLOW}USAGE:${NC}
    $0 [OPTIONS]

${YELLOW}QUERY OPTIONS:${NC}
    -t, --task TASK_ID              Get all lineage events for a specific task
    -e, --type EVENT_TYPE           Get events by type (task_created, worker_spawned, etc.)
    -a, --actor ACTOR_ID            Get events by actor (security-master, worker-001, etc.)
    -s, --stats                     Show lineage statistics
    -T, --timeline TASK_ID          Show timeline visualization for a task
    -w, --workers TASK_ID           Show all workers spawned for a task
    -d, --duration TASK_ID          Calculate task duration and worker times
    -f, --failed                    Show all failed tasks/workers
    -r, --recent [N]                Show N most recent events (default: 10)
    -D, --date DATE                 Query events from specific date (YYYY-MM-DD)
    --summary TASK_ID               Show comprehensive task summary
    --chain TASK_ID                 Show complete event chain with parent relationships
    --export FORMAT                 Export results (json, csv, html)
    -h, --help                      Show this help message

${YELLOW}EVENT TYPES:${NC}
    task_created        Task was created
    task_assigned       Task assigned to master
    task_started        Master started working on task
    worker_spawned      Worker agent spawned
    worker_started      Worker began execution
    worker_progress     Worker progress update
    worker_completed    Worker finished successfully
    worker_failed       Worker failed
    task_completed      Task finished
    task_failed         Task failed
    task_blocked        Task blocked
    task_unblocked      Task unblocked
    task_reassigned     Task reassigned to different master
    task_escalated      Task escalated
    task_cancelled      Task cancelled
    handoff_created     Handoff created between masters
    handoff_accepted    Handoff accepted
    handoff_completed   Handoff completed

${YELLOW}EXAMPLES:${NC}
    # Get complete lineage for a task
    $0 --task task-security-scan-001

    # Show timeline visualization
    $0 --timeline task-security-scan-001

    # Get all worker spawning events
    $0 --type worker_spawned

    # Get all events from security master
    $0 --actor security-master

    # Show system statistics
    $0 --stats

    # Show recent events
    $0 --recent 20

    # Show all failed events
    $0 --failed

    # Get comprehensive task summary
    $0 --summary task-security-scan-001

    # Query specific date
    $0 --date 2025-11-27

    # Export to JSON
    $0 --task task-001 --export json

EOF
    exit 0
}

# ==============================================================================
# FORMATTING UTILITIES
# ==============================================================================

# Format timestamp for display
format_timestamp() {
    local timestamp="$1"
    # Convert ISO-8601 to readable format
    date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$timestamp"
}

# Format duration in ms to human readable
format_duration() {
    local ms="$1"
    local seconds=$((ms / 1000))
    local minutes=$((seconds / 60))
    local hours=$((minutes / 60))

    if [ $hours -gt 0 ]; then
        echo "${hours}h $((minutes % 60))m $((seconds % 60))s"
    elif [ $minutes -gt 0 ]; then
        echo "${minutes}m $((seconds % 60))s"
    else
        echo "${seconds}s"
    fi
}

# Get color for event type
event_color() {
    local event_type="$1"
    case "$event_type" in
        task_created|worker_spawned|handoff_created) echo "$GREEN" ;;
        task_completed|worker_completed|handoff_completed) echo "$BLUE" ;;
        task_failed|worker_failed) echo "$RED" ;;
        task_blocked) echo "$YELLOW" ;;
        task_escalated) echo "$MAGENTA" ;;
        *) echo "$CYAN" ;;
    esac
}

# ==============================================================================
# QUERY FUNCTIONS
# ==============================================================================

# Query task lineage
query_task() {
    local task_id="$1"
    echo -e "${CYAN}Lineage Events for Task: ${YELLOW}${task_id}${NC}\n"

    local events
    events=$(get_task_lineage "$task_id")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No lineage events found for task: ${task_id}${NC}"
        return
    fi

    echo "$events" | jq -r '.[] |
        "\(.timestamp) | \(.event_type) | \(.actor.id)"' | \
    while IFS='|' read -r timestamp event_type actor; do
        timestamp=$(echo "$timestamp" | xargs)
        event_type=$(echo "$event_type" | xargs)
        actor=$(echo "$actor" | xargs)

        local color
        color=$(event_color "$event_type")
        local formatted_time
        formatted_time=$(format_timestamp "$timestamp")

        echo -e "${color}●${NC} ${formatted_time} | ${YELLOW}${event_type}${NC} | ${CYAN}${actor}${NC}"
    done

    echo -e "\n${GREEN}Total Events: ${count}${NC}"
}

# Query by event type
query_type() {
    local event_type="$1"
    echo -e "${CYAN}Events of Type: ${YELLOW}${event_type}${NC}\n"

    local events
    events=$(get_lineage_by_type "$event_type")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No events found of type: ${event_type}${NC}"
        return
    fi

    echo "$events" | jq -r '.[] |
        "\(.timestamp) | \(.task_id) | \(.actor.id)"' | \
    while IFS='|' read -r timestamp task_id actor; do
        timestamp=$(echo "$timestamp" | xargs)
        task_id=$(echo "$task_id" | xargs)
        actor=$(echo "$actor" | xargs)

        local formatted_time
        formatted_time=$(format_timestamp "$timestamp")

        echo -e "● ${formatted_time} | ${YELLOW}${task_id}${NC} | ${CYAN}${actor}${NC}"
    done

    echo -e "\n${GREEN}Total Events: ${count}${NC}"
}

# Query by actor
query_actor() {
    local actor_id="$1"
    echo -e "${CYAN}Events from Actor: ${YELLOW}${actor_id}${NC}\n"

    local events
    events=$(get_lineage_by_actor "$actor_id")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No events found from actor: ${actor_id}${NC}"
        return
    fi

    echo "$events" | jq -r '.[] |
        "\(.timestamp) | \(.event_type) | \(.task_id)"' | \
    while IFS='|' read -r timestamp event_type task_id; do
        timestamp=$(echo "$timestamp" | xargs)
        event_type=$(echo "$event_type" | xargs)
        task_id=$(echo "$task_id" | xargs)

        local color
        color=$(event_color "$event_type")
        local formatted_time
        formatted_time=$(format_timestamp "$timestamp")

        echo -e "${color}●${NC} ${formatted_time} | ${YELLOW}${event_type}${NC} | ${CYAN}${task_id}${NC}"
    done

    echo -e "\n${GREEN}Total Events: ${count}${NC}"
}

# Show statistics
show_stats() {
    echo -e "${CYAN}Task Lineage Statistics${NC}\n"

    local stats
    stats=$(get_lineage_stats)

    echo -e "${YELLOW}Overall:${NC}"
    echo "$stats" | jq -r '"  Total Events: \(.total_events)\n  Tasks Tracked: \(.tasks_tracked)"'

    echo -e "\n${YELLOW}Event Type Distribution:${NC}"
    echo "$stats" | jq -r '.event_types | to_entries[] | "  \(.key): \(.value)"' | sort -k2 -rn

    echo -e "\n${YELLOW}Actor Activity:${NC}"
    echo "$stats" | jq -r '.actors | to_entries[] | "  \(.key): \(.value)"' | sort -k2 -rn | head -20
}

# Show timeline visualization
show_timeline() {
    local task_id="$1"
    echo -e "${CYAN}Timeline for Task: ${YELLOW}${task_id}${NC}\n"

    local events
    events=$(get_task_lineage "$task_id")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No lineage events found for task: ${task_id}${NC}"
        return
    fi

    local start_time
    start_time=$(echo "$events" | jq -r '.[0].timestamp')
    local start_epoch
    start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start_time" "+%s" 2>/dev/null || echo "0")

    echo "$events" | jq -r '.[] |
        "\(.timestamp)|\(.event_type)|\(.actor.id)|\(.event_data // {})"' | \
    while IFS='|' read -r timestamp event_type actor event_data; do
        local event_epoch
        event_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" "+%s" 2>/dev/null || echo "0")
        local offset_seconds=$((event_epoch - start_epoch))

        local color
        color=$(event_color "$event_type")
        local formatted_time
        formatted_time=$(format_timestamp "$timestamp")

        # Create visual timeline with offset
        local dots=""
        for ((i=0; i<offset_seconds/10; i++)); do
            dots+="─"
        done

        echo -e "${dots}${color}●${NC} ${formatted_time} (+${offset_seconds}s) | ${YELLOW}${event_type}${NC} | ${CYAN}${actor}${NC}"

        # Show additional details for key events
        if [[ "$event_type" == "worker_spawned" ]]; then
            local worker_id
            worker_id=$(echo "$event_data" | jq -r '.worker_id // empty')
            local worker_type
            worker_type=$(echo "$event_data" | jq -r '.worker_type // empty')
            [ -n "$worker_id" ] && echo -e "  ${MAGENTA}└─ Worker: ${worker_id} (${worker_type})${NC}"
        elif [[ "$event_type" == "worker_completed" ]] || [[ "$event_type" == "task_completed" ]]; then
            local status
            status=$(echo "$event_data" | jq -r '.completion_status // empty')
            [ -n "$status" ] && echo -e "  ${GREEN}└─ Status: ${status}${NC}"
        elif [[ "$event_type" == "worker_failed" ]] || [[ "$event_type" == "task_failed" ]]; then
            local reason
            reason=$(echo "$event_data" | jq -r '.reason // .error_details.error_message // empty')
            [ -n "$reason" ] && echo -e "  ${RED}└─ Reason: ${reason}${NC}"
        fi
    done

    echo -e "\n${GREEN}Timeline complete${NC}"
}

# Show all workers for a task
show_workers() {
    local task_id="$1"
    echo -e "${CYAN}Workers for Task: ${YELLOW}${task_id}${NC}\n"

    local lineage_file="$LINEAGE_DIR/task-lineage.jsonl"

    if [ ! -f "$lineage_file" ]; then
        echo -e "${YELLOW}No lineage data available${NC}"
        return
    fi

    local workers
    workers=$(jq -s --arg tid "$task_id" '
        [.[] | select(.task_id == $tid and .event_type == "worker_spawned")] |
        map({
            worker_id: .event_data.worker_id,
            worker_type: .event_data.worker_type,
            spawned_at: .timestamp,
            spawned_by: .actor.id
        })
    ' "$lineage_file")

    local count
    count=$(echo "$workers" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No workers spawned for this task${NC}"
        return
    fi

    echo "$workers" | jq -r '.[] |
        "\(.worker_id)|\(.worker_type)|\(.spawned_at)|\(.spawned_by)"' | \
    while IFS='|' read -r worker_id worker_type spawned_at spawned_by; do
        echo -e "${GREEN}●${NC} ${CYAN}${worker_id}${NC} (${YELLOW}${worker_type}${NC})"
        echo -e "  Spawned: $(format_timestamp "$spawned_at") by ${spawned_by}"

        # Check if worker completed or failed
        local worker_status
        worker_status=$(jq -s --arg tid "$task_id" --arg wid "$worker_id" '
            .[] | select(.task_id == $tid and .event_data.worker_id == $wid and
            (.event_type == "worker_completed" or .event_type == "worker_failed"))
        ' "$lineage_file" | head -1)

        if [ -n "$worker_status" ]; then
            local status_type
            status_type=$(echo "$worker_status" | jq -r '.event_type')
            if [ "$status_type" == "worker_completed" ]; then
                echo -e "  ${GREEN}Status: Completed${NC}"
            else
                echo -e "  ${RED}Status: Failed${NC}"
            fi
        else
            echo -e "  ${YELLOW}Status: In Progress${NC}"
        fi
        echo ""
    done

    echo -e "${GREEN}Total Workers: ${count}${NC}"
}

# Calculate task duration
show_duration() {
    local task_id="$1"
    echo -e "${CYAN}Duration Analysis for Task: ${YELLOW}${task_id}${NC}\n"

    local events
    events=$(get_task_lineage "$task_id")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No lineage events found for task: ${task_id}${NC}"
        return
    fi

    local start_time
    start_time=$(echo "$events" | jq -r '.[0].timestamp')
    local end_time
    end_time=$(echo "$events" | jq -r '.[-1].timestamp')

    local start_epoch
    start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start_time" "+%s" 2>/dev/null || echo "0")
    local end_epoch
    end_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$end_time" "+%s" 2>/dev/null || echo "0")

    local duration_seconds=$((end_epoch - start_epoch))
    local duration_ms=$((duration_seconds * 1000))

    echo -e "${YELLOW}Task Timeline:${NC}"
    echo -e "  Started: $(format_timestamp "$start_time")"
    echo -e "  Latest Event: $(format_timestamp "$end_time")"
    echo -e "  Duration: $(format_duration "$duration_ms")"

    # Check if completed
    local completed
    completed=$(echo "$events" | jq '[.[] | select(.event_type == "task_completed" or .event_type == "task_failed")] | length')

    if [ "$completed" -gt 0 ]; then
        local final_status
        final_status=$(echo "$events" | jq -r '[.[] | select(.event_type == "task_completed" or .event_type == "task_failed")] | .[-1].event_type')
        if [ "$final_status" == "task_completed" ]; then
            echo -e "  ${GREEN}Status: Completed${NC}"
        else
            echo -e "  ${RED}Status: Failed${NC}"
        fi
    else
        echo -e "  ${YELLOW}Status: In Progress${NC}"
    fi
}

# Show failed tasks/workers
show_failed() {
    echo -e "${CYAN}Failed Tasks and Workers${NC}\n"

    local lineage_file="$LINEAGE_DIR/task-lineage.jsonl"

    if [ ! -f "$lineage_file" ]; then
        echo -e "${YELLOW}No lineage data available${NC}"
        return
    fi

    echo -e "${RED}Failed Tasks:${NC}"
    jq -s '[.[] | select(.event_type == "task_failed")]' "$lineage_file" | \
    jq -r '.[] | "\(.timestamp)|\(.task_id)|\(.event_data.reason // "Unknown")"' | \
    while IFS='|' read -r timestamp task_id reason; do
        echo -e "  ● $(format_timestamp "$timestamp") | ${YELLOW}${task_id}${NC} | ${reason}"
    done

    echo -e "\n${RED}Failed Workers:${NC}"
    jq -s '[.[] | select(.event_type == "worker_failed")]' "$lineage_file" | \
    jq -r '.[] | "\(.timestamp)|\(.task_id)|\(.event_data.worker_id // "unknown")|\(.event_data.error_details.error_message // "Unknown")"' | \
    while IFS='|' read -r timestamp task_id worker_id error; do
        echo -e "  ● $(format_timestamp "$timestamp") | ${YELLOW}${task_id}${NC} | ${CYAN}${worker_id}${NC} | ${error}"
    done
}

# Show recent events
show_recent() {
    local limit="${1:-10}"
    echo -e "${CYAN}Recent Lineage Events (last ${limit})${NC}\n"

    local lineage_file="$LINEAGE_DIR/task-lineage.jsonl"

    if [ ! -f "$lineage_file" ]; then
        echo -e "${YELLOW}No lineage data available${NC}"
        return
    fi

    tail -n "$limit" "$lineage_file" | jq -s '.[]' | \
    jq -r '"\(.timestamp)|\(.event_type)|\(.task_id)|\(.actor.id)"' | \
    while IFS='|' read -r timestamp event_type task_id actor; do
        local color
        color=$(event_color "$event_type")
        echo -e "${color}●${NC} $(format_timestamp "$timestamp") | ${YELLOW}${event_type}${NC} | ${CYAN}${task_id}${NC} | ${actor}"
    done
}

# Show comprehensive task summary
show_summary() {
    local task_id="$1"
    echo -e "${CYAN}Comprehensive Summary for Task: ${YELLOW}${task_id}${NC}\n"

    local events
    events=$(get_task_lineage "$task_id")

    local count
    count=$(echo "$events" | jq 'length')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No lineage events found for task: ${task_id}${NC}"
        return
    fi

    # Extract summary data
    local created_at
    created_at=$(echo "$events" | jq -r '[.[] | select(.event_type == "task_created")] | .[0].timestamp // "Unknown"')

    local creator
    creator=$(echo "$events" | jq -r '[.[] | select(.event_type == "task_created")] | .[0].actor.id // "Unknown"')

    local assigned_to
    assigned_to=$(echo "$events" | jq -r '[.[] | select(.event_type == "task_assigned")] | .[0].event_data.master_id // "Not assigned"')

    local worker_count
    worker_count=$(echo "$events" | jq '[.[] | select(.event_type == "worker_spawned")] | length')

    local completed_workers
    completed_workers=$(echo "$events" | jq '[.[] | select(.event_type == "worker_completed")] | length')

    local failed_workers
    failed_workers=$(echo "$events" | jq '[.[] | select(.event_type == "worker_failed")] | length')

    echo -e "${YELLOW}Task Information:${NC}"
    echo -e "  ID: ${task_id}"
    echo -e "  Created: $(format_timestamp "$created_at") by ${creator}"
    echo -e "  Assigned To: ${assigned_to}"
    echo -e "  Total Events: ${count}"

    echo -e "\n${YELLOW}Worker Summary:${NC}"
    echo -e "  Workers Spawned: ${worker_count}"
    echo -e "  Completed: ${GREEN}${completed_workers}${NC}"
    echo -e "  Failed: ${RED}${failed_workers}${NC}"
    echo -e "  In Progress: $((worker_count - completed_workers - failed_workers))"

    # Check final status
    local final_status
    final_status=$(echo "$events" | jq -r '[.[] | select(.event_type == "task_completed" or .event_type == "task_failed")] | .[-1].event_type // "in_progress"')

    echo -e "\n${YELLOW}Task Status:${NC}"
    case "$final_status" in
        "task_completed")
            echo -e "  ${GREEN}✓ Completed${NC}"
            ;;
        "task_failed")
            echo -e "  ${RED}✗ Failed${NC}"
            ;;
        *)
            echo -e "  ${YELLOW}⟳ In Progress${NC}"
            ;;
    esac

    # Show event type distribution
    echo -e "\n${YELLOW}Event Distribution:${NC}"
    echo "$events" | jq -r 'group_by(.event_type) | map({type: .[0].event_type, count: length}) | .[] | "  \(.type): \(.count)"'
}

# ==============================================================================
# MAIN
# ==============================================================================

# Parse command line arguments
if [ $# -eq 0 ]; then
    usage
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--task)
            query_task "$2"
            exit 0
            ;;
        -e|--type)
            query_type "$2"
            exit 0
            ;;
        -a|--actor)
            query_actor "$2"
            exit 0
            ;;
        -s|--stats)
            show_stats
            exit 0
            ;;
        -T|--timeline)
            show_timeline "$2"
            exit 0
            ;;
        -w|--workers)
            show_workers "$2"
            exit 0
            ;;
        -d|--duration)
            show_duration "$2"
            exit 0
            ;;
        -f|--failed)
            show_failed
            exit 0
            ;;
        -r|--recent)
            if [ -n "${2:-}" ] && [[ "$2" =~ ^[0-9]+$ ]]; then
                show_recent "$2"
                shift
            else
                show_recent 10
            fi
            exit 0
            ;;
        --summary)
            show_summary "$2"
            exit 0
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
    shift
done
