# Circuit Breaker Tripped Runbook

## Overview

Procedures for handling circuit breaker trips in the Commit-Relay worker restart system. Circuit breakers prevent cascading failures by halting automatic restarts when failure thresholds are exceeded.

**Severity**: HIGH
**Estimated Resolution Time**: 10-30 minutes
**Owner**: DevOps/SRE Team

---

## What is a Circuit Breaker?

Circuit breakers in Commit-Relay protect against:
- Rapid restart loops (worker fails, restarts, fails again)
- Resource exhaustion from excessive restart attempts
- Token budget depletion from failed worker spawning
- System instability from persistent failures

**States**:
- **CLOSED**: Normal operation, restarts allowed
- **OPEN**: Circuit tripped, restarts blocked
- **HALF_OPEN**: Testing recovery, limited restarts allowed

---

## Symptoms

### Observable Indicators

- Workers not restarting despite heartbeat failures
- Circuit breaker state file shows "OPEN" status
- Dashboard shows circuit breaker alerts
- Worker restart daemon logs show "circuit breaker open" messages
- Failed workers accumulating as zombies

### Error Messages

```
ERROR: Circuit breaker open for worker-type: implementation-worker
WARNING: Circuit breaker tripped - failure rate 5/5 in 300s
Worker restart blocked: circuit breaker in OPEN state
Cannot restart worker-scan-001: circuit breaker protection active
```

### Metrics/Alerts

- Circuit breaker state: OPEN or HALF_OPEN
- Failure rate exceeds threshold (default: 5 failures in 5 minutes)
- Restart attempts blocked
- Zombie worker count increasing

---

## Diagnosis

### Step 1: Identify Tripped Circuit Breaker

```bash
# Check circuit breaker states
ls -la coordination/circuit-breakers/

# View circuit breaker details
for cb in coordination/circuit-breakers/*.json; do
    echo "Circuit Breaker: $(basename $cb .json)"
    cat "$cb" | jq '{
        state,
        failure_count,
        consecutive_failures,
        last_failure_time,
        trip_threshold,
        reset_timeout
    }'
    echo ""
done

# Check for OPEN circuit breakers
find coordination/circuit-breakers -name "*.json" -exec jq -r 'select(.state == "OPEN") | "OPEN: " + input_filename' {} +
```

### Step 2: Identify Root Cause

```bash
# Check recent failures for the circuit breaker
cb_file="coordination/circuit-breakers/worker-<type>.json"

# Get failure history
cat "$cb_file" | jq '.failure_history[]' | tail -10

# Check common failure patterns
cat coordination/patterns/failure-patterns.jsonl | \
    jq -r 'select(.type | contains("<worker-type>")) |
    {pattern_id, category, type, confidence, severity}'

# Review restart attempts
grep "restart attempt" agents/logs/system/worker-restart-daemon.log | tail -20
```

### Step 3: Determine Failure Type

Common causes of circuit breaker trips:

| Symptom | Likely Cause | Next Step |
|---------|--------------|-----------|
| Same error every restart | Persistent configuration issue | Fix config, then reset circuit |
| Random failures | Transient issues (network, resources) | Wait for auto-recovery |
| Timeout errors | Tasks too complex/resource intensive | Adjust timeouts or task scope |
| Token budget errors | Budget exhausted | Cleanup zombies, increase budget |
| Dependency failures | External service down | Fix dependency, then reset |

### Step 4: Check Worker Restart Policy

```bash
# View restart policy
cat coordination/config/worker-restart-policy.json | jq .

# Key settings:
# - max_retry_attempts: Max restarts before circuit trip
# - circuit_breaker_threshold: Failures before trip (default: 5)
# - circuit_breaker_window: Time window for counting failures (default: 300s)
# - circuit_breaker_reset_timeout: How long to stay OPEN (default: 600s)
```

---

## Resolution

### Immediate Actions

#### Option 1: Wait for Auto-Recovery (Recommended for Transient Issues)

```bash
# Check circuit breaker reset timeout
cat coordination/circuit-breakers/worker-<type>.json | jq '.reset_timeout'

# Circuit breaker will automatically transition to HALF_OPEN after timeout
# Default: 10 minutes (600s)

# Monitor for auto-recovery
watch -n 30 'cat coordination/circuit-breakers/worker-<type>.json | jq .state'

# When state transitions to HALF_OPEN, system will attempt controlled restarts
```

#### Option 2: Manual Circuit Breaker Reset (After Fixing Root Cause)

**IMPORTANT**: Only reset after fixing the underlying issue!

