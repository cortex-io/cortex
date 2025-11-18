#!/bin/bash
# scripts/dashboards/pattern-detection-monitor.sh
# Real-time failure pattern detection monitoring
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
REFRESH_INTERVAL=10

# Filter options
FILTER_CATEGORY=""  # all, resource, timeout, config, dependency, code
MIN_CONFIDENCE=0.0  # 0.0-1.0

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

# Get pattern counts by category
get_pattern_counts() {
    local patterns_file="$COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl"

    if [[ ! -f "$patterns_file" ]]; then
        echo "0|0|0|0|0|0"
        return
    fi

    local resource timeout config dependency code total
    resource=$(jq -s '[.[] | select(.category == "resource")] | length' "$patterns_file" 2>/dev/null || echo "0")
    timeout=$(jq -s '[.[] | select(.category == "timeout")] | length' "$patterns_file" 2>/dev/null || echo "0")
    config=$(jq -s '[.[] | select(.category == "config")] | length' "$patterns_file" 2>/dev/null || echo "0")
    dependency=$(jq -s '[.[] | select(.category == "dependency")] | length' "$patterns_file" 2>/dev/null || echo "0")
    code=$(jq -s '[.[] | select(.category == "code")] | length' "$patterns_file" 2>/dev/null || echo "0")
    total=$(wc -l < "$patterns_file" 2>/dev/null || echo "0")

    echo "$resource|$timeout|$config|$dependency|$code|$total"
}

# Get patterns with filters
get_patterns() {
    local filter_category="$1"
    local min_confidence="$2"
    local patterns_file="$COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl"

    if [[ ! -f "$patterns_file" ]]; then
        return
    fi

    local jq_filter=''

    # Apply category filter
    if [[ -n "$filter_category" && "$filter_category" != "all" ]]; then
        jq_filter='select(.category == "'$filter_category'")'
    fi

    # Apply confidence filter
    if [[ -n "$min_confidence" && "$min_confidence" != "0.0" ]]; then
        if [[ -n "$jq_filter" ]]; then
            jq_filter="$jq_filter | "
        fi
        jq_filter="${jq_filter}select(.confidence >= $min_confidence)"
    fi

    if [[ -z "$jq_filter" ]]; then
        jq_filter='.'
    fi

    jq -r "$jq_filter | [
        .pattern_id // \"unknown\",
        .category // \"unknown\",
        .type // \"N/A\",
        .confidence // 0,
        .severity // \"unknown\",
        .frequency.total_occurrences // 0,
        .created_at // \"\",
        .signature.error_pattern // \"N/A\"
    ] | @tsv" "$patterns_file" 2>/dev/null | while IFS=$'\t' read -r pattern_id category type confidence severity occurrences created_at error_pattern; do
        echo "$pattern_id|$category|$type|$confidence|$severity|$occurrences|$created_at|$error_pattern"
    done
}

