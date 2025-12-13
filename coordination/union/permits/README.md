# Cortex Union Permits Directory

This directory stores permit files for Cortex union governance system.

## Permit Lifecycle

1. **Requested** - Worker or master requests permit via `permit-manager.js`
2. **Pending** - Awaiting manual approval (or auto-approved immediately)
3. **Approved** - All required approvers have signed off
4. **Consumed** - Permit has been used for the change
5. **Expired** - Permit timeout reached before use
6. **Denied** - Rejected by an approver
7. **Revoked** - Cancelled after approval

## Permit Types

### EMERGENCY_CHANGE
- Auto-approved
- 4 hour expiration
- Rollback required
- Use for: Critical production fixes

### PRODUCTION_DEPLOYMENT
- Manual approval required
- Approvers: security-master, development-master
- 24 hour expiration
- Tests required
- Rollback required
- Use for: Production releases

### SECURITY_PATCH
- Auto-approved if CVSS >= 7.0
- Manual approval otherwise
- 12 hour expiration
- Tests required
- Use for: Security vulnerability fixes

### CONFIGURATION_CHANGE
- Auto-approved
- 8 hour expiration
- Audit trail required
- Use for: Config updates

### DATABASE_MIGRATION
- Manual approval required
- Approvers: development-master, coordinator-master
- 48 hour expiration
- Tests required
- Rollback required
- Use for: Schema changes

### INFRASTRUCTURE_CHANGE
- Manual approval required
- Approvers: cicd-master, security-master
- 24 hour expiration
- Tests required
- Rollback required
- Use for: Infrastructure modifications

## File Format

Permits are stored as JSON files with naming pattern:
```
permit-{type}-{timestamp}-{random}.json
```

Example: `permit-production-deployment-1702492800000-a1b2c3d4.json`

## Cleanup

Expired permits are automatically cleaned up by:
```bash
node ../permit-manager.js cleanup
```

## Integration

Permits integrate with:
- **Audit Trail**: All permit events logged to `coordination/governance/audit-log.jsonl`
- **Approval Router**: Routes manual approvals to master agents
- **Rollback Plans**: Links to rollback plans for safety
- **Worker Certification**: Validates worker qualifications before permit issuance
