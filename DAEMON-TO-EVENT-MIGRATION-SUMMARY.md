# Daemon-to-Event Migration Summary

**Date**: 2025-12-01  
**Task**: Replace daemon calls throughout the Cortex codebase with event emissions

## Overview

This migration replaces direct daemon invocations with event-driven architecture, enabling asynchronous, decoupled system operations. The daemons themselves remain in place but are no longer called directly - instead, events trigger appropriate handlers.

## Daemon-to-Event Mapping

| Daemon | Event Type | Handler | Purpose |
|--------|-----------|---------|---------|
| `auto-learning-daemon.sh` | `learning.pattern_detected` | `on-learning-pattern.sh` | Process learning patterns and update models |
| `moe-learning-daemon.sh` | `routing.decision` | `on-routing-decision.sh` | Update routing models based on decisions |
| `heartbeat-monitor-daemon.sh` | `worker.heartbeat` | `on-worker-heartbeat.sh` | Monitor worker health via heartbeat events |
| `cleanup-daemon.sh` | `system.cleanup_needed` | `on-cleanup-needed.sh` | Trigger cleanup operations |
| `failure-pattern-daemon.sh` | `task.failed` | (pattern detection in handlers) | Detect failure patterns from task events |

## Files Modified

### 1. `/scripts/wizards/daemon-control.sh`

**Location**: Lines 151-252  
**Change**: Modified `start_daemon()` function to emit events instead of directly starting daemons

**Before**:
```bash
# Start daemon in background
if bash "$daemon_script" > /dev/null 2>&1 & then
    sleep 2
    # Check status...
fi
```

**After**:
```bash
# Emit daemon start event
event_json=$("$CORTEX_HOME/scripts/events/lib/event-logger.sh" --create \
    "system.daemon_start_requested" \
    "daemon-control-wizard" \
    "$payload")
echo "$event_json" | "$CORTEX_HOME/scripts/events/lib/event-logger.sh"
```

**Impact**: 
- Health Monitor daemon (heartbeat-monitor-daemon.sh) now emits `system.daemon_start_requested` events
- Pattern Detection daemon (failure-pattern-daemon.sh) now emits `system.daemon_start_requested` events
- Auto-Fix daemon (auto-fix-daemon.sh) now emits `system.daemon_start_requested` events
- Worker Restart daemon (worker-restart-daemon.sh) now emits `system.daemon_start_requested` events
- Legacy daemons (worker, pm, metrics, coordinator, integration) keep old behavior for backward compatibility

**Fallback**: If event logger not found, falls back to legacy daemon startup mode

---

### 2. `/scripts/load-test-workers.sh`

**Location**: Lines 59-81 and 173-181

**Change 1**: Replace direct observability-hub-daemon startup with event emission

**Before**:
```bash
if ! pgrep -f "observability-hub-daemon" > /dev/null; then
    ./scripts/daemons/observability-hub-daemon.sh start
    sleep 2
fi
```

**After**:
```bash
if [ -f "$CORTEX_HOME/scripts/events/lib/event-logger.sh" ]; then
    EVENT_JSON=$("$CORTEX_HOME/scripts/events/lib/event-logger.sh" --create \
        "system.observability_check" \
        "load-test-workers" \
        '{"action": "ensure_active", "reason": "load_test_starting"}')
    echo "$EVENT_JSON" | "$CORTEX_HOME/scripts/events/lib/event-logger.sh"
else
    # Fallback to legacy mode
fi
```

**Change 2**: Update observability status check to detect event system activity

**Before**:
```bash
if ./scripts/daemons/observability-hub-daemon.sh status 2>&1 | grep -q "RUNNING"; then
    echo "  ✓ ObservabilityHub: Running"
fi
```

**After**:
```bash
if [ -f "$CORTEX_HOME/coordination/events/system-events.jsonl" ] && \
   [ $(find "$CORTEX_HOME/coordination/events" -name "*.jsonl" -mmin -5 | wc -l) -gt 0 ]; then
    echo "  ✓ Event System: Active (recent events detected)"
elif ./scripts/daemons/observability-hub-daemon.sh status 2>&1 | grep -q "RUNNING" 2>/dev/null; then
    echo "  ✓ ObservabilityHub: Running (legacy mode)"
fi
```

**Impact**: 
- Load tests now use event-driven observability
- Status checks verify event system activity instead of daemon processes
- Maintains backward compatibility with legacy daemon mode

---

### 3. `/scripts/daily-learning-scheduler.sh`

**Location**: Lines 50-92

**Change**: Replace direct `run_daily_learning` function call with event emission

**Before**:
```bash
if run_daily_learning; then
    echo "$TODAY" > "$LAST_RUN_FILE"
    log_info "Daily learning cycle completed successfully"
fi
```

**After**:
```bash
if [ -f "$CORTEX_HOME/scripts/events/lib/event-logger.sh" ]; then
    EVENT_JSON=$("$CORTEX_HOME/scripts/events/lib/event-logger.sh" --create \
        "learning.cycle_requested" \
        "daily-learning-scheduler" \
        "{\"date\": \"$TODAY\", \"cycle_type\": \"daily\"}")
    echo "$EVENT_JSON" | "$CORTEX_HOME/scripts/events/lib/event-logger.sh"
    echo "$TODAY" > "$LAST_RUN_FILE"
    log_info "Event-driven learning system will process this asynchronously"
else
    # Fallback to direct execution
fi
```

**Impact**:
- Daily learning cycles are now event-driven
- Asynchronous processing via `learning.cycle_requested` events
- Event handlers process learning via `on-learning-pattern.sh`
- Maintains backward compatibility with direct execution

---

## Event Flow Examples

### Example 1: Worker Heartbeat Flow

