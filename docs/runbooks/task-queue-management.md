# Task Queue Management Runbook

## Overview

Complete guide to managing the task queue in Commit-Relay, including task creation, prioritization, routing, monitoring, and troubleshooting.

**Severity**: MEDIUM
**Estimated Time**: 10-20 minutes
**Owner**: DevOps/Operations Team

---

## Task Queue Overview

### Task Lifecycle

```
Created → Queued → Routed → In Progress → Completed/Failed
    ↓        ↓         ↓          ↓             ↓
  File   Queue    Master    Worker        Archive
```

### Task States

| State | Description | Typical Duration | Next State |
|-------|-------------|------------------|------------|
| queued | Waiting for routing | 1-5 min | routed |
| routed | Assigned to master | Seconds | in_progress |
| in_progress | Worker executing | 15-45 min | completed/failed |
| completed | Successfully finished | N/A | archived |
| failed | Failed with error | N/A | archived/retry |

---

## Creating Tasks

### Using Task Creation Wizard (Recommended)

```bash
# Interactive mode
./scripts/wizards/create-task.sh

# Quick mode
./scripts/wizards/create-task.sh --quick \
    "Fix authentication bug in login service" \
    high \
    development

# Quick mode syntax:
# ./scripts/wizards/create-task.sh --quick "<description>" [priority] [type]
#
# Priority: critical, high, medium, low (default: medium)
# Type: security, development, inventory, cicd (default: development)
```

### Manual Task Creation

```bash
# Generate task ID
task_id="task-$(date +%s%3N)"

# Create task file
cat > "coordination/tasks/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "task_type": "development",
  "description": "Implement new API endpoint for user management",
  "priority": "high",
  "status": "queued",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "$(whoami)",
  "repository": "owner/repo",
  "tags": ["api", "user-management"],
  "metadata": {}
}
EOF

# Add to queue
task_json=$(cat "coordination/tasks/${task_id}.json")
jq --argjson task "$task_json" '.tasks += [$task]' \
    coordination/task-queue.json > /tmp/queue.json
mv /tmp/queue.json coordination/task-queue.json

echo "Task created: $task_id"
```

---

## Viewing Task Queue

### Quick Status Check

```bash
# Task queue summary
cat coordination/task-queue.json | jq '{
    total: (.tasks | length),
    queued: ([.tasks[] | select(.status == "queued")] | length),
    in_progress: ([.tasks[] | select(.status == "in_progress")] | length),
    completed: ([.tasks[] | select(.status == "completed")] | length),
    failed: ([.tasks[] | select(.status == "failed")] | length)
}'
```

### Detailed Task View

```bash
# View all tasks
cat coordination/task-queue.json | jq '.tasks[]'

# View specific task
cat coordination/task-queue.json | jq '.tasks[] | select(.task_id == "task-001")'

# View tasks by status
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "queued")'

# View tasks by priority
cat coordination/task-queue.json | jq '.tasks[] | select(.priority == "high")'

# View tasks by type
cat coordination/task-queue.json | jq '.tasks[] | select(.task_type == "security")'
```

### Using Task Queue Monitor

```bash
# Real-time task queue dashboard
./scripts/dashboards/task-queue-monitor.sh

# Filter by status
./scripts/dashboards/task-queue-monitor.sh --status queued

# Filter by priority
./scripts/dashboards/task-queue-monitor.sh --priority high

# Custom refresh interval
./scripts/dashboards/task-queue-monitor.sh --interval 10
```

---

## Task Prioritization

### Priority Levels

| Priority | Use Case | SLA | Processing Order |
|----------|----------|-----|------------------|
| critical | System down, security breach | <5 min | 1st |
| high | Important bugs, urgent features | <15 min | 2nd |
| medium | Normal features, improvements | <30 min | 3rd |
| low | Nice-to-have, cleanup tasks | Best effort | 4th |

### Change Task Priority

```bash
# Update task priority
task_id="task-001"

jq --arg task_id "$task_id" --arg priority "high" \
    '(.tasks[] | select(.task_id == $task_id) | .priority) = $priority |
     (.tasks[] | select(.task_id == $task_id) | .updated_at) = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

echo "Task $task_id priority updated to high"
```

### Re-prioritize Queue

```bash
# Sort tasks by priority
# (Coordinator daemon handles this automatically, but you can manually re-sort)

jq '.tasks |= sort_by(
    if .priority == "critical" then 0
    elif .priority == "high" then 1
    elif .priority == "medium" then 2
    elif .priority == "low" then 3
    else 4 end
)' coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json
```

---

## Task Routing

### MoE Router Analysis

