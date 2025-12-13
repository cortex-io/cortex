# Union System Flow Diagrams

## Production Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: PERMIT REQUEST                                             │
└─────────────────────────────────────────────────────────────────────┘

Developer/Master
      │
      ├─► Request Permit
      │   (PRODUCTION_DEPLOYMENT)
      │
      ▼
Permit Manager
      │
      ├─► Evaluate Auto-Approval
      │   - Check permit type
      │   - Check environment
      │   - Check tests passed
      │   - Check rollback plan exists
      │
      ▼
   Manual Approval Needed
      │
      ├─► Create Rollback Plan First
      │   (rollback-planner.js)
      │
      ▼
Approval Router
      │
      ├─► Create Handoffs to:
      │   - security-master
      │   - development-master
      │
      ▼
Master Handoffs Created

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: APPROVAL WORKFLOW                                          │
└─────────────────────────────────────────────────────────────────────┘

Security Master               Development Master
      │                             │
      ├─► Review Handoff            ├─► Review Handoff
      │   - Security implications   │   - Technical review
      │   - Scan results            │   - Test coverage
      │   - Secrets check           │   - Code quality
      │   - Compliance              │   - Rollback plan
      │                             │
      ├─► Approve Permit            ├─► Approve Permit
      │   (permit-manager.js)       │   (permit-manager.js)
      │                             │
      └─────────────┬───────────────┘
                    │
                    ▼
              Permit Fully Approved
                    │
                    ├─► Status: 'approved'
                    ├─► Expires: 24 hours
                    └─► Logged to audit trail

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: WORKER SPAWN & CERTIFICATION                               │
└─────────────────────────────────────────────────────────────────────┘

Master spawns worker
      │
      ▼
Worker Initialization
      │
      ├─► Load Union Components
      │   - CertificationValidator
      │   - PermitManager
      │   - AuditLogger
      │
      ▼
Certification Validation
      │
      ├─► Check Required Certs:
      │   - javascript_proficiency
      │   - git_operations
      │   - testing_fundamentals
      │   - production_deployment (union)
      │
      ├─► Check Expiration
      │   - Renewal period
      │   - Performance metrics
      │
      ▼
   Valid Certifications?
      │
      ├─► YES (union) ─► Continue
      ├─► NO (union) ──► FAIL (cannot start)
      └─► NO (non-union) ─► WARN (start anyway)
      │
      ▼
Worker Registered
      │
      └─► Logged to audit trail

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 4: TASK EXECUTION                                             │
└─────────────────────────────────────────────────────────────────────┘

Worker fetches task
      │
      ▼
Check Permit Requirement
      │
      ├─► Load skill-matrix.json
      ├─► Check worker type
      ├─► Check environment
      │
      ▼
   Permit Required?
      │
      ├─► YES ─► Validate Permit
      │          │
      │          ├─► Check status: 'approved'
      │          ├─► Check expiration
      │          ├─► Check resource match
      │          │
      │          ▼
      │       Valid Permit?
      │          │
      │          ├─► YES ─► Continue
      │          └─► NO ──► FAIL
      │
      └─► NO ──► Continue
      │
      ▼
Execute Task
      │
      ├─► Run deployment
      ├─► Monitor metrics
      ├─► Check health
      │
      ▼
   Success?
      │
      ├─► YES ─► Consume Permit
      │          └─► Log to audit trail
      │
      └─► NO ──► Trigger Rollback

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 5: ROLLBACK (IF NEEDED)                                       │
└─────────────────────────────────────────────────────────────────────┘

Rollback Triggered
      │
      ├─► Check Trigger Conditions:
      │   - error_rate > 5%
      │   - health_check_failed
      │   - manual_trigger
      │
      ▼
Load Rollback Plan
      │
      ├─► Retrieve snapshots
      ├─► Load rollback steps
      │
      ▼
Execute Rollback Steps (in sequence)
      │
      ├─► Step 1: Scale deployment to 0
      │   └─► Timeout: 60s
      │
      ├─► Step 2: Revert ConfigMap
      │   └─► Timeout: 30s
      │
      ├─► Step 3: Scale deployment to 3
      │   └─► Timeout: 120s
      │
      ▼
Run Verification Checks
      │
      ├─► health_check
      ├─► smoke_test
      ├─► integration_test
      │
      ▼
   All Checks Passed?
      │
      ├─► YES ─► Rollback Complete
      │          └─► Log to audit trail
      │
      └─► NO ──► Rollback Failed
                 └─► Alert human operator

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 6: AUDIT & COMPLIANCE                                         │
└─────────────────────────────────────────────────────────────────────┘

Audit Logger (continuous)
      │
      ├─► Log Events:
      │   - Worker spawn
      │   - Permit request
      │   - Permit approval
      │   - Certification check
      │   - Task execution
      │   - Permit consumption
      │   - Rollback execution
      │
      ├─► Hash Chain:
      │   - SHA-256(current + previous_hash)
      │   - Tamper detection
      │
      ▼
Immutable Audit Trail
      │
      └─► audit-log.jsonl
          (append-only)

Compliance Reporter (on-demand)
      │
      ├─► Query Audit Log
      │   - Date range filter
      │   - Event type filter
      │
      ├─► Calculate Metrics:
      │   - SOC2 criteria scores
      │   - Worker performance
      │   - Permit usage stats
      │
      ├─► Verify Integrity:
      │   - Hash chain validation
      │
      ▼
Generate Reports
      │
      ├─► SOC2 Compliance Report
      ├─► Worker Performance Report
      └─► Permit Usage Report
          │
          └─► Export: JSON, CSV, HTML
