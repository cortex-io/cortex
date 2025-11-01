# Task Queue Schema Documentation

**Version**: 2.0 (Master-Worker Architecture)
**File**: `coordination/task-queue.json`
**Last Updated**: 2025-11-01

---

## Overview

The task queue maintains all active, pending, and completed tasks in the commit-relay system. Version 2.0 adds support for master-worker execution mode.

---

## Schema Definition

### Root Object

```json
{
  "version": "1.0",
  "updated_at": "ISO-8601 timestamp",
  "tasks": [/* array of task objects */]
}
```

### Task Object (v2.0)

```json
{
  "id": "task-XXX",
  "title": "Brief task description",
  "type": "security|development|coordination|maintenance",
  "priority": "critical|high|medium|low",
  "status": "pending|in-progress|blocked|handoff-pending|completed",

  "assigned_to": "agent-name",
  "created_at": "ISO-8601 timestamp",
  "created_by": "agent-name",
  "completed_at": "ISO-8601 timestamp or null",

  "repository": "owner/repo-name",

  "context": {
    "description": "Detailed task description",
    "scan_types": ["optional", "array", "for", "scan", "tasks"],
    "related_issues": ["#123", "#456"],
    "previous_handoffs": ["handoff-id-1"]
  },

  "execution_mode": "traditional|workers",

  "worker_plan": {
    "total_workers": 3,
    "workers_spawned": ["worker-scan-001", "worker-scan-002"],
    "workers_completed": ["worker-scan-001"],
    "workers_failed": [],
    "estimated_tokens": 24000,
    "actual_tokens": 15600,
    "parallel": true
  },

  "results": {
    "status": "result status",
    "vulnerabilities": 0,
    "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
    "worker_aggregation": {
      "total_findings": 15,
      "by_worker": {
        "worker-scan-001": 8,
        "worker-scan-002": 7
      }
    }
  },

  "handoff_plan": {
    "after_completion": "next-agent-name",
    "reason": "Why handoff needed"
  }
}
```

---

## Field Descriptions

### Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique task identifier (task-XXX) |
| `title` | string | Yes | Brief task description |
| `type` | enum | Yes | Task category (security, development, etc.) |
| `priority` | enum | Yes | Task priority level |
| `status` | enum | Yes | Current task status |
| `assigned_to` | string | Yes | Agent responsible for task |
| `created_at` | timestamp | Yes | When task was created |
| `created_by` | string | Yes | Agent who created task |
| `completed_at` | timestamp | No | When task completed (null if pending) |
| `repository` | string | No | Target repository (if applicable) |

### Context Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Detailed task description |
| `scan_types` | array | No | For security scans: types to perform |
| `related_issues` | array | No | GitHub issue numbers |
| `previous_handoffs` | array | No | Prior handoff IDs for context |

### Worker Execution (NEW in v2.0)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `execution_mode` | enum | No | "traditional" or "workers" (default: traditional) |
| `worker_plan` | object | No | Worker execution details (see below) |

### Worker Plan Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total_workers` | number | Yes | Planned number of workers |
| `workers_spawned` | array | Yes | List of spawned worker IDs |
| `workers_completed` | array | Yes | List of completed worker IDs |
| `workers_failed` | array | Yes | List of failed worker IDs |
| `estimated_tokens` | number | Yes | Estimated total token usage |
| `actual_tokens` | number | No | Actual tokens used (when complete) |
| `parallel` | boolean | Yes | Whether workers run in parallel |

### Results Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Result status description |
| `worker_aggregation` | object | No | Aggregated worker results |

---

## Execution Modes

### Traditional Mode (Backward Compatible)

Master agent executes entire task in single conversation.

```json
{
  "id": "task-001",
  "title": "Update documentation",
  "execution_mode": "traditional",
  "assigned_to": "development-master"
}
```

**No `worker_plan` needed.**

### Workers Mode (New)

Master agent spawns workers to execute task components.

```json
{
  "id": "task-010",
  "title": "Security scan: 3 repositories",
  "execution_mode": "workers",
  "assigned_to": "security-master",
  "worker_plan": {
    "total_workers": 3,
    "workers_spawned": [
      "worker-scan-001",
      "worker-scan-002",
      "worker-scan-003"
    ],
    "workers_completed": ["worker-scan-001"],
    "workers_failed": [],
    "estimated_tokens": 24000,
    "actual_tokens": 15600,
    "parallel": true
  }
}
```

---

## Status Values

| Status | Description | Next Action |
|--------|-------------|-------------|
| `pending` | Not yet started | Agent picks up task |
| `in-progress` | Currently being worked on | Agent continues work |
| `blocked` | Cannot proceed | Resolve blocker |
| `handoff-pending` | Waiting for handoff acceptance | Target agent accepts |
| `completed` | Fully done | Archive or review |

---

## Task Types

