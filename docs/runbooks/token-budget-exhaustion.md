# Runbook: Token Budget Exhaustion

Diagnosis and resolution when token budget is exceeded and workers cannot spawn.

---

## Symptoms

- New workers fail to spawn with "insufficient budget" error
- Task queue grows but tasks not being processed
- Dashboard shows 100% token usage
- Worker daemon logs show budget allocation failures
- Available tokens at 0 or negative

---

## Root Causes

1. **Zombie Workers**: Failed workers still holding allocated tokens
2. **Long-Running Tasks**: Workers consuming more than expected
3. **Concurrent Workers**: Too many workers running simultaneously
4. **Budget Misconfiguration**: Total budget set too low
5. **Token Leak**: Bug not releasing tokens on completion
6. **Large Tasks**: Individual tasks requiring too many tokens

---

## Diagnosis Steps

### 1. Check Current Budget Status

```bash
# View budget
cat $COMMIT_RELAY_HOME/coordination/token-budget.json | jq .

# Expected output:
# {
#   "total": 500000,
#   "used": 485000,
#   "available": 15000
# }
```

### 2. Analyze Token Allocation

```bash
# Sum of allocated tokens in active workers
ACTIVE_ALLOCATED=0
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    if [[ -f "$spec" ]]; then
        ALLOCATED=$(jq -r '.token_budget.allocated // 0' "$spec")
        ACTIVE_ALLOCATED=$((ACTIVE_ALLOCATED + ALLOCATED))
    fi
done
echo "Active workers allocated: $ACTIVE_ALLOCATED"

# Sum of zombie workers
ZOMBIE_ALLOCATED=0
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/worker-*.json; do
    if [[ -f "$spec" ]]; then
        ALLOCATED=$(jq -r '.token_budget.allocated // 0' "$spec")
        ZOMBIE_ALLOCATED=$((ZOMBIE_ALLOCATED + ALLOCATED))
    fi
done
echo "Zombie workers allocated: $ZOMBIE_ALLOCATED"

# Compare with reported usage
REPORTED=$(jq -r '.used' $COMMIT_RELAY_HOME/coordination/token-budget.json)
echo "Reported used: $REPORTED"
echo "Discrepancy: $((REPORTED - ACTIVE_ALLOCATED))"
```

### 3. List Largest Token Consumers

```bash
# Sort workers by token allocation
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    if [[ -f "$spec" ]]; then
        ID=$(jq -r '.worker_id' "$spec")
        ALLOCATED=$(jq -r '.token_budget.allocated // 0' "$spec")
        USED=$(jq -r '.token_budget.used // 0' "$spec")
        echo "$ALLOCATED|$USED|$ID"
    fi
done | sort -t'|' -k1 -rn | head -10 | \
while IFS='|' read -r alloc used id; do
    printf "%-30s Allocated: %8d  Used: %8d\n" "$id" "$alloc" "$used"
done
```

### 4. Check for Stuck Workers

```bash
# Workers older than 1 hour
find $COMMIT_RELAY_HOME/coordination/worker-specs/active -name "worker-*.json" -mmin +60 \
    -exec jq -r '[.worker_id, .token_budget.allocated] | @tsv' {} \;
```

### 5. Review Historical Usage

```bash
# Token budget over time
tail -20 $COMMIT_RELAY_HOME/coordination/metrics-snapshots.jsonl | \
    jq -r '[.timestamp, .token_budget.used, .token_budget.available] | @tsv' | \
    column -t
```

---

## Resolution Steps

### Immediate Actions

#### 1. Cleanup Zombie Workers

```bash
# Run cleanup script
./scripts/cleanup-zombie-workers.sh

# Verify zombies cleaned
ls $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/ | wc -l
```

#### 2. Terminate Long-Running Workers

```bash
# Find workers running > 60 minutes
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    if [[ -f "$spec" ]]; then
        CREATED=$(jq -r '.created_at // ""' "$spec")
        if [[ -n "$CREATED" ]]; then
            CREATED_TS=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${CREATED%%.*}" +%s 2>/dev/null || echo 0)
            NOW_TS=$(date +%s)
            AGE_MIN=$(( (NOW_TS - CREATED_TS) / 60 ))
            if (( AGE_MIN > 60 )); then
                ID=$(jq -r '.worker_id' "$spec")
                echo "Old worker: $ID (${AGE_MIN}min)"
            fi
        fi
    fi
done

# Terminate specific worker
WORKER_ID="worker-implementation-001"
PID=$(jq -r '.pid // empty' $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json)
[[ -n "$PID" ]] && kill $PID 2>/dev/null
mv $COMMIT_RELAY_HOME/coordination/worker-specs/active/$WORKER_ID.json \
   $COMMIT_RELAY_HOME/coordination/worker-specs/zombie/
```

#### 3. Recalculate Budget

