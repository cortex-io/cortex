#!/bin/bash
# scripts/dashboards/daemon-monitor.sh
# Terminal dashboard for daemon health, PID, uptime, and controls
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

# Interactive mode
INTERACTIVE_MODE=false

# Daemon definitions
declare -A DAEMON_INFO
DAEMON_INFO=(
    ["worker"]="/tmp/commit-relay-worker.pid|scripts/worker-daemon.sh|Worker Spawner"
    ["pm"]="/tmp/commit-relay-pm.pid|scripts/pm-daemon.sh|Process Manager"
    ["heartbeat"]="/tmp/commit-relay-heartbeat.pid|scripts/daemons/heartbeat-monitor-daemon.sh|Heartbeat Monitor"
    ["metrics"]="/tmp/commit-relay-metrics.pid|scripts/metrics-snapshot-daemon.sh|Metrics Snapshot"
    ["coordinator"]="/tmp/commit-relay-coordinator.pid|scripts/coordinator-daemon.sh|Coordinator"
    ["integration"]="/tmp/commit-relay-integration.pid|scripts/integration-validator-daemon.sh|Integration Validator"
    ["failure-pattern"]="/tmp/commit-relay-failure-pattern.pid|scripts/daemons/failure-pattern-daemon.sh|Failure Pattern"
    ["auto-fix"]="/tmp/commit-relay-auto-fix.pid|scripts/daemons/auto-fix-daemon.sh|Auto-Fix"
    ["governance"]="/tmp/commit-relay-governance.pid|scripts/governance-monitor-daemon.sh|Governance Monitor"
)

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

# Get daemon status
get_daemon_status() {
    local daemon_name="$1"
    local info="${DAEMON_INFO[$daemon_name]}"

    IFS='|' read -r pid_file script_path description <<< "$info"

    local status="stopped"
    local pid=""
    local uptime=""
    local memory=""
    local cpu=""

    if [[ -f "$pid_file" ]]; then
        pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && ps -p "$pid" > /dev/null 2>&1; then
            status="running"

            # Get uptime
            local start_time
            start_time=$(ps -p "$pid" -o lstart= 2>/dev/null || echo "")
            if [[ -n "$start_time" ]]; then
                local start_ts
                start_ts=$(date -j -f "%a %b %d %T %Y" "$start_time" +%s 2>/dev/null || echo "0")
                if [[ "$start_ts" != "0" ]]; then
                    local now_ts
                    now_ts=$(date +%s)
                    local uptime_seconds=$((now_ts - start_ts))
                    local hours=$((uptime_seconds / 3600))
                    local minutes=$(( (uptime_seconds % 3600) / 60 ))
                    if (( hours > 0 )); then
                        uptime="${hours}h ${minutes}m"
                    else
                        uptime="${minutes}m"
                    fi
                fi
            fi

            # Get memory and CPU
            memory=$(ps -p "$pid" -o rss= 2>/dev/null | awk '{printf "%.1fMB", $1/1024}' || echo "N/A")
            cpu=$(ps -p "$pid" -o %cpu= 2>/dev/null | xargs || echo "N/A")
        else
            status="dead"
            pid=""
        fi
    fi

    echo "$daemon_name|$status|$pid|$uptime|$memory|$cpu|$description"
}

# Get daemon logs
get_daemon_logs() {
    local daemon_name="$1"
    local count="${2:-5}"

    local log_file="$COMMIT_RELAY_HOME/agents/logs/system/${daemon_name}-daemon.log"

    if [[ -f "$log_file" ]]; then
        tail -n "$count" "$log_file" 2>/dev/null || echo "No logs"
    else
        echo "No log file found"
    fi
}

# Start daemon
start_daemon() {
    local daemon_name="$1"
    local info="${DAEMON_INFO[$daemon_name]}"

    IFS='|' read -r pid_file script_path description <<< "$info"

    local full_script="$COMMIT_RELAY_HOME/$script_path"

    if [[ -f "$full_script" ]]; then
        nohup "$full_script" > /dev/null 2>&1 &
        sleep 1
        echo "Started $daemon_name daemon"
    else
        echo "Script not found: $full_script"
    fi
}

# Stop daemon
stop_daemon() {
    local daemon_name="$1"
    local info="${DAEMON_INFO[$daemon_name]}"

    IFS='|' read -r pid_file script_path description <<< "$info"

    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
            echo "Stopped $daemon_name daemon (PID: $pid)"
        else
            rm -f "$pid_file"
            echo "Cleaned up stale PID file for $daemon_name"
        fi
    else
        echo "No PID file found for $daemon_name"
    fi
}

# Restart daemon
restart_daemon() {
    local daemon_name="$1"
    stop_daemon "$daemon_name"
    sleep 1
    start_daemon "$daemon_name"
}

