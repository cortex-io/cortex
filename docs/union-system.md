# Cortex Union System

The Cortex Union System is a governance layer that enforces approval gates, validates certifications, maintains audit trails, and ensures rollback plans for production changes.

## Overview

The Union System distinguishes between:
- **Union Workers**: Require strict governance (security-fix, production-deploy)
- **Non-Union Workers**: Lighter requirements (dev, test, documentation)

## Components

### Phase 6.1: Permit Workflow

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/union/`

**Files**:
- `permit-manager.js` - Manages permit lifecycle
- `approval-router.js` - Routes approvals to masters
- `permits/` - Permit storage directory

**Permit Types**:

| Type | Approval | Expiration | Requirements |
|------|----------|------------|--------------|
| EMERGENCY_CHANGE | Auto | 4 hours | Rollback plan |
| PRODUCTION_DEPLOYMENT | Manual (2 approvers) | 24 hours | Tests, rollback |
| SECURITY_PATCH | Auto if CVSS >= 7.0 | 12 hours | Tests, rollback |
| CONFIGURATION_CHANGE | Auto | 8 hours | Audit trail |
| DATABASE_MIGRATION | Manual (2 approvers) | 48 hours | Tests, rollback |
| INFRASTRUCTURE_CHANGE | Manual (2 approvers) | 24 hours | Tests, rollback |

**Usage**:
```bash
# Request permit
node coordination/union/permit-manager.js request PRODUCTION_DEPLOYMENT

# Approve permit
node coordination/union/permit-manager.js approve permit-id security-master

# Check permit status
node coordination/union/permit-manager.js check permit-id

# List all permits
node coordination/union/permit-manager.js list
```

**Workflow**:
1. Worker/master requests permit
2. Permit manager evaluates auto-approval criteria
3. If manual approval needed, approval-router creates handoffs
4. Masters approve via handoffs
5. Permit becomes active when fully approved
6. Worker consumes permit during task execution
7. Permit expires or is consumed

### Phase 6.2: Certification Checker

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/worker-certification/`

**Files**:
- `cert-validator.js` - Validates worker certifications
- `skill-matrix.json` - Certification requirements by worker type
- `records/` - Worker certification records

**Certification Levels**:
- **Basic**: Entry level (5 tasks, 80% success)
- **Intermediate**: Standard (10 tasks, 85% success)
- **Advanced**: Expert level (20 tasks, 90% success) - Union workers

**Worker Types**:

| Worker Type | Union Status | Required Certs | Permit Required (Prod) |
|-------------|--------------|----------------|------------------------|
| implementation-worker | Non-union | js, git, testing | Yes |
| security-scan-worker | Union | js, security_scanning, compliance | Yes |
| security-fix-worker | Union | js, security_scanning, vulnerability_remediation, secrets_management, compliance | Yes |
| production-deploy-worker | Union | js, git, testing, k8s, production_deployment | Yes |
| test-worker | Non-union | js, testing | No |
| documentation-worker | Non-union | js | No |

**Usage**:
```bash
# Validate worker
node coordination/worker-certification/cert-validator.js validate worker-001 implementation-worker production

# Award certification
node coordination/worker-certification/cert-validator.js award worker-001 implementation-worker javascript_proficiency

# Get certification summary
node coordination/worker-certification/cert-validator.js summary worker-001 implementation-worker
```

**Auto-Renewal**:
Certifications auto-renew based on performance:
- Successful task completions
- Error rate thresholds
- Quality metrics

### Phase 6.3: Audit Trail

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/governance/`

**Files**:
- `audit-logger.js` - Immutable audit logging
- `audit-log.jsonl` - Append-only log file
- `/Users/ryandahlberg/Projects/cortex/lib/governance/compliance-reporter.js` - Compliance reporting

**Features**:
- **Immutable**: Append-only JSONL format
- **Tamper-evident**: SHA-256 hash chain
- **Comprehensive**: All union operations logged
- **Compliant**: SOC2, security incident tracking

**Logged Events**:
- Worker spawns
- Permit requests/approvals/consumption
- Certification checks
- Security scans
- Deployments
- Rollbacks
- Access control decisions

**Usage**:
```bash
# Verify integrity
node coordination/governance/audit-logger.js verify

