#!/bin/bash
# scripts/daemon-supervisor.sh
# Permanent daemon supervisor - monitors and auto-restarts critical daemons
# Runs as a daemon itself and ensures all required services stay running

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Configuration
SUPERVISOR_LOG="$COMMIT_RELAY_HOME/logs/daemons/daemon-supervisor.log"
CHECK_INTERVAL=30  # seconds between checks
PID_FILE="/tmp/commit-relay-daemon-supervisor.pid"

# Ensure logs directory exists
mkdir -p "$COMMIT_RELAY_HOME/logs/daemons"

# Define critical daemons to supervise (name:script pairs)
# Special syntax for dashboard: "name:node:path/to/server.js"
DAEMON_LIST=(
    "pm-daemon:pm-daemon.sh"
    "health-monitor:health-monitor-daemon.sh"
    "metrics-snapshot:metrics-snapshot-daemon.sh"
    "coordinator:coordinator-daemon.sh"
    "integration-validator:integration-validator-daemon.sh"
    "worker-daemon:worker-daemon.sh"
    "dashboard:node:dashboard/server/index.js"
)

# Function to log messages
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if daemon is running
is_daemon_running() {
    local script_name="$1"
    pgrep -f "$script_name" > /dev/null 2>&1
}

# Function to start a daemon
start_daemon() {
    local daemon_name="$1"
    local script_spec="$2"
    local log_file="$COMMIT_RELAY_HOME/logs/daemons/${daemon_name}.log"

    log_msg "[SUPERVISOR] Starting $daemon_name..."

    # Check if this is a Node.js daemon (format: "node:path/to/file.js")
    if [[ "$script_spec" == node:* ]]; then
        local node_script="${script_spec#node:}"
        cd "$COMMIT_RELAY_HOME"
        nohup node "$node_script" >> "$log_file" 2>&1 &
        local pid=$!
    else
        # Regular bash script daemon
        nohup "$SCRIPT_DIR/$script_spec" >> "$log_file" 2>&1 &
        local pid=$!
    fi

    # Wait a moment and verify it started
    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        log_msg "[SUPERVISOR] $daemon_name started successfully (PID: $pid)"
        return 0
    else
        log_msg "[SUPERVISOR] $daemon_name failed to start"
        return 1
    fi
}

# Function to supervise all daemons
supervise_daemons() {
    for daemon_entry in "${DAEMON_LIST[@]}"; do
        local daemon_name="${daemon_entry%%:*}"
        local script_spec="${daemon_entry#*:}"

        # Extract actual script name for process check
        local check_name
        if [[ "$script_spec" == node:* ]]; then
            check_name="${script_spec#node:}"
        else
            check_name="$script_spec"
        fi

        if ! is_daemon_running "$check_name"; then
            log_msg "[SUPERVISOR] $daemon_name is not running! Attempting restart..."
            start_daemon "$daemon_name" "$script_spec"
        fi
    done
}

# Function to handle signals
cleanup() {
    log_msg "[SUPERVISOR] Supervisor shutting down..."
    rm -f "$PID_FILE"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main supervisor loop
main() {
    # Check if supervisor is already running
    if [ -f "$PID_FILE" ]; then
        old_pid=$(cat "$PID_FILE")
        if ps -p "$old_pid" > /dev/null 2>&1; then
            log_msg "[SUPERVISOR] Supervisor already running with PID $old_pid"
            exit 1
        else
            log_msg "[SUPERVISOR] Stale PID file found, removing..."
            rm -f "$PID_FILE"
        fi
    fi

    # Write our PID
    echo $$ > "$PID_FILE"

    log_msg "========================================"
    log_msg "Daemon Supervisor Started"
    log_msg "========================================"
    log_msg "[SUPERVISOR] PID: $$"
    log_msg "[SUPERVISOR] Check interval: ${CHECK_INTERVAL}s"
    log_msg "[SUPERVISOR] Monitoring ${#DAEMON_LIST[@]} critical daemons"
    log_msg "[SUPERVISOR] Log: $SUPERVISOR_LOG"

    # Supervisor loop
    while true; do
        supervise_daemons
        sleep $CHECK_INTERVAL
    done
}

# Run supervisor
cd "$COMMIT_RELAY_HOME"
main >> "$SUPERVISOR_LOG" 2>&1
