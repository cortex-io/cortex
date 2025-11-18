# Worker Failure Runbook

## Overview

This runbook provides step-by-step procedures for diagnosing and resolving worker failures in the Commit-Relay system.

**Severity**: HIGH
**Estimated Resolution Time**: 5-15 minutes
**Owner**: DevOps/SRE Team

---

## Symptoms

### Observable Indicators

- Worker stuck in "running" state with no progress
- Worker marked as "zombie" in worker pool
- Worker process consuming 100% CPU but not completing
- Worker heartbeats stopped (>5 minutes since last heartbeat)
- Worker logs show errors or exceptions
- Task assigned to worker is not progressing

### Error Messages

```
Worker worker-implementation-001 has not sent heartbeat for 300s
Worker worker-scan-002 failed with exit code 1
Worker zombie detected: worker-analysis-003
Heartbeat critical: worker missed 4 consecutive heartbeats
```

### Metrics/Alerts

- `heartbeat_missed_count` > 4
- `worker_health_score` < 50
- Worker in zombie state for >5 minutes
- Pattern detection alert: recurring worker failures

---

## Diagnosis

### Step 1: Identify Failed Worker

```bash
# List all worker specs to find problematic workers
ls -la coordination/worker-specs/active/

# Check worker spec for details
cat coordination/worker-specs/active/worker-<ID>.json | jq .

# Check heartbeat status
cat coordination/worker-specs/active/worker-<ID>.json | jq '.heartbeat'
```

### Step 2: Check Worker Logs

```bash
# View worker logs
tail -n 100 agents/logs/workers/<date>/worker-<ID>/worker.log

# Search for errors
grep -i "error" agents/logs/workers/<date>/worker-<ID>/worker.log

# Check for exceptions
grep -i "exception" agents/logs/workers/<date>/worker-<ID>/worker.log
```

### Step 3: Check Process Status

```bash
# Get worker PID from spec
PID=$(cat coordination/worker-specs/active/worker-<ID>.json | jq -r '.pid')

# Check if process is running
ps -p $PID

# Check CPU/memory usage
ps -p $PID -o pid,ppid,%cpu,%mem,etime,command

# Check for zombie processes
ps aux | grep defunct
```

### Step 4: Check Recent Events

```bash
# Check observability events for this worker
grep "worker-<ID>" coordination/dashboard-events.jsonl | tail -n 20

# Check for heartbeat events
grep "heartbeat" coordination/dashboard-events.jsonl | grep "worker-<ID>"

# Check for zombie detection events
grep "zombie" coordination/dashboard-events.jsonl | grep "worker-<ID>"
```

### Step 5: Determine Root Cause

Common failure patterns:

| Symptom | Likely Cause | Next Step |
|---------|--------------|-----------|
| High CPU, no progress | Infinite loop or stuck operation | Investigate code, kill worker |
| Out of memory | Resource exhaustion | Check logs, increase memory limit |
| Heartbeat stopped | Worker crashed | Check logs for crash reason |
| Timeout | Long-running task | Check task complexity, extend timeout |
| API errors | External service failure | Check service status, retry |
| File I/O errors | Permission or disk issues | Check permissions, disk space |

---

## Resolution

### Immediate Mitigation

#### Option 1: Let Self-Healing Handle It (Recommended)

If self-healing is enabled (Phase 4), the system will automatically:

1. Detect zombie worker (after 300s of missed heartbeats)
2. Terminate worker process
3. Cleanup worker state and logs
4. Recover token budget
5. Attempt worker restart (with exponential backoff)

**Monitor self-healing:**

```bash
# Watch pattern detection daemon logs
tail -f agents/logs/system/failure-pattern-daemon.log

# Watch worker restart daemon logs
tail -f agents/logs/system/worker-restart-daemon.log

# Check auto-fix suggestions
cat coordination/auto-fix/fix-history.jsonl | jq .
```

#### Option 2: Manual Intervention

If self-healing is not enabled or failed:

```bash
# Kill zombie worker
./scripts/cleanup-zombie-workers.sh worker-<ID>

# Check cleanup was successful
ls coordination/worker-specs/active/ | grep worker-<ID>
# Should not exist

ls coordination/worker-specs/zombie/ | grep worker-<ID>
# Should exist with cleanup metadata
```

### Root Cause Remediation

Based on failure type:

#### Resource Exhaustion (OOM)

```bash
# Check auto-fix suggestions for memory increase
cat coordination/auto-fix/fix-history.jsonl | jq '.[] | select(.pattern_id | contains("oom"))'

# Manually increase memory limit in worker template
vim coordination/worker-specs/templates/<worker-type>.json
# Update: "memory_limit": "3072MB"

# Restart worker with new limits
./scripts/wizards/create-worker.sh
```

#### Timeout Issues