# Query events
node coordination/governance/audit-logger.js query worker_spawn

# Generate compliance report (30 days)
node coordination/governance/audit-logger.js report 30

# Count entries
node coordination/governance/audit-logger.js count
```

**Compliance Reporting**:
```bash
# SOC2 compliance report
node lib/governance/compliance-reporter.js soc2 30

# Worker performance report
node lib/governance/compliance-reporter.js workers 30

# Permit usage report
node lib/governance/compliance-reporter.js permits 30
```

### Phase 6.4: Rollback Plans

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/union/`

**Files**:
- `rollback-planner.js` - Creates rollback plans
- `rollback-executor.js` - Executes rollbacks
- `rollback-plans/` - Plan storage
- `snapshots/` - Pre-change snapshots

**Rollback Actions**:
- `scale_deployment` - Scale K8s deployment
- `revert_configmap` - Restore ConfigMap
- `revert_secret` - Restore Secret
- `rollback_database` - Database restore
- `git_revert` - Git revert
- `restore_snapshot` - Generic restore
- `delete_resource` - Delete K8s resource
- `run_script` - Execute custom script

**Trigger Conditions**:
- Production: error_rate > 5%, health_check_failed, test_failure_rate > 10%
- Staging: error_rate > 15%, health_check_failed
- Development: manual_trigger

**Usage**:
```bash
# Create rollback plan
node coordination/union/rollback-planner.js create permit-id deployment

# List plans
node coordination/union/rollback-planner.js list

# Show plan details
node coordination/union/rollback-planner.js show rollback-id

# Execute rollback
node coordination/union/rollback-executor.js execute rollback-id triggeredBy reason
```

**Verification Checks**:
- health_check - Endpoint health
- smoke_test - Basic functionality
- integration_test - Integration tests
- database_check - Database integrity
- metrics_check - System metrics

## MCP Server Integration

**Location**: `/Users/ryandahlberg/Projects/cortex/mcp-server/tools/index.js`

**Tools Added**:

### cortex_request_permit
Request a union permit for production changes.

```javascript
{
  permit_type: 'PRODUCTION_DEPLOYMENT',
  requester_id: 'development-master',
  requester_type: 'master',
  resource_type: 'deployment',
  resource_identifier: 'cortex-api',
  environment: 'production',
  justification: 'Deploy v2.0 with new features',
  rollback_plan_id: 'rollback-001'
}
```

### cortex_check_certification
Validate worker certification status.

```javascript
{
  worker_id: 'worker-001',
  worker_type: 'security-fix-worker',
  environment: 'production'
}
```

### cortex_log_audit_event
Log event to audit trail.

```javascript
{
  event_type: 'custom_event',
  actor_id: 'system',
  action: 'perform_action',
  resource_type: 'deployment',
  resource_id: 'cortex-api',
  result: 'success'
}
```

### cortex_create_rollback_plan
Create rollback plan for permit.

```javascript
{
  permit_id: 'permit-001',
  resource_type: 'deployment',
  resource_identifier: 'cortex-api',
  environment: 'production',
  creator_id: 'development-master',
  creator_type: 'master'
}
```

### cortex_approve_permit
Approve pending permit.

```javascript
{
  permit_id: 'permit-001',
  approver_id: 'security-master'
}
```

### cortex_generate_compliance_report
Generate compliance report.

```javascript
{
  report_type: 'soc2', // or 'workers', 'permits'
  days: 30
}
```

## Worker Integration

**Location**: `/Users/ryandahlberg/Projects/cortex/lib/workers/worker-mode.js`

Workers automatically:
1. Validate certifications on startup
2. Check permit requirements before task execution
3. Validate permits if provided
4. Consume permits after successful execution
5. Log all actions to audit trail

**Certification Failures**:
- Union workers: Cannot start
- Non-union workers: Start with warnings

**Permit Failures**:
- Union workers: Task execution denied
- Production environment: Task execution denied

## Governance Flow

### Production Deployment Flow

1. **Development Master** creates task for production deployment
2. **Permit Manager** is invoked to request permit
   - Permit type: PRODUCTION_DEPLOYMENT
   - Creates rollback plan first
