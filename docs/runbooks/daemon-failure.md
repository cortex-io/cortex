# Runbook: Daemon Failure

Diagnosis and resolution for stopped or unhealthy daemons.

---

## Symptoms

- Tasks not being processed
- Workers not spawning
- Metrics not updating
- Dashboard shows daemons as stopped/dead
- PID files exist but process not running
- System appears unresponsive

---

## Root Causes

1. **Process Crash**: Daemon encountered fatal error
2. **Signal Termination**: Daemon killed by system or user
3. **Resource Exhaustion**: Out of memory, file descriptors
4. **Disk Full**: Cannot write logs or state
5. **Permission Issues**: Cannot access required files
6. **Script Errors**: Bug in daemon code
7. **Dependency Failure**: Required service unavailable

---

## Diagnosis Steps

### 1. Check Daemon Status

```bash
# Quick status check
./scripts/dashboards/daemon-monitor.sh --status

# Or manual check
for pidfile in /tmp/commit-relay-*.pid; do
    if [[ -f "$pidfile" ]]; then
        NAME=$(basename "$pidfile" .pid | sed 's/commit-relay-//')
        PID=$(cat "$pidfile")
        if ps -p $PID > /dev/null 2>&1; then
            echo "$NAME: RUNNING (PID: $PID)"
        else
            echo "$NAME: DEAD (stale PID file)"
        fi
    fi
done
```

### 2. Check System Resources

```bash
# Check disk space
df -h $COMMIT_RELAY_HOME

# Check memory
vm_stat | head -10

# Check open files
lsof | wc -l

# Check processes
ps aux | grep commit-relay | wc -l
```

### 3. Examine Daemon Logs

```bash
# List all daemon logs
ls -la $COMMIT_RELAY_HOME/agents/logs/system/

# Check specific daemon log
DAEMON="worker"  # Change as needed
tail -100 $COMMIT_RELAY_HOME/agents/logs/system/$DAEMON-daemon.log

# Search for errors
grep -i "error\|fatal\|exception" $COMMIT_RELAY_HOME/agents/logs/system/$DAEMON-daemon.log | tail -20
```

### 4. Check Recent Events

```bash
# Look for daemon-related events
grep -i "daemon" $COMMIT_RELAY_HOME/coordination/dashboard-events.jsonl | tail -20 | jq .

# Check health alerts
cat $COMMIT_RELAY_HOME/coordination/health-alerts.json | jq '.alerts[-10:]'
```

### 5. Verify Dependencies

```bash
# Check jq is available
which jq || echo "jq not found!"

# Check file permissions
ls -la $COMMIT_RELAY_HOME/coordination/
ls -la /tmp/commit-relay-*.pid

# Check required directories exist
for dir in coordination/worker-specs/active coordination/tasks agents/logs/system; do
    [[ -d "$COMMIT_RELAY_HOME/$dir" ]] || echo "Missing: $dir"
done
```

---

## Resolution Steps

### Immediate Actions

#### 1. Restart Single Daemon

```bash
# Stop daemon
DAEMON="worker"
./scripts/dashboards/daemon-monitor.sh --stop $DAEMON

# Start daemon
./scripts/dashboards/daemon-monitor.sh --start $DAEMON

# Or directly:
PID_FILE="/tmp/commit-relay-${DAEMON}.pid"
if [[ -f "$PID_FILE" ]]; then
    kill $(cat "$PID_FILE") 2>/dev/null || true
    rm -f "$PID_FILE"
fi

# Start fresh
case $DAEMON in
    worker) ./scripts/worker-daemon.sh & ;;
    pm) ./scripts/pm-daemon.sh & ;;
    heartbeat) ./scripts/daemons/heartbeat-monitor-daemon.sh & ;;
    coordinator) ./scripts/coordinator-daemon.sh & ;;
esac
```

#### 2. Restart All Daemons

```bash
# Stop all
pkill -f "commit-relay.*daemon" || true
rm -f /tmp/commit-relay-*.pid

# Wait for cleanup
sleep 2

# Start all
./scripts/start-commit-relay.sh
```

#### 3. Clear Stale PID Files

```bash
# Find and remove stale PID files
for pidfile in /tmp/commit-relay-*.pid; do
    if [[ -f "$pidfile" ]]; then
        PID=$(cat "$pidfile")
        if ! ps -p $PID > /dev/null 2>&1; then
            echo "Removing stale: $pidfile"
            rm -f "$pidfile"
        fi
    fi
done
```

#### 4. Fix Disk Space Issues

