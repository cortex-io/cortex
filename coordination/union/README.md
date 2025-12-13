# Cortex Union System

Governance layer for production changes with approval gates, certifications, and rollback plans.

## Quick Start

### Request a Permit

```bash
node permit-manager.js request PRODUCTION_DEPLOYMENT
```

### Approve a Permit

```bash
node permit-manager.js approve <permit-id> security-master
```

### Create Rollback Plan

```bash
node rollback-planner.js create <permit-id> deployment
```

### Execute Rollback

```bash
node rollback-executor.js execute <rollback-id> manual "Manual rollback triggered"
```

## Components

### permit-manager.js
Manages permit lifecycle: request, approve, deny, consume, revoke.

**CLI**:
- `request <type>` - Request new permit
- `approve <id> <approver>` - Approve permit
- `check <id>` - Check permit status
- `list` - List all permits
- `cleanup` - Clean expired permits

### approval-router.js
Routes approval requests to appropriate masters via handoffs.

**CLI**:
- `check-timeouts` - Check and escalate timed out approvals
- `list` - List approval requests

### rollback-planner.js
Creates rollback plans with steps and verification.

**CLI**:
- `create <permit-id> <resource-type>` - Create plan
- `list` - List all plans
- `show <plan-id>` - Show plan details

### rollback-executor.js
Executes rollback plans with verification.

**CLI**:
- `execute <plan-id> <triggered-by> <reason>` - Execute rollback

## Directories

- `permits/` - Permit JSON files
- `rollback-plans/` - Rollback plan JSON files
- `snapshots/` - Pre-change snapshots
- `approval-tracking/` - Approval workflow tracking

## Permit Types

| Type | Auto-Approve | Expiration | Approvers |
|------|--------------|------------|-----------|
| EMERGENCY_CHANGE | Yes | 4h | None |
| PRODUCTION_DEPLOYMENT | No | 24h | security, development |
| SECURITY_PATCH | CVSS >= 7.0 | 12h | security |
| CONFIGURATION_CHANGE | Yes | 8h | None |
| DATABASE_MIGRATION | No | 48h | development, coordinator |
| INFRASTRUCTURE_CHANGE | No | 24h | cicd, security |

## Integration

Used by:
- Worker spawn process (certification validation)
- Task execution (permit validation)
- Master handoffs (approval routing)
- Audit trail (all events logged)
- MCP server (tools exposed to AI)

See `/Users/ryandahlberg/Projects/cortex/docs/union-system.md` for complete documentation.
