# Daily Operations Checklist

## Overview

Daily operational procedures for maintaining a healthy Commit-Relay system. This checklist should be completed every business day to ensure system reliability and catch issues early.

**Time Required**: 10-15 minutes
**Frequency**: Daily (weekdays)
**Owner**: DevOps/SRE Team

---

## Morning Health Check (5 minutes)

### 1. System Dashboard Review

```bash
# Launch real-time dashboard
./scripts/dashboards/system-live.sh

# Verify the following are GREEN:
# ✓ All 9/9 daemons running
# ✓ Token budget >20% available
# ✓ No critical health alerts
# ✓ Workers count is reasonable (not all zombie)
```

**Expected State**:
- Daemons: 9/9 healthy
- Active workers: 0-20 (depending on workload)
- Token budget: >20,000 available
- Health alerts: 0 critical, <3 warnings

**Action if not GREEN**:
- See [Daemon Failure Runbook](./daemon-failure.md) if daemons down
- See [Token Budget Exhaustion](./token-budget-exhaustion.md) if budget low
- See [Worker Failure Runbook](./worker-failure.md) if high zombie count

### 2. Daemon Status Check

```bash
# Quick daemon health check
./scripts/wizards/daemon-control.sh
# Select option 8: Health check

# OR manual check
for pidfile in /tmp/commit-relay-*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        if ps -p $pid > /dev/null 2>&1; then
            echo "✓ $(basename $pidfile .pid)"
        else
            echo "✗ $(basename $pidfile .pid) - NEEDS RESTART"
        fi
    else
        echo "✗ $(basename $pidfile .pid) - PID FILE MISSING"
    fi
done
```

**Action Items**:
- [ ] All 9 daemons running
- [ ] If any daemon stopped, restart using wizard
- [ ] Check daemon logs for errors from overnight

### 3. Review Overnight Alerts

```bash
# Check health alerts from last 24 hours
cat coordination/health-alerts.json | \
  jq '.alerts[] | select(.timestamp > "'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'")' | \
  jq -s 'group_by(.severity) | map({severity: .[0].severity, count: length})'

# Check for critical alerts
cat coordination/health-alerts.json | \
  jq '.alerts[] | select(.severity == "critical")' | \
  jq -s '.'
```

**Expected State**:
- Critical alerts: 0
- Warnings: <5
- Info: Any number

**Action Items**:
- [ ] Review all critical alerts (if any)
- [ ] Investigate warning alerts
- [ ] Document any recurring patterns
- [ ] Create tickets for issues needing follow-up

---

## Token Budget Review (2 minutes)

### 4. Check Token Budget Health

```bash
# Review current token budget
cat coordination/token-budget.json | jq '{
    total: .total,
    used: .used,
    available: .available,
    percentage_used: ((.used / .total) * 100 | floor)
}'

# Check for token leaks (zombie workers holding tokens)
ls coordination/worker-specs/zombie/ | wc -l

# Check recent token budget changes
cat coordination/metrics-snapshots.jsonl | \
  tail -20 | \
  jq -r '[.timestamp, .token_budget.available] | @tsv'
```

**Expected State**:
- Available tokens: >20,000 (>20%)
- Zombie workers: <3
- Token budget trend: Stable or recovering

**Action Items**:
- [ ] Token budget >20% available
- [ ] If <20%, cleanup zombie workers
- [ ] If persistent low budget, investigate token leaks
- [ ] Review worker token allocations for optimization

### 5. Cleanup Zombie Workers (if needed)

```bash
# List zombie workers
ls -la coordination/worker-specs/zombie/ | tail -10

# Check if zombies are holding significant tokens
for zombie in coordination/worker-specs/zombie/*.json; do
    echo "$(basename $zombie): $(jq -r '.token_budget.allocated // 0' $zombie) tokens"
done

# If self-healing not cleaning up, manual cleanup:
# (Usually not needed - auto-cleanup should handle this)
find coordination/worker-specs/zombie/ -name "*.json" -mtime +1 -delete
```

**Action Items**:
- [ ] <3 zombie workers present
- [ ] Zombies older than 1 hour cleaned up
- [ ] If >10 zombies, investigate root cause

---

## Worker Health Review (3 minutes)

### 6. Active Worker Status

```bash
# Count active workers by type
for spec in coordination/worker-specs/active/*.json; do
    jq -r '.worker_type' "$spec"
done | sort | uniq -c

# Check for long-running workers (>1 hour)
for spec in coordination/worker-specs/active/*.json; do
    created=$(jq -r '.created_at' "$spec")
    worker_id=$(jq -r '.worker_id' "$spec")
    created_ts=$(date -d "$created" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$created" +%s 2>/dev/null)
    now_ts=$(date +%s)
    age_hours=$(( (now_ts - created_ts) / 3600 ))

    if [ $age_hours -gt 1 ]; then
        echo "⚠ $worker_id running for ${age_hours}h"
    fi
done

# Check worker health scores
for spec in coordination/worker-specs/active/*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    health=$(jq -r '.heartbeat.health_score // 0' "$spec")

    if [ $(echo "$health < 70" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        echo "⚠ $worker_id health score: $health"
    fi
done
```

**Expected State**:
- Active workers: 0-20
- No workers running >2 hours (unless expected)
- All worker health scores >70

**Action Items**:
- [ ] Investigate workers running >2 hours
- [ ] Check low health score workers (<70)
- [ ] Verify workers are making progress

---

## Task Queue Review (2 minutes)

### 7. Task Queue Status

