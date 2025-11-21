#!/bin/bash
# scripts/dashboards/daemon-monitor.sh
# Terminal dashboard showing daemon health, PID, uptime with start/stop controls
# Part of commit-relay Phase 4 Developer Experience

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Daemon definitions
declare -A DAEMON_PIDS=(
    ["pm-daemon"]="/tmp/pm-daemon.pid"
    ["coordinator-daemon"]="/tmp/coordinator-daemon.pid"
    ["heartbeat-monitor"]="/tmp/heartbeat-monitor.pid"
    ["zombie-killer"]="/tmp/zombie-killer.pid"
    ["metrics-snapshot"]="/tmp/metrics-snapshot-daemon.pid"
    ["governance-monitor"]="/tmp/governance-monitor.pid"
)

declare -A DAEMON_SCRIPTS=(
    ["pm-daemon"]="$COMMIT_RELAY_HOME/scripts/pm-daemon.sh"
    ["coordinator-daemon"]="$COMMIT_RELAY_HOME/scripts/coordinator-daemon.sh"
    ["heartbeat-monitor"]="$COMMIT_RELAY_HOME/scripts/health-monitor-daemon.sh"
    ["zombie-killer"]="$COMMIT_RELAY_HOME/scripts/zombie-killer-daemon.sh"
    ["metrics-snapshot"]="$COMMIT_RELAY_HOME/scripts/metrics-snapshot-daemon.sh"
    ["governance-monitor"]="$COMMIT_RELAY_HOME/scripts/governance-monitor-daemon.sh"
)

# Helper functions
get_daemon_status() {
    local daemon_name="$1"
    local pid_file="${DAEMON_PIDS[$daemon_name]}"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            echo "running:$pid"
        else
            echo "stale"
        fi
    else
        echo "stopped"
    fi
}

get_daemon_uptime() {
    local daemon_name="$1"
    local pid_file="${DAEMON_PIDS[$daemon_name]}"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            local start_time=$(ps -o lstart= -p "$pid" 2>/dev/null | xargs)
            if [ -n "$start_time" ]; then
                local start_epoch=$(date -j -f "%a %b %d %H:%M:%S %Y" "$start_time" +%s 2>/dev/null || echo 0)
                local now_epoch=$(date +%s)
                local uptime_secs=$((now_epoch - start_epoch))
                local days=$((uptime_secs / 86400))
                local hours=$(((uptime_secs % 86400) / 3600))
                local mins=$(((uptime_secs % 3600) / 60))

                if [ $days -gt 0 ]; then
                    echo "${days}d ${hours}h ${mins}m"
                elif [ $hours -gt 0 ]; then
                    echo "${hours}h ${mins}m"
                else
                    echo "${mins}m"
                fi
            else
                echo "N/A"
            fi
        else
            echo "-"
        fi
    else
        echo "-"
    fi
}

get_daemon_memory() {
    local daemon_name="$1"
    local pid_file="${DAEMON_PIDS[$daemon_name]}"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            local mem=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
            if [ -n "$mem" ]; then
                echo "$((mem / 1024))MB"
            else
                echo "N/A"
            fi
        else
            echo "-"
        fi
    else
        echo "-"
    fi
}

draw_header() {
    clear
    echo -e "${CYAN}=========================================================================${NC}"
    echo -e "${WHITE}                    COMMIT-RELAY DAEMON MONITOR${NC}"
    echo -e "${CYAN}=========================================================================${NC}"
    echo -e "${BLUE}Time: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo ""
}