```

## Union vs Non-Union Worker Comparison

```
┌─────────────────────────────────────────────────────────────────────┐
│ UNION WORKER (security-fix-worker)                                  │
└─────────────────────────────────────────────────────────────────────┘

Spawn Request
      │
      ├─► MUST have all certifications:
      │   - javascript_proficiency
      │   - security_scanning
      │   - vulnerability_remediation
      │   - secrets_management
      │   - compliance_awareness
      │
      ├─► Certifications MUST be current
      │   - No expired certs allowed
      │
      ├─► Production REQUIRES permit
      │   - Auto-deny without permit
      │
      ▼
   All Requirements Met?
      │
      ├─► YES ─► Worker Starts
      │          └─► Full audit logging
      │
      └─► NO ──► DENIED
                 └─► Cannot start

┌─────────────────────────────────────────────────────────────────────┐
│ NON-UNION WORKER (implementation-worker)                            │
└─────────────────────────────────────────────────────────────────────┘

Spawn Request
      │
      ├─► Should have certifications:
      │   - javascript_proficiency
      │   - git_operations
      │   - testing_fundamentals
      │
      ├─► Expired certs allowed
      │   - Warning issued
      │
      ├─► Production may require permit
      │   - Checked but not enforced
      │
      ▼
   Certifications Valid?
      │
      ├─► YES ─► Worker Starts
      │          └─► Normal logging
      │
      └─► NO ──► Worker Starts with Warnings
                 └─► Basic logging
```

## Permit Type Decision Tree

```
Need to make production change?
      │
      ▼
Is it an emergency?
      │
      ├─► YES ─► EMERGENCY_CHANGE
      │          - Auto-approved
      │          - 4 hour window
      │          - Rollback required
      │
      └─► NO
          │
          ▼
    Is it a security patch?
          │
          ├─► YES ─► Check CVSS score
          │          │
          │          ├─► >= 7.0 ─► SECURITY_PATCH (auto)
          │          │             - 12 hour window
          │          │
          │          └─► < 7.0 ──► SECURITY_PATCH (manual)
          │                        - Security master approval
          │
          └─► NO
              │
              ▼
        Is it a config change?
              │
              ├─► YES ─► CONFIGURATION_CHANGE
              │          - Auto-approved
              │          - 8 hour window
              │
              └─► NO
                  │
                  ▼
            Is it a database migration?
                  │
                  ├─► YES ─► DATABASE_MIGRATION
                  │          - Manual approval (2)
                  │          - 48 hour window
                  │          - Tests required
                  │
                  └─► NO
                      │
                      ▼
                Is it infrastructure?
                      │
                      ├─► YES ─► INFRASTRUCTURE_CHANGE
                      │          - Manual (cicd + security)
                      │          - 24 hour window
                      │
                      └─► NO ──► PRODUCTION_DEPLOYMENT
                                 - Manual (dev + security)
                                 - 24 hour window
                                 - Tests required
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CORTEX UNION SYSTEM                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Masters    │      │   Workers    │      │  MCP Server  │
│              │      │              │      │              │
│ - coordinator│      │ - impl       │      │ - AI agents  │
│ - development│      │ - security   │      │ - tools      │
│ - security   │      │ - test       │      │ - queries    │
│ - cicd       │      │ - docs       │      │              │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │      UNION COMPONENTS         │
              └──────────────────────────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Permit    │      │Certification│      │   Rollback  │
│  Manager    │      │  Validator  │      │   Planner   │
│             │      │             │      │             │
│ - request   │      │ - validate  │      │ - create    │
│ - approve   │      │ - award     │      │ - execute   │
│ - consume   │      │ - renew     │      │ - verify    │
└─────┬───────┘      └─────┬───────┘      └─────┬───────┘
      │                    │                    │
      └────────────────────┼────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Audit Logger   │
                  │                 │
                  │ - log events    │
                  │ - hash chain    │
                  │ - verify        │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ audit-log.jsonl │
                  │  (immutable)    │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Compliance    │
                  │    Reporter     │
                  │                 │
                  │ - SOC2          │
                  │ - workers       │
                  │ - permits       │
                  └─────────────────┘
```

## State Machine: Permit Lifecycle

```
           ┌─────────────┐
           │   PENDING   │◄──── Request created
           └──────┬──────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
    Auto-Approve      Manual Review
         │                 │
         │            ┌────┴────┐
         │            │         │
         │            ▼         ▼
         │      ┌──────────┐ ┌──────────┐
         └─────►│ APPROVED │ │  DENIED  │
                └────┬─────┘ └──────────┘
                     │
              ┌──────┴──────┐
              │             │
              ▼             ▼
         ┌─────────┐   ┌─────────┐
         │ CONSUMED│   │ EXPIRED │
         └─────────┘   └─────────┘
              │             │
              │             ▼
              │        ┌─────────┐
              └───────►│  FINAL  │
                       └─────────┘
```

## State Machine: Worker Certification

```
         ┌─────────────┐
         │ UNCERTIFIED │◄──── New worker
         └──────┬──────┘
                │
                ▼
         Award Certification
                │
                ▼
         ┌─────────────┐
         │  CERTIFIED  │
         │   (valid)   │
         └──────┬──────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
Performance Good      Performance Poor
    │                       │
    ▼                       ▼
Auto-Renewal          Certification Expires
    │                       │
    │                       ▼
    │                ┌─────────────┐
    │                │   EXPIRED   │
    │                └──────┬──────┘
    │                       │
    │                ┌──────┴──────┐
    │                │             │
    │                ▼             ▼
    │          Manual Renewal   Revoked
    │                │             │
    └────────────────┴─────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  CERTIFIED  │
              └─────────────┘
```

This visual flow documentation complements the main union-system.md documentation and provides a clear understanding of how all components interact during production deployments.
