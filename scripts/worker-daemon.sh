#!/bin/bash
# scripts/worker-daemon.sh
# Unified Worker Daemon - Monitors workers, launches pending workers, and manages PM responsibilities
# Includes: Worker launching, completion tracking, PM state management, metrics, snapshot creation
# Part of cortex autonomous automation system

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"
source "$SCRIPT_DIR/lib/heartbeat.sh"

# Daemon configuration
DAEMON_NAME="cortex-worker-daemon"
POLL_INTERVAL="${WORKER_DAEMON_POLL_INTERVAL:-30}"  # Check every 30 seconds
AUTO_CLOSE_WORKERS="${AUTO_CLOSE_WORKERS:-true}"     # Auto-close terminal tabs after completion
PM_LOOP_INTERVAL="${PM_LOOP_INTERVAL:-180}"          # PM tasks every 3 minutes (6 daemon cycles)
SNAPSHOT_INTERVAL="${SNAPSHOT_INTERVAL:-300}"        # Snapshots every 5 minutes (10 daemon cycles)
LOG_FILE="${CORTEX_HOME}/agents/logs/system/worker-daemon.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# PM State and Activity Files
PM_STATE_FILE="$CORTEX_HOME/coordination/pm-state.json"
PM_ACTIVITY_LOG="$CORTEX_HOME/coordination/pm-activity.jsonl"
PM_ID="pm-001"
PM_VERSION="1.0.0"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

log_daemon() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] $1"
}

# PM-specific logging functions
log_pm() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [PM] $1"
}

log_pm_event() {
    local event_type="$1"
    local worker_id="${2:-}"
    local data_json="${3:-}"

    # Default to empty object if not provided
    if [ -z "$data_json" ]; then
        data_json="{}"
    fi

    local timestamp=$(date +%Y-%m-%dT%H:%M:%S%z)

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
log_daemon "INFO: Working directory: $CORTEX_HOME"

# Cleanup on exit
cleanup() {
    log_daemon "INFO: Worker daemon stopping (PID $$)"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Track active workers using a simple file-based approach
TRACKING_DIR="/tmp/cortex-workers"
mkdir -p "$TRACKING_DIR"

# ============================================================================
# PM SUBSYSTEM: Initialization and State Management
# ============================================================================

# Calculate age in minutes
calculate_age_minutes() {
    local timestamp="$1"
    local now=$(date +%s)

    # macOS-compatible date parsing
    local then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: use -j -f for ISO8601 parsing
        then=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$timestamp" +%s 2>/dev/null || echo 0)
    else
        # Linux: use -d
        then=$(date -d "$timestamp" +%s 2>/dev/null || echo 0)
    fi

    local age_seconds=$((now - then))
    echo $((age_seconds / 60))
}

# Initialize PM state
initialize_pm_state() {
    if [ ! -f "$PM_STATE_FILE" ]; then
        log_pm "INFO: Initializing PM state"
        jq -n \
            --arg pm_id "$PM_ID" \
            --arg version "$PM_VERSION" \
            --arg started "$(date +%Y-%m-%dT%H:%M:%S%z)" \
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
                    active_workers: 0,
                    completed_workers: 0,
                    failed_workers: 0,
                    total_workers: 0,
                    success_rate: 0,
                    completed_today: 0,
                    failed_today: 0,
                    success_rate_today: 0
                },
                configuration: {
                    loop_interval_seconds: '$PM_LOOP_INTERVAL',
                    checkin_timeout_minutes: 15,
                    stall_timeout_minutes: 20,
                    timeout_grace_pct: 110
                }
            }' > "$PM_STATE_FILE"
    fi

    # Update PID and start time
    jq --arg pid "$$" \
       --arg started "$(date +%Y-%m-%dT%H:%M:%S%z)" \
       '.pm_daemon.pid = ($pid | tonumber) | .pm_daemon.started_at = $started' \
       "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"
}