| Type | Description | Typical Assigned To |
|------|-------------|---------------------|
| `security` | Security scans, audits, patches | security-master |
| `development` | Features, bugs, refactoring | development-master |
| `coordination` | System management, orchestration | coordinator-master |
| `maintenance` | Cleanup, updates, housekeeping | Any master |

---

## Priority Levels

| Priority | Description | SLA |
|----------|-------------|-----|
| `critical` | Emergency, system down | < 1 hour |
| `high` | Important, blocking other work | < 1 day |
| `medium` | Standard priority | < 1 week |
| `low` | Nice to have | < 1 month |

---

## Example Tasks

### Example 1: Traditional Execution

```json
{
  "id": "task-020",
  "title": "Update README with new features",
  "type": "development",
  "priority": "medium",
  "status": "pending",
  "assigned_to": "development-master",
  "created_at": "2025-11-01T10:00:00Z",
  "created_by": "coordinator-master",
  "repository": "ry-ops/commit-relay",
  "context": {
    "description": "Add master-worker architecture section to README",
    "related_issues": [],
    "previous_handoffs": []
  },
  "execution_mode": "traditional",
  "handoff_plan": {
    "after_completion": "coordinator-master",
    "reason": "Review documentation updates"
  }
}
```

### Example 2: Worker-Based Execution (Parallel)

```json
{
  "id": "task-021",
  "title": "Security scan: all repositories",
  "type": "security",
  "priority": "high",
  "status": "in-progress",
  "assigned_to": "security-master",
  "created_at": "2025-11-01T10:00:00Z",
  "created_by": "coordinator-master",
  "repository": null,
  "context": {
    "description": "Weekly security scan of all repositories",
    "scan_types": ["dependencies", "vulnerabilities", "secrets"],
    "related_issues": [],
    "previous_handoffs": []
  },
  "execution_mode": "workers",
  "worker_plan": {
    "total_workers": 4,
    "workers_spawned": [
      "worker-scan-101",
      "worker-scan-102",
      "worker-scan-103",
      "worker-scan-104"
    ],
    "workers_completed": [
      "worker-scan-101",
      "worker-scan-102"
    ],
    "workers_failed": [],
    "estimated_tokens": 32000,
    "actual_tokens": 16000,
    "parallel": true
  },
  "results": {
    "worker_aggregation": {
      "total_findings": 12,
      "by_worker": {
        "worker-scan-101": 0,
        "worker-scan-102": 5,
        "worker-scan-103": null,
        "worker-scan-104": null
      }
    }
  }
}
```

### Example 3: Worker-Based Execution (Sequential)

```json
{
  "id": "task-022",
  "title": "Implement authentication feature",
  "type": "development",
  "priority": "high",
  "status": "in-progress",
  "assigned_to": "development-master",
  "created_at": "2025-11-01T10:00:00Z",
  "created_by": "coordinator-master",
  "repository": "ry-ops/web-app",
  "context": {
    "description": "Implement user authentication with JWT",
    "related_issues": ["#145"],
    "previous_handoffs": []
  },
  "execution_mode": "workers",
  "worker_plan": {
    "total_workers": 4,
    "workers_spawned": [
      "worker-impl-201",
      "worker-impl-202"
    ],
    "workers_completed": [
      "worker-impl-201"
    ],
    "workers_failed": [],
    "estimated_tokens": 38000,
    "actual_tokens": 18000,
    "parallel": false
  },
  "results": {
    "worker_aggregation": {
      "components_completed": ["database-models", "jwt-service"],
      "components_pending": ["api-endpoints", "tests"]
    }
  }
}
```

---

## Migration Guide

### Backward Compatibility

Existing tasks without `execution_mode` default to `"traditional"` and work as before.

### Adding Worker Support

To convert a task to worker-based execution:

1. Add `"execution_mode": "workers"`
2. Add `worker_plan` object with required fields
3. Master agent spawns workers as specified
4. Update `worker_plan` as workers complete
5. Aggregate results in `results.worker_aggregation`

### Schema Validation

All coordination files should validate against their schemas:

```bash
# Validate task-queue.json
jq empty coordination/task-queue.json

# Check for required fields
jq '.tasks[] | select(.execution_mode == "workers") | select(.worker_plan == null)' coordination/task-queue.json
```

---

## Best Practices

1. **Use workers for parallelizable tasks**: Security scans, independent features
2. **Use traditional for sequential tasks**: Research, planning, single fixes
3. **Estimate tokens conservatively**: Better to over-allocate than under
4. **Update worker_plan in real-time**: Keep status current as workers complete
5. **Aggregate results clearly**: Make it easy to understand combined output
6. **Track actual vs estimated tokens**: Improve future estimates

---

## Version History

- **v1.0**: Original schema (traditional execution only)
- **v2.0**: Added master-worker execution support

---

*Document Version: 2.0*