# Get confidence distribution
get_confidence_distribution() {
    local patterns_file="$COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl"

    if [[ ! -f "$patterns_file" ]]; then
        return
    fi

    # Count patterns by confidence range
    local low=0 medium=0 high=0

    while IFS= read -r pattern; do
        local confidence
        confidence=$(echo "$pattern" | jq -r '.confidence // 0')

        # Convert to integer percentage
        local conf_pct=$(echo "$confidence * 100" | bc 2>/dev/null | cut -d. -f1)

        if [ "$conf_pct" -lt 50 ]; then
            ((low++))
        elif [ "$conf_pct" -lt 75 ]; then
            ((medium++))
        else
            ((high++))
        fi
    done < "$patterns_file"

    echo "$low|$medium|$high"
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
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Pattern Detection Monitor${NC}                                                   ${BOLD}${CYAN}║${NC}"
    move_cursor 2 0
    echo -e "${BOLD}${CYAN}╠═══════════════════════════════════════════════════════════════════════════════╣${NC}"
    move_cursor 3 0
    echo -e "${BOLD}${CYAN}║${NC}  ${DIM}$current_time${NC}                                                           ${BOLD}${CYAN}║${NC}"
    move_cursor 4 0
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"

    # Pattern counts by category
    IFS='|' read -r resource timeout config dependency code total <<< "$(get_pattern_counts)"

    move_cursor 6 2
    echo -e "${BOLD}Pattern Summary${NC}"
    move_cursor 7 2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 8 2
    echo -e "Total Patterns: ${CYAN}$total${NC}"

    move_cursor 9 2
    echo -e "  ${RED}Resource:${NC}    $resource"

    move_cursor 10 2
    echo -e "  ${YELLOW}Timeout:${NC}     $timeout"

    move_cursor 11 2
    echo -e "  ${BLUE}Config:${NC}      $config"

    move_cursor 12 2
    echo -e "  ${MAGENTA}Dependency:${NC}  $dependency"

    move_cursor 13 2
    echo -e "  ${GREEN}Code:${NC}        $code"

    # Confidence distribution
    IFS='|' read -r conf_low conf_medium conf_high <<< "$(get_confidence_distribution)"

    move_cursor 6 42
    echo -e "${BOLD}By Confidence${NC}"
    move_cursor 7 42
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    move_cursor 8 42
    echo -e "Low (<50%):    ${DIM}$conf_low${NC}"

    move_cursor 9 42
    echo -e "Medium (50-75%): ${YELLOW}$conf_medium${NC}"

    move_cursor 10 42
    echo -e "High (>75%):   ${GREEN}$conf_high${NC}"

    # Pattern list
    move_cursor 15 0
    echo -e "${BOLD}Detected Patterns${NC}"
    move_cursor 16 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Table header
    move_cursor 17 0
    printf "${BOLD}%-20s %-12s %-10s %-10s %-8s %-8s${NC}\n" \
        "Pattern ID" "Category" "Type" "Confidence" "Severity" "Count"

    move_cursor 18 0
    printf "%-20s %-12s %-10s %-10s %-8s %-8s\n" \
        "────────────────────" "────────────" "──────────" "──────────" "────────" "────────"

    # Pattern rows
    local row=19
    local max_rows=$((TERM_ROWS - 22))  # Leave room for footer

    get_patterns "$FILTER_CATEGORY" "$MIN_CONFIDENCE" | head -n "$max_rows" | while IFS='|' read -r pattern_id category type confidence severity occurrences created_at error_pattern; do
        move_cursor $row 0

        # Truncate fields
        local short_id="${pattern_id:0:20}"
        local short_type="${type:0:10}"

        # Category color
        local category_color="${NC}"
        case "$category" in
            resource) category_color="${RED}" ;;
            timeout) category_color="${YELLOW}" ;;
            config) category_color="${BLUE}" ;;
            dependency) category_color="${MAGENTA}" ;;
            code) category_color="${GREEN}" ;;
        esac

        # Confidence percentage
        local conf_pct=$(echo "$confidence * 100" | bc 2>/dev/null | cut -d. -f1)

        # Confidence color
        local conf_color="${DIM}"
        if [ "$conf_pct" -ge 75 ]; then
            conf_color="${GREEN}"
        elif [ "$conf_pct" -ge 50 ]; then
            conf_color="${YELLOW}"
        fi

        # Severity color
        local sev_color="${NC}"
        case "$severity" in
            critical) sev_color="${RED}" ;;
            high) sev_color="${YELLOW}" ;;
            medium) sev_color="${BLUE}" ;;
            low) sev_color="${DIM}" ;;
        esac

        printf "%-20s ${category_color}%-12s${NC} %-10s ${conf_color}%8s%%${NC} ${sev_color}%-8s${NC} %8s\n" \
            "$short_id" "$category" "$short_type" "$conf_pct" "$severity" "$occurrences"

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
    [[ -n "$FILTER_CATEGORY" && "$FILTER_CATEGORY" != "all" ]] && filter_text+="category=$FILTER_CATEGORY "
    [[ "$MIN_CONFIDENCE" != "0.0" ]] && filter_text+="min_confidence=$MIN_CONFIDENCE "
    [[ "$filter_text" == "Filters: " ]] && filter_text+="none"
    echo -e "${DIM}$filter_text${NC}"

    move_cursor $((footer_row + 2)) 0
    echo -e "${DIM}Press ${BOLD}q${NC}${DIM} to quit | Refreshing every ${REFRESH_INTERVAL}s | Auto-Fix recommendations available${NC}"

    # Move cursor to bottom
    move_cursor $((TERM_ROWS - 1)) 0
}

# Signal handler for clean exit
cleanup() {
    clear_screen
    move_cursor 0 0
    tput cnorm  # Show cursor
    echo "Pattern detection monitor stopped."
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
            --category)
                FILTER_CATEGORY="$2"
                shift 2
                ;;
            --min-confidence)
                MIN_CONFIDENCE="$2"
                shift 2
                ;;
            --interval)
                REFRESH_INTERVAL="$2"
                shift 2
                ;;
            *)
                echo "Usage: $0 [--category resource|timeout|config|dependency|code] [--min-confidence 0.0-1.0] [--interval <seconds>]"
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