```bash
# Increase timeout in worker spec template
vim coordination/worker-specs/templates/<worker-type>.json
# Update: "timeout_minutes": 60

# Or increase via auto-fix
# Auto-fix will suggest timeout increase if pattern detected
```

#### Code Issues (Infinite Loop, Exception)

```bash
# Review worker logs for stack traces
tail -n 200 agents/logs/workers/<date>/worker-<ID>/worker.log

# Check for pattern in failure detection
cat coordination/patterns/failure-patterns.jsonl | \
  jq 'select(.category == "systemic")'

# If recurring issue, escalate to development team
# Document in coordination/health-alerts.json
```

#### External Service Failure

```bash
# Check external service status
# (depends on service - API, database, git, etc.)

# Enable retry with backoff (auto-fix may suggest this)
# Or wait for service recovery and retry task

# Requeue task
# Update task status to "queued" in coordination/task-queue.json
```

### Verification

After resolution:

```bash
# 1. Verify worker is cleaned up
ls coordination/worker-specs/active/ | grep -c worker-
# Count should be reduced

# 2. Verify token budget recovered
cat coordination/token-budget.json | jq '.available'
# Should show recovered tokens

# 3. Check for new worker spawn (if auto-restart enabled)
ls coordination/worker-specs/active/ | tail -5

# 4. Monitor system health
./scripts/dashboards/system-live.sh
# Check for worker status

# 5. Verify no new alerts
cat coordination/health-alerts.json | jq '.alerts[-5:]'
```

---

## Prevention

### Monitoring Recommendations

1. **Enable heartbeat monitoring** (Phase 4.1)
   - Ensures worker health is tracked every 30s
   - Detects failures within 2 minutes

2. **Enable failure pattern detection** (Phase 4.4)
   - Identifies recurring failure patterns
   - Suggests fixes automatically

3. **Enable auto-fix framework** (Phase 4.5)
   - Applies fixes for known patterns
   - Reduces manual intervention

4. **Set up alerts for:**
   - Worker health score < 70
   - Missed heartbeats > 2
   - Zombie worker count > 0
   - Token budget < 20%

### Configuration Improvements

```bash
# Adjust heartbeat thresholds (if too sensitive)
vim coordination/config/heartbeat-policy.json

# Adjust zombie cleanup thresholds
vim coordination/config/zombie-cleanup-policy.json

# Adjust worker restart policy
vim coordination/config/worker-restart-policy.json

# Review and update worker timeouts
vim coordination/worker-specs/templates/*.json
```

### Process Changes

1. **Regular health checks** - Run daily operations checklist
2. **Token budget monitoring** - Alert at 30% remaining
3. **Pattern review** - Weekly review of detected patterns
4. **Worker template updates** - Update templates based on learnings
5. **Load testing** - Periodic stress tests to identify limits

---

## Related Runbooks

- [Daemon Failure](./daemon-failure.md) - If self-healing daemons fail
- [Token Budget Exhaustion](./token-budget-exhaustion.md) - If cleanup doesn't recover tokens
- [Self-Healing System](./self-healing-system.md) - Understanding auto-recovery
- [Emergency Recovery](./emergency-recovery.md) - System-wide failures

---

## Escalation Path

1. **Tier 1**: Self-healing system (automatic)
2. **Tier 2**: On-call SRE (manual cleanup)
3. **Tier 3**: Development team (code fixes)
4. **Tier 4**: Architecture team (system redesign)

**Escalate to Tier 3 if:**
- Same worker fails repeatedly (>3 times)
- Auto-fix doesn't resolve issue
- Pattern indicates code bug
- Resource limits need significant increase

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

## Quick Reference

### Common Commands

```bash
# List all workers
./scripts/worker-status.sh

# Check specific worker
cat coordination/worker-specs/active/worker-<ID>.json | jq .

# Kill zombie worker
./scripts/cleanup-zombie-workers.sh worker-<ID>

# View worker logs
tail -n 100 agents/logs/workers/<date>/worker-<ID>/worker.log

# Monitor system
./scripts/dashboards/system-live.sh

# Control daemons
./scripts/wizards/daemon-control.sh
```

### Decision Tree

```
Worker failure detected
├─ Is self-healing enabled?
│  ├─ Yes → Wait 5 minutes, check if resolved
│  │  ├─ Resolved → Monitor and log
│  │  └─ Not resolved → Manual intervention (Step 2)
│  └─ No → Manual intervention (Step 2)
│
├─ Manual cleanup (Step 2)
│  ├─ Cleanup successful?
│  │  ├─ Yes → Root cause analysis (Step 3)
│  │  └─ No → Escalate to Tier 2
│  │
│  └─ Root cause analysis (Step 3)
│     ├─ Resource issue → Increase limits
│     ├─ Code issue → Escalate to Tier 3
│     ├─ External service → Wait and retry
│     └─ Unknown → Escalate to Tier 3
```

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
