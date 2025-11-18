# Emergency Recovery Runbook

## Overview

Critical procedures for recovering from system-wide failures in Commit-Relay. Use this runbook when normal troubleshooting procedures fail or when facing catastrophic system issues.

**Severity**: CRITICAL
**Estimated Recovery Time**: 15-60 minutes
**Owner**: DevOps/SRE/Architecture Team
**Approval Required**: Yes (for destructive operations)

---

## When to Use This Runbook

Use this runbook when experiencing:

- Complete system failure (all daemons down)
- Widespread data corruption
- Unrecoverable token budget state
- Cascading failures across all workers
- System completely unresponsive
- Need to restore from backup
- Rollback from bad deployment

**DO NOT** use for routine failures - see other runbooks first.

---

## Emergency Severity Levels

### Level 1: Service Degradation
- Some components failing
- System partially operational
- Use component-specific runbooks first

### Level 2: Service Outage
- Major components down
- No new work can be processed
- Existing work may complete
- **Use this runbook**

### Level 3: Complete Failure
- All systems down
- Data corruption suspected
- Immediate escalation required
- **Use this runbook + escalate**

---

## Pre-Recovery Checklist

Before taking recovery actions:

```bash
# 1. Document current state
echo "=== Emergency Recovery - $(date) ===" > /tmp/recovery-log.txt

# 2. Capture system snapshot
tar -czf /tmp/commit-relay-snapshot-$(date +%Y%m%d-%H%M%S).tar.gz \
    coordination/ \
    agents/logs/system/ \
    /tmp/commit-relay-*.pid \
    2>> /tmp/recovery-log.txt

# 3. Check daemon status
echo "Daemon Status:" >> /tmp/recovery-log.txt
ps aux | grep "daemon" | grep -v grep >> /tmp/recovery-log.txt

# 4. Check disk space
df -h >> /tmp/recovery-log.txt

# 5. Check critical files exist
ls -la coordination/*.json >> /tmp/recovery-log.txt
```

---

## Recovery Procedures

### Procedure 1: Emergency Shutdown

**When**: System exhibiting erratic behavior, data corruption suspected

```bash
# Step 1: Stop all daemons IMMEDIATELY
echo "Stopping all daemons..."
pkill -f "commit-relay.*daemon"
pkill -f "worker-daemon"
pkill -f "pm-daemon"
pkill -f "heartbeat-monitor"

# Verify all stopped
ps aux | grep daemon

# Step 2: Stop all workers
echo "Stopping all workers..."
for pidfile in coordination/worker-specs/active/*.json; do
    pid=$(jq -r '.pid // ""' "$pidfile")
    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        kill -TERM "$pid"
    fi
done

# Force kill after 30s
sleep 30
for pidfile in coordination/worker-specs/active/*.json; do
    pid=$(jq -r '.pid // ""' "$pidfile")
    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        kill -KILL "$pid"
    fi
done

# Step 3: Verify clean shutdown
ps aux | grep -E "worker-|commit-relay" | grep -v grep
# Should show nothing

# Step 4: Create emergency marker
touch /tmp/commit-relay-emergency-shutdown
echo "Emergency shutdown completed at $(date)" > /tmp/commit-relay-emergency-shutdown
```

### Procedure 2: System State Reset

**When**: State files corrupted or inconsistent

**WARNING**: This will clear all running state. Workers will be lost.

```bash
# Step 1: Backup current state
echo "Backing up current state..."
mkdir -p /tmp/commit-relay-backup-$(date +%Y%m%d-%H%M%S)/
cp -r coordination/ /tmp/commit-relay-backup-$(date +%Y%m%d-%H%M%S)/

# Step 2: Reset orchestrator state
echo "Resetting orchestrator state..."
cat > coordination/orchestrator/state/current.json <<EOF
{
  "phase": "idle",
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Step 3: Reset PM state
echo "Resetting PM state..."
cat > coordination/pm-state.json <<EOF
{
  "active_workers": [],
  "last_check": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Step 4: Clear worker pool
echo "Clearing worker pool..."
cat > coordination/worker-pool.json <<EOF
{
  "workers": [],
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Step 5: Reset task queue (CAREFUL - loses tasks!)
read -p "Reset task queue? This will LOSE all queued tasks! (yes/no): " confirm
if [ "$confirm" = "yes" ]; then
    cat > coordination/task-queue.json <<EOF
{
  "tasks": [],
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    echo "Task queue reset"
else
    echo "Task queue preserved"
fi

# Step 6: Archive all active workers
echo "Archiving active workers..."
mkdir -p coordination/worker-specs/emergency-archived/
mv coordination/worker-specs/active/*.json coordination/worker-specs/emergency-archived/ 2>/dev/null || true

# Step 7: Verify state reset
ls -la coordination/orchestrator/state/
ls -la coordination/worker-specs/active/
# active/ should be empty
```

### Procedure 3: Token Budget Reset

**When**: Token budget completely corrupted or accounting errors

**WARNING**: Requires approval. Changes budget allocation.