```bash
# 1. Verify root cause is fixed
# (e.g., configuration corrected, dependency restored, etc.)

# 2. Backup current circuit breaker state
cp coordination/circuit-breakers/worker-<type>.json \
   coordination/circuit-breakers/worker-<type>.json.backup-$(date +%Y%m%d-%H%M%S)

# 3. Reset circuit breaker to CLOSED
jq '.state = "CLOSED" |
    .failure_count = 0 |
    .consecutive_failures = 0 |
    .last_state_change = now | todate' \
    coordination/circuit-breakers/worker-<type>.json > /tmp/cb-reset.json

mv /tmp/cb-reset.json coordination/circuit-breakers/worker-<type>.json

# 4. Verify reset
cat coordination/circuit-breakers/worker-<type>.json | jq .

echo "Circuit breaker reset to CLOSED state"
```

#### Option 3: Force Transition to HALF_OPEN (Testing)

```bash
# Use this to test recovery without fully resetting

jq '.state = "HALF_OPEN" |
    .last_state_change = now | todate' \
    coordination/circuit-breakers/worker-<type>.json > /tmp/cb-halfopen.json

mv /tmp/cb-halfopen.json coordination/circuit-breakers/worker-<type>.json

echo "Circuit breaker set to HALF_OPEN for testing"
```

### Root Cause Fixes

#### Configuration Issues

```bash
# Common configuration problems:

# 1. Incorrect worker type template
vim coordination/worker-specs/templates/worker-<type>-template.json
# Verify:
# - Correct command/script path
# - Valid token budget allocation
# - Appropriate timeout values

# 2. Missing dependencies
# Check worker logs for missing dependencies
grep -i "not found\|missing" agents/logs/workers/*/worker-<type>-*/worker.log

# 3. Invalid environment variables
# Check worker environment setup
cat coordination/worker-specs/templates/worker-<type>-template.json | jq '.environment'
```

#### Resource Exhaustion

```bash
# Check system resources
df -h  # Disk space
free -h  # Memory

# Check token budget
cat coordination/token-budget.json | jq .

# Cleanup zombies to free resources
./scripts/cleanup-zombie-workers.sh

# Check worker pool capacity
cat coordination/worker-pool.json | jq '.workers | length'
```

#### External Dependencies

```bash
# Test dependency connectivity
# (Example: GitHub API)
curl -I https://api.github.com

# Check service health
# (Example: Database, message queue, etc.)

# Review dependency errors in logs
grep -i "connection\|timeout\|refused" agents/logs/system/worker-restart-daemon.log
```

#### Task Complexity

```bash
# If workers are timing out:

# 1. Review task complexity
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "failed")'

# 2. Increase timeout in worker template
vim coordination/worker-specs/templates/worker-<type>-template.json
# Increase timeout value (e.g., from 900s to 1800s)

# 3. Split complex tasks into smaller subtasks
# (Application-specific - requires task redesign)
```

### Verification

```bash
# 1. Verify circuit breaker state
cat coordination/circuit-breakers/worker-<type>.json | jq '{
    state,
    failure_count,
    consecutive_failures,
    last_state_change
}'

# Should show:
# - state: "CLOSED" or "HALF_OPEN"
# - failure_count: 0 or low
# - consecutive_failures: 0

# 2. Test worker restart
# Manually trigger a worker failure to test restart
worker_id="<test-worker-id>"
kill $(jq -r '.pid' "coordination/worker-specs/active/${worker_id}.json")

# 3. Monitor restart daemon
tail -f agents/logs/system/worker-restart-daemon.log

# Should show successful restart attempt

# 4. Check circuit breaker remains CLOSED
watch -n 10 'cat coordination/circuit-breakers/worker-<type>.json | jq .state'

# 5. Monitor dashboard events
tail -f coordination/dashboard-events.jsonl | jq 'select(.event_type == "circuit_breaker")'
```

---

## Prevention

### Monitoring Recommendations

1. **Circuit Breaker Alerts**
   ```bash
   # Alert when circuit breaker trips
   grep "circuit_breaker.*OPEN" coordination/dashboard-events.jsonl | tail -1

   # Set up proactive monitoring
   watch -n 60 'find coordination/circuit-breakers -name "*.json" -exec jq -r "select(.state != \"CLOSED\") | input_filename + \": \" + .state" {} +'
   ```

2. **Failure Rate Monitoring**
   ```bash
   # Track failure rates before circuit trips
   cat coordination/patterns/failure-patterns.jsonl | \
       jq -s 'group_by(.type) |
       map({type: .[0].type, failures: length}) |
       sort_by(.failures) | reverse'
   ```

3. **Dashboard Visibility**
   - Add circuit breaker status to dashboard
   - Show failure rate trends
   - Alert on consecutive failures (before circuit trips)

### Configuration Tuning

```bash
# Adjust circuit breaker sensitivity if needed

# 1. Increase threshold (less sensitive - more restarts before trip)
jq '.circuit_breaker_threshold = 10' \
    coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# 2. Extend time window (more tolerant of intermittent failures)
jq '.circuit_breaker_window = 600' \
    coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# 3. Reduce reset timeout (faster auto-recovery)
jq '.circuit_breaker_reset_timeout = 300' \
    coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# Restart worker-restart daemon to apply changes
kill $(cat /tmp/commit-relay-worker-restart-daemon.pid)
./scripts/daemons/worker-restart-daemon.sh &
```

