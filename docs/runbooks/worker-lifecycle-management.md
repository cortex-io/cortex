# Worker Lifecycle Management Runbook

## Overview

Complete guide to managing the worker lifecycle in Commit-Relay, from spawning through completion or termination. Covers all worker states, transitions, and operational procedures.

**Severity**: MEDIUM
**Estimated Time**: Variable (5-30 minutes)
**Owner**: DevOps/SRE Team

---

## Worker Lifecycle States

### State Diagram

```
                    ┌─────────┐
                    │ SPAWNED │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  IDLE   │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ RUNNING │◄────┐
                    └────┬────┘     │
                         │      ┌───┴────┐
                    ┌────▼────┐ │RESTART │
                    │COMPLETED│ └────────┘
                    └─────────┘
                         │
                    ┌────▼────┐
                    │ ARCHIVED│
                    └─────────┘

               Alternative Paths:
               RUNNING → ZOMBIE → ARCHIVED
               RUNNING → FAILED → ARCHIVED
```

### State Descriptions

| State | Description | Duration | Next State |
|-------|-------------|----------|------------|
| SPAWNED | Worker process started | Seconds | IDLE |
| IDLE | Waiting for task assignment | Minutes | RUNNING |
| RUNNING | Actively executing task | 15-45 min | COMPLETED/FAILED |
| COMPLETED | Task finished successfully | N/A | ARCHIVED |
| FAILED | Task failed with error | N/A | ARCHIVED/RESTART |
| ZOMBIE | No heartbeat, unresponsive | >5 min | ARCHIVED |
| ARCHIVED | Moved to historical storage | Permanent | N/A |

---

## Spawning Workers

### Using Create Worker Wizard (Recommended)

```bash
./scripts/wizards/create-worker.sh

# Interactive wizard will guide through:
# 1. Worker type selection
# 2. Task assignment
# 3. Priority setting
# 4. Repository configuration
# 5. Specification review
# 6. Token budget check
# 7. Worker spawn
```

### Manual Worker Spawn

```bash
# Direct spawn command
./scripts/spawn-worker.sh \
  --type analysis-worker \
  --task-id task-001 \
  --master development-master \
  --priority high \
  --repo owner/repository

# Verify spawn
ls coordination/worker-specs/active/ | grep worker-
```

### Worker Template Customization

```bash
# View available templates
ls coordination/worker-specs/templates/

# Customize template for specific needs
vim coordination/worker-specs/templates/worker-<type>-template.json

# Key customizable fields:
# - token_budget.allocated: Token allocation
# - timeout: Max execution time (seconds)
# - environment: Environment variables
# - command: Execution command
# - priority: Default priority level
```

---

## Monitoring Workers

### Check Worker Status

```bash
# List all active workers
ls -la coordination/worker-specs/active/

# View specific worker details
cat coordination/worker-specs/active/worker-<ID>.json | jq .

# Worker summary
cat coordination/worker-specs/active/worker-<ID>.json | jq '{
    worker_id,
    worker_type,
    status,
    created_at,
    heartbeat: .heartbeat.last_heartbeat,
    health_score: .heartbeat.health_score,
    token_budget
}'
```

### Using Worker Monitor Dashboard

```bash
# Real-time worker monitoring
./scripts/dashboards/worker-monitor.sh

# Filter by status
./scripts/dashboards/worker-monitor.sh --status running

# Filter by type
./scripts/dashboards/worker-monitor.sh --type implementation-worker
```

### Check Worker Logs

```bash
# Locate worker log directory
worker_id="worker-scan-001"
log_dir="agents/logs/workers/$(date +%Y-%m-%d)/$worker_id"

# View worker log
tail -100 "$log_dir/worker.log"

# Follow worker log in real-time
tail -f "$log_dir/worker.log"

# Search for errors
grep -i "error" "$log_dir/worker.log"

# Check worker completion summary
cat "$log_dir/completion_summary.md" 2>/dev/null || echo "Not completed"
```

---

## Worker Health Management

### Heartbeat Monitoring