# Draw status indicator
draw_status_indicator() {
    local status="$1"

    case "$status" in
        running)
            echo -e "${GREEN}[RUNNING]${NC}"
            ;;
        stopped)
            echo -e "${YELLOW}[STOPPED]${NC}"
            ;;
        dead)
            echo -e "${RED}[  DEAD ]${NC}"
            ;;
        *)
            echo -e "${DIM}[UNKNOWN]${NC}"
            ;;
    esac
}

# Render dashboard
render_dashboard() {
    clear_screen
    get_terminal_size

    local current_time
    current_time=$(date '+%Y-%m-%d %H:%M:%S')

    # Header
    move_cursor 0 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"
    move_cursor 1 0
    echo -e "${BOLD}${CYAN}|${NC}  ${BOLD}Daemon Monitor Dashboard${NC}                                                   ${BOLD}${CYAN}|${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}|${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}|${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}+===============================================================================+${NC}"

    # Summary counts
    local running=0 stopped=0 dead=0
    for daemon_name in "${!DAEMON_INFO[@]}"; do
        IFS='|' read -r name status pid uptime memory cpu desc <<< "$(get_daemon_status "$daemon_name")"
        case "$status" in
            running) ((running++)) ;;
            stopped) ((stopped++)) ;;
            dead) ((dead++)) ;;
        esac
    done

    local total=${#DAEMON_INFO[@]}

    move_cursor 6 2
    echo -e "${BOLD}Summary${NC}"
    move_cursor 7 2
    echo -e "${BLUE}-----------------------------------------------------${NC}"

    move_cursor 8 2
    echo -e "Total Daemons: ${CYAN}$total${NC}"

    move_cursor 9 2
    echo -e "  ${GREEN}Running:${NC} $running  ${YELLOW}Stopped:${NC} $stopped  ${RED}Dead:${NC} $dead"

    # Daemon list
    move_cursor 11 0
    echo -e "${BOLD}Daemon Status${NC}"
    move_cursor 12 0
    echo -e "${BLUE}================================================================================${NC}"

    # Table header
    move_cursor 13 0
    printf "${BOLD}%-18s %-10s %-8s %-10s %-10s %-6s %-20s${NC}\n" \
        "Name" "Status" "PID" "Uptime" "Memory" "CPU%" "Description"

    move_cursor 14 0
    printf "%-18s %-10s %-8s %-10s %-10s %-6s %-20s\n" \
        "------------------" "----------" "--------" "----------" "----------" "------" "--------------------"

    # Daemon rows
    local row=15
    for daemon_name in $(echo "${!DAEMON_INFO[@]}" | tr ' ' '\n' | sort); do
        IFS='|' read -r name status pid uptime memory cpu desc <<< "$(get_daemon_status "$daemon_name")"

        move_cursor $row 0

        # Status indicator
        local status_str
        status_str=$(draw_status_indicator "$status")

        # Format fields
        [[ -z "$pid" ]] && pid="-"
        [[ -z "$uptime" ]] && uptime="-"
        [[ -z "$memory" ]] && memory="-"
        [[ -z "$cpu" ]] && cpu="-"

        printf "%-18s " "$name"
        echo -n -e "$status_str  "
        printf "%-8s %-10s %-10s %-6s %-20s\n" "$pid" "$uptime" "$memory" "$cpu" "${desc:0:20}"

        ((row++))
    done

    # Recent logs section
    local log_row=$((row + 2))
    move_cursor $log_row 0
    echo -e "${BOLD}Recent System Activity${NC}"
    move_cursor $((log_row + 1)) 0
    echo -e "${BLUE}================================================================================${NC}"

    # Get recent events from dashboard events
    local events_file="$COMMIT_RELAY_HOME/coordination/dashboard-events.jsonl"
    if [[ -f "$events_file" ]]; then
        local event_row=$((log_row + 2))
        tail -n 5 "$events_file" 2>/dev/null | while IFS= read -r line; do
            local timestamp event_type
            timestamp=$(echo "$line" | jq -r '.timestamp // "N/A"' 2>/dev/null || echo "N/A")
            event_type=$(echo "$line" | jq -r '.event_type // "unknown"' 2>/dev/null || echo "unknown")

            # Format timestamp
            if [[ "$timestamp" != "N/A" ]]; then
                timestamp=$(echo "$timestamp" | cut -d'T' -f2 | cut -d'-' -f1 | cut -d'.' -f1 | cut -c1-8)
            fi

            move_cursor $event_row 2
            echo -e "${DIM}$timestamp${NC} $event_type"
            ((event_row++))
        done
    else
        move_cursor $((log_row + 2)) 2
        echo -e "${DIM}No recent events${NC}"
    fi

    # Footer with controls
    local footer_row=$((TERM_ROWS - 6))
    move_cursor $footer_row 0
    echo -e "${BLUE}================================================================================${NC}"

    move_cursor $((footer_row + 1)) 0
    echo -e "${BOLD}Controls${NC}"

    move_cursor $((footer_row + 2)) 2
    echo -e "Press ${BOLD}s${NC} to start all  |  ${BOLD}x${NC} to stop all  |  ${BOLD}r${NC} to restart all"

    move_cursor $((footer_row + 3)) 2
    echo -e "Press ${BOLD}1-9${NC} to toggle individual daemon  |  ${BOLD}l${NC} to view logs"

    move_cursor $((footer_row + 4)) 0
    echo -e "${DIM}Press ${BOLD}Ctrl+C${NC}${DIM} to exit | Refreshing every ${REFRESH_INTERVAL}s${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Handle user input
handle_input() {
    local key
    read -rsn1 -t "$REFRESH_INTERVAL" key || return

    case "$key" in
        s|S)
            # Start all daemons
            clear_screen
            echo "Starting all daemons..."
            for daemon_name in "${!DAEMON_INFO[@]}"; do
                start_daemon "$daemon_name"
            done
            sleep 2
            ;;
        x|X)
            # Stop all daemons
            clear_screen
            echo "Stopping all daemons..."
            for daemon_name in "${!DAEMON_INFO[@]}"; do
                stop_daemon "$daemon_name"
            done
            sleep 2
            ;;
        r|R)
            # Restart all daemons
            clear_screen
            echo "Restarting all daemons..."
            for daemon_name in "${!DAEMON_INFO[@]}"; do
                restart_daemon "$daemon_name"
            done
            sleep 2
            ;;
        l|L)
            # View logs
            clear_screen
            echo "Select daemon to view logs (press any key to return):"
            echo ""
            local idx=1
            declare -a daemon_list
            for daemon_name in $(echo "${!DAEMON_INFO[@]}" | tr ' ' '\n' | sort); do
                echo "  $idx. $daemon_name"
                daemon_list[$idx]="$daemon_name"
                ((idx++))
            done
            echo ""
            read -rsn1 choice
            if [[ "$choice" =~ [1-9] ]] && [[ -n "${daemon_list[$choice]:-}" ]]; then
                local selected="${daemon_list[$choice]}"
                echo ""
                echo "Recent logs for $selected:"
                echo "----------------------------------------"
                get_daemon_logs "$selected" 20
                echo ""
                echo "Press any key to return..."
                read -rsn1
            fi
            ;;
        [1-9])
            # Toggle individual daemon
            local idx=1
            for daemon_name in $(echo "${!DAEMON_INFO[@]}" | tr ' ' '\n' | sort); do
                if [[ "$idx" == "$key" ]]; then
                    IFS='|' read -r name status pid uptime memory cpu desc <<< "$(get_daemon_status "$daemon_name")"
                    if [[ "$status" == "running" ]]; then
                        stop_daemon "$daemon_name"
                    else
                        start_daemon "$daemon_name"
                    fi
                    sleep 1
                    break
                fi
                ((idx++))
            done
            ;;
        q|Q)
            cleanup
            ;;
    esac
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    tput cnorm  # Show cursor
    echo "Daemon monitor stopped."
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
            --start)
                # Start a specific daemon
                start_daemon "$2"
                exit 0
                ;;
            --stop)
                # Stop a specific daemon
                stop_daemon "$2"
                exit 0
                ;;
            --restart)
                # Restart a specific daemon
                restart_daemon "$2"
                exit 0
                ;;
            --status)
                # Show status and exit
                for daemon_name in $(echo "${!DAEMON_INFO[@]}" | tr ' ' '\n' | sort); do
                    IFS='|' read -r name status pid uptime memory cpu desc <<< "$(get_daemon_status "$daemon_name")"
                    echo "$name: $status (PID: ${pid:-N/A})"
                done
                exit 0
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --interval <seconds>  Set refresh interval (default: 5)"
                echo "  --start <daemon>      Start a specific daemon"
                echo "  --stop <daemon>       Stop a specific daemon"
                echo "  --restart <daemon>    Restart a specific daemon"
                echo "  --status              Show daemon status and exit"
                echo "  --help                Show this help"
                echo ""
                echo "Available daemons:"
                for daemon_name in $(echo "${!DAEMON_INFO[@]}" | tr ' ' '\n' | sort); do
                    echo "  - $daemon_name"
                done
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Hide cursor
    tput civis

    while true; do
        render_dashboard
        handle_input
    done
}

# Run dashboard
main "$@"
