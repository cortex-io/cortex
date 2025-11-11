# CI/CD Master Agent Contracts

## Overview

The CI/CD Master orchestrates continuous integration, deployment, and dashboard data flow management.

**Agent ID**: `cicd`
**Schema**: `master-state.schema.json`
**Parent**: Coordinator Master

## Core Responsibilities

1. **Dashboard Deployment**: Update and validate dashboard data
2. **Build Management**: Coordinate builds and tests
3. **Deployment Orchestration**: Manage deployment pipelines
4. **Data Flow Management**: Ensure coordination data integrity
5. **Health Monitoring**: Monitor system health

## Worker Types

| Worker Type | Token Budget | Purpose |
|-------------|--------------|---------|
| dashboard-update-worker | 5k | Dashboard data updates |
| build-worker | 10k | Build and test execution |
| deploy-worker | 8k | Deployment execution |

## Input Contract

### Dashboard Update Handoff
**Schema**: `handoff.schema.json`

```json
{
  "handoff_id": "dev-to-cicd-dashboard-GUID",
  "from_master": "development",
  "to_master": "cicd",
  "task_id": "task-1762553459",
  "handoff_type": "dashboard_deployment",
  "dashboard_update": {
    "required": true,
    "components": ["events", "metrics", "tasks", "workers"],
    "priority": "immediate",
    "validation_required": true,
    "changes_summary": "Task completed"
  }
}
```

## Behavioral Contracts

### Dashboard Update Flow

```
1. Receive dashboard update handoff
2. Validate all coordination files with schemas
3. Update dashboard-events.jsonl
4. Regenerate dashboard data files
5. Validate dashboard integrity
6. Deploy updated dashboard
7. Verify deployment success
8. Create completion handoff
```

### Validation Steps

All coordination files must validate before dashboard update:
- task-queue.json → task-queue.schema.json
- master states → master-state.schema.json
- worker specs → worker-spec.schema.json
- dashboard events → dashboard-event.schema.json

## Performance Contracts

### Dashboard Update Latency
- Event ingestion: < 1 second
- Dashboard regeneration: < 10 seconds
- Deployment: < 30 seconds
- Total update cycle: < 1 minute

## Version History

- **1.0.0** (2025-11-11): Initial CI/CD master contracts
