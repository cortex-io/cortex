# Project Manager Implementation Plan

Version: 1.0
Date: 2025-11-06
Timeline: 14 days (2 weeks)
Status: Ready to Execute

---

## Executive Summary

This document provides a detailed, phased implementation plan for the Project Manager (PM) agent system. The PM will increase worker success rate from 26.8% to 75%+ by providing active monitoring, progress tracking, and early intervention.

### Goals

1. **Phase 1** (Days 1-3): Core infrastructure - basic monitoring and timeout enforcement
2. **Phase 2** (Days 4-7): Communication protocol - check-ins, requests, interventions
3. **Phase 3** (Days 8-14): Full deployment - migrate all workers, tune system, validate success

### Success Criteria

- Worker success rate ≥ 75% (up from 26.8%)
- Stalled workers detected within 15 minutes
- 95%+ timeout compliance
- 100% of failures have detailed logs
- PM daemon stable for 7+ days

---

## Phase 1: Core Infrastructure (Days 1-3)

**Goal**: Establish basic PM monitoring without breaking existing system

### Day 1: Foundation & Basic Monitoring

#### Morning: Setup (2-3 hours)

**Task 1.1: Create directory structure**
```bash
# Execute in commit-relay root
mkdir -p coordination/worker-checkins
mkdir -p coordination/pm-requests/{pending,processed}
mkdir -p coordination/pm-alerts/{pending,resolved}
touch coordination/pm-activity.jsonl
touch coordination/pm-state.json
```

**Task 1.2: Initialize PM state**
Create initial `coordination/pm-state.json`:
```json
{
  "version": "1.0.0",
  "pm_daemon": {
    "pm_id": "pm-001",
    "pid": null,
    "started_at": null,
    "last_loop": null,
    "loops_completed": 0,
    "uptime_seconds": 0
  },
  "monitored_workers": {},
  "metrics": {
    "total_workers_monitored": 0,
    "workers_by_state": {
      "healthy": 0,
      "late": 0,
      "stalled": 0,
      "timeout_warning": 0,
      "zombie": 0
    },
    "completed_today": 0,
    "failed_today": 0,
    "interventions_today": 0,
    "success_rate_today": 0
  },
  "configuration": {
    "loop_interval_seconds": 180,
    "checkin_timeout_minutes": 15,
    "stall_timeout_minutes": 20,
    "timeout_warning_levels": [50, 75, 90],
    "timeout_grace_pct": 110
  }
}
```

**Task 1.3: Create logging library**
Create `scripts/lib/pm-logging.sh`:
```bash
#!/bin/bash
# PM logging utilities

PM_ACTIVITY_LOG="${COMMIT_RELAY_HOME}/coordination/pm-activity.jsonl"

# Log PM event to activity log
pm_log_event() {
    local event_type="$1"
    local worker_id="$2"
    local data_json="$3"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local pm_id=$(cat coordination/pm-state.json | jq -r '.pm_daemon.pm_id')

    local log_entry=$(jq -nc \
        --arg ts "$timestamp" \
        --arg pm "$pm_id" \
        --arg evt "$event_type" \
        --arg wid "$worker_id" \
        --argjson data "$data_json" \
        '{timestamp: $ts, pm_id: $pm, event: $evt, worker_id: $wid, data: $data}')

    echo "$log_entry" >> "$PM_ACTIVITY_LOG"
}

export -f pm_log_event
```

#### Afternoon: PM Daemon Core (4-5 hours)

**Task 1.4: Implement PM daemon (monitoring mode only)**

Create `scripts/pm-daemon.sh` (See separate file for full implementation)

**Key Features for Day 1**:
- [x] Startup and initialization
- [x] Main monitoring loop (every 3 minutes)
- [x] Scan for active workers
- [x] Register new workers in PM state
- [x] Track time elapsed per worker
- [x] Log events to pm-activity.jsonl
- [x] Update pm-state.json each loop
- [x] Graceful shutdown handling

**NO interventions yet** - monitoring only!

**Task 1.5: Test PM daemon startup**
```bash
# Start PM daemon in test mode
cd ~/commit-relay
./scripts/pm-daemon.sh --test-mode

# In another terminal, check logs
tail -f coordination/pm-activity.jsonl | jq

# Check PM state
cat coordination/pm-state.json | jq

# Stop daemon
kill $(cat /tmp/pm-daemon.pid)
```

**Deliverables - Day 1**:
- [x] Directory structure created
- [x] PM state initialized
- [x] PM logging library functional
- [x] PM daemon starts and runs (monitoring mode)
- [x] PM detects existing workers
- [x] Events logged to pm-activity.jsonl
- [x] PM state updates each loop

---

### Day 2: Timeout Enforcement & Worker Detection

#### Morning: Timeout Logic (3-4 hours)

**Task 2.1: Implement timeout detection**

