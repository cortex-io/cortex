#!/bin/bash
# Routing Performance Dashboard
# Real-time dashboard showing routing metrics across all 5 layers

set -euo pipefail

CORTEX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERFORMANCE_LOG="${CORTEX_ROOT}/coordination/routing/performance.jsonl"
CONFIG_FILE="${CORTEX_ROOT}/coordination/routing/config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Dashboard settings
REFRESH_INTERVAL=5
WINDOW_HOURS=1
LIVE_MODE=false

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Real-time routing performance dashboard

OPTIONS:
    -r, --refresh SECONDS    Refresh interval (default: 5)
    -w, --window HOURS       Time window (default: 1)
    -l, --live               Live mode (continuous refresh)
    -h, --help               Show this help

CONTROLS (live mode):
    q - Quit
    r - Refresh now
    + - Increase window
    - - Decrease window

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--refresh)
            REFRESH_INTERVAL="$2"
            shift 2
            ;;
        -w|--window)
            WINDOW_HOURS="$2"
            shift 2
            ;;
        -l|--live)
            LIVE_MODE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Clear screen
clear_screen() {
    printf '\033[2J\033[H'
}

# Draw progress bar
draw_bar() {
    local value=$1
    local max=$2
    local width=${3:-30}

    local filled=$(echo "$value * $width / $max" | bc 2>/dev/null || echo 0)
    local empty=$((width - filled))

    printf "["
    printf "%${filled}s" | tr ' ' '='
    printf "%${empty}s" | tr ' ' '-'
    printf "]"
}

# Calculate stats for a layer
get_layer_stats() {
    local layer="$1"
    local cutoff_ts=$(date -u -v-${WINDOW_HOURS}H +%s 2>/dev/null || date -u -d "${WINDOW_HOURS} hours ago" +%s)

    local attempts=0
    local successes=0
    local total_confidence=0
    local total_latency=0
    local correct=0
    local total_outcomes=0

    while IFS= read -r line; do
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
        [[ $event_ts -lt $cutoff_ts ]] && continue

        attempted=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .attempted // "false"')
        if [[ "$attempted" == "true" ]]; then
            ((attempts++))

            success=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .success // "false"')
            confidence=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence // "0"')
            latency=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .latency_ms // "0"')

            [[ "$success" == "true" ]] && ((successes++))
            total_confidence=$(echo "$total_confidence + $confidence" | bc)
            total_latency=$(echo "$total_latency + $latency" | bc)

            # Check if this layer made final decision
            final_layer=$(echo "$line" | jq -r '.final_decision.routing_layer // "null"')
            if [[ "$final_layer" == "$layer" ]]; then
                was_correct=$(echo "$line" | jq -r '.outcome.was_correct_master // "null"')
                if [[ "$was_correct" != "null" ]]; then
                    ((total_outcomes++))
                    [[ "$was_correct" == "true" ]] && ((correct++))
                fi
            fi
        fi
    done < "$PERFORMANCE_LOG" 2>/dev/null

    # Calculate averages
    local avg_confidence=0
    local avg_latency=0
    local accuracy=0

    if [[ $attempts -gt 0 ]]; then
        avg_confidence=$(echo "scale=3; $total_confidence / $attempts" | bc)
        avg_latency=$(echo "scale=1; $total_latency / $attempts" | bc)
    fi

    if [[ $total_outcomes -gt 0 ]]; then
        accuracy=$(echo "scale=3; $correct / $total_outcomes" | bc)
    fi

    echo "$attempts|$successes|$avg_confidence|$avg_latency|$accuracy|$total_outcomes"
}

# Get routing cascade stats
get_cascade_stats() {
    local cutoff_ts=$(date -u -v-${WINDOW_HOURS}H +%s 2>/dev/null || date -u -d "${WINDOW_HOURS} hours ago" +%s)
    local total_routes=0
    local layer1_success=0
    local layer2_success=0
    local layer3_success=0
    local layer4_success=0
    local layer5_success=0

    while IFS= read -r line; do
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
        [[ $event_ts -lt $cutoff_ts ]] && continue

        ((total_routes++))

        final_layer=$(echo "$line" | jq -r '.final_decision.routing_layer // "null"')
        case "$final_layer" in
            keyword) ((layer1_success++)) ;;
            semantic) ((layer2_success++)) ;;
            rag) ((layer3_success++)) ;;
            pytorch) ((layer4_success++)) ;;
            clarification) ((layer5_success++)) ;;
        esac
    done < "$PERFORMANCE_LOG" 2>/dev/null

    echo "$total_routes|$layer1_success|$layer2_success|$layer3_success|$layer4_success|$layer5_success"
}

