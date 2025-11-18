#!/bin/bash
# scripts/dashboards/system-live.sh
# Real-time system monitoring dashboard
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

# Get terminal size
get_terminal_size() {
    TERM_COLS=$(tput cols)
    TERM_ROWS=$(tput lines)
}

# Clear screen
clear_screen() {
    tput clear
}

# Move cursor to position
move_cursor() {
    tput cup "$1" "$2"
}

# Draw box
draw_box() {
    local title="$1"
    local row="$2"
    local col="$3"
    local width="$4"
    local height="$5"

    # Top border
    move_cursor "$row" "$col"
    echo -n "┌─ $title "
    local title_len=$((${#title} + 4))
    for ((i=title_len; i<width; i++)); do echo -n "─"; done
    echo -n "┐"

    # Sides
    for ((i=1; i<height-1; i++)); do
        move_cursor $((row + i)) "$col"
        echo -n "│"
        move_cursor $((row + i)) $((col + width - 1))
        echo -n "│"
    done

    # Bottom border
    move_cursor $((row + height - 1)) "$col"
    echo -n "└"
    for ((i=1; i<width-1; i++)); do echo -n "─"; done
    echo -n "┘"
}

# Get worker count
get_worker_count() {
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [[ ! -d "$worker_specs" ]]; then
        echo "0"
        return
    fi

    local count
    count=$(find "$worker_specs" -name "worker-*.json" 2>/dev/null | wc -l | xargs)
    echo "$count"
}

# Get task queue status
get_task_queue_status() {
    local queue_file="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    if [[ ! -f "$queue_file" ]]; then
        echo "0|0|0"
        return
    fi

    local queued in_progress completed

    queued=$(jq '[.tasks[] | select(.status == "queued")] | length' "$queue_file" 2>/dev/null || echo "0")
    in_progress=$(jq '[.tasks[] | select(.status == "in_progress")] | length' "$queue_file" 2>/dev/null || echo "0")
    completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$queue_file" 2>/dev/null || echo "0")

    echo "$queued|$in_progress|$completed"
}

# Get daemon status
get_daemon_status() {
    local pid_files=(
        "/tmp/commit-relay-worker.pid"
        "/tmp/commit-relay-pm.pid"
        "/tmp/commit-relay-heartbeat.pid"
        "/tmp/commit-relay-metrics.pid"
        "/tmp/commit-relay-coordinator.pid"
        "/tmp/commit-relay-integration.pid"
        "/tmp/commit-relay-failure-pattern.pid"
        "/tmp/commit-relay-worker-restart.pid"
        "/tmp/commit-relay-auto-fix.pid"
    )

    local running=0
    local total=${#pid_files[@]}

    for pidfile in "${pid_files[@]}"; do
        if [[ -f "$pidfile" ]]; then
            local pid
            pid=$(cat "$pidfile")
            if ps -p "$pid" > /dev/null 2>&1; then
                ((running++))
            fi
        fi
    done

    echo "$running|$total"
}

# Get token budget
get_token_budget() {
    local budget_file="$COMMIT_RELAY_HOME/coordination/token-budget.json"

    if [[ ! -f "$budget_file" ]]; then
        echo "0|100000|0"
        return
    fi

    local used available total percentage

    used=$(jq -r '.used // 0' "$budget_file" 2>/dev/null || echo "0")
    available=$(jq -r '.available // 0' "$budget_file" 2>/dev/null || echo "0")
    total=$(jq -r '.total // 100000' "$budget_file" 2>/dev/null || echo "100000")

    if (( total > 0 )); then
        percentage=$(( (used * 100) / total ))
    else
        percentage=0
    fi

    echo "$used|$available|$total|$percentage"
}

# Get recent events
get_recent_events() {
    local events_file="$COMMIT_RELAY_HOME/coordination/dashboard-events.jsonl"
    local count="${1:-5}"

    if [[ ! -f "$events_file" ]]; then
        echo "No events"
        return
    fi

    tail -n "$count" "$events_file" 2>/dev/null | while IFS= read -r line; do
        local timestamp event_type
        timestamp=$(echo "$line" | jq -r '.timestamp // "N/A"' 2>/dev/null || echo "N/A")
        event_type=$(echo "$line" | jq -r '.event_type // "unknown"' 2>/dev/null || echo "unknown")

        # Format timestamp
        if [[ "$timestamp" != "N/A" ]]; then
            timestamp=$(echo "$timestamp" | cut -d'T' -f2 | cut -d'-' -f1 | cut -d'.' -f1)
        fi

        echo "${timestamp} ${event_type}"
    done
}

# Get active workers list
get_active_workers() {
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"
    local count="${1:-10}"

    if [[ ! -d "$worker_specs" ]]; then
        echo "No active workers"
        return
    fi

    find "$worker_specs" -name "worker-*.json" 2>/dev/null | head -n "$count" | while read -r spec_file; do
        local worker_id worker_type status health_score

        worker_id=$(jq -r '.worker_id // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        worker_type=$(jq -r '.worker_type // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        status=$(jq -r '.status // "unknown"' "$spec_file" 2>/dev/null || echo "unknown")
        health_score=$(jq -r '.heartbeat.health_score // 0' "$spec_file" 2>/dev/null || echo "0")

        # Format worker type (remove -worker suffix)
        worker_type="${worker_type%-worker}"

        echo "${worker_id}|${worker_type}|${status}|${health_score}"
    done
}

# Get health alerts
get_health_alerts() {
    local alerts_file="$COMMIT_RELAY_HOME/coordination/health-alerts.json"
    local count="${1:-3}"

    if [[ ! -f "$alerts_file" ]]; then
        echo "No alerts"
        return
    fi

    jq -r ".alerts[-${count}:] | .[] | \"\(.severity)|\(.message)\"" "$alerts_file" 2>/dev/null || echo "No alerts"
}

# Get failure patterns summary
get_pattern_summary() {
    local pattern_db="$COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl"

    if [[ ! -f "$pattern_db" ]]; then
        echo "0|0"
        return
    fi

    local total_patterns high_confidence

    total_patterns=$(wc -l < "$pattern_db" | xargs)
    high_confidence=$(grep -c '"confidence":0\.[89]' "$pattern_db" 2>/dev/null || echo "0")

    echo "$total_patterns|$high_confidence"
}

# Draw progress bar
draw_progress_bar() {
    local percentage="$1"
    local width="$2"
    local filled=$((percentage * width / 100))

    local bar=""
    for ((i=0; i<filled; i++)); do
        bar="${bar}█"
    done

    for ((i=filled; i<width; i++)); do
        bar="${bar}░"
    done

    # Color based on percentage
    if (( percentage >= 80 )); then
        echo -e "${RED}${bar}${NC}"
    elif (( percentage >= 60 )); then
        echo -e "${YELLOW}${bar}${NC}"
    else
        echo -e "${GREEN}${bar}${NC}"
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
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Commit-Relay System Monitor${NC}                                                ${BOLD}${CYAN}║${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}╠═══════════════════════════════════════════════════════════════════════════════╣${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}║${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}║${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"

    # Get data
    local worker_count
    worker_count=$(get_worker_count)

    IFS='|' read -r queued in_progress completed <<< "$(get_task_queue_status)"
    IFS='|' read -r daemons_running daemons_total <<< "$(get_daemon_status)"
    IFS='|' read -r tokens_used tokens_available tokens_total tokens_pct <<< "$(get_token_budget)"
    IFS='|' read -r total_patterns high_conf_patterns <<< "$(get_pattern_summary)"

    # System Overview (left column)
    move_cursor 6 2
    echo -e "${BOLD}System Overview${NC}"
    move_cursor 7 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 8 2
    echo -e "Workers:       ${GREEN}${worker_count}${NC} active"

    move_cursor 9 2
    echo -e "Tasks:"

    move_cursor 10 4
    echo -e "Queued:      ${YELLOW}${queued}${NC}"

    move_cursor 11 4
    echo -e "In Progress: ${CYAN}${in_progress}${NC}"

    move_cursor 12 4
    echo -e "Completed:   ${GREEN}${completed}${NC}"

    move_cursor 13 2
    if (( daemons_running == daemons_total )); then
        echo -e "Daemons:       ${GREEN}${daemons_running}/${daemons_total}${NC} healthy"
    else
        echo -e "Daemons:       ${RED}${daemons_running}/${daemons_total}${NC} running"
    fi

    move_cursor 14 2
    echo -e "Patterns:      ${MAGENTA}${total_patterns}${NC} detected (${high_conf_patterns} high-conf)"

    # Token Budget
    move_cursor 16 2
    echo -e "${BOLD}Token Budget${NC}"
    move_cursor 17 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 18 2
    printf "Used:      %'d / %'d (%d%%)\n" "$tokens_used" "$tokens_total" "$tokens_pct"

    move_cursor 19 2
    printf "Available: ${GREEN}%'d${NC}\n" "$tokens_available"

    move_cursor 20 2
    echo -n "Usage:     "
    draw_progress_bar "$tokens_pct" 20

    # Active Workers (right column)
    move_cursor 6 42
    echo -e "${BOLD}Active Workers${NC}"
    move_cursor 7 42
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local row=8
    get_active_workers 10 | while IFS='|' read -r worker_id worker_type status health; do
        move_cursor $row 42

        # Truncate worker ID
        local short_id="${worker_id:0:20}"

        # Status color
        local status_color="${GREEN}"
        [[ "$status" == "zombie" ]] && status_color="${RED}"

        # Health indicator
        local health_indicator="●"
        if (( health >= 80 )); then
            health_indicator="${GREEN}●${NC}"
        elif (( health >= 60 )); then
            health_indicator="${YELLOW}●${NC}"
        else
            health_indicator="${RED}●${NC}"
        fi

        printf "${health_indicator} %-20s ${DIM}%s${NC}\n" "$short_id" "($worker_type)"
        ((row++))
    done

    if (( row == 8 )); then
        move_cursor 8 42
        echo -e "${DIM}No active workers${NC}"
    fi

    # Recent Events (bottom section)
    move_cursor 22 2
    echo -e "${BOLD}Recent Events${NC}"
    move_cursor 23 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local event_row=24
    get_recent_events 5 | while read -r event_line; do
        move_cursor $event_row 2
        echo -e "${DIM}$event_line${NC}"
        ((event_row++))
    done

    if (( event_row == 24 )); then
        move_cursor 24 2
        echo -e "${DIM}No recent events${NC}"
    fi

    # Health Alerts
    move_cursor 22 42
    echo -e "${BOLD}Health Alerts${NC}"
    move_cursor 23 42
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local alert_row=24
    get_health_alerts 5 | while IFS='|' read -r severity message; do
        move_cursor $alert_row 42

        local severity_color="${YELLOW}"
        [[ "$severity" == "critical" ]] && severity_color="${RED}"
        [[ "$severity" == "warning" ]] && severity_color="${YELLOW}"
        [[ "$severity" == "info" ]] && severity_color="${CYAN}"

        # Truncate message
        local short_msg="${message:0:35}"

        echo -e "${severity_color}▲${NC} ${DIM}$short_msg${NC}"
        ((alert_row++))
    done

    if (( alert_row == 24 )); then
        move_cursor 24 42
        echo -e "${DIM}No alerts${NC}"
    fi

    # Footer
    local footer_row=$((TERM_ROWS - 2))
    move_cursor $footer_row 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor $((footer_row + 1)) 0
    echo -e "${DIM}Press ${BOLD}Ctrl+C${NC}${DIM} to exit | Refreshing every ${REFRESH_INTERVAL}s${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    echo "Dashboard stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main loop
main() {
    # Hide cursor
    tput civis

    while true; do
        render_dashboard
        sleep "$REFRESH_INTERVAL"
    done
}

# Run dashboard
main "$@"
