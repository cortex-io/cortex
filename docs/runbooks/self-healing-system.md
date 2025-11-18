# Self-Healing System Runbook

## Overview

Guide to understanding, operating, and troubleshooting the Commit-Relay self-healing system (Phase 4). The self-healing system provides automatic failure detection and recovery through heartbeat monitoring, zombie cleanup, worker restart, pattern detection, and auto-fix capabilities.

**Complexity**: ADVANCED
**Estimated Reading Time**: 15 minutes
**Owner**: DevOps/SRE Team

---

## System Components

The self-healing system consists of 5 integrated subsystems:

### 4.1: Heartbeat Monitoring

**Purpose**: Track worker health in real-time

**Components**:
- Heartbeat library (`scripts/lib/heartbeat.sh`)
- Heartbeat emitter (runs alongside each worker)
- Heartbeat monitor daemon (`scripts/daemons/heartbeat-monitor-daemon.sh`)

**How It Works**:
1. Each worker emits heartbeat every 30 seconds
2. Heartbeat includes health score (0-100)
3. Monitor daemon checks for missed heartbeats
4. Alerts triggered on missed heartbeats:
   - Warning: 60s (2 missed)
   - Critical: 120s (4 missed)
   - Zombie: 300s (10 missed)

**Status Check**:
```bash
# Check heartbeat monitor daemon
ps aux | grep heartbeat-monitor-daemon

# View heartbeat logs
tail -f agents/logs/system/heartbeat-monitor-daemon.log

# Check worker heartbeats
cat coordination/worker-specs/active/worker-<ID>.json | jq '.heartbeat'
```

### 4.2: Zombie Detection & Cleanup

**Purpose**: Automatically detect and cleanup zombie workers

**Components**:
- Zombie cleanup library (`scripts/lib/zombie-cleanup.sh`)
- Zombie cleanup policy (`coordination/config/zombie-cleanup-policy.json`)
- Integrated with heartbeat monitor

**How It Works**:
1. Heartbeat monitor detects zombie (300s no heartbeat)
2. Double-checks zombie status
3. Terminates worker process (SIGTERM → SIGKILL)
4. Archives worker logs
5. Recovers token budget
6. Moves spec to zombie directory

**Status Check**:
```bash
# List zombie workers
ls -la coordination/worker-specs/zombie/

# Check cleanup policy
cat coordination/config/zombie-cleanup-policy.json | jq .

# Recent zombie cleanup events
grep "zombie_cleanup" coordination/dashboard-events.jsonl | tail -10 | jq .
```

### 4.3: Automatic Worker Restart

**Purpose**: Intelligently restart failed workers with exponential backoff

**Components**:
- Worker restart library (`scripts/lib/worker-restart.sh`)
- Worker restart policy (`coordination/config/worker-restart-policy.json`)
- Worker restart daemon (`scripts/daemons/worker-restart-daemon.sh`)
- Restart queue (`coordination/restart-queue/`)

**How It Works**:
1. After zombie cleanup, evaluate restart eligibility
2. Check retry count, circuit breaker, rate limits
3. Calculate exponential backoff delay (30s → 300s)
4. Queue restart with delay
5. Restart daemon processes queue every 10s
6. Execute restart with preserved state

**Status Check**:
```bash
# Check restart daemon
ps aux | grep worker-restart-daemon

# View restart logs
tail -f agents/logs/system/worker-restart-daemon.log

# Check restart queue
ls -la coordination/restart-queue/

# Restart policy
cat coordination/config/worker-restart-policy.json | jq .

# Circuit breaker status
grep "circuit_breaker" coordination/dashboard-events.jsonl | tail -10 | jq .
```

### 4.4: Failure Pattern Detection

**Purpose**: Learn from failures and identify patterns

**Components**:
- Pattern detection library (`scripts/lib/failure-pattern-detection.sh`)
- Pattern detection policy (`coordination/config/failure-pattern-detection-policy.json`)
- Pattern detection daemon (`scripts/daemons/failure-pattern-daemon.sh`)
- Pattern database (`coordination/patterns/failure-patterns.jsonl`)

