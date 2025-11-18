# Token Budget Exhaustion Runbook

## Overview

Procedures for handling token budget exhaustion in Commit-Relay. When the token budget is depleted, no new workers can be spawned until tokens are recovered.

**Severity**: HIGH
**Estimated Resolution Time**: 5-20 minutes
**Owner**: DevOps/SRE Team

---

## Symptoms

### Observable Indicators

- Workers fail to spawn with "insufficient tokens" error
- Token budget shows <10% available
- Tasks queuing up but not being processed
- Dashboard shows token budget in red zone
- System appears "frozen" despite healthy daemons

### Error Messages

```
ERROR: Insufficient token budget. Available: 5000, Required: 50000
WARNING: Token budget critically low (<10%)
Worker spawn failed: token budget exhausted
Cannot allocate 70000 tokens - only 5000 available
```

### Metrics/Alerts

- `token_budget.available` < 10,000 (< 10% of 100,000 total)
- Token budget percentage < 10%
- Multiple worker spawn failures
- Task queue backing up (queued > 10)

---

## Diagnosis

### Step 1: Check Current Token Budget

```bash
# View current budget
cat coordination/token-budget.json | jq '{
    total: .total,
    used: .used,
    available: .available,
    percentage_available: (((.total - .used) / .total) * 100 | floor)
}'

# Expected output when exhausted:
# {
#   "total": 100000,
#   "used": 95000,
#   "available": 5000,
#   "percentage_available": 5
# }
```

### Step 2: Identify Token Holders

```bash
# Count active workers
active_count=$(ls coordination/worker-specs/active/ | wc -l)
echo "Active workers: $active_count"

# Check token allocation per worker
echo "Token allocation by worker:"
for spec in coordination/worker-specs/active/*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    allocated=$(jq -r '.token_budget.allocated // 0' "$spec")
    echo "$worker_id: $allocated tokens"
done | sort -t: -k2 -rn

# Count zombie workers (likely culprits)
zombie_count=$(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)
echo "Zombie workers: $zombie_count"

# Check zombie token allocation
echo "Zombie token allocation:"
for zombie in coordination/worker-specs/zombie/*.json; do
    worker_id=$(basename "$zombie" .json)
    allocated=$(jq -r '.token_budget.allocated // 0' "$zombie")
    echo "$worker_id: $allocated tokens"
done | sort -t: -k2 -rn
```

### Step 3: Check for Token Leaks

```bash
# Calculate expected vs actual token usage
total_allocated=0

echo "Calculating token allocation..."

# Active workers
for spec in coordination/worker-specs/active/*.json; do
    allocated=$(jq -r '.token_budget.allocated // 0' "$spec")
    total_allocated=$((total_allocated + allocated))
done

# Zombie workers (SHOULD be cleaned up)
for zombie in coordination/worker-specs/zombie/*.json; do
    allocated=$(jq -r '.token_budget.allocated // 0' "$zombie")
    total_allocated=$((total_allocated + allocated))
    echo "WARNING: Zombie holding $allocated tokens"
done

echo "Total allocated across all workers: $total_allocated"
echo "Budget shows used: $(jq -r '.used' coordination/token-budget.json)"

# If mismatch, there's a token leak
if [ "$total_allocated" != "$(jq -r '.used' coordination/token-budget.json)" ]; then
    echo "⚠️  TOKEN LEAK DETECTED: Mismatch between allocated and reported usage"
fi
```

### Step 4: Determine Root Cause

Common causes:

| Symptom | Likely Cause | Next Step |
|---------|--------------|-----------|
| Many zombie workers | Zombie cleanup not running | Check heartbeat monitor daemon |
| Few active/zombie workers | Token leak/accounting error | Audit token allocation |
| Workers stuck in "running" | Workers not completing | Investigate stuck workers |
| High worker spawn rate | Excessive task creation | Review task generation |
| Recently increased budget | Budget misconfigured | Review budget settings |

---

## Resolution

### Immediate Mitigation

#### Option 1: Cleanup Zombie Workers (Fastest)

```bash
# Method 1: Using cleanup script
./scripts/cleanup-zombie-workers.sh

# Verify zombies cleaned up
echo "Zombies before: $(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)"

# Method 2: Manual zombie cleanup
for zombie in coordination/worker-specs/zombie/*.json; do
    worker_id=$(basename "$zombie" .json)

    # Get PID and kill process
    pid=$(jq -r '.pid // ""' "$zombie")
    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        echo "Killing zombie process $pid for $worker_id"
        kill -9 "$pid"
    fi

    # Archive zombie spec
    mkdir -p coordination/worker-specs/archived/
    mv "$zombie" coordination/worker-specs/archived/
done

# Check recovered tokens
echo "Token budget after cleanup:"
cat coordination/token-budget.json | jq '{available, used, total}'
```

