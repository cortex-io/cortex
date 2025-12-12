# n8n MCP Server - Cortex Integration Guide

**Repository**: `ry-ops/n8n-mcp-server`
**Integration Date**: 2025-12-07
**Status**: Active Monitoring

## Overview

This document describes how the `n8n-mcp-server` project is integrated with Cortex for automated security scanning, monitoring, and observability.

## Integration Architecture

```
┌──────────────────────────────────────┐
│   n8n-mcp-server (GitHub)            │
│   - Python 3.10+ MCP Server          │
│   - n8n API Integration              │
│   - 13 workflow/execution tools      │
└─────────────┬────────────────────────┘
              │
              │ (1) Webhooks / API Calls
              │
              ▼
┌──────────────────────────────────────┐
│         Cortex (Local)               │
│  ┌────────────────────────────────┐  │
│  │  Repository Inventory          │  │
│  │  - Metadata tracking           │  │
│  │  - Health status               │  │
│  └────────────┬───────────────────┘  │
│               │                      │
│  ┌────────────▼───────────────────┐  │
│  │  Security Master               │  │
│  │  - CVE scanning                │  │
│  │  - Dependency audits           │  │
│  │  - Secrets detection           │  │
│  │  - API key exposure checks     │  │
│  └────────────┬───────────────────┘  │
│               │                      │
│  ┌────────────▼───────────────────┐  │
│  │  Observability Pipeline        │  │
│  │  - Event tracking              │  │
│  │  - Metrics collection          │  │
│  │  - Dashboard integration       │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
               │ (2) Manages n8n workflows
               ▼
┌──────────────────────────────────────┐
│         n8n Instance                 │
│   - Self-hosted automation platform  │
│   - Workflows, executions, creds     │
│   - API v1.0+                        │
└──────────────────────────────────────┘
```

## What's Integrated

### 1. Repository Inventory ✅
- **Location**: `coordination/repository-inventory.json`
- **Metadata**: Full project description, tech stack, dependencies, features
- **Status**: Active, cataloged
- **Features**:
  - Project type: MCP Server
  - Language: Python 3.10+
  - Framework: MCP 1.0
  - Package manager: uv
  - Key dependencies tracked
  - 13 n8n management tools documented

### 2. Security Scanning ✅
- **Task File**: `coordination/tasks/n8n-security-scan.json`
- **Scan Types**:
  - Dependency vulnerability scanning (pip-audit, safety)
  - Secrets detection (gitleaks, trufflehog)
  - Static code analysis (bandit)
  - API key exposure monitoring
- **Severity Threshold**: Medium and above
- **Reports**: `coordination/security/reports/n8n-mcp-server-*`
- **Special Focus**: API key management, credential security

### 3. Observability & Monitoring ✅
- **Config**: `coordination/monitoring/n8n-mcp-server.json`
- **Features**:
  - Daily dependency health checks
  - On-commit code quality analysis
  - Daily security posture scans
  - Hourly n8n API compatibility checks
  - Dashboard widget integration
  - Event tracking in observability pipeline
  - API key exposure alerts

### 4. Automation Policies ⚙️
- **Dependency Updates**: Manual review (patch/minor only)
- **Security Fixes**: Create PR for high+ severity (currently disabled)
- **Documentation**: Auto-update on API changes (enabled)
- **Key Rotation**: Monthly reminder (manual process)

## n8n MCP Server Capabilities

The server provides **13 tools** across three categories:

### Workflow Operations
1. **List Workflows** - Get all workflows with filtering
2. **Get Workflow** - Retrieve specific workflow details
3. **Create Workflow** - Create new workflows
4. **Update Workflow** - Modify existing workflows
5. **Delete Workflow** - Remove workflows
6. **Activate Workflow** - Enable workflow execution
7. **Deactivate Workflow** - Disable workflow execution
8. **Execute Workflow** - Trigger manual execution

### Execution Management
9. **List Executions** - View execution history with filters
10. **Get Execution** - Retrieve execution details
11. **Delete Execution** - Remove execution records

### Additional Operations
12. **List Credentials** - View available credentials
13. **Get Workflow Tags** - Manage workflow tags

## How to Trigger Actions

### Manual Security Scan
```bash
# From cortex directory
GOVERNANCE_BYPASS=true ./scripts/spawn-worker.sh \
  --type scan-worker \
  --task-id n8n-scan-$(date +%s) \
  --master security-master \
  --repo ry-ops/n8n-mcp-server \
  --priority high
```

