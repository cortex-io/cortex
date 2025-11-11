# Governance Framework for commit-relay

## Overview

The commit-relay system implements a comprehensive governance framework to ensure safe, auditable, and controlled autonomous operations. This framework provides risk assessment, approval workflows, audit trails, and compliance monitoring for all system operations.

## Table of Contents

1. [Risk Assessment System](#risk-assessment-system)
2. [Approval Workflows](#approval-workflows)
3. [Audit Trails](#audit-trails)
4. [Compliance Monitoring](#compliance-monitoring)
5. [Circuit Breaker Integration](#circuit-breaker-integration)
6. [Governance Testing](#governance-testing)

## Risk Assessment System

### Risk Levels

The system classifies all tasks and operations into four risk levels:

#### 1. Low Risk
**Characteristics:**
- Read-only operations
- Documentation updates
- Non-critical bug fixes
- UI/UX improvements
- Test additions

**Approval Required:** No
**Audit Trail:** Standard
**Auto-execution:** Allowed

**Examples:**
- Adding documentation
- Fixing CSS issues
- Implementing UI features
- Writing tests

#### 2. Medium Risk
**Characteristics:**
- Configuration changes
- Code refactoring
- Database schema updates (non-breaking)
- API modifications
- Dependency updates

**Approval Required:** For production environments
**Audit Trail:** Enhanced
**Auto-execution:** Allowed with review

**Examples:**
- Updating database connection pooling
- Refactoring authentication middleware
- Modifying API endpoints
- Upgrading dependencies

#### 3. High Risk
**Characteristics:**
- Security-sensitive changes
- Production deployments
- Breaking API changes
- Major architecture changes
- Database migrations

**Approval Required:** Yes (2 approvers)
**Audit Trail:** Comprehensive
**Auto-execution:** Not allowed

**Examples:**
- Implementing OAuth 2.0
- Deploying to production
- Changing authentication methods
- Major database migrations

#### 4. Critical Risk
**Characteristics:**
- Security incident response
- Emergency fixes
- System-wide configuration changes
- Infrastructure modifications
- Data deletion operations

**Approval Required:** Yes (3+ approvers)
**Audit Trail:** Full forensic logging
**Auto-execution:** Blocked

**Examples:**
- Responding to security breaches
- Emergency production fixes
- Deleting production data
- Changing encryption keys

### Risk Assessment Process

```javascript
// Pseudo-code for risk assessment
function assessRisk(task) {
  const factors = {
    scope: analyzeScope(task),           // System-wide vs localized
    reversibility: canBeReversed(task),  // Rollback capability
    dataImpact: assessDataImpact(task),  // Data modification level
    securitySensitivity: checkSecurity(task),
    productionImpact: isProduction(task)
  };

  const riskScore = calculateRiskScore(factors);

  return {
    level: getRiskLevel(riskScore),     // low/medium/high/critical
    factors: factors,
    justification: explainRisk(factors)
  };
}
```

## Approval Workflows

### Workflow Stages

```
┌─────────────┐
│ Task Created│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Risk Assessment │
└──────┬──────────┘
       │
       ▼
   ┌───┴───┐
   │ Risk? │
   └───┬───┘
       │
       ├─[Low]────────► Auto-execute
       │
       ├─[Medium]──────► Review + Execute
       │
       ├─[High]────────► 2 Approvals Required
       │
       └─[Critical]────► 3+ Approvals + Manual Execution
```

### Approval Requirements by Risk Level

| Risk Level | Approvals Required | Approval Timeout | Can Override |
|------------|-------------------|------------------|--------------|
| Low        | 0                 | N/A              | N/A          |
| Medium     | 1 (for prod)      | 2 hours          | Yes (1 admin)|
| High       | 2                 | 4 hours          | Yes (2 admins)|
| Critical   | 3+                | 8 hours          | No           |

### Approval Process

1. **Request Submission**
   - Task enters approval queue
   - Risk assessment attached
   - Notification sent to approvers

2. **Review Period**
   - Approvers review task details
   - Risk factors evaluated
   - Questions/concerns raised

3. **Decision**
   - Approve: Task proceeds to execution
   - Reject: Task returned with feedback
   - Request Changes: Additional information needed

4. **Execution**
   - Approved tasks executed
   - Real-time monitoring active
   - Audit trail updated

### Approval Metadata

```json
{
  "approval_id": "approval-12345",
  "task_id": "task-67890",
  "risk_level": "high",
  "requested_at": "2025-11-11T10:00:00Z",
  "required_approvals": 2,
  "approvals": [
    {
      "approver": "admin-1",
      "approved_at": "2025-11-11T10:15:00Z",
      "comments": "Reviewed security implications, looks good"
    },
    {
      "approver": "admin-2",
      "approved_at": "2025-11-11T10:20:00Z",
      "comments": "Approved with recommendation for monitoring"
    }
  ],
  "status": "approved",
  "executed_at": "2025-11-11T10:25:00Z"
}
```

## Audit Trails

### Audit Trail Components

Every governance decision generates a comprehensive audit trail including:

1. **Task Information**
   - Task ID and title
   - Task type and priority
   - Creation timestamp
   - Creator identity

2. **Risk Assessment**
   - Risk level assigned
   - Risk factors evaluated
   - Risk score calculation
   - Justification for risk level

3. **Routing Decision**
   - Master selected
   - Routing confidence
   - Routing rationale
   - Alternative masters considered

4. **Approval Workflow**
   - Approval requirements
   - Approvers notified
   - Approval decisions
   - Approval timestamps

5. **Execution Details**
   - Execution start time
   - Worker(s) assigned
   - Execution status
   - Completion time

6. **Outcome**
   - Success/failure status
   - Changes made
   - Rollback information (if applicable)
   - Post-execution verification

### Audit Trail Format

```jsonl
{"timestamp":"2025-11-11T10:00:00Z","event":"task_created","task_id":"task-001","type":"security","priority":"high","creator":"coordinator"}
{"timestamp":"2025-11-11T10:00:01Z","event":"risk_assessed","task_id":"task-001","risk_level":"high","risk_score":0.85,"factors":{"security_sensitive":true,"production_impact":true}}
{"timestamp":"2025-11-11T10:00:02Z","event":"approval_required","task_id":"task-001","required_approvals":2,"notified_approvers":["admin-1","admin-2"]}
{"timestamp":"2025-11-11T10:15:00Z","event":"approval_granted","task_id":"task-001","approver":"admin-1","approval_count":1}
{"timestamp":"2025-11-11T10:20:00Z","event":"approval_granted","task_id":"task-001","approver":"admin-2","approval_count":2}
{"timestamp":"2025-11-11T10:25:00Z","event":"task_executed","task_id":"task-001","master":"security","worker":"sec-worker-ABC123"}
{"timestamp":"2025-11-11T11:00:00Z","event":"task_completed","task_id":"task-001","status":"success","duration_minutes":35}
```

### Audit Trail Storage

- **Location**: `coordination/audit/audit-trail.jsonl`
- **Retention**: 90 days active, then archived
- **Archival**: `coordination/archives/audit-YYYY-MM.jsonl.gz`
- **Indexing**: Indexed by task_id, event type, timestamp
- **Access Control**: Read-only for most users, append-only for system

### Audit Trail Queries

```bash
# Find all high-risk task approvals in last 30 days
grep '"risk_level":"high"' audit-trail.jsonl | tail -n 1000

# Show approval workflow for specific task
grep '"task_id":"task-001"' audit-trail.jsonl

# Count governance events by type
jq -r '.event' audit-trail.jsonl | sort | uniq -c

# Find tasks requiring manual intervention
grep '"event":"approval_timeout"' audit-trail.jsonl
```

## Compliance Monitoring

### Compliance Controls

1. **Policy Enforcement**
   - Risk assessment mandatory for all tasks
   - High-risk tasks require approvals
   - Critical tasks require manual execution
   - Audit trails generated automatically

2. **Access Control**
   - Role-based access control (RBAC)
   - Principle of least privilege
   - Separation of duties
   - Admin override logging

3. **Change Management**
   - All changes tracked
   - Rollback procedures documented
   - Testing required for high-risk changes
   - Production changes scheduled

4. **Security Controls**
   - Security scanning for code changes
   - Dependency vulnerability checks
   - Secret scanning
   - Security review for sensitive changes

### Compliance Reporting

```json
{
  "report_id": "compliance-2025-11",
  "period": "2025-11-01 to 2025-11-30",
  "metrics": {
    "total_tasks": 450,
    "risk_assessment_coverage": "100%",
    "high_risk_tasks": 23,
    "approval_compliance": "100%",
    "audit_trail_completeness": "100%",
    "failed_tasks": 12,
    "security_incidents": 0
  },
  "violations": [],
  "recommendations": [
    "Consider automating more medium-risk tasks",
    "Review approval timeout policies"
  ]
}
```

## Circuit Breaker Integration

### Circuit Breaker States

The governance framework integrates with circuit breakers to prevent cascading failures:

```
┌─────────┐
│ CLOSED  │ ◄───┐
│ (Normal)│     │
└────┬────┘     │
     │          │
     │ Failures │ Success
     │ exceed   │ threshold
     │ threshold│ reached
     ▼          │
┌─────────┐    │
│  OPEN   │    │
│(Blocking)    │
└────┬────┘    │
     │          │
     │ Timeout  │
     │          │
     ▼          │
┌─────────┐    │
│HALF-OPEN│────┘
│(Testing)│
└─────────┘
```

### Circuit Breaker Policies

- **Failure Threshold**: 5 failures in 10 minutes
- **Timeout**: 2 minutes in OPEN state
- **Success Threshold**: 3 consecutive successes to close
- **Monitoring**: Real-time state tracking
- **Auto-recovery**: Automatic transition to HALF-OPEN

### Circuit Breaker Governance

When circuit breaker opens:
1. Stop spawning new workers of that type
2. Alert administrators
3. Generate incident report
4. Require manual review before reset
5. Update risk assessment for affected tasks

## Governance Testing

### Test Framework

Location: `tests/governance/`

**Components:**
- `governance-test-framework.sh` - Main test framework
- `create-governance-test-tasks.sh` - Test task generator
- `route-test-tasks.sh` - MoE routing integration
- `validate-governance.sh` - Governance validator
- `run-all-governance-tests.sh` - Test orchestrator

### Test Coverage

1. **Risk Assessment Tests**
   - Verify risk level assignment
   - Check risk score calculation
   - Validate risk factors

2. **Approval Workflow Tests**
   - Simulate approval requests
   - Test timeout handling
   - Verify approval enforcement

3. **Audit Trail Tests**
   - Check audit log generation
   - Verify log completeness
   - Test audit trail queries

4. **Circuit Breaker Tests**
   - Test failure threshold detection
   - Verify auto-recovery
   - Check state transitions

5. **Compliance Tests**
   - Validate policy enforcement
   - Check access controls
   - Verify reporting accuracy

### Running Tests

```bash
# Run all governance tests
./tests/governance/run-all-governance-tests.sh

# Run specific test category
./tests/governance/governance-test-framework.sh --test risk-assessment

# Validate governance controls
./tests/governance/validate-governance.sh

# Generate compliance report
./tests/governance/generate-compliance-report.sh
```

## Configuration

### Governance Configuration File

Location: `coordination/governance/config.json`

```json
{
  "risk_assessment": {
    "enabled": true,
    "default_level": "medium",
    "auto_assess": true
  },
  "approval_workflows": {
    "enabled": true,
    "timeout_hours": {
      "medium": 2,
      "high": 4,
      "critical": 8
    },
    "required_approvals": {
      "medium": 1,
      "high": 2,
      "critical": 3
    }
  },
  "audit_trails": {
    "enabled": true,
    "retention_days": 90,
    "archive_location": "coordination/archives/audit",
    "compression": "gzip"
  },
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 5,
    "timeout_seconds": 120,
    "success_threshold": 3
  },
  "compliance": {
    "reporting_enabled": true,
    "report_frequency": "monthly",
    "alert_on_violations": true
  }
}
```

## Best Practices

1. **Risk Assessment**
   - Always assess risk before execution
   - Document risk factors clearly
   - Review risk assessments periodically
   - Update risk criteria based on incidents

2. **Approvals**
   - Provide clear context in approval requests
   - Set realistic approval timeouts
   - Document approval decisions
   - Track approval patterns

3. **Audit Trails**
   - Generate comprehensive audit logs
   - Archive logs regularly
   - Monitor audit trail completeness
   - Use audit trails for incident investigation

4. **Compliance**
   - Review compliance reports monthly
   - Address violations promptly
   - Update policies based on findings
   - Train users on governance policies

5. **Testing**
   - Test governance controls regularly
   - Simulate failure scenarios
   - Validate approval workflows
   - Verify audit trail integrity

## Related Documentation

- [Governance Testing Report](./governance-testing-report.md)
- [Circuit Breaker Documentation](./circuit-breaker.md)
- [MoE Router Documentation](./moe-router.md)
- [System Maintenance](../scripts/system-maintenance.sh)

---
*Last Updated: 2025-11-11*
*Version: 1.0*
*Status: Active*