**How It Works**:
1. Collects failure events (zombie, restart, heartbeat critical)
2. Categorizes failures (transient, resource, systemic, data, environmental)
3. Extracts pattern signatures
4. Detects frequency patterns (3+ occurrences in 24h)
5. Calculates confidence scores
6. Stores patterns in JSONL database

**Status Check**:
```bash
# Check pattern detection daemon
ps aux | grep failure-pattern-daemon

# View pattern logs
tail -f agents/logs/system/failure-pattern-daemon.log

# View detected patterns
cat coordination/patterns/failure-patterns.jsonl | jq .

# High-confidence patterns
cat coordination/patterns/failure-patterns.jsonl | jq 'select(.confidence > 0.7)'

# Pattern metrics
cat coordination/metrics/failure-pattern-metrics.json | jq .
```

### 4.5: Auto-Fix Framework

**Purpose**: Automatically remediate known failure patterns

**Components**:
- Auto-fix library (`scripts/lib/auto-fix.sh`)
- Fix registry (`coordination/config/auto-fix-registry.json`)
- Auto-fix policy (`coordination/config/auto-fix-policy.json`)
- Auto-fix daemon (`scripts/daemons/auto-fix-daemon.sh`)
- Fix history (`coordination/auto-fix/fix-history.jsonl`)

**How It Works**:
1. Polls for high-confidence patterns (>0.7) every 10 minutes
2. Matches patterns to fixes in registry
3. Validates safety score (0.90+ auto-apply, 0.70-0.89 monitored)
4. Checks prerequisites and rate limits
5. Applies fix (modify config, restart worker, etc.)
6. Validates success over 24h
7. Automatic rollback on failure

**Status Check**:
```bash
# Check auto-fix daemon
ps aux | grep auto-fix-daemon

# View auto-fix logs
tail -f agents/logs/system/auto-fix-daemon.log

# Fix registry
cat coordination/config/auto-fix-registry.json | jq .

# Fix history
cat coordination/auto-fix/fix-history.jsonl | jq .

# Recent fixes
cat coordination/auto-fix/fix-history.jsonl | tail -10 | jq .

# Fix success rate
cat coordination/auto-fix/fix-history.jsonl | \
    jq -s '[group_by(.status) | .[] | {status: .[0].status, count: length}]'
```

---

## Operating the Self-Healing System

### Verify All Components Running

```bash
# Check all self-healing daemons
echo "=== Self-Healing System Status ==="

# Heartbeat Monitor
if ps aux | grep heartbeat-monitor-daemon | grep -v grep > /dev/null; then
    echo "✓ Heartbeat Monitor: Running"
else
    echo "✗ Heartbeat Monitor: Stopped"
fi

# Worker Restart Daemon
if ps aux | grep worker-restart-daemon | grep -v grep > /dev/null; then
    echo "✓ Worker Restart: Running"
else
    echo "✗ Worker Restart: Stopped"
fi

# Pattern Detection Daemon
if ps aux | grep failure-pattern-daemon | grep -v grep > /dev/null; then
    echo "✓ Pattern Detection: Running"
else
    echo "✗ Pattern Detection: Stopped"
fi

# Auto-Fix Daemon
if ps aux | grep auto-fix-daemon | grep -v grep > /dev/null; then
    echo "✓ Auto-Fix: Running"
else
    echo "✗ Auto-Fix: Stopped"
fi
```

### Start All Self-Healing Daemons

```bash
# Using daemon control wizard
./scripts/wizards/daemon-control.sh
# Select option 6: Start all daemons

# Or manually start each
scripts/daemons/heartbeat-monitor-daemon.sh &
scripts/daemons/worker-restart-daemon.sh &
scripts/daemons/failure-pattern-daemon.sh &
scripts/daemons/auto-fix-daemon.sh &

# Verify started
sleep 3
ps aux | grep "daemon" | grep -v grep
```

