#!/bin/bash
# scripts/start-commit-relay.sh
# Main startup script for Commit-Relay system
# Automatically detects and launches pending workers

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

cd "$COMMIT_RELAY_HOME"

log_section "Commit-Relay Startup"
log_info "Working Directory: $COMMIT_RELAY_HOME"
log_info "Date: $(date)"
log_info ""

# Pull latest coordination state
log_info "Pulling latest coordination state from GitHub..."
if git pull origin main --quiet 2>/dev/null; then
    log_success "Coordination state updated"
else
    log_warn "Could not pull latest state (may already be current)"
fi

log_info ""

# Check for pending workers
log_section "Checking for Pending Workers"

ACTIVE_SPECS_DIR="$COMMIT_RELAY_HOME/coordination/worker-specs/active"
PENDING_WORKERS=()

if [ -d "$ACTIVE_SPECS_DIR" ]; then
    # Find all pending workers
    for spec_file in "$ACTIVE_SPECS_DIR"/*.json; do
        if [ -f "$spec_file" ]; then
            WORKER_STATUS=$(jq -r '.status' "$spec_file")
            WORKER_ID=$(jq -r '.worker_id' "$spec_file")

            if [ "$WORKER_STATUS" = "pending" ]; then
                PENDING_WORKERS+=("$WORKER_ID")
            fi
        fi
    done
fi

PENDING_COUNT=${#PENDING_WORKERS[@]}

if [ "$PENDING_COUNT" -eq 0 ]; then
    log_info "No pending workers found"
    log_info ""
    log_section "System Status"
    log_info "Commit-Relay is ready"
    log_info "To create tasks, use: scripts/create-task.sh"
    log_info "To run master agents, use: scripts/run-*-master.sh"
    exit 0
fi

log_info "Found $PENDING_COUNT pending worker(s):"
log_info ""

# Display pending workers with details
for i in "${!PENDING_WORKERS[@]}"; do
    WORKER_ID="${PENDING_WORKERS[$i]}"
    SPEC_PATH="$ACTIVE_SPECS_DIR/${WORKER_ID}.json"

    WORKER_TYPE=$(jq -r '.worker_type' "$SPEC_PATH")
    TASK_ID=$(jq -r '.task_id' "$SPEC_PATH")
    CREATED_BY=$(jq -r '.created_by' "$SPEC_PATH")
    TOKEN_BUDGET=$(jq -r '.resources.token_budget' "$SPEC_PATH")

    log_info "  [$((i+1))] $WORKER_ID"
    log_info "      Type: $WORKER_TYPE"
    log_info "      Task: $TASK_ID"
    log_info "      Master: $CREATED_BY"
    log_info "      Budget: ${TOKEN_BUDGET} tokens"
    log_info ""
done

# Auto-start mode or interactive mode
AUTO_START="${AUTO_START:-false}"

if [ "$AUTO_START" = "true" ]; then
    # Auto-start first pending worker
    FIRST_WORKER="${PENDING_WORKERS[0]}"
    log_section "Auto-Starting Worker: $FIRST_WORKER"
    exec "$SCRIPT_DIR/start-worker.sh" "$FIRST_WORKER"
else
    # Interactive mode - prompt user
    log_section "Worker Startup Options"
    log_info "To start a worker, run:"
    log_info "  ./scripts/start-worker.sh <worker-id>"
    log_info ""
    log_info "Examples:"
    for WORKER_ID in "${PENDING_WORKERS[@]}"; do
        log_info "  ./scripts/start-worker.sh $WORKER_ID"
    done
    log_info ""
    log_info "To auto-start the first pending worker:"
    log_info "  AUTO_START=true ./scripts/start-commit-relay.sh"
fi

log_info ""
log_section "Commit-Relay Ready"
