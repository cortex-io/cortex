# Dashboard Deployment Workflow

## Overview

The dashboard deployment workflow is a specialized CI/CD pipeline managed by the CI/CD Master agent. It ensures real-time dashboard updates when specialist masters complete tasks, providing a coordinated and validated approach to dashboard data synchronization.

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Dashboard Deployment Flow                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Specialist      │  (development, security, inventory)
│  Master          │
│  Completes Task  │
└────────┬─────────┘
         │
         │ 1. Create handoff with dashboard_update flag
         │
         v
┌────────────────────────────────────────────────────────────────────────────┐
│  coordination/masters/{master}/handoffs/{master}-to-cicd-dashboard-*.json  │
└────────┬───────────────────────────────────────────────────────────────────┘
         │
         │ 2. CI/CD Master detects handoff
         │
         v
┌──────────────────┐
│  CI/CD Master    │  Analyzes dashboard update requirements
│  Receives        │  - Determine affected components
│  Handoff         │  - Validate coordination file integrity
└────────┬─────────┘  - Assess update priority
         │
         │ 3. Spawn dashboard-update-worker
         │
         v
┌────────────────────────────────────────────────────────────────────────────┐
│  agents/workers/dashboard-update-worker.sh                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Step 1: Validate Data                                                │  │
│  │   - Check coordination file JSON syntax                              │  │
│  │   - Verify file integrity                                            │  │
│  │   - Validate component references                                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Step 2: Generate Events                                              │  │
│  │   - Create dashboard_deployed event                                  │  │
│  │   - Append to dashboard-events.jsonl                                 │  │
│  │   - Include task_id, worker_id, timestamp                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Step 3: Broadcast WebSocket Updates                                  │  │
│  │   - POST to http://localhost:3000/api/broadcast                      │  │
│  │   - Include component, task_id, worker_id                            │  │
│  │   - Trigger real-time dashboard refresh                              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Step 4: Record Deployment                                            │  │
│  │   - Log to dashboard-deployments.jsonl                               │  │
│  │   - Include status, duration, components                             │  │
│  │   - Update CI/CD metrics                                             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────┬───────────────────────────────────────────────────────────────────┘
         │
         │ 4. Dashboard updates within 1-5 seconds
         │
         v
┌──────────────────┐
│  Dashboard       │  Real-time UI update
│  Frontend        │  - Events feed
│  Updated         │  - Metrics cards
└────────┬─────────┘  - Task list
         │            - Worker status
         │
         │ 5. CI/CD Master verifies deployment
         │
         v
┌──────────────────┐
│  Hand back to    │  Report deployment status
│  Coordinator     │  - Success/failure
└──────────────────┘  - Components updated
                      - Duration