# Render dashboard
render_dashboard() {
    clear_screen

    # Header
    echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║           ROUTING PERFORMANCE DASHBOARD                           ║${NC}"
    echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Time Window: ${YELLOW}${WINDOW_HOURS}h${NC}  |  Updated: ${YELLOW}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo ""

    # Check if log exists
    if [[ ! -f "$PERFORMANCE_LOG" ]]; then
        echo -e "${YELLOW}No routing data available yet${NC}"
        echo "Performance log will be created when routing decisions are made."
        return
    fi

    # Cascade Overview
    echo -e "${BOLD}${BLUE}━━━ Routing Cascade Overview ━━━${NC}"
    cascade_stats=$(get_cascade_stats)
    IFS='|' read -r total l1 l2 l3 l4 l5 <<< "$cascade_stats"

    echo -e "Total routes: ${GREEN}$total${NC}"
    echo ""

    if [[ $total -gt 0 ]]; then
        echo -e "${CYAN}Layer 1 - Keyword${NC}      $(draw_bar $l1 $total 40) ${GREEN}$l1${NC} ($(echo "scale=1; $l1 * 100 / $total" | bc)%)"
        echo -e "${CYAN}Layer 2 - Semantic${NC}     $(draw_bar $l2 $total 40) ${GREEN}$l2${NC} ($(echo "scale=1; $l2 * 100 / $total" | bc)%)"
        echo -e "${CYAN}Layer 3 - RAG${NC}          $(draw_bar $l3 $total 40) ${GREEN}$l3${NC} ($(echo "scale=1; $l3 * 100 / $total" | bc)%)"
        echo -e "${CYAN}Layer 4 - PyTorch${NC}      $(draw_bar $l4 $total 40) ${GREEN}$l4${NC} ($(echo "scale=1; $l4 * 100 / $total" | bc)%)"
        echo -e "${CYAN}Layer 5 - Clarification${NC} $(draw_bar $l5 $total 40) ${YELLOW}$l5${NC} ($(echo "scale=1; $l5 * 100 / $total" | bc)%)"
    fi
    echo ""

    # Layer Performance Table
    echo -e "${BOLD}${BLUE}━━━ Layer Performance ━━━${NC}"
    printf "%-15s %10s %10s %12s %12s %12s\n" "Layer" "Attempts" "Success%" "Avg Conf" "Avg Latency" "Accuracy"
    echo "───────────────────────────────────────────────────────────────────────────"

    for layer in keyword semantic rag pytorch clarification; do
        stats=$(get_layer_stats "$layer")
        IFS='|' read -r attempts successes avg_conf avg_lat accuracy outcomes <<< "$stats"

        # Calculate success rate
        success_rate=0
        if [[ $attempts -gt 0 ]]; then
            success_rate=$(echo "scale=1; $successes * 100 / $attempts" | bc)
        fi

        # Color code based on performance
        local color=$NC
        if [[ $attempts -gt 0 ]]; then
            if (( $(echo "$success_rate >= 80" | bc -l) )); then
                color=$GREEN
            elif (( $(echo "$success_rate >= 60" | bc -l) )); then
                color=$YELLOW
            else
                color=$RED
            fi
        fi

        # Format accuracy
        local acc_display="N/A"
        if [[ $outcomes -gt 0 ]]; then
            acc_display="$(echo "scale=1; $accuracy * 100" | bc)%"
        fi

        printf "${color}%-15s${NC} %10s %9s%% %12s %10sms %12s\n" \
            "$layer" "$attempts" "$success_rate" "$avg_conf" "$avg_lat" "$acc_display"
    done
    echo ""

    # Recent Events
    echo -e "${BOLD}${BLUE}━━━ Recent Routing Events ━━━${NC}"
    echo ""

    local cutoff_ts=$(date -u -v-${WINDOW_HOURS}H +%s 2>/dev/null || date -u -d "${WINDOW_HOURS} hours ago" +%s)
    local count=0

    while IFS= read -r line; do
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
        [[ $event_ts -lt $cutoff_ts ]] && continue

        ((count++))
        [[ $count -gt 5 ]] && break

        event_id=$(echo "$line" | jq -r '.event_id')
        task_desc=$(echo "$line" | jq -r '.task_description' | cut -c1-50)
        final_layer=$(echo "$line" | jq -r '.final_decision.routing_layer')
        final_master=$(echo "$line" | jq -r '.final_decision.selected_master')
        final_conf=$(echo "$line" | jq -r '.final_decision.confidence')
        total_lat=$(echo "$line" | jq -r '.total_latency_ms')

        echo -e "${CYAN}$event_id${NC}"
        echo -e "  Task: $task_desc..."
        echo -e "  Routed to: ${GREEN}$final_master${NC} via ${YELLOW}$final_layer${NC} (conf: $final_conf, ${total_lat}ms)"
        echo ""
    done < <(tac "$PERFORMANCE_LOG" 2>/dev/null)

    # Footer
    if [[ "$LIVE_MODE" == "true" ]]; then
        echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "Controls: ${YELLOW}q${NC}=quit  ${YELLOW}r${NC}=refresh  ${YELLOW}+${NC}=increase window  ${YELLOW}-${NC}=decrease window"
    fi
}

# Live mode with keyboard controls
run_live() {
    # Setup terminal for non-blocking input
    if [[ -t 0 ]]; then
        stty -echo -icanon time 0 min 0
    fi

    while true; do
        render_dashboard

        # Wait for refresh interval or key press
        for ((i=0; i<REFRESH_INTERVAL; i++)); do
            read -t 1 -n 1 key || true
            case "$key" in
                q|Q)
                    if [[ -t 0 ]]; then
                        stty sane
                    fi
                    clear_screen
                    exit 0
                    ;;
                r|R)
                    break
                    ;;
                +)
                    WINDOW_HOURS=$((WINDOW_HOURS + 1))
                    break
                    ;;
                -)
                    if [[ $WINDOW_HOURS -gt 1 ]]; then
                        WINDOW_HOURS=$((WINDOW_HOURS - 1))
                    fi
                    break
                    ;;
            esac
        done
    done
}

# Main execution
if [[ "$LIVE_MODE" == "true" ]]; then
    trap 'stty sane; clear_screen; exit 0' INT TERM
    run_live
else
    render_dashboard
fi
