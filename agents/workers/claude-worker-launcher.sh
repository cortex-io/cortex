#!/bin/bash
################################################################################
# Claude Code Worker Launcher
#
# Launches a worker in a Claude Code session with its task specification
# This is the bridge between worker-daemon and actual AI execution
################################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Worker ID is required
WORKER_ID="${1:-}"
if [ -z "$WORKER_ID" ]; then
    echo "ERROR: Worker ID required"
    echo "Usage: $0 <worker-id>"
    exit 1
fi

# Worker spec file
SPEC_FILE="$COMMIT_RELAY_HOME/coordination/worker-specs/active/${WORKER_ID}.json"

if [ ! -f "$SPEC_FILE" ]; then
    echo "ERROR: Worker spec not found: $SPEC_FILE"
    exit 1
fi

# Read worker spec
WORKER_TYPE=$(jq -r '.worker_type' "$SPEC_FILE")
TASK_ID=$(jq -r '.task_id' "$SPEC_FILE")
TASK_TITLE=$(jq -r '.task_data.title // "Worker Task"' "$SPEC_FILE")
PROMPT_TEMPLATE="$COMMIT_RELAY_HOME/agents/prompts/workers/${WORKER_TYPE}.md"

if [ ! -f "$PROMPT_TEMPLATE" ]; then
    echo "ERROR: Worker prompt template not found: $PROMPT_TEMPLATE"
    exit 1
fi

echo "================================================"
echo "  Launching Worker in Claude Code"
echo "================================================"
echo "Worker ID: $WORKER_ID"
echo "Type: $WORKER_TYPE"
echo "Task: $TASK_ID"
echo "Title: $TASK_TITLE"
echo ""

# Navigate to commit-relay directory
cd "$COMMIT_RELAY_HOME"

# Create minimal initialization prompt
# Instead of sending the entire template (30KB+), we tell Claude to read both files
INIT_PROMPT="You are ${WORKER_ID}, a ${WORKER_TYPE} worker in the commit-relay autonomous system.

Your complete instructions are in the file: $PROMPT_TEMPLATE
Your specific task assignment is in the file: $SPEC_FILE

Please immediately:
1. Use the Read tool to load: $PROMPT_TEMPLATE
2. Use the Read tool to load: $SPEC_FILE
3. Follow the instructions in the template to complete the task in the spec

Start by reading both files now."

# Launch Claude Code with minimal prompt
echo "Launching Claude Code session..."
echo "Prompt size: ${#INIT_PROMPT} characters (minimal to avoid API limits)"
echo ""

# Use claude command with small prompt argument
claude "$INIT_PROMPT"

# Note: The worker will handle its own status updates and completion
# from within the Claude Code session by reading the spec file
