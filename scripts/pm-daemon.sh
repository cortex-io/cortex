#!/bin/bash
# scripts/pm-daemon.sh
# Project Manager Daemon - Monitors workers and ensures task completion
# Part of commit-relay autonomous automation system

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Configuration
PM_ID="pm-001"
PM_VERSION="1.0.0"
LOOP_INTERVAL="${PM_LOOP_INTERVAL:-180}"  # 3 minutes
TEST_MODE="${1:-}"

# Paths
PM_STATE_FILE="$COMMIT_RELAY_HOME/coordination/pm-state.json"
PM_ACTIVITY_LOG="$COMMIT_RELAY_HOME/coordination/pm-activity.jsonl"
PID_FILE="/tmp/pm-daemon.pid"
LOG_FILE="$COMMIT_RELAY_HOME/agents/logs/system/pm-daemon.log"

# Directories
WORKER_SPECS_DIR="$COMMIT_RELAY_HOME/coordination/worker-specs"
CHECKINS_DIR="$COMMIT_RELAY_HOME/coordination/worker-checkins"
REQUESTS_DIR="$COMMIT_RELAY_HOME/coordination/pm-requests"
ALERTS_DIR="$COMMIT_RELAY_HOME/coordination/pm-alerts"

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$CHECKINS_DIR"
mkdir -p "$REQUESTS_DIR"/{pending,processed}
mkdir -p "$ALERTS_DIR"/{pending,resolved}
mkdir -p "$WORKER_SPECS_DIR"/{active,completed,failed}

# Redirect output to log file
exec >> "$LOG_FILE" 2>&1

# Logging functions
log_pm() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [PM] $1"
}

log_pm_event() {
    local event_type="$1"
    local worker_id="${2:-}"
    local data_json="${3:-{}}"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local log_entry
    if [ -n "$worker_id" ]; then
        log_entry=$(jq -nc \
            --arg ts "$timestamp" \
            --arg pm "$PM_ID" \
            --arg evt "$event_type" \
            --arg wid "$worker_id" \
            --argjson data "$data_json" \
            '{timestamp: $ts, pm_id: $pm, event: $evt, worker_id: $wid, data: $data}')
    else
        log_entry=$(jq -nc \
            --arg ts "$timestamp" \
            --arg pm "$PM_ID" \
            --arg evt "$event_type" \
            --argjson data "$data_json" \
            '{timestamp: $ts, pm_id: $pm, event: $evt, data: $data}')
    fi

    echo "$log_entry" >> "$PM_ACTIVITY_LOG"
}

# Check if daemon is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        log_pm "ERROR: PM daemon already running with PID $OLD_PID"
        exit 1
    else
        log_pm "WARN: Removing stale PID file for PID $OLD_PID"
        rm -f "$PID_FILE"
    fi
fi

# Write our PID
echo $$ > "$PID_FILE"

# Cleanup on exit
cleanup() {
    log_pm "INFO: PM daemon stopping (PID $$)"
    log_pm_event "pm_stopped" "" "{\"uptime_hours\": $((SECONDS / 3600))}"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Initialize PM state
initialize_pm_state() {
    if [ ! -f "$PM_STATE_FILE" ]; then
        log_pm "INFO: Initializing PM state"
        jq -n \
            --arg pm_id "$PM_ID" \
            --arg version "$PM_VERSION" \
            --arg started "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                version: $version,
                pm_daemon: {
                    pm_id: $pm_id,
                    pid: null,
                    started_at: $started,
                    last_loop: null,
                    loops_completed: 0,
                    uptime_seconds: 0
                },
                monitored_workers: {},
                metrics: {
                    total_workers_monitored: 0,
                    workers_by_state: {
                        healthy: 0,
                        late: 0,
                        stalled: 0,
                        timeout_warning: 0,
                        zombie: 0
                    },
                    completed_today: 0,
                    failed_today: 0,
                    interventions_today: 0,
                    success_rate_today: 0
                },
                configuration: {
                    loop_interval_seconds: '$LOOP_INTERVAL',
                    checkin_timeout_minutes: 15,
                    stall_timeout_minutes: 20,
                    timeout_warning_levels: [50, 75, 90],
                    timeout_grace_pct: 110
                }
            }' > "$PM_STATE_FILE"
    fi

    # Update PID and start time
    jq --arg pid "$$" \
       --arg started "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.pm_daemon.pid = ($pid | tonumber) | .pm_daemon.started_at = $started' \
       "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"
}

