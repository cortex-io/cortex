#!/usr/bin/env bash
# Stop All Cortex Daemons
# This script stops all running daemon processes and cleans up PID files

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-/Users/ryandahlberg/Projects/cortex}"

echo "Stopping all Cortex daemons..."
echo

# List of all daemon names
DAEMONS=(
    "cortex-heartbeat-monitor"
    "cleanup-daemon"
    "workflow-daemon"
    "failure-pattern-daemon"
    "auto-fix-daemon"
    "auto-learning-daemon"
    "moe-learning-daemon"
    "anomaly-detector-daemon"
    "security-scan-daemon"
    "threat-intel-daemon"
    "backup-daemon"
    "freshness-daemon"
    "metrics-aggregator-daemon"
    "observability-hub-daemon"
    "ingestion-daemon"
    "worker-restart-daemon"
)

# PID file locations
PID_LOCATIONS=(
    "/tmp"
    "$CORTEX_HOME/coordination/pids"
)

stopped_count=0
not_running_count=0

# Function to stop a daemon by PID file
stop_daemon_by_pid() {
    local pid_file="$1"
    local daemon_name="$(basename "$pid_file" .pid)"

    if [ ! -f "$pid_file" ]; then
        return
    fi

    local pid=$(cat "$pid_file" 2>/dev/null || echo "")

    if [ -z "$pid" ]; then
        echo "  ⚠ Invalid PID file: $pid_file"
        rm -f "$pid_file"
        return
    fi

    # Check if process is running
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "  Stopping $daemon_name (PID: $pid)..."
        kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
        sleep 1

        # Verify it stopped
        if ! ps -p "$pid" > /dev/null 2>&1; then
            echo "    ✓ Stopped $daemon_name"
            ((stopped_count++))
        else
            echo "    ⚠ Failed to stop $daemon_name (PID: $pid)"
        fi
    else
        echo "  ℹ $daemon_name not running (stale PID file)"
        ((not_running_count++))
    fi

    # Clean up PID file
    rm -f "$pid_file"
}

# Stop daemons by PID files
echo "Checking PID files..."
for location in "${PID_LOCATIONS[@]}"; do
    if [ ! -d "$location" ]; then
        continue
    fi

    for daemon in "${DAEMONS[@]}"; do
        pid_file="$location/${daemon}.pid"
        stop_daemon_by_pid "$pid_file"
    done
done

echo

# Also check for any daemon processes by name
echo "Checking for daemon processes by name..."
for daemon in "${DAEMONS[@]}"; do
    pids=$(pgrep -f "$daemon" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        for pid in $pids; do
            # Get process command to verify it's actually our daemon
            cmd=$(ps -p "$pid" -o command= 2>/dev/null || echo "")
            if [[ "$cmd" == *"scripts/daemons"* ]]; then
                echo "  Found running process: $daemon (PID: $pid)"
                kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
                ((stopped_count++))
                echo "    ✓ Stopped $daemon"
            fi
        done
    fi
done

echo

# Final verification
echo "Verifying all daemons stopped..."
running_daemons=$(ps aux | grep -E "scripts/daemons/.*daemon.*\.sh" | grep -v grep | grep -v "stop-all-daemons" || true)

if [ -z "$running_daemons" ]; then
    echo "  ✓ All daemons stopped"
else
    echo "  ⚠ Some daemons may still be running:"
    echo "$running_daemons"
fi

echo

# Clean up any remaining PID files
echo "Cleaning up PID files..."
for location in "${PID_LOCATIONS[@]}"; do
    if [ ! -d "$location" ]; then
        continue
    fi

    removed=0
    for daemon in "${DAEMONS[@]}"; do
        pid_file="$location/${daemon}.pid"
        if [ -f "$pid_file" ]; then
            rm -f "$pid_file"
            ((removed++))
        fi
    done

    if [ $removed -gt 0 ]; then
        echo "  ✓ Removed $removed PID file(s) from $location"
    fi
done

echo
echo "Summary:"
echo "  Stopped: $stopped_count daemon(s)"
echo "  Not running: $not_running_count daemon(s)"
echo
echo "All Cortex daemons have been stopped."
echo
echo "To use the new event-driven architecture:"
echo "  1. Start event dispatcher: ./scripts/events/event-dispatcher.sh"
echo "  2. Or set up cron: * * * * * cd $CORTEX_HOME && ./scripts/events/event-dispatcher.sh"
echo "  3. See documentation: scripts/daemons/DEPRECATED.md"
