# Worker Automatic Restart System - Design Document
**Phase 4.3 - Self-Healing Implementation**

## Overview

The Worker Automatic Restart System provides intelligent restart capabilities for failed workers, enabling the commit-relay system to automatically recover from worker failures without human intervention. This builds on top of the Zombie Worker Cleanup System (Phase 4.2) to create a complete self-healing infrastructure.

## Goals

1. **Automatic Recovery**: Restart failed workers without manual intervention
2. **Intelligent Retry Logic**: Exponential backoff and max retry limits prevent infinite loops
3. **Resource Awareness**: Respect token budgets and system capacity
4. **State Preservation**: Maintain context and progress when restarting workers
5. **Observability**: Complete audit trail of all restart attempts
6. **Safety**: Rate limiting and circuit breakers prevent restart storms

## Architecture

### Integration Points

```
┌─────────────────┐
│ Heartbeat       │
│ Monitor Daemon  │
└────────┬────────┘
         │ detects zombie
         ▼
┌─────────────────┐
│ Zombie Cleanup  │
│ System          │
└────────┬────────┘
         │ cleanup complete
         ▼
┌─────────────────┐
│ Restart         │◄─── NEW (Phase 4.3)
│ Decision Engine │
└────────┬────────┘
         │ decide: restart or abandon
         ▼
┌─────────────────┐
│ Worker Spawner  │
│ (spawn-worker)  │
└─────────────────┘
```

### Workflow

1. **Zombie Detection** → Heartbeat monitor detects unresponsive worker
2. **Cleanup** → Zombie cleanup terminates process, recovers resources
3. **Restart Decision** → Evaluate if worker should be restarted
4. **Restart Execution** → Spawn new worker with preserved context
5. **Monitoring** → Track restart success/failure for learning

## Restart Policies

### When to Restart

**Restart Criteria** (all must be true):
- Worker was in `running` or `active` status when it failed
- Task is not marked as `completed` or `abandoned`
- Retry count < max retries (default: 3)
- No circuit breaker active for this worker type
- Token budget available for restart
- Parent master is still active

**Do NOT Restart When**:
- Worker was in `pending` status (never started successfully)
- Task is completed (restart would duplicate work)
- Max retries exceeded (indicates systemic issue)
- Circuit breaker tripped (too many failures of this type)
- No token budget remaining
- Task deadline has passed

### Retry Strategy

**Exponential Backoff**:
```
Attempt 1: 30 seconds delay
Attempt 2: 120 seconds delay (2 min)
Attempt 3: 300 seconds delay (5 min)

Formula: delay = min(30 * 2^(attempt - 1), 300)
```

**Max Retries by Worker Type**:
```json
{
  "scan-worker": 3,
  "fix-worker": 2,
  "analysis-worker": 3,
  "implementation-worker": 2,
  "test-worker": 3,
  "review-worker": 2,
  "pr-worker": 1,
  "documentation-worker": 3,
  "default": 2
}
```

**Rationale**:
- Scan/analysis workers: Higher retries (transient network issues common)
- Implementation/fix workers: Lower retries (failures often indicate code issues)
- PR workers: Single retry only (idempotent operations)

## State Management

### Restart Metadata

When a worker is restarted, the following metadata is tracked:

```json
{
  "restart": {
    "is_restart": true,
    "original_worker_id": "worker-implementation-005",
    "restart_attempt": 2,
    "restart_reason": "zombie_cleanup",
    "restart_initiated_at": "2025-11-18T16:30:00-0600",
    "restart_initiated_by": "restart-engine",
    "previous_attempts": [
      {
        "worker_id": "worker-implementation-005",
        "started_at": "2025-11-18T15:00:00-0600",
        "failed_at": "2025-11-18T15:45:00-0600",
        "failure_reason": "zombie_no_heartbeat",
        "tokens_used": 25000
      },
      {
        "worker_id": "worker-implementation-005-restart-1",
        "started_at": "2025-11-18T15:46:00-0600",
        "failed_at": "2025-11-18T16:20:00-0600",
        "failure_reason": "zombie_no_heartbeat",
        "tokens_used": 18000
      }
    ],
    "total_tokens_used_across_attempts": 43000
  }
}
```

### Task State Tracking

Tasks also track restart information:

```json
{
  "task_id": "task-001",
  "status": "in_progress",
  "assigned_worker": "worker-implementation-005-restart-2",
  "restart_count": 2,
  "max_retries_allowed": 2,
  "circuit_breaker": {
    "active": false,
    "triggered_at": null
  }
}
```

## Safety Mechanisms

### 1. Circuit Breaker

**Purpose**: Prevent repeated restarts of systemically failing worker types

**Trigger Conditions**:
- 5 failures of same worker type within 15 minutes
- 3 consecutive restart failures for same task

**Behavior When Tripped**:
- No new workers of that type can be restarted
- Circuit opens after 30 minutes OR manual reset
- Emit alert event for human review

**Implementation**:
```bash
check_circuit_breaker() {
    local worker_type="$1"
    local circuit_file="$COMMIT_RELAY_HOME/coordination/restart/circuit-breakers.json"

    # Check if circuit breaker active for this type
    if jq -e --arg type "$worker_type" '.[$type].active == true' "$circuit_file" >/dev/null 2>&1; then
        return 1  # Circuit breaker active
    fi
    return 0  # OK to proceed
}
```

### 2. Rate Limiting

**Global Rate Limit**: Max 10 restarts per minute across all worker types
**Per-Type Rate Limit**: Max 3 restarts per minute per worker type
**Per-Task Rate Limit**: Max 1 restart per task per 2 minutes

**Purpose**: Prevent restart storms that could exhaust resources

### 3. Token Budget Protection

**Before Restart**:
- Check available token budget
- Reserve tokens for restart (same allocation as original)
- If insufficient budget, defer restart and emit alert

**After Restart**:
- Track cumulative token usage across all attempts
- Abort if total tokens > 3x original allocation (indicates inefficiency)

### 4. Deadline Enforcement

**Check Before Restart**:
- If task has deadline, check if enough time remains
- Minimum viable time: original worker timeout + 10 minutes
- If insufficient time, abandon and mark task as failed

## Implementation

### Core Functions

#### 1. `should_restart_worker(worker_id)`

**Purpose**: Decide if a cleaned-up worker should be restarted

**Logic**:
```bash
should_restart_worker() {
    local worker_id="$1"
    local zombie_spec="$ZOMBIE_SPECS_DIR/$(date +%Y-%m-%d)/${worker_id}.json"

    # Extract worker metadata
    local task_id=$(jq -r '.task_id' "$zombie_spec")
    local worker_type=$(jq -r '.worker_type' "$zombie_spec")
    local status=$(jq -r '.status' "$zombie_spec")
    local restart_count=$(jq -r '.restart.restart_attempt // 0' "$zombie_spec")

    # Check restart criteria
    if ! check_restart_criteria "$worker_id" "$task_id" "$worker_type" "$restart_count"; then
        return 1  # Do not restart
    fi

    return 0  # OK to restart
}
```

#### 2. `calculate_restart_delay(attempt)`

**Purpose**: Calculate backoff delay for restart attempt

**Implementation**:
```bash
calculate_restart_delay() {
    local attempt="$1"
    local base_delay=30
    local max_delay=300

    # Exponential backoff: 30 * 2^(attempt-1)
    local delay=$((base_delay * (2 ** (attempt - 1))))

    # Cap at max delay
    if [ "$delay" -gt "$max_delay" ]; then
        delay="$max_delay"
    fi

    echo "$delay"
}
```

#### 3. `restart_worker(worker_id)`

**Purpose**: Execute worker restart with preserved context

**Workflow**:
1. Load zombie spec to get original worker configuration
2. Check restart criteria (retries, circuit breaker, budget)
3. Calculate backoff delay
4. Schedule restart (add to restart queue)
5. Emit restart scheduled event
6. After delay, spawn new worker with restart metadata
7. Track restart success/failure