# Save PM state to file and dashboard
save_pm_state() {
    local temp_state="/tmp/pm-state-$$.json"

    # Update state with current metrics
    jq --arg last_loop "$(date +%Y-%m-%dT%H:%M:%S%z)" \
       --arg loops "$PM_LOOPS_COMPLETED" \
       '.pm_daemon.last_loop = $last_loop |
        .pm_daemon.loops_completed = ($loops | tonumber)' \
       "$PM_STATE_FILE" > "$temp_state"

    # Validate temp file was created successfully
    if [ ! -s "$temp_state" ]; then
        log_pm "ERROR: Failed to create temp state file"
        rm -f "$temp_state"
        return 1
    fi

    # Always write to file first (primary data store)
    if mv "$temp_state" "$PM_STATE_FILE"; then
        log_pm "DEBUG: PM state saved to file"
    else
        log_pm "ERROR: Failed to save PM state to file"
        rm -f "$temp_state"
        return 1
    fi

    # Optionally report to dashboard API (best effort, non-critical)
    if curl -s -f -X POST http://localhost:3000/api/pm/state \
        -H "Content-Type: application/json" \
        -d @"$PM_STATE_FILE" \
        --max-time 2 > /dev/null 2>&1; then
        log_pm "DEBUG: PM state reported to dashboard API"
    fi
}

# ============================================================================
# PM SUBSYSTEM: Worker Monitoring
# ============================================================================

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
       --arg registered "$(date +%Y-%m-%dT%H:%M:%S%z)" \
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
           warnings_sent: 0
       }' "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

    log_pm_event "worker_registered" "$worker_id" \
        "{\"task_id\": \"$task_id\", \"type\": \"$worker_type\"}"
}

# Scan for active workers and register new ones
scan_active_workers() {
    local active_dir="$CORTEX_HOME/coordination/worker-specs/active"
    [ ! -d "$active_dir" ] && return

    for spec_file in "$active_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue
        register_worker "$spec_file"
    done
}

# ============================================================================
# PM SUBSYSTEM: Health Checking
# ============================================================================