```bash
# Calculate actual usage
USED=0
for spec in $COMMIT_RELAY_HOME/coordination/worker-specs/active/worker-*.json; do
    if [[ -f "$spec" ]]; then
        ALLOCATED=$(jq -r '.token_budget.allocated // 0' "$spec")
        USED=$((USED + ALLOCATED))
    fi
done

# Get total
TOTAL=$(jq -r '.total' $COMMIT_RELAY_HOME/coordination/token-budget.json)
AVAILABLE=$((TOTAL - USED))

# Update budget file
cat > $COMMIT_RELAY_HOME/coordination/token-budget.json << EOF
{
  "total": $TOTAL,
  "used": $USED,
  "available": $AVAILABLE,
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Budget recalculated: Used=$USED, Available=$AVAILABLE"
```

#### 4. Emergency Budget Reset

**Use with caution - may cause accounting issues**

```bash
# Only if no workers are actually running
ps aux | grep -c "worker"

# Reset to full budget
TOTAL=500000
cat > $COMMIT_RELAY_HOME/coordination/token-budget.json << EOF
{
  "total": $TOTAL,
  "used": 0,
  "available": $TOTAL,
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "Emergency reset"
}
EOF
```

### Long-term Solutions

#### 1. Increase Total Budget

```bash
# Increase budget to 1M tokens
NEW_TOTAL=1000000
CURRENT_USED=$(jq -r '.used' $COMMIT_RELAY_HOME/coordination/token-budget.json)
NEW_AVAILABLE=$((NEW_TOTAL - CURRENT_USED))

jq ".total = $NEW_TOTAL | .available = $NEW_AVAILABLE" \
   $COMMIT_RELAY_HOME/coordination/token-budget.json > /tmp/budget.json && \
mv /tmp/budget.json $COMMIT_RELAY_HOME/coordination/token-budget.json
```

#### 2. Reduce Default Worker Budgets

```bash
# Review and adjust worker type budgets
cat $COMMIT_RELAY_HOME/coordination/config/worker-types.json | jq .

# Update a specific type
jq '.worker_types["implementation-worker"].default_budget = 80000' \
   $COMMIT_RELAY_HOME/coordination/config/worker-types.json > /tmp/types.json && \
mv /tmp/types.json $COMMIT_RELAY_HOME/coordination/config/worker-types.json
```

#### 3. Limit Concurrent Workers

```bash
# Set max concurrent workers
jq '.max_concurrent_workers = 5' \
   $COMMIT_RELAY_HOME/coordination/config/system.json > /tmp/config.json && \
mv /tmp/config.json $COMMIT_RELAY_HOME/coordination/config/system.json
```

#### 4. Enable Token Recovery

Ensure workers release tokens on completion:

```bash
# Check worker completion hook
cat $COMMIT_RELAY_HOME/scripts/task-completion-hook.sh | grep -A5 "token"
```

---

## Prevention

### Monitor Token Usage

```bash
# Add to daily checks
AVAILABLE=$(jq -r '.available' $COMMIT_RELAY_HOME/coordination/token-budget.json)
TOTAL=$(jq -r '.total' $COMMIT_RELAY_HOME/coordination/token-budget.json)
PCT=$((100 - (AVAILABLE * 100 / TOTAL)))

if (( PCT > 80 )); then
    echo "WARNING: Token budget at ${PCT}%"
fi
```

### Set Budget Alerts

Configure alerts when budget exceeds threshold:

```bash
# In metrics snapshot daemon, add:
if (( available < 50000 )); then
    ./scripts/emit-event.sh --type "token_budget_low" --severity "warning" \
        --message "Available tokens: $available"
fi
```

### Regular Cleanup Schedule

```bash
# Add to crontab - cleanup every hour
0 * * * * $COMMIT_RELAY_HOME/scripts/cleanup-zombie-workers.sh >> /tmp/cleanup.log 2>&1
```

### Task Decomposition

Break large tasks into smaller pieces that fit within budget constraints.

---

## Verification

After applying fixes:

```bash
# 1. Verify budget is healthy
cat $COMMIT_RELAY_HOME/coordination/token-budget.json | jq .

# 2. Confirm available > 0
AVAILABLE=$(jq -r '.available' $COMMIT_RELAY_HOME/coordination/token-budget.json)
(( AVAILABLE > 50000 )) && echo "Budget healthy: $AVAILABLE available"

# 3. Test worker spawn
./scripts/wizards/create-worker.sh

# 4. Monitor for a few minutes
watch -n 5 'cat $COMMIT_RELAY_HOME/coordination/token-budget.json | jq .'
```

---

## Escalation

If budget issues persist:

1. Review all active workers for anomalies
2. Check for token leaks in worker scripts
3. Analyze historical metrics for patterns
4. Consider temporary increase in total budget
5. Review task complexity and decomposition

---

## Related Runbooks

- [Worker Failure](./worker-failure.md)
- [Daily Operations](./daily-operations.md)
- [Performance Troubleshooting](./performance-troubleshooting.md)

---

**Last Updated**: 2025-11-21
