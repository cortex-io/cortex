# Event Architecture - Single Source of Truth

## Overview

All events in commit-relay use **one single source of truth**:
```
/Users/ryandahlberg/commit-relay/coordination/dashboard-events.jsonl
```

This eliminates duplicate event sources, synthetic event generation, and ensures consistency across all components.

## Event Format

All events follow this standard JSON format:

```json
{
  "id": "evt-1762546789-12345",
  "timestamp": "2025-11-07T20:30:00Z",
  "type": "task_created",
  "data": "{\"task_id\":\"task-001\",\"title\":\"Example Task\"}",
  "source": "coordinator"
}
```

### Fields:
- **id**: Unique identifier (`evt-<unix_timestamp>-<pid>`)
- **timestamp**: ISO 8601 timestamp in UTC (Z suffix)
- **type**: Event type (see Event Types below)
- **data**: JSON-encoded event data (can be string or object)
- **source**: Component that emitted the event

## Event Types

### Task Events
- `task_created` - New task added to queue
- `task_assigned` - Task assigned to master/worker
- `task_started` - Worker begins task execution
- `task_completed` - Task successfully completed
- `task_failed` - Task failed with error

### Worker Events
- `worker_spawned` - New worker process created
- `worker_started` - Worker begins execution
- `worker_completed` - Worker finished successfully
- `worker_failed` - Worker failed with error

### Git Events
- `git_push_success` - Successful git push operation
- `git_push_failed` - Failed git push operation

### System Events
- `system_started` - Component/daemon started
- `system_stopped` - Component/daemon stopped
- `health_alert_created` - New health alert raised
- `health_alert_resolved` - Health alert resolved
- `metrics_snapshot` - Periodic metrics capture

## Event Emission Methods

### 1. Bash Scripts

Use the universal emission script:

```bash
#!/bin/bash
./scripts/emit-event.sh "task_created" '{"task_id":"task-001","title":"Test"}' "coordinator"
```

**emit-event.sh signature:**
```bash
./scripts/emit-event.sh <event_type> <data_json> [source]
```

### 2. Python SDK

Use the EventEmitter class:

```python
from commit_relay.events import EventEmitter

emitter = EventEmitter()

# Generic emission
emitter.emit('task_created', {
    'task_id': 'task-001',
    'title': 'Test Task',
    'priority': 'high'
}, source='coordinator')

# Convenience methods
emitter.task_created('task-001', 'Test Task', 'feature', priority='high')
emitter.worker_spawned('worker-001', 'task-001', 'feature-implementer')
emitter.git_push_success('worker-001', 'abc123')
```

### 3. Dashboard/Node.js

Use the existing emitDashboardEvent helper:

```javascript
function emitDashboardEvent(type, data) {
  const event = {
    id: `evt-${Date.now()}-${process.pid}`,
    timestamp: new Date().toISOString(),
    type: type,
    data: typeof data === 'string' ? data : JSON.stringify(data),
    source: 'dashboard'
  };
  fs.appendFileSync(FILES.dashboardEvents, JSON.stringify(event) + '\n');
}

// Usage
emitDashboardEvent('health_alert_resolved', {
  alert_id: 'alert-001',
  resolved_by: 'user'
});
```

## Reading Events

### API Endpoint

**GET /api/events**
- Returns events from single source of truth
- Query params:
  - `limit`: Number of events (default: 50)
  - `session`: 'current' for only current session events

```bash
curl http://localhost:3000/api/events?limit=10
```

### Python SDK

```python
from commit_relay import EventStream

stream = EventStream()

# Get recent events
events = stream.get_recent_events(limit=10)

# Get events by type
task_events = stream.get_events_by_type('task_created', limit=20)

# Get task-specific events
task_events = stream.get_task_events('task-001')

# Watch for new events in real-time
def handle_event(event):
    print(f"New event: {event['type']}")

stream.watch_all_events(on_event=handle_event, timeout=60)
```

