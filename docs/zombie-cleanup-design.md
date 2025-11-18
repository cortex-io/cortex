# Zombie Worker Cleanup Design
**Phase**: 4.2 - Self-Healing Implementation
**Status**: Design Draft
**Date**: 2025-11-18

---

## Overview

Building on the heartbeat system (Phase 4.1), Phase 4.2 adds automatic detection and cleanup of zombie workers - workers that have stopped responding but remain in the system.

## Objectives

1. **Automatic Detection**: Identify workers that haven't sent heartbeats for >300s
2. **Safe Termination**: Kill zombie worker processes cleanly
3. **Resource Cleanup**: Free up allocated tokens and system resources
4. **State Management**: Move zombie workers to quarantine
5. **Observability**: Log and emit events for all cleanup actions
6. **Policy-Driven**: Configurable cleanup thresholds and actions

---

## Zombie Classification

### Zombie Criteria

A worker is considered a **zombie** when:
- No heartbeat received for ≥300s (5 minutes)
- Worker status is "running" or "active"
- Worker process may or may not be alive

### Zombie Types

1. **Process Zombie**: Process died but worker spec not updated
2. **Hung Worker**: Process alive but not responding/progressing
3. **Orphaned Worker**: Process exists but disconnected from coordination

---

## Cleanup Strategy

### Detection Flow

```
Heartbeat Monitor (every 30s)
    ↓
Check heartbeat age for all active workers
    ↓
If age > 300s → Mark as zombie
    ↓
Trigger cleanup process
```

### Cleanup Actions

**Phase 1: Verification** (5s timeout)
1. Check if worker process exists (via PID)
2. Verify worker hasn't resumed (check for recent heartbeat)
3. Confirm worker is truly stuck (check logs for activity)

**Phase 2: Graceful Shutdown** (30s timeout)
1. Send SIGTERM to worker process
2. Wait up to 30s for graceful exit
3. Check if heartbeat emitter stopped
4. Verify process terminated

**Phase 3: Forced Termination** (if Phase 2 fails)
1. Send SIGKILL to worker process
2. Kill heartbeat emitter process
3. Force cleanup of any child processes

**Phase 4: State Cleanup**
1. Update worker spec status to "zombie"
2. Move worker spec to `coordination/worker-specs/zombie/`
3. Return allocated tokens to pool
4. Archive worker logs
5. Emit cleanup event

---

## Safety Mechanisms

### False Positive Prevention

1. **Grace Period**: Wait full 300s before marking as zombie
2. **Double-Check**: Verify no recent heartbeat before cleanup
3. **Process Verification**: Confirm process is truly unresponsive
4. **Logging**: Log all cleanup decisions for audit trail

### Resource Protection

1. **Token Recovery**: Return tokens to budget before cleanup
2. **Log Preservation**: Archive logs before moving worker spec
3. **Spec Backup**: Keep zombie specs for debugging
4. **Rate Limiting**: Max 5 cleanups per minute to prevent cascade

### Rollback Capability

1. **Zombie Directory**: Keep specs in `coordination/worker-specs/zombie/`
2. **Resurrection**: Allow manual revival if worker was false positive
3. **Audit Trail**: Complete log of why worker was zombified

---

## Configuration

### Cleanup Policy (`coordination/config/zombie-cleanup-policy.json`)

```json
{
  "enabled": true,
  "zombie_threshold_seconds": 300,
  "cleanup_actions": {
    "verify_timeout_seconds": 5,
    "graceful_shutdown_timeout_seconds": 30,
    "force_kill_if_graceful_fails": true,
    "archive_logs": true,
    "return_tokens": true
  },
  "safety": {
    "max_cleanups_per_minute": 5,
    "require_process_check": true,
    "double_check_heartbeat": true,
    "preserve_zombie_specs": true
  },
  "notifications": {
    "emit_observability_events": true,
    "log_cleanup_actions": true,
    "alert_on_mass_zombification": true,
    "mass_zombification_threshold": 5
  }
}
```

---

## Implementation Plan

### 1. Cleanup Library (`scripts/lib/zombie-cleanup.sh`)

**Functions**:
- `is_worker_zombie()` - Check if worker meets zombie criteria
- `verify_zombie_status()` - Double-check before cleanup
- `terminate_worker_process()` - Graceful then forced termination
- `cleanup_worker_state()` - Move spec, return tokens, archive logs
- `emit_zombie_event()` - Observability event emission

### 2. Heartbeat Monitor Integration