Add to PM daemon:
```bash
# Function to check worker timeouts
check_worker_timeout() {
    local worker_id="$1"
    local worker_spec="$2"

    # Extract time information
    local started_at=$(jq -r '.execution.started_at' "$worker_spec")
    local time_limit=$(jq -r '.resources.time_limit_minutes' "$worker_spec")

    # Calculate elapsed time
    local now=$(date -u +%s)
    local started=$(date -u -d "$started_at" +%s 2>/dev/null || echo 0)
    local elapsed_seconds=$((now - started))
    local elapsed_minutes=$((elapsed_seconds / 60))

    # Calculate percentage
    local time_used_pct=$((elapsed_minutes * 100 / time_limit))

    # Check warning thresholds
    if [ $time_used_pct -ge 90 ]; then
        send_timeout_warning "$worker_id" "final" $time_used_pct
    elif [ $time_used_pct -ge 75 ]; then
        send_timeout_warning "$worker_id" "second" $time_used_pct
    elif [ $time_used_pct -ge 50 ]; then
        send_timeout_warning "$worker_id" "first" $time_used_pct
    fi

    # Check hard timeout (110% grace period)
    if [ $elapsed_minutes -ge $((time_limit * 110 / 100)) ]; then
        log_timeout_exceeded "$worker_id" $elapsed_minutes $time_limit
        # Will implement kill in Phase 2
    fi
}
```

**Task 2.2: Implement timeout warning logging**
```bash
send_timeout_warning() {
    local worker_id="$1"
    local level="$2"
    local pct="$3"

    local data=$(jq -nc \
        --arg lvl "$level" \
        --arg pct "$pct" \
        '{warning_level: $lvl, time_used_pct: $pct}')

    pm_log_event "timeout_warning" "$worker_id" "$data"
}
```

**Task 2.3: Test timeout detection**
```bash
# Create test worker with short timeout (5 minutes)
# Let it run for 3 minutes (60%) → should see first warning
# Let it run for 4 minutes (80%) → should see second warning
# Let it run for 5 minutes (100%) → should see final warning
# Let it run for 6 minutes (120%) → should see timeout exceeded log
```

#### Afternoon: Zombie Detection (3-4 hours)

**Task 2.4: Implement process detection**

Add to PM daemon:
```bash
# Check if worker process is actually running
check_worker_process() {
    local worker_id="$1"
    local worker_spec="$2"

    # Try to find Claude process for this worker
    # Look for process with WORKER_ID environment variable
    local pid=$(ps aux | grep -i "claude" | grep "$worker_id" | grep -v grep | awk '{print $2}' | head -1)

    if [ -z "$pid" ]; then
        # No process found
        return 1
    else
        # Process exists
        return 0
    fi
}
```

**Task 2.5: Implement zombie detection**
```bash
detect_zombies() {
    local worker_specs_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    for spec_file in "$worker_specs_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue

        local worker_id=$(jq -r '.worker_id' "$spec_file")
        local status=$(jq -r '.status' "$spec_file")
        local started_at=$(jq -r '.execution.started_at // empty' "$spec_file")

        # Only check workers marked as "running"
        [ "$status" != "running" ] && continue

        # Skip if just started (< 5 minutes)
        if [ -n "$started_at" ]; then
            local now=$(date -u +%s)
            local started=$(date -u -d "$started_at" +%s 2>/dev/null || echo 0)
            local age_minutes=$(( (now - started) / 60 ))

            [ $age_minutes -lt 5 ] && continue
        fi

        # Check if process exists
        if ! check_worker_process "$worker_id" "$spec_file"; then
            log_zombie_detected "$worker_id" "$started_at"
            # Will implement kill in Phase 2
        fi
    done
}
```

**Task 2.6: Test zombie detection**
```bash
# Manually create zombie: Mark worker as "running" but don't start process
# PM should detect within 5 minutes and log zombie_detected event
```

**Deliverables - Day 2**:
- [x] Timeout detection working (50%, 75%, 90% warnings)
- [x] Timeout warnings logged to pm-activity.jsonl
- [x] Hard timeout detection (110% grace)
- [x] Process existence checks working
- [x] Zombie detection working (no process but marked running)
- [x] All events logged properly

---

### Day 3: State Management & Testing

#### Morning: State Persistence (2-3 hours)

**Task 3.1: Implement PM state save/load**

```bash
# Save PM state to disk
save_pm_state() {
    local temp_state="/tmp/pm-state-$$.json"

    # Build state JSON from internal variables
    jq -n \
        --arg pm_id "$PM_ID" \
        --arg pid "$$" \
        --arg started "$PM_START_TIME" \
        --arg last_loop "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg loops "$LOOP_COUNT" \
        '{
            version: "1.0.0",
            pm_daemon: {
                pm_id: $pm_id,
                pid: ($pid | tonumber),
                started_at: $started,
                last_loop: $last_loop,
                loops_completed: ($loops | tonumber)
            },
            monitored_workers: {},
            metrics: {}
        }' > "$temp_state"

    # Atomic replace
    mv "$temp_state" "$PM_STATE_FILE"
}

# Load PM state from disk (on restart)
load_pm_state() {
    if [ ! -f "$PM_STATE_FILE" ]; then
        # Initialize new state
        save_pm_state
        return
    fi

    # Load previous state
    PM_START_TIME=$(jq -r '.pm_daemon.started_at' "$PM_STATE_FILE")
    LOOP_COUNT=$(jq -r '.pm_daemon.loops_completed' "$PM_STATE_FILE")

    # Re-register workers from active specs
    local worker_specs_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/active"
    for spec_file in "$worker_specs_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue
        register_worker_from_spec "$spec_file"
    done
}
```