## Migration Guide

### OLD (Multiple Sources - DON'T DO THIS):
```javascript
// ❌ Synthetic events from task-queue.json
const taskEvents = taskQueue.tasks.map(task => ({
  type: 'task_created',
  timestamp: task.created_at,
  // ...
}));

// ❌ Synthetic events from git-operations.jsonl
const gitEvents = gitOps.map(op => ({
  type: 'git_push_success',
  // ...
}));

// ❌ Merging multiple sources
const allEvents = [...dashboardEvents, ...taskEvents, ...gitEvents];
```

### NEW (Single Source - DO THIS):
```javascript
// ✅ Read from single source
const events = readDashboardEventsJSONL();

// ✅ Emit when state changes
function createTask(task) {
  // Save to task-queue.json
  saveTaskToQueue(task);

  // Emit event to single source
  emitDashboardEvent('task_created', {
    task_id: task.id,
    title: task.title,
    priority: task.priority
  });
}
```

## Best Practices

### 1. Always Emit Events
When any state changes, emit an event:
- Task created → emit `task_created`
- Task assigned → emit `task_assigned`
- Worker spawns → emit `worker_spawned`
- Git push → emit `git_push_success` or `git_push_failed`

### 2. Never Synthesize Events
- Don't generate events from existing data structures
- Don't merge multiple event sources
- Read ONLY from dashboard-events.jsonl

### 3. Include Context
Emit rich event data:
```python
# ✅ Good - includes context
emitter.emit('task_created', {
    'task_id': 'task-001',
    'title': 'Implement feature X',
    'type': 'feature',
    'priority': 'high',
    'created_by': 'coordinator',
    'assigned_to': 'development-master'
})

# ❌ Bad - minimal context
emitter.emit('task_created', {'task_id': 'task-001'})
```

### 4. Use Atomic Appends
Always append to the JSONL file (never read-modify-write):
```bash
# ✅ Good - atomic append
echo "$EVENT_JSON" >> dashboard-events.jsonl

# ❌ Bad - non-atomic
events=$(cat dashboard-events.jsonl)
echo "$events\n$EVENT_JSON" > dashboard-events.jsonl
```

## Event Rotation

Events are automatically rotated to prevent unbounded growth:

```bash
./scripts/rotate-dashboard-events.sh
```

- Keeps last 2 days in main file
- Archives older events to `coordination/dashboard-events-archive/`
- Run via cron or systemd timer

## Troubleshooting

### Events not appearing in dashboard
1. Check events file exists: `ls -la coordination/dashboard-events.jsonl`
2. Check file permissions: `chmod 644 coordination/dashboard-events.jsonl`
3. Verify JSON format: `tail coordination/dashboard-events.jsonl | jq .`
4. Check dashboard server logs: `tail -f /tmp/dashboard-server.log`

### Duplicate events
- Verify you're not emitting the same event multiple times
- Check for leftover synthetic event generation code
- Use unique event IDs to detect duplicates

### Missing events
- Ensure all state changes emit events
- Check event emission is before error handling
- Verify event file path is correct

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Event Emission Layer                    │
├─────────────────────────────────────────────────────────┤
│  Bash Scripts     Python SDK        Dashboard/Node.js   │
│  emit-event.sh    EventEmitter      emitDashboardEvent  │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │  SINGLE SOURCE OF     │
          │  TRUTH                │
          │  dashboard-events.    │
          │  jsonl                │
          └───────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │  Event Consumers      │
          ├───────────────────────┤
          │  • Dashboard UI       │
          │  • API Endpoints      │
          │  • Python Analytics   │
          │  • Monitoring Tools   │
          └───────────────────────┘
```

## Summary

**Golden Rule**: One Event = One Line in dashboard-events.jsonl

- ✅ Emit events when state changes
- ✅ Read events from single source
- ❌ Never synthesize events from other data
- ❌ Never merge multiple event sources
