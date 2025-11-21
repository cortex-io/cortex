#!/bin/bash
# scripts/dashboards/metrics-dashboard.sh
# ASCII charts for token budget, worker count, completion rate with real-time updates
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

# Refresh interval in seconds
REFRESH_INTERVAL="${REFRESH_INTERVAL:-5}"

# Draw ASCII bar chart
draw_bar() {
    local value="$1"
    local max="$2"
    local width="${3:-40}"
    local color="$4"

    if [ "$max" -eq 0 ]; then
        max=1
    fi

    local filled=$((value * width / max))
    local empty=$((width - filled))

    printf "${color}"
    for ((i=0; i<filled; i++)); do
        printf "#"
    done
    printf "${NC}"
    for ((i=0; i<empty; i++)); do
        printf "-"
    done
}

# Draw sparkline from historical data
draw_sparkline() {
    local data="$1"
    local blocks=("_" "." ":" "=" "#" "@")

    # Convert data to array
    IFS=',' read -ra values <<< "$data"

    local max=1
    for val in "${values[@]}"; do
        if [ "$val" -gt "$max" ]; then
            max="$val"
        fi
    done

    for val in "${values[@]}"; do
        local idx=$((val * 5 / max))
        if [ "$idx" -gt 5 ]; then idx=5; fi
        printf "%s" "${blocks[$idx]}"
    done
}

draw_header() {
    clear
    echo -e "${CYAN}=========================================================================${NC}"
    echo -e "${WHITE}                    COMMIT-RELAY METRICS DASHBOARD${NC}"
    echo -e "${CYAN}=========================================================================${NC}"
    echo -e "${BLUE}Time: $(date '+%Y-%m-%d %H:%M:%S')    Refresh: ${REFRESH_INTERVAL}s${NC}"
    echo ""
}

draw_token_budget() {
    local token_file="$COMMIT_RELAY_HOME/coordination/token-budget.json"

    echo -e "${WHITE}TOKEN BUDGET${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -f "$token_file" ]; then
        local total=$(jq -r '.total_budget // 200000' "$token_file")
        local used=$(jq -r '.usage_metrics.total_tokens_used_today // 0' "$token_file")
        local available=$((total - used))
        local pct=$((used * 100 / total))

        # Determine color based on usage
        local color="$GREEN"
        if [ "$pct" -ge 90 ]; then
            color="$RED"
        elif [ "$pct" -ge 75 ]; then
            color="$YELLOW"
        fi

        printf "Total Budget:    %'d tokens\n" "$total"
        printf "Used Today:      %'d tokens (%d%%)\n" "$used" "$pct"
        printf "Available:       %'d tokens\n" "$available"
        echo ""
        printf "Usage: ["
        draw_bar "$used" "$total" 50 "$color"
        printf "] %d%%\n" "$pct"
    else
        echo "Token budget file not found"
    fi
    echo ""
}

draw_worker_metrics() {
    local pm_state="$COMMIT_RELAY_HOME/coordination/pm-state.json"

    echo -e "${WHITE}WORKER METRICS${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -f "$pm_state" ]; then
        local active=$(jq -r '.metrics.active_workers // 0' "$pm_state")
        local completed=$(jq -r '.metrics.completed_workers // 0' "$pm_state")
        local failed=$(jq -r '.metrics.failed_workers // 0' "$pm_state")
        local total=$(jq -r '.metrics.total_workers // 0' "$pm_state")
        local rate=$(jq -r '.metrics.success_rate // 0' "$pm_state")

        printf "%-20s: %d\n" "Active Workers" "$active"
        printf "%-20s: %d\n" "Completed Workers" "$completed"
        printf "%-20s: %d\n" "Failed Workers" "$failed"
        printf "%-20s: %d\n" "Total Workers" "$total"
        echo ""

        # Worker distribution bar
        if [ "$total" -gt 0 ]; then
            local completed_bar=$((completed * 40 / total))
            local failed_bar=$((failed * 40 / total))
            local active_bar=$((active * 40 / total))
            local other_bar=$((40 - completed_bar - failed_bar - active_bar))

            printf "Distribution: ["
            printf "${GREEN}"
            for ((i=0; i<completed_bar; i++)); do printf "="; done
            printf "${RED}"
            for ((i=0; i<failed_bar; i++)); do printf "x"; done
            printf "${YELLOW}"
            for ((i=0; i<active_bar; i++)); do printf "@"; done
            printf "${NC}"
            for ((i=0; i<other_bar; i++)); do printf "-"; done
            printf "]\n"
            echo -e "Legend: ${GREEN}=completed${NC} ${RED}xfailed${NC} ${YELLOW}@active${NC}"
        fi
    else
        echo "PM state file not found"
    fi
    echo ""
}