```bash
# Test routing for a task description
./coordination/masters/coordinator/lib/moe-router.sh test-001 \
    "Scan repository for SQL injection vulnerabilities"

# Output shows:
# - Selected master
# - Confidence score
# - Reasoning
# - Keywords matched

# View recent routing decisions
tail -20 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | jq .

# Check routing confidence
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -s 'map(.confidence) | add / length'
# Should be > 0.65 on average
```

### Manual Task Routing

```bash
# Override automatic routing (if needed)
task_id="task-001"
master="security-master"

# Update task with target master
jq --arg task_id "$task_id" --arg master "$master" \
    '(.tasks[] | select(.task_id == $task_id) | .target_master) = $master' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

# Create handoff file
cat > "coordination/masters/coordinator/handoffs/to-${master}-${task_id}-$(date +%s).json" <<EOF
{
  "task_id": "$task_id",
  "target_master": "$master",
  "handoff_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "handoff_reason": "manual_override"
}
EOF
```

---

## Monitoring Task Progress

### Track Individual Task

```bash
# Get task status
task_id="task-001"

cat coordination/task-queue.json | jq --arg tid "$task_id" \
    '.tasks[] | select(.task_id == $tid) | {
        task_id,
        status,
        priority,
        created_at,
        updated_at,
        assigned_master: .target_master,
        assigned_worker: .worker_id
    }'

# If task assigned to worker, check worker progress
worker_id=$(jq -r --arg tid "$task_id" \
    '.tasks[] | select(.task_id == $tid) | .worker_id // "none"' \
    coordination/task-queue.json)

if [ "$worker_id" != "none" ]; then
    echo "Worker: $worker_id"
    tail -20 "agents/logs/workers/$(date +%Y-%m-%d)/$worker_id/worker.log"
fi
```

### Task Age Analysis

```bash
# Find old queued tasks
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "queued") |
    [.task_id, .created_at, .priority] | @tsv' | \
while IFS=$'\t' read -r task_id created_at priority; do
    created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
    age_minutes=$(( ($(date +%s) - created_ts) / 60 ))

    if [ $age_minutes -gt 30 ]; then
        echo "OLD TASK: $task_id queued for ${age_minutes}m (priority: $priority)"
    fi
done
```

---

## Task Completion

### Verify Task Completion

```bash
# Check completed tasks
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "completed")'

# Get completion rate
total=$(jq '.tasks | length' coordination/task-queue.json)
completed=$(jq '[.tasks[] | select(.status == "completed")] | length' coordination/task-queue.json)
completion_rate=$(( (completed * 100) / total ))

echo "Completion rate: $completion_rate% ($completed/$total)"

# Check task duration
cat coordination/task-queue.json | jq -r '.tasks[] |
    select(.status == "completed") |
    {
        task_id,
        duration: ((.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601))
    } | "\(.task_id): \(.duration)s"'
```

### Archive Completed Tasks

```bash
# Archive tasks completed >7 days ago
cutoff_date=$(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%SZ)

# Extract completed tasks to archive
jq --arg cutoff "$cutoff_date" \
    '[.tasks[] | select(.status == "completed" and .updated_at < $cutoff)]' \
    coordination/task-queue.json >> coordination/tasks/archived-tasks.jsonl

# Remove from active queue
jq --arg cutoff "$cutoff_date" \
    '.tasks = [.tasks[] | select(.status != "completed" or .updated_at >= $cutoff)]' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

echo "Archived completed tasks older than 7 days"
```

---

## Task Failure Handling

### Identify Failed Tasks

```bash
# List failed tasks
cat coordination/task-queue.json | jq '.tasks[] | select(.status == "failed")'

# Failure analysis
cat coordination/task-queue.json | jq '.tasks[] |
    select(.status == "failed") |
    {
        task_id,
        description,
        error: .error_message,
        worker_id,
        failed_at: .updated_at
    }'
```

### Retry Failed Task

```bash
# Option 1: Manual retry
task_id="task-001"

# Reset task status
jq --arg task_id "$task_id" \
    '(.tasks[] | select(.task_id == $task_id) |
      .status) = "queued" |
    (.tasks[] | select(.task_id == $task_id) |
      .updated_at) = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'" |
    (.tasks[] | select(.task_id == $task_id) |
      .retry_count) = ((.tasks[] | select(.task_id == $task_id) | .retry_count // 0) + 1)' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

echo "Task $task_id queued for retry"

# Option 2: Create new task with lessons learned
./scripts/wizards/create-task.sh --quick \
    "Retry: Fix authentication bug (with increased timeout)" \
    high \
    development
```

---

## Queue Maintenance

### Cleanup Stale Tasks

```bash
# Find tasks stuck in queue for >24h
cutoff=$(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%SZ)

cat coordination/task-queue.json | jq --arg cutoff "$cutoff" \
    '.tasks[] | select(.status == "queued" and .created_at < $cutoff)'

# Manual intervention for stale tasks:
# 1. Investigate why task wasn't routed
# 2. Check coordinator daemon status
# 3. Manually route task if needed
# 4. Cancel task if no longer needed
```