```bash
# Step 1: Backup current budget
cp coordination/token-budget.json coordination/token-budget.json.backup-$(date +%Y%m%d-%H%M%S)

# Step 2: Calculate actual token usage
total_allocated=0

for spec in coordination/worker-specs/active/*.json coordination/worker-specs/zombie/*.json; do
    allocated=$(jq -r '.token_budget.allocated // 0' "$spec" 2>/dev/null)
    total_allocated=$((total_allocated + allocated))
done

echo "Actual tokens allocated: $total_allocated"

# Step 3: Reset budget
read -p "Reset token budget to total: 100000, used: $total_allocated? (yes/no): " confirm
if [ "$confirm" = "yes" ]; then
    cat > coordination/token-budget.json <<EOF
{
  "total": 100000,
  "used": $total_allocated,
  "available": $((100000 - total_allocated)),
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    echo "Token budget reset"
    cat coordination/token-budget.json | jq .
fi
```

### Procedure 4: Clean Restart

**When**: After state reset, ready to restart system

```bash
# Step 1: Verify clean state
echo "Verifying clean state..."

# No running processes
if ps aux | grep -E "worker-|commit-relay" | grep -v grep; then
    echo "ERROR: Processes still running!"
    exit 1
fi

# State files exist
if [ ! -f coordination/token-budget.json ] || [ ! -f coordination/task-queue.json ]; then
    echo "ERROR: Critical state files missing!"
    exit 1
fi

# Step 2: Remove PID files
echo "Cleaning PID files..."
rm -f /tmp/commit-relay-*.pid

# Step 3: Start core daemons first
echo "Starting core daemons..."

# Worker daemon
./scripts/worker-daemon.sh > /tmp/worker-daemon.log 2>&1 &
sleep 2

# PM daemon
./scripts/pm-daemon.sh > /tmp/pm-daemon.log 2>&1 &
sleep 2

# Coordinator daemon
./scripts/coordinator-daemon.sh > /tmp/coordinator-daemon.log 2>&1 &
sleep 2

# Step 4: Verify core daemons started
if ! ps aux | grep -E "worker-daemon|pm-daemon|coordinator-daemon" | grep -v grep; then
    echo "ERROR: Core daemons failed to start!"
    echo "Check logs in /tmp/*-daemon.log"
    exit 1
fi

echo "Core daemons started successfully"

# Step 5: Start observability daemons
echo "Starting observability daemons..."

./scripts/daemons/heartbeat-monitor-daemon.sh &
sleep 1
./scripts/metrics-snapshot-daemon.sh &
sleep 1
./scripts/integration-validator-daemon.sh &
sleep 1

# Step 6: Start self-healing daemons
echo "Starting self-healing daemons..."

./scripts/daemons/failure-pattern-daemon.sh &
sleep 1
./scripts/daemons/worker-restart-daemon.sh &
sleep 1
./scripts/daemons/auto-fix-daemon.sh &
sleep 1

# Step 7: Verify all daemons running
echo "Verifying all daemons..."
expected_daemons=9
running_daemons=$(ps aux | grep -E "daemon" | grep -v grep | wc -l)

if [ $running_daemons -eq $expected_daemons ]; then
    echo "✓ All $expected_daemons daemons running"
else
    echo "WARNING: Expected $expected_daemons, got $running_daemons"
fi

# Step 8: Monitor startup
echo "Monitoring system startup..."
./scripts/dashboards/system-live.sh
```

### Procedure 5: Restore from Backup

**When**: Data corruption cannot be fixed, need to restore previous state

**WARNING**: This will lose all work since backup

```bash
# Step 1: Locate backup
echo "Available backups:"
ls -lt /tmp/commit-relay-backup-*/

read -p "Enter backup timestamp (YYYYMMDD-HHMMSS): " backup_ts

backup_dir="/tmp/commit-relay-backup-${backup_ts}"

if [ ! -d "$backup_dir" ]; then
    echo "ERROR: Backup not found: $backup_dir"
    exit 1
fi

# Step 2: Emergency shutdown
echo "Performing emergency shutdown..."
./scripts/emergency-shutdown.sh  # Use Procedure 1

# Step 3: Backup current state (for rollback)
echo "Backing up current state..."
mv coordination coordination-before-restore-$(date +%Y%m%d-%H%M%S)

# Step 4: Restore from backup
echo "Restoring from backup..."
cp -r "$backup_dir/coordination" coordination/

# Step 5: Verify restore
echo "Verifying restored files..."
ls -la coordination/

# Critical files check
if [ ! -f coordination/token-budget.json ]; then
    echo "ERROR: token-budget.json missing from backup!"
    exit 1
fi

if [ ! -f coordination/task-queue.json ]; then
    echo "ERROR: task-queue.json missing from backup!"
    exit 1
fi

echo "Restore completed successfully"

# Step 6: Clean restart
echo "Performing clean restart..."
# Use Procedure 4
```

### Procedure 6: Rollback Deployment

**When**: Recent deployment caused system failure

