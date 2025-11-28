#!/bin/bash
#
# Cortex Evaluation Runner
#
# Runs Cortex on golden dataset tasks and evaluates outcomes using LM-as-Judge.
# Supports both full and lightweight evaluation modes.
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASKS_DIR="$SCRIPT_DIR/golden-dataset/tasks"
RESULTS_FILE="$SCRIPT_DIR/results/evaluation-runs.jsonl"
TEMP_DIR="$SCRIPT_DIR/results/temp"
RUN_ID="eval-$(date +%s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
MODE="full"
FILTER=""
DRY_RUN=false
VERBOSE=false

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run Cortex evaluation on golden dataset tasks.

OPTIONS:
    -m, --mode MODE         Evaluation mode: 'full' or 'light' (default: full)
                           light: 5-10 representative tasks (~2 min)
                           full: All 25+ tasks (~10 min)
    -f, --filter PATTERN   Only run tasks matching pattern (e.g., 'security-*')
    -d, --dry-run          Show what would be evaluated without running
    -v, --verbose          Verbose output
    -h, --help             Show this help message

EXAMPLES:
    $0                                # Run full evaluation
    $0 -m light                       # Run lightweight evaluation
    $0 -f 'security-*'                # Evaluate only security tasks
    $0 -f 'development-001'           # Evaluate specific task

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -f|--filter)
            FILTER="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
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

# Initialize
echo -e "${BLUE}Cortex Evaluation Runner${NC}"
echo "Run ID: $RUN_ID"
echo "Mode: $MODE"
echo ""

# Create temp directory
mkdir -p "$TEMP_DIR"
mkdir -p "$(dirname "$RESULTS_FILE")"

# Get list of tasks to evaluate
if [ "$MODE" = "light" ] && [ -z "$FILTER" ]; then
    # Lightweight mode: select representative tasks
    TASKS=(
        "security-001.json"
        "security-003.json"
        "development-001.json"
        "development-002.json"
        "development-005.json"
        "inventory-001.json"
        "coordinator-001.json"
        "integration-001.json"
    )
else
    # Full mode or filtered
    if [ -n "$FILTER" ]; then
        mapfile -t TASKS < <(cd "$TASKS_DIR" && ls -1 ${FILTER}.json 2>/dev/null || true)
    else
        mapfile -t TASKS < <(cd "$TASKS_DIR" && ls -1 *.json)
    fi
fi

if [ ${#TASKS[@]} -eq 0 ]; then
    echo -e "${RED}Error: No tasks found matching criteria${NC}"
    exit 1
fi

echo "Tasks to evaluate: ${#TASKS[@]}"

if [ "$DRY_RUN" = true ]; then
    echo -e "\n${YELLOW}Dry run - tasks that would be evaluated:${NC}"
    for task in "${TASKS[@]}"; do
        echo "  - $task"
    done
    exit 0
fi

# Check prerequisites
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}Error: .env file not found. Please configure ANTHROPIC_API_KEY${NC}"
    exit 1
fi

# Load environment
set -a
source "$PROJECT_ROOT/.env"
set +a

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo -e "${RED}Error: ANTHROPIC_API_KEY not set in .env${NC}"
    exit 1
fi

# Counters
TOTAL=${#TASKS[@]}
COMPLETED=0
PASSED=0
FAILED=0

echo -e "\n${BLUE}Starting evaluation...${NC}\n"

# Process each task
for task_file in "${TASKS[@]}"; do
    COMPLETED=$((COMPLETED + 1))

    task_path="$TASKS_DIR/$task_file"
    task_id=$(basename "$task_file" .json)

    echo -e "${BLUE}[$COMPLETED/$TOTAL]${NC} Evaluating: $task_id"

    # Load task
    if [ ! -f "$task_path" ]; then
        echo -e "${RED}  Error: Task file not found: $task_path${NC}"
        continue
    fi

    # MOCK: Simulate Cortex execution
    # In production, this would actually run Cortex on the task
    # For now, we'll create a mock outcome

    outcome_file="$TEMP_DIR/${task_id}-outcome.json"

    # Create mock outcome (placeholder for actual Cortex execution)
    cat > "$outcome_file" << 'MOCK_EOF'
{
  "status": "completed",
  "execution_time_seconds": 45,
  "master_used": "development",
  "workers_spawned": 2,
  "outcome": {
    "description": "Mock outcome - In production, this would contain actual Cortex execution results",
    "actions_taken": [
      "Analyzed task requirements",
      "Implemented solution",
      "Added tests"
    ],
    "artifacts_created": [
      "src/new-feature.js",
      "tests/new-feature.test.js"
    ],
    "tests_passed": true
  },
  "note": "This is a mock outcome for evaluation framework demonstration"
}
MOCK_EOF

    # Run LM-as-Judge evaluation
    eval_output="$TEMP_DIR/${task_id}-evaluation.json"

    if [ "$VERBOSE" = true ]; then
        echo "  Running LM-as-Judge evaluation..."
    fi

    python3 "$SCRIPT_DIR/evaluators/lm-judge.py" \
        --task "$task_path" \
        --outcome "$outcome_file" \
        --output "$eval_output" 2>&1 | grep -v "^Evaluating" || true

    if [ $? -eq 0 ] && [ -f "$eval_output" ]; then
        # Extract score
        score=$(jq -r '.overall_score // 0' "$eval_output")

        # Append to results file
        jq -c ". + {run_id: \"$RUN_ID\"}" "$eval_output" >> "$RESULTS_FILE"

        # Check if passed (score >= 3.0)
        if (( $(echo "$score >= 3.0" | bc -l) )); then
            echo -e "  ${GREEN}PASS${NC} - Score: $score/5.0"
            PASSED=$((PASSED + 1))
        else
            echo -e "  ${RED}FAIL${NC} - Score: $score/5.0"
            FAILED=$((FAILED + 1))
        fi

        if [ "$VERBOSE" = true ]; then
            assessment=$(jq -r '.overall_assessment' "$eval_output")
            echo "  Assessment: $assessment"
        fi
    else
        echo -e "  ${RED}ERROR${NC} - Evaluation failed"
        FAILED=$((FAILED + 1))
    fi

    echo ""
done

# Generate summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Evaluation Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Total tasks: $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Success rate: $(echo "scale=1; $PASSED * 100 / $TOTAL" | bc)%"
echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""

# Generate metrics report
echo -e "${BLUE}Generating metrics report...${NC}\n"
python3 "$SCRIPT_DIR/evaluators/metrics.py" --results "$RESULTS_FILE"

echo ""
echo -e "${GREEN}Evaluation run complete!${NC}"
echo ""
echo "To view detailed results:"
echo "  cat $RESULTS_FILE | jq"
echo ""
echo "To view metrics:"
echo "  python3 $SCRIPT_DIR/evaluators/metrics.py --results $RESULTS_FILE"
echo ""
