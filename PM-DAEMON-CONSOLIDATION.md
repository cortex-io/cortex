# PM Daemon Consolidation Analysis

**Date**: 2025-11-27
**Phase**: Phase 2, Task 5
**Objective**: Consolidate PM daemon functionality into worker-daemon

## Executive Summary

This document details the consolidation of the PM (Project Manager) daemon into worker-daemon, reducing daemon complexity while preserving all critical monitoring and management functionality.

---

## Current Architecture Analysis

### PM Daemon (`pm-daemon.sh`)
**Purpose**: Project Manager - Monitors workers and ensures task completion
**Lines of Code**: 818 lines
**Key Responsibilities**:

1. **Worker Monitoring**
   - Scans active worker specs for newly started workers
   - Registers workers with PM state
   - Tracks worker lifecycle (registered, running, completed, failed)

2. **Health Checking**
   - Processes worker check-in files
   - Tracks last check-in times and progress percentages
   - Detects missed check-ins (late @ 15min, stalled @ 20min)
   - Updates health state (healthy, late, stalled)

3. **Timeout Management**
   - Monitors time-to-live (TTL) for each worker
   - Issues progressive warnings at 50%, 75%, 90% time used
   - Enforces hard timeout at 110% of time limit

4. **Zombie Detection**
   - Identifies workers marked as "running" with no process
   - Creates health alerts when threshold exceeded (10+ zombies)
   - Logs incidents via health incident system

5. **Metrics & State Management**
   - Calculates worker statistics (active, completed, failed, zombie counts)
   - Maintains PM state file (`pm-state.json`)
   - Tracks success rates (all-time and daily)
   - Updates workforce-streams.json for dashboard

6. **Historical Snapshots**
   - Creates hourly snapshots of metrics
   - Aggregates daily metrics from hourly data
   - Cleans up snapshots older than 7 days
   - Tracks token budget and task queue status

7. **Activity Logging**
   - Maintains JSONL activity log for all PM events
   - Logs worker state transitions
   - Records check-ins, timeouts, zombie detection

### Existing Daemons
- **worker-restart-daemon.sh** (343 lines): Processes restart queue, executes restarts
- **heartbeat-monitor-daemon.sh** (287 lines): Monitors heartbeats, detects failures
- Both already specialized and focused

### daemon-control.sh
- Currently only manages worker-daemon
- No PM daemon management
- Will remain the primary control interface

---

## Functionality Overlap Analysis

### With worker-restart-daemon
- **PM**: Detects zombie workers
- **worker-restart**: Executes restarts
- **Overlap**: No functional overlap - complementary functions
- **Decision**: Keep worker-restart-daemon independent

### With heartbeat-monitor-daemon
- **PM**: Detects missed check-ins (15min late, 20min stalled)
- **heartbeat-monitor**: Detects missing heartbeats (60s warning, 120s critical, 300s zombie)
- **Overlap**: Both monitor worker health but at different scales and with different timeout thresholds
- **Decision**: Consolidate PM check-in logic into heartbeat-monitor OR integrate with worker-daemon for redundancy

### With daemon-control.sh
- **PM**: Runs as independent daemon process
- **daemon-control**: Manages worker-daemon lifecycle
- **Overlap**: Process management patterns
- **Decision**: Use same PID file and control patterns as worker-daemon

---

## Consolidation Strategy

### Phase 1: Create Enhanced worker-daemon
Merge PM functionality into worker-daemon with clear subsystems:

1. **Worker Monitoring Subsystem**
   - Scan active worker specs
   - Register new workers
   - Update worker state

2. **Health Check Subsystem**
   - Process check-ins
   - Calculate health state
   - Detect missed check-ins

3. **Timeout Subsystem**
   - Calculate time-used percentage
   - Issue progressive warnings
   - Track hard timeouts

4. **Zombie Detection Subsystem**
   - Detect workers with no process
   - Create health alerts
   - Log incidents

5. **Metrics & State Subsystem**
   - Calculate all metrics
   - Maintain state file
   - Update dashboard data

6. **Snapshot Subsystem**
   - Create hourly snapshots
   - Aggregate daily metrics
   - Cleanup old snapshots

### Phase 2: Update daemon-control.sh
- Already focused on worker-daemon
- No changes needed for PM support

### Phase 3: Remove PM Daemon Files
Files to remove:
- `/scripts/pm-daemon.sh` (818 lines)
- `/scripts/start-pm-daemon.sh` (55 lines)
- `/scripts/health-check-pm-daemon.sh` (145 lines)
- Related PM files in `/scripts/` directory

Total lines removed: ~1018 lines

### Phase 4: Update References
- Check all startup scripts for PM daemon references
- Update documentation
- Update health incident logging if needed

---

## Consolidation Plan

### What Gets Added to worker-daemon
1. Full PM state initialization
2. Worker registration and monitoring
3. Check-in processing
4. Timeout monitoring
5. Zombie detection with health alerts
6. Metrics calculation
7. Snapshot creation and aggregation

### What Stays Separate
- **heartbeat-monitor-daemon**: Different timeout thresholds, operates at 30-second granularity
- **worker-restart-daemon**: Handles restart queue execution
- **daemon-control.sh**: Already supports worker-daemon

