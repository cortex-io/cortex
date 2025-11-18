# Daemon Failure Runbook

## Overview

Procedures for diagnosing and resolving daemon failures in Commit-Relay. Daemons are critical background services that power the system's autonomous operations.

**Severity**: CRITICAL
**Estimated Resolution Time**: 2-10 minutes
**Owner**: DevOps/SRE Team

---

## Symptoms

### Observable Indicators

- Daemon process not running (PID file exists but process dead)
- Daemon PID file missing
- Expected daemon functionality not working
- System appears "frozen" (no new workers spawning, tasks not progressing)
- Dashboard shows daemon as "stopped"

### Error Messages

```
Daemon coordinator-daemon (PID 12345) not responding
Worker daemon stopped - no new workers spawning
Heartbeat monitor daemon crashed
Failed to start auto-fix-daemon.sh
```

### Metrics/Alerts

- Daemon health check failed
- Zero daemon activity for >10 minutes
- Dashboard API reports daemon as down
- Missing expected daemon log entries

---

## Affected Daemons

Commit-Relay has 9 critical daemons:

| Daemon | Purpose | Impact if Down |
|--------|---------|----------------|
| **Worker Daemon** | Spawns new workers | No new workers created |
| **PM Daemon** | Worker health monitoring | No worker oversight |
| **Heartbeat Monitor** | Heartbeat tracking | No failure detection |
| **Metrics Snapshot** | Historical metrics | No metrics collection |
| **Coordinator Daemon** | Task routing | No task distribution |
| **Integration Validator** | Pipeline validation | No routing validation |
| **Pattern Detection** | Failure analysis | No pattern learning |
| **Worker Restart** | Auto-recovery | No automatic restarts |
| **Auto-Fix** | Automatic remediation | No auto-fixes applied |

---

## Diagnosis

### Step 1: Identify Failed Daemon

#### Using Daemon Control Wizard (Recommended)

```bash
# Interactive daemon status
./scripts/wizards/daemon-control.sh

# Select option 1 (View daemon status)
# Failed daemons will show as "✗ Stopped"
```

#### Manual Check

```bash
# Check all daemon PID files
ls -la /tmp/commit-relay-*.pid

# Check each daemon process
for pidfile in /tmp/commit-relay-*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        if ps -p $pid > /dev/null 2>&1; then
            echo "$(basename $pidfile): RUNNING (PID $pid)"
        else
            echo "$(basename $pidfile): DEAD (stale PID $pid)"
        fi
    fi
done
```

### Step 2: Check Daemon Logs

```bash
# Pattern Detection Daemon
tail -n 100 agents/logs/system/failure-pattern-daemon.log

# Worker Restart Daemon
tail -n 100 agents/logs/system/worker-restart-daemon.log

# Auto-Fix Daemon
tail -n 100 agents/logs/system/auto-fix-daemon.log

# Heartbeat Monitor
tail -n 100 agents/logs/system/heartbeat-monitor-daemon.log

# Check for errors
grep -i "error" agents/logs/system/*.log
grep -i "failed" agents/logs/system/*.log
grep -i "exit" agents/logs/system/*.log
```

### Step 3: Determine Failure Cause

Common daemon failure causes:

| Symptom in Logs | Likely Cause | Resolution |
|-----------------|--------------|------------|
| "Permission denied" | Insufficient permissions | Check file/directory permissions |
| "No such file or directory" | Missing dependencies | Verify file paths, restore missing files |
| "Command not found" | Missing executable | Check PATH, install missing tools |
| "Syntax error" | Code error | Review recent changes, rollback if needed |
| "Out of memory" | Resource exhaustion | Increase system resources |
| "Address already in use" | Port conflict | Kill conflicting process |
| Segmentation fault | System library issue | Restart system, update libraries |
| No error, just stopped | Crash/kill signal | Check system logs, dmesg |

### Step 4: Check System Resources

```bash
# Check available memory
free -h

# Check CPU usage
top -n 1 | head -20

# Check disk space
df -h

# Check open file descriptors
lsof | wc -l

# Check system logs for OOM killer
dmesg | grep -i "killed process"
```

---

## Resolution

### Immediate Mitigation

#### Option 1: Restart Daemon (Using Wizard)

```bash
# Launch daemon control wizard
./scripts/wizards/daemon-control.sh

# Option 4: Restart daemon(s)
# Select the failed daemon
# Wizard will stop (if running) and start daemon
```

#### Option 2: Restart Daemon (Manual)

```bash
# Worker Daemon
scripts/worker-daemon.sh &

# PM Daemon
scripts/pm-daemon.sh &

# Heartbeat Monitor
scripts/daemons/heartbeat-monitor-daemon.sh &

# Metrics Snapshot
scripts/metrics-snapshot-daemon.sh &

# Coordinator Daemon
scripts/coordinator-daemon.sh &

# Integration Validator
scripts/integration-validator-daemon.sh &

# Pattern Detection
scripts/daemons/failure-pattern-daemon.sh &

# Worker Restart
scripts/daemons/worker-restart-daemon.sh &

# Auto-Fix
scripts/daemons/auto-fix-daemon.sh &
```

#### Option 3: Restart All Daemons

