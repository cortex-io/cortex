#!/bin/bash
#
# Cortex Evaluation Dashboard
#
# Display evaluation metrics and results in a readable format.
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_FILE="${1:-$SCRIPT_DIR/results/evaluation-runs.jsonl}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Check if results file exists
if [ ! -f "$RESULTS_FILE" ]; then
    echo -e "${RED}Error: Results file not found: $RESULTS_FILE${NC}"
    echo "Run an evaluation first: ./evaluation/run-evaluation.sh"
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    exit 1
fi

clear

echo -e "${BOLD}${BLUE}"
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║           CORTEX EVALUATION DASHBOARD                             ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Get latest run info
LATEST_RUN=$(tail -1 "$RESULTS_FILE" 2>/dev/null | jq -r '.run_id // "unknown"')
TOTAL_EVALS=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
LATEST_DATE=$(tail -1 "$RESULTS_FILE" 2>/dev/null | jq -r '.metadata.evaluated_at // "unknown"' | cut -d'T' -f1)

echo -e "${CYAN}Latest Run:${NC} $LATEST_RUN"
echo -e "${CYAN}Date:${NC} $LATEST_DATE"
echo -e "${CYAN}Total Evaluations:${NC} $TOTAL_EVALS"
echo ""

# Calculate metrics using Python script
METRICS_JSON=$("$SCRIPT_DIR/evaluators/metrics.py" --results "$RESULTS_FILE" --format json 2>/dev/null)

# Overall Performance
echo -e "${BOLD}${BLUE}═══ OVERALL PERFORMANCE ═══${NC}"
echo ""

OVERALL=$(echo "$METRICS_JSON" | jq -r '.overall')

if [ "$(echo "$OVERALL" | jq 'has("error")')" = "true" ]; then
    echo -e "${RED}No valid evaluations found${NC}"
    exit 1
fi

AVG_SCORE=$(echo "$OVERALL" | jq -r '.overall_metrics.average_score')
SUCCESS_RATE=$(echo "$OVERALL" | jq -r '.success_rate.percentage')
PASSED=$(echo "$OVERALL" | jq -r '.success_rate.passed')
FAILED=$(echo "$OVERALL" | jq -r '.success_rate.failed')

# Color code the score
SCORE_COLOR=$GREEN
if (( $(echo "$AVG_SCORE < 3.0" | bc -l) )); then
    SCORE_COLOR=$RED
elif (( $(echo "$AVG_SCORE < 4.0" | bc -l) )); then
    SCORE_COLOR=$YELLOW
fi

echo -e "  ${BOLD}Average Score:${NC} ${SCORE_COLOR}${AVG_SCORE}/5.0${NC}"
echo -e "  ${BOLD}Success Rate:${NC} ${SUCCESS_RATE}% (${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC})"
echo ""

# Dimension Scores
echo -e "${BOLD}${BLUE}═══ DIMENSION SCORES ═══${NC}"
echo ""

echo "$OVERALL" | jq -r '.dimension_averages | to_entries[] | "\(.key):\(.value)"' | while IFS=: read -r dim score; do
    # Color code dimension score
    DIM_COLOR=$GREEN
    if (( $(echo "$score < 3.0" | bc -l) )); then
        DIM_COLOR=$RED
    elif (( $(echo "$score < 4.0" | bc -l) )); then
        DIM_COLOR=$YELLOW
    fi

    # Format dimension name
    DIM_NAME=$(echo "$dim" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++)sub(/./,toupper(substr($i,1,1)),$i)}1')

    # Create bar chart
    BAR_LENGTH=$(echo "$score * 10" | bc | cut -d'.' -f1)
    BAR=$(printf '█%.0s' $(seq 1 $BAR_LENGTH))

    printf "  %-20s ${DIM_COLOR}%s${NC} %.1f/5.0\n" "$DIM_NAME" "$BAR" "$score"
done

echo ""

# Performance by Master
echo -e "${BOLD}${BLUE}═══ PERFORMANCE BY MASTER ═══${NC}"
echo ""

BY_MASTER=$(echo "$METRICS_JSON" | jq -r '.by_master')