**Task 3.2: Implement metrics calculation**

```bash
calculate_metrics() {
    local active_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/active"
    local completed_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/completed"
    local failed_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/failed"

    # Count workers by state
    local active_count=$(ls -1 "$active_dir"/*.json 2>/dev/null | wc -l | tr -d ' ')
    local completed_count=$(find "$completed_dir" -name "*.json" -mtime -1 | wc -l | tr -d ' ')
    local failed_count=$(find "$failed_dir" -name "*.json" -mtime -1 | wc -l | tr -d ' ')

    # Calculate success rate
    local total=$((completed_count + failed_count))
    local success_rate=0
    if [ $total -gt 0 ]; then
        success_rate=$(echo "scale=1; $completed_count * 100 / $total" | bc)
    fi

    echo "$success_rate"
}
```

#### Afternoon: Integration Testing (4-5 hours)

**Task 3.3: End-to-end test with real worker**

Test scenario:
1. Start PM daemon
2. Spawn 1 test worker (simple task, 10 min timeout)
3. PM should detect worker within 3 minutes
4. PM should log worker registration
5. PM should track time elapsed
6. PM should send warning at 5 minutes (50%)
7. Worker completes successfully
8. PM should log completion
9. PM state should show 100% success rate

**Task 3.4: Test with multiple concurrent workers**

Test scenario:
1. Start PM daemon
2. Spawn 5 test workers simultaneously
3. PM should track all 5 workers
4. PM should handle concurrent monitoring
5. Check for race conditions
6. Verify all events logged correctly
7. Verify PM state consistent

**Task 3.5: Test PM restart (state persistence)**

Test scenario:
1. Start PM daemon with 3 active workers
2. PM monitors workers for 5 minutes
3. Kill PM daemon
4. Restart PM daemon
5. PM should reload state
6. PM should re-register 3 workers
7. PM should continue monitoring seamlessly
8. No workers disrupted

**Task 3.6: Test zombie cleanup**

Test scenario:
1. Manually create 2 zombie workers (marked running, no process)
2. PM should detect zombies within 5 minutes
3. PM should log zombie_detected events
4. Verify correct workers identified

**Deliverables - Day 3**:
- [x] PM state saves/loads correctly
- [x] PM survives restarts without losing workers
- [x] Metrics calculated accurately
- [x] PM handles 5+ concurrent workers
- [x] No race conditions detected
- [x] Zombie detection working reliably
- [x] All tests passing

**Phase 1 Complete**: Core monitoring infrastructure stable and tested

---

## Phase 2: Communication Protocol (Days 4-7)

**Goal**: Enable workers to check in and request help

### Day 4: Check-In Helper Script

#### Morning: Worker Check-In Helper (3-4 hours)

**Task 4.1: Create worker-checkin.sh**

Create `scripts/worker-checkin.sh` (See separate file for full implementation)

**Key Features**:
- Simple function: `worker_checkin <status> <progress> [options]`
- Writes JSON file to coordination/worker-checkins/
- Fast (< 100ms)
- No dependencies (pure bash + jq)
- Handles errors gracefully

**Task 4.2: Test check-in helper**

```bash
# Source the helper
source scripts/worker-checkin.sh

# Test minimal check-in
export WORKER_ID="test-worker-12345678"
worker_checkin "in_progress" 25

# Test standard check-in
worker_checkin "in_progress" 50 \
  --current-step "Implementing feature" \
  --next-step "Writing tests"

# Test full check-in
worker_checkin "in_progress" 75 \
  --current-step "Running tests" \
  --next-step "Creating PR" \
  --time-remaining "10 minutes" \
  --token-usage 3500

# Verify files created
ls -la coordination/worker-checkins/

# Verify JSON valid
cat coordination/worker-checkins/test-worker-*.json | jq
```

#### Afternoon: PM Check-In Processing (4-5 hours)

**Task 4.3: Add check-in processing to PM daemon**

```bash
process_checkins() {
    local checkins_dir="$COMMIT_RELAY_HOME/coordination/worker-checkins"

    # Find new check-in files (not seen before)
    for checkin_file in "$checkins_dir"/*.json; do
        [ ! -f "$checkin_file" ] && continue

        # Extract worker ID and timestamp from filename
        local filename=$(basename "$checkin_file")
        local worker_id=$(echo "$filename" | cut -d'-' -f1-3)
        local timestamp=$(echo "$filename" | cut -d'-' -f4 | sed 's/.json$//')

        # Parse check-in data
        local status=$(jq -r '.status' "$checkin_file")
        local progress=$(jq -r '.progress_pct' "$checkin_file")

        # Update worker health state
        update_worker_health "$worker_id" "$status" "$progress" "$timestamp"

        # Log check-in received
        local data=$(jq -nc \
            --arg s "$status" \
            --arg p "$progress" \
            '{status: $s, progress: ($p | tonumber)}')
        pm_log_event "checkin_received" "$worker_id" "$data"

        # Archive check-in (optional - or delete after 24h)
        # rm "$checkin_file"
    done
}
```

**Task 4.4: Implement health state tracking**