```bash
# Using wizard
./scripts/wizards/daemon-control.sh
# Option 6: Start all daemons

# Or using startup script
./scripts/start-commit-relay.sh
```

### Root Cause Remediation

Based on failure cause:

#### Permission Issues

```bash
# Fix file permissions
chmod +x scripts/daemons/*.sh
chmod +x scripts/*.sh

# Fix directory permissions
chmod 755 coordination/
chmod 755 agents/logs/system/

# Fix PID file permissions
sudo chmod 666 /tmp/commit-relay-*.pid
```

#### Missing Dependencies

```bash
# Check for jq
which jq || brew install jq  # macOS
# or: apt-get install jq      # Linux

# Check for curl
which curl

# Verify bash version (need 4.0+)
bash --version
```

#### Resource Exhaustion

```bash
# If OOM killed daemon, increase system memory
# Or reduce worker limits to free up memory

# Check current token budget
cat coordination/token-budget.json | jq .

# Cleanup zombie workers to free resources
./scripts/cleanup-zombie-workers.sh
```

#### Code Errors

```bash
# If recent code changes caused failure
git log --oneline -10

# Rollback to last working version
git revert <commit-hash>

# Or check out last stable version
git checkout <stable-commit>
```

### Verification

```bash
# 1. Check daemon is running
./scripts/wizards/daemon-control.sh
# All daemons should show "✓ Running"

# 2. Verify daemon functionality
# Worker Daemon: Check that workers can be spawned
./scripts/wizards/create-worker.sh

# Coordinator Daemon: Check that tasks are routed
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "in_progress")'

# Heartbeat Monitor: Check recent heartbeat events
grep "heartbeat" coordination/dashboard-events.jsonl | tail -5

# Pattern Detection: Check patterns are being detected
ls -la coordination/patterns/

# 3. Monitor system dashboard
./scripts/dashboards/system-live.sh
# Verify daemon count shows 9/9

# 4. Check logs for activity
tail -f agents/logs/system/<daemon>.log
# Should see recent log entries
```

---

## Prevention

### Monitoring Recommendations

1. **Daemon Health Checks**
   ```bash
   # Add to cron (every 5 minutes)
   */5 * * * * /path/to/commit-relay/scripts/wizards/daemon-control.sh --health-check
   ```

2. **Auto-Restart on Failure**
   ```bash
   # Use systemd (Linux) or launchd (macOS) for auto-restart
   # Example systemd service file
   ```

3. **Alert on Daemon Failure**
   - Monitor daemon PID files
   - Alert if process count != expected count
   - Alert if log files haven't been updated in 10 minutes

4. **Resource Monitoring**
   - Alert on high memory usage (>80%)
   - Alert on high CPU usage (>90%)
   - Alert on low disk space (<10%)

### Configuration Improvements

```bash
# Increase daemon restart resilience
# Add retry logic to daemon startup scripts

# Set resource limits
# Edit daemon scripts to include:
ulimit -n 4096  # Increase file descriptor limit
ulimit -v 4194304  # Set virtual memory limit (4GB)
```

### Process Changes

1. **Regular daemon health checks** - Every 15 minutes
2. **Daemon log rotation** - Prevent log files from growing too large
3. **Graceful shutdown procedures** - Stop daemons cleanly before maintenance
4. **Change management** - Test daemon changes in staging first
5. **Monitoring dashboard** - Keep system dashboard visible during operations

---

## Related Runbooks

- [Worker Failure](./worker-failure.md) - If workers fail after daemon recovery
- [Emergency Recovery](./emergency-recovery.md) - System-wide failure recovery
- [Daily Operations](./daily-operations.md) - Regular health checks
- [Self-Healing System](./self-healing-system.md) - Understanding auto-recovery daemons

---

## Escalation Path

1. **Tier 1**: Automatic restart (via systemd/launchd)
2. **Tier 2**: Manual restart (SRE using wizard or manual commands)
3. **Tier 3**: Code fix required (Development team)
4. **Tier 4**: System architecture issue (Architecture team)

**Escalate to Tier 3 if:**
- Daemon crashes repeatedly (>3 times in 1 hour)
- Logs show code errors or exceptions
- Restart doesn't resolve issue
- Recent code changes caused failure

---

## Quick Reference

### Common Commands

```bash
# Interactive daemon control
./scripts/wizards/daemon-control.sh

# Check all daemon status
for pidfile in /tmp/commit-relay-*.pid; do
    [ -f "$pidfile" ] && ps -p $(cat "$pidfile") && echo "✓ $(basename $pidfile)" || echo "✗ $(basename $pidfile)"
done

# Restart all daemons
./scripts/start-commit-relay.sh

# View daemon logs
tail -f agents/logs/system/*.log

# Monitor system
./scripts/dashboards/system-live.sh
```

### Critical Daemons Priority

If multiple daemons are down, restart in this order:

1. **Worker Daemon** - Core functionality
2. **Coordinator Daemon** - Task routing
3. **PM Daemon** - Worker health
4. **Heartbeat Monitor** - Failure detection
5. **Worker Restart** - Auto-recovery
6. **Pattern Detection** - Learning
7. **Auto-Fix** - Remediation
8. **Metrics Snapshot** - Historical data
9. **Integration Validator** - Validation

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