```bash
# Check large files
du -sh $COMMIT_RELAY_HOME/agents/logs/* | sort -h

# Rotate logs
./scripts/rotate-dashboard-events.sh

# Clean old worker logs (older than 7 days)
find $COMMIT_RELAY_HOME/agents/logs/workers -type f -mtime +7 -delete

# Clean old snapshots
tail -1000 $COMMIT_RELAY_HOME/coordination/metrics-snapshots.jsonl > /tmp/snapshots.jsonl
mv /tmp/snapshots.jsonl $COMMIT_RELAY_HOME/coordination/metrics-snapshots.jsonl
```

#### 5. Fix Permission Issues

```bash
# Ensure write permissions
chmod -R u+w $COMMIT_RELAY_HOME/coordination/
chmod -R u+w $COMMIT_RELAY_HOME/agents/logs/

# Fix PID file permissions
chmod 644 /tmp/commit-relay-*.pid 2>/dev/null || true
```

### Individual Daemon Recovery

#### Worker Daemon

```bash
# Check worker-daemon specific issues
grep "spawn\|failed" $COMMIT_RELAY_HOME/agents/logs/system/worker-daemon.log | tail -20

# Restart
kill $(cat /tmp/commit-relay-worker.pid) 2>/dev/null || true
rm -f /tmp/commit-relay-worker.pid
./scripts/worker-daemon.sh &

# Verify
sleep 2
ps aux | grep worker-daemon
```

#### Coordinator Daemon

```bash
# Check coordinator issues
grep "route\|task" $COMMIT_RELAY_HOME/agents/logs/system/coordinator-daemon.log | tail -20

# Reset coordinator state if needed
rm -f $COMMIT_RELAY_HOME/coordination/orchestrator/state/current.json

# Restart
kill $(cat /tmp/commit-relay-coordinator.pid) 2>/dev/null || true
./scripts/coordinator-daemon.sh &
```

#### Heartbeat Monitor Daemon

```bash
# Check heartbeat issues
grep "timeout\|zombie" $COMMIT_RELAY_HOME/agents/logs/system/heartbeat-monitor-daemon.log | tail -20

# Restart
kill $(cat /tmp/commit-relay-heartbeat.pid) 2>/dev/null || true
./scripts/daemons/heartbeat-monitor-daemon.sh &
```

#### Auto-Fix Daemon

```bash
# Check auto-fix issues
grep "fix\|pattern" $COMMIT_RELAY_HOME/agents/logs/system/auto-fix-daemon.log | tail -20

# Restart
kill $(cat /tmp/commit-relay-auto-fix.pid) 2>/dev/null || true
./scripts/daemons/auto-fix-daemon.sh &
```

---

## Prevention

### Enable Daemon Supervision

```bash
# Use daemon supervisor (if available)
./scripts/daemon-supervisor.sh &
```

### Set Up Log Rotation

```bash
# Add to crontab
# Rotate logs daily
0 0 * * * $COMMIT_RELAY_HOME/scripts/rotate-dashboard-events.sh

# Clean old logs weekly
0 0 * * 0 find $COMMIT_RELAY_HOME/agents/logs -type f -mtime +14 -delete
```

### Monitor Disk Space

Add disk space monitoring to health checks:

```bash
# Check available space
AVAILABLE=$(df -k $COMMIT_RELAY_HOME | tail -1 | awk '{print $4}')
if (( AVAILABLE < 1000000 )); then  # Less than 1GB
    echo "Warning: Low disk space"
fi
```

### Resource Limits

Set appropriate limits for daemons:

```bash
# In daemon scripts, add:
ulimit -n 1024  # File descriptors
ulimit -m 512000  # Memory (KB)
```

---

## Verification

After recovery, verify system health:

```bash
# 1. Check all daemons running
./scripts/dashboards/daemon-monitor.sh --status

# 2. Verify system processing
./scripts/dashboards/system-live.sh

# 3. Create test task
./scripts/create-task.sh --description "Health check task" --priority low

# 4. Monitor for a few minutes
watch -n 10 'cat $COMMIT_RELAY_HOME/coordination/task-queue.json | jq ".tasks[-1]"'

# 5. Check no new errors
grep -i error $COMMIT_RELAY_HOME/agents/logs/system/*.log | grep "$(date +%Y-%m-%d)"
```

---

## Escalation

If daemons continue to fail:

1. Check system logs: `sudo dmesg | tail -50`
2. Review complete logs: `less $COMMIT_RELAY_HOME/agents/logs/system/*.log`
3. Check for OOM kills: `grep -i "killed process" /var/log/system.log`
4. Verify environment variables: `env | grep COMMIT_RELAY`
5. Consult [Emergency Recovery](./emergency-recovery.md) runbook

---

## Related Runbooks

- [Daily Operations](./daily-operations.md)
- [Daemon Management](./daemon-management.md)
- [Emergency Recovery](./emergency-recovery.md)

---

**Last Updated**: 2025-11-21