```bash
# Step 1: Identify last working commit
git log --oneline -20

read -p "Enter commit hash to rollback to: " rollback_commit

# Step 2: Emergency shutdown
echo "Performing emergency shutdown..."
# Use Procedure 1

# Step 3: Create rollback branch
git checkout -b emergency-rollback-$(date +%Y%m%d-%H%M%S)

# Step 4: Revert to working commit
git reset --hard $rollback_commit

# Step 5: Verify rollback
git log --oneline -5

# Step 6: Restart system
echo "Restarting system with rolled-back code..."
# Use Procedure 4

# Step 7: Verify functionality
echo "Verifying system functionality..."
./scripts/dashboards/system-live.sh
```

---

## Post-Recovery Verification

After any recovery procedure:

```bash
# 1. Check daemon health
./scripts/wizards/daemon-control.sh
# Select option 8: Health check

# 2. Verify token budget
cat coordination/token-budget.json | jq .

# 3. Check active workers
ls -la coordination/worker-specs/active/
# Should be empty initially

# 4. Verify task queue
cat coordination/task-queue.json | jq '.tasks | length'

# 5. Test worker spawn
./scripts/wizards/create-worker.sh
# Should complete successfully

# 6. Monitor for 15 minutes
watch -n 30 './scripts/dashboards/system-live.sh'

# 7. Check logs for errors
grep -i "error" agents/logs/system/*.log | tail -20
```

---

## Post-Recovery Actions

### Immediate (0-1 hour)

1. **Incident Report**
   ```bash
   cat > /tmp/incident-report-$(date +%Y%m%d).md <<EOF
   # Incident Report: $(date)

   ## Summary
   [Describe what happened]

   ## Timeline
   - [timestamp]: Issue detected
   - [timestamp]: Emergency procedure initiated
   - [timestamp]: System recovered

   ## Root Cause
   [Analysis]

   ## Resolution
   [What was done]

   ## Prevention
   [How to prevent recurrence]
   EOF
   ```

2. **Notify stakeholders**
   - System restored
   - Impact assessment
   - Timeline of recovery

3. **Monitor closely**
   - Watch for recurrence
   - Check all metrics
   - Verify functionality

### Short-term (1-24 hours)

1. **Root cause analysis**
   - Review logs
   - Identify trigger
   - Document findings

2. **Data integrity check**
   - Verify all state files
   - Check worker specs
   - Validate task queue

3. **Performance baseline**
   - Measure current performance
   - Compare to pre-incident
   - Identify degradation

### Long-term (1-7 days)

1. **Prevent recurrence**
   - Implement fixes
   - Update configurations
   - Add monitoring

2. **Update runbooks**
   - Document new procedures
   - Update recovery steps
   - Add lessons learned

3. **Test recovery procedures**
   - Simulate failures
   - Validate backups
   - Practice recovery

---

## Escalation

### Level 1: On-call SRE
- Can execute Procedures 1-4
- Emergency shutdown
- State resets
- Clean restart

### Level 2: Senior SRE/DevOps
- Can execute Procedure 5 (backup restore)
- Approval for destructive operations
- Token budget resets
- Task queue resets

### Level 3: Architecture Team
- Can execute Procedure 6 (rollback)
- System design changes
- Major architectural decisions
- Capacity planning

### Level 4: Executive
- Approval for data loss
- Customer communication
- Downtime windows
- Resource allocation

**Escalate immediately if:**
- Recovery procedures fail
- Data loss suspected
- Extended downtime (>2 hours)
- Customer impact
- Security breach suspected

---

## Communication Templates

### Internal Incident Notification

```
SUBJECT: CRITICAL - Commit-Relay System Outage

Team,

Commit-Relay is experiencing a [Level 1/2/3] incident.

Status: [Investigating/Mitigating/Resolved]
Impact: [Description]
Started: [Timestamp]
ETA: [Estimate or TBD]

Actions Taken:
- [List procedures executed]

Next Steps:
- [Planned actions]

Updates will be provided every 30 minutes.

- [Your Name]
```

### Customer Communication (if applicable)

```
We are currently experiencing technical difficulties with our system.
We are actively working on resolving this issue.

Status: [Investigating/Resolving]
Impact: [Description of customer impact]
Expected Resolution: [Timeframe]

We apologize for any inconvenience.
Updates: [Where customers can check for updates]
```

---

## Prevention

### Regular Health Checks

```bash
# Add to cron (daily)
0 9 * * * /path/to/commit-relay/scripts/daily-health-check.sh
```

### Backup Strategy

```bash
# Add to cron (hourly)
0 * * * * /path/to/commit-relay/scripts/backup-state.sh

# Backup script (create this)
#!/bin/bash
backup_dir="/backups/commit-relay/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -r coordination "$backup_dir/"
find /backups/commit-relay -mtime +7 -delete  # Keep 7 days
```

### Monitoring

- Token budget alerts (<30%)
- Daemon health checks (every 5 min)
- Worker failure rate alerts
- Task queue depth alerts
- Disk space monitoring

---

## Related Runbooks

- [Worker Failure](./worker-failure.md)
- [Daemon Failure](./daemon-failure.md)
- [Token Budget Exhaustion](./token-budget-exhaustion.md)
- [Self-Healing System](./self-healing-system.md)
- [Daily Operations](./daily-operations.md)

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18

**CRITICAL**: Test these procedures in staging before using in production!