```

## Handoff Schema

Specialist masters must create handoffs with the following schema:

```json
{
  "handoff_id": "{master}-to-cicd-dashboard-{UUID}",
  "from_master": "development|security|inventory",
  "to_master": "cicd",
  "task_id": "task-XXX",
  "handoff_type": "dashboard_deployment",
  "dashboard_update": {
    "required": true,
    "components": ["events", "metrics", "tasks", "workers", "streams"],
    "priority": "immediate|batched",
    "validation_required": true,
    "changes_summary": "Description of what changed"
  },
  "created_at": "2025-11-04T19:00:00Z",
  "status": "pending_pickup"
}
```

### Dashboard Components

| Component | Coordination Files | Update Trigger |
|-----------|-------------------|----------------|
| **events** | `dashboard-events.jsonl` | Task lifecycle, worker events, system events |
| **metrics** | `status.json`, `token-budget.json` | System metrics, token usage, performance stats |
| **tasks** | `task-queue.json` | Task creation, assignment, completion, failure |
| **workers** | `worker-pool.json` | Worker spawning, execution, completion |
| **streams** | `workforce-streams.json` | Stream allocation, rebalancing, metrics |

## Update Priority Levels

### Immediate Priority

**Trigger Conditions**:
- Task completion or failure
- Critical security alerts
- Worker failures or crashes
- System errors or warnings

**Characteristics**:
- Spawned immediately upon handoff detection
- Target latency: 1-5 seconds
- High priority in workforce streams
- Validation required before broadcast

### Batched Priority

**Trigger Conditions**:
- Routine metrics updates
- Token budget recalculations
- Stream rebalancing operations
- Inventory catalog updates

**Characteristics**:
- Queued and processed in batches
- Target latency: 5-15 seconds
- Standard priority in workforce streams
- Batch validation for efficiency

## Workflow Steps Detail

### Step 1: Specialist Master Completion

When a specialist master completes a task:

1. Update relevant coordination files (task-queue.json, worker-pool.json, etc.)
2. Create handoff file with `dashboard_update` metadata
3. Place handoff in `coordination/masters/{master}/handoffs/` directory
4. Log handoff creation in master state

**Example (Development Master)**:

```bash
# After completing task-020
cat > coordination/masters/development/handoffs/dev-to-cicd-dashboard-A1B2C3.json <<EOF
{
  "handoff_id": "dev-to-cicd-dashboard-A1B2C3",
  "from_master": "development",
  "to_master": "cicd",
  "task_id": "task-020",
  "handoff_type": "dashboard_deployment",
  "dashboard_update": {
    "required": true,
    "components": ["events", "metrics", "tasks"],
    "priority": "immediate",
    "changes": {
      "task_status": "completed",
      "files_modified": ["src/feature.js"],
      "tests_passed": true
    }
  },
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "pending_pickup"
}
EOF
```

### Step 2: CI/CD Master Handoff Detection

CI/CD Master monitors handoff directory:

```bash
# Check for dashboard deployment handoffs
ls coordination/masters/*/handoffs/*-to-cicd-dashboard-*.json

# Parse handoff and analyze requirements
HANDOFF_FILE="coordination/masters/development/handoffs/dev-to-cicd-dashboard-A1B2C3.json"
TASK_ID=$(jq -r '.task_id' "$HANDOFF_FILE")
COMPONENTS=$(jq -r '.dashboard_update.components | join(",")' "$HANDOFF_FILE")
PRIORITY=$(jq -r '.dashboard_update.priority' "$HANDOFF_FILE")
```

### Step 3: Dashboard Worker Spawning

CI/CD Master spawns dashboard-update-worker:

```bash
./agents/workers/dashboard-update-worker.sh \
  --task-id "$TASK_ID" \
  --components "$COMPONENTS" \
  --handoff-id "dev-to-cicd-dashboard-A1B2C3" \
  --priority "$PRIORITY"
```

### Step 4: Data Validation

Dashboard worker validates coordination files:

```bash
# Validate JSON syntax and integrity
validate_coordination_file() {
    local file="$1"
    if ! jq empty "$file" 2>/dev/null; then
        log_error "Invalid JSON in $file"
        return 1
    fi
    return 0
}

# Validate each component
for component in events metrics tasks workers streams; do
    case "$component" in
        events) validate_coordination_file "dashboard-events.jsonl" ;;
        metrics) validate_coordination_file "status.json" && \
                 validate_coordination_file "token-budget.json" ;;
        tasks) validate_coordination_file "task-queue.json" ;;
        workers) validate_coordination_file "worker-pool.json" ;;
        streams) validate_coordination_file "workforce-streams.json" ;;
    esac
done
```

### Step 5: Event Generation

Generate dashboard event for real-time feed:

```bash
EVENT_JSON=$(cat <<EOF
{
  "event_id": "$(uuidgen)",
  "event_type": "dashboard_deployed",
  "message": "Dashboard updated for task $TASK_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "task_id": "$TASK_ID",
  "worker_id": "$WORKER_ID",
  "source": "dashboard-update-worker"
}
EOF
)

echo "$EVENT_JSON" >> coordination/dashboard-events.jsonl
```

### Step 6: WebSocket Broadcasting

Broadcast updates to dashboard server:

```bash
# POST to dashboard API
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "component": "events",
    "task_id": "task-020",
    "worker_id": "dashboard-worker-A1B2C3",
    "handoff_id": "dev-to-cicd-dashboard-A1B2C3",
    "timestamp": "2025-11-04T19:00:00Z"
  }' \
  http://localhost:3000/api/broadcast
```

### Step 7: Deployment Recording

Record deployment in CI/CD context:

```bash
DEPLOYMENT_RECORD=$(cat <<EOF
{
  "deployment_id": "$(uuidgen)",
  "worker_id": "$WORKER_ID",
  "task_id": "$TASK_ID",
  "handoff_id": "$HANDOFF_ID",
  "components": "$COMPONENTS",
  "priority": "$PRIORITY",
  "status": "success",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "duration_seconds": $SECONDS
}
EOF
)

echo "$DEPLOYMENT_RECORD" >> coordination/masters/cicd/context/dashboard-deployments.jsonl
```

### Step 8: Coordinator Handoff

CI/CD Master hands back to coordinator:

```bash
cat > coordination/masters/cicd/handoffs/cicd-to-coordinator-task-020.json <<EOF
{
  "handoff_id": "cicd-to-coordinator-task-020",
  "from_master": "cicd",
  "to_master": "coordinator",
  "task_id": "task-020",
  "handoff_type": "dashboard_deployment_complete",
  "dashboard_deployment": {
    "status": "success",
    "components_updated": ["events", "metrics", "tasks"],
    "duration_seconds": 3,
    "worker_id": "dashboard-worker-A1B2C3"
  },
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "completed"
}
EOF
```

## Success Criteria

A dashboard deployment is considered successful when:

1. ✅ All coordination files pass validation
2. ✅ Events generated and appended to dashboard-events.jsonl
3. ✅ WebSocket broadcast successful (or logged if dashboard offline)
4. ✅ Dashboard reflects changes within 1-5 seconds
5. ✅ Deployment recorded in dashboard-deployments.jsonl
6. ✅ No data inconsistencies or race conditions
7. ✅ Handoff completed to coordinator

## Error Handling

### Validation Failure

If coordination file validation fails:

1. Log error with file path and error details
2. Do NOT proceed with WebSocket broadcast
3. Record failed deployment in dashboard-deployments.jsonl
4. Hand back to coordinator with failure status
5. Escalate to CI/CD Master for investigation

### WebSocket Broadcast Failure

If dashboard server is unreachable:

1. Log warning (dashboard may be stopped)
2. Continue with deployment recording
3. Dashboard will sync on next file watcher trigger
4. Mark deployment as "partial_success"

### Race Condition Prevention

To prevent race conditions:

1. Use file locking when writing to coordination files
2. Validate file state before and after updates
3. Implement retry logic with exponential backoff
4. Use atomic file operations (write to temp, then move)

## Performance Metrics

Track these metrics in CI/CD Master state:

```json
{
  "dashboard_deployments": {
    "total_deployments": 0,
    "successful_deployments": 0,
    "failed_deployments": 0,
    "avg_duration_seconds": 0,
    "components_updated": {
      "events": 0,
      "metrics": 0,
      "tasks": 0,
      "workers": 0,
      "streams": 0
    }
  }
}
```

## Troubleshooting

### Dashboard not updating after deployment

**Symptoms**: Worker completes successfully but dashboard doesn't reflect changes

**Possible Causes**:
1. Dashboard server not running
2. WebSocket connection dropped
3. File watcher not detecting changes
4. Browser cache preventing updates

**Solutions**:
1. Verify dashboard server: `curl http://localhost:3000`
2. Check WebSocket connection in browser console
3. Restart dashboard server: `npm start` in `dashboard/` directory
4. Hard refresh browser (Cmd+Shift+R)

### Validation errors

**Symptoms**: Worker fails with "Invalid JSON" errors

**Possible Causes**:
1. Coordination file corrupted
2. Concurrent writes causing conflicts
3. Incomplete file writes

**Solutions**:
1. Validate file manually: `jq empty coordination/task-queue.json`
2. Restore from backup if available
3. Implement file locking in specialist masters

### Slow deployment times

**Symptoms**: Dashboard updates take >5 seconds

**Possible Causes**:
1. Large coordination files (slow JSON parsing)
2. Network latency to dashboard server
3. High CPU usage on dashboard server

**Solutions**:
1. Optimize coordination file size
2. Use localhost for dashboard server
3. Increase dashboard server resources

## Related Documentation

- [CI/CD Master Agent Definition](../../../../.claude/agents/cicd-master.md)
- [CI/CD Master Guide](../../../../docs/CICD_MASTER.md)
- [Dashboard Architecture](../../../../dashboard/README.md)
- [Workforce Streams](../../../../docs/WORKFORCE_STREAMS.md)
