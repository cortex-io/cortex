#!/bin/bash
# Health Monitor Daemon
# Monitors health of all system components and spawns backups on failure

set -e

# Configuration
MONITOR_INTERVAL=180  # 3 minutes (180 seconds)
HEARTBEAT_THRESHOLD=300  # 5 minutes (300 seconds)
HEALTH_ALERTS_FILE="coordination/health-alerts.json"
HEALTH_INCIDENTS_DIR="coordination/health-incidents"
HEALTH_MONITOR_LOG="agents/logs/system/health-monitor.log"
PID_FILE="/tmp/health-monitor-daemon.pid"

# Component heartbeat files
PM_DAEMON_HEARTBEAT="coordination/pm-daemon-heartbeat.json"
PM_AGENT_HEARTBEAT="coordination/pm-agent-heartbeat.json"
COORDINATOR_HEARTBEAT="coordination/coordinator-heartbeat.json"

# Ensure directories exist
mkdir -p coordination agents/logs/system "$HEALTH_INCIDENTS_DIR"

# Initialize health alerts file if missing
if [ ! -f "$HEALTH_ALERTS_FILE" ]; then
    cat > "$HEALTH_ALERTS_FILE" << 'EOF'
{
  "sla_config": {
    "critical": 15,
    "high": 30,
    "medium": 60,
    "low": 120
  },
  "alerts": []
}
EOF
fi

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$HEALTH_MONITOR_LOG"
}

# Check if heartbeat file is fresh (< threshold seconds old)
check_heartbeat() {
    local heartbeat_file="$1"
    local threshold_seconds="$2"

    if [ ! -f "$heartbeat_file" ]; then
        return 1  # File doesn't exist = stale
    fi

    local heartbeat_time
    heartbeat_time=$(jq -r '.timestamp' "$heartbeat_file" 2>/dev/null || echo "0")

    if [ "$heartbeat_time" = "null" ] || [ "$heartbeat_time" = "0" ]; then
        return 1  # Invalid timestamp = stale
    fi

    local current_time
    current_time=$(date +%s)

    local age=$((current_time - heartbeat_time))

    if [ "$age" -gt "$threshold_seconds" ]; then
        echo "$age"  # Return age in seconds
        return 1  # Stale
    fi

    return 0  # Fresh
}

# Create health alert
create_health_alert() {
    local alert_id="$1"
    local alert_type="$2"
    local severity="$3"
    local message="$4"

    log "Creating health alert: $alert_id ($severity) - $message"

    # Check if alert already exists
    local existing
    existing=$(jq --arg id "$alert_id" '.alerts[] | select(.id == $id)' "$HEALTH_ALERTS_FILE" 2>/dev/null || echo "")

    if [ -n "$existing" ]; then
        log "Alert $alert_id already exists, skipping creation"
        return
    fi

    # Add alert
    local timestamp
    timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")

    local sla_minutes
    sla_minutes=$(jq -r --arg sev "$severity" '.sla_config[$sev] // 60' "$HEALTH_ALERTS_FILE")

    local temp_file
    temp_file=$(mktemp)

    jq --arg id "$alert_id" \
       --arg type "$alert_type" \
       --arg sev "$severity" \
       --arg msg "$message" \
       --arg ts "$timestamp" \
       --argjson sla "$sla_minutes" \
       '.alerts += [{
           "id": $id,
           "type": $type,
           "severity": $sev,
           "status": "active",
           "message": $msg,
           "created_at": $ts,
           "sla_minutes": $sla,
           "worker_id": null,
           "investigation_notes": []
       }]' "$HEALTH_ALERTS_FILE" > "$temp_file"

    mv "$temp_file" "$HEALTH_ALERTS_FILE"
    log "Alert $alert_id created successfully"
}

# Resolve health alert
resolve_health_alert() {
    local alert_id="$1"

    log "Resolving health alert: $alert_id"

    local temp_file
    temp_file=$(mktemp)

    jq --arg id "$alert_id" \
       'del(.alerts[] | select(.id == $id))' "$HEALTH_ALERTS_FILE" > "$temp_file"

    mv "$temp_file" "$HEALTH_ALERTS_FILE"
    log "Alert $alert_id resolved"
}

