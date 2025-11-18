# Performance Troubleshooting Runbook

## Overview

Procedures for diagnosing and resolving performance issues in Commit-Relay. Covers slow task processing, resource bottlenecks, daemon performance, and system optimization.

**Severity**: MEDIUM to HIGH
**Estimated Resolution Time**: 20-60 minutes
**Owner**: DevOps/SRE Team

---

## Performance Indicators

### Normal Performance Baselines

- **Task Queue Processing**: <5 minutes for high-priority tasks
- **Worker Spawn Time**: <30 seconds
- **Daemon Response Time**: <2 seconds
- **Token Budget Updates**: <1 second
- **Dashboard Refresh**: <3 seconds
- **Worker Completion**:
  - Scan workers: 10-15 minutes
  - Implementation workers: 30-45 minutes
  - Analysis workers: 10-20 minutes

---

## Symptoms

### Observable Indicators

- Tasks sitting in queue for extended periods
- Worker spawn failures or delays
- Dashboard slow to load/refresh
- High CPU or memory usage
- Disk I/O bottlenecks
- Daemon cycles taking longer than expected
- Token budget calculation delays

### Error Messages

```
WARNING: Task queue processing slow - 15 tasks queued for >10 minutes
ERROR: Worker spawn timeout after 120s
WARNING: High daemon cycle time: 45s (expected <10s)
ERROR: Insufficient system resources
WARNING: Token budget update taking >5s
```

### Metrics/Alerts

- Task queue depth > 20
- Average task processing time > 30 minutes
- System CPU > 80%
- System memory > 90%
- Disk usage > 85%
- Daemon cycle time > 30s

---

## Diagnosis

### Step 1: Identify Performance Bottleneck

```bash
# Quick system health check
echo "=== System Resources ==="
echo "CPU Usage:"
top -b -n1 | head -5

echo ""
echo "Memory Usage:"
free -h

echo ""
echo "Disk Usage:"
df -h | grep -E "/$|commit-relay"

echo ""
echo "Disk I/O:"
iostat -x 1 3 2>/dev/null || echo "iostat not available"

# Identify resource hogs
echo ""
echo "=== Top Processes ==="
ps aux --sort=-%cpu | head -10
```

### Step 2: Check Task Queue Performance

```bash
# Task queue depth
echo "Current task queue:"
cat coordination/task-queue.json | jq '{
    total: (.tasks | length),
    queued: ([.tasks[] | select(.status == "queued")] | length),
    in_progress: ([.tasks[] | select(.status == "in_progress")] | length),
    oldest_queued: ([.tasks[] | select(.status == "queued") | .created_at] | min)
}'

# Task age analysis
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "queued") |
    [.task_id, .created_at, .priority] | @tsv' | \
while IFS=$'\t' read -r task_id created_at priority; do
    # Calculate age
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
    now_ts=$(date +%s)
    age_minutes=$(( (now_ts - created_ts) / 60 ))

    if [ $age_minutes -gt 30 ]; then
        echo "SLOW: $task_id queued for ${age_minutes}m (priority: $priority)"
    fi
done

# Task throughput (last hour)
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "completed") |
    select(.updated_at >= "'$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)'Z") |
    .task_id' | wc -l
```

### Step 3: Check Worker Performance

```bash
# Active worker count
active_workers=$(ls coordination/worker-specs/active/ | wc -l)
echo "Active workers: $active_workers"

# Worker resource usage
echo ""
echo "Worker resource consumption:"
for spec in coordination/worker-specs/active/worker-*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    pid=$(jq -r '.pid' "$spec")

    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        cpu=$(ps -p "$pid" -o %cpu= || echo "N/A")
        mem=$(ps -p "$pid" -o %mem= || echo "N/A")
        echo "  $worker_id (PID $pid): CPU ${cpu}%, MEM ${mem}%"
    fi
done

# Long-running workers
echo ""
echo "Long-running workers (>2h):"
current_time=$(date +%s)
for spec in coordination/worker-specs/active/worker-*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    created_at=$(jq -r '.created_at' "$spec")
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
    age_hours=$(( (current_time - created_ts) / 3600 ))

    if [ $age_hours -gt 2 ]; then
        echo "  $worker_id: ${age_hours}h"
    fi
done
```