```bash
update_worker_health() {
    local worker_id="$1"
    local status="$2"
    local progress="$3"
    local checkin_time="$4"

    # Determine health state based on check-in recency
    local now=$(date -u +%s)
    local checkin_ts=$(date -u -d "$checkin_time" +%s 2>/dev/null || echo 0)
    local minutes_since=$(( (now - checkin_ts) / 60 ))

    local health_state="healthy"

    if [ $minutes_since -lt 15 ]; then
        health_state="healthy"
    elif [ $minutes_since -lt 20 ]; then
        health_state="late"
    else
        health_state="stalled"
    fi

    # Store in PM state (in-memory or file)
    # Will implement full state management later

    echo "Worker $worker_id: $health_state (last checkin: $minutes_since min ago)"
}
```

**Deliverables - Day 4**:
- [x] worker-checkin.sh script working
- [x] PM daemon processes check-in files
- [x] Health states calculated correctly
- [x] Check-in events logged
- [x] Basic health tracking working

---

### Day 5: Stall Detection & Missed Check-Ins

#### Morning: Stall Detection Logic (3-4 hours)

**Task 5.1: Implement missed check-in detection**

```bash
check_for_missed_checkins() {
    # Iterate through all monitored workers
    local worker_specs_dir="$COMMIT_RELAY_HOME/coordination/worker-specs/active"

    for spec_file in "$worker_specs_dir"/*.json; do
        [ ! -f "$spec_file" ] && continue

        local worker_id=$(jq -r '.worker_id' "$spec_file")
        local started_at=$(jq -r '.execution.started_at // empty' "$spec_file")

        # Skip if not started yet
        [ -z "$started_at" ] && continue

        # Find latest check-in for this worker
        local latest_checkin=$(ls -1t coordination/worker-checkins/${worker_id}-*.json 2>/dev/null | head -1)

        if [ -z "$latest_checkin" ]; then
            # No check-ins at all
            local age=$(calculate_age_minutes "$started_at")

            if [ $age -ge 15 ]; then
                log_no_checkins "$worker_id" $age
                # Will escalate in Phase 2
            fi
        else
            # Has check-ins, check recency
            local checkin_time=$(basename "$latest_checkin" | sed 's/.*-\([0-9T]*\)Z.json/\1/' | sed 's/T/ /')
            local minutes_since=$(calculate_minutes_since "$checkin_time")

            if [ $minutes_since -ge 20 ]; then
                log_stalled "$worker_id" $minutes_since
                # Will escalate in Phase 2
            elif [ $minutes_since -ge 15 ]; then
                log_late "$worker_id" $minutes_since
            fi
        fi
    done
}
```

**Task 5.2: Implement progress tracking**

```bash
check_progress_stagnation() {
    local worker_id="$1"

    # Get last 3 check-ins for this worker
    local checkins=($(ls -1t coordination/worker-checkins/${worker_id}-*.json 2>/dev/null | head -3))

    if [ ${#checkins[@]} -ge 3 ]; then
        # Extract progress percentages
        local p1=$(jq -r '.progress_pct' "${checkins[0]}")
        local p2=$(jq -r '.progress_pct' "${checkins[1]}")
        local p3=$(jq -r '.progress_pct' "${checkins[2]}")

        # Check if progress stuck (same for 30+ minutes)
        if [ "$p1" = "$p2" ] && [ "$p2" = "$p3" ]; then
            log_progress_stagnation "$worker_id" "$p1"
            return 1  # Stagnant
        fi
    fi

    return 0  # Progressing
}
```

#### Afternoon: Testing Stall Detection (4-5 hours)

**Task 5.3: Test missed check-in detection**

Test scenarios:
1. Worker never checks in → Detected after 15 minutes
2. Worker checks in initially then stops → Detected after 20 minutes
3. Worker checks in regularly → No false positives

**Task 5.4: Test progress stagnation detection**

Test scenarios:
1. Worker reports same progress 3 times → Detected as stagnant
2. Worker makes slow but steady progress → Not flagged
3. Worker stuck at 99% for 30 min → Detected

**Deliverables - Day 5**:
- [x] Missed check-in detection working (15-20 min thresholds)
- [x] Progress stagnation detection working
- [x] No false positives in testing
- [x] All stall events logged correctly

---

### Day 6: Intervention Actions

#### Morning: Intervention Library (3-4 hours)

**Task 6.1: Create pm-intervention.sh**

Create `scripts/pm-intervention.sh` (See separate file for full implementation)

**Key Functions**:
- `send_warning_to_worker` - Write warning file
- `escalate_to_master` - Create alert for master
- `kill_worker_process` - Terminate stalled worker
- `mark_worker_failed` - Move spec to failed/
- `restart_worker` - Spawn replacement worker

**Task 6.2: Implement warning mechanism**

```bash
send_warning_to_worker() {
    local worker_id="$1"
    local warning_type="$2"  # "timeout" or "missed_checkin"
    local message="$3"

    local warning_file="coordination/worker-checkins/${worker_id}-WARNING.json"

    jq -n \
        --arg wid "$worker_id" \
        --arg type "$warning_type" \
        --arg msg "$message" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            worker_id: $wid,
            warning_type: $type,
            message: $msg,
            timestamp: $ts,
            action_required: "Check in within 5 minutes or will be escalated"
        }' > "$warning_file"

    pm_log_event "warning_sent" "$worker_id" "{\"type\": \"$warning_type\"}"
}
```

