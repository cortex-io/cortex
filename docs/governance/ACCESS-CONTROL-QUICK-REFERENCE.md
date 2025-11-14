# Access Control Quick Reference

## CLI Commands

### Check Permission
```bash
node lib/governance/access-cli.js check <principal> <asset> <operation>

# Example
node lib/governance/access-cli.js check coordinator-master task-queue read
```

### Assign Role
```bash
node lib/governance/access-cli.js assign-role <principal> <role>

# Example
node lib/governance/access-cli.js assign-role new-worker agent-operator
```

### View Access Log
```bash
# Recent entries
node lib/governance/access-cli.js log --limit 20

# Denied access
node lib/governance/access-cli.js log --denied --time-range 1h

# Specific principal
node lib/governance/access-cli.js log --principal coordinator-master
```

### List Roles
```bash
# All roles
node lib/governance/access-cli.js list-roles

# Role assignments
node lib/governance/access-cli.js list-assignments
```

### Statistics
```bash
node lib/governance/access-cli.js stats
```

## Bash Integration

### Load Library
```bash
source "$COMMIT_RELAY_HOME/scripts/lib/access-check.sh"
```

### Check Permission
```bash
check_permission "coordinator-master" "task-queue" "read" || exit 1
```

### Require Permission
```bash
require_permission "coordinator-master" "task-queue" "write"
```

### Get Current Principal
```bash
PRINCIPAL=$(get_current_principal)
```

## Node.js Integration

### Basic Usage
```javascript
const AccessControl = require('./lib/governance/access-control');

const accessControl = new AccessControl();
await accessControl.initialize();

const result = await accessControl.checkPermission(
  'coordinator-master',
  'task-queue',
  'read'
);

if (result.allowed) {
  // Proceed
} else {
  console.error('Access denied:', result.reason);
}
```

### Filter Sensitive Data
```javascript
const DataFilter = require('./lib/governance/data-filter');

const dataFilter = new DataFilter();
await dataFilter.initialize();

const filtered = await dataFilter.filterSensitiveFields(data, principal);
```

## Roles

| Role | Permissions | Can Modify | Restrictions |
|------|-------------|------------|--------------|
| system-admin | read, write, execute, admin | all_assets | Requires audit |
| agent-operator | read, write, execute | tasks, worker_specs, events | Cannot modify metastore |
| observer | read | none | Cannot read PII |

## Common Operations

| Operation | Role Required | Asset | Permission |
|-----------|---------------|-------|------------|
| Spawn worker | agent-operator | worker-specs | write |
| Emit event | agent-operator | dashboard-events | write |
| Create task | agent-operator | task-queue | write |
| Route task | agent-operator | routing-patterns | read |
| View logs | observer | logs | read |
| Modify roles | system-admin | roles | admin |

## Troubleshooting

### Permission Denied
```bash
# Check role assignment
node lib/governance/access-cli.js list-assignments | grep <principal>

# Check role permissions
node lib/governance/access-cli.js list-roles

# Test specific permission
node lib/governance/access-cli.js check <principal> <asset> <operation>
```

### Performance Issues
```bash
# View stats
node lib/governance/access-cli.js stats

# Clear cache
node lib/governance/access-cli.js clear-cache
```

## Files

- **Roles**: `coordination/governance/roles.json`
- **Audit Log**: `coordination/governance/access-log.jsonl`
- **Access Control**: `lib/governance/access-control.js`
- **Data Filter**: `lib/governance/data-filter.js`
- **CLI**: `lib/governance/access-cli.js`
- **Bash Helper**: `scripts/lib/access-check.sh`