### Step 4: Check Daemon Performance

```bash
# Daemon cycle times (from logs)
echo "Recent daemon cycle times:"

for daemon_log in agents/logs/system/*-daemon.log; do
    daemon_name=$(basename "$daemon_log" .log)

    # Extract recent cycle completion times
    cycle_time=$(grep "cycle completed" "$daemon_log" 2>/dev/null | tail -5 | \
        grep -oE '[0-9.]+s' | sed 's/s//' | \
        awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print "N/A"}')

    echo "  $daemon_name: ${cycle_time}s"
done

# Daemon resource usage
echo ""
echo "Daemon resource consumption:"
ps aux | grep -E "daemon" | grep -v grep | \
    awk '{printf "  PID %s: CPU %s%%, MEM %s%% - %s\n", $2, $3, $4, $11}'
```

### Step 5: Check Token Budget Performance

```bash
# Token budget calculation time
time_start=$(date +%s%3N)
cat coordination/token-budget.json | jq . > /dev/null
time_end=$(date +%s%3N)
calc_time=$((time_end - time_start))

echo "Token budget read time: ${calc_time}ms"

if [ $calc_time -gt 1000 ]; then
    echo "WARNING: Token budget file slow to read (>1s)"
    echo "File size: $(ls -lh coordination/token-budget.json | awk '{print $5}')"
fi

# Check for token budget accounting lag
cat coordination/token-budget.json | jq '{
    total, used, available,
    last_updated,
    update_lag: (now - (.last_updated | fromdateiso8601))
}'
```

### Step 6: Identify Root Cause

Common performance issues:

| Symptom | Likely Cause | Priority |
|---------|--------------|----------|
| High task queue depth | Insufficient workers or slow workers | HIGH |
| Slow worker spawning | Resource exhaustion or token budget | HIGH |
| High CPU usage | Too many concurrent workers | MEDIUM |
| High memory usage | Worker memory leaks or large datasets | HIGH |
| High disk I/O | Excessive logging or large state files | MEDIUM |
| Slow daemons | Large data files or inefficient processing | MEDIUM |
| Slow dashboard | Large event logs or metrics files | LOW |

---

## Resolution

### Optimize Task Queue Processing

#### Increase Worker Capacity

```bash
# Check current worker pool configuration
cat coordination/worker-pool.json | jq .

# If worker pool is constrained, increase capacity
# (Requires adequate token budget)

# 1. Check available tokens
available=$(jq -r '.available' coordination/token-budget.json)
echo "Available tokens: $available"

# 2. Spawn additional workers for high-priority tasks
high_priority_tasks=$(cat coordination/task-queue.json | \
    jq '[.tasks[] | select(.status == "queued" and .priority == "high")] | length')

echo "High-priority tasks queued: $high_priority_tasks"

# 3. Manually spawn workers if needed
if [ $high_priority_tasks -gt 5 ]; then
    echo "Spawning additional workers..."
    # Use wizard or spawn script
    ./scripts/wizards/create-worker.sh
fi
```

#### Optimize Worker Types

```bash
# If specific worker types are slow:

# 1. Identify slow worker types
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "completed") |
    [.worker_type, .duration] | @tsv' | \
    awk '{sum[$1]+=$2; count[$1]++} END {
        for (type in sum) printf "%s: avg %0.1fs\n", type, sum[type]/count[type]
    }'

# 2. Adjust worker timeouts if workers timing out
vim coordination/worker-specs/templates/worker-<type>-template.json
# Increase timeout value

# 3. Reduce token allocation for faster workers
vim coordination/worker-specs/templates/worker-<type>-template.json
# Reduce token budget to spawn more workers
```

### Reduce Resource Usage

#### Reduce Concurrent Workers