3. **Approval Router** routes to security-master and development-master
4. Both masters receive handoff with approval instructions
5. Masters review and approve via permit manager
6. Permit becomes active
7. **Worker** is spawned (certification validated)
8. Worker validates permit before execution
9. Worker executes deployment
10. Worker consumes permit
11. All actions logged to audit trail
12. If deployment fails, rollback plan auto-triggers

### Security Patch Flow (High Severity)

1. **Security Master** detects vulnerability (CVSS >= 7.0)
2. **Permit Manager** auto-approves SECURITY_PATCH permit
3. Rollback plan created automatically
4. **Security-fix-worker** spawned (union worker)
5. Worker certifications validated (must have security certs)
6. Worker applies fix with permit
7. Worker consumes permit
8. Audit trail records all actions
9. Compliance report shows patch applied

## File Structure

```
/Users/ryandahlberg/Projects/cortex/
├── coordination/
│   ├── union/
│   │   ├── permit-manager.js
│   │   ├── approval-router.js
│   │   ├── rollback-planner.js
│   │   ├── rollback-executor.js
│   │   ├── permits/
│   │   │   └── README.md
│   │   ├── rollback-plans/
│   │   ├── snapshots/
│   │   └── approval-tracking/
│   ├── worker-certification/
│   │   ├── cert-validator.js
│   │   ├── skill-matrix.json
│   │   └── records/
│   ├── governance/
│   │   ├── audit-logger.js
│   │   ├── audit-log.jsonl
│   │   └── reports/
│   └── schemas/
│       ├── permit-request.schema.json
│       └── rollback-plan.schema.json
├── lib/
│   ├── governance/
│   │   └── compliance-reporter.js
│   └── workers/
│       └── worker-mode.js (integrated)
└── mcp-server/
    └── tools/
        └── index.js (integrated)
```

## Security Features

1. **Immutable Audit Trail**: Tamper-evident hash chain
2. **Dual Approvals**: Critical changes require 2 approvers
3. **Certification Enforcement**: Union workers must be certified
4. **Automatic Rollbacks**: Triggered on failure conditions
5. **Permit Expiration**: Time-limited change windows
6. **Access Control**: Role-based approval routing

## Compliance

### SOC2 Trust Service Criteria

- **Security (CC6.1-6.8)**: Access control, security scans
- **Availability (A1.1-A1.3)**: Deployment success, rollback capability
- **Processing Integrity (PI1.1-PI1.5)**: Audit log integrity, cert compliance
- **Confidentiality (C1.1-C1.2)**: Permit authorization
- **Privacy (P1.1-P8.1)**: Audit trail completeness

### Compliance Scores

Calculated based on:
- Security scan pass rate
- Access control denials
- Deployment success rate
- Certification compliance
- Audit log integrity

## Best Practices

1. **Always create rollback plans** for production changes
2. **Request permits early** - approval may take time
3. **Keep certifications current** - auto-renewal helps
4. **Review audit logs regularly** - detect anomalies
5. **Test rollback plans** in staging first
6. **Use appropriate permit types** - match to change scope
7. **Document justifications well** - aids approval process

## Troubleshooting

### Permit Denied
- Check approval status: `permit-manager.js check permit-id`
- Verify approvers have approved
- Check expiration time
- Ensure rollback plan exists if required

### Certification Failed
- Check certification status: `cert-validator.js summary worker-id worker-type`
- Award missing certifications manually if needed
- Review skill matrix requirements
- Check renewal periods

### Audit Log Issues
- Verify integrity: `audit-logger.js verify`
- Check file permissions on audit-log.jsonl
- Ensure sufficient disk space

### Rollback Execution Failed
- Review execution log in rollback plan JSON
- Check step parameters
- Verify Kubernetes access
- Test steps manually

## Integration Points

- **Coordinator Master**: Routes tasks, manages handoffs
- **Development Master**: Spawns workers, approves permits
- **Security Master**: Approves security changes, reviews scans
- **CI/CD Master**: Handles deployments, infrastructure
- **Worker Pool**: Enforces certifications, validates permits
- **Dashboard**: Displays metrics, compliance status
- **MCP Server**: Exposes tools to AI agents

## Future Enhancements

- Automated compliance reporting to external systems
- Machine learning for approval recommendations
- Advanced rollback strategies (canary, blue-green)
- Integration with external secret managers
- Real-time monitoring integration
- Advanced certification paths