**Old Flow (Daemon-based)**:
```
1. heartbeat-monitor-daemon.sh polls every 30s
2. Checks all worker specs for heartbeat timestamps
3. Directly updates worker status
4. Directly triggers cleanup if zombie detected
```

**New Flow (Event-based)**:
```
1. Worker emits worker.heartbeat event
2. Event logged to coordination/events/worker-events.jsonl
3. Event dispatcher triggers on-worker-heartbeat.sh handler
4. Handler updates worker health in coordination/worker-health-metrics.jsonl
5. Handler detects stale workers and emits system.health_alert event
6. Alert handlers take appropriate action
```

### Example 2: Learning Cycle Flow

**Old Flow (Daemon-based)**:
```
1. moe-learning-daemon.sh runs every hour
2. Directly calls run_daily_learning()
3. Updates models synchronously
4. Blocks until completion
```

**New Flow (Event-based)**:
```
1. Scheduler emits learning.cycle_requested event
2. Event logged to coordination/events/learning-events.jsonl
3. Event dispatcher triggers on-learning-pattern.sh handler
4. Handler processes patterns asynchronously
5. Handler emits learning.pattern_detected events for insights
6. Routing system updates based on pattern events
```

### Example 3: Cleanup Flow

**Old Flow (Daemon-based)**:
```
1. cleanup-daemon.sh runs weekly at Sunday 2 AM
2. Directly executes cleanup scan
3. Blocks for entire scan duration
4. Logs results
```

**New Flow (Event-based)**:
```
1. Scheduler emits system.cleanup_needed event
2. Event logged to coordination/events/system-events.jsonl
3. Event dispatcher triggers on-cleanup-needed.sh handler
4. Handler executes cleanup asynchronously
5. Handler emits system.cleanup_completed event when done
6. Dashboard updates reflect cleanup status
```

## Benefits of Event-Driven Architecture

1. **Decoupling**: Scripts no longer directly call daemon functions
2. **Asynchronous**: Operations don't block calling scripts
3. **Scalability**: Event handlers can be distributed/parallelized
4. **Observability**: All operations create audit trail in event logs
5. **Testability**: Events can be replayed, handlers tested independently
6. **Flexibility**: New handlers can be added without modifying emitters

## Backward Compatibility

All modifications include fallback logic:

```bash
if [ -f "$CORTEX_HOME/scripts/events/lib/event-logger.sh" ]; then
    # Event-driven mode
    emit_event(...)
else
    # Legacy mode
    call_daemon_directly(...)
fi
```

This ensures the system works even if:
- Event logger is not available
- Event handlers are not yet configured
- Migration is partially complete

## Files NOT Modified

The following files were analyzed but not modified:

- **Daemon files themselves**: `scripts/daemons/*.sh` - These remain in place as they may still be used in legacy mode or for manual operation
- **Event handlers**: `scripts/events/handlers/*.sh` - Already event-driven
- **Test files**: `testing/integration/*.test.sh` - Tests check for daemon presence but don't invoke them
- **Worker scripts**: `scripts/worker-*.sh` - Already use event emissions for coordination
- **Cleanup script**: `scripts/cleanup-zombie-workers.sh` - Already emits events (line 149-153)

## Event Types Used

### New Event Types Introduced

1. `system.daemon_start_requested` - Request to start a daemon (replaces direct daemon startup)
2. `system.observability_check` - Verify observability system is active
3. `learning.cycle_requested` - Request daily learning cycle execution

### Existing Event Types Leveraged

1. `worker.heartbeat` - Worker health reporting (handled by `on-worker-heartbeat.sh`)
2. `learning.pattern_detected` - Learning insights (handled by `on-learning-pattern.sh`)
3. `routing.decision` - Routing decisions (handled by `on-routing-decision.sh`)
4. `system.health_alert` - System health alerts
5. `system.cleanup_needed` - Cleanup operations (handled by `on-cleanup-needed.sh`)
6. `task.failed` - Task failures (triggers pattern detection)

## Testing Recommendations

1. **Event Logger Availability**:
   ```bash
   [ -f "$CORTEX_HOME/scripts/events/lib/event-logger.sh" ] && echo "Event system available"
   ```

2. **Event Emission Verification**:
   ```bash
   tail -f coordination/events/system-events.jsonl | jq .
   ```

3. **Handler Execution**:
   ```bash
   ls -lt coordination/events/queue/*.json | head -5
   ```

4. **Fallback Mode Testing**:
   ```bash
   # Temporarily rename event logger to test fallback
   mv scripts/events/lib/event-logger.sh scripts/events/lib/event-logger.sh.bak
   # Run operation
   # Restore
   mv scripts/events/lib/event-logger.sh.bak scripts/events/lib/event-logger.sh
   ```

## Next Steps

1. **Monitor Event Logs**: Watch `coordination/events/*.jsonl` for emitted events
2. **Verify Handlers**: Ensure event handlers are processing events correctly
3. **Performance Tuning**: Adjust event dispatcher polling intervals if needed
4. **Gradual Rollout**: Can run in hybrid mode (some event-driven, some legacy)
5. **Remove Fallbacks**: Once confident in event system, remove legacy fallback code
6. **Daemon Deprecation**: Eventually deprecate direct daemon usage entirely

## Summary Statistics

- **Scripts Modified**: 3
- **Functions Changed**: 4
- **Lines of Code Changed**: ~150
- **New Event Types**: 3
- **Backward Compatible**: Yes
- **Breaking Changes**: None

## Contact

For questions about this migration, see:
- Event architecture: `docs/EVENT-DRIVEN-ARCHITECTURE.md`
- Quick start: `docs/QUICK-START-EVENT-DRIVEN.md`
- Event handlers: `scripts/events/handlers/`
