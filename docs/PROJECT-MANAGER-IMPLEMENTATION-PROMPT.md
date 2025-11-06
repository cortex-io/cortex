# Project Manager Agent Implementation

## Mission Brief

Design and implement a **Project Manager (PM) Agent** that sits between the Coordinator Master and Worker agents to ensure reliable task execution, communication, and progress monitoring.

## Current System Problems

Based on health report analysis, we have critical issues:

### Worker Execution Failures
- **Success Rate**: 26.8% (11/41 workers completed)
- **Target**: 75% minimum
- **Gap**: 48.2 percentage points below threshold

### Root Causes Identified
1. **Workers start but don't execute**: Worker specs created, marked as "started", but no actual execution
2. **No progress monitoring**: Workers run for hours/days with no completion detection
3. **Zombie workers**: 26/29 failures were zombie workers killed by daemon after 19-23 hours
4. **No failure diagnostics**: Workers fail without detailed error messages or logs
5. **Communication breakdown**: Masters assign tasks but never hear back from workers
6. **Missing timeout enforcement**: Workers should timeout at 60 minutes, not run for 20+ hours

## Project Manager Requirements

### Core Responsibilities

#### 1. Task Handoff Verification
- Verify master → worker communication is received
- Confirm worker acknowledges task assignment
- Validate worker has required resources and context
- Detect when handoff fails (worker never receives task)

#### 2. Progress Monitoring
- Track worker heartbeats/check-ins (every 5-10 minutes)
- Monitor actual execution progress vs. time elapsed
- Detect stalled workers early (within 15-20 minutes, not hours)
- Log progress updates to coordination/pm-activity.jsonl

#### 3. Worker Communication Protocol
Workers must be able to communicate:
- **Task Started**: "I've received the task and begun execution"
- **Progress Update**: "I'm 30% complete, working on X, next step is Y"
- **Need More Time**: "Task is taking longer than expected, requesting 30 more minutes"
- **Need Resources**: "I need additional token allocation / cannot access required file"
- **Need Clarification**: "Task requirements unclear, need guidance on X"
- **Blocked**: "Cannot proceed due to external dependency / error"
- **Completed**: "Task finished successfully, deliverables at X"
- **Failed**: "Task failed due to error: X"

#### 4. Early Intervention
- Alert masters when workers don't check in within 15 minutes
- Escalate to coordinator when workers exceed 75% of time limit without progress
- Request additional resources/clarification on behalf of stuck workers
- Kill and restart workers that are clearly stalled
- Update health alerts when patterns emerge

#### 5. Timeout Enforcement
- Enforce `time_limit_minutes` from worker spec (currently 60 minutes)
- Send warnings at 50%, 75%, 90% of time limit
- Auto-terminate workers at 110% of time limit (grace period)
- Allow workers to request time extensions with justification

#### 6. Status Reporting
- Maintain real-time worker status dashboard data
- Generate PM activity logs for audit trail
- Update master agents on their workers' status
- Feed metrics to health monitoring system

## Architecture Design Requirements

### Data Structures

#### Worker Check-In Format
```json
{
  "worker_id": "dev-worker-ABC123",
  "timestamp": "2025-11-06T12:00:00Z",
  "status": "in_progress",
  "progress_pct": 30,
  "current_step": "Implementing feature X",
  "next_step": "Writing tests for X",
  "time_remaining_estimate": "20 minutes",
  "issues": [],
  "requests": []
}
```

#### PM Activity Log Format
```jsonl
{"timestamp":"2025-11-06T12:00:00Z","pm_id":"pm-001","event":"worker_checkin","worker_id":"dev-worker-ABC123","data":{"progress":30,"status":"healthy"}}
{"timestamp":"2025-11-06T12:15:00Z","pm_id":"pm-001","event":"missed_checkin","worker_id":"dev-worker-ABC123","action":"warning_sent"}
{"timestamp":"2025-11-06T12:30:00Z","pm_id":"pm-001","event":"worker_stalled","worker_id":"dev-worker-ABC123","action":"escalated_to_master"}
```