#### Option 2: Kill Stuck Active Workers

```bash
# Find long-running workers (>2 hours)
current_time=$(date +%s)

for spec in coordination/worker-specs/active/*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    created_at=$(jq -r '.created_at' "$spec")

    # Convert to timestamp
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$created_at" +%s 2>/dev/null)

    age_hours=$(( (current_time - created_ts) / 3600 ))

    if [ $age_hours -gt 2 ]; then
        echo "Worker $worker_id running for ${age_hours}h - candidate for termination"

        # Confirm before killing
        read -p "Kill $worker_id? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            ./scripts/cleanup-zombie-workers.sh "$worker_id"
        fi
    fi
done
```

#### Option 3: Emergency Budget Increase (Temporary)

```bash
# ONLY if cleanup doesn't recover enough tokens
# This is a temporary measure - root cause still needs addressing

# Backup current budget
cp coordination/token-budget.json coordination/token-budget.json.backup

# Increase total budget (temporary)
jq '.total = 200000 | .available = (.total - .used)' \
    coordination/token-budget.json > /tmp/token-budget.json
mv /tmp/token-budget.json coordination/token-budget.json

echo "Emergency budget increase applied"
echo "New budget:"
cat coordination/token-budget.json | jq .

# IMPORTANT: Revert after cleanup
# mv coordination/token-budget.json.backup coordination/token-budget.json
```

### Root Cause Remediation

#### Zombie Cleanup Not Running

```bash
# Check if heartbeat monitor daemon is running
if ! ps aux | grep heartbeat-monitor-daemon | grep -v grep; then
    echo "Heartbeat monitor daemon not running - starting..."
    ./scripts/daemons/heartbeat-monitor-daemon.sh &
fi

# Check zombie cleanup policy
cat coordination/config/zombie-cleanup-policy.json | jq .

# Verify automatic cleanup is enabled
if [ "$(jq -r '.enabled' coordination/config/zombie-cleanup-policy.json)" != "true" ]; then
    echo "WARNING: Zombie cleanup is disabled!"
    echo "Enable it in coordination/config/zombie-cleanup-policy.json"
fi
```

#### Token Leak/Accounting Error

```bash
# Audit all token allocations
echo "=== Token Allocation Audit ==="

total=0

# Active workers
echo "Active Workers:"
for spec in coordination/worker-specs/active/*.json; do
    worker_id=$(jq -r '.worker_id' "$spec")
    allocated=$(jq -r '.token_budget.allocated // 0' "$spec")
    echo "  $worker_id: $allocated"
    total=$((total + allocated))
done

# Zombie workers (should be 0)
echo "Zombie Workers:"
for zombie in coordination/worker-specs/zombie/*.json; do
    worker_id=$(basename "$zombie" .json)
    allocated=$(jq -r '.token_budget.allocated // 0' "$zombie")
    echo "  $worker_id: $allocated (LEAK!)"
    total=$((total + allocated))
done

echo "Total allocated: $total"
echo "Budget shows used: $(jq -r '.used' coordination/token-budget.json)"

# If mismatch, manually fix
if [ "$total" != "$(jq -r '.used' coordination/token-budget.json)" ]; then
    echo "Fixing token accounting..."
    jq ".used = $total | .available = (.total - .used)" \
        coordination/token-budget.json > /tmp/token-budget.json
    mv /tmp/token-budget.json coordination/token-budget.json
    echo "Token budget corrected"
fi
```

#### Excessive Task Creation

```bash
# Check task creation rate
cat coordination/task-queue.json | \
    jq '.tasks[] | .created_at' | \
    cut -d'T' -f1 | \
    sort | uniq -c

# If high rate, investigate source
echo "Check task creation sources:"
cat coordination/task-queue.json | \
    jq -r '.tasks[] | .created_by // "unknown"' | \
    sort | uniq -c

# Throttle task creation if needed
# (Implement rate limiting - TODO)
```

### Verification