```bash
# If CPU/memory saturated:

# 1. Check current worker count
active=$(ls coordination/worker-specs/active/ | wc -l)
echo "Active workers: $active"

# 2. Implement worker throttling
# Edit worker daemon to limit concurrent workers
vim scripts/worker-daemon.sh

# Add max worker check:
# MAX_WORKERS=10
# current=$(ls coordination/worker-specs/active/ | wc -l)
# if [ $current -ge $MAX_WORKERS ]; then
#     echo "Max workers reached, throttling..."
#     sleep 60
# fi

# 3. Restart worker daemon
kill $(cat /tmp/commit-relay-worker-daemon.pid)
./scripts/worker-daemon.sh &
```

#### Cleanup Resource Leaks

```bash
# Check for zombie workers holding resources
zombie_count=$(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)
echo "Zombie workers: $zombie_count"

if [ $zombie_count -gt 0 ]; then
    echo "Cleaning up zombies..."
    ./scripts/cleanup-zombie-workers.sh
fi

# Check for orphaned processes
ps aux | grep -E "worker-" | grep -v grep

# Kill orphaned worker processes
for pid in $(ps aux | grep -E "worker-" | grep -v grep | awk '{print $2}'); do
    if ! ls coordination/worker-specs/active/*.json | xargs grep -l "\"pid\": $pid" > /dev/null 2>&1; then
        echo "Orphaned worker process: $pid"
        read -p "Kill process $pid? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            kill -9 $pid
        fi
    fi
done
```

### Optimize Daemon Performance

#### Archive Large Log Files

```bash
# Check log file sizes
du -h agents/logs/system/*.log | sort -rh | head -10

# Archive logs >10MB
for log in agents/logs/system/*.log; do
    size=$(stat -f%z "$log" 2>/dev/null || stat -c%s "$log" 2>/dev/null)
    if [ $size -gt 10485760 ]; then  # 10MB
        echo "Archiving large log: $log ($(($size / 1048576))MB)"
        gzip "$log"
        touch "$log"  # Create new empty log
    fi
done
```

#### Optimize JSONL Files

```bash
# Trim large JSONL event logs
for jsonl_file in coordination/*.jsonl; do
    line_count=$(wc -l < "$jsonl_file")

    if [ $line_count -gt 10000 ]; then
        echo "Trimming $jsonl_file ($line_count lines)"

        # Keep last 5000 lines
        tail -5000 "$jsonl_file" > "${jsonl_file}.tmp"
        mv "${jsonl_file}.tmp" "$jsonl_file"
    fi
done

# Archive old routing decisions
cutoff_date=$(date -d '30 days ago' +%Y-%m-%d)
jq -c "select(.timestamp >= \"$cutoff_date\")" \
    coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl > \
    /tmp/routing-recent.jsonl
mv /tmp/routing-recent.jsonl \
    coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl
```

#### Reduce Daemon Frequency

```bash
# For non-critical daemons, reduce check frequency

# Example: Metrics snapshot daemon
vim scripts/metrics-snapshot-daemon.sh

# Change cycle interval:
# CYCLE_INTERVAL=60  # from 30s to 60s

# Restart daemon
kill $(cat /tmp/commit-relay-metrics-snapshot-daemon.pid)
./scripts/metrics-snapshot-daemon.sh &
```

### Optimize Disk I/O

#### Move Logs to Separate Disk

```bash
# If possible, move logs to dedicated disk
# (Reduces contention with state files)

# Create new log directory on separate mount
sudo mkdir -p /mnt/commit-relay-logs

# Move existing logs
mv agents/logs/* /mnt/commit-relay-logs/

# Create symlink
ln -s /mnt/commit-relay-logs agents/logs

# Update log paths in daemons if needed
```

#### Implement Log Rotation

```bash
# Create logrotate config
cat > /etc/logrotate.d/commit-relay <<EOF
/Users/ryandahlberg/Projects/commit-relay/agents/logs/system/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $(whoami) $(whoami)
}
EOF

# Test logrotate
logrotate -f /etc/logrotate.d/commit-relay
```

---

## Verification