draw_daemon_table() {
    echo -e "${WHITE}DAEMON STATUS${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
    printf "%-20s %-10s %-8s %-12s %-10s\n" "DAEMON" "STATUS" "PID" "UPTIME" "MEMORY"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    local running_count=0
    local total_count=0

    for daemon in pm-daemon coordinator-daemon heartbeat-monitor zombie-killer metrics-snapshot governance-monitor; do
        total_count=$((total_count + 1))
        local status_info=$(get_daemon_status "$daemon")
        local status="${status_info%%:*}"
        local pid="${status_info#*:}"
        local uptime=$(get_daemon_uptime "$daemon")
        local memory=$(get_daemon_memory "$daemon")

        local status_color="$RED"
        local status_text="STOPPED"

        if [ "$status" = "running" ]; then
            status_color="$GREEN"
            status_text="RUNNING"
            running_count=$((running_count + 1))
        elif [ "$status" = "stale" ]; then
            status_color="$YELLOW"
            status_text="STALE"
            pid="-"
        else
            pid="-"
        fi

        printf "%-20s ${status_color}%-10s${NC} %-8s %-12s %-10s\n" \
            "$daemon" "$status_text" "$pid" "$uptime" "$memory"
    done

    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
    echo -e "Total: $running_count/$total_count daemons running"
    echo ""
}

draw_pm_state() {
    local pm_state_file="$COMMIT_RELAY_HOME/coordination/pm-state.json"

    if [ -f "$pm_state_file" ]; then
        echo -e "${WHITE}PM DAEMON METRICS${NC}"
        echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

        local loops=$(jq -r '.pm_daemon.loops_completed // 0' "$pm_state_file")
        local last_loop=$(jq -r '.pm_daemon.last_loop // "N/A"' "$pm_state_file")
        local active=$(jq -r '.metrics.active_workers // 0' "$pm_state_file")
        local completed=$(jq -r '.metrics.completed_workers // 0' "$pm_state_file")
        local failed=$(jq -r '.metrics.failed_workers // 0' "$pm_state_file")
        local rate=$(jq -r '.metrics.success_rate // 0' "$pm_state_file")

        printf "%-25s: %s\n" "Loops Completed" "$loops"
        printf "%-25s: %s\n" "Last Loop" "$last_loop"
        printf "%-25s: %s\n" "Active Workers" "$active"
        printf "%-25s: %s\n" "Completed Workers" "$completed"
        printf "%-25s: %s\n" "Failed Workers" "$failed"
        printf "%-25s: %s%%\n" "Success Rate" "$rate"
        echo ""
    fi
}

draw_health_alerts() {
    local alerts_file="$COMMIT_RELAY_HOME/coordination/health-alerts.json"

    if [ -f "$alerts_file" ]; then
        local active_alerts=$(jq -r '[.alerts[] | select(.status == "active")] | length' "$alerts_file" 2>/dev/null || echo 0)

        if [ "$active_alerts" -gt 0 ]; then
            echo -e "${RED}ACTIVE ALERTS: $active_alerts${NC}"
            echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
            jq -r '.alerts[] | select(.status == "active") | "\(.severity | ascii_upcase): \(.message)"' \
                "$alerts_file" 2>/dev/null | head -5
            echo ""
        fi
    fi
}

draw_controls() {
    echo -e "${WHITE}CONTROLS${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
    echo "  [1-6] Start specific daemon    [s] Start all    [x] Stop all"
    echo "  [r] Restart all                [q] Quit         [h] Help"
    echo ""
    echo "  1=pm-daemon  2=coordinator  3=heartbeat  4=zombie  5=metrics  6=governance"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
}

start_daemon() {
    local daemon_name="$1"
    local script="${DAEMON_SCRIPTS[$daemon_name]}"

    if [ -f "$script" ]; then
        echo -e "${YELLOW}Starting $daemon_name...${NC}"
        nohup bash "$script" > /dev/null 2>&1 &
        sleep 2
        echo -e "${GREEN}$daemon_name started${NC}"
    else
        echo -e "${RED}Script not found: $script${NC}"
    fi
}

stop_daemon() {
    local daemon_name="$1"
    local pid_file="${DAEMON_PIDS[$daemon_name]}"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}Stopping $daemon_name (PID $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 1
            rm -f "$pid_file"
            echo -e "${GREEN}$daemon_name stopped${NC}"
        else
            rm -f "$pid_file"
        fi
    fi
}

