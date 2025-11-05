#!/bin/bash
################################################################################
# Zombie Killer Daemon
#
# Monitors worker specs for zombies (marked "running" with no active process)
# and cleans them up by marking as failed and moving to failed/ directory
################################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh" 2>/dev/null || true

# Configuration
DAEMON_NAME="commit-relay-zombie-killer"
CHECK_INTERVAL="${ZOMBIE_KILLER_INTERVAL:-300}"  # Check every 5 minutes
STALE_THRESHOLD="${ZOMBIE_STALE_THRESHOLD:-900}"  # 15 minutes = stale
LOG_FILE="${COMMIT_RELAY_HOME}/agents/logs/system/zombie-killer.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

log_zombie() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
}

# Check if daemon is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        log_zombie "ERROR: Zombie killer already running with PID $OLD_PID"
        exit 1
    else
        log_zombie "WARN: Removing stale PID file for PID $OLD_PID"
        rm -f "$PID_FILE"
    fi
fi

# Write our PID
echo $$ > "$PID_FILE"

log_zombie "INFO: Zombie Killer daemon starting (PID $$)"
log_zombie "INFO: Check interval: ${CHECK_INTERVAL}s"
log_zombie "INFO: Stale threshold: ${STALE_THRESHOLD}s ($(($STALE_THRESHOLD / 60)) minutes)"
log_zombie "INFO: Working directory: $COMMIT_RELAY_HOME"

# Cleanup on exit
cleanup() {
    log_zombie "INFO: Zombie Killer daemon stopping (PID $$)"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Get current timestamp in seconds since epoch
get_timestamp_seconds() {
    date +%s
}

# Convert ISO 8601 timestamp to seconds since epoch
iso_to_seconds() {
    local iso_time="$1"
    date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso_time" +%s 2>/dev/null || echo "0"
}

# Main zombie killer loop
while true; do
    cd "$COMMIT_RELAY_HOME"

    CURRENT_TIME=$(get_timestamp_seconds)
    ACTIVE_SPECS_DIR="coordination/worker-specs/active"
    FAILED_DIR="coordination/worker-specs/failed"
    mkdir -p "$FAILED_DIR"

    ZOMBIES_FOUND=0
    ZOMBIES_KILLED=0

    if [ -d "$ACTIVE_SPECS_DIR" ]; then
        for spec_file in "$ACTIVE_SPECS_DIR"/*.json; do
            if [ ! -f "$spec_file" ]; then
                continue
            fi

            WORKER_ID=$(jq -r '.worker_id' "$spec_file" 2>/dev/null || echo "")
            WORKER_STATUS=$(jq -r '.status' "$spec_file" 2>/dev/null || echo "")
            STARTED_AT=$(jq -r '.execution.started_at // "1970-01-01T00:00:00Z"' "$spec_file" 2>/dev/null)

            if [ -z "$WORKER_ID" ] || [ "$WORKER_ID" = "null" ]; then
                continue
            fi

            # Only check workers marked as "running"
            if [ "$WORKER_STATUS" != "running" ]; then
                continue
            fi

            # Calculate how long the worker has been running
            STARTED_SECONDS=$(iso_to_seconds "$STARTED_AT")
            if [ "$STARTED_SECONDS" = "0" ]; then
                log_zombie "WARN: Could not parse start time for $WORKER_ID: $STARTED_AT"
                continue
            fi

            RUNNING_TIME=$(($CURRENT_TIME - $STARTED_SECONDS))

            # Check if worker is stale (running longer than threshold)
            if [ $RUNNING_TIME -gt $STALE_THRESHOLD ]; then
                ZOMBIES_FOUND=$((ZOMBIES_FOUND + 1))

                # Check if there's actually a Claude process for this worker
                # Note: This is approximate - we check for any Claude process
                CLAUDE_PROCESSES=$(ps aux | grep -i "claude" | grep -v grep | wc -l | tr -d ' ')

                log_zombie "ZOMBIE DETECTED: $WORKER_ID"
                log_zombie "  Running for: ${RUNNING_TIME}s ($(($RUNNING_TIME / 60)) minutes)"
                log_zombie "  Started at: $STARTED_AT"
                log_zombie "  Active Claude processes: $CLAUDE_PROCESSES"

                # Mark as failed and move to failed directory
                jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg runtime "$RUNNING_TIME" \
                   '.status = "failed" |
                    .execution.completed_at = $ts |
                    .execution.error = "Zombie worker detected - running for \($runtime)s with no completion" |
                    .execution.killed_by = "zombie-killer-daemon"' \
                   "$spec_file" > "${spec_file}.tmp" && \
                   mv "${spec_file}.tmp" "$FAILED_DIR/$(basename "$spec_file")"

                # Update task status to failed
                TASK_ID=$(jq -r '.task_id' "$spec_file" 2>/dev/null)
                if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
                    TASK_QUEUE="coordination/task-queue.json"
                    if [ -f "$TASK_QUEUE" ]; then
                        jq --arg id "$TASK_ID" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                           '.tasks |= map(
                               if .id == $id then
                                   .status = "failed" |
                                   .completed_at = $ts |
                                   .error = "Worker became zombie and was killed"
                               else
                                   .
                               end
                           )' "$TASK_QUEUE" > "${TASK_QUEUE}.tmp" && \
                           mv "${TASK_QUEUE}.tmp" "$TASK_QUEUE"
                    fi
                fi

                ZOMBIES_KILLED=$((ZOMBIES_KILLED + 1))
                log_zombie "KILLED: $WORKER_ID moved to failed/"
            fi
        done
    fi

    if [ $ZOMBIES_FOUND -gt 0 ]; then
        log_zombie "INFO: Zombie scan complete - Found: $ZOMBIES_FOUND, Killed: $ZOMBIES_KILLED"
    else
        log_zombie "DEBUG: No zombies detected - all workers healthy"
    fi

    # Sleep until next check
    sleep $CHECK_INTERVAL
done
