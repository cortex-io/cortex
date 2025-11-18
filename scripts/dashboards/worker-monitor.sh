#!/bin/bash
# scripts/dashboards/worker-monitor.sh
# Detailed worker monitoring dashboard
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
FILTER_STATUS=""  # all, running, zombie, idle
FILTER_TYPE=""    # all, scan, fix, analysis, implementation, etc.

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

# Get all workers
get_workers() {
    local filter_status="$1"
    local filter_type="$2"
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [[ ! -d "$worker_specs" ]]; then
        return
    fi

    find "$worker_specs" -name "worker-*.json" 2>/dev/null | while read -r spec_file; do
        local worker_id worker_type status health_score created_at task_id priority pid

        worker_id=$(jq -r '.worker_id // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        worker_type=$(jq -r '.worker_type // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        status=$(jq -r '.status // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        health_score=$(jq -r '.heartbeat.health_score // 0' "$spec_file" 2>/dev/null || echo "0")
        created_at=$(jq -r '.created_at // ""' "$spec_file" 2>/dev/null || echo "")
        task_id=$(jq -r '.task_id // ""' "$spec_file" 2>/dev/null || echo "")
        priority=$(jq -r '.priority // "medium"' "$spec_file" 2>/dev/null || echo "medium")
        pid=$(jq -r '.pid // ""' "$spec_file" 2>/dev/null || echo "")

        # Apply filters
        if [[ -n "$filter_status" && "$filter_status" != "all" && "$status" != "$filter_status" ]]; then
            continue
        fi

        if [[ -n "$filter_type" && "$filter_type" != "all" && "$worker_type" != "$filter_type" ]]; then
            continue
        fi

        echo "$worker_id|$worker_type|$status|$health_score|$created_at|$task_id|$priority|$pid"
    done
}

# Calculate uptime
calculate_uptime() {
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

    local uptime_seconds=$((now_ts - created_ts))
    local hours=$((uptime_seconds / 3600))
    local minutes=$(( (uptime_seconds % 3600) / 60 ))

    if (( hours > 0 )); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Get worker count by status
get_worker_counts() {
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [[ ! -d "$worker_specs" ]]; then
        echo "0|0|0|0"
        return
    fi

    local running=0 idle=0 zombie=0 failed=0

    for spec in "$worker_specs"/worker-*.json; do
        [[ ! -f "$spec" ]] && continue

        local status
        status=$(jq -r '.status // "unknown"' "$spec" 2>/dev/null || echo "unknown")

        case "$status" in
            running) ((running++)) ;;
            idle) ((idle++)) ;;
            zombie) ((zombie++)) ;;
            failed) ((failed++)) ;;
        esac
    done

    echo "$running|$idle|$zombie|$failed"
}

# Get worker count by type
get_worker_type_counts() {
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [[ ! -d "$worker_specs" ]]; then
        return
    fi

    for spec in "$worker_specs"/worker-*.json; do
        [[ ! -f "$spec" ]] && continue

        jq -r '.worker_type // "unknown"' "$spec" 2>/dev/null || echo "unknown"
    done | sort | uniq -c | while read -r count type; do
        echo "$type|$count"
    done
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
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Worker Monitor${NC}                                                              ${BOLD}${CYAN}║${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}╠═══════════════════════════════════════════════════════════════════════════════╣${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}║${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}║${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"

    # Worker counts
    IFS='|' read -r running idle zombie failed <<< "$(get_worker_counts)"
    local total=$((running + idle + zombie + failed))

    move_cursor 6 2
    echo -e "${BOLD}Worker Summary${NC}"
    move_cursor 7 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 8 2
    echo -e "Total Workers: ${CYAN}$total${NC}"

    move_cursor 9 2
    echo -e "  ${GREEN}Running:${NC}  $running"

    move_cursor 10 2
    echo -e "  ${YELLOW}Idle:${NC}     $idle"

    move_cursor 11 2
    echo -e "  ${RED}Zombie:${NC}   $zombie"

    move_cursor 12 2
    echo -e "  ${RED}Failed:${NC}   $failed"

    # Worker types
    move_cursor 6 42
    echo -e "${BOLD}By Type${NC}"
    move_cursor 7 42
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local row=8
    get_worker_type_counts | head -8 | while IFS='|' read -r type count; do
        move_cursor $row 42
        # Truncate type name
        local short_type="${type:0:20}"
        printf "%-20s ${CYAN}%3d${NC}\n" "$short_type" "$count"
        ((row++))
    done

    # Worker list
    move_cursor 14 0
    echo -e "${BOLD}Active Workers${NC}"
    move_cursor 15 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Table header
    move_cursor 16 0
    printf "${BOLD}%-22s %-18s %-10s %-7s %-10s %-15s${NC}\n" \
        "Worker ID" "Type" "Status" "Health" "Uptime" "Task ID"

    move_cursor 17 0
    printf "%-22s %-18s %-10s %-7s %-10s %-15s\n" \
        "──────────────────────" "──────────────────" "──────────" "───────" "──────────" "───────────────"

    # Worker rows
    local row=18
    local max_rows=$((TERM_ROWS - 22))  # Leave room for footer

    get_workers "$FILTER_STATUS" "$FILTER_TYPE" | head -n "$max_rows" | while IFS='|' read -r worker_id worker_type status health created_at task_id priority pid; do
        move_cursor $row 0

        # Truncate IDs
        local short_id="${worker_id:0:22}"
        local short_type="${worker_type:0:18}"
        local short_task="${task_id:0:15}"

        # Status color
        local status_color="${GREEN}"
        [[ "$status" == "zombie" ]] && status_color="${RED}"
        [[ "$status" == "idle" ]] && status_color="${YELLOW}"

        # Health indicator
        local health_display="$health"
        local health_color="${GREEN}"
        if (( health < 70 )); then
            health_color="${RED}"
        elif (( health < 85 )); then
            health_color="${YELLOW}"
        fi

        # Uptime
        local uptime
        uptime=$(calculate_uptime "$created_at")

        printf "%-22s %-18s ${status_color}%-10s${NC} ${health_color}%6s%%${NC} %-10s %-15s\n" \
            "$short_id" "$short_type" "$status" "$health_display" "$uptime" "$short_task"

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
    [[ -n "$FILTER_TYPE" && "$FILTER_TYPE" != "all" ]] && filter_text+="type=$FILTER_TYPE "
    [[ "$filter_text" == "Filters: " ]] && filter_text+="none"
    echo -e "${DIM}$filter_text${NC}"

    move_cursor $((footer_row + 2)) 0
    echo -e "${DIM}Press ${BOLD}q${NC}${DIM} to quit | ${BOLD}r${NC}${DIM}/$ to filter status | ${BOLD}t${NC}${DIM} to filter type | Refreshing every ${REFRESH_INTERVAL}s${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    tput cnorm  # Show cursor
    echo "Worker monitor stopped."
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
            --type)
                FILTER_TYPE="$2"
                shift 2
                ;;
            --interval)
                REFRESH_INTERVAL="$2"
                shift 2
                ;;
            *)
                echo "Usage: $0 [--status running|idle|zombie|failed] [--type <worker-type>] [--interval <seconds>]"
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