### Monitor Self-Healing Activity

```bash
# Real-time monitoring
watch -n 5 'echo "=== Self-Healing Activity ===";
echo "Heartbeat events:"; grep "heartbeat" coordination/dashboard-events.jsonl | tail -3;
echo "\nZombie cleanups:"; grep "zombie_cleanup" coordination/dashboard-events.jsonl | tail -3;
echo "\nRestarts:"; ls coordination/restart-queue/ | wc -l;
echo "\nPatterns:"; cat coordination/patterns/failure-patterns.jsonl | wc -l;
echo "\nFixes:"; cat coordination/auto-fix/fix-history.jsonl | wc -l'

# Or use dashboard
./scripts/dashboards/system-live.sh
```

### Review Self-Healing Effectiveness

```bash
# Recovery success rate
echo "=== Self-Healing Metrics ==="

# Zombie cleanup success
total_zombies=$(ls coordination/worker-specs/zombie/ 2>/dev/null | wc -l)
cleaned_zombies=$(grep "zombie_cleanup_success" coordination/dashboard-events.jsonl | wc -l)
echo "Zombie cleanup rate: $cleaned_zombies cleaned, $total_zombies remaining"

# Restart success rate
total_restarts=$(cat coordination/auto-fix/fix-history.jsonl | grep "restart" | wc -l)
successful_restarts=$(cat coordination/auto-fix/fix-history.jsonl | grep "restart" | jq 'select(.status == "success")' | wc -l)
if [ $total_restarts -gt 0 ]; then
    restart_rate=$(( (successful_restarts * 100) / total_restarts ))
    echo "Restart success rate: ${restart_rate}% ($successful_restarts/$total_restarts)"
fi

# Auto-fix success rate
total_fixes=$(cat coordination/auto-fix/fix-history.jsonl | wc -l)
successful_fixes=$(cat coordination/auto-fix/fix-history.jsonl | jq 'select(.status == "success")' | wc -l)
if [ $total_fixes -gt 0 ]; then
    fix_rate=$(( (successful_fixes * 100) / total_fixes ))
    echo "Auto-fix success rate: ${fix_rate}% ($successful_fixes/$total_fixes)"
fi

# Mean time to detection
echo "\nMean time to detection: <5 minutes (heartbeat interval)"

# Mean time to recovery
echo "Mean time to recovery: <2 minutes (cleanup + restart)"
```

---

## Tuning the Self-Healing System

### Adjust Heartbeat Thresholds

```bash
# Edit heartbeat monitor settings
vim scripts/daemons/heartbeat-monitor-daemon.sh

# Key thresholds:
# - HEARTBEAT_INTERVAL=30  # How often workers emit
# - WARNING_THRESHOLD=60   # 2 missed heartbeats
# - CRITICAL_THRESHOLD=120 # 4 missed heartbeats
# - ZOMBIE_THRESHOLD=300   # 10 missed heartbeats

# For faster detection (more aggressive):
# ZOMBIE_THRESHOLD=180  # 6 missed heartbeats (3 minutes)

# For slower detection (less aggressive):
# ZOMBIE_THRESHOLD=600  # 20 missed heartbeats (10 minutes)

# Restart heartbeat monitor after changes
pkill -f heartbeat-monitor-daemon
./scripts/daemons/heartbeat-monitor-daemon.sh &
```

### Adjust Restart Policy

```bash
# Edit restart policy
vim coordination/config/worker-restart-policy.json

# Key settings:
# - max_retries: 1-3 (how many restart attempts)
# - backoff_base_seconds: 30 (initial retry delay)
# - backoff_max_seconds: 300 (max retry delay)
# - circuit_breaker.failure_threshold: 5 (failures before trip)
# - circuit_breaker.window_seconds: 900 (15 min window)

# More aggressive (faster restarts):
jq '.backoff_base_seconds = 15 | .backoff_max_seconds = 120' \
    coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# Less aggressive (more cautious):
jq '.max_retries = 1 | .backoff_base_seconds = 60' \
    coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# No restart needed - daemon reads config on each cycle
```