```bash
# 1. Check token budget recovered
echo "Token budget status:"
cat coordination/token-budget.json | jq '{
    available,
    used,
    total,
    percentage_available: (((.total - .used) / .total) * 100 | floor)
}'

# Should show >20% available

# 2. Verify workers can spawn
echo "Testing worker spawn..."
./scripts/wizards/create-worker.sh
# Should complete successfully

# 3. Check zombie count
echo "Zombie workers: $(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)"
# Should be 0 or very low

# 4. Monitor token budget
watch -n 5 'cat coordination/token-budget.json | jq .'
# Should remain stable or increase

# 5. Check task processing
cat coordination/task-queue.json | \
    jq '[.tasks[] | .status] | group_by(.) | map({status: .[0], count: length})'
# Queued tasks should be decreasing
```

---

## Prevention

### Monitoring Recommendations

1. **Token Budget Alerts**
   ```bash
   # Alert when budget <30%
   available=$(jq -r '.available' coordination/token-budget.json)
   total=$(jq -r '.total' coordination/token-budget.json)
   percentage=$(( (available * 100) / total ))

   if [ $percentage -lt 30 ]; then
       echo "ALERT: Token budget at ${percentage}%"
       # Trigger alert mechanism
   fi
   ```

2. **Zombie Worker Alerts**
   ```bash
   # Alert when zombies >5
   zombie_count=$(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)

   if [ $zombie_count -gt 5 ]; then
       echo "ALERT: $zombie_count zombie workers detected"
       # Trigger alert
   fi
   ```

3. **Dashboard Monitoring**
   - Keep system dashboard visible
   - Watch token budget progress bar
   - Monitor active worker count

### Configuration Improvements

```bash
# 1. Adjust zombie cleanup threshold (if too lenient)
vim coordination/config/zombie-cleanup-policy.json
# Set zombie_threshold_seconds to lower value (e.g., 180 instead of 300)

# 2. Enable aggressive cleanup
jq '.cleanup_policy.rate_limit = 10' \
    coordination/config/zombie-cleanup-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/zombie-cleanup-policy.json

# 3. Reduce worker token allocations (if possible)
# Review and optimize worker budgets in templates
vim coordination/worker-specs/templates/*.json
```

### Process Changes

1. **Daily Budget Review** - Check token budget every morning
2. **Zombie Cleanup Schedule** - Manual cleanup if automatic fails
3. **Worker Lifecycle Limits** - Set max worker runtime limits
4. **Task Throttling** - Limit task creation rate
5. **Budget Capacity Planning** - Monitor trends, increase budget if needed

---

## Related Runbooks

- [Worker Failure](./worker-failure.md) - Handling stuck/zombie workers
- [Daemon Failure](./daemon-failure.md) - If heartbeat monitor fails
- [Daily Operations](./daily-operations.md) - Regular budget checks
- [Self-Healing System](./self-healing-system.md) - Automatic zombie cleanup

---

## Escalation Path

1. **Tier 1**: Automatic cleanup (zombie cleanup daemon)
2. **Tier 2**: Manual cleanup (SRE runs cleanup script)
3. **Tier 3**: Token accounting fix (DevOps corrects budget)
4. **Tier 4**: Budget capacity increase (Architecture approval needed)

**Escalate to Tier 3 if:**
- Token leak persists after cleanup
- Budget accounting errors detected
- Cleanup doesn't recover sufficient tokens

**Escalate to Tier 4 if:**
- Workload legitimately exceeds budget capacity
- Frequent budget exhaustion despite cleanup
- Need to increase base budget allocation

---

## Quick Reference

### Common Commands

```bash
# Check budget
cat coordination/token-budget.json | jq '{available, used, total}'

# Cleanup zombies
./scripts/cleanup-zombie-workers.sh

# Count zombies
ls coordination/worker-specs/zombie/ | wc -l

# View token allocation
for spec in coordination/worker-specs/active/*.json; do
    echo "$(jq -r '.worker_id' $spec): $(jq -r '.token_budget.allocated' $spec)"
done
```

### Recovery Steps

```
Token budget exhausted
├─ Check zombie count
│  ├─ >5 zombies → Run cleanup script
│  │  ├─ Tokens recovered → Monitor
│  │  └─ Tokens not recovered → Check for stuck workers
│  └─ <5 zombies → Token leak investigation
│
├─ Run zombie cleanup
│  ├─ ./scripts/cleanup-zombie-workers.sh
│  ├─ Verify token recovery
│  └─ Monitor budget
│
└─ If not resolved
   ├─ Kill stuck active workers
   ├─ Audit token accounting
   └─ Emergency budget increase (temporary)
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