**Implementation**:
```bash
restart_worker() {
    local original_worker_id="$1"
    local zombie_spec="$ZOMBIE_SPECS_DIR/$(date +%Y-%m-%d)/${original_worker_id}.json"

    # Load original worker config
    local task_id=$(jq -r '.task_id' "$zombie_spec")
    local worker_type=$(jq -r '.worker_type' "$zombie_spec")
    local master=$(jq -r '.parent_master' "$zombie_spec")
    local restart_attempt=$(jq -r '.restart.restart_attempt // 0' "$zombie_spec")

    # Increment attempt counter
    restart_attempt=$((restart_attempt + 1))

    # Calculate delay
    local delay=$(calculate_restart_delay "$restart_attempt")

    log_restart "INFO: Scheduling restart for $original_worker_id (attempt $restart_attempt, delay ${delay}s)"

    # Add to restart queue
    local restart_time=$(date -v+${delay}S +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || date -d "$delay seconds" +%Y-%m-%dT%H:%M:%S%z)
    local new_worker_id="${original_worker_id}-restart-${restart_attempt}"

    # Queue restart
    queue_restart "$new_worker_id" "$task_id" "$worker_type" "$master" "$restart_time" "$original_worker_id" "$restart_attempt"

    # Emit event
    emit_restart_event "worker_restart_scheduled" "$original_worker_id" "{\"new_worker_id\": \"$new_worker_id\", \"attempt\": $restart_attempt, \"delay\": $delay}"
}
```

#### 4. `execute_restart(restart_entry)`

**Purpose**: Actually spawn the restarted worker

**Implementation**:
```bash
execute_restart() {
    local restart_entry="$1"

    local new_worker_id=$(echo "$restart_entry" | jq -r '.new_worker_id')
    local task_id=$(echo "$restart_entry" | jq -r '.task_id')
    local worker_type=$(echo "$restart_entry" | jq -r '.worker_type')
    local master=$(echo "$restart_entry" | jq -r '.master')
    local original_worker_id=$(echo "$restart_entry" | jq -r '.original_worker_id')
    local attempt=$(echo "$restart_entry" | jq -r '.attempt')

    log_restart "INFO: Executing restart for $new_worker_id (attempt $attempt)"

    # Spawn new worker with RESTART metadata
    RESTART_MODE=true \
    RESTART_ATTEMPT="$attempt" \
    RESTART_ORIGINAL_WORKER="$original_worker_id" \
    "$COMMIT_RELAY_HOME/scripts/spawn-worker.sh" \
        --type "$worker_type" \
        --task-id "$task_id" \
        --master "$master" \
        --worker-id "$new_worker_id"

    if [ $? -eq 0 ]; then
        log_restart "SUCCESS: Worker restarted successfully: $new_worker_id"
        emit_restart_event "worker_restarted" "$original_worker_id" "{\"new_worker_id\": \"$new_worker_id\", \"attempt\": $attempt}"
        return 0
    else
        log_restart "ERROR: Failed to restart worker: $new_worker_id"
        emit_restart_event "worker_restart_failed" "$original_worker_id" "{\"new_worker_id\": \"$new_worker_id\", \"attempt\": $attempt}"

        # Check if we should try again or trip circuit breaker
        if [ "$attempt" -ge 3 ]; then
            trip_circuit_breaker "$worker_type" "Max restart attempts exceeded"
        fi

        return 1
    fi
}
```

### Restart Queue Processor

**Purpose**: Background daemon that processes scheduled restarts

**File**: `scripts/daemons/worker-restart-daemon.sh`

**Responsibilities**:
- Poll restart queue every 10 seconds
- Execute restarts when scheduled time arrives
- Clean up completed restart entries
- Monitor restart success rates
- Trip circuit breakers when needed

**Process**:
```bash
while true; do
    # Load restart queue
    for entry in $(get_pending_restarts); do
        scheduled_time=$(echo "$entry" | jq -r '.scheduled_at')

        # Check if it's time to execute
        if is_time_to_restart "$scheduled_time"; then
            execute_restart "$entry"
            remove_from_queue "$entry"
        fi
    done

    sleep 10
done
```

## Configuration

### Policy File

**Location**: `coordination/config/worker-restart-policy.json`

```json
{
  "enabled": true,
  "max_retries_by_type": {
    "scan-worker": 3,
    "fix-worker": 2,
    "analysis-worker": 3,
    "implementation-worker": 2,
    "test-worker": 3,
    "review-worker": 2,
    "pr-worker": 1,
    "documentation-worker": 3,
    "default": 2
  },
  "backoff": {
    "base_delay_seconds": 30,
    "max_delay_seconds": 300,
    "strategy": "exponential"
  },
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 5,
    "failure_window_seconds": 900,
    "reset_timeout_seconds": 1800,
    "consecutive_failure_threshold": 3
  },
  "rate_limits": {
    "global_max_per_minute": 10,
    "per_type_max_per_minute": 3,
    "per_task_min_interval_seconds": 120
  },
  "token_budget": {
    "check_before_restart": true,
    "max_cumulative_multiplier": 3.0
  },
  "deadline_enforcement": {
    "enabled": true,
    "minimum_time_buffer_seconds": 600
  }
}
```