### Remove Cancelled Tasks

```bash
# Mark task as cancelled
task_id="task-001"

jq --arg task_id "$task_id" \
    '(.tasks[] | select(.task_id == $task_id) | .status) = "cancelled" |
    (.tasks[] | select(.task_id == $task_id) | .updated_at) = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

# Archive cancelled task
jq --arg task_id "$task_id" \
    '[.tasks[] | select(.task_id == $task_id)]' \
    coordination/task-queue.json >> coordination/tasks/cancelled-tasks.jsonl

# Remove from queue
jq --arg task_id "$task_id" \
    '.tasks = [.tasks[] | select(.task_id != $task_id)]' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json
```

### Queue Optimization

```bash
# Remove duplicate tasks
jq '.tasks = [.tasks | group_by(.description) | map(.[0])]' \
    coordination/task-queue.json > /tmp/queue.json

mv /tmp/queue.json coordination/task-queue.json

# Compact queue file (remove whitespace)
jq -c . coordination/task-queue.json > /tmp/queue.json
mv /tmp/queue.json coordination/task-queue.json
```

---

## Troubleshooting

### Tasks Not Processing

```bash
# 1. Check coordinator daemon
ps aux | grep coordinator-daemon

# 2. Check coordinator logs
tail -50 agents/logs/system/coordinator-daemon.log

# 3. Check task queue file integrity
jq empty coordination/task-queue.json && echo "Valid JSON" || echo "Invalid JSON"

# 4. Check master availability
for master in development-master security-master inventory-master cicd-master; do
    handoff_count=$(ls coordination/masters/coordinator/handoffs/to-${master}-* 2>/dev/null | wc -l)
    echo "$master: $handoff_count pending handoffs"
done

# 5. Restart coordinator if needed
kill $(cat /tmp/commit-relay-coordinator-daemon.pid)
./scripts/coordinator-daemon.sh &
```

### High Queue Depth

```bash
# Check queue depth
queue_depth=$(jq '[.tasks[] | select(.status == "queued")] | length' \
    coordination/task-queue.json)

echo "Queue depth: $queue_depth"

if [ $queue_depth -gt 20 ]; then
    echo "WARNING: High queue depth"

    # Actions:
    # 1. Check if workers are processing
    active_workers=$(ls coordination/worker-specs/active/ | wc -l)
    echo "Active workers: $active_workers"

    # 2. Spawn additional workers if capacity allows
    available_tokens=$(jq -r '.available' coordination/token-budget.json)
    echo "Available tokens: $available_tokens"

    # 3. Check for routing issues
    tail -20 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
        jq '.confidence'
fi
```

### Task Routing Failures

```bash
# Check routing confidence
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -s 'map(select(.confidence < 0.5)) | length'

# If high count of low-confidence routing:
# - Review MoE router keywords
# - Check task descriptions are clear
# - Update router logic if needed

# See: docs/runbooks/moe-router-issues.md
```

---

## Best Practices

### Task Creation

1. **Clear Descriptions**: Use specific, keyword-rich descriptions
2. **Appropriate Priority**: Set priority based on actual urgency
3. **Correct Type**: Use accurate task_type for proper routing
4. **Include Context**: Add repository, tags, metadata

### Queue Management

1. **Daily Review**: Check queue status daily
2. **Monitor Age**: Watch for tasks stuck in queue >1 hour
3. **Archive Regularly**: Archive completed tasks weekly
4. **Cleanup Failures**: Investigate and retry/cancel failed tasks

### Performance

1. **Keep Queue <20**: High queue depth indicates bottleneck
2. **Fast Routing**: Routing should take <5 seconds
3. **Monitor Completion Rate**: Aim for >80% completion rate
4. **Track Duration**: Monitor task completion times

---

## Related Runbooks

- [MoE Router Issues](./moe-router-issues.md) - Routing troubleshooting
- [Worker Lifecycle Management](./worker-lifecycle-management.md) - Worker operations
- [Performance Troubleshooting](./performance-troubleshooting.md) - Queue performance
- [Daily Operations](./daily-operations.md) - Regular queue checks

---

## Quick Reference

### Common Commands

```bash
# Create task
./scripts/wizards/create-task.sh

# View queue
cat coordination/task-queue.json | jq .

# Monitor queue
./scripts/dashboards/task-queue-monitor.sh

# Check queue depth
jq '[.tasks[] | select(.status == "queued")] | length' coordination/task-queue.json

# Find old tasks
jq '.tasks[] | select(.status == "queued")' coordination/task-queue.json
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