start_all_daemons() {
    echo -e "${YELLOW}Starting all daemons...${NC}"
    for daemon in pm-daemon coordinator-daemon heartbeat-monitor zombie-killer metrics-snapshot governance-monitor; do
        local status_info=$(get_daemon_status "$daemon")
        local status="${status_info%%:*}"
        if [ "$status" != "running" ]; then
            start_daemon "$daemon"
        fi
    done
    echo -e "${GREEN}All daemons started${NC}"
    sleep 2
}

stop_all_daemons() {
    echo -e "${YELLOW}Stopping all daemons...${NC}"
    for daemon in pm-daemon coordinator-daemon heartbeat-monitor zombie-killer metrics-snapshot governance-monitor; do
        stop_daemon "$daemon"
    done
    echo -e "${GREEN}All daemons stopped${NC}"
    sleep 2
}

show_help() {
    clear
    echo -e "${CYAN}=========================================================================${NC}"
    echo -e "${WHITE}                    DAEMON MONITOR HELP${NC}"
    echo -e "${CYAN}=========================================================================${NC}"
    echo ""
    echo "This dashboard monitors all commit-relay daemons and provides controls"
    echo "to start, stop, and manage them."
    echo ""
    echo -e "${WHITE}Daemons:${NC}"
    echo "  pm-daemon         - Project Manager daemon, monitors workers"
    echo "  coordinator       - Task coordination and routing"
    echo "  heartbeat-monitor - Monitors daemon health"
    echo "  zombie-killer     - Detects and cleans up zombie workers"
    echo "  metrics-snapshot  - Creates historical metrics snapshots"
    echo "  governance        - PII scanning and compliance monitoring"
    echo ""
    echo -e "${WHITE}Commands:${NC}"
    echo "  --status          - Show status and exit (non-interactive)"
    echo "  --start-all       - Start all daemons and exit"
    echo "  --stop-all        - Stop all daemons and exit"
    echo ""
    echo "Press any key to return..."
    read -n 1 -s
}

# Non-interactive mode
if [ "${1:-}" = "--status" ]; then
    echo "COMMIT-RELAY DAEMON STATUS"
    echo "=========================="
    for daemon in pm-daemon coordinator-daemon heartbeat-monitor zombie-killer metrics-snapshot governance-monitor; do
        status_info=$(get_daemon_status "$daemon")
        status="${status_info%%:*}"
        pid="${status_info#*:}"
        if [ "$status" = "running" ]; then
            echo "$daemon: RUNNING (PID $pid)"
        elif [ "$status" = "stale" ]; then
            echo "$daemon: STALE (PID file exists but process dead)"
        else
            echo "$daemon: STOPPED"
        fi
    done
    exit 0
fi

if [ "${1:-}" = "--start-all" ]; then
    start_all_daemons
    exit 0
fi

if [ "${1:-}" = "--stop-all" ]; then
    stop_all_daemons
    exit 0
fi

# Interactive mode
while true; do
    draw_header
    draw_daemon_table
    draw_pm_state
    draw_health_alerts
    draw_controls

    echo -n "Command: "
    read -t 5 -n 1 cmd || cmd=""

    case "$cmd" in
        1) start_daemon "pm-daemon" ; sleep 2 ;;
        2) start_daemon "coordinator-daemon" ; sleep 2 ;;
        3) start_daemon "heartbeat-monitor" ; sleep 2 ;;
        4) start_daemon "zombie-killer" ; sleep 2 ;;
        5) start_daemon "metrics-snapshot" ; sleep 2 ;;
        6) start_daemon "governance-monitor" ; sleep 2 ;;
        s|S) start_all_daemons ;;
        x|X) stop_all_daemons ;;
        r|R) stop_all_daemons ; start_all_daemons ;;
        h|H) show_help ;;
        q|Q) clear ; exit 0 ;;
        *) ;;
    esac
done
