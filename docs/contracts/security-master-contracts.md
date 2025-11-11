# Security Master Agent Contracts

## Overview

The Security Master orchestrates security scanning, auditing, vulnerability management, and compliance verification through specialized security workers.

**Agent ID**: `security`
**Schema**: `master-state.schema.json`
**Parent**: Coordinator Master

## Core Responsibilities

1. **Vulnerability Scanning**: Automated security scans (SAST, DAST, dependencies)
2. **Security Auditing**: Code and configuration security audits
3. **Compliance Verification**: Ensure compliance with security policies
4. **Penetration Testing**: Simulated attack scenarios
5. **Vulnerability Management**: Track and remediate security issues

## Worker Types

| Worker Type | Token Budget | Purpose |
|-------------|--------------|---------|
| scan-worker | 10k | Automated security scanning |
| audit-worker | 15k | Deep security code audits |
| compliance-worker | 8k | Compliance verification |
| penetration-tester | 20k | Security testing |

## Input Contract

### Handoff from Coordinator
**Schema**: `handoff.schema.json`

```json
{
  "handoff_id": "coord-to-security-GUID",
  "from_master": "coordinator",
  "to_master": "security",
  "task_id": "task-003",
  "task_data": {
    "id": "task-003",
    "title": "Security scan of repository",
    "type": "security_scan",
    "priority": "critical",
    "context": {
      "repository": "org/repo",
      "branch": "main",
      "scan_types": ["dependencies", "static-analysis", "secrets"]
    }
  },
  "status": "pending_pickup"
}
```

## Output Contracts

### Vulnerability Report
**Schema**: `security-vulnerability.schema.json`

```json
{
  "vuln_id": "VULN-2025-0001",
  "cve_id": "CVE-2025-12345",
  "severity": "critical|high|medium|low|info",
  "cvss_score": 9.1,
  "category": "injection|authentication|xss|...",
  "title": "SQL Injection in login endpoint",
  "description": "Detailed vulnerability description",
  "affected_component": "auth-service",
  "location": {
    "file": "src/auth.js",
    "line_start": 42,
    "line_end": 45
  },
  "remediation": "Use parameterized queries",
  "status": "open",
  "detected_at": "2025-11-11T00:00:00Z",
  "detected_by": "sec-worker-ABCD1234"
}
```

### Worker Specification
**Schema**: `worker-spec.schema.json`

```json
{
  "worker_id": "sec-worker-ABCD1234",
  "worker_type": "scan-worker",
  "parent_master": "security",
  "task_id": "task-003",
  "context": {
    "scan_types": ["dependencies", "static-analysis", "secrets"],
    "knowledge_base_refs": {
      "security_policies": "/path/to/security-policies.json",
      "vulnerability_db": "/path/to/vuln-db.json"
    }
  },
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 30
  },
  "status": "pending"
}
```

## Behavioral Contracts

### Security Scan Flow

```
1. Receive scan task from coordinator
2. Determine scan types from context
3. Query vulnerability database for known issues
4. Spawn appropriate scan-worker
5. Worker executes scans:
   a. Dependency scanning (npm audit, etc.)
   b. Static analysis (eslint-security, etc.)
   c. Secret detection (git-secrets, etc.)
6. Aggregate scan results
7. Generate vulnerability reports
8. Update vulnerability database
9. Create handoff back to coordinator
```

### Vulnerability Lifecycle

```
open → in_progress → fixed|accepted_risk|false_positive
```

### Critical Vulnerability Escalation

When `severity === "critical"`:
1. Emit immediate dashboard event
2. Create high-priority alert
3. Notify commit-relay meta-agent
4. Block deployment if configured

## Performance Contracts

### Scan Completion Times
- Dependency scan: < 5 minutes
- Static analysis: < 15 minutes
- Secrets scan: < 10 minutes
- Full security audit: < 2 hours

### Accuracy Targets
- False positive rate: < 10%
- False negative rate: < 5%
- CVE detection rate: > 95%

## Integration Points

### Inputs
- Handoffs from coordinator
- Security scan requests
- Vulnerability database

### Outputs
- Vulnerability reports
- Security audit results
- Compliance reports
- Dashboard security events

## Version History

- **1.0.0** (2025-11-11): Initial security master contracts
