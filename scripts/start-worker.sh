#!/bin/bash
# scripts/start-worker.sh
# Automatically start a pending worker in a new Claude Code session

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

# Check for worker ID argument
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <worker-id>"
    log_info "Example: $0 worker-scan-001"
    exit 1
fi

WORKER_ID="$1"
WORKER_SPEC_PATH="$COMMIT_RELAY_HOME/coordination/worker-specs/active/${WORKER_ID}.json"

# Verify worker specification exists
if [ ! -f "$WORKER_SPEC_PATH" ]; then
    log_error "Worker specification not found: $WORKER_SPEC_PATH"
    exit 1
fi

log_section "Starting Worker: $WORKER_ID"

# Read worker details
WORKER_TYPE=$(jq -r '.worker_type' "$WORKER_SPEC_PATH")
PROMPT_TEMPLATE=$(jq -r '.prompt_template' "$WORKER_SPEC_PATH")
TASK_ID=$(jq -r '.task_id' "$WORKER_SPEC_PATH")
STATUS=$(jq -r '.status' "$WORKER_SPEC_PATH")

log_info "Worker Type: $WORKER_TYPE"
log_info "Task ID: $TASK_ID"
log_info "Status: $STATUS"
log_info "Prompt: $PROMPT_TEMPLATE"

# Check if worker is already running
if [ "$STATUS" = "running" ]; then
    log_warn "Worker $WORKER_ID is already running"
    exit 0
fi

# Verify prompt template exists
FULL_PROMPT_PATH="$COMMIT_RELAY_HOME/$PROMPT_TEMPLATE"
if [ ! -f "$FULL_PROMPT_PATH" ]; then
    log_error "Prompt template not found: $FULL_PROMPT_PATH"
    exit 1
fi

log_section "Launching Claude CLI Session"
log_info "Prompt: $FULL_PROMPT_PATH"
log_info ""
log_info "The worker will:"
log_info "  1. Read its specification from: $WORKER_SPEC_PATH"
log_info "  2. Execute its assigned task: $TASK_ID"
log_info "  3. Update coordination state with results"
log_info "  4. Auto-commit and push to GitHub"
log_info ""

# Update worker status to running
UPDATE_DATA=$(jq -nc \
    --arg started "$(date +%Y-%m-%dT%H:%M:%S%z)" \
    '{started_at: $started}')

# Use jq to update the worker spec file
jq --arg started "$(date +%Y-%m-%dT%H:%M:%S%z)" \
   '.status = "running" | .execution.started_at = $started' \
   "$WORKER_SPEC_PATH" > "${WORKER_SPEC_PATH}.tmp" && \
   mv "${WORKER_SPEC_PATH}.tmp" "$WORKER_SPEC_PATH"

log_success "Worker status updated to 'running'"

# Broadcast dashboard event
EVENT_DATA=$(jq -nc \
    --arg worker "$WORKER_ID" \
    --arg task "$TASK_ID" \
    --arg type "$WORKER_TYPE" \
    '{worker_id: $worker, task_id: $task, worker_type: $type}')
broadcast_dashboard_event "worker_started" "$EVENT_DATA"

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "Starting Claude CLI with prompt..."
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""

# Launch Claude CLI in interactive mode with prompt
# Workers need full tool access, not print mode
claude "$(cat "$COMMIT_RELAY_HOME/$PROMPT_TEMPLATE")"