```bash
# Check worker heartbeat
cat coordination/worker-specs/active/worker-<ID>.json | jq '.heartbeat'

# Expected heartbeat fields:
# {
#   "last_heartbeat": "2025-11-18T10:00:00-0600",
#   "health_score": 95,
#   "consecutive_failures": 0,
#   "last_check": "2025-11-18T10:00:30-0600"
# }

# Check heartbeat freshness
last_heartbeat=$(jq -r '.heartbeat.last_heartbeat' \
    coordination/worker-specs/active/worker-<ID>.json)

heartbeat_age=$(( $(date +%s) - $(date -d "$last_heartbeat" +%s 2>/dev/null || echo 0) ))

if [ $heartbeat_age -gt 300 ]; then
    echo "WARNING: Heartbeat stale (${heartbeat_age}s old)"
else
    echo "Heartbeat fresh (${heartbeat_age}s old)"
fi
```

### Health Score Interpretation

| Score | Status | Action |
|-------|--------|--------|
| 90-100 | Excellent | None |
| 70-89 | Good | Monitor |
| 50-69 | Fair | Investigate |
| 30-49 | Poor | Consider restart |
| 0-29 | Critical | Immediate action |

### Manual Health Check

```bash
# Get worker PID
pid=$(jq -r '.pid' coordination/worker-specs/active/worker-<ID>.json)

# Check process status
if ps -p $pid > /dev/null 2>&1; then
    echo "Worker process running (PID: $pid)"

    # Check resource usage
    echo "CPU: $(ps -p $pid -o %cpu=)%"
    echo "MEM: $(ps -p $pid -o %mem=)%"

    # Check process state
    state=$(ps -p $pid -o state=)
    echo "State: $state"
    # R = Running, S = Sleeping, D = Disk wait, Z = Zombie, T = Stopped
else
    echo "Worker process NOT running (PID: $pid)"
fi
```

---

## Worker Completion

### Successful Completion

```bash
# Worker completes and updates status
# Check completion status
cat coordination/worker-specs/active/worker-<ID>.json | jq '{
    status,
    completed_at,
    result: .completion_result
}'

# Worker moves to completed state
# Spec file moves to archive
mv coordination/worker-specs/active/worker-<ID>.json \
   coordination/worker-specs/completed/

# Tokens recovered
# Token budget automatically updated
```

### Verify Completion

```bash
# Check worker completion summary
cat agents/logs/workers/$(date +%Y-%m-%d)/worker-<ID>/completion_summary.md

# Verify task completion
cat coordination/task-queue.json | jq '.tasks[] | select(.worker_id == "worker-<ID>")'

# Check token recovery
cat coordination/token-budget.json | jq .available
```

---

## Worker Failures

### Failed Worker Detection

```bash
# Check failed workers
ls coordination/worker-specs/failed/

# View failure details
cat coordination/worker-specs/failed/worker-<ID>.json | jq '{
    worker_id,
    failure_reason,
    error_message,
    failed_at,
    exit_code
}'

# Check failure logs
cat agents/logs/workers/$(date +%Y-%m-%d)/worker-<ID>/worker.log | tail -50
```

### Failure Handling

```bash
# Option 1: Automatic restart (if enabled)
# Worker-restart daemon will handle

# Option 2: Manual investigation
./scripts/wizards/debug-helper.sh
# Select option 2: Analyze failed tasks

# Option 3: Manual cleanup
./scripts/cleanup-zombie-workers.sh worker-<ID>

# Option 4: Retry with different configuration
# Fix the issue, then re-spawn with corrected spec
./scripts/wizards/create-worker.sh
```

---

## Worker Termination

### Graceful Termination

```bash
# Send TERM signal to worker
worker_id="worker-scan-001"
pid=$(jq -r '.pid' "coordination/worker-specs/active/${worker_id}.json")

if [ -n "$pid" ]; then
    echo "Sending TERM signal to PID $pid"
    kill -TERM $pid

    # Wait for graceful shutdown (30s)
    sleep 30

    # Verify termination
    if ps -p $pid > /dev/null 2>&1; then
        echo "Worker still running, sending KILL"
        kill -KILL $pid
    else
        echo "Worker terminated gracefully"
    fi
fi

# Archive worker spec
mkdir -p coordination/worker-specs/terminated/
mv "coordination/worker-specs/active/${worker_id}.json" \
   "coordination/worker-specs/terminated/"
```

