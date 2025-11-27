# Cortex Runbooks

Common operations and troubleshooting procedures.

## Daily Operations

### Start Cortex

```bash
# Start dashboard
cd api-server && npm start &

# Verify daemons are running
./scripts/daemon-control.sh status

# Check health
curl http://localhost:3000/api/health
```

### Stop Cortex

```bash
# Stop daemons
./scripts/daemon-control.sh stop

# Stop dashboard
pkill -f "node.*server/index.js"
```

### Check System Status

```bash
# Quick status
./scripts/status-check.sh

# Detailed worker status
./scripts/worker-status.sh

# Live monitoring dashboard
./scripts/system-live.sh
```

## Task Management

### Submit a Task

**Via API**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task-001",
    "type": "development",
    "description": "Implement user authentication feature",
    "priority": "high"
  }'
```

**Via File**:
```bash
# Edit task queue directly
nano coordination/task-queue.json

# Add task to "tasks" array
# Coordinator will pick it up automatically
```

### View Task Status

```bash
# Via API
curl http://localhost:3000/api/tasks

# Via file
cat coordination/task-queue.json | jq '.tasks[] | select(.id=="task-001")'
```

### Cancel a Task

```bash
# Edit task-queue.json
# Change status from "pending" to "cancelled"

# Or use API (if endpoint exists)
curl -X DELETE http://localhost:3000/api/tasks/task-001 \
  -H "x-api-key: your-key"
```

## Worker Management

### View Active Workers

```bash
# Dashboard
curl http://localhost:3000/api/workers

# File-based
cat coordination/worker-pool.json | jq
```

### Kill a Stuck Worker

```bash
# Find worker PID
cat coordination/worker-pool.json | jq '.workers[] | select(.status=="stuck")'

# Kill process
kill -9 <PID>

# Cleanup will happen automatically via zombie-cleanup daemon
```

### Spawn Worker Manually

```bash
./scripts/spawn-worker.sh \
  --type implementation-worker \
  --task-id task-001 \
  --master development-master \
  --priority high
```

## Token Budget Management

### Check Token Usage

```bash
# View budget
cat coordination/token-budget.json | jq

# Calculate usage percentage
jq -r '(.budget.daily.used / .budget.daily.limit * 100) | floor' coordination/token-budget.json
```

### Reset Token Budget

```bash
# WARNING: This resets usage tracking