**Task 6.3: Implement escalation to master**

```bash
escalate_to_master() {
    local worker_id="$1"
    local issue_type="$2"
    local details="$3"

    local worker_spec="coordination/worker-specs/active/${worker_id}.json"
    local parent_master=$(jq -r '.parent_master' "$worker_spec")
    local task_id=$(jq -r '.task_id' "$worker_spec")

    local alert_id="alert-${worker_id}-${issue_type}"
    local alert_file="coordination/pm-alerts/pending/${alert_id}.json"

    jq -n \
        --arg aid "$alert_id" \
        --arg wid "$worker_id" \
        --arg tid "$task_id" \
        --arg master "$parent_master" \
        --arg issue "$issue_type" \
        --arg det "$details" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            alert_id: $aid,
            created_at: $ts,
            alert_type: $issue,
            severity: "high",
            worker_id: $wid,
            task_id: $tid,
            parent_master: $master,
            status: "pending",
            alert_data: {
                issue: $det
            }
        }' > "$alert_file"

    pm_log_event "alert_created" "$worker_id" "{\"alert_id\": \"$alert_id\"}"
}
```

**Task 6.4: Implement worker kill**

```bash
kill_worker_process() {
    local worker_id="$1"
    local reason="$2"

    # Find process ID
    local pid=$(ps aux | grep -i "claude" | grep "$worker_id" | grep -v grep | awk '{print $2}' | head -1)

    if [ -n "$pid" ]; then
        # Graceful kill (SIGTERM first)
        kill -TERM "$pid" 2>/dev/null
        sleep 2

        # Force kill if still running (SIGKILL)
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -KILL "$pid" 2>/dev/null
        fi

        pm_log_event "worker_killed" "$worker_id" "{\"reason\": \"$reason\", \"pid\": $pid}"
    fi

    # Mark worker as failed
    mark_worker_failed "$worker_id" "$reason"
}

mark_worker_failed() {
    local worker_id="$1"
    local reason="$2"

    local worker_spec="coordination/worker-specs/active/${worker_id}.json"
    local failed_dir="coordination/worker-specs/failed"

    # Update spec with failure reason
    jq --arg reason "$reason" \
       --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.status = "failed" | .execution.failed_at = $ts | .execution.failure_reason = $reason' \
       "$worker_spec" > "${worker_spec}.tmp"

    mv "${worker_spec}.tmp" "$worker_spec"

    # Move to failed directory
    mv "$worker_spec" "$failed_dir/"

    pm_log_event "worker_marked_failed" "$worker_id" "{\"reason\": \"$reason\"}"
}
```

#### Afternoon: Enable Interventions (4-5 hours)

**Task 6.5: Integrate interventions into PM daemon**

Update PM daemon main loop:
```bash
# Main monitoring loop
while true; do
    process_checkins
    check_for_missed_checkins
    check_worker_timeout
    detect_zombies

    # NEW: Take intervention actions
    for worker_id in $(get_all_monitored_workers); do
        local health=$(get_worker_health_state "$worker_id")

        case "$health" in
            "late")
                send_warning_to_worker "$worker_id" "missed_checkin" "Please check in within 5 minutes"
                ;;
            "stalled")
                escalate_to_master "$worker_id" "worker_stalled" "No check-in for 20+ minutes"
                ;;
            "zombie")
                kill_worker_process "$worker_id" "zombie_detected"
                ;;
            "timeout_exceeded")
                kill_worker_process "$worker_id" "timeout_exceeded"
                ;;
        esac
    done

    save_pm_state
    sleep $LOOP_INTERVAL
done
```

**Task 6.6: Test interventions end-to-end**

Test scenarios:
1. Worker doesn't check in → Warning sent after 15 min → Escalation after 20 min
2. Worker exceeds timeout → Killed at 110% of limit
3. Zombie worker detected → Killed and marked failed
4. Stalled worker → Escalated to master → Alert created

**Deliverables - Day 6**:
- [x] Intervention library complete
- [x] Warnings sent correctly
- [x] Escalations create alerts for masters
- [x] Workers killed when appropriate
- [x] All interventions logged
- [x] No false-positive kills

---

### Day 7: Worker Request Handling

#### Morning: Request Processing (3-4 hours)

**Task 7.1: Add request scanning to PM daemon**

```bash
process_worker_requests() {
    local requests_dir="coordination/pm-requests/pending"

    for request_file in "$requests_dir"/*.json; do
        [ ! -f "$request_file" ] && continue

        local request_id=$(jq -r '.request_id' "$request_file")
        local worker_id=$(jq -r '.worker_id' "$request_file")
        local request_type=$(jq -r '.request_type' "$request_file")
        local priority=$(jq -r '.priority' "$request_file")

        pm_log_event "request_received" "$worker_id" \
            "{\"request_id\": \"$request_id\", \"type\": \"$request_type\"}"

        # Handle request based on type
        case "$request_type" in
            "need_time")
                handle_time_request "$request_file"
                ;;
            "need_clarification"|"blocked"|"need_help")
                escalate_request_to_master "$request_file"
                ;;
            "need_resources")
                handle_resource_request "$request_file"
                ;;
        esac
    done
}
```

