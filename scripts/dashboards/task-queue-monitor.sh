#!/bin/bash
# scripts/dashboards/task-queue-monitor.sh
# Real-time task queue monitoring dashboard
# Part of Phase 5: Developer Experience

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Refresh interval (seconds)
REFRESH_INTERVAL=5

# Filter options
FILTER_STATUS=""     # all, queued, in_progress, completed, failed
FILTER_PRIORITY=""   # all, critical, high, medium, low

# Get terminal size
get_terminal_size() {
    TERM_COLS=$(tput cols)
    TERM_ROWS=$(tput lines)
}

# Clear screen
clear_screen() {
    tput clear
}

# Move cursor
move_cursor() {
    tput cup "$1" "$2"
}

# Get task counts by status
get_task_counts() {
    local task_queue="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    if [[ ! -f "$task_queue" ]]; then
        echo "0|0|0|0"
        return
    fi

    local queued in_progress completed failed
    queued=$(jq '[.tasks[] | select(.status == "queued")] | length' "$task_queue" 2>/dev/null || echo "0")
    in_progress=$(jq '[.tasks[] | select(.status == "in_progress")] | length' "$task_queue" 2>/dev/null || echo "0")
    completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$task_queue" 2>/dev/null || echo "0")
    failed=$(jq '[.tasks[] | select(.status == "failed")] | length' "$task_queue" 2>/dev/null || echo "0")

    echo "$queued|$in_progress|$completed|$failed"
}

# Get task counts by priority
get_priority_counts() {
    local task_queue="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    if [[ ! -f "$task_queue" ]]; then
        return
    fi

    jq -r '.tasks[] | .priority // "medium"' "$task_queue" 2>/dev/null | \
        sort | uniq -c | while read -r count priority; do
        echo "$priority|$count"
    done
}

# Get tasks with filters
get_tasks() {
    local filter_status="$1"
    local filter_priority="$2"
    local task_queue="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    if [[ ! -f "$task_queue" ]]; then
        return
    fi

    local jq_filter='.tasks[]'

    # Apply status filter
    if [[ -n "$filter_status" && "$filter_status" != "all" ]]; then
        jq_filter="$jq_filter | select(.status == \"$filter_status\")"
    fi

    # Apply priority filter
    if [[ -n "$filter_priority" && "$filter_priority" != "all" ]]; then
        jq_filter="$jq_filter | select(.priority == \"$filter_priority\")"
    fi

    jq -r "$jq_filter | [
        .task_id // \"unknown\",
        .description // \"N/A\",
        .status // \"unknown\",
        .priority // \"medium\",
        .created_at // \"\",
        .updated_at // \"\",
        .assigned_to // \"\"
    ] | @tsv" "$task_queue" 2>/dev/null | while IFS=$'\t' read -r task_id description status priority created_at updated_at assigned_to; do
        echo "$task_id|$description|$status|$priority|$created_at|$updated_at|$assigned_to"
    done
}