cat > coordination/token-budget.json << 'EOF'
{
  "budget": {
    "daily": {
      "limit": 270000,
      "used": 0,
      "last_reset": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  }
}
EOF
```

### Adjust Token Limits

```bash
# Edit budget file
nano coordination/token-budget.json

# Change "limit" value
# Daily resets happen automatically at midnight
```

## Governance Operations

### View Governance Stats

```bash
curl http://localhost:3000/api/governance/enforcement
```

### Approve Critical Task

```bash
source scripts/lib/governance-enforcement.sh

approve_critical_task "task-001" "your-username"

# Approval valid for 1 hour
```

### View Governance Blocks

```bash
# Recent blocks
cat coordination/governance/overrides.jsonl | jq 'select(.event=="task_blocked")'

# Count blocks
grep -c '"event":"task_blocked"' coordination/governance/overrides.jsonl
```

### Override Governance (Use Sparingly)

```bash
# Set bypass flag
export GOVERNANCE_BYPASS=true

# Run operation
./scripts/spawn-worker.sh ...

# Unset flag
unset GOVERNANCE_BYPASS
```

## ML Validation

### Run ML Validation

```bash
# Manual run
./llm-mesh/validation/ml-validator.sh

# View results
curl http://localhost:3000/api/ml-validation

# Check latest report
cat llm-mesh/validation/reports/ml-validation-report-*.md | tail -50
```

### Enable/Disable ML Features

```bash
# Edit .env
nano .env

# Toggle features
SEMANTIC_ROUTING_ENABLED=false  # Disable semantic routing
PYTORCH_ROUTING_ENABLED=false   # Disable PyTorch routing
RAG_ENABLED=false                # Disable RAG

# Restart dashboard for changes to take effect
pkill -f "node.*server/index.js"
cd api-server && npm start &
```

## Troubleshooting

### Dashboard Won't Start

**Symptom**: `npm start` fails or port already in use

**Solution**:
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>

# Check for errors in package.json
cd api-server
npm install  # Reinstall dependencies
npm start
```

### Workers Not Spawning

**Symptom**: Tasks stay in "pending" status

**Solution**:
```bash
# Check worker daemon
./scripts/daemon-control.sh status

# Check logs
./scripts/daemon-control.sh logs | grep -A 10 "worker"

# Restart daemon
./scripts/daemon-control.sh restart

# Check token budget (might be blocking)
cat coordination/token-budget.json | jq
```

### Workers Becoming Zombies

**Symptom**: Worker status is "zombie" or stuck

**Solution**:
```bash
# Run zombie cleanup manually
./scripts/lib/zombie-cleanup.sh

# Check heartbeat monitor status
ps aux | grep heartbeat-monitor

# View zombie cleanup logs
cat coordination/logs/zombie-cleanup.log | tail -20

# Force cleanup
find coordination/worker-pool.json -exec sed -i '' 's/"status":"zombie"/"status":"failed"/g' {} \;
```

### Routing Decisions Incorrect

**Symptom**: Tasks routed to wrong master

**Solution**:
```bash
# View decision reasoning
curl http://localhost:3000/api/decisions/<task-id>/explain

# Check routing patterns
cat coordination/masters/coordinator/knowledge-base/routing-patterns.json | jq

# Run ML validation to compare methods
./llm-mesh/validation/ml-validator.sh

# Disable ML routing if it's worse
echo "SEMANTIC_ROUTING_ENABLED=false" >> .env
```

### High Token Usage

**Symptom**: Token budget exhausted quickly

**Solution**:
```bash
# Identify high-usage tasks
cat coordination/logs/token-usage.log | jq 'sort_by(.tokens_used) | reverse | .[0:10]'

# Check for task loops
cat coordination/task-queue.json | jq '.tasks[] | select(.status=="failed") | .error'

# Reduce parallel workers
# Edit worker-daemon.sh: MAX_WORKERS=5 (down from 10)

# Enable governance hard limits
# (Already enabled by default at 95% of budget)
```

### Dashboard Shows Stale Data

**Symptom**: Metrics not updating

**Solution**:
```bash
# Clear browser cache
# Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Linux)

# Restart dashboard
pkill -f "node.*server/index.js"
cd api-server && npm start &

# Check WebSocket connection
# Open browser console, look for WebSocket errors

# Check event stream
cat coordination/dashboard-events.jsonl | tail -20
```

## Maintenance

### Weekly Maintenance

```bash
# 1. Run ML validation
./llm-mesh/validation/ml-validator.sh

# 2. Check governance stats
curl http://localhost:3000/api/governance/enforcement

# 3. Review failed tasks
cat coordination/task-queue.json | jq '.tasks[] | select(.status=="failed")'

# 4. Clean up old logs (older than 30 days)
find agents/logs/workers/ -type f -mtime +30 -delete

# 5. Check disk usage
du -sh coordination/
du -sh agents/logs/
```

### Monthly Maintenance

```bash
# 1. Review governance overrides
cat coordination/governance/overrides.jsonl | jq 'select(.event=="governance_override")'

# 2. Update dependencies
cd api-server && npm update
cd python-sdk && pip install --upgrade -r requirements.txt

# 3. Archive old data
mkdir -p archives/$(date +%Y%m)
mv coordination/logs/*.log archives/$(date +%Y%m)/

# 4. Run full system health check
./scripts/status-check.sh > health-report-$(date +%Y%m%d).txt
```

### Backup

```bash
# Backup coordination state
tar -czf cortex-backup-$(date +%Y%m%d).tar.gz \
  coordination/ \
  .env \
  api-server/package.json

# Restore from backup
tar -xzf cortex-backup-20251127.tar.gz
```

## Emergency Procedures

### Complete System Reset

**WARNING**: This will clear all task history and worker state

```bash
# Stop everything
./scripts/daemon-control.sh stop
pkill -f "node.*server/index.js"

# Reset coordination files
cat > coordination/task-queue.json << 'EOF'
{"tasks": [], "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

cat > coordination/worker-pool.json << 'EOF'
{"workers": [], "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

cat > coordination/token-budget.json << 'EOF'
{"budget": {"daily": {"limit": 270000, "used": 0}}}
EOF

# Clear logs
rm -rf agents/logs/workers/*
rm -f coordination/logs/*.log

# Restart
./scripts/daemon-control.sh start
cd api-server && npm start &
```

### Recovery from Crash

```bash
# 1. Check what's running
ps aux | grep -E "cortex|daemon|worker"

# 2. Kill any stuck processes
pkill -f cortex
pkill -f daemon
pkill -f worker

# 3. Clean up zombie entries
./scripts/lib/zombie-cleanup.sh

# 4. Restart daemons
./scripts/daemon-control.sh restart

# 5. Restart dashboard
cd api-server && npm start &

# 6. Verify health
./scripts/status-check.sh
```

## Performance Tuning

### Increase Worker Limit

```bash
# Edit worker daemon configuration
nano scripts/daemon-control.sh

# Find MAX_WORKERS=10
# Increase to desired limit (e.g., MAX_WORKERS=20)

# Restart daemon
./scripts/daemon-control.sh restart
```

### Optimize Token Usage

```bash
# Enable CAG caching (Context-Aware Generation)
echo "CAG_ENABLED=true" >> .env

# Reduce worker timeout (faster failure detection)
echo "WORKER_TIMEOUT_MINUTES=30" >> .env  # Down from 45

# Use cheaper models for simple tasks
echo "DEFAULT_MODEL=claude-haiku" >> .env
```

### Speed Up Routing

```bash
# Disable slow ML features
SEMANTIC_ROUTING_ENABLED=false
PYTORCH_ROUTING_ENABLED=false

# Use keyword routing only (87.5% accuracy, much faster)
# Restart dashboard to apply changes
```

## Monitoring

### Key Metrics to Watch

```bash
# Worker success rate (target: >90%)
curl http://localhost:3000/api/metrics | jq '.worker_success_rate'

# Token usage (target: <80% of daily budget)
jq -r '(.budget.daily.used / .budget.daily.limit * 100) | floor' coordination/token-budget.json

# Active workers (target: <MAX_WORKERS)
cat coordination/worker-pool.json | jq '.workers | length'

# Routing accuracy (target: >85%)
curl http://localhost:3000/api/ml-validation | jq '.latest_summary.semantic_routing.accuracy'
```

### Set Up Alerts

```bash
# Add to crontab
crontab -e

# Check every 15 minutes
*/15 * * * * /path/to/cortex/scripts/health-check-alert.sh
```

Create `scripts/health-check-alert.sh`:
```bash
#!/bin/bash
# Alert if workers success rate drops below 80%

SUCCESS_RATE=$(curl -s http://localhost:3000/api/metrics | jq -r '.worker_success_rate')

if (( $(echo "$SUCCESS_RATE < 0.8" | bc -l) )); then
  echo "WARNING: Worker success rate is ${SUCCESS_RATE}" | mail -s "Cortex Alert" you@example.com
fi
```