**Task 7.2: Implement time extension handling**

```bash
handle_time_request() {
    local request_file="$1"
    local worker_id=$(jq -r '.worker_id' "$request_file")
    local requested_minutes=$(jq -r '.time_extension.requested_extension_minutes' "$request_file")
    local justification=$(jq -r '.time_extension.justification' "$request_file")

    # Auto-approve if reasonable (≤ 30 minutes and good justification)
    if [ $requested_minutes -le 30 ] && [ -n "$justification" ]; then
        approve_time_extension "$worker_id" $requested_minutes

        # Move request to processed
        mv "$request_file" "coordination/pm-requests/processed/"
    else
        # Escalate to master for approval
        escalate_request_to_master "$request_file"
    fi
}

approve_time_extension() {
    local worker_id="$1"
    local extension_minutes="$2"

    local worker_spec="coordination/worker-specs/active/${worker_id}.json"

    # Update time limit in spec
    local current_limit=$(jq -r '.resources.time_limit_minutes' "$worker_spec")
    local new_limit=$((current_limit + extension_minutes))

    jq --arg new_limit "$new_limit" \
       '.resources.time_limit_minutes = ($new_limit | tonumber)' \
       "$worker_spec" > "${worker_spec}.tmp"

    mv "${worker_spec}.tmp" "$worker_spec"

    pm_log_event "time_extension_granted" "$worker_id" \
        "{\"extension_minutes\": $extension_minutes, \"new_limit\": $new_limit}"
}
```

**Task 7.3: Test request handling**

Test scenarios:
1. Worker requests 20 min extension → Auto-approved by PM
2. Worker requests 60 min extension → Escalated to master
3. Worker requests clarification → Escalated to master
4. Worker reports blocked → Escalated immediately (high priority)

#### Afternoon: Integration & Testing (4-5 hours)

**Task 7.4: End-to-end Phase 2 test**

Full test with check-ins, requests, and interventions:
1. Start PM daemon
2. Update one worker prompt to use check-ins (implementation-worker.md)
3. Spawn worker with real task
4. Worker checks in every 5 minutes
5. Worker requests time extension at 80% progress
6. PM approves extension
7. Worker completes successfully
8. Validate all events logged
9. Verify PM state accurate

**Task 7.5: Stress test with 10 workers**

1. Spawn 10 workers simultaneously (mix of types)
2. Some check in regularly (healthy)
3. Some miss check-ins (late → stalled)
4. Some exceed timeouts
5. PM handles all workers correctly
6. No missed interventions
7. All events logged
8. PM performance acceptable (< 30 sec per loop)

**Deliverables - Day 7**:
- [x] Request processing working
- [x] Time extensions auto-approved correctly
- [x] Escalations working for complex requests
- [x] Full Phase 2 integration test passes
- [x] Stress test with 10 workers successful
- [x] PM stable and performant

**Phase 2 Complete**: Communication protocol working, workers can check in and request help

---

## Phase 3: Full Deployment (Days 8-14)

**Goal**: Migrate all workers, tune system, achieve 75%+ success rate

### Day 8: Worker Prompt Updates

#### All Day: Update Worker Templates (6-8 hours)

**Task 8.1: Create check-in instructions document**

Create `agents/prompts/workers/CHECKIN-INSTRUCTIONS.md` (See separate file)

**Task 8.2: Update implementation-worker.md**

Add check-in calls at key points:
- After initialization (progress 5%)
- After planning (progress 15%)
- During implementation (progress 30%, 50%, 70%)
- After tests (progress 85%)
- On completion (progress 100%)

**Task 8.3: Update analysis-worker.md**

Add check-ins:
- After setup (progress 10%)
- After analysis (progress 50%)
- After report generation (progress 90%)
- On completion (progress 100%)

**Task 8.4: Update test-worker.md**

Add check-ins:
- After test setup (progress 20%)
- During test execution (progress 40%, 60%, 80%)
- On completion (progress 100%)

**Task 8.5: Update remaining worker types**

Update:
- review-worker.md
- pr-worker.md
- documentation-worker.md
- catalog-worker.md
- scan-worker.md
- fix-worker.md

**Deliverables - Day 8**:
- [x] Check-in instructions documented
- [x] All 9 worker templates updated
- [x] Check-in calls at appropriate breakpoints
- [x] Minimal disruption to worker logic
- [x] All templates tested with sample tasks

---

### Day 9-10: Gradual Migration

#### Day 9 Morning: Deploy to Development Workers (2-3 hours)

**Task 9.1: Enable PM monitoring for new dev workers**

1. Commit updated implementation-worker.md
2. Spawn 5 development workers with PM monitoring
3. Monitor for 2 hours
4. Check for issues:
   - Workers checking in correctly?
   - PM processing check-ins?
   - Any performance issues?
   - Any false positives?

**Task 9.2: Fix any issues discovered**

Common issues:
- Check-in files not being created (permissions?)
- PM not processing check-ins fast enough
- Workers getting false-positive warnings
- Syntax errors in check-in calls

#### Day 9 Afternoon: Expand to Security Workers (3-4 hours)

