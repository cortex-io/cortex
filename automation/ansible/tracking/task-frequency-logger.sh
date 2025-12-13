#!/usr/bin/env bash
# task-frequency-logger.sh
# Logs task execution to track repetitive patterns for automation opportunities
# Philosophy: Track everything, automate what makes sense

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FREQUENCY_LOG="${AUTOMATION_ROOT}/tracking/frequency/task-frequency.jsonl"
HISTORY_DIR="${AUTOMATION_ROOT}/tracking/history"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$(dirname "${FREQUENCY_LOG}")"
mkdir -p "${HISTORY_DIR}"

# Usage information
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Track task execution for automation opportunity detection.

OPTIONS:
    -t, --task-type TYPE        Task type (e.g., mcp-integration, health-check-creation)
    -n, --task-name NAME        Specific task name (e.g., unifi-mcp-server)
    -d, --duration MINUTES      Time spent on task in minutes
    -s, --steps FILE            File containing list of steps performed
    --automated                 Mark this task as automated execution
    --manual                    Mark this task as manual execution (default)
    -h, --help                  Show this help message

EXAMPLES:
    # Log MCP integration task
    $0 -t mcp-integration -n cloudflare-mcp-server -d 45 -s /tmp/steps.txt

    # Log health check creation
    $0 -t health-check-creation -n unifi-health-check -d 30

    # Log automated playbook execution
    $0 -t mcp-integration -n ansible-mcp-server -d 5 --automated

FREQUENCY LOG:
    ${FREQUENCY_LOG}

PHILOSOPHY:
    This tool helps Cortex learn about its own repetitive work patterns.
    Every task logged contributes to identifying automation opportunities.
EOF
}

# Parse arguments
TASK_TYPE=""
TASK_NAME=""
DURATION_MINUTES=0
STEPS_FILE=""
EXECUTION_TYPE="manual"

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--task-type)
            TASK_TYPE="$2"
            shift 2
            ;;
        -n|--task-name)
            TASK_NAME="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION_MINUTES="$2"
            shift 2
            ;;
        -s|--steps)
            STEPS_FILE="$2"
            shift 2
            ;;
        --automated)
            EXECUTION_TYPE="automated"
            shift
            ;;
        --manual)
            EXECUTION_TYPE="manual"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "${TASK_TYPE}" ]]; then
    echo "Error: Task type is required (-t)"
    usage
    exit 1
fi

if [[ -z "${TASK_NAME}" ]]; then
    echo "Error: Task name is required (-n)"
    usage
    exit 1
fi

# Generate task log entry
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TASK_ID="task-$(date +%s)-$$"

# Read steps if provided
STEPS_JSON="[]"
if [[ -n "${STEPS_FILE}" && -f "${STEPS_FILE}" ]]; then
    STEPS_JSON=$(jq -R -s -c 'split("\n") | map(select(length > 0))' "${STEPS_FILE}")
fi

# Create task log entry
TASK_ENTRY=$(cat <<EOF
{
  "task_id": "${TASK_ID}",
  "timestamp": "${TIMESTAMP}",
  "task_type": "${TASK_TYPE}",
  "task_name": "${TASK_NAME}",
  "duration_minutes": ${DURATION_MINUTES},
  "execution_type": "${EXECUTION_TYPE}",
  "steps": ${STEPS_JSON},
  "logged_by": "cortex-development-master"
}
EOF
)

# Append to frequency log
echo "${TASK_ENTRY}" >> "${FREQUENCY_LOG}"

# Save to dated history file for archival
HISTORY_DATE=$(date +%Y-%m-%d)
HISTORY_FILE="${HISTORY_DIR}/tasks-${HISTORY_DATE}.jsonl"
echo "${TASK_ENTRY}" >> "${HISTORY_FILE}"

echo -e "${GREEN}Task logged successfully${NC}"
echo -e "${BLUE}Task Type:${NC} ${TASK_TYPE}"
echo -e "${BLUE}Task Name:${NC} ${TASK_NAME}"
echo -e "${BLUE}Duration:${NC} ${DURATION_MINUTES} minutes"
echo -e "${BLUE}Execution:${NC} ${EXECUTION_TYPE}"
echo -e "${BLUE}Task ID:${NC} ${TASK_ID}"

# Trigger automation candidate scoring if enough data
TASK_COUNT=$(wc -l < "${FREQUENCY_LOG}" | tr -d ' ')
if [[ "${TASK_COUNT}" -ge 10 ]]; then
    echo ""
    echo -e "${BLUE}Sufficient data for automation analysis (${TASK_COUNT} tasks logged)${NC}"
    echo "Run: ${AUTOMATION_ROOT}/tracking/automation-candidate-scorer.sh"
fi

exit 0