## Observability

### Events Emitted

All events logged to `coordination/events/worker-restart-events.jsonl`

**Event Types**:
1. `worker_restart_scheduled` - Restart queued with delay
2. `worker_restarted` - New worker successfully spawned
3. `worker_restart_failed` - Restart spawn failed
4. `worker_restart_abandoned` - Max retries exceeded, giving up
5. `circuit_breaker_tripped` - Too many failures, circuit opened
6. `circuit_breaker_reset` - Circuit breaker manually or automatically reset
7. `restart_rate_limited` - Restart blocked by rate limiter

### Metrics

**Tracked Metrics** (saved to `coordination/metrics/worker-restart-metrics.json`):
```json
{
  "timestamp": "2025-11-18T16:45:00-0600",
  "total_restarts_attempted": 45,
  "total_restarts_succeeded": 38,
  "total_restarts_failed": 7,
  "success_rate": 84.4,
  "restarts_by_type": {
    "scan-worker": {"attempted": 12, "succeeded": 11, "failed": 1},
    "implementation-worker": {"attempted": 8, "succeeded": 5, "failed": 3}
  },
  "average_restart_delay_seconds": 87,
  "circuit_breakers_active": 0,
  "tasks_abandoned": 2
}
```

## Testing Strategy

### Unit Tests

**File**: `testing/unit/worker-restart.test.sh`

**Tests**:
1. `should_restart_worker()` decision logic
2. Retry count enforcement
3. Backoff delay calculation
4. Circuit breaker triggering and reset
5. Rate limit enforcement
6. Token budget checking
7. Deadline validation

### Integration Tests

**File**: `testing/integration/worker-restart-e2e.test.sh`

**Tests**:
1. End-to-end restart flow (zombie → cleanup → restart)
2. Multi-attempt restart with backoff
3. Circuit breaker trip and recovery
4. Rate limiting under load
5. State preservation across restarts

### Stress Tests

- Simulate 20 worker failures simultaneously
- Verify rate limiting prevents restart storm
- Verify circuit breakers trip appropriately
- Verify system recovers gracefully

## Success Criteria

**Phase 4.3 Complete When**:
1. ✅ Restart decision engine implemented
2. ✅ Restart queue and processor daemon running
3. ✅ Circuit breaker and rate limiting operational
4. ✅ Configuration policy file in place
5. ✅ All unit tests passing (target: 15 tests)
6. ✅ E2E integration test passing
7. ✅ Documentation complete
8. ✅ Restart metrics being collected

**Target Success Rate**: >80% of restarts result in successful worker completion

## Future Enhancements (Phase 4.4+)

1. **Failure Pattern Detection**:
   - ML-based analysis of failure patterns
   - Predict which restarts are likely to succeed
   - Auto-adjust retry policies based on historical data

2. **Smart Context Preservation**:
   - Save worker progress checkpoints
   - Resume from last checkpoint on restart
   - Reduce duplicate work

3. **Adaptive Backoff**:
   - Adjust delay based on failure type
   - Shorter delays for transient failures
   - Longer delays for systemic issues

4. **Auto-Remediation**:
   - Detect common failure patterns (OOM, timeout, etc.)
   - Apply automatic fixes before restart (increase memory, adjust timeout)
   - Learn from successful remediations

## Appendix: Integration with Zombie Cleanup

**Modified**: `scripts/lib/zombie-cleanup.sh`

At the end of `cleanup_zombie_worker()` function:

```bash
# Success
log_cleanup "SUCCESS: Zombie cleanup completed for $worker_id"
emit_zombie_event "zombie_cleanup_completed" "$worker_id"

# NEW: Check if worker should be restarted (Phase 4.3)
if command -v should_restart_worker &> /dev/null; then
    if should_restart_worker "$worker_id"; then
        log_cleanup "INFO: Worker eligible for restart, triggering restart logic"
        restart_worker "$worker_id" &  # Background restart (non-blocking)
    else
        log_cleanup "INFO: Worker not eligible for restart (criteria not met)"
    fi
fi

log_cleanup "========================================"
return 0
```

This ensures restart logic is automatically triggered after successful zombie cleanup, creating a seamless self-healing flow.
