# Inventory Master Agent Contracts

## Overview

The Inventory Master manages documentation, asset tracking, and system inventory across the commit-relay system.

**Agent ID**: `inventory`
**Schema**: `master-state.schema.json`
**Parent**: Coordinator Master

## Core Responsibilities

1. **Documentation Management**: Maintain system documentation
2. **Asset Tracking**: Track code assets, dependencies, workers
3. **Knowledge Base Curation**: Organize and maintain knowledge bases
4. **Metrics Collection**: Aggregate system metrics
5. **Audit Trail**: Maintain comprehensive audit logs

## Worker Types

| Worker Type | Token Budget | Purpose |
|-------------|--------------|---------|
| doc-worker | 8k | Documentation generation |
| audit-worker | 10k | Audit trail maintenance |
| metrics-worker | 6k | Metrics aggregation |

## Input Contract

### Handoff from Coordinator
**Schema**: `handoff.schema.json`

```json
{
  "handoff_id": "coord-to-inventory-GUID",
  "from_master": "coordinator",
  "to_master": "inventory",
  "task_id": "task-DOC-001",
  "task_data": {
    "type": "documentation",
    "context": {
      "target": "api|architecture|contracts",
      "scope": "full|partial|update"
    }
  }
}
```

## Behavioral Contracts

### Documentation Update Flow

```
1. Detect system changes (commits, new features)
2. Identify documentation needing updates
3. Spawn doc-worker for updates
4. Review and validate documentation
5. Commit documentation changes
6. Update asset inventory
```

## Version History

- **1.0.0** (2025-11-11): Initial inventory master contracts
