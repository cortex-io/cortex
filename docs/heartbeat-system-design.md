# Worker Heartbeat System Design

**Author**: Claude Code
**Date**: 2025-11-18
**Phase**: 4.1 - Self-Healing Implementation
**Status**: Design Complete, Implementation In Progress

---

## Overview

The Worker Heartbeat System provides automatic failure detection and health monitoring for all workers in the commit-relay system. Workers emit regular heartbeats containing health metrics, and a monitoring daemon detects failures and triggers recovery actions.

## Design Principles

1. **Fail-Safe**: Missing heartbeats should not cause false positives
2. **Lightweight**: Minimal overhead on worker execution
3. **Observable**: All heartbeat events feed into observability system
4. **Actionable**: Clear signals for automated recovery
5. **Debuggable**: Complete audit trail for post-mortem analysis

## Architecture

```
┌─────────────────┐
│  Active Worker  │
│                 │
│  ┌───────────┐  │
│  │ Heartbeat │  │ Emits every 30s
│  │ Library   │◄─┼──────────┐
│  └─────┬─────┘  │          │
│        │        │          │
└────────┼────────┘          │
         │                   │
         │ Updates           │
         ▼                   │
┌─────────────────┐          │
│  Worker Spec    │          │
│  (JSON file)    │          │
│                 │          │
│  heartbeat: {   │          │
│    last: ...    │          │
│    health: ...  │          │
│  }              │          │
└────────┬────────┘          │
         │                   │
         │ Monitors          │
         ▼                   │
┌─────────────────┐    Triggers
│   Heartbeat     │    Recovery
│   Monitor       ├──────────┘
│   Daemon        │
└────────┬────────┘
         │
         │ Emits Events
         ▼
┌─────────────────┐
│  Observability  │
│  Hub            │
└─────────────────┘
```

## Heartbeat Protocol

### 1. Timing

- **Emission Interval**: 30 seconds
- **Warning Threshold**: 60 seconds (2 missed heartbeats)
- **Critical Threshold**: 120 seconds (4 missed heartbeats)
- **Zombie Threshold**: 300 seconds (10 missed heartbeats)

### 2. Heartbeat Data Structure

Added to worker spec JSON:

```json
{
  "worker_id": "worker-implementation-001",
  "status": "running",
  ...
  "heartbeat": {
    "last_heartbeat": "2025-11-18T14:30:00-0600",
    "heartbeat_sequence": 42,
    "health": {
      "status": "healthy",
      "cpu_usage_percent": 45.2,
      "memory_usage_mb": 512,
      "tokens_used": 25000,
      "tokens_remaining": 175000,
      "active_for_seconds": 1260,
      "last_activity": "processing task analysis"
    },
    "warnings": [],
    "missed_count": 0
  }
}
```

### 3. Health Status Levels

- **healthy**: Worker operating normally, all metrics in range
- **degraded**: Worker functional but showing warning signs (high memory, slow response)
- **unhealthy**: Worker experiencing issues (high error rate, resource exhaustion)
- **unresponsive**: No heartbeat received (detected by monitor)

## Implementation Components

### Component 1: Heartbeat Library (`scripts/lib/heartbeat.sh`)

**Purpose**: Reusable library for heartbeat emission

**Functions**:

```bash
# Initialize heartbeat tracking
init_heartbeat <worker_id>

# Emit a heartbeat with current health metrics
emit_heartbeat <worker_id> [status_message]

# Get current worker health status
get_health_status <worker_id>

# Check if heartbeat is due (30s since last)
is_heartbeat_due <worker_id>

# Calculate health score (0-100)
calculate_health_score <worker_id>
```

**Health Metrics Collected**:
- CPU usage (via `ps`)
- Memory usage (via `ps`)
- Tokens used (from Claude Code context)
- Active duration (from started_at)
- Last activity description

### Component 2: Worker Spec Schema Update

**File**: `coordination/schemas/worker-spec.schema.json`

**Changes**:
- Add optional `heartbeat` object
- Define heartbeat field types and constraints
- Allow heartbeat to be missing (backwards compatibility)

### Component 3: Worker Daemon Enhancement

**File**: `scripts/worker-daemon.sh`

**Changes**:
- Source heartbeat library
- Emit heartbeat for daemon itself every 30s
- Track daemon health

### Component 4: Heartbeat Monitor Daemon