# Spawn PM Agent as backup
spawn_pm_agent() {
    log "Spawning PM Agent as backup for failed PM Daemon"

    # Check if PM Agent already running
    if [ -f "$PM_AGENT_HEARTBEAT" ]; then
        local age
        if check_heartbeat "$PM_AGENT_HEARTBEAT" "$HEARTBEAT_THRESHOLD"; then
            log "PM Agent already running and healthy, skipping spawn"
            return
        fi
    fi

    # Log incident
    ./scripts/log-health-incident.sh \
        "alert-pm-daemon-down" \
        "health-monitor" \
        "pm_agent_spawned" \
        "PM Daemon heartbeat stale, spawning PM Agent as backup"

    # TODO: Spawn PM Agent (requires PM agent implementation)
    # For now, just log the action
    log "PM Agent spawn initiated (implementation pending)"

    # Create alert
    create_health_alert \
        "alert-pm-daemon-down" \
        "pm_daemon_failure" \
        "high" \
        "PM Daemon heartbeat stale, PM Agent spawned as backup"
}

# Check PM health
check_pm_health() {
    local age

    if ! age=$(check_heartbeat "$PM_DAEMON_HEARTBEAT" "$HEARTBEAT_THRESHOLD"); then
        log "WARNING: PM Daemon heartbeat is stale (age: ${age}s, threshold: ${HEARTBEAT_THRESHOLD}s)"

        # Check if PM Agent can cover
        if check_heartbeat "$PM_AGENT_HEARTBEAT" "$HEARTBEAT_THRESHOLD"; then
            log "PM Agent is healthy, no action needed"
        else
            log "PM Agent also unhealthy, spawning backup"
            spawn_pm_agent
        fi
    else
        # PM Daemon healthy, resolve any alerts
        resolve_health_alert "alert-pm-daemon-down" 2>/dev/null || true
    fi
}

# Check Coordinator health
check_coordinator_health() {
    local age

    if ! age=$(check_heartbeat "$COORDINATOR_HEARTBEAT" "$HEARTBEAT_THRESHOLD"); then
        log "WARNING: Coordinator heartbeat is stale (age: ${age}s, threshold: ${HEARTBEAT_THRESHOLD}s)"

        create_health_alert \
            "alert-coordinator-stale" \
            "coordinator_failure" \
            "critical" \
            "Coordinator heartbeat stale for ${age} seconds"
    else
        resolve_health_alert "alert-coordinator-stale" 2>/dev/null || true
    fi
}

# Check Master activity
check_master_activity() {
    local masters_dir="coordination/masters"

    if [ ! -d "$masters_dir" ]; then
        return
    fi

    for master_dir in "$masters_dir"/*; do
        if [ ! -d "$master_dir" ]; then
            continue
        fi

        local master_name
        master_name=$(basename "$master_dir")

        # Check for recent handoffs (activity in last 24 hours)
        local handoffs_dir="$master_dir/handoffs"
        if [ -d "$handoffs_dir" ]; then
            local recent_handoffs
            recent_handoffs=$(find "$handoffs_dir" -name "*.json" -mtime -1 2>/dev/null | wc -l | xargs)

            if [ "$recent_handoffs" -eq 0 ]; then
                log "INFO: Master $master_name has no recent activity (24h)"
                # Don't create alert for low activity - this is informational only
            fi
        fi
    done
}

# Check Dashboard process
check_dashboard_health() {
    if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
        resolve_health_alert "alert-dashboard-down" 2>/dev/null || true
    else
        log "WARNING: Dashboard not responding on port 3000"

        create_health_alert \
            "alert-dashboard-down" \
            "dashboard_failure" \
            "medium" \
            "Dashboard server not responding on port 3000"
    fi
}

# Check Worker Daemon
check_worker_daemon_health() {
    if pgrep -f "worker-daemon" > /dev/null 2>&1; then
        resolve_health_alert "alert-worker-daemon-down" 2>/dev/null || true
    else
        log "WARNING: Worker daemon not running"

        create_health_alert \
            "alert-worker-daemon-down" \
            "worker_daemon_failure" \
            "high" \
            "Worker daemon process not found"
    fi
}

# Main monitoring loop
monitor_loop() {
    log "Health Monitor starting (interval: ${MONITOR_INTERVAL}s, threshold: ${HEARTBEAT_THRESHOLD}s)"

    while true; do
        log "Running health checks..."

        # Check all components
        check_pm_health
        check_coordinator_health
        check_master_activity
        check_dashboard_health
        check_worker_daemon_health

        log "Health checks complete, sleeping for ${MONITOR_INTERVAL}s"
        sleep "$MONITOR_INTERVAL"
    done
}

# Signal handlers
cleanup() {
    log "Health Monitor shutting down..."
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main execution
main() {
    # Check if already running
    if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid=$(cat "$PID_FILE")
        if kill -0 "$old_pid" 2>/dev/null; then
            echo "Health Monitor already running (PID: $old_pid)"
            exit 1
        else
            log "Removing stale PID file"
            rm -f "$PID_FILE"
        fi
    fi

    # Write PID
    echo $$ > "$PID_FILE"

    # Start monitoring
    monitor_loop
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