### Process Improvements

1. **Pre-Restart Validation** - Add health checks before restart attempts
2. **Gradual Rollout** - Test worker changes on single instance first
3. **Dependency Checks** - Verify external services before restart
4. **Resource Verification** - Check token budget before restart
5. **Failure Analysis** - Automatically analyze failures before restart

---

## Advanced Scenarios

### Scenario 1: Multiple Circuit Breakers Tripped

**Indicates**: System-wide issue affecting multiple worker types

```bash
# Check all circuit breakers
for cb in coordination/circuit-breakers/*.json; do
    state=$(jq -r '.state' "$cb")
    if [ "$state" != "CLOSED" ]; then
        echo "OPEN: $(basename $cb .json) - State: $state"
    fi
done

# Actions:
# 1. Check system resources (disk, memory, network)
# 2. Check common dependencies (API services, database)
# 3. Review recent deployments or configuration changes
# 4. Consider emergency system restart (see emergency-recovery.md)
```

### Scenario 2: Circuit Breaker Constantly Re-Tripping

**Indicates**: Root cause not properly addressed

```bash
# Track circuit breaker state changes
grep "circuit_breaker" coordination/dashboard-events.jsonl | \
    jq -r '[.timestamp, .state_transition] | @tsv' | tail -20

# Pattern: OPEN -> HALF_OPEN -> OPEN (repeated)
# Means: Workers restarting but still failing

# Actions:
# 1. Do NOT keep resetting circuit breaker
# 2. Deep dive into worker logs to find persistent issue
# 3. Consider disabling automatic restarts for this worker type temporarily
# 4. Fix root cause before re-enabling
```

### Scenario 3: Circuit Breaker Never Trips (Failures Continue)

**Indicates**: Circuit breaker not functioning or misconfigured

```bash
# Verify circuit breaker daemon is running
ps aux | grep worker-restart-daemon

# Check circuit breaker logic is being applied
grep "circuit_breaker" agents/logs/system/worker-restart-daemon.log | tail -20

# Verify configuration is loaded
cat coordination/config/worker-restart-policy.json | jq .circuit_breaker_threshold

# If threshold is too high or daemon not processing:
# - Restart worker-restart-daemon
# - Review daemon logs for errors
# - Verify circuit breaker files are being created/updated
```

---

## Related Runbooks

- [Worker Failure](./worker-failure.md) - Handling individual worker failures
- [Self-Healing System](./self-healing-system.md) - Understanding restart mechanisms
- [Emergency Recovery](./emergency-recovery.md) - System-wide failure recovery
- [Performance Troubleshooting](./performance-troubleshooting.md) - Resource issues

---

## Quick Reference

### Common Commands

```bash
# Check circuit breaker state
cat coordination/circuit-breakers/worker-<type>.json | jq .state

# List tripped circuit breakers
find coordination/circuit-breakers -name "*.json" -exec jq -r 'select(.state != "CLOSED") | input_filename' {} +

# Reset circuit breaker (after fixing root cause)
jq '.state = "CLOSED" | .failure_count = 0' \
    coordination/circuit-breakers/worker-<type>.json > /tmp/cb.json && \
    mv /tmp/cb.json coordination/circuit-breakers/worker-<type>.json

# Monitor restart daemon
tail -f agents/logs/system/worker-restart-daemon.log
```

### Decision Tree

```
Circuit Breaker Tripped
├─ Transient failures (network, temporary resource issues)
│  └─ Wait for auto-recovery (10 min default)
│
├─ Configuration error
│  ├─ Fix configuration
│  └─ Reset circuit breaker manually
│
├─ Resource exhaustion
│  ├─ Cleanup zombies
│  ├─ Increase token budget
│  └─ Reset circuit breaker
│
├─ External dependency failure
│  ├─ Restore dependency
│  └─ Reset circuit breaker
│
└─ Task complexity (timeouts)
   ├─ Increase worker timeout
   ├─ Split complex tasks
   └─ Reset circuit breaker
```

---

## Escalation Path

1. **Tier 1**: Wait for auto-recovery (SRE monitors)
2. **Tier 2**: Manual reset after root cause fix (SRE)
3. **Tier 3**: Configuration changes (DevOps)
4. **Tier 4**: System-wide issues (Architecture team)

**Escalate to Tier 3 if:**
- Multiple circuit breakers tripped simultaneously
- Circuit breaker re-trips repeatedly
- Root cause requires configuration changes
- Worker template modifications needed

**Escalate to Tier 4 if:**
- System-wide resource exhaustion
- Architecture changes needed
- Dependency failures affecting all workers
- Need to disable restart system entirely

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18

**IMPORTANT**: Never repeatedly reset circuit breakers without fixing the underlying issue!
