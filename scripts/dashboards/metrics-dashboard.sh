#!/bin/bash
# scripts/dashboards/metrics-dashboard.sh
# ASCII charts for token budget, worker count, completion rate
# Part of Phase 3: Developer Experience

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

# History size for sparklines
HISTORY_SIZE=20

# Initialize history arrays
declare -a TOKEN_HISTORY
declare -a WORKER_HISTORY
declare -a TASK_HISTORY
declare -a COMPLETION_HISTORY

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

# Generate sparkline from array
generate_sparkline() {
    local -n arr=$1
    local max_val=1
    local min_val=0

    # Find max value
    for val in "${arr[@]}"; do
        if (( val > max_val )); then
            max_val=$val
        fi
    done

    # Sparkline characters (8 levels)
    local chars=(" " "▁" "▂" "▃" "▄" "▅" "▆" "▇" "█")

    local sparkline=""
    for val in "${arr[@]}"; do
        local level
        if (( max_val > 0 )); then
            level=$(( (val * 8) / max_val ))
        else
            level=0
        fi
        sparkline+="${chars[$level]}"
    done

    echo "$sparkline"
}

# Draw progress bar
draw_progress_bar() {
    local percentage="$1"
    local width="${2:-20}"

    local filled=$((percentage * width / 100))
    local empty=$((width - filled))

    local bar=""
    for ((i=0; i<filled; i++)); do
        bar+="█"
    done
    for ((i=0; i<empty; i++)); do
        bar+="░"
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

# Get token budget
get_token_budget() {
    local budget_file="$COMMIT_RELAY_HOME/coordination/token-budget.json"

    if [[ ! -f "$budget_file" ]]; then
        echo "0|100000|0"
        return
    fi

    local used total percentage

    used=$(jq -r '.used // 0' "$budget_file" 2>/dev/null || echo "0")
    total=$(jq -r '.total // 100000' "$budget_file" 2>/dev/null || echo "100000")

    if (( total > 0 )); then
        percentage=$(( (used * 100) / total ))
    else
        percentage=0
    fi

    echo "$used|$total|$percentage"
}

# Get worker counts
get_worker_counts() {
    local worker_specs="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [[ ! -d "$worker_specs" ]]; then
        echo "0|0|0|0"
        return
    fi

    local total=0 running=0 idle=0 failed=0

    for spec in "$worker_specs"/worker-*.json; do
        [[ ! -f "$spec" ]] && continue
        ((total++))

        local status
        status=$(jq -r '.status // "unknown"' "$spec" 2>/dev/null || echo "unknown")

        case "$status" in
            running) ((running++)) ;;
            idle) ((idle++)) ;;
            failed|zombie) ((failed++)) ;;
        esac
    done

    echo "$total|$running|$idle|$failed"
}

# Get task counts
get_task_counts() {
    local queue_file="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    if [[ ! -f "$queue_file" ]]; then
        echo "0|0|0|0"
        return
    fi

    local queued in_progress completed failed

    queued=$(jq '[.tasks[] | select(.status == "queued")] | length' "$queue_file" 2>/dev/null || echo "0")
    in_progress=$(jq '[.tasks[] | select(.status == "in_progress")] | length' "$queue_file" 2>/dev/null || echo "0")
    completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$queue_file" 2>/dev/null || echo "0")
    failed=$(jq '[.tasks[] | select(.status == "failed")] | length' "$queue_file" 2>/dev/null || echo "0")

    echo "$queued|$in_progress|$completed|$failed"
}

# Calculate completion rate
calculate_completion_rate() {
    local completed="$1"
    local total="$2"

    if (( total > 0 )); then
        echo $(( (completed * 100) / total ))
    else
        echo "0"
    fi
}