**File**: `scripts/daemons/heartbeat-monitor-daemon.sh`

**Purpose**: Monitor all active workers for heartbeat failures

**Responsibilities**:
1. Scan active worker specs every 30 seconds
2. Check last_heartbeat timestamp
3. Calculate time since last heartbeat
4. Update missed_count in worker spec
5. Emit observability events for:
   - Heartbeat received (debug level)
   - Heartbeat warning (60s)
   - Heartbeat critical (120s)
   - Worker presumed dead (300s)
6. Update worker status based on heartbeat state
7. Trigger zombie detection (Phase 4.2)

**Detection Logic**:

```bash
current_time=$(date +%s)
last_heartbeat=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$last_hb" +%s)
time_since_hb=$((current_time - last_heartbeat))

if [ $time_since_hb -gt 300 ]; then
    # Zombie - no heartbeat for 5 minutes
    mark_as_zombie
elif [ $time_since_hb -gt 120 ]; then
    # Critical - no heartbeat for 2 minutes
    emit_critical_alert
elif [ $time_since_hb -gt 60 ]; then
    # Warning - no heartbeat for 1 minute
    emit_warning
fi
```

### Component 5: Observability Integration

**Events Emitted**:

```json
{
  "event_type": "heartbeat_warning",
  "worker_id": "worker-implementation-001",
  "task_id": "task-12345",
  "time_since_heartbeat_seconds": 75,
  "last_heartbeat": "2025-11-18T14:30:00-0600",
  "current_status": "running",
  "health_status": "healthy"
}
```

**Event Types**:
- `heartbeat_emitted` (debug)
- `heartbeat_warning` (warn)
- `heartbeat_critical` (error)
- `heartbeat_resumed` (info)
- `worker_presumed_dead` (critical)

## Success Criteria

- [x] Workers emit heartbeat every 30 seconds
- [ ] Monitor detects missing heartbeats within 60 seconds
- [ ] Health status accurately reflects worker state
- [ ] 0% false positives in heartbeat detection
- [ ] Complete observability event stream
- [ ] Backwards compatible with existing workers

## Testing Strategy

### Unit Tests (10 tests)

1. Test heartbeat emission
2. Test health status calculation
3. Test heartbeat timing (30s interval)
4. Test health score calculation
5. Test warning detection (60s)
6. Test critical detection (120s)
7. Test zombie detection (300s)
8. Test heartbeat resumption
9. Test schema validation
10. Test observability events

### Integration Tests (5 tests)

1. Test end-to-end heartbeat flow
2. Test monitor detecting failures
3. Test multiple concurrent workers
4. Test heartbeat during high load
5. Test backwards compatibility

## Future Enhancements (Phase 4.2+)

1. **Automatic Restart**: Trigger restart on critical heartbeat failure
2. **Zombie Cleanup**: Automatic cleanup of zombies detected via heartbeat
3. **Predictive Monitoring**: ML-based health degradation prediction
4. **Adaptive Thresholds**: Adjust timeouts based on worker type/load
5. **Heartbeat Aggregation**: Batch heartbeat writes for performance

## Migration Plan

**Phase 1**: Library Creation (Week 1, Day 1-2)
- Create heartbeat.sh library
- Add schema updates
- Write unit tests

**Phase 2**: Daemon Integration (Week 1, Day 3-4)
- Update worker-daemon.sh
- Create heartbeat-monitor-daemon.sh
- Add observability events

**Phase 3**: Testing & Validation (Week 1, Day 5)
- Run comprehensive test suite
- Validate on stress test
- Fix any issues

**Phase 4**: Deployment (Week 2, Day 1)
- Deploy to production
- Monitor for 24 hours
- Adjust thresholds if needed

## Related Documentation

- `REMAINING-WORK.md` - Phase 4.1 requirements
- `GOVERNANCE-ARCHITECTURE.md` - Compliance framework
- `coordination/schemas/worker-spec.schema.json` - Schema definition
- `scripts/worker-daemon.sh` - Worker launcher daemon
- `docs/observability-integration.md` - Observability system

---

**Next Steps**:
1. Create `scripts/lib/heartbeat.sh`
2. Update `coordination/schemas/worker-spec.schema.json`
3. Create `scripts/daemons/heartbeat-monitor-daemon.sh`
4. Write comprehensive test suite
5. Integrate with existing worker workflows