# Process check-in files
process_checkins() {
    local checkins_dir="$CORTEX_HOME/coordination/worker-checkins"
    [ ! -d "$checkins_dir" ] && return

    for checkin_file in "$checkins_dir"/*.json; do
        [ ! -f "$checkin_file" ] && continue

        # Skip warning files
        [[ "$checkin_file" == *"WARNING"* ]] && continue

        local filename=$(basename "$checkin_file")
        local worker_id=$(echo "$filename" | sed 's/-[0-9T]*Z\.json$//')
        local status=$(jq -r '.status' "$checkin_file" 2>/dev/null || echo "unknown")
        local progress=$(jq -r '.progress_pct' "$checkin_file" 2>/dev/null || echo 0)
        local timestamp=$(jq -r '.timestamp' "$checkin_file" 2>/dev/null || date +%Y-%m-%dT%H:%M:%S%z)

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
}

# Check for missed check-ins
check_missed_checkins() {
    local workers=$(jq -r '.monitored_workers | keys[]' "$PM_STATE_FILE" 2>/dev/null || echo "")
    local active_dir="$CORTEX_HOME/coordination/worker-specs/active"

    for worker_id in $workers; do
        local worker_spec="$active_dir/${worker_id}.json"
        [ ! -f "$worker_spec" ] && continue

        local status=$(jq -r '.status' "$worker_spec")
        [ "$status" != "running" ] && continue

        local started_at=$(jq -r ".monitored_workers[\"$worker_id\"].started_at" "$PM_STATE_FILE")
        local last_checkin=$(jq -r ".monitored_workers[\"$worker_id\"].last_checkin" "$PM_STATE_FILE")

        # Calculate time since last check-in or start
        local age_minutes
        if [ "$last_checkin" = "null" ] || [ -z "$last_checkin" ]; then
            age_minutes=$(calculate_age_minutes "$started_at")
        else
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

# ============================================================================
# PM SUBSYSTEM: Timeout Management
# ============================================================================

# Check worker timeouts
check_worker_timeouts() {
    local workers=$(jq -r '.monitored_workers | keys[]' "$PM_STATE_FILE" 2>/dev/null || echo "")
    local active_dir="$CORTEX_HOME/coordination/worker-specs/active"

    for worker_id in $workers; do
        local worker_spec="$active_dir/${worker_id}.json"
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
        fi
    done
}

# ============================================================================
# PM SUBSYSTEM: Zombie Detection
# ============================================================================

# Detect zombie workers
detect_zombies() {
    local active_dir="$CORTEX_HOME/coordination/worker-specs/active"
    local zombie_count=0
    local zombie_workers=()

    [ ! -d "$active_dir" ] && return

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

            zombie_count=$((zombie_count + 1))
            zombie_workers+=("$worker_id")
        fi
    done

    # Create health alert if 10+ zombies detected
    if [ $zombie_count -ge 10 ]; then
        log_pm "CRITICAL: Zombie threshold exceeded ($zombie_count zombies detected)"

        local alert_id="alert-zombie-threshold-$(date +%s)"
        local zombie_list=$(printf '%s,' "${zombie_workers[@]}" | sed 's/,$//')

        # Check if alert already exists
        if [ -f "$CORTEX_HOME/coordination/health-alerts.json" ]; then
            local existing_zombie_alerts=$(jq '[.alerts[] | select(.type == "zombie_threshold" and .status == "active")] | length' \
                "$CORTEX_HOME/coordination/health-alerts.json" 2>/dev/null || echo 0)

            if [ "$existing_zombie_alerts" -eq 0 ]; then
                log_pm "Creating zombie threshold health alert"

                local temp_alerts=$(mktemp)
                jq --arg id "$alert_id" \
                   --arg count "$zombie_count" \
                   --arg workers "$zombie_list" \
                   --arg ts "$(date +%Y-%m-%dT%H:%M:%S%z)" \
                   '.alerts += [{
                       "id": $id,
                       "type": "zombie_threshold",
                       "severity": "high",
                       "status": "active",
                       "message": "Zombie threshold exceeded: \($count) zombies detected (threshold: 10)",
                       "metric_value": ($count | tonumber),
                       "threshold": 10,
                       "sla_minutes": 30,
                       "created_at": $ts,
                       "worker_id": null,
                       "investigation_notes": [],
                       "zombie_workers": $workers
                   }]' "$CORTEX_HOME/coordination/health-alerts.json" > "$temp_alerts" && \
                   mv "$temp_alerts" "$CORTEX_HOME/coordination/health-alerts.json"

                log_pm_event "zombie_threshold_alert" "" \
                    "{\"zombie_count\": $zombie_count, \"threshold\": 10, \"alert_id\": \"$alert_id\"}"
            fi
        fi
    fi

    return 0
}

# ============================================================================
# PM SUBSYSTEM: Metrics & Snapshots
# ============================================================================

# Calculate metrics
calculate_metrics() {
    local active_dir="$CORTEX_HOME/coordination/worker-specs/active"
    local completed_dir="$CORTEX_HOME/coordination/worker-specs/completed"
    local failed_dir="$CORTEX_HOME/coordination/worker-specs/failed"

    # Get all-time counts for dashboard
    local active_count=$(find "$active_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
    local completed_count=$(find "$completed_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
    local failed_count=$(find "$failed_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

    # Get today-only counts for daily metrics
    local completed_today=$(find "$completed_dir" -name "*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
    local failed_today=$(find "$failed_dir" -name "*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')

    # Calculate all-time success rate
    local total_all=$((active_count + completed_count + failed_count))
    local success_rate_all=0
    if [ $total_all -gt 0 ]; then
        success_rate_all=$(awk "BEGIN {printf \"%.1f\", ($completed_count * 100 / $total_all)}")
    fi

    # Calculate today's success rate
    local total_today=$((completed_today + failed_today))
    local success_rate_today=0
    if [ $total_today -gt 0 ]; then
        success_rate_today=$(awk "BEGIN {printf \"%.1f\", ($completed_today * 100 / $total_today)}")
    fi

    # Update metrics in PM state
    jq --arg active "$active_count" \
       --arg completed "$completed_count" \
       --arg failed "$failed_count" \
       --arg total "$total_all" \
       --arg rate "$success_rate_all" \
       --arg completed_today "$completed_today" \
       --arg failed_today "$failed_today" \
       --arg rate_today "$success_rate_today" \
       '.metrics.active_workers = ($active | tonumber) |
        .metrics.completed_workers = ($completed | tonumber) |
        .metrics.failed_workers = ($failed | tonumber) |
        .metrics.total_workers = ($total | tonumber) |
        .metrics.success_rate = ($rate | tonumber) |
        .metrics.completed_today = ($completed_today | tonumber) |
        .metrics.failed_today = ($failed_today | tonumber) |
        .metrics.success_rate_today = ($rate_today | tonumber)' \
       "$PM_STATE_FILE" > "${PM_STATE_FILE}.tmp" && \
       mv "${PM_STATE_FILE}.tmp" "$PM_STATE_FILE"

    # Update workforce-streams.json for dashboard
    jq --arg active "$active_count" \
       --arg completed "$completed_count" \
       --arg failed "$failed_count" \
       '.workers.active = ($active | tonumber) |
        .workers.completed = ($completed | tonumber) |
        .workers.failed = ($failed | tonumber) |
        .last_updated = "'$(date +%Y-%m-%dT%H:%M:%S%z)'"' \
       "$CORTEX_HOME/coordination/workforce-streams.json" > \
       "$CORTEX_HOME/coordination/workforce-streams.json.tmp" 2>/dev/null && \
       mv "$CORTEX_HOME/coordination/workforce-streams.json.tmp" \
          "$CORTEX_HOME/coordination/workforce-streams.json" 2>/dev/null || true
}

# Create historical snapshot
create_snapshot() {
    local timestamp="$1"
    local history_dir="$CORTEX_HOME/coordination/history/hourly"
    local snapshot_file="${history_dir}/${timestamp}.json"

    mkdir -p "$history_dir"

    # Read current metrics from PM state
    local active_workers=$(jq -r '.metrics.active_workers // 0' "$PM_STATE_FILE")
    local completed_workers=$(jq -r '.metrics.completed_workers // 0' "$PM_STATE_FILE")
    local failed_workers=$(jq -r '.metrics.failed_workers // 0' "$PM_STATE_FILE")
    local success_rate=$(jq -r '.metrics.success_rate // 0' "$PM_STATE_FILE")
    local total_workers=$(jq -r '.metrics.total_workers // 0' "$PM_STATE_FILE")
    local completed_today=$(jq -r '.metrics.completed_today // 0' "$PM_STATE_FILE")
    local failed_today=$(jq -r '.metrics.failed_today // 0' "$PM_STATE_FILE")

    # Read token budget if exists
    local total_budget=200000
    local total_used=0
    local token_budget_file="$CORTEX_HOME/coordination/token-budget.json"

    if [ -f "$token_budget_file" ]; then
        total_budget=$(jq -r '.total_budget // 200000' "$token_budget_file" 2>/dev/null || echo 200000)
        total_used=$(jq -r '.usage_metrics.total_tokens_used_today // 0' "$token_budget_file" 2>/dev/null || echo 0)
    fi

    local usage_pct=0
    if [ $total_budget -gt 0 ]; then
        usage_pct=$(awk "BEGIN {printf \"%.2f\", ($total_used * 100 / $total_budget)}")
    fi

    # Create snapshot JSON
    cat > "$snapshot_file" <<EOF
{
  "timestamp": "$timestamp",
  "workers": {
    "active": $active_workers,
    "completed": $completed_workers,
    "failed": $failed_workers,
    "total": $total_workers,
    "success_rate": $success_rate,
    "completed_today": $completed_today,
    "failed_today": $failed_today
  },
  "tokens": {
    "total_budget": $total_budget,
    "total_used": $total_used,
    "available": $((total_budget - total_used)),
    "usage_percentage": $usage_pct
  },
  "pm_daemon": {
    "pid": $$,
    "loops_completed": $PM_LOOPS_COMPLETED
  }
}
EOF

    log_pm "DEBUG: Historical snapshot created: $snapshot_file"
}

# ============================================================================
# PM SUBSYSTEM: PM Loop Execution
# ============================================================================

# Execute PM monitoring tasks
execute_pm_loop() {
    PM_LOOPS_COMPLETED=$((PM_LOOPS_COMPLETED + 1))
    log_pm "DEBUG: Starting PM loop $PM_LOOPS_COMPLETED"

    # Monitoring tasks with error handling
    scan_active_workers || log_pm "WARN: scan_active_workers failed"
    process_checkins || log_pm "WARN: process_checkins failed"
    check_missed_checkins || log_pm "WARN: check_missed_checkins failed"
    check_worker_timeouts || log_pm "WARN: check_worker_timeouts failed"
    detect_zombies || log_pm "WARN: detect_zombies failed"
    calculate_metrics || log_pm "WARN: calculate_metrics failed"
    save_pm_state || log_pm "WARN: save_pm_state failed"

    log_pm "DEBUG: PM loop $PM_LOOPS_COMPLETED completed"
}

# ============================================================================
# Sparse Pool Manager Integration (MoE-inspired)
# ============================================================================

check_pool_capacity() {
    local sparse_manager="$CORTEX_HOME/scripts/sparse-pool-manager.sh"

    if [ ! -f "$sparse_manager" ]; then
        # No sparse manager - allow unlimited (legacy mode)
        return 0
    fi

    # Run sparse pool manager to get recommendations
    local pool_output=$("$sparse_manager" 2>/dev/null || echo "")

    if [ -z "$pool_output" ]; then
        # Manager failed - allow launch (fail-open)
        log_daemon "WARN: Sparse pool manager check failed, allowing worker launch"
        return 0
    fi

    # Check pool state file for capacity
    local pool_state="$CORTEX_HOME/coordination/memory/working/pool-state.json"
    if [ -f "$pool_state" ]; then
        local active_workers=$(jq -r '.pool_metrics.active_workers' "$pool_state" 2>/dev/null || echo 0)
        local target_workers=$(jq -r '.pool_metrics.target_workers' "$pool_state" 2>/dev/null || echo 99)
        local activation_rate=$(jq -r '.pool_metrics.activation_rate' "$pool_state" 2>/dev/null || echo 100)

        log_daemon "INFO: Pool capacity check - Active: $active_workers, Target: $target_workers, Rate: ${activation_rate}%"

        if [ "$active_workers" -ge "$target_workers" ]; then
            log_daemon "WARN: Worker pool at capacity ($active_workers/$target_workers), deferring launch"
            return 1  # At capacity, don't launch
        fi

        log_daemon "INFO: Pool has capacity, allowing launch ($active_workers < $target_workers)"
        return 0
    fi

    # No pool state - allow launch
    return 0
}

# Check for completed workers and finalize their lifecycle
check_completed_workers() {
    local ACTIVE_SPECS_DIR="$CORTEX_HOME/coordination/worker-specs/active"
    local COMPLETED_DIR="$CORTEX_HOME/coordination/worker-specs/completed"
    local FAILED_DIR="$CORTEX_HOME/coordination/worker-specs/failed"
    local WORKERS_DIR="$CORTEX_HOME/agents/workers"

    mkdir -p "$COMPLETED_DIR" "$FAILED_DIR"

    if [ ! -d "$ACTIVE_SPECS_DIR" ]; then
        return 0
    fi

    for spec_file in "$ACTIVE_SPECS_DIR"/*.json; do
        if [ ! -f "$spec_file" ]; then
            continue
        fi

        local worker_id=$(jq -r '.worker_id' "$spec_file" 2>/dev/null || echo "")
        local worker_status=$(jq -r '.status' "$spec_file" 2>/dev/null || echo "")

        if [ -z "$worker_id" ] || [ "$worker_id" = "null" ]; then
            continue
        fi

        # Skip pending workers
        if [ "$worker_status" = "pending" ]; then
            continue
        fi

        # Check for status.json in worker directory
        local status_file="$WORKERS_DIR/$worker_id/status.json"
        if [ ! -f "$status_file" ]; then
            continue
        fi

        local final_status=$(jq -r '.status' "$status_file" 2>/dev/null || echo "")

        if [ "$final_status" = "completed" ]; then
            log_daemon "INFO: Worker $worker_id completed successfully"

            # Update spec with completion info
            local completed_at=$(jq -r '.timestamp' "$status_file" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
            jq --arg status "completed" --arg completed "$completed_at" \
               '.status = $status | .execution.completed_at = $completed' \
               "$spec_file" > "${spec_file}.tmp" && mv "${spec_file}.tmp" "$spec_file"

            # Move to completed directory
            mv "$spec_file" "$COMPLETED_DIR/"
            log_daemon "INFO: Moved $worker_id spec to completed"

            # Update task queue status
            local task_id=$(jq -r '.task_id' "$COMPLETED_DIR/$(basename "$spec_file")" 2>/dev/null || echo "")
            if [ -n "$task_id" ] && [ "$task_id" != "null" ]; then
                local task_queue="$CORTEX_HOME/coordination/task-queue.json"
                if [ -f "$task_queue" ]; then
                    jq --arg tid "$task_id" \
                       '(.tasks[] | select(.id == $tid)).status = "completed"' \
                       "$task_queue" > /tmp/task-queue-update.tmp && \
                       mv /tmp/task-queue-update.tmp "$task_queue"
                    log_daemon "INFO: Updated task $task_id status to completed"
                fi
            fi

            # Emit completion event
            broadcast_dashboard_event "worker_completed" \
                "{\"worker_id\": \"$worker_id\", \"task_id\": \"$task_id\", \"status\": \"completed\"}" \
                2>/dev/null || true

        elif [ "$final_status" = "failed" ]; then
            log_daemon "WARN: Worker $worker_id failed"

            # Get error info
            local error=$(jq -r '.error // "unknown"' "$status_file" 2>/dev/null || echo "unknown")
            local exit_code=$(jq -r '.exit_code // 1' "$status_file" 2>/dev/null || echo "1")

            # Update spec with failure info
            jq --arg status "failed" --arg error "$error" --argjson code "$exit_code" \
               '.status = $status | .execution.error = $error | .execution.exit_code = $code | .execution.completed_at = (now | todate)' \
               "$spec_file" > "${spec_file}.tmp" && mv "${spec_file}.tmp" "$spec_file"

            # Move to failed directory
            mv "$spec_file" "$FAILED_DIR/"
            log_daemon "INFO: Moved $worker_id spec to failed"

            # Update task queue status
            local task_id=$(jq -r '.task_id' "$FAILED_DIR/$(basename "$spec_file")" 2>/dev/null || echo "")
            if [ -n "$task_id" ] && [ "$task_id" != "null" ]; then
                local task_queue="$CORTEX_HOME/coordination/task-queue.json"
                if [ -f "$task_queue" ]; then
                    jq --arg tid "$task_id" \
                       '(.tasks[] | select(.id == $tid)).status = "failed"' \
                       "$task_queue" > /tmp/task-queue-update.tmp && \
                       mv /tmp/task-queue-update.tmp "$task_queue"
                    log_daemon "INFO: Updated task $task_id status to failed"
                fi
            fi

            # Emit failure event
            broadcast_dashboard_event "worker_failed" \
                "{\"worker_id\": \"$worker_id\", \"task_id\": \"$task_id\", \"error\": \"$error\"}" \
                2>/dev/null || true
        fi
    done
}

# Initialize PM subsystem on daemon startup
PM_LOOPS_COMPLETED=0
DAEMON_CYCLES=0
LAST_PM_LOOP_TIME=0
LAST_SNAPSHOT_TIME=0
initialize_pm_state
log_daemon "INFO: PM subsystem initialized"
log_pm "INFO: Worker daemon starting with PM subsystem (version $PM_VERSION)"
log_pm_event "pm_started" "" "{\"version\": \"$PM_VERSION\", \"loop_interval\": $PM_LOOP_INTERVAL, \"snapshot_interval\": $SNAPSHOT_INTERVAL}"

# Main daemon loop
while true; do
    cd "$CORTEX_HOME"
    DAEMON_CYCLES=$((DAEMON_CYCLES + 1))
    CURRENT_TIME=$(date +%s)

    # Check for completed workers first
    check_completed_workers

    # Execute PM monitoring loop every PM_LOOP_INTERVAL seconds (6 daemon cycles at 30s interval)
    if [ $((CURRENT_TIME - LAST_PM_LOOP_TIME)) -ge $PM_LOOP_INTERVAL ]; then
        execute_pm_loop
        LAST_PM_LOOP_TIME=$CURRENT_TIME
    fi

    # Create snapshots every SNAPSHOT_INTERVAL seconds (10 daemon cycles at 30s interval)
    if [ $((CURRENT_TIME - LAST_SNAPSHOT_TIME)) -ge $SNAPSHOT_INTERVAL ]; then
        create_snapshot "$(date +%Y-%m-%dT%H:%M:%S%z)"
        LAST_SNAPSHOT_TIME=$CURRENT_TIME
    fi

    # MoE: Check pool capacity before processing workers
    if ! check_pool_capacity; then
        log_daemon "INFO: Pool at capacity, skipping this cycle"
        sleep "$POLL_INTERVAL"
        continue
    fi

    # Pull latest coordination state (quietly)
    if git pull origin main --quiet 2>/dev/null; then
        log_daemon "DEBUG: Coordination state updated"
    fi

    # Check for pending workers
    ACTIVE_SPECS_DIR="$CORTEX_HOME/coordination/worker-specs/active"

    if [ -d "$ACTIVE_SPECS_DIR" ]; then
        for spec_file in "$ACTIVE_SPECS_DIR"/*.json; do
            if [ ! -f "$spec_file" ]; then
                continue
            fi

            # Validate JSON before parsing (capture errors)
            JQ_ERROR=$(jq empty "$spec_file" 2>&1 >/dev/null)
            if [ -n "$JQ_ERROR" ]; then
                log_daemon "ERROR: Malformed JSON in worker spec: $(basename "$spec_file")"
                log_daemon "ERROR: jq error: $JQ_ERROR"
                log_daemon "ERROR: Moving malformed spec to quarantine"

                # Create quarantine directory
                mkdir -p "$CORTEX_HOME/coordination/worker-specs/quarantine"

                # Move malformed spec to quarantine with timestamp
                quarantine_file="$CORTEX_HOME/coordination/worker-specs/quarantine/$(basename "$spec_file" .json)-malformed-$(date +%s).json"
                mv "$spec_file" "$quarantine_file"

                # Emit governance alert
                broadcast_dashboard_event "malformed_worker_spec" \
                    "{\"file\": \"$(basename "$spec_file")\", \"error\": \"jq parse failure\", \"quarantined\": \"$quarantine_file\"}" \
                    2>/dev/null || true

                continue
            fi

            WORKER_ID=$(jq -r '.worker_id' "$spec_file" 2>/dev/null || echo "")
            WORKER_STATUS=$(jq -r '.status' "$spec_file" 2>/dev/null || echo "")

            if [ -z "$WORKER_ID" ] || [ "$WORKER_ID" = "null" ]; then
                log_daemon "WARN: Worker spec missing worker_id: $(basename "$spec_file")"
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
                jq --arg started "$(date +%Y-%m-%dT%H:%M:%S%z)" \
                   '.status = "running" | .execution.started_at = $started' \
                   "$spec_file" > "${spec_file}.tmp" && \
                   mv "${spec_file}.tmp" "$spec_file"

                # Initialize heartbeat tracking
                log_daemon "INFO: Initializing heartbeat for $WORKER_ID"
                init_heartbeat "$WORKER_ID" || log_daemon "WARN: Failed to initialize heartbeat for $WORKER_ID"

                # Broadcast worker started event
                EVENT_DATA=$(jq -nc \
                    --arg worker "$WORKER_ID" \
                    --arg task "$TASK_ID" \
                    --arg type "$WORKER_TYPE" \
                    '{worker_id: $worker, task_id: $task, worker_type: $type, launched_by: "daemon"}')
                broadcast_dashboard_event "worker_started" "$EVENT_DATA" 2>/dev/null || true

                # Use Claude Code launcher to spawn worker with AI capabilities
                # Use enhanced launcher with Terminal.app and TTY support
                CLAUDE_LAUNCHER="$CORTEX_HOME/scripts/claude-worker-launcher-v2.sh"

                if [ -f "$CLAUDE_LAUNCHER" ]; then
                    # Read terminal settings
                    TERMINAL_SETTINGS="$CORTEX_HOME/coordination/config/terminal-settings.json"
                    TERMINAL_ENABLED="true"
                    HEADLESS_MODE="false"
                    AUTO_CLOSE_DURATION="0"

                    if [ -f "$TERMINAL_SETTINGS" ]; then
                        TERMINAL_ENABLED=$(jq -r '.terminal_windows_enabled' "$TERMINAL_SETTINGS" 2>/dev/null || echo "true")
                        HEADLESS_MODE=$(jq -r '.headless_mode' "$TERMINAL_SETTINGS" 2>/dev/null || echo "false")
                        AUTO_CLOSE_DURATION=$(jq -r '.auto_close_duration_minutes' "$TERMINAL_SETTINGS" 2>/dev/null || echo "0")
                    fi

                    # Build launch command
                    TERMINAL_CMD="cd $CORTEX_HOME && $CLAUDE_LAUNCHER $WORKER_ID"

                    if [ "$TERMINAL_ENABLED" = "true" ] && [ "$HEADLESS_MODE" = "false" ]; then
                        log_daemon "INFO: Launching worker with Claude Code in Terminal window"

                        # Launch Claude Code worker in Terminal
                        osascript -e "tell application \"Terminal\"
                            do script \"$TERMINAL_CMD\"
                            activate
                        end tell" > /dev/null 2>&1 &

                        # If auto-close duration is set, schedule terminal closure
                        if [ "$AUTO_CLOSE_DURATION" -gt 0 ]; then
                            (
                                sleep $((AUTO_CLOSE_DURATION * 60))
                                osascript -e "tell application \"Terminal\" to close (every window whose name contains \"$WORKER_ID\")" 2>/dev/null || true
                            ) &
                            log_daemon "INFO: Terminal window will auto-close in ${AUTO_CLOSE_DURATION} minutes"
                        fi
                    else
                        log_daemon "INFO: Launching worker with Claude Code in HEADLESS mode (no terminal window)"

                        # Launch worker headless in background
                        (
                            cd "$CORTEX_HOME"
                            mkdir -p "agents/workers/$WORKER_ID/logs"
                            "$CLAUDE_LAUNCHER" "$WORKER_ID" "$TASK_ID" "$WORKER_TYPE" \
                                > "agents/workers/$WORKER_ID/logs/stdout.log" 2>&1 &
                        ) &
                    fi

                else
                    log_daemon "ERROR: Claude worker launcher not found: $CLAUDE_LAUNCHER"
                    log_daemon "ERROR: Cannot launch worker without Claude Code launcher"

                    # Update worker status to failed
                    jq --arg failed "$(date +%Y-%m-%dT%H:%M:%S%z)" \
                       '.status = "failed" | .execution.failed_at = $failed | .execution.error = "Claude launcher not found"' \
                       "$spec_file" > "${spec_file}.tmp" && \
                       mv "${spec_file}.tmp" "$spec_file"

                    # Move to failed directory
                    mv "$spec_file" "$CORTEX_HOME/coordination/worker-specs/failed/"

                    continue
                fi

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