```bash
# Review task queue status
cat coordination/task-queue.json | jq '{
    queued: [.tasks[] | select(.status == "queued")] | length,
    in_progress: [.tasks[] | select(.status == "in_progress")] | length,
    completed: [.tasks[] | select(.status == "completed")] | length,
    failed: [.tasks[] | select(.status == "failed")] | length
}'

# Check for stuck tasks (in_progress >2 hours)
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "in_progress")' | \
  jq -r '[.task_id, .created_at] | @tsv'
```

**Expected State**:
- Queued tasks: 0-10
- In-progress tasks: 0-5
- No tasks stuck >2 hours

**Action Items**:
- [ ] High queue backlog? Scale up workers or investigate bottleneck
- [ ] Stuck tasks? Check assigned workers
- [ ] Failed tasks? Review failure reasons

---

## Pattern Detection Review (2 minutes)

### 8. Review Detected Failure Patterns

```bash
# Check pattern detection metrics
cat coordination/metrics/failure-pattern-metrics.json | jq .

# List high-confidence patterns
cat coordination/patterns/failure-patterns.jsonl | \
  jq 'select(.confidence > 0.7)' | \
  jq -s 'group_by(.category) | map({category: .[0].category, count: length})'

# Check recent auto-fix applications
cat coordination/auto-fix/fix-history.jsonl | tail -10 | jq '{
    fix_id: .fix_id,
    pattern: .pattern_id,
    applied_at: .applied_at,
    status: .status
}'
```

**Expected State**:
- Detected patterns: <10 total
- High-confidence patterns: <3
- Auto-fix success rate: >80%

**Action Items**:
- [ ] Review high-confidence patterns
- [ ] Verify auto-fixes are working
- [ ] Document recurring patterns for investigation
- [ ] Update fix registry if new patterns emerge

---

## Log Review (2 minutes)

### 9. Check System Logs for Errors

```bash
# Check daemon logs for errors
grep -i "error\|critical\|failed" agents/logs/system/*.log | \
  grep $(date +%Y-%m-%d) | \
  tail -20

# Check for worker failures
grep -i "worker.*failed\|worker.*zombie" coordination/dashboard-events.jsonl | \
  tail -10 | \
  jq -r '[.timestamp, .event_type, .worker_id] | @tsv'

# Check for circuit breaker trips
grep "circuit_breaker.*tripped" coordination/dashboard-events.jsonl | \
  tail -5
```

**Action Items**:
- [ ] No critical errors in daemon logs
- [ ] Worker failures <5 in last 24h
- [ ] No circuit breakers tripped
- [ ] If issues found, investigate and document

---

## Metrics and Trends (Optional - Weekly)

### 10. Weekly Metrics Review

Run this section once per week (e.g., Monday):

```bash
# Worker spawn/completion rate (last 7 days)
cat coordination/metrics-snapshots.jsonl | \
  tail -10080 | \
  jq -r '[.timestamp, .workers.active] | @tsv' | \
  # Plot or analyze trend

# Task completion rate
cat coordination/metrics-snapshots.jsonl | \
  tail -10080 | \
  jq -r '[.timestamp, .tasks.completed] | @tsv'

# Pattern detection trends
cat coordination/metrics-snapshots.jsonl | \
  tail -10080 | \
  jq -r '[.timestamp, .patterns.total] | @tsv'

# Token budget efficiency
cat coordination/metrics-snapshots.jsonl | \
  tail -10080 | \
  jq -r '[.timestamp, .token_budget.available] | @tsv'
```

**Action Items**:
- [ ] Worker efficiency improving or stable
- [ ] Task completion rate meeting SLAs
- [ ] Pattern detection catching failures
- [ ] Token budget usage optimized

---

## End-of-Day Wrap-Up (Optional)

### 11. Daily Summary Report

```bash
# Generate daily summary (optional script)
# ./scripts/generate-daily-summary.sh $(date +%Y-%m-%d)

# Manual summary:
echo "=== Daily Operations Summary $(date +%Y-%m-%d) ==="
echo "Daemons: $(ps aux | grep -c 'commit-relay.*daemon')/9"
echo "Active Workers: $(ls coordination/worker-specs/active/ | wc -l)"
echo "Token Budget: $(cat coordination/token-budget.json | jq -r '.available') available"
echo "Tasks Completed Today: $(cat coordination/task-queue.json | jq '[.tasks[] | select(.completed_at | startswith("'$(date +%Y-%m-%d)'"))] | length')"
echo "Alerts: $(cat coordination/health-alerts.json | jq '[.alerts[] | select(.timestamp | startswith("'$(date +%Y-%m-%d)'"))] | length')"
```

---

## Checklist Summary

Daily Checklist:

- [ ] System dashboard reviewed - all green
- [ ] All 9 daemons running and healthy
- [ ] Overnight alerts reviewed and actioned
- [ ] Token budget >20% available
- [ ] Zombie workers <3
- [ ] Active workers have healthy status
- [ ] No tasks stuck >2 hours
- [ ] Failure patterns reviewed
- [ ] Auto-fixes working correctly
- [ ] System logs show no critical errors

Weekly Checklist:

- [ ] Metrics trends reviewed
- [ ] Performance optimization opportunities identified
- [ ] Runbooks updated based on incidents
- [ ] Pattern detection effectiveness assessed
- [ ] Token budget optimization reviewed

---

## Escalation

**Escalate to management if:**
- System health degrading despite interventions
- Recurring issues not being resolved
- Resource constraints limiting operations
- Need for architectural changes

---

## Related Runbooks

- [Worker Failure](./worker-failure.md)
- [Daemon Failure](./daemon-failure.md)
- [Token Budget Exhaustion](./token-budget-exhaustion.md)
- [Self-Healing System](./self-healing-system.md)
- [Emergency Recovery](./emergency-recovery.md)

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial checklist creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