### Force Termination

```bash
# Force kill worker (use with caution)
worker_id="worker-scan-001"
pid=$(jq -r '.pid' "coordination/worker-specs/active/${worker_id}.json")

if [ -n "$pid" ]; then
    echo "Force killing worker (PID: $pid)"
    kill -9 $pid

    # Clean up worker spec
    ./scripts/cleanup-zombie-workers.sh $worker_id
fi
```

---

## Zombie Worker Management

### Detect Zombies

```bash
# List zombie workers
ls coordination/worker-specs/zombie/

# Check zombie characteristics
for zombie in coordination/worker-specs/zombie/*.json; do
    worker_id=$(basename "$zombie" .json)
    last_heartbeat=$(jq -r '.heartbeat.last_heartbeat' "$zombie")
    pid=$(jq -r '.pid' "$zombie")

    echo "Zombie: $worker_id"
    echo "  Last heartbeat: $last_heartbeat"
    echo "  PID: $pid"

    # Check if process still exists
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "  Process STILL RUNNING (requires cleanup)"
    else
        echo "  Process terminated"
    fi
    echo ""
done
```

### Cleanup Zombies

```bash
# Cleanup all zombies
./scripts/cleanup-zombie-workers.sh

# Cleanup specific zombie
./scripts/cleanup-zombie-workers.sh worker-<ID>

# Manual zombie cleanup
for zombie in coordination/worker-specs/zombie/*.json; do
    worker_id=$(basename "$zombie" .json)
    pid=$(jq -r '.pid' "$zombie")

    # Kill process if still running
    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        kill -9 "$pid"
    fi

    # Archive zombie spec
    mkdir -p coordination/worker-specs/archived/
    mv "$zombie" coordination/worker-specs/archived/
done

# Verify token recovery
cat coordination/token-budget.json | jq .
```

---

## Worker Archival

### Archive Policies

**Completed Workers**: Archive after 24 hours
**Failed Workers**: Archive after investigation
**Zombie Workers**: Archive immediately after cleanup
**Terminated Workers**: Archive immediately

### Manual Archival

```bash
# Archive old completed workers
find coordination/worker-specs/completed -name "*.json" -mtime +1 \
    -exec mv {} coordination/worker-specs/archived/ \;

# Archive old failed workers
find coordination/worker-specs/failed -name "*.json" -mtime +7 \
    -exec mv {} coordination/worker-specs/archived/ \;

# Archive old zombie workers
mv coordination/worker-specs/zombie/*.json \
   coordination/worker-specs/archived/ 2>/dev/null || true
```

### Automated Archival

```bash
# Add to cron for daily archival
0 2 * * * /path/to/commit-relay/scripts/archive-old-workers.sh

# Create archival script
cat > scripts/archive-old-workers.sh <<'EOF'
#!/bin/bash
COMMIT_RELAY_HOME=/path/to/commit-relay
cd "$COMMIT_RELAY_HOME"

# Archive completed (>1 day old)
find coordination/worker-specs/completed -name "*.json" -mtime +1 \
    -exec mv {} coordination/worker-specs/archived/ \;

# Archive failed (>7 days old)
find coordination/worker-specs/failed -name "*.json" -mtime +7 \
    -exec mv {} coordination/worker-specs/archived/ \;

echo "$(date): Worker archival complete" >> agents/logs/system/archival.log
EOF

chmod +x scripts/archive-old-workers.sh
```

---

## Worker Pool Management

### Check Pool Capacity

```bash
# View worker pool configuration
cat coordination/worker-pool.json | jq .

# Count active workers
active_count=$(ls coordination/worker-specs/active/ | wc -l)
echo "Active workers: $active_count"

# Check against pool limits (if configured)
max_workers=$(jq -r '.max_workers // 100' coordination/worker-pool.json)
echo "Pool capacity: $active_count/$max_workers"

if [ $active_count -ge $max_workers ]; then
    echo "WARNING: Worker pool at capacity"
fi
```

