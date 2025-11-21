# Runbook: Worker Failure

Diagnosis and resolution for stuck, zombie, or crashed workers.

---

## Symptoms

- Tasks stuck in "in_progress" state
- Workers not emitting heartbeats
- Worker logs show errors or stop updating
- Token budget not being released
- Dashboard shows zombie workers

---

## Root Causes

1. **Token Budget Exhaustion**: Worker ran out of allocated tokens
2. **Timeout**: Task took longer than allowed duration
3. **API Errors**: Claude API returned errors
4. **Invalid Task**: Task specification was malformed
5. **Resource Exhaustion**: System ran out of memory/disk
6. **Network Issues**: Connection to API lost
7. **Script Errors**: Bug in worker script

---

## Diagnosis Steps

### 1. Identify Failed Worker

```bash
# List zombie workers
ls -la $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/

# List active workers with old timestamps
find $COMMIT_RELAY_HOME/coordination/worker-specs/active/ -name "worker-*.json" -mmin +60

# Check health scores
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    health=$(jq -r '.heartbeat.health_score // 0' "$spec")
    echo "$worker_id: $health"
done | sort -t: -k2 -n
```

### 2. Check Worker Status

```bash
# Get worker details
WORKER_ID="worker-implementation-001"
cat $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json | jq .

# Check if process is running
PID=$(jq -r '.pid // empty' $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json)
if [[ -n "$PID" ]]; then
    ps -p $PID || echo "Process not running"
fi
```

### 3. Examine Worker Logs

```bash
# Find worker logs
LOG_DIR=$(find $COMMIT_RELAY_HOME/agents/logs/workers -type d -name "$WORKER_ID" 2>/dev/null)

# Check recent log entries
tail -100 "$LOG_DIR/worker.log"

# Search for errors
grep -i "error\|exception\|failed" "$LOG_DIR/worker.log"

# Check token usage
grep -i "token" "$LOG_DIR/worker.log" | tail -20
```

### 4. Check Heartbeat Status

```bash
# Check last heartbeat
jq '.heartbeat' $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json

# Look for heartbeat events
grep "$WORKER_ID" $COMMIT_RELAY_HOME/coordination/events/heartbeat-events.jsonl | tail -10 | jq .
```

### 5. Check Pattern Detection

```bash
# See if failure pattern was detected
grep "$WORKER_ID" $COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl | jq .

# Check auto-fix attempts
grep "$WORKER_ID" $COMMIT_RELAY_HOME/coordination/metrics/auto-fix-history.jsonl | jq .
```

---

## Resolution Steps

### Immediate Actions

#### 1. Terminate Stuck Worker

```bash
WORKER_ID="worker-implementation-001"

# Get PID and kill if running
PID=$(jq -r '.pid // empty' $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json)
if [[ -n "$PID" ]]; then
    kill $PID 2>/dev/null || true
    kill -9 $PID 2>/dev/null || true
fi

# Move to zombie directory
mv $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json \
   $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/
```

#### 2. Use Cleanup Script

```bash
# Cleanup specific worker
./scripts/cleanup-zombie-workers.sh $WORKER_ID

# Cleanup all zombies
./scripts/cleanup-zombie-workers.sh
```

#### 3. Release Token Budget

```bash
# Check current budget
cat $COMMIT_RELAY_HOME/coordination/token-budget.json | jq .

# Recalculate budget (manual)
USED=0
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    [[ -f "$spec" ]] && USED=$((USED + $(jq -r '.token_budget.allocated // 0' "$spec")))
done

TOTAL=$(jq -r '.total' $COMMIT_RELAY_HOME/coordination/token-budget.json)
AVAILABLE=$((TOTAL - USED))

# Update budget (careful!)
jq ".used = $USED | .available = $AVAILABLE" \
   $COMMIT_RELAY_HOME/coordination/token-budget.json > /tmp/budget.json && \
mv /tmp/budget.json $COMMIT_RELAY_HOME/coordination/token-budget.json
```

#### 4. Retry Task

```bash
# Get task ID from worker
TASK_ID=$(jq -r '.task_id' $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/$WORKER_ID.json)

# Reset task to queued
jq "(.tasks[] | select(.task_id == \"$TASK_ID\") | .status) = \"queued\" |
    (.tasks[] | select(.task_id == \"$TASK_ID\") | .assigned_worker) = null" \
   $COMMIT_RELAY_HOME/coordination/task-queue.json > /tmp/queue.json && \
mv /tmp/queue.json $COMMIT_RELAY_HOME/coordination/task-queue.json
```

### Long-term Fixes

#### For Token Exhaustion

```bash
# Increase worker budget in config
jq '.worker_types["implementation-worker"].default_budget = 150000' \
   $COMMIT_RELAY_HOME/coordination/config/worker-types.json > /tmp/types.json && \
mv /tmp/types.json $COMMIT_RELAY_HOME/coordination/config/worker-types.json
```

#### For Timeout Issues

```bash
# Increase timeout for worker type
jq '.worker_types["implementation-worker"].default_duration = 60' \
   $COMMIT_RELAY_HOME/coordination/config/worker-types.json > /tmp/types.json && \
mv /tmp/types.json $COMMIT_RELAY_HOME/coordination/config/worker-types.json
```

#### For Recurring Failures

```bash
# Check patterns for this worker type
grep "implementation-worker" $COMMIT_RELAY_HOME/coordination/patterns/failure-patterns.jsonl | \
    jq -s 'group_by(.root_cause) | map({cause: .[0].root_cause, count: length})'

# Update routing to avoid problematic configurations
# Edit coordination/moe/router-config.json
```

---

## Prevention

### Enable Proactive Monitoring

```bash
# Ensure heartbeat monitor is running
ps aux | grep heartbeat-monitor-daemon || \
    ./scripts/daemons/heartbeat-monitor-daemon.sh &

# Ensure auto-fix daemon is running
ps aux | grep auto-fix-daemon || \
    ./scripts/daemons/auto-fix-daemon.sh &
```

### Set Appropriate Budgets

- Analysis tasks: 50,000 tokens
- Implementation tasks: 100,000-150,000 tokens
- Complex tasks: 200,000 tokens

### Configure Timeouts

- Simple tasks: 15 minutes
- Standard tasks: 30 minutes
- Complex tasks: 60 minutes

### Use Task Decomposition

Break large tasks into smaller, focused subtasks that fit within budget constraints.

---

## Escalation

If the issue persists after following these steps:

1. Check system-wide health: `./scripts/dashboards/system-live.sh`
2. Review all daemon logs: `grep -r "error" $COMMIT_RELAY_HOME/agents/logs/system/`
3. Check Claude API status
4. Review recent changes to configuration
5. Consult [Emergency Recovery](./emergency-recovery.md) runbook

---

## Related Runbooks

- [Token Budget Exhaustion](./token-budget-exhaustion.md)
- [Self-Healing System](./self-healing-system.md)
- [Daily Operations](./daily-operations.md)

---

**Last Updated**: 2025-11-21