### View Status
```bash
# Check inventory status
cat coordination/repository-inventory.json | jq '.repositories[] | select(.name == "ry-ops/n8n-mcp-server")'

# Check monitoring config
cat coordination/monitoring/n8n-mcp-server.json | jq '.monitoring_config'

# View security scan task
cat coordination/tasks/n8n-security-scan.json
```

### Dashboard Integration
- **URL**: http://localhost:3000 (when Cortex dashboard running)
- **Widget**: "n8n MCP Server" health status
- **Metrics**: Vulnerabilities, dependency health, code quality, API compatibility

## Security Considerations

### API Key Management
The n8n-mcp-server handles sensitive n8n API keys that grant **full instance access**:

- **Storage**: Keys MUST be in environment variables only
- **Never commit**: API keys should never be in version control
- **Rotation**: Monthly key rotation recommended
- **Access**: Keys grant complete n8n instance control
- **Monitoring**: Cortex scans for exposed keys daily

### Protected Files
Cortex monitors these files for secrets:
- `.env`
- `*.env.*`
- `config/*.json`

### Alert Thresholds
- **API Key Exposure**: CRITICAL - Immediate alert
- **Credential Leak**: CRITICAL - Immediate alert
- **n8n Breaking Changes**: HIGH - Within 1 hour
- **Dependency Vulnerabilities**: Varies by severity

## Optional: GitHub Actions Integration

To enable automatic Cortex scanning on push/PR, add this workflow to the n8n-mcp-server repo:

**File**: `.github/workflows/cortex-integration.yml`

```yaml
name: Cortex Integration

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Daily security scan at 2 AM
    - cron: '0 2 * * *'

jobs:
  notify-cortex:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Cortex of Event
        run: |
          curl -X POST ${{ secrets.CORTEX_WEBHOOK_URL }} \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.CORTEX_API_TOKEN }}" \
            -d '{
              "event": "${{ github.event_name }}",
              "repository": "${{ github.repository }}",
              "ref": "${{ github.ref }}",
              "sha": "${{ github.sha }}",
              "timestamp": "${{ github.event.head_commit.timestamp }}"
            }'

  security-scan-request:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Request Cortex Security Scan
        run: |
          curl -X POST ${{ secrets.CORTEX_API_URL }}/api/security/scan \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.CORTEX_API_TOKEN }}" \
            -d '{
              "repository": "${{ github.repository }}",
              "ref": "${{ github.head_ref }}",
              "scan_type": "pull_request_review",
              "focus": ["api_key_exposure", "secrets", "dependencies"]
            }'
```

**Required Secrets**:
- `CORTEX_WEBHOOK_URL`: Webhook endpoint (e.g., `http://your-cortex-instance:3000/api/webhooks/github`)
- `CORTEX_API_URL`: Cortex API base URL
- `CORTEX_API_TOKEN`: Authentication token for Cortex API

## Monitoring & Alerts

### Alert Channels
1. **Dashboard**: Real-time widget showing health status
2. **Events**: All events logged to observability pipeline
3. **Reports**: Generated in `coordination/reports/n8n-mcp-server/`

### Alert Types
- **Security**: API key exposure, secrets leaks, vulnerabilities
- **Compatibility**: n8n API breaking changes
- **Quality**: Code quality degradation, test failures
- **Dependencies**: Outdated packages, security advisories

### Alert Thresholds
- **Critical**: Immediate notification (API keys, secrets)
- **High**: Within 1 hour (breaking changes, high-severity CVEs)
- **Medium**: Within 24 hours (dependency updates)
- **Low**: Weekly summary (minor updates)

## Reports Generated

### Daily
- Dependency health summary
- Security posture check
- API key rotation reminder (monthly)
- Code quality metrics

### Weekly
- Trend analysis
- Dependency update recommendations
- n8n compatibility check
- Security improvement suggestions

### Monthly
- Comprehensive audit report
- Compliance status
- Technical debt assessment
- API key rotation verification

## Next Steps

### Recommended Enhancements

1. **Enable Auto-Security Fixes**
   ```bash
   # Edit coordination/monitoring/n8n-mcp-server.json
   # Set automation_policies.auto_security_fixes.enabled = true
   ```

2. **Add GitHub Webhook**
   - Configure webhook in n8n-mcp-server repo settings
   - Point to Cortex webhook endpoint
   - Select events: push, pull_request, release, issues

3. **Set Up CI/CD Integration**
   - Add GitHub Actions workflow (see above)
   - Configure secrets in repo settings
   - Test with a test PR