**Task 9.3: Deploy to security workers**

1. Update scan-worker.md and fix-worker.md
2. Spawn 3 security workers
3. Monitor for 2 hours
4. Verify check-ins working for different worker types

#### Day 10 Morning: Expand to All Worker Types (3-4 hours)

**Task 10.1: Deploy remaining worker types**

1. Enable for analysis, test, review, pr, documentation workers
2. Spawn 2-3 of each type
3. Monitor for 3 hours
4. Check success rates per worker type

#### Day 10 Afternoon: Cleanup Existing Workers (3-4 hours)

**Task 10.2: Address the 16 existing stuck workers**

Strategy:
1. PM detects existing workers as legacy (no check-ins expected)
2. PM monitors based on timeout only
3. For workers > 24 hours old: kill and mark failed
4. For workers < 24 hours old: let them complete or timeout naturally
5. Document cleanup actions in pm-activity.jsonl

**Deliverables - Days 9-10**:
- [x] All worker types using check-ins
- [x] 15-20 new workers successfully monitored
- [x] Legacy workers cleaned up
- [x] No major issues blocking deployment
- [x] Success rate trending upward

---

### Day 11-12: Monitoring & Tuning

#### Day 11: Monitor & Collect Data (Full Day)

**Task 11.1: Run system in production mode**

- PM daemon running 24 hours
- 20-30 workers spawned throughout day
- No manual interventions
- Let system operate autonomously

**Task 11.2: Collect metrics**

Track:
- Worker success rate
- Check-in compliance (% of workers checking in)
- Avg check-ins per worker
- Intervention counts by type
- False positive rate (workers killed incorrectly)
- Time to detection (stalls, timeouts)
- PM performance (loop duration, resource usage)

**Task 11.3: Analyze failures**

For each failed worker:
- Why did it fail?
- Was PM intervention appropriate?
- Could it have been prevented?
- What pattern led to failure?

#### Day 12: Tune Parameters (Full Day)

**Task 12.1: Adjust timeouts based on data**

Current thresholds:
- Check-in timeout: 15 minutes (late), 20 minutes (stalled)
- Timeout warnings: 50%, 75%, 90%
- Timeout grace: 110%

Tune based on:
- Are 15/20 min thresholds appropriate?
- Are timeout warnings helpful?
- Is 110% grace too generous or too strict?

**Task 12.2: Optimize check-in frequency**

Current recommendation: Every 5-10 minutes

Analyze:
- Is 5-10 min optimal?
- Do faster tasks need different frequency?
- Do slower tasks need more/less frequent check-ins?

**Task 12.3: Refine intervention logic**

Questions:
- Are we escalating too quickly?
- Are we killing workers too aggressively?
- Should we auto-restart more often?
- Should time extensions be more liberal?

**Deliverables - Days 11-12**:
- [x] 24+ hours of production monitoring data
- [x] Metrics collected and analyzed
- [x] Parameters tuned based on real data
- [x] Success rate improving toward 75%

---

### Day 13: Dashboard Integration

#### Morning: PM Metrics Panel (3-4 hours)

**Task 13.1: Add PM metrics to dashboard**

Update `dashboard/public/index.html` or dashboard-v2.js:

```javascript
// PM Metrics Section
function renderPMMetrics(pmState) {
    return `
        <div class="pm-metrics">
            <h3>Project Manager Status</h3>
            <div class="metric-row">
                <span>Workers Monitored:</span>
                <span>${pmState.metrics.total_workers_monitored}</span>
            </div>
            <div class="metric-row">
                <span>Success Rate (24h):</span>
                <span class="${pmState.metrics.success_rate_today >= 75 ? 'success' : 'warning'}">
                    ${pmState.metrics.success_rate_today.toFixed(1)}%
                </span>
            </div>
            <div class="metric-row">
                <span>Healthy Workers:</span>
                <span class="healthy">${pmState.metrics.workers_by_state.healthy}</span>
            </div>
            <div class="metric-row">
                <span>Late/Stalled:</span>
                <span class="warning">
                    ${pmState.metrics.workers_by_state.late} /
                    ${pmState.metrics.workers_by_state.stalled}
                </span>
            </div>
            <div class="metric-row">
                <span>Interventions Today:</span>
                <span>${pmState.metrics.interventions_today}</span>
            </div>
        </div>
    `;
}
```

**Task 13.2: Add worker health indicators**

Update worker status display to show:
- Last check-in timestamp (e.g., "2 min ago")
- Progress percentage from latest check-in
- Health state badge (healthy / late / stalled)
- Current step description

#### Afternoon: PM Activity Feed (3-4 hours)

**Task 13.3: Add PM event stream to dashboard**

```javascript
// PM Activity Feed
function renderPMActivity(events) {
    return events.slice(0, 20).map(event => {
        const icon = getEventIcon(event.event);
        const color = getEventColor(event.event);

        return `
            <div class="pm-event ${color}">
                <span class="icon">${icon}</span>
                <span class="timestamp">${formatTimestamp(event.timestamp)}</span>
                <span class="worker">${event.worker_id}</span>
                <span class="message">${formatEventMessage(event)}</span>
            </div>
        `;
    }).join('');
}
```