### Configure Pattern Detection

```bash
# Edit pattern detection policy
vim coordination/config/failure-pattern-detection-policy.json

# Key settings:
# - min_occurrences: 3 (minimum for pattern)
# - time_window_hours: 24 (pattern window)
# - min_confidence: 0.7 (threshold for action)

# More sensitive (detect patterns faster):
jq '.detection_thresholds.min_occurrences = 2 | .detection_thresholds.time_window_hours = 12' \
    coordination/config/failure-pattern-detection-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/failure-pattern-detection-policy.json

# Less sensitive (avoid false positives):
jq '.detection_thresholds.min_occurrences = 5 | .detection_thresholds.min_confidence = 0.8' \
    coordination/config/failure-pattern-detection-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/failure-pattern-detection-policy.json
```

### Manage Auto-Fix Registry

```bash
# View available fixes
cat coordination/config/auto-fix-registry.json | jq '.fixes[] | {id: .fix_id, category: .category, safety: .safety_score}'

# Add custom fix
cat > /tmp/new-fix.json <<EOF
{
  "fix_id": "fix_custom_timeout",
  "name": "Increase Custom Worker Timeout",
  "category": "configuration",
  "safety_score": 0.85,
  "pattern_match": {
    "category": "resource",
    "type": "timeout",
    "worker_type": "custom-worker"
  },
  "actions": [
    {
      "type": "modify_config",
      "target": "worker_spec",
      "field": "timeout_minutes",
      "operation": "multiply",
      "value": 1.5
    }
  ]
}
EOF

# Add to registry
jq '.fixes += [input]' coordination/config/auto-fix-registry.json /tmp/new-fix.json > /tmp/registry.json
mv /tmp/registry.json coordination/config/auto-fix-registry.json

# Disable specific fix
jq '(.fixes[] | select(.fix_id == "fix_increase_timeout")).enabled = false' \
    coordination/config/auto-fix-registry.json > /tmp/registry.json
mv /tmp/registry.json coordination/config/auto-fix-registry.json
```

---

## Troubleshooting

### Self-Healing Not Working

**Problem**: Workers failing but not being recovered

**Diagnosis**:
```bash
# Check all daemons running
ps aux | grep -E "heartbeat-monitor|worker-restart|failure-pattern|auto-fix" | grep -v grep

# Check daemon logs for errors
grep -i "error" agents/logs/system/heartbeat-monitor-daemon.log
grep -i "error" agents/logs/system/worker-restart-daemon.log
grep -i "error" agents/logs/system/failure-pattern-daemon.log
grep -i "error" agents/logs/system/auto-fix-daemon.log

# Check if workers are emitting heartbeats
grep "heartbeat" coordination/dashboard-events.jsonl | tail -20 | jq .
```

**Solution**:
1. Restart failed daemons
2. Verify worker heartbeat emission
3. Check policy configurations

### Zombie Cleanup Not Triggering

**Problem**: Zombie workers accumulating

**Diagnosis**:
```bash
# Check zombie count
ls coordination/worker-specs/zombie/ | wc -l

# Check heartbeat monitor detecting zombies
grep "zombie_detected" agents/logs/system/heartbeat-monitor-daemon.log

# Check zombie cleanup execution
grep "zombie_cleanup" agents/logs/system/heartbeat-monitor-daemon.log

# Check cleanup policy
cat coordination/config/zombie-cleanup-policy.json | jq '.enabled'
```

**Solution**:
```bash
# Enable zombie cleanup if disabled
jq '.enabled = true' coordination/config/zombie-cleanup-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/zombie-cleanup-policy.json

# Manually trigger cleanup
./scripts/cleanup-zombie-workers.sh

# Restart heartbeat monitor
pkill -f heartbeat-monitor-daemon
./scripts/daemons/heartbeat-monitor-daemon.sh &
```

### Workers Not Restarting

**Problem**: Zombie cleanup working but restarts not happening