### Configuration Changes
PM daemon config becomes worker-daemon config:
- `PM_LOOP_INTERVAL` → part of worker-daemon loop
- `SNAPSHOT_INTERVAL` → worker-daemon interval
- `pm-state.json` → part of worker-daemon state management
- `pm-activity.jsonl` → part of worker-daemon activity log

---

## Testing Strategy

### Pre-Consolidation Tests
1. Run PM daemon in test mode: `pm-daemon.sh --test-mode`
2. Verify state file creation
3. Verify metric calculations
4. Verify check-in processing

### Post-Consolidation Tests
1. Test worker-daemon with PM subsystems enabled
2. Verify state file creation and updates
3. Verify metrics are calculated correctly
4. Verify check-in processing works
5. Verify zombie detection alerts are created
6. Verify snapshots are created hourly
7. Verify dashboard data updates work

### Health Checks
1. Verify no duplicate monitoring (PM vs heartbeat)
2. Verify timeout thresholds don't conflict
3. Verify zombie detection doesn't interfere with restart logic
4. Verify state file integrity

---

## Risk Mitigation

### Risks
1. **Loss of PM functionality**: Mitigated by comprehensive testing
2. **Timeout confusion**: Kept PM and heartbeat timeouts separate (different thresholds)
3. **State file conflicts**: Worker-daemon uses single source of truth
4. **Zombie detection conflicts**: Integrated into single monitoring loop

### Rollback Plan
1. Keep pm-daemon.sh backed up for 30 days
2. If issues found, can restore PM daemon quickly
3. Worker-daemon designed to be modular for easy disabling of PM subsystems

---

## Files Modified/Created/Deleted

### Modified
- `scripts/daemons/worker-daemon.sh` - Add PM monitoring subsystems
- (No changes needed to `scripts/daemon-control.sh`)

### Created
- `PM-DAEMON-CONSOLIDATION.md` - This document

### Deleted
- `scripts/pm-daemon.sh`
- `scripts/start-pm-daemon.sh`
- `scripts/health-check-pm-daemon.sh`

---

## Implementation Notes

### Worker-Daemon Enhancement
The enhanced worker-daemon will:
1. Include all PM monitoring functions as subsystems
2. Maintain backward compatibility with existing functionality
3. Use modular design for easy subsystem toggling
4. Keep PM and heartbeat monitoring separate (different timeouts)
5. Preserve all metric calculations
6. Support historical snapshot creation

### Daemon Control
`daemon-control.sh` requires no changes:
- Already manages worker-daemon
- Already supports status, start, stop, restart, install, uninstall
- Already logs PM status in worker-daemon logs

---

## Success Criteria

- [x] PM daemon functionality identified
- [ ] PM functionality integrated into worker-daemon
- [ ] daemon-control.sh verified to work with new worker-daemon
- [ ] pm-daemon.sh, start-pm-daemon.sh, health-check-pm-daemon.sh removed
- [ ] No regression in monitoring or alerting
- [ ] Tests pass: worker-daemon handles all PM responsibilities
- [ ] Documentation updated

---

## Timeline

- Analysis: COMPLETE
- Implementation: In Progress
- Testing: Pending
- Cleanup: Pending
- Documentation: Pending

---

## Related Systems

### Heartbeat Monitor
- Operates at 30-second granularity
- Detects missing heartbeats (60s, 120s, 300s thresholds)
- Marks zombies after 300s no heartbeat
- Independent of PM daemon

### Worker Restart
- Processes restart queue
- Executes restarts for failed/zombie workers
- Manages circuit breakers
- Independent of PM daemon

### Observability Hub
- Receives events from all daemons
- Broadcasts to dashboard via WebSocket
- Updates workforce metrics
- No changes needed

---

## Appendix A: PM Daemon Functions

### Core Functions
1. `log_pm()` - PM-specific logging
2. `log_pm_event()` - Event logging with JSONL format
3. `initialize_pm_state()` - Create/initialize pm-state.json
4. `save_pm_state()` - Update state file and send to dashboard
5. `calculate_age_minutes()` - Date calculation helper
6. `register_worker()` - Add worker to monitoring
7. `scan_active_workers()` - Find new workers to monitor
8. `process_checkins()` - Handle worker check-in files
9. `update_worker_checkin()` - Update worker state from check-in
10. `check_missed_checkins()` - Detect late/stalled workers
11. `check_worker_timeouts()` - Monitor time limits
12. `detect_zombies()` - Find workers with no process
13. `calculate_metrics()` - Compute statistics
14. `create_snapshot()` - Create hourly metric snapshot
15. `aggregate_daily_snapshot()` - Summarize daily metrics
16. `cleanup_old_snapshots()` - Remove old hourly snapshots

### Configuration
- `PM_LOOP_INTERVAL`: 180 seconds (3 minutes)
- `SNAPSHOT_INTERVAL`: 300 seconds (5 minutes)
- `checkin_timeout_minutes`: 15 (mark late)
- `stall_timeout_minutes`: 20 (mark stalled)
- `timeout_grace_pct`: 110 (hard limit)

