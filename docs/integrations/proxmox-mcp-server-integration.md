# Proxmox MCP Server - Cortex Integration Guide

**Repository**: `ry-ops/proxmox-mcp-server`
**Integration Date**: 2025-12-06
**Status**: Active Monitoring

## Overview

This document describes how the `proxmox-mcp-server` project is integrated with Cortex for automated security scanning, monitoring, and observability.

## Integration Architecture

```
┌──────────────────────────────────────┐
│   proxmox-mcp-server (GitHub)        │
│   - Python 3.10+ MCP Server          │
│   - Proxmox VE Integration           │
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
│  └────────────┬───────────────────┘  │
│               │                      │
│  ┌────────────▼───────────────────┐  │
│  │  Observability Pipeline        │  │
│  │  - Event tracking              │  │
│  │  - Metrics collection          │  │
│  │  - Dashboard integration       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## What's Integrated

### 1. Repository Inventory ✅
- **Location**: `coordination/repository-inventory.json`
- **Metadata**: Full project description, tech stack, dependencies
- **Status**: Active, cataloged
- **Features**:
  - Project type: MCP Server
  - Language: Python 3.10+
  - Framework: MCP 1.0
  - Package manager: uv
  - Key dependencies tracked

### 2. Security Scanning ✅
- **Task File**: `coordination/tasks/proxmox-security-scan.json`
- **Scan Types**:
  - Dependency vulnerability scanning (pip-audit, safety)
  - Secrets detection (gitleaks, trufflehog)
  - Static code analysis (bandit)
- **Severity Threshold**: Medium and above
- **Reports**: `coordination/security/reports/proxmox-mcp-server-*`

### 3. Observability & Monitoring ✅
- **Config**: `coordination/monitoring/proxmox-mcp-server.json`
- **Features**:
  - Daily dependency health checks
  - On-commit code quality analysis
  - Daily security posture scans
  - Dashboard widget integration
  - Event tracking in observability pipeline

### 4. Automation Policies ⚙️
- **Dependency Updates**: Manual review (patch/minor only)
- **Security Fixes**: Create PR for high+ severity (currently disabled)
- **Documentation**: Auto-update on API changes (enabled)

## How to Trigger Actions

### Manual Security Scan
```bash
# From cortex directory
./scripts/spawn-worker.sh \
  --type scan-worker \
  --task-id proxmox-scan-$(date +%s) \
  --master security-master \
  --repo ry-ops/proxmox-mcp-server \
  --priority high
```

### View Status
```bash
# Check inventory status
cat coordination/repository-inventory.json | jq '.repositories[] | select(.name == "ry-ops/proxmox-mcp-server")'

# Check monitoring config
cat coordination/monitoring/proxmox-mcp-server.json | jq '.monitoring_config'

# View security scan task
cat coordination/tasks/proxmox-security-scan.json
```

### Dashboard Integration
- **URL**: http://localhost:3000 (when Cortex dashboard running)
- **Widget**: "Proxmox MCP Server" health status
- **Metrics**: Vulnerabilities, dependency health, code quality

## Optional: GitHub Actions Integration

To enable automatic Cortex scanning on push/PR, add this workflow to the proxmox-mcp-server repo:

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
          # Webhook to Cortex (requires Cortex webhook endpoint)
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
          # Trigger Cortex security scan via API
          curl -X POST ${{ secrets.CORTEX_API_URL }}/api/security/scan \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.CORTEX_API_TOKEN }}" \
            -d '{
              "repository": "${{ github.repository }}",
              "ref": "${{ github.head_ref }}",
              "scan_type": "pull_request_review"
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
3. **Reports**: Generated in `coordination/reports/proxmox-mcp-server/`

### Alert Thresholds
- **Critical**: Immediate notification
- **High**: Within 1 hour
- **Medium**: Within 24 hours
- **Low**: Weekly summary

## Reports Generated

### Daily
- Dependency health summary
- Security posture check
- Code quality metrics

### Weekly
- Trend analysis
- Dependency update recommendations
- Security improvement suggestions

### Monthly
- Comprehensive audit report
- Compliance status
- Technical debt assessment

## Next Steps

### Recommended Enhancements

1. **Enable Auto-Security Fixes**
   ```bash
   # Edit coordination/monitoring/proxmox-mcp-server.json
   # Set automation_policies.auto_security_fixes.enabled = true
   ```

2. **Add GitHub Webhook**
   - Configure webhook in proxmox-mcp-server repo settings
   - Point to Cortex webhook endpoint
   - Select events: push, pull_request, release

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

## Maintenance

### Update Inventory
```bash
# Refresh repository metadata
./scripts/run-inventory-master.sh
```

### Run Security Scan
```bash
# Manual trigger
cat coordination/tasks/proxmox-security-scan.json | \
  ./scripts/run-security-master.sh
```

### View Observability Events
```bash
# Check event stream
tail -f coordination/dashboard-events.jsonl | grep proxmox
```

## Architecture Benefits

✅ **Separation of Concerns**: proxmox-mcp-server remains independent
✅ **Centralized Security**: All repos scanned from one location
✅ **Unified Observability**: Single dashboard for all projects
✅ **Automated Monitoring**: Daily scans, no manual intervention
✅ **Scalable**: Easy to add more repos to Cortex portfolio

## Support

For issues or questions about this integration:
1. Check Cortex logs: `./scripts/daemon-control.sh logs`
2. View task status: `cat coordination/tasks/proxmox-security-scan.json`
3. Check dashboard: http://localhost:3000

## References

- [Cortex Master-Worker Architecture](../master-worker-architecture.md)
- [Security Master Documentation](../docs/security-master.md)
- [Observability Pipeline](../docs/observability-pipeline-weeks-7-8.md)
- [API Reference](../docs/API-REFERENCE.md)