**Diagnosis**:
```bash
# Check restart daemon running
ps aux | grep worker-restart-daemon

# Check restart queue
ls -la coordination/restart-queue/

# Check circuit breaker status
grep "circuit_breaker" coordination/dashboard-events.jsonl | tail -10 | jq .

# Check retry count
cat coordination/worker-specs/zombie/worker-<ID>.json | jq '.restart_metadata.retry_count'
```

**Solution**:
```bash
# Reset circuit breaker if tripped
rm -f coordination/circuit-breakers/*

# Increase max retries
jq '.max_retries = 5' coordination/config/worker-restart-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/worker-restart-policy.json

# Restart worker-restart daemon
pkill -f worker-restart-daemon
./scripts/daemons/worker-restart-daemon.sh &
```

### Patterns Not Detected

**Problem**: Failures occurring but patterns not being identified

**Diagnosis**:
```bash
# Check pattern detection daemon
ps aux | grep failure-pattern-daemon

# Check daemon logs
tail -50 agents/logs/system/failure-pattern-daemon.log

# Check failure events
grep -E "zombie|restart|heartbeat_critical" coordination/dashboard-events.jsonl | tail -20

# Check pattern database
cat coordination/patterns/failure-patterns.jsonl | wc -l
```

**Solution**:
```bash
# Lower detection thresholds
jq '.detection_thresholds.min_occurrences = 2' \
    coordination/config/failure-pattern-detection-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/failure-pattern-detection-policy.json

# Manually trigger pattern analysis
# (Pattern daemon runs every 5 minutes automatically)

# Restart pattern daemon
pkill -f failure-pattern-daemon
./scripts/daemons/failure-pattern-daemon.sh &
```

### Auto-Fix Not Applying

**Problem**: Patterns detected but fixes not being applied

**Diagnosis**:
```bash
# Check auto-fix daemon
ps aux | grep auto-fix-daemon

# Check daemon logs
tail -50 agents/logs/system/auto-fix-daemon.log

# Check detected patterns
cat coordination/patterns/failure-patterns.jsonl | jq 'select(.confidence > 0.7)'

# Check fix registry
cat coordination/config/auto-fix-registry.json | jq '.fixes[] | select(.enabled == true)'

# Check rate limits
grep "rate_limit" agents/logs/system/auto-fix-daemon.log
```

**Solution**:
```bash
# Enable auto-fix if disabled
jq '.auto_fix.enabled = true' coordination/config/auto-fix-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/auto-fix-policy.json

# Lower safety threshold (CAREFUL!)
jq '.auto_fix.safety_threshold = 0.80' coordination/config/auto-fix-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/auto-fix-policy.json

# Increase rate limits
jq '.rate_limits.global_per_hour = 20' coordination/config/auto-fix-policy.json > /tmp/policy.json
mv /tmp/policy.json coordination/config/auto-fix-policy.json

# Restart auto-fix daemon
pkill -f auto-fix-daemon
./scripts/daemons/auto-fix-daemon.sh &
```

---

## Best Practices

1. **Monitor self-healing metrics daily** - Check success rates
2. **Review patterns weekly** - Identify recurring issues
3. **Tune thresholds gradually** - Don't make drastic changes
4. **Test fixes in staging first** - Validate before production
5. **Keep fix registry updated** - Add new fixes as patterns emerge
6. **Document custom fixes** - Maintain fix documentation
7. **Review circuit breaker trips** - Investigate systemic issues
8. **Backup configurations** - Before making changes
9. **Monitor token budget** - Self-healing uses tokens for restarts
10. **Regular audits** - Verify self-healing effectiveness

---

## Related Runbooks

- [Worker Failure](./worker-failure.md) - Manual worker recovery
- [Daemon Failure](./daemon-failure.md) - Self-healing daemon recovery
- [Token Budget Exhaustion](./token-budget-exhaustion.md) - Budget issues
- [Daily Operations](./daily-operations.md) - Regular health checks

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