# Get daemon health
get_daemon_health() {
    local pid_files=(
        "/tmp/commit-relay-worker.pid"
        "/tmp/commit-relay-pm.pid"
        "/tmp/commit-relay-heartbeat.pid"
        "/tmp/commit-relay-metrics.pid"
        "/tmp/commit-relay-coordinator.pid"
    )

    local running=0
    local total=${#pid_files[@]}

    for pidfile in "${pid_files[@]}"; do
        if [[ -f "$pidfile" ]]; then
            local pid
            pid=$(cat "$pidfile" 2>/dev/null || echo "")
            if [[ -n "$pid" ]] && ps -p "$pid" > /dev/null 2>&1; then
                ((running++))
            fi
        fi
    done

    echo "$running|$total"
}

# Get pattern detection metrics
get_pattern_metrics() {
    local pattern_db="$COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl"
    local metrics_file="$COMMIT_RELAY_HOME/coordination/metrics/failure-pattern-metrics.json"

    local total_patterns=0 high_conf=0 auto_fixed=0

    if [[ -f "$pattern_db" ]]; then
        total_patterns=$(wc -l < "$pattern_db" | xargs)
        high_conf=$(grep -c '"confidence":0\.[89]' "$pattern_db" 2>/dev/null || echo "0")
    fi

    if [[ -f "$metrics_file" ]]; then
        auto_fixed=$(jq -r '.auto_fixes_applied // 0' "$metrics_file" 2>/dev/null || echo "0")
    fi

    echo "$total_patterns|$high_conf|$auto_fixed"
}

# Get metrics from snapshots
get_historical_metrics() {
    local snapshots_file="$COMMIT_RELAY_HOME/coordination/metrics-snapshots.jsonl"

    if [[ ! -f "$snapshots_file" ]]; then
        return
    fi

    # Get last N snapshots
    tail -n "$HISTORY_SIZE" "$snapshots_file" 2>/dev/null | while IFS= read -r line; do
        local tokens workers tasks
        tokens=$(echo "$line" | jq -r '.token_budget.used // 0' 2>/dev/null || echo "0")
        workers=$(echo "$line" | jq -r '.workers.active // 0' 2>/dev/null || echo "0")
        tasks=$(echo "$line" | jq -r '.tasks.completed // 0' 2>/dev/null || echo "0")

        echo "$tokens|$workers|$tasks"
    done
}

# Update history arrays
update_history() {
    # Get current values
    IFS='|' read -r used total pct <<< "$(get_token_budget)"
    IFS='|' read -r w_total w_running w_idle w_failed <<< "$(get_worker_counts)"
    IFS='|' read -r t_queued t_progress t_completed t_failed <<< "$(get_task_counts)"

    # Add to history
    TOKEN_HISTORY+=("$pct")
    WORKER_HISTORY+=("$w_total")
    TASK_HISTORY+=("$t_completed")

    # Calculate completion rate
    local total_tasks=$((t_queued + t_progress + t_completed + t_failed))
    local rate=$(calculate_completion_rate "$t_completed" "$total_tasks")
    COMPLETION_HISTORY+=("$rate")

    # Trim history to max size
    if (( ${#TOKEN_HISTORY[@]} > HISTORY_SIZE )); then
        TOKEN_HISTORY=("${TOKEN_HISTORY[@]:1}")
    fi
    if (( ${#WORKER_HISTORY[@]} > HISTORY_SIZE )); then
        WORKER_HISTORY=("${WORKER_HISTORY[@]:1}")
    fi
    if (( ${#TASK_HISTORY[@]} > HISTORY_SIZE )); then
        TASK_HISTORY=("${TASK_HISTORY[@]:1}")
    fi
    if (( ${#COMPLETION_HISTORY[@]} > HISTORY_SIZE )); then
        COMPLETION_HISTORY=("${COMPLETION_HISTORY[@]:1}")
    fi
}

# Render dashboard
render_dashboard() {
    clear_screen
    get_terminal_size

    # Update history
    update_history

    local current_time
    current_time=$(date '+%Y-%m-%d %H:%M:%S')

    # Header
    move_cursor 0 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"
    move_cursor 1 0
    echo -e "${BOLD}${CYAN}|${NC}  ${BOLD}Metrics Dashboard${NC}                                                          ${BOLD}${CYAN}|${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}|${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}|${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"

    # Get current data
    IFS='|' read -r used total pct <<< "$(get_token_budget)"
    IFS='|' read -r w_total w_running w_idle w_failed <<< "$(get_worker_counts)"
    IFS='|' read -r t_queued t_progress t_completed t_failed <<< "$(get_task_counts)"
    IFS='|' read -r d_running d_total <<< "$(get_daemon_health)"
    IFS='|' read -r patterns high_conf auto_fixed <<< "$(get_pattern_metrics)"

    # Token Budget Section
    move_cursor 6 2
    echo -e "${BOLD}Token Budget${NC}"
    move_cursor 7 2
    echo -e "${BLUE}-----------------------------------------------------${NC}"

    move_cursor 8 2
    printf "Used: %'d / %'d (%d%%)\n" "$used" "$total" "$pct"

    move_cursor 9 2
    echo -n "Progress: "
    draw_progress_bar "$pct" 30

    move_cursor 10 2
    echo -n "History:  "
    if (( ${#TOKEN_HISTORY[@]} > 0 )); then
        local sparkline
        sparkline=$(generate_sparkline TOKEN_HISTORY)
        echo -e "${CYAN}$sparkline${NC}"
    else
        echo -e "${DIM}No history yet${NC}"
    fi

    # Worker Metrics Section
    move_cursor 12 2
    echo -e "${BOLD}Worker Metrics${NC}"
    move_cursor 13 2
    echo -e "${BLUE}-----------------------------------------------------${NC}"

    move_cursor 14 2
    echo -e "Active Workers: ${CYAN}$w_total${NC}"

    move_cursor 15 2
    echo -e "  ${GREEN}Running:${NC} $w_running  ${YELLOW}Idle:${NC} $w_idle  ${RED}Failed:${NC} $w_failed"

    move_cursor 16 2
    echo -n "History:  "
    if (( ${#WORKER_HISTORY[@]} > 0 )); then
        local sparkline
        sparkline=$(generate_sparkline WORKER_HISTORY)
        echo -e "${GREEN}$sparkline${NC}"
    else
        echo -e "${DIM}No history yet${NC}"
    fi

    # Task Metrics Section
    move_cursor 18 2
    echo -e "${BOLD}Task Metrics${NC}"
    move_cursor 19 2
    echo -e "${BLUE}-----------------------------------------------------${NC}"

    move_cursor 20 2
    echo -e "Queued: ${YELLOW}$t_queued${NC}  In Progress: ${CYAN}$t_progress${NC}  Completed: ${GREEN}$t_completed${NC}  Failed: ${RED}$t_failed${NC}"

    local total_tasks=$((t_queued + t_progress + t_completed + t_failed))
    local completion_rate=0
    if (( total_tasks > 0 )); then
        completion_rate=$(( (t_completed * 100) / total_tasks ))
    fi

    move_cursor 21 2
    echo -e "Completion Rate: ${CYAN}${completion_rate}%${NC}"

    move_cursor 22 2
    echo -n "Completed: "
    if (( ${#TASK_HISTORY[@]} > 0 )); then
        local sparkline
        sparkline=$(generate_sparkline TASK_HISTORY)
        echo -e "${MAGENTA}$sparkline${NC}"
    else
        echo -e "${DIM}No history yet${NC}"
    fi

    # System Health Section (right column)
    move_cursor 6 42
    echo -e "${BOLD}System Health${NC}"
    move_cursor 7 42
    echo -e "${BLUE}-----------------------------------${NC}"

    move_cursor 8 42
    if (( d_running == d_total )); then
        echo -e "Daemons:  ${GREEN}$d_running/$d_total${NC} healthy"
    else
        echo -e "Daemons:  ${RED}$d_running/$d_total${NC} running"
    fi

    move_cursor 9 42
    echo -e "Patterns: ${MAGENTA}$patterns${NC} detected"

    move_cursor 10 42
    echo -e "High-Conf: ${CYAN}$high_conf${NC}"

    move_cursor 11 42
    echo -e "Auto-Fixed: ${GREEN}$auto_fixed${NC}"

    # Quick Stats (right column)
    move_cursor 13 42
    echo -e "${BOLD}Quick Stats${NC}"
    move_cursor 14 42
    echo -e "${BLUE}-----------------------------------${NC}"

    # Calculate some derived metrics
    local available=$((total - used))
    local worker_efficiency=0
    if (( w_total > 0 )); then
        worker_efficiency=$(( (w_running * 100) / w_total ))
    fi

    move_cursor 15 42
    printf "Available Tokens: ${GREEN}%'d${NC}\n" "$available"

    move_cursor 16 42
    echo -e "Worker Efficiency: ${CYAN}${worker_efficiency}%${NC}"

    move_cursor 17 42
    echo -e "Total Tasks: ${CYAN}$total_tasks${NC}"

    # Trend indicators
    move_cursor 19 42
    echo -e "${BOLD}Trends${NC}"
    move_cursor 20 42
    echo -e "${BLUE}-----------------------------------${NC}"

    # Token trend
    local token_trend="stable"
    if (( ${#TOKEN_HISTORY[@]} >= 3 )); then
        local last="${TOKEN_HISTORY[-1]}"
        local prev="${TOKEN_HISTORY[-3]}"
        if (( last > prev + 5 )); then
            token_trend="increasing"
        elif (( last < prev - 5 )); then
            token_trend="decreasing"
        fi
    fi

    move_cursor 21 42
    case "$token_trend" in
        increasing) echo -e "Token Usage: ${RED}^ Increasing${NC}" ;;
        decreasing) echo -e "Token Usage: ${GREEN}v Decreasing${NC}" ;;
        *) echo -e "Token Usage: ${YELLOW}- Stable${NC}" ;;
    esac

    # Worker trend
    local worker_trend="stable"
    if (( ${#WORKER_HISTORY[@]} >= 3 )); then
        local last="${WORKER_HISTORY[-1]}"
        local prev="${WORKER_HISTORY[-3]}"
        if (( last > prev )); then
            worker_trend="growing"
        elif (( last < prev )); then
            worker_trend="shrinking"
        fi
    fi

    move_cursor 22 42
    case "$worker_trend" in
        growing) echo -e "Worker Pool: ${GREEN}^ Growing${NC}" ;;
        shrinking) echo -e "Worker Pool: ${YELLOW}v Shrinking${NC}" ;;
        *) echo -e "Worker Pool: ${CYAN}- Stable${NC}" ;;
    esac

    # Footer
    local footer_row=$((TERM_ROWS - 3))
    move_cursor $footer_row 0
    echo -e "${BLUE}================================================================================${NC}"

    move_cursor $((footer_row + 1)) 0
    echo -e "${DIM}Press ${BOLD}Ctrl+C${NC}${DIM} to exit | Auto-refreshing every ${REFRESH_INTERVAL}s | History: ${#TOKEN_HISTORY[@]}/$HISTORY_SIZE samples${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    tput cnorm  # Show cursor
    echo "Metrics dashboard stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main loop
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --interval)
                REFRESH_INTERVAL="$2"
                shift 2
                ;;
            --history)
                HISTORY_SIZE="$2"
                shift 2
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --interval <seconds>  Set refresh interval (default: 5)"
                echo "  --history <count>     Set history size for sparklines (default: 20)"
                echo "  --help                Show this help"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Initialize history arrays
    TOKEN_HISTORY=()
    WORKER_HISTORY=()
    TASK_HISTORY=()
    COMPLETION_HISTORY=()

    # Hide cursor
    tput civis

    while true; do
        render_dashboard
        sleep "$REFRESH_INTERVAL"
    done
}

# Run dashboard
main "$@"