#### Request Format (Worker → PM → Master)
```json
{
  "request_id": "req-1234567890",
  "worker_id": "dev-worker-ABC123",
  "request_type": "need_clarification|need_time|need_resources|blocked",
  "message": "Task requirements unclear: should I implement X or Y?",
  "requested_action": "Extend time limit by 30 minutes",
  "priority": "medium",
  "created_at": "2025-11-06T12:00:00Z"
}
```

### Communication Channels

Design how these files/mechanisms will work:
- `coordination/worker-checkins/` - Worker check-in files
- `coordination/pm-requests/` - Worker requests to PM
- `coordination/pm-activity.jsonl` - PM event log
- `coordination/pm-alerts/` - Alerts to masters/coordinator

### PM Agent Lifecycle

1. **Initialization**: PM daemon starts, monitors coordination directories
2. **Worker Registration**: When worker starts, PM expects first check-in within 5 minutes
3. **Active Monitoring**: PM checks for new check-ins every 2-3 minutes
4. **Intervention**: PM takes action when issues detected
5. **Completion Tracking**: PM verifies worker completion and notifies master

## Implementation Plan Required

Provide a detailed implementation plan covering:

### Phase 1: Core PM Infrastructure (Simple)
- Basic check-in mechanism
- Timeout enforcement
- Simple progress tracking
- Manual intervention alerts

### Phase 2: Communication Protocol (Medium)
- Worker request handling
- Master notification system
- Resource allocation requests
- Clarification routing

### Phase 3: Intelligence & Automation (Advanced)
- Pattern detection (why do workers fail?)
- Auto-restart for common failures
- Predictive time estimation
- Resource optimization

## Technical Considerations

### Worker Modification
- Workers will need to be updated to send check-ins
- Add check-in logic to worker prompt templates
- Minimal overhead (should not slow down workers)

### PM Agent Type
- Should PM be a daemon or an agent?
- Daemon: Continuous monitoring, system process
- Agent: Spawned per task batch, more flexible

### Integration Points
- How does PM integrate with existing coordinator?
- How does PM feed data to dashboard?
- How does PM trigger health alerts?

## Success Metrics

The PM system should achieve:
- **Worker success rate**: 75%+ (up from 26.8%)
- **Early detection**: Stalled workers detected within 15 minutes
- **Timeout compliance**: 95%+ of workers respect time limits
- **Communication**: 100% of worker failures have detailed logs
- **Master satisfaction**: Masters receive regular status updates

## Deliverables

Create the following:

1. **Architecture Document**: Complete PM system design
2. **Data Format Specifications**: All JSON/JSONL formats
3. **Implementation Scripts**:
   - `scripts/pm-daemon.sh` - Main PM monitoring loop
   - `scripts/worker-checkin.sh` - Worker check-in helper
   - `scripts/pm-intervention.sh` - Intervention actions
4. **Worker Prompt Updates**: Add check-in instructions to worker templates
5. **Testing Plan**: How to verify PM is working
6. **Dashboard Integration**: How PM data appears on dashboard

## Constraints

- Keep it simple initially (Phase 1)
- Don't break existing worker spawning
- Must work with current coordinator architecture
- Lightweight (low resource overhead)
- Observable (clear logs and metrics)

## Questions to Address

1. How do workers check in without breaking their flow?
2. What's the minimal viable check-in frequency?
3. Should PM be a daemon or spawned agent?
4. How does PM handle 16 active workers simultaneously?
5. What happens if PM itself fails or gets stuck?
6. How do we test this without disrupting production?

---

**Your Task**: Design a comprehensive Project Manager system that solves our worker execution crisis. Provide detailed architecture, implementation plan, and all necessary specifications to bring worker success rate from 26.8% to 75%+.