if [ "$BY_MASTER" != "null" ] && [ "$BY_MASTER" != "{}" ]; then
    echo "$BY_MASTER" | jq -r 'to_entries[] | "\(.key)|\(.value.count)|\(.value.average_score)|\(.value.success_rate)"' | \
    while IFS='|' read -r master count avg success; do
        # Color code master score
        MASTER_COLOR=$GREEN
        if (( $(echo "$avg < 3.0" | bc -l) )); then
            MASTER_COLOR=$RED
        elif (( $(echo "$avg < 4.0" | bc -l) )); then
            MASTER_COLOR=$YELLOW
        fi

        # Format master name
        MASTER_NAME=$(echo "$master" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')

        printf "  ${BOLD}%-15s${NC} Score: ${MASTER_COLOR}%.1f/5.0${NC}  Success: %s%%  (n=%s)\n" \
            "$MASTER_NAME" "$avg" "$success" "$count"
    done
else
    echo "  No master-specific data available"
fi

echo ""

# Areas for Improvement
echo -e "${BOLD}${BLUE}═══ AREAS FOR IMPROVEMENT ═══${NC}"
echo ""

WEAKNESSES=$(echo "$METRICS_JSON" | jq -r '.weaknesses[]?' | jq -s '.')
WEAKNESS_COUNT=$(echo "$WEAKNESSES" | jq 'length')

if [ "$WEAKNESS_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}Found $WEAKNESS_COUNT weakness(es) (score < 3.0)${NC}"
    echo ""

    # Show top 5 weaknesses
    echo "$WEAKNESSES" | jq -r '.[:5][] |
        if .type == "overall" then
            "  • \(.task_id): Overall score \(.score)/5.0"
        else
            "  • \(.task_id): \(.dimension) = \(.score)/5.0"
        end'
else
    echo -e "  ${GREEN}No weaknesses found - all scores >= 3.0${NC}"
fi

echo ""

# Trends
echo -e "${BOLD}${BLUE}═══ TRENDS ═══${NC}"
echo ""

TRENDS=$(echo "$METRICS_JSON" | jq -r '.trends')

if [ "$TRENDS" != "null" ]; then
    DIRECTION=$(echo "$TRENDS" | jq -r '.trend_direction')
    RECENT_AVG=$(echo "$TRENDS" | jq -r '.recent_average')
    CHANGE=$(echo "$TRENDS" | jq -r '.change')

    # Color code trend
    TREND_COLOR=$GREEN
    TREND_SYMBOL="↑"
    if [ "$DIRECTION" = "declining" ]; then
        TREND_COLOR=$RED
        TREND_SYMBOL="↓"
    elif [ "$DIRECTION" = "stable" ]; then
        TREND_COLOR=$YELLOW
        TREND_SYMBOL="→"
    fi

    echo -e "  ${BOLD}Direction:${NC} ${TREND_COLOR}${DIRECTION^^} ${TREND_SYMBOL}${NC}"
    echo -e "  ${BOLD}Recent Average:${NC} ${RECENT_AVG}/5.0"
    echo -e "  ${BOLD}Change:${NC} ${CHANGE}"
    echo ""

    # Show recent runs
    echo "  Recent Runs:"
    echo "$TRENDS" | jq -r '.runs[] | "    \(.date): \(.average_score)/5.0 (n=\(.count))"'
else
    echo "  Not enough data for trend analysis (need 2+ runs)"
fi

echo ""

# Quick Actions
echo -e "${BOLD}${BLUE}═══ QUICK ACTIONS ═══${NC}"
echo ""
echo "  View detailed results:"
echo "    cat $RESULTS_FILE | jq '.[] | select(.run_id == \"$LATEST_RUN\")'"
echo ""
echo "  View metrics as JSON:"
echo "    $SCRIPT_DIR/evaluators/metrics.py --results $RESULTS_FILE --format json"
echo ""
echo "  Run new evaluation:"
echo "    $SCRIPT_DIR/run-evaluation.sh"
echo ""
echo "  Run lightweight evaluation:"
echo "    $SCRIPT_DIR/run-evaluation.sh --mode light"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