# Save PM state
save_pm_state() {
    local temp_state="/tmp/pm-state-$$.json"

    jq --arg last_loop "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       --arg loops "$LOOP_COUNT" \
       --arg uptime "$SECONDS" \
       '.pm_daemon.last_loop = $last_loop |
        .pm_daemon.loops_completed = ($loops | tonumber) |
        .pm_daemon.uptime_seconds = ($uptime | tonumber)' \
       "$PM_STATE_FILE" > "$temp_state" && \
       mv "$temp_state" "$PM_STATE_FILE"
}

# Calculate age in minutes
calculate_age_minutes() {
    local timestamp="$1"
    local now=$(date -u +%s)
    local then=$(date -u -d "$timestamp" +%s 2>/dev/null || echo 0)
    local age_seconds=$((now - then))
    echo $((age_seconds / 60))
}

# Register worker for monitoring
register_worker() {
    local spec_file="$1"
    local worker_id=$(jq -r '.worker_id' "$spec_file")
    local task_id=$(jq -r '.task_id // "unknown"' "$spec_file")
    local worker_type=$(jq -r '.worker_type' "$spec_file")
    local started_at=$(jq -r '.execution.started_at // empty' "$spec_file")

    # Skip if not started yet
    [ -z "$started_at" ] && return

    # Check if already registered
    local already_registered=$(jq -r ".monitored_workers[\"$worker_id\"] // empty" "$PM_STATE_FILE")
    [ -n "$already_registered" ] && return

    log_pm "INFO: Registering worker: $worker_id (task: $task_id, type: $worker_type)"

    # Add to monitored workers
    jq --arg wid "$worker_id" \
       --arg tid "$task_id" \
       --arg wtype "$worker_type" \
       --arg started "$started_at" \
       --arg registered "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.monitored_workers[$wid] = {
           worker_id: $wid,
           task_id: $tid,
           worker_type: $wtype,
           registered_at: $registered,
           started_at: $started,
           last_checkin: null,
           checkin_count: 0,
           health_state: "unknown",
           progress_pct: 0,
           warnings_sent: 0,
           interventions: [],
           legacy_worker: false
       }' "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

    log_pm_event "worker_registered" "$worker_id" \
        "{\"task_id\": \"$task_id\", \"type\": \"$worker_type\"}"
}

# Scan for active workers
scan_active_workers() {
    local active_dir="$WORKER_SPECS_DIR/active"

    for spec_file in "$active_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue
        register_worker "$spec_file"
    done
}

