#!/bin/bash
# scripts/worker-daemon.sh
# Background daemon that monitors for pending workers and launches them automatically
# Part of commit-relay autonomous automation system

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

# Daemon configuration
DAEMON_NAME="commit-relay-worker-daemon"
POLL_INTERVAL="${WORKER_DAEMON_POLL_INTERVAL:-30}"  # Check every 30 seconds
AUTO_CLOSE_WORKERS="${AUTO_CLOSE_WORKERS:-true}"     # Auto-close terminal tabs after completion
LOG_FILE="${COMMIT_RELAY_HOME}/agents/logs/system/worker-daemon.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

log_daemon() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
}

# Check if daemon is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        log_daemon "ERROR: Daemon already running with PID $OLD_PID"
        exit 1
    else
        log_daemon "WARN: Removing stale PID file for PID $OLD_PID"
        rm -f "$PID_FILE"
    fi
fi

# Write our PID
echo $$ > "$PID_FILE"

log_daemon "INFO: Worker daemon starting (PID $$)"
log_daemon "INFO: Poll interval: ${POLL_INTERVAL}s"
log_daemon "INFO: Working directory: $COMMIT_RELAY_HOME"

# Cleanup on exit
cleanup() {
    log_daemon "INFO: Worker daemon stopping (PID $$)"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Track active workers using a simple file-based approach
TRACKING_DIR="/tmp/commit-relay-workers"
mkdir -p "$TRACKING_DIR"

# Main daemon loop
while true; do
    cd "$COMMIT_RELAY_HOME"

    # Pull latest coordination state (quietly)
    if git pull origin main --quiet 2>/dev/null; then
        log_daemon "DEBUG: Coordination state updated"
    fi

    # Check for pending workers
    ACTIVE_SPECS_DIR="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    if [ -d "$ACTIVE_SPECS_DIR" ]; then
        for spec_file in "$ACTIVE_SPECS_DIR"/*.json; do
            if [ ! -f "$spec_file" ]; then
                continue
            fi

            WORKER_ID=$(jq -r '.worker_id' "$spec_file" 2>/dev/null || echo "")
            WORKER_STATUS=$(jq -r '.status' "$spec_file" 2>/dev/null || echo "")

            if [ -z "$WORKER_ID" ] || [ "$WORKER_ID" = "null" ]; then
                continue
            fi

            # Skip if already tracked as active (using file marker)
            if [ -f "$TRACKING_DIR/$WORKER_ID" ]; then
                continue
            fi

            # Launch pending workers
            if [ "$WORKER_STATUS" = "pending" ]; then
                WORKER_TYPE=$(jq -r '.worker_type' "$spec_file")
                TASK_ID=$(jq -r '.task_id' "$spec_file")
                CREATED_BY=$(jq -r '.created_by' "$spec_file")
                TOKEN_BUDGET=$(jq -r '.resources.token_budget' "$spec_file")

                log_daemon "INFO: Found pending worker: $WORKER_ID"
                log_daemon "INFO:   Type: $WORKER_TYPE"
                log_daemon "INFO:   Task: $TASK_ID"
                log_daemon "INFO:   Master: $CREATED_BY"
                log_daemon "INFO:   Budget: ${TOKEN_BUDGET} tokens"

                # Launch worker in background
                log_daemon "INFO: Launching $WORKER_ID in new Claude Code session..."

                # Update worker status to running
                jq --arg started "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                   '.status = "running" | .execution.started_at = $started' \
                   "$spec_file" > "${spec_file}.tmp" && \
                   mv "${spec_file}.tmp" "$spec_file"

                # Broadcast worker started event
                EVENT_DATA=$(jq -nc \
                    --arg worker "$WORKER_ID" \
                    --arg task "$TASK_ID" \
                    --arg type "$WORKER_TYPE" \
                    '{worker_id: $worker, task_id: $task, worker_type: $type, launched_by: "daemon"}')
                broadcast_dashboard_event "worker_started" "$EVENT_DATA" 2>/dev/null || true

                # Get prompt template
                PROMPT_TEMPLATE=$(jq -r '.prompt_template' "$spec_file")
                FULL_PROMPT_PATH="$COMMIT_RELAY_HOME/$PROMPT_TEMPLATE"

                # Build command with optional auto-close
                if [ "$AUTO_CLOSE_WORKERS" = "true" ]; then
                    # Auto-close tab after completion
                    TERMINAL_CMD="cd '$COMMIT_RELAY_HOME' && claude-code --prompt-file '$PROMPT_TEMPLATE'; exit"
                    log_daemon "INFO: Auto-close enabled for $WORKER_ID"
                else
                    # Keep tab open
                    TERMINAL_CMD="cd '$COMMIT_RELAY_HOME' && claude-code --prompt-file '$PROMPT_TEMPLATE'"
                fi

                # Launch Claude Code in background with worker prompt
                # Using osascript to open in new Terminal tab (macOS)
                osascript -e "tell application \"Terminal\"
                    do script \"$TERMINAL_CMD\"
                    activate
                end tell" > /dev/null 2>&1 &

                log_daemon "SUCCESS: Launched $WORKER_ID in new Terminal tab"

                # Mark as tracked
                touch "$TRACKING_DIR/$WORKER_ID"

                # Commit the status change
                git add "$spec_file" 2>/dev/null || true
                git commit -m "chore(daemon): launched $WORKER_ID automatically" --quiet 2>/dev/null || true
                git push origin main --quiet 2>/dev/null || true
            fi
        done
    fi

    # Clean up tracking for completed workers
    for tracking_file in "$TRACKING_DIR"/*; do
        if [ ! -f "$tracking_file" ]; then
            continue
        fi

        worker_id=$(basename "$tracking_file")
        if [ ! -f "$ACTIVE_SPECS_DIR/${worker_id}.json" ]; then
            log_daemon "DEBUG: Worker $worker_id completed, removing from tracking"
            rm -f "$tracking_file"
        fi
    done

    # Sleep before next check
    sleep "$POLL_INTERVAL"
done
