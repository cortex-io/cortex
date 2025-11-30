#!/usr/bin/env bash
# Cleanup Master Daemon
# Runs weekly cleanup scans and auto-fixes safe issues

set -euo pipefail

DAEMON_NAME="cleanup-daemon"
LOG_FILE="coordination/logs/${DAEMON_NAME}.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# Ensure directories exist
mkdir -p coordination/logs
mkdir -p coordination/masters/cleanup/scans

# Check if daemon is already running
if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Daemon already running with PID $OLD_PID"
        exit 1
    fi
fi

# Write PID
echo $$ > "$PID_FILE"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" | tee -a "$LOG_FILE"
}

cleanup() {
    log "Shutting down cleanup daemon"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

log "Starting cleanup daemon"

# Configuration
SCAN_INTERVAL=604800  # Weekly (7 days = 604800 seconds)
CHECK_INTERVAL=3600   # Check every hour

last_scan=0

while true; do
    current_time=$(date +%s)
    current_day=$(date +%u)  # 1 = Monday, 7 = Sunday
    current_hour=$(date +%H)

    # Run on Sunday at 2 AM
    if [[ $current_day -eq 7 && $current_hour -eq 02 ]]; then
        if [[ $((current_time - last_scan)) -ge $SCAN_INTERVAL ]]; then
            log "=== Weekly Cleanup Scan ==="

            # Run full cleanup
            ./coordination/masters/cleanup/run.sh --auto-fix --live >> "$LOG_FILE" 2>&1 || {
                log "ERROR: Cleanup scan failed"
            }

            # Generate report
            ./coordination/masters/cleanup/report.sh >> "$LOG_FILE" 2>&1 || {
                log "ERROR: Report generation failed"
            }

            # Get latest scan
            latest_scan=$(ls -t coordination/masters/cleanup/scans | grep "^scan-" | head -1)

            if [[ -n "$latest_scan" ]]; then
                # Check if manual review needed
                total_issues=$(jq '.summary.total_issues' "coordination/masters/cleanup/scans/$latest_scan/summary.json")

                if [[ $total_issues -gt 0 ]]; then
                    log "⚠️  $total_issues issues found requiring manual review"
                    log "Report: coordination/masters/cleanup/scans/$latest_scan/CLEANUP-REPORT.md"

                    # Log high-priority issues
                    broken_refs=$(jq '.summary.broken_references // 0' "coordination/masters/cleanup/scans/$latest_scan/summary.json")
                    legacy_apis=$(jq '.summary.legacy_api_calls // 0' "coordination/masters/cleanup/scans/$latest_scan/summary.json")

                    if [[ $broken_refs -gt 0 ]]; then
                        log "  🔴 $broken_refs broken references (HIGH PRIORITY)"
                    fi

                    if [[ $legacy_apis -gt 0 ]]; then
                        log "  🔴 $legacy_apis legacy API calls (HIGH PRIORITY)"
                    fi
                else
                    log "✅ No issues found - codebase is clean!"
                fi
            fi

            last_scan=$current_time
            log "Weekly cleanup complete"
        fi
    fi

    # Log status every 24 hours
    hours_since_start=$(( (current_time - $(stat -f %B "$PID_FILE" 2>/dev/null || stat -c %W "$PID_FILE")) / 3600 ))

    if [[ $((hours_since_start % 24)) -eq 0 ]] && [[ $hours_since_start -gt 0 ]]; then
        log "=== Cleanup Daemon Status ==="
        log "Uptime: ${hours_since_start} hours"

        if [[ $last_scan -gt 0 ]]; then
            hours_since_scan=$(( (current_time - last_scan) / 3600 ))
            log "Last scan: ${hours_since_scan} hours ago"
        else
            log "No scans run yet"
        fi

        days_until_next=$((7 - current_day))
        log "Next scan: Sunday 2 AM (in $days_until_next days)"
    fi

    # Sleep for check interval
    sleep $CHECK_INTERVAL
done