# Process check-in files
process_checkins() {
    for checkin_file in "$CHECKINS_DIR"/*.json; do
        [ ! -f "$checkin_file" ] && continue

        # Skip warning files
        [[ "$checkin_file" == *"WARNING"* ]] && continue

        local filename=$(basename "$checkin_file")
        local worker_id=$(echo "$filename" | sed 's/-[0-9T]*Z\.json$//')
        local status=$(jq -r '.status' "$checkin_file" 2>/dev/null || echo "unknown")
        local progress=$(jq -r '.progress_pct' "$checkin_file" 2>/dev/null || echo 0)
        local timestamp=$(jq -r '.timestamp' "$checkin_file" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

        # Update worker state
        update_worker_checkin "$worker_id" "$status" "$progress" "$timestamp"

        # Archive check-in (delete after processing)
        rm -f "$checkin_file"
    done
}

# Update worker from check-in
update_worker_checkin() {
    local worker_id="$1"
    local status="$2"
    local progress="$3"
    local timestamp="$4"

    # Check if worker is registered
    local registered=$(jq -r ".monitored_workers[\"$worker_id\"] // empty" "$PM_STATE_FILE")
    [ -z "$registered" ] && return

    # Update worker state
    jq --arg wid "$worker_id" \
       --arg status "$status" \
       --arg progress "$progress" \
       --arg ts "$timestamp" \
       '.monitored_workers[$wid].last_checkin = $ts |
        .monitored_workers[$wid].progress_pct = ($progress | tonumber) |
        .monitored_workers[$wid].checkin_count += 1 |
        .monitored_workers[$wid].health_state = "healthy"' \
       "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

    log_pm_event "checkin_received" "$worker_id" \
        "{\"status\": \"$status\", \"progress\": $progress}"

    # Handle completion
    if [ "$status" = "completed" ]; then
        log_pm "INFO: Worker $worker_id reported completion"
        log_pm_event "worker_completed" "$worker_id" "{\"progress\": $progress}"
    fi

    # Handle failure
    if [ "$status" = "failed" ]; then
        log_pm "WARN: Worker $worker_id reported failure"
        log_pm_event "worker_failed" "$worker_id" "{\"progress\": $progress}"
    fi
}

# Check for missed check-ins
check_missed_checkins() {
    local workers=$(jq -r '.monitored_workers | keys[]' "$PM_STATE_FILE" 2>/dev/null || echo "")

    for worker_id in $workers; do
        local worker_spec="$WORKER_SPECS_DIR/active/${worker_id}.json"
        [ ! -f "$worker_spec" ] && continue

        local status=$(jq -r '.status' "$worker_spec")
        [ "$status" != "running" ] && continue

        local started_at=$(jq -r ".monitored_workers[\"$worker_id\"].started_at" "$PM_STATE_FILE")
        local last_checkin=$(jq -r ".monitored_workers[\"$worker_id\"].last_checkin" "$PM_STATE_FILE")

        # Calculate time since last check-in or start
        local age_minutes
        if [ "$last_checkin" = "null" ] || [ -z "$last_checkin" ]; then
            # No check-ins yet, use start time
            age_minutes=$(calculate_age_minutes "$started_at")
        else
            # Has check-ins, use last check-in time
            age_minutes=$(calculate_age_minutes "$last_checkin")
        fi

        # Determine health state
        local health_state="healthy"
        if [ $age_minutes -ge 20 ]; then
            health_state="stalled"
            log_pm "WARN: Worker $worker_id stalled (no check-in for $age_minutes min)"
            log_pm_event "worker_stalled" "$worker_id" \
                "{\"minutes_since_checkin\": $age_minutes}"
        elif [ $age_minutes -ge 15 ]; then
            health_state="late"
            log_pm "WARN: Worker $worker_id late (no check-in for $age_minutes min)"
            log_pm_event "missed_checkin" "$worker_id" \
                "{\"minutes_since_checkin\": $age_minutes}"
        fi

        # Update health state
        jq --arg wid "$worker_id" \
           --arg health "$health_state" \
           '.monitored_workers[$wid].health_state = $health' \
           "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
           mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"
    done
}

# Check worker timeouts
check_worker_timeouts() {
    local workers=$(jq -r '.monitored_workers | keys[]' "$PM_STATE_FILE" 2>/dev/null || echo "")

    for worker_id in $workers; do
        local worker_spec="$WORKER_SPECS_DIR/active/${worker_id}.json"
        [ ! -f "$worker_spec" ] && continue

        local status=$(jq -r '.status' "$worker_spec")
        [ "$status" != "running" ] && continue

        local started_at=$(jq -r '.execution.started_at' "$worker_spec")
        local time_limit=$(jq -r '.resources.time_limit_minutes // 60' "$worker_spec")

        local age_minutes=$(calculate_age_minutes "$started_at")
        local time_used_pct=$((age_minutes * 100 / time_limit))

        # Check for timeout warnings
        local warnings_sent=$(jq -r ".monitored_workers[\"$worker_id\"].warnings_sent // 0" "$PM_STATE_FILE")

        if [ $time_used_pct -ge 90 ] && [ $warnings_sent -lt 3 ]; then
            log_pm "WARN: Worker $worker_id at 90% time limit ($age_minutes/$time_limit min)"
            log_pm_event "timeout_warning" "$worker_id" \
                "{\"level\": \"final\", \"time_used_pct\": $time_used_pct}"

            # Increment warnings count
            jq --arg wid "$worker_id" \
               '.monitored_workers[$wid].warnings_sent += 1' \
               "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
               mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

        elif [ $time_used_pct -ge 75 ] && [ $warnings_sent -lt 2 ]; then
            log_pm "WARN: Worker $worker_id at 75% time limit ($age_minutes/$time_limit min)"
            log_pm_event "timeout_warning" "$worker_id" \
                "{\"level\": \"second\", \"time_used_pct\": $time_used_pct}"

            jq --arg wid "$worker_id" \
               '.monitored_workers[$wid].warnings_sent += 1' \
               "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
               mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

        elif [ $time_used_pct -ge 50 ] && [ $warnings_sent -lt 1 ]; then
            log_pm "INFO: Worker $worker_id at 50% time limit ($age_minutes/$time_limit min)"
            log_pm_event "timeout_warning" "$worker_id" \
                "{\"level\": \"first\", \"time_used_pct\": $time_used_pct}"

            jq --arg wid "$worker_id" \
               '.monitored_workers[$wid].warnings_sent += 1' \
               "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
               mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"
        fi

        # Check hard timeout (110% grace period)
        if [ $age_minutes -ge $((time_limit * 110 / 100)) ]; then
            log_pm "ERROR: Worker $worker_id exceeded timeout ($age_minutes/$time_limit min)"
            log_pm_event "timeout_exceeded" "$worker_id" \
                "{\"age_minutes\": $age_minutes, \"limit_minutes\": $time_limit}"
            # Will implement kill in Phase 2
        fi
    done
}

# Detect zombie workers
detect_zombies() {
    local active_dir="$WORKER_SPECS_DIR/active"

    for spec_file in "$active_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue

        local worker_id=$(jq -r '.worker_id' "$spec_file")
        local status=$(jq -r '.status' "$spec_file")
        local started_at=$(jq -r '.execution.started_at // empty' "$spec_file")

        # Only check workers marked as "running"
        [ "$status" != "running" ] && continue
        [ -z "$started_at" ] && continue

        # Skip if just started (< 5 minutes)
        local age_minutes=$(calculate_age_minutes "$started_at")
        [ $age_minutes -lt 5 ] && continue

        # Check if process exists (simple check for Claude process)
        local pid=$(ps aux | grep -i "claude" | grep "$worker_id" | grep -v grep | awk '{print $2}' | head -1)

        if [ -z "$pid" ]; then
            log_pm "ERROR: Zombie worker detected: $worker_id (no process, age: $age_minutes min)"
            log_pm_event "zombie_detected" "$worker_id" \
                "{\"age_minutes\": $age_minutes, \"process_found\": false}"
            # Will implement kill in Phase 2
        fi
    done
}

# Calculate metrics
calculate_metrics() {
    local active_count=$(ls -1 "$WORKER_SPECS_DIR/active"/*.json 2>/dev/null | wc -l | tr -d ' ')
    local completed_count=$(find "$WORKER_SPECS_DIR/completed" -name "*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
    local failed_count=$(find "$WORKER_SPECS_DIR/failed" -name "*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')

    local total=$((completed_count + failed_count))
    local success_rate=0

    if [ $total -gt 0 ]; then
        success_rate=$(echo "scale=1; $completed_count * 100 / $total" | bc 2>/dev/null || echo 0)
    fi

    # Update metrics in PM state
    jq --arg active "$active_count" \
       --arg completed "$completed_count" \
       --arg failed "$failed_count" \
       --arg rate "$success_rate" \
       '.metrics.total_workers_monitored = ($active | tonumber) |
        .metrics.completed_today = ($completed | tonumber) |
        .metrics.failed_today = ($failed | tonumber) |
        .metrics.success_rate_today = ($rate | tonumber)' \
       "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"
}

# Main PM daemon loop
PM_START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOOP_COUNT=0

log_pm "INFO: PM daemon starting (PID $$, version $PM_VERSION)"
log_pm "INFO: Loop interval: ${LOOP_INTERVAL}s"
log_pm "INFO: Working directory: $COMMIT_RELAY_HOME"

initialize_pm_state

log_pm_event "pm_started" "" \
    "{\"version\": \"$PM_VERSION\", \"loop_interval\": $LOOP_INTERVAL}"

# Test mode: run once and exit
if [ "$TEST_MODE" = "--test-mode" ]; then
    log_pm "INFO: Running in test mode (single loop)"

    scan_active_workers
    process_checkins
    check_missed_checkins
    check_worker_timeouts
    detect_zombies
    calculate_metrics
    save_pm_state

    log_pm "INFO: Test loop completed"
    exit 0
fi

# Main monitoring loop
while true; do
    LOOP_START=$(date +%s)
    LOOP_COUNT=$((LOOP_COUNT + 1))

    log_pm "DEBUG: Starting loop $LOOP_COUNT"

    # Monitoring tasks
    scan_active_workers
    process_checkins
    check_missed_checkins
    check_worker_timeouts
    detect_zombies
    calculate_metrics
    save_pm_state

    LOOP_END=$(date +%s)
    LOOP_DURATION=$((LOOP_END - LOOP_START))

    log_pm "DEBUG: Loop $LOOP_COUNT completed in ${LOOP_DURATION}s"
    log_pm_event "pm_loop_completed" "" \
        "{\"loop_number\": $LOOP_COUNT, \"duration_seconds\": $LOOP_DURATION}"

    # Sleep until next loop
    sleep "$LOOP_INTERVAL"
done
