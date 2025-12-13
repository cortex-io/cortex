# OpenTofu MCP Server Integration

## Overview

The OpenTofu MCP Server provides Infrastructure as Code (IaC) management capabilities to the Cortex autonomous management system. It enables safe, monitored management of cloud infrastructure through OpenTofu/Terraform with comprehensive safety features and audit logging.

**Repository**: [ry-ops/opentofu-mcp-server](https://github.com/ry-ops/opentofu-mcp-server)
**Integration Date**: 2025-12-13
**Strategic Importance**: CRITICAL
**Risk Level**: CRITICAL

## Integration Components

### 1. Monitoring Configuration

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/monitoring/opentofu-mcp-server.json`

The monitoring configuration provides:
- **Health Checks**:
  - CLI compatibility (OpenTofu/Terraform version tracking)
  - Dependency health monitoring
  - Infrastructure health checks (state, workspaces, operations)
  - Code quality metrics (Black, Ruff, MyPy, Pytest)
  - Security posture scanning

- **Observability**:
  - Dashboard widget displaying IaC metrics
  - Event tracking for all infrastructure operations
  - Metrics collection for operation success/failure
  - Audit log monitoring with JSON parsing

- **Alerts**: Critical, high, medium, low severity thresholds for:
  - State file exposure
  - Credential leaks
  - Protected workspace breaches
  - Audit log corruption
  - CLI version mismatches

### 2. Health Check Script

**Location**: `/Users/ryandahlberg/Projects/cortex/scripts/monitoring/check-opentofu-health.sh`

Automated health monitoring that checks:
- OpenTofu/Terraform CLI availability and version
- MCP server Python syntax validation
- Operation log analysis (total ops, apply, destroy, failures)
- Workspace protection configuration
- Security issues (state files, .env exposure, log permissions)

**Health Score Calculation** (0-100):
- CLI unavailable: -40 points
- MCP server invalid: -30 points
- Security issues: -20 points
- Operation failures: -1 per failure percentage

**Frequency**: Hourly (configurable via `HEALTH_CHECK_INTERVAL`)

**Reports**: JSON reports stored in `/Users/ryandahlberg/Projects/cortex/coordination/reports/opentofu-mcp-server/`

### 3. Security Scan Configuration

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/tasks/opentofu-security-scan.json`

**Priority**: CRITICAL

**Scan Types**:
- Dependency vulnerabilities (pip-audit, safety)
- Secrets detection (gitleaks, trufflehog)
- Static analysis (bandit, semgrep)
- Command injection vulnerabilities
- State file exposure detection
- Workspace protection audit

**IaC-Specific Checks**:
- State file detection in repository
- Backend credential exposure
- Provider credential exposure
- Workspace configuration audit
- Operation log security

**Compliance Verification**:
- *.tfstate files gitignored
- Workspace protection enforced
- Audit logging enabled
- Confirmation tokens required

**Risk Assessment**:
- Infrastructure Impact: CRITICAL
- Data Sensitivity: HIGH
- Blast Radius: HIGH
- Privilege Level: HIGH
- Overall Risk: CRITICAL

### 4. Dashboard Integration

**Location**: `/Users/ryandahlberg/Projects/cortex/eui-dashboard/server/index.js`

**API Endpoints**:

#### `/api/opentofu/health`
Returns current health status including:
- Health score (0-100)
- CLI status (tofu/terraform version and availability)
- MCP server status
- Operations summary
- Security status

#### `/api/opentofu/metrics`
Provides comprehensive IaC metrics:
- Health score and CLI information
- Operations (total, apply, destroy, failed, success rate)
- Workspace protection (enabled, count, workspaces)
- Security (issues count, warnings, last scan)
- Recent operations from audit log
- Infrastructure metrics (resources, workspaces, state backend)

#### `/api/opentofu/operations`
Returns operation history from audit log:
- Configurable limit (default 50)
- Parsed JSON operations with timestamps
- Operation type, workspace, success status
- Full audit trail

#### `/api/opentofu/security`
Security scan status and configuration:
- Scan status and priority
- Focus areas and compliance checks
- Security notes and risk assessment
- Scheduled scan configuration

## Safety Features

### Workspace Protection

**Protected Workspaces** (default): `production`, `prod`, `main`

Destructive operations (`apply`, `destroy`) are **blocked** on protected workspaces. This prevents accidental infrastructure destruction in production environments.

**Configuration**: Set `TOFU_PROTECTED_WORKSPACES` environment variable to customize.

### Confirmation Tokens

All auto-approve operations require a `confirmation_token` parameter matching the current workspace name:

```python
# This will fail without proper confirmation
apply(working_dir="/path/to/config", auto_approve=True)

# This will succeed
apply(
    working_dir="/path/to/config",
    auto_approve=True,
    confirmation_token="development"  # Must match current workspace
)
```

### Audit Logging

All state-changing operations are logged to `tofu_operations.log` in JSON format:

```json
{
  "timestamp": "2025-12-13T14:20:00.000Z",
  "operation": "apply",
  "workspace": "development",
  "success": true,
  "cli": "tofu",
  "details": {
    "working_dir": "/path/to/config",
    "auto_approve": true
  }
}
```

**Operations Logged**:
- `apply` - Infrastructure changes
- `destroy` - Resource destruction
- `import` - Resource imports
- `workspace_select` - Workspace switches

## MCP Server Tools

### Safe Operations
- `init` - Initialize workspace
- `plan` - Generate execution plan
- `validate` - Validate configuration
- `fmt` - Format configuration files
- `show` - Show current state
- `output` - Get output values
- `state_list` - List resources in state
- `state_show` - Show specific resource
- `workspace_list` - List workspaces
- `get_version` - Get CLI version info

### Logged Operations
- `workspace_select` - Switch workspace (logged)
- `import_resource` - Import existing resource (logged)

### Protected Operations
- `apply` - Apply infrastructure changes (requires confirmation token)
- `destroy` - Destroy resources (requires confirmation token)

## Security Considerations

### Critical Risks

1. **State File Exposure**: Terraform/OpenTofu state files contain:
   - Cloud provider credentials
   - Resource IDs and configurations
   - IP addresses and network topology
   - Sensitive outputs and variables

   **Mitigation**: Ensure state files are never committed to git, use remote encrypted state backends.

2. **Workspace Protection Bypass**: Mechanisms must prevent unauthorized access to protected workspaces.

   **Mitigation**: Regular audits of workspace protection enforcement, confirmation token validation tests.

3. **Command Injection**: CLI commands executed via subprocess.

   **Mitigation**: Input sanitization, command construction validation, regular security scans.

4. **Credential Management**: Cloud provider credentials required for operations.

   **Mitigation**: Environment variables only, no hardcoded credentials, regular rotation, least-privilege access.

### Security Monitoring

**Daily Automated Scans**:
- Dependency vulnerabilities
- Secrets exposure detection
- State file presence in repository
- .env file tracking in git
- Operation log permissions
- Workspace protection configuration

**Immediate Alerts For**:
- State file exposure (CRITICAL)
- Credential leaks (CRITICAL)
- Protected workspace breaches (CRITICAL)
- Audit log corruption (HIGH)

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenTofu MCP Server                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  14 Tools    │  │ Workspace    │  │ Audit        │        │
│  │  (init, plan,│  │ Protection   │  │ Logging      │        │
│  │  apply, etc.)│  │              │  │              │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cortex Integration Layer                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Health Check │  │ Security     │  │ Dashboard    │        │
│  │ Script       │  │ Scanner      │  │ API          │        │
│  │ (Hourly)     │  │ (Daily)      │  │ (Real-time)  │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cortex Masters & Dashboard                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Security     │  │ Development  │  │ Dashboard    │        │
│  │ Master       │  │ Master       │  │ UI           │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Metrics Tracked

### Operation Metrics
- Total operations count
- Apply operations count
- Destroy operations count
- Failed operations count
- Success rate (calculated)
- Failure rate (calculated)
- Operations by type distribution

### Infrastructure Metrics
- Resources managed (from state)
- Workspace count
- Protected workspaces list
- State backend type
- Last operation timestamp

### Health Metrics
- Overall health score (0-100)
- CLI version (OpenTofu/Terraform)
- CLI availability
- MCP server validity
- Security issue count
- Security warnings

### Security Metrics
- Issues count
- Warnings array
- Last security scan timestamp
- State file exposure status
- Credential leak detection
- Workspace protection status

## Usage Examples

### Run Health Check

```bash
/Users/ryandahlberg/Projects/cortex/scripts/monitoring/check-opentofu-health.sh
```

Output:
- Health score calculation
- CLI status
- Operation log analysis
- Security issue detection
- JSON report generation

### View Dashboard Metrics

```bash
curl http://localhost:3004/api/opentofu/metrics | jq
```

Returns comprehensive IaC metrics including operations, security, and infrastructure status.

### View Recent Operations

```bash
curl http://localhost:3004/api/opentofu/operations?limit=10 | jq
```

Returns last 10 operations from audit log.

### Check Security Status

```bash
curl http://localhost:3004/api/opentofu/security | jq
```

Returns security scan configuration and status.

## Files Created/Modified

### New Files
- `/Users/ryandahlberg/Projects/cortex/coordination/monitoring/opentofu-mcp-server.json` - Monitoring configuration
- `/Users/ryandahlberg/Projects/cortex/scripts/monitoring/check-opentofu-health.sh` - Health check script
- `/Users/ryandahlberg/Projects/cortex/coordination/tasks/opentofu-security-scan.json` - Security scan task
- `/Users/ryandahlberg/Projects/cortex/docs/integrations/opentofu-mcp-server-integration.md` - This document

### Modified Files
- `/Users/ryandahlberg/Projects/cortex/eui-dashboard/server/index.js` - Added 4 API endpoints
- `/Users/ryandahlberg/Projects/cortex/coordination/repository-inventory.json` - Added opentofu entry

### Directories Created
- `/Users/ryandahlberg/Projects/cortex/coordination/reports/opentofu-mcp-server/` - Health reports storage

## Configuration

### Environment Variables

**OpenTofu MCP Server**:
- `TOFU_CLI` - CLI command (`tofu` or `terraform`, default: `tofu`)
- `TOFU_PROTECTED_WORKSPACES` - Comma-separated protected workspaces (default: `production,prod,main`)
- `TOFU_OPERATION_LOG` - Audit log path (default: `tofu_operations.log`)

**Health Check Script**:
- `OPENTOFU_SERVER_PATH` - Path to MCP server (default: `/Users/ryandahlberg/Projects/opentofu-mcp-server`)
- `OPERATION_LOG` - Operation log path (default: `$OPENTOFU_SERVER_PATH/tofu_operations.log`)
- `HEALTH_CHECK_INTERVAL` - Check interval in seconds (default: `3600`)

## Recommendations

### Security Best Practices

1. **Never commit**:
   - State files (`*.tfstate`, `*.tfstate.*`)
   - Environment files (`.env`, `*.env.*`)
   - Terraform variables (`terraform.tfvars`, `*.auto.tfvars`)
   - Operation logs (`tofu_operations.log`)

2. **Use workspace protection** for all production environments

3. **Review audit logs** regularly for unexpected operations

4. **Limit auto-approve** usage to non-production environments

5. **Store credentials** in secure secret management systems (AWS Secrets Manager, HashiCorp Vault)

6. **Use backend encryption** for remote state storage

7. **Rotate credentials** regularly (monthly for production)

8. **Monitor health checks** and respond to degraded status immediately

### Operational Best Practices

1. **Run health checks** hourly to detect issues early

2. **Review security scans** daily and address critical issues immediately

3. **Monitor dashboard** for operation trends and anomalies

4. **Set up alerts** for:
   - Health score < 60
   - Failed operations spike
   - Security issues detected
   - Workspace protection breaches

5. **Maintain operation log** with proper permissions (600)

6. **Test disaster recovery** procedures regularly

7. **Document infrastructure** changes in version control

## Troubleshooting

### CLI Not Found

**Error**: `Neither 'tofu' nor 'terraform' CLI found in PATH`

**Solution**:
```bash
# Install OpenTofu (recommended)
brew install opentofu/tap/opentofu

# Or install Terraform
brew install terraform
```

### Permission Denied on Protected Workspace

**Error**: `Operation 'apply' is blocked on protected workspace 'production'`

**Solutions**:
1. Switch to non-protected workspace: `workspace_select(workspace_name="development")`
2. Update `TOFU_PROTECTED_WORKSPACES` environment variable
3. Use CLI manually if you have appropriate permissions

### Confirmation Token Mismatch

**Error**: `auto_approve requires confirmation_token matching current workspace name`

**Solution**: Set `confirmation_token` parameter to match current workspace:
```python
apply(working_dir="/path", auto_approve=True, confirmation_token="development")
```

### Health Score Low

**Diagnose**:
```bash
/Users/ryandahlberg/Projects/cortex/scripts/monitoring/check-opentofu-health.sh
```

Review output for:
- CLI availability issues
- MCP server syntax errors
- Security issues
- Failed operations

## Maintenance

### Daily Tasks
- Review security scan results
- Check health score trends
- Monitor operation failure rates

### Weekly Tasks
- Audit operation logs for anomalies
- Review workspace protection configuration
- Update dependencies if security patches available

### Monthly Tasks
- Rotate cloud provider credentials
- Review and update protected workspaces list
- Test disaster recovery procedures
- Update documentation

## Support

- **MCP Server Issues**: [GitHub Issues](https://github.com/ry-ops/opentofu-mcp-server/issues)
- **Cortex Integration Issues**: Create task for Development Master
- **Security Concerns**: Escalate to Security Master immediately

## Related Documentation

- [OpenTofu MCP Server README](https://github.com/ry-ops/opentofu-mcp-server/blob/main/README.md)
- [OpenTofu MCP Server Security Policy](https://github.com/ry-ops/opentofu-mcp-server/blob/main/SECURITY.md)
- [Cortex Monitoring Architecture](/Users/ryandahlberg/Projects/cortex/docs/monitoring-deployment-guide.md)
- [Cortex Security Best Practices](/Users/ryandahlberg/Projects/cortex/docs/security/SECURITY.md)

---

**Integration Status**: COMPLETE
**Last Updated**: 2025-12-13
**Maintained By**: Development Master
**Review Frequency**: Monthly