**Updates to `scripts/daemons/heartbeat-monitor-daemon.sh`**:
- Add zombie cleanup trigger after detection
- Implement rate limiting (max 5/minute)
- Add mass zombification detection
- Log all cleanup decisions

### 3. Worker Spec Updates

**Schema changes** (`coordination/schemas/worker-spec.schema.json`):
- Add `cleanup` object with cleanup metadata
- Add `zombie_detected_at` timestamp
- Add `cleanup_reason` field

### 4. Directory Structure

```
coordination/worker-specs/
├── active/           # Running workers
├── completed/        # Successfully finished
├── failed/           # Failed workers
├── zombie/           # Zombified workers (NEW)
│   └── YYYY-MM-DD/  # Organized by date
└── quarantine/       # Malformed specs
```

---

## Testing Strategy

### Unit Tests

1. `is_worker_zombie()` correctly identifies zombies
2. `verify_zombie_status()` prevents false positives
3. `terminate_worker_process()` handles graceful shutdown
4. `cleanup_worker_state()` properly archives and updates state
5. Token recovery works correctly
6. Rate limiting prevents cleanup storms

### Integration Tests

1. Create test zombie worker, verify auto-cleanup
2. Simulate hung worker, verify detection and termination
3. Test false positive prevention (worker resumes during grace period)
4. Verify logs are preserved during cleanup
5. Test mass zombification alerts
6. Verify token budget updated after cleanup

### Stress Tests

1. Spawn 20 workers, kill 10 randomly, verify auto-cleanup
2. Test cleanup under high load
3. Verify no resource leaks after cleanup
4. Test concurrent zombie detection and cleanup

---

## Observability

### Events Emitted

1. **worker_zombie_detected**: When zombie status confirmed
2. **zombie_cleanup_initiated**: When cleanup process starts
3. **zombie_process_terminated**: When process killed
4. **zombie_cleanup_completed**: When cleanup finishes
5. **zombie_cleanup_failed**: If cleanup encounters errors
6. **mass_zombification_alert**: If >5 zombies in 1 minute

### Metrics Tracked

- Total zombies detected (lifetime)
- Zombies cleaned up (lifetime)
- Cleanup success rate
- Average cleanup duration
- Token recovery amount
- False positive rate (zombies that resumed)

---

## Success Criteria

- [x] Heartbeat system operational (Phase 4.1 complete)
- [ ] Zombie detection accuracy >95%
- [ ] Cleanup success rate >90%
- [ ] False positive rate <5%
- [ ] Average cleanup time <60s
- [ ] No token leaks after cleanup
- [ ] All cleanup actions logged
- [ ] Mass zombification alerts functional

---

## Risks & Mitigations

### Risk 1: False Positives
**Mitigation**:
- 300s grace period
- Double-check heartbeat before cleanup
- Verify process unresponsive
- Keep zombie specs for resurrection

### Risk 2: Resource Leaks
**Mitigation**:
- Explicit token return to budget
- Log archival before cleanup
- Spec preservation in zombie directory
- Child process cleanup

### Risk 3: Cleanup Storms
**Mitigation**:
- Rate limiting (max 5/minute)
- Mass zombification alerts
- Manual intervention on cascading failures
- Circuit breaker pattern

### Risk 4: Data Loss
**Mitigation**:
- Archive all logs before cleanup
- Preserve zombie specs indefinitely
- Complete audit trail
- Recovery procedures documented

---

## Phase 4.2 Deliverables

1. **Zombie cleanup library** (`scripts/lib/zombie-cleanup.sh`)
2. **Enhanced heartbeat monitor** (with cleanup integration)
3. **Cleanup policy configuration** (`coordination/config/zombie-cleanup-policy.json`)
4. **Zombie directory structure** (`coordination/worker-specs/zombie/`)
5. **Unit tests** (10+ tests for cleanup functions)
6. **Integration test** (end-to-end zombie detection and cleanup)
7. **Documentation** (this design doc + cleanup runbook)

---

## Timeline

- **Day 1**: Design (this document) + cleanup library
- **Day 2**: Heartbeat monitor integration + configuration
- **Day 3**: Testing (unit + integration) + validation
- **Day 4**: Documentation + stress testing

**Total**: 4 days → Phase 4.2 complete

---

## Related Documentation

- `docs/heartbeat-system-design.md` - Phase 4.1 design
- `IMPLEMENTATION-STATUS.md` - Overall project status
- `coordination/schemas/worker-spec.schema.json` - Worker spec schema

---

**Status**: Ready for Implementation
**Next Step**: Create zombie cleanup library
