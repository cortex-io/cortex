#!/bin/bash
# MoE Learning System Orchestrator
# Complete learning cycle: track outcomes → analyze → learn → improve

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALUATORS_DIR="$SCRIPT_DIR/evaluators"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Tools
OUTCOME_TRACKER="$EVALUATORS_DIR/outcome-tracker.sh"
PATTERN_LEARNER="$EVALUATORS_DIR/pattern-learner.sh"
ROUTER_IMPROVER="$EVALUATORS_DIR/router-improver.sh"

##############################################################################
# print_header: Print section header
##############################################################################
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

##############################################################################
# run_learning_cycle: Execute complete learning cycle
##############################################################################
run_learning_cycle() {
    print_header "MoE Learning Cycle"

    echo -e "${YELLOW}Phase 1: Pattern Learning${NC}"
    echo "Analyzing routing outcomes and extracting patterns..."
    bash "$PATTERN_LEARNER" learn
    echo -e "${GREEN}✓ Pattern learning complete${NC}\n"

    echo -e "${YELLOW}Phase 2: Improvement Generation${NC}"
    echo "Generating routing improvement suggestions..."
    bash "$PATTERN_LEARNER" suggest
    echo -e "${GREEN}✓ Improvements generated${NC}\n"

    echo -e "${YELLOW}Phase 3: Show Statistics${NC}"
    bash "$ROUTER_IMPROVER" stats
    echo ""

    # Ask if user wants to apply improvements
    read -p "Apply improvements to routing system? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "\n${YELLOW}Phase 4: Applying Improvements${NC}"
        bash "$ROUTER_IMPROVER" apply
        echo -e "${GREEN}✓ Improvements applied${NC}\n"

        echo -e "${YELLOW}Phase 5: Validating Improvements${NC}"
        bash "$ROUTER_IMPROVER" validate
        echo -e "${GREEN}✓ Validation complete${NC}\n"
    else
        echo "Improvements not applied. Run './moe-learn.sh apply' to apply later."
    fi

    print_header "Learning Cycle Complete"
}

##############################################################################
# track_task_outcome: Track a single task outcome
##############################################################################
track_task_outcome() {
    local task_id="$1"
    local status="$2"
    local quality_score="${3:-0.5}"

    bash "$OUTCOME_TRACKER" "$task_id" "$status" "$quality_score"
}

##############################################################################
# show_status: Show current learning system status
##############################################################################
show_status() {
    print_header "MoE Learning System Status"

    # Show statistics
    bash "$ROUTER_IMPROVER" stats

    echo ""
    echo -e "${BLUE}Recent Activity:${NC}"

    # Show recent outcomes
    local catalog="$SCRIPT_DIR/catalog/routing-decisions.jsonl"
    if [ -f "$catalog" ]; then
        local recent_count=$(wc -l < "$catalog" | tr -d ' ')
        local unanalyzed_count=$(grep -c '"analyzed":false' "$catalog" 2>/dev/null || echo "0")

        echo "Total routing decisions tracked: $recent_count"
        echo "Unanalyzed outcomes: $unanalyzed_count"
    else
        echo "No routing decisions tracked yet."
    fi

    echo ""
    echo -e "${BLUE}Metrics:${NC}"

    # Show recent metrics
    local metrics_dir="$SCRIPT_DIR/metrics"
    if [ -f "$metrics_dir/learning-progress.jsonl" ]; then
        local latest_metrics=$(tail -1 "$metrics_dir/learning-progress.jsonl")
        echo "$latest_metrics" | jq -r '
            "Routing Accuracy: \(.avg_routing_accuracy * 100 | floor)%",
            "Confidence Calibration: \(.avg_confidence_calibration * 100 | floor)%"
        '
    else
        echo "No metrics available yet."
    fi
}

##############################################################################
# Usage information
##############################################################################
show_usage() {
    cat <<EOF
MoE Learning System - Continuous improvement for routing decisions

Usage: $0 <command> [arguments]

Commands:
  learn                           Run complete learning cycle
  track <task_id> <status> [quality]  Track a task outcome
                                  status: completed|failed|reassigned
                                  quality: 0-1 (optional, default 0.5)
  apply                           Apply pending improvements
  validate                        Validate applied improvements
  rollback [backup_file]          Rollback to previous routing patterns
  status                          Show learning system status
  stats                           Show learning statistics

Examples:
  # Track a completed task
  $0 track task-123 completed 0.9

  # Run learning cycle
  $0 learn

  # Show current status
  $0 status

  # Apply improvements without full cycle
  $0 apply

Learning Cycle:
  1. Track outcomes (manual or automated)
  2. Analyze outcomes with LLM (pattern extraction)
  3. Generate improvement suggestions
  4. Apply improvements to routing system
  5. Validate improvements with test cases
  6. Monitor impact on future routing decisions

Configuration:
  Set these environment variables for LLM integration:
    LLM_PROVIDER=anthropic
    ANTHROPIC_API_KEY=your-key-here
    LLM_MODEL=claude-sonnet-4

  Without LLM API key, system will use mock responses.

EOF
}

##############################################################################
# Main execution
##############################################################################
if [ $# -eq 0 ]; then
    show_usage
    exit 0
fi

case "$1" in
    learn)
        run_learning_cycle
        ;;
    track)
        shift
        if [ $# -lt 2 ]; then
            echo "Error: track requires <task_id> <status> [quality]"
            exit 1
        fi
        track_task_outcome "$@"
        ;;
    apply)
        bash "$ROUTER_IMPROVER" apply
        ;;
    validate)
        bash "$ROUTER_IMPROVER" validate
        ;;
    rollback)
        bash "$ROUTER_IMPROVER" rollback "${2:-}"
        ;;
    status)
        show_status
        ;;
    stats)
        bash "$ROUTER_IMPROVER" stats
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "Error: Unknown command '$1'"
        echo ""
        show_usage
        exit 1
        ;;
esac