# Calculate task age
calculate_age() {
    local created_at="$1"

    if [[ -z "$created_at" ]]; then
        echo "N/A"
        return
    fi

    local created_ts
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$created_at" +%s 2>/dev/null || echo "0")

    if [[ "$created_ts" == "0" ]]; then
        echo "N/A"
        return
    fi

    local now_ts
    now_ts=$(date +%s)

    local age_seconds=$((now_ts - created_ts))
    local hours=$((age_seconds / 3600))
    local minutes=$(( (age_seconds % 3600) / 60 ))

    if (( hours > 24 )); then
        local days=$((hours / 24))
        echo "${days}d"
    elif (( hours > 0 )); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Calculate task duration (for completed/failed tasks)
calculate_duration() {
    local created_at="$1"
    local updated_at="$2"

    if [[ -z "$created_at" || -z "$updated_at" ]]; then
        echo "N/A"
        return
    fi

    local created_ts updated_ts
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$created_at" +%s 2>/dev/null || echo "0")
    updated_ts=$(date -d "$updated_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$updated_at" +%s 2>/dev/null || echo "0")

    if [[ "$created_ts" == "0" || "$updated_ts" == "0" ]]; then
        echo "N/A"
        return
    fi

    local duration_seconds=$((updated_ts - created_ts))
    local hours=$((duration_seconds / 3600))
    local minutes=$(( (duration_seconds % 3600) / 60 ))

    if (( hours > 0 )); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Render dashboard
render_dashboard() {
    clear_screen
    get_terminal_size

    local current_time
    current_time=$(date '+%Y-%m-%d %H:%M:%S')

    # Header
    move_cursor 0 0
    echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    move_cursor 1 0
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Task Queue Monitor${NC}                                                          ${BOLD}${CYAN}║${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}╠═══════════════════════════════════════════════════════════════════════════════╣${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}║${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}║${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"

    # Task counts by status
    IFS='|' read -r queued in_progress completed failed <<< "$(get_task_counts)"
    local total=$((queued + in_progress + completed + failed))

    move_cursor 6 2
    echo -e "${BOLD}Task Summary${NC}"
    move_cursor 7 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 8 2
    echo -e "Total Tasks: ${CYAN}$total${NC}"

    move_cursor 9 2
    echo -e "  ${YELLOW}Queued:${NC}      $queued"

    move_cursor 10 2
    echo -e "  ${BLUE}In Progress:${NC} $in_progress"

    move_cursor 11 2
    echo -e "  ${GREEN}Completed:${NC}   $completed"

    move_cursor 12 2
    echo -e "  ${RED}Failed:${NC}      $failed"

    # Priority distribution
    move_cursor 6 42
    echo -e "${BOLD}By Priority${NC}"
    move_cursor 7 42
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local row=8
    get_priority_counts | while IFS='|' read -r priority count; do
        move_cursor $row 42
        # Priority color
        local priority_color="${NC}"
        case "$priority" in
            critical) priority_color="${RED}" ;;
            high) priority_color="${YELLOW}" ;;
            medium) priority_color="${BLUE}" ;;
            low) priority_color="${DIM}" ;;
        esac
        printf "${priority_color}%-12s${NC} ${CYAN}%3d${NC}\n" "$priority" "$count"
        ((row++))
    done

    # Task list
    move_cursor 14 0
    echo -e "${BOLD}Active Tasks${NC}"
    move_cursor 15 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Table header
    move_cursor 16 0
    printf "${BOLD}%-20s %-28s %-12s %-10s %-10s${NC}\n" \
        "Task ID" "Description" "Status" "Priority" "Age/Duration"

    move_cursor 17 0
    printf "%-20s %-28s %-12s %-10s %-10s\n" \
        "────────────────────" "────────────────────────────" "────────────" "──────────" "──────────"

    # Task rows
    local row=18
    local max_rows=$((TERM_ROWS - 22))  # Leave room for footer

    get_tasks "$FILTER_STATUS" "$FILTER_PRIORITY" | head -n "$max_rows" | while IFS='|' read -r task_id description status priority created_at updated_at assigned_to; do
        move_cursor $row 0

        # Truncate fields
        local short_id="${task_id:0:20}"
        local short_desc="${description:0:28}"

        # Status color
        local status_color="${NC}"
        case "$status" in
            queued) status_color="${YELLOW}" ;;
            in_progress) status_color="${BLUE}" ;;
            completed) status_color="${GREEN}" ;;
            failed) status_color="${RED}" ;;
        esac

        # Priority color
        local priority_color="${NC}"
        case "$priority" in
            critical) priority_color="${RED}" ;;
            high) priority_color="${YELLOW}" ;;
            medium) priority_color="${BLUE}" ;;
            low) priority_color="${DIM}" ;;
        esac

        # Age or duration
        local time_display
        if [[ "$status" == "completed" || "$status" == "failed" ]]; then
            time_display=$(calculate_duration "$created_at" "$updated_at")
        else
            time_display=$(calculate_age "$created_at")
        fi

        printf "%-20s %-28s ${status_color}%-12s${NC} ${priority_color}%-10s${NC} %-10s\n" \
            "$short_id" "$short_desc" "$status" "$priority" "$time_display"

        ((row++))

        if (( row >= TERM_ROWS - 5 )); then
            break
        fi
    done

    # Footer
    local footer_row=$((TERM_ROWS - 4))
    move_cursor $footer_row 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor $((footer_row + 1)) 0
    local filter_text="Filters: "
    [[ -n "$FILTER_STATUS" && "$FILTER_STATUS" != "all" ]] && filter_text+="status=$FILTER_STATUS "
    [[ -n "$FILTER_PRIORITY" && "$FILTER_PRIORITY" != "all" ]] && filter_text+="priority=$FILTER_PRIORITY "
    [[ "$filter_text" == "Filters: " ]] && filter_text+="none"
    echo -e "${DIM}$filter_text${NC}"

    move_cursor $((footer_row + 2)) 0
    echo -e "${DIM}Press ${BOLD}q${NC}${DIM} to quit | Refreshing every ${REFRESH_INTERVAL}s${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    tput cnorm  # Show cursor
    echo "Task queue monitor stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main loop
main() {
    # Hide cursor
    tput civis

    # Parse command line args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --status)
                FILTER_STATUS="$2"
                shift 2
                ;;
            --priority)
                FILTER_PRIORITY="$2"
                shift 2
                ;;
            --interval)
                REFRESH_INTERVAL="$2"
                shift 2
                ;;
            *)
                echo "Usage: $0 [--status queued|in_progress|completed|failed] [--priority critical|high|medium|low] [--interval <seconds>]"
                exit 1
                ;;
        esac
    done

    while true; do
        render_dashboard
        sleep "$REFRESH_INTERVAL"
    done
}

# Run dashboard
main "$@"