draw_completion_rate() {
    local pm_state="$COMMIT_RELAY_HOME/coordination/pm-state.json"

    echo -e "${WHITE}COMPLETION RATE${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -f "$pm_state" ]; then
        local rate=$(jq -r '.metrics.success_rate // 0' "$pm_state")
        local rate_today=$(jq -r '.metrics.success_rate_today // 0' "$pm_state")
        local completed_today=$(jq -r '.metrics.completed_today // 0' "$pm_state")
        local failed_today=$(jq -r '.metrics.failed_today // 0' "$pm_state")

        # Determine color based on rate
        local color="$GREEN"
        if [ "${rate%.*}" -lt 50 ]; then
            color="$RED"
        elif [ "${rate%.*}" -lt 75 ]; then
            color="$YELLOW"
        fi

        printf "All-Time Rate:   %.1f%%\n" "$rate"
        printf "Today's Rate:    %.1f%%\n" "$rate_today"
        printf "Completed Today: %d\n" "$completed_today"
        printf "Failed Today:    %d\n" "$failed_today"
        echo ""

        # Rate gauge
        local rate_int=${rate%.*}
        printf "All-Time: ["
        draw_bar "$rate_int" 100 50 "$color"
        printf "] %.1f%%\n" "$rate"
    else
        echo "PM state file not found"
    fi
    echo ""
}

draw_task_queue() {
    local task_queue="$COMMIT_RELAY_HOME/coordination/task-queue.json"

    echo -e "${WHITE}TASK QUEUE${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -f "$task_queue" ]; then
        local pending=$(jq -r '[.tasks[] | select(.status == "pending")] | length' "$task_queue" 2>/dev/null || echo 0)
        local in_progress=$(jq -r '[.tasks[] | select(.status == "in_progress" or .status == "assigned")] | length' "$task_queue" 2>/dev/null || echo 0)
        local completed=$(jq -r '[.tasks[] | select(.status == "completed")] | length' "$task_queue" 2>/dev/null || echo 0)

        printf "%-20s: %d\n" "Pending" "$pending"
        printf "%-20s: %d\n" "In Progress" "$in_progress"
        printf "%-20s: %d\n" "Completed" "$completed"
    else
        echo "Task queue file not found"
    fi
    echo ""
}

draw_historical_trend() {
    local history_dir="$COMMIT_RELAY_HOME/coordination/history/hourly"

    echo -e "${WHITE}HISTORICAL TREND (Last 12 Snapshots)${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -d "$history_dir" ]; then
        # Get last 12 hourly snapshots
        local snapshots=$(ls -t "$history_dir"/*.json 2>/dev/null | head -12)

        if [ -n "$snapshots" ]; then
            # Extract worker counts for sparkline
            local completed_data=""
            local active_data=""

            for snapshot in $snapshots; do
                local completed=$(jq -r '.workers.completed // 0' "$snapshot" 2>/dev/null || echo 0)
                local active=$(jq -r '.workers.active // 0' "$snapshot" 2>/dev/null || echo 0)

                if [ -z "$completed_data" ]; then
                    completed_data="$completed"
                    active_data="$active"
                else
                    completed_data="$completed,$completed_data"
                    active_data="$active,$active_data"
                fi
            done

            printf "Completed: "
            draw_sparkline "$completed_data"
            echo " (trend)"

            printf "Active:    "
            draw_sparkline "$active_data"
            echo " (trend)"
        else
            echo "No historical data available"
        fi
    else
        echo "History directory not found"
    fi
    echo ""
}

draw_moe_routing() {
    local routing_health="$COMMIT_RELAY_HOME/coordination/routing-health.json"

    echo -e "${WHITE}MOE ROUTING${NC}"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"

    if [ -f "$routing_health" ]; then
        local total_decisions=$(jq -r '.total_decisions // 0' "$routing_health")
        local avg_confidence=$(jq -r '.average_confidence // 0' "$routing_health")
        local null_routes=$(jq -r '.null_routes // 0' "$routing_health")

        printf "%-20s: %d\n" "Total Decisions" "$total_decisions"
        printf "%-20s: %.2f\n" "Avg Confidence" "$avg_confidence"
        printf "%-20s: %d\n" "Null Routes" "$null_routes"

        # Confidence bar
        local conf_int=$(printf "%.0f" "$avg_confidence" 2>/dev/null || echo 0)
        local conf_pct=$((conf_int * 100))
        local color="$GREEN"
        if [ "$conf_pct" -lt 50 ]; then color="$RED"
        elif [ "$conf_pct" -lt 80 ]; then color="$YELLOW"; fi

        printf "Confidence: ["
        draw_bar "$conf_pct" 100 30 "$color"
        printf "] %.0f%%\n" "$conf_pct"
    else
        echo "Routing health file not found"
    fi
    echo ""
}

draw_footer() {
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
    echo "  [q] Quit    [r] Refresh now    [+/-] Adjust interval"
    echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
}

# Main loop
while true; do
    draw_header
    draw_token_budget
    draw_worker_metrics
    draw_completion_rate
    draw_task_queue
    draw_historical_trend
    draw_moe_routing
    draw_footer

    # Non-blocking read with timeout
    if read -t "$REFRESH_INTERVAL" -n 1 cmd; then
        case "$cmd" in
            q|Q) clear; exit 0 ;;
            r|R) continue ;;
            +) REFRESH_INTERVAL=$((REFRESH_INTERVAL + 1)) ;;
            -) if [ "$REFRESH_INTERVAL" -gt 1 ]; then REFRESH_INTERVAL=$((REFRESH_INTERVAL - 1)); fi ;;
        esac
    fi
done