### Adjust Pool Size

```bash
# Temporarily increase pool size
jq '.max_workers = 20' coordination/worker-pool.json > /tmp/pool.json
mv /tmp/pool.json coordination/worker-pool.json

# Verify change
cat coordination/worker-pool.json | jq .max_workers
```

---

## Troubleshooting

### Worker Won't Spawn

```bash
# Check token budget
available=$(jq -r '.available' coordination/token-budget.json)
required=70000  # Typical worker allocation

if [ $available -lt $required ]; then
    echo "Insufficient tokens: $available < $required"
    echo "Cleanup zombies to recover tokens"
    ./scripts/cleanup-zombie-workers.sh
fi

# Check for spawn errors
tail -50 agents/logs/system/worker-daemon.log | grep -i "error\|spawn"

# Verify template exists
template="coordination/worker-specs/templates/worker-<type>-template.json"
if [ ! -f "$template" ]; then
    echo "Template not found: $template"
fi
```

### Worker Stuck in IDLE

```bash
# Check if task assigned
cat coordination/worker-specs/active/worker-<ID>.json | jq .task_id

# Check task queue
cat coordination/task-queue.json | jq '.tasks[] | select(.worker_id == "worker-<ID>")'

# Manual task assignment (if needed)
# Update worker spec with task_id
jq '.task_id = "task-001" | .status = "running"' \
    coordination/worker-specs/active/worker-<ID>.json > /tmp/worker.json
mv /tmp/worker.json coordination/worker-specs/active/worker-<ID>.json
```

### Worker Timeout

```bash
# Check worker runtime
created_at=$(jq -r '.created_at' coordination/worker-specs/active/worker-<ID>.json)
created_ts=$(date -d "$created_at" +%s)
runtime=$(($(date +%s) - created_ts))

echo "Worker runtime: $((runtime / 60)) minutes"

# Check timeout configuration
timeout=$(jq -r '.timeout' coordination/worker-specs/active/worker-<ID>.json)
echo "Configured timeout: $timeout seconds"

if [ $runtime -gt $timeout ]; then
    echo "Worker has exceeded timeout"
    # Consider termination or timeout extension
fi
```

---

## Best Practices

### Worker Spawning

1. **Use Wizard**: Prefer `create-worker.sh` for interactive guidance
2. **Check Budget**: Verify token budget before spawning
3. **Set Priority**: Use correct priority for task urgency
4. **Monitor Spawn**: Watch logs for spawn errors

### Worker Monitoring

1. **Daily Check**: Review worker health daily
2. **Watch Zombies**: Monitor for zombie accumulation
3. **Log Review**: Check worker logs for errors
4. **Health Scores**: Investigate workers with low health scores (<70)

### Worker Cleanup

1. **Regular Archival**: Archive old workers weekly
2. **Zombie Cleanup**: Run cleanup daily if zombies accumulate
3. **Log Cleanup**: Archive large worker logs (>50MB)
4. **Token Recovery**: Ensure zombies are cleaned to recover tokens

---

## Related Runbooks

- [Worker Failure](./worker-failure.md) - Handling worker failures
- [Token Budget Exhaustion](./token-budget-exhaustion.md) - Token management
- [Self-Healing System](./self-healing-system.md) - Automatic recovery
- [Daily Operations](./daily-operations.md) - Regular maintenance

---

## Quick Reference

### Common Commands

```bash
# Spawn worker
./scripts/wizards/create-worker.sh

# Monitor workers
./scripts/dashboards/worker-monitor.sh

# Check worker status
cat coordination/worker-specs/active/worker-<ID>.json | jq .

# View worker logs
tail -f agents/logs/workers/$(date +%Y-%m-%d)/worker-<ID>/worker.log

# Cleanup zombies
./scripts/cleanup-zombie-workers.sh

# Archive old workers
mv coordination/worker-specs/completed/*.json coordination/worker-specs/archived/
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