```bash
# 1. Recheck system resources
echo "CPU Usage:"
top -b -n1 | grep "Cpu(s)" || top -l 1 | grep "CPU usage"

echo "Memory Usage:"
free -h || vm_stat

echo "Disk Usage:"
df -h | grep -E "/$|commit-relay"

# 2. Check task processing improved
echo "Task queue status:"
cat coordination/task-queue.json | jq '{
    queued: ([.tasks[] | select(.status == "queued")] | length),
    in_progress: ([.tasks[] | select(.status == "in_progress")] | length)
}'

# Should show: queued <5, in_progress moving

# 3. Check worker performance
echo "Active workers:"
ls coordination/worker-specs/active/ | wc -l

# 4. Monitor for 15 minutes
watch -n 30 './scripts/dashboards/system-live.sh'

# 5. Check daemon cycle times improved
tail -f agents/logs/system/worker-daemon.log | grep "cycle completed"

# Should show cycle times <10s
```

---

## Prevention

### Proactive Monitoring

```bash
# Add to daily operations checklist

# 1. Daily resource check
echo "Daily resource check - $(date)" >> /tmp/resource-check.log
top -b -n1 | head -10 >> /tmp/resource-check.log
df -h >> /tmp/resource-check.log

# 2. Weekly log cleanup
find agents/logs -name "*.log" -size +50M -mtime +7 -exec gzip {} \;

# 3. Monthly JSONL archiving
# Archive old events, routing decisions, metrics

# 4. Quarterly performance baseline
# Record current performance metrics for comparison
```

### Capacity Planning

```bash
# Monitor trends to predict capacity needs

# Task throughput trend
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "completed") |
    .updated_at' | cut -d'T' -f1 | sort | uniq -c

# Worker usage trend
cat coordination/metrics-snapshots.jsonl | \
    jq -r '[.timestamp, .workers.active] | @tsv' | tail -100

# Token budget trend
cat coordination/metrics-snapshots.jsonl | \
    jq -r '[.timestamp, .token_budget.available] | @tsv' | tail -100
```

### Performance Tuning Guide

1. **Task Queue**: Keep depth <10 for optimal throughput
2. **Worker Count**: 5-10 concurrent workers ideal for most systems
3. **Token Budget**: Maintain >30% available for burst capacity
4. **Daemon Cycles**: Keep <10s per cycle
5. **Log Files**: Rotate when >50MB
6. **JSONL Files**: Trim when >10,000 lines
7. **Disk Space**: Keep >20% free

---

## Related Runbooks

- [Daily Operations](./daily-operations.md) - Regular performance monitoring
- [Token Budget Exhaustion](./token-budget-exhaustion.md) - Budget bottlenecks
- [Worker Failure](./worker-failure.md) - Worker performance issues
- [Emergency Recovery](./emergency-recovery.md) - System-wide performance collapse

---

## Quick Reference

### Common Commands

```bash
# Quick performance check
top -b -n1 | head -10
free -h
df -h

# Task queue depth
cat coordination/task-queue.json | jq '[.tasks[]] | length'

# Active worker count
ls coordination/worker-specs/active/ | wc -l

# Daemon cycle times
grep "cycle completed" agents/logs/system/*-daemon.log | tail -20

# Resource hogs
ps aux --sort=-%cpu | head -10
```

### Decision Tree

```
Slow Performance
├─ High task queue depth
│  ├─ Few workers → Spawn more workers
│  └─ Workers slow → Optimize worker types
│
├─ High CPU/memory
│  ├─ Too many workers → Throttle workers
│  └─ Resource leak → Cleanup zombies
│
├─ High disk I/O
│  ├─ Large logs → Archive/rotate logs
│  └─ Large data files → Trim JSONL files
│
└─ Slow daemons
   ├─ Large data → Archive old data
   └─ High frequency → Reduce cycle frequency
```

---

## Escalation Path

1. **Tier 1**: Resource cleanup, log rotation (SRE)
2. **Tier 2**: Configuration tuning, capacity planning (DevOps)
3. **Tier 3**: Architecture changes, infrastructure scaling (Architecture)

**Escalate to Tier 2 if:**
- Performance issues persist after cleanup
- Need configuration or architecture changes
- Capacity planning required

**Escalate to Tier 3 if:**
- Infrastructure scaling needed
- Fundamental architecture bottlenecks
- Major system redesign required

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