4. **Enable Dashboard Monitoring**
   ```bash
   # Start Cortex dashboard
   cd /Users/ryandahlberg/Projects/cortex
   node dashboard/server/index.js

   # Access at http://localhost:3000
   ```

5. **Configure n8n Webhook Integration**
   - Create n8n workflow to notify Cortex
   - Monitor workflow execution failures
   - Track n8n instance health

## n8n Integration Workflows

### Example: Auto-report Security Issues to n8n
Create an n8n workflow that:
1. Listens for Cortex security alerts (webhook)
2. Creates ticket in project management tool
3. Sends notification to team
4. Updates dashboard status

### Example: Monitor n8n Instance Health
Cortex can monitor n8n via the MCP server:
1. Query workflow execution rates
2. Track failed executions
3. Alert on credential expirations
4. Monitor API response times

## Maintenance

### Update Inventory
```bash
# Refresh repository metadata
./scripts/run-inventory-master.sh
```

### Run Security Scan
```bash
# Manual trigger
GOVERNANCE_BYPASS=true ./scripts/run-security-master.sh \
  --repo ry-ops/n8n-mcp-server
```

### View Observability Events
```bash
# Check event stream
tail -f coordination/dashboard-events.jsonl | grep n8n
```

### Rotate API Keys
```bash
# 1. Generate new n8n API key in n8n instance
# 2. Update .env file (never commit!)
# 3. Test connection
# 4. Revoke old key
# 5. Document rotation in Cortex
```

## Architecture Benefits

✅ **Separation of Concerns**: n8n-mcp-server remains independent
✅ **Centralized Security**: All repos scanned from one location
✅ **Unified Observability**: Single dashboard for all projects
✅ **Automated Monitoring**: Daily scans, no manual intervention
✅ **Scalable**: Easy to add more repos to Cortex portfolio
✅ **Security First**: API key exposure detection and monitoring
✅ **n8n Awareness**: Monitors n8n compatibility and breaking changes

## Integration with n8n Ecosystem

### How Cortex + n8n Work Together

```
┌─────────────────────────────────────────────┐
│  Cortex monitors n8n-mcp-server             │
│  ├─ Security scanning                       │
│  ├─ Dependency monitoring                   │
│  └─ API compatibility checks                │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│  n8n-mcp-server provides n8n control        │
│  ├─ Manage workflows                        │
│  ├─ Execute automations                     │
│  └─ Monitor executions                      │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│  n8n can automate Cortex operations         │
│  ├─ Trigger scans on schedule               │
│  ├─ Route alerts to teams                   │
│  ├─ Generate reports                        │
│  └─ Orchestrate remediation                 │
└─────────────────────────────────────────────┘
```

### Example Automation Loop
1. **Cortex** detects vulnerability in n8n-mcp-server
2. **Cortex** sends alert to **n8n** via webhook
3. **n8n workflow** creates JIRA ticket
4. **n8n workflow** notifies team in Slack
5. **n8n workflow** triggers remediation script
6. **Cortex** verifies fix in next scan

## Troubleshooting

### Common Issues

**Issue**: Cannot connect to n8n instance
```bash
# Check n8n API key
echo $N8N_API_KEY

# Test n8n API directly
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  https://your-n8n-instance.com/api/v1/workflows
```

**Issue**: API key detected in code
```bash
# Remove from code immediately
# Rotate key in n8n instance
# Verify .env is gitignored
git ls-files --others --ignored --exclude-standard | grep .env
```

**Issue**: Security scan failing
```bash
# Check task status
cat coordination/tasks/n8n-security-scan.json

# View logs
tail -f coordination/logs/security-master.log
```

## Support

For issues or questions about this integration:
1. Check Cortex logs: `./scripts/daemon-control.sh logs`
2. View task status: `cat coordination/tasks/n8n-security-scan.json`
3. Check dashboard: http://localhost:3000
4. Review n8n-mcp-server docs: https://github.com/ry-ops/n8n-mcp-server

## References

- [Cortex Master-Worker Architecture](../master-worker-architecture.md)
- [Security Master Documentation](../docs/security-master.md)
- [Observability Pipeline](../docs/observability-pipeline-weeks-7-8.md)
- [API Reference](../docs/API-REFERENCE.md)
- [n8n MCP Server Repository](https://github.com/ry-ops/n8n-mcp-server)
- [n8n API Documentation](https://docs.n8n.io/api/)
- [Proxmox Integration Example](./proxmox-mcp-server-integration.md)