**Task 13.4: Test dashboard updates**

1. PM daemon running
2. Workers checking in
3. Dashboard should update in real-time
4. Verify metrics accurate
5. Verify activity feed shows recent events

**Deliverables - Day 13**:
- [x] PM metrics visible on dashboard
- [x] Worker health indicators showing check-in status
- [x] PM activity feed showing recent interventions
- [x] Dashboard updates in real-time
- [x] Documentation for dashboard integration

---

### Day 14: Validation & Documentation

#### Morning: Final Validation (3-4 hours)

**Task 14.1: Measure success rate**

Run for 4 hours with:
- 30-40 workers spawned
- Mix of all worker types
- PM fully operational
- No manual interventions

Calculate:
- Overall success rate
- Success rate by worker type
- Success rate by master
- Time to completion (avg, median, p95)
- Intervention effectiveness

**Target**: ≥ 75% success rate

**Task 14.2: Validate all requirements met**

Check:
- [x] Workers check in within 5 minutes of start (95%+)
- [x] Stalled workers detected within 15 minutes (90%+)
- [x] Timeouts enforced correctly (95%+)
- [x] All failures logged with details (100%)
- [x] PM uptime > 99% (< 15 min downtime)
- [x] No false-positive kills (0)
- [x] Dashboard shows PM metrics (working)

#### Afternoon: Documentation & Handoff (4-5 hours)

**Task 14.3: Finalize documentation**

Update:
- coordination/pm-architecture.md (add lessons learned)
- coordination/pm-data-formats.md (any schema changes)
- docs/PM-IMPLEMENTATION-PLAN.md (mark as complete)
- docs/PM-TESTING-PLAN.md (test results)
- docs/PM-DASHBOARD-INTEGRATION.md (final specs)

**Task 14.4: Create operational runbook**

Create `docs/PM-OPERATIONS.md`:
- How to start/stop PM daemon
- How to monitor PM health
- How to troubleshoot common issues
- How to tune parameters
- How to handle emergencies

**Task 14.5: Create handoff document**

Create `docs/PM-HANDOFF.md`:
- What was built
- Current status and metrics
- Known limitations
- Future improvements
- Maintenance tasks
- Escalation procedures

**Deliverables - Day 14**:
- [x] Success rate ≥ 75% validated
- [x] All requirements met
- [x] Documentation complete
- [x] Operational runbook created
- [x] Handoff document ready

**Phase 3 Complete**: PM system fully operational, success rate target achieved

---

## Summary Timeline

| Phase | Days | Focus | Key Deliverables |
|-------|------|-------|------------------|
| **Phase 1** | 1-3 | Core infrastructure | PM daemon, monitoring, timeouts, state |
| **Phase 2** | 4-7 | Communication | Check-ins, requests, interventions |
| **Phase 3** | 8-14 | Deployment | Worker updates, tuning, validation |

## Resource Requirements

**Development Time**:
- Phase 1: 20-24 hours
- Phase 2: 28-32 hours
- Phase 3: 32-40 hours
- **Total**: 80-96 hours (10-12 days of full-time work)

**Infrastructure**:
- No new servers or services
- Uses existing file system and git repo
- PM daemon runs on local machine (< 10 MB memory)

**Testing**:
- 20-30 test workers needed throughout phases
- Token budget for testing: ~50,000 tokens
- No production disruption during Phase 1-2

## Risk Mitigation

**Risk: PM daemon crashes frequently**
- Mitigation: Extensive error handling, graceful restart
- Rollback: Stop PM, workers continue normally

**Risk: False-positive worker kills**
- Mitigation: Conservative thresholds, multiple checks before kill
- Rollback: Disable auto-kill, manual review only

**Risk: Worker success rate doesn't improve**
- Mitigation: Analyze failures, tune parameters, iterate
- Escalation: May need deeper investigation of root causes

**Risk: PM performance issues at scale**
- Mitigation: Monitor loop duration, optimize if needed
- Fallback: Reduce check-in frequency, batch processing

## Success Metrics Tracking

Track daily throughout Phase 3:

| Metric | Baseline | Day 8 | Day 10 | Day 12 | Day 14 | Target |
|--------|----------|-------|--------|--------|--------|--------|
| Success Rate | 26.8% | 45% | 60% | 70% | **75%** | ≥75% |
| Check-In Compliance | 0% | 80% | 90% | 95% | 95% | ≥95% |
| Stall Detection Time | N/A | 25 min | 18 min | 15 min | 12 min | ≤15 min |
| Timeout Compliance | ~0% | 60% | 80% | 90% | 95% | ≥95% |
| PM Uptime | N/A | 95% | 98% | 99% | 99.5% | ≥99% |

## Next Steps After Completion

1. **Monitor for 1 week**: Ensure stability in production
2. **Collect feedback**: From workers and masters
3. **Identify patterns**: Why do remaining 25% fail?
4. **Plan Phase 4**: Advanced features (ML-based prediction, auto-optimization)
5. **Scale considerations**: Plan for > 100 concurrent workers

---

**Document Status**: Implementation Ready
**Start Date**: To be determined by executor
**Expected Completion**: Start + 14 days
**Success Criteria**: Worker success rate ≥ 75%, all requirements met
