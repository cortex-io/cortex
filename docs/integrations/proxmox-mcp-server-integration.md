# Proxmox MCP Server - Cortex Integration Guide

Repository: ry-ops/proxmox-mcp-server
Integration Date: 2025-12-13
Status: Active Monitoring

## Overview

This document describes how the proxmox-mcp-server project is integrated with Cortex for automated security scanning, monitoring, and observability.

## Integration Architecture

```
┌──────────────────────────────────────┐
│   proxmox-mcp-server (GitHub)        │
│   - Python 3.10+ MCP Server          │
│   - Proxmox VE API Integration       │
│   - 20 infrastructure tools          │
│   - A2A protocol support             │
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
│  │  - API token exposure checks   │  │
│  │  - Docker security scanning    │  │
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
               │ (2) Manages Proxmox infrastructure
               ▼
┌──────────────────────────────────────┐
│      Proxmox VE Cluster              │
│   - VMs, Containers, Storage         │
│   - Multi-node cluster support       │
│   - API v8.x                         │
└──────────────────────────────────────┘
```

## What's Integrated

### 1. Repository Inventory ✅
- Location: coordination/repository-inventory.json
- Metadata: Full project description, tech stack, dependencies, features
- Status: Active, cataloged
- Features:
  - Project type: MCP Server
  - Language: Python 3.10+
  - Framework: MCP 1.0
  - Package manager: uv
  - Key dependencies tracked
  - 20 Proxmox management tools documented
  - A2A protocol support
  - Docker & Docker Compose

### 2. Security Scanning ✅
- Task File: coordination/integrations/proxmox-mcp-server/security/proxmox-security-scan.json
- Scan Types:
  - Dependency vulnerability scanning (pip-audit, safety)
  - Secrets detection (gitleaks, trufflehog)
  - Static code analysis (bandit)
  - API token exposure monitoring
  - SSL verification checks
  - Docker image security (trivy)
- Severity Threshold: Medium and above
- Reports: coordination/security/reports/proxmox-mcp-server-*
- Special Focus: Proxmox API token management, credential security, SSL verification

### 3. Health Monitoring ✅
- Script: coordination/integrations/proxmox-mcp-server/monitoring/proxmox-health-check.sh
- Checks:
  - Repository structure integrity
  - Dependency health (uv, Python version)
  - Security posture (gitignore, secrets)
  - Git repository health
  - Configuration files (agent-card.json, Docker files)
  - Cortex integration status
- Frequency: On-demand and scheduled daily
- Reports: coordination/reports/proxmox-mcp-server/

### 4. Observability & Monitoring ✅
- Config: coordination/monitoring/proxmox-mcp-server.json
- Features:
  - Daily dependency health checks
  - On-commit code quality analysis
  - Daily security posture scans
  - Hourly Proxmox API compatibility checks
  - Docker image vulnerability scans
  - Dashboard widget integration
  - Event tracking in observability pipeline
  - API token exposure alerts

### 5. Dashboard Widget ✅
- Config: coordination/integrations/proxmox-mcp-server/dashboard/proxmox-widget.json
- Displays:
  - Security score
  - Infrastructure risk level
  - Dependency health
  - Open issues count
  - API token security status
  - SSL verification status
  - Tool capabilities (20 tools)
- Charts:
  - Vulnerability trends
  - Dependency freshness
  - Security posture gauge
- Actions:
  - Run health check
  - Run security scan
  - View repository
  - Open local directory

### 6. Automation Policies ⚙️
- Dependency Updates: Manual review (patch/minor only)
- Security Fixes: Create PR for high+ severity (currently disabled)
- Documentation: Auto-update on API changes (enabled)
- Token Rotation: Monthly reminder (manual process)

## Proxmox MCP Server Capabilities

The server provides 20 tools across six categories:

### Node Management (2 tools)
1. list_nodes - List all cluster nodes
2. get_node_status - Get node resource usage and status

### Virtual Machine Management (12 tools)
3. list_vms - List VMs (node-specific or cluster-wide)
4. get_vm_config - Get VM configuration
5. get_vm_status - Get VM status and metrics
6. start_vm - Start a VM
7. stop_vm - Force stop a VM
8. shutdown_vm - Gracefully shutdown a VM
9. reboot_vm - Reboot a VM
10. create_vm_snapshot - Create VM snapshot
11. list_vm_snapshots - List VM snapshots
12. delete_vm_snapshot - Delete VM snapshot

### Container Management (4 tools)
13. list_containers - List LXC containers
14. get_container_status - Get container status
15. start_container - Start container
16. stop_container - Stop container

### Storage Management (2 tools)
17. list_storage - List storage devices
18. get_storage_status - Get storage usage and capacity

### Task Management (2 tools)
19. list_tasks - List running and recent tasks
20. get_task_status - Get task progress and status

### Cluster Management (1 tool)
21. get_cluster_status - Get overall cluster status and resources

## How to Trigger Actions

### Manual Health Check
```bash
# From cortex directory
./coordination/integrations/proxmox-mcp-server/monitoring/proxmox-health-check.sh
```

### Manual Security Scan
```bash
# From cortex directory
GOVERNANCE_BYPASS=true ./scripts/spawn-worker.sh \
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
cat coordination/integrations/proxmox-mcp-server/security/proxmox-security-scan.json

# View latest health check
ls -lt coordination/reports/proxmox-mcp-server/ | head -5
```

### Dashboard Integration
- URL: http://localhost:3000 (when Cortex dashboard running)
- Widget: "Proxmox MCP Server" health status
- Metrics: Security score, dependency health, infrastructure risk, tool count

## Security Considerations

### Proxmox API Token Management
The proxmox-mcp-server handles sensitive Proxmox API tokens that grant FULL infrastructure access:

- Storage: Tokens MUST be in environment variables only
- Never commit: API tokens should never be in version control
- Rotation: Monthly token rotation REQUIRED for production
- Access: Tokens grant complete Proxmox infrastructure control
  - Can create/delete VMs and containers
  - Can modify storage configurations
  - Can manage cluster nodes
  - Can access all node resources
- Monitoring: Cortex scans for exposed tokens daily

### Protected Files
Cortex monitors these files for secrets:
- .env
- *.env.*
- config/*.json
- *.pem
- *.key

### Critical Security Checks
1. API Token Exposure - CRITICAL - Immediate alert
2. Credential Leak - CRITICAL - Immediate alert
3. SSL Verification Disabled - HIGH - Within 1 hour
4. Proxmox API Breaking Changes - HIGH - Within 1 hour
5. Dependency Vulnerabilities - Varies by severity

### SSL Verification Monitoring
The server can be configured to disable SSL verification (verify=False):
- Production use: SSL verification MUST be enabled
- Self-signed certificates: Use proper CA certificates instead of disabling verification
- Cortex monitors: Scans for verify=False patterns in code
- Alert level: HIGH severity

## Infrastructure Impact

### Risk Level: HIGH
This server provides direct control over production infrastructure:

- VM Operations: Start, stop, reboot, snapshot VMs
- Container Operations: Manage LXC containers
- Storage Operations: Monitor and manage storage
- Cluster Operations: Multi-node cluster management
- Task Monitoring: Track infrastructure tasks

### Protection Measures
1. Credential Security: Token management and rotation
2. Code Security: Regular vulnerability scanning
3. Access Monitoring: API token exposure detection
4. Change Tracking: Monitor for breaking changes
5. Health Checks: Daily infrastructure health monitoring

## Alert Thresholds

### Alert Channels
1. Dashboard: Real-time widget showing health status
2. Events: All events logged to observability pipeline
3. Reports: Generated in coordination/reports/proxmox-mcp-server/

### Alert Types
- Security: API token exposure, secrets leaks, vulnerabilities
- Infrastructure: Proxmox API breaking changes, connectivity issues
- Quality: Code quality degradation, test failures
- Dependencies: Outdated packages, security advisories

### Alert Timing
- CRITICAL: Immediate notification (API tokens, secrets)
- HIGH: Within 1 hour (SSL disabled, breaking changes, high-severity CVEs)
- MEDIUM: Within 24 hours (dependency updates)
- LOW: Weekly summary (minor updates)

## Reports Generated

### Daily
- Dependency health summary
- Security posture check
- API token rotation reminder (monthly)
- Code quality metrics
- Docker image security scan

### Weekly
- Trend analysis
- Dependency update recommendations
- Proxmox compatibility check
- Security improvement suggestions

### Monthly
- Comprehensive audit report
- Compliance status
- Technical debt assessment
- API token rotation verification
- Infrastructure access audit

## Integration Files

All integration files are located in coordination/integrations/proxmox-mcp-server/:

```
coordination/integrations/proxmox-mcp-server/
├── monitoring/
│   └── proxmox-health-check.sh       # Health check script
├── security/
│   └── proxmox-security-scan.json    # Security scan configuration
└── dashboard/
    └── proxmox-widget.json           # Dashboard widget configuration
```

Additional files:
- coordination/monitoring/proxmox-mcp-server.json - Monitoring configuration
- docs/integrations/proxmox-mcp-server-integration.md - This document

## Agent-to-Agent (A2A) Protocol

### Overview
The proxmox-mcp-server implements the A2A protocol for autonomous agent communication.

### Agent Card
- Location: /agent-card.json (in repository root)
- Provides: Capability discovery, authentication methods, skill catalog
- Categories: 6 skill categories, 20 tools total

### Integration Benefits
- Self-documenting: Complete capability discovery
- Type-safe: Structured skill definitions
- Composable: Skills combine for complex workflows
- Secure: Clear authentication requirements

## Docker Support

### Docker Images
- Dockerfile: Available in repository root
- docker-compose.yaml: Orchestration configuration
- Security: Trivy scans for vulnerabilities

### Container Security
- Base image scanning
- Vulnerability detection
- Best practices verification
- Regular security updates

## Next Steps

### Recommended Enhancements

1. Enable Auto-Security Fixes (when ready)
   ```bash
   # Edit coordination/monitoring/proxmox-mcp-server.json
   # Set automation_policies.auto_security_fixes.enabled = true
   ```

2. Add GitHub Webhook
   - Configure webhook in proxmox-mcp-server repo settings
   - Point to Cortex webhook endpoint
   - Select events: push, pull_request, release, issues

3. Set Up CI/CD Integration
   - Add GitHub Actions workflow
   - Configure secrets in repo settings
   - Test with a test PR

4. Enable Dashboard Monitoring
   ```bash
   # Start Cortex dashboard
   cd /Users/ryandahlberg/Projects/cortex
   node eui-dashboard/server/index.js

   # Access at http://localhost:3000
   ```

5. Configure Proxmox Monitoring Alerts
   - Set up alert notifications
   - Configure escalation policies
   - Test alert delivery

## Troubleshooting

### Common Issues

Issue: Cannot connect to Proxmox instance
```bash
# Check Proxmox API token
echo $PROXMOX_TOKEN_VALUE

# Test Proxmox API directly
curl -k https://YOUR_PROXMOX_HOST:8006/api2/json/version
```

Issue: API token detected in code
```bash
# Remove from code immediately
# Rotate token in Proxmox instance
# Verify .env is gitignored
git ls-files --others --ignored --exclude-standard | grep .env
```

Issue: Security scan failing
```bash
# Check task status
cat coordination/integrations/proxmox-mcp-server/security/proxmox-security-scan.json

# View logs
tail -f coordination/logs/security-master.log
```

Issue: Health check errors
```bash
# Run health check manually
./coordination/integrations/proxmox-mcp-server/monitoring/proxmox-health-check.sh

# Check reports
ls -lt coordination/reports/proxmox-mcp-server/
```

### Permission Errors
The Proxmox user/token needs appropriate privileges:
- VM.Monitor - View VM status
- VM.Audit - Audit VM configuration
- VM.PowerMgmt - Start/stop VMs
- VM.Snapshot - Manage snapshots
- Datastore.Audit - View storage
- Sys.Audit - View system information

### Debug Mode
To see detailed logs:
1. Check stderr output when running the server
2. Review Claude Desktop logs for errors
3. Monitor Cortex dashboard events
4. Check health check reports

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
  --repo ry-ops/proxmox-mcp-server
```

### View Observability Events
```bash
# Check event stream
tail -f coordination/dashboard-events.jsonl | grep proxmox
```

### Rotate API Tokens
```bash
# 1. Generate new API token in Proxmox web interface
# 2. Update .env file (never commit!)
# 3. Test connection with test-connection.sh
# 4. Revoke old token in Proxmox
# 5. Document rotation in Cortex
```

### Run Health Check
```bash
# Execute health check
./coordination/integrations/proxmox-mcp-server/monitoring/proxmox-health-check.sh

# View results
cat coordination/reports/proxmox-mcp-server/health-check-*.json | jq .
```

## Architecture Benefits

✅ Separation of Concerns: proxmox-mcp-server remains independent
✅ Centralized Security: All repos scanned from one location
✅ Unified Observability: Single dashboard for all projects
✅ Automated Monitoring: Daily scans, no manual intervention
✅ Scalable: Easy to add more repos to Cortex portfolio
✅ Security First: API token exposure detection and monitoring
✅ Infrastructure Aware: Monitors Proxmox compatibility and breaking changes
✅ High Impact Protection: Special monitoring for infrastructure control

## Integration with Proxmox Ecosystem

### How Cortex + Proxmox Work Together

```
┌─────────────────────────────────────────────┐
│  Cortex monitors proxmox-mcp-server         │
│  ├─ Security scanning                       │
│  ├─ Dependency monitoring                   │
│  ├─ API compatibility checks                │
│  └─ Infrastructure risk assessment          │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│  proxmox-mcp-server provides control        │
│  ├─ Manage VMs and containers               │
│  ├─ Monitor infrastructure                  │
│  ├─ Execute infrastructure tasks            │
│  └─ Cluster management                      │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│  Proxmox VE manages infrastructure          │
│  ├─ Virtual machines                        │
│  ├─ LXC containers                          │
│  ├─ Storage pools                           │
│  └─ Cluster nodes                           │
└─────────────────────────────────────────────┘
```

### Example Automation Loop
1. Cortex detects vulnerability in proxmox-mcp-server
2. Cortex sends alert via dashboard and events
3. Security Master creates issue for remediation
4. Development Master fixes vulnerability
5. Cortex verifies fix in next scan
6. Infrastructure operations continue securely

## Support

For issues or questions about this integration:
1. Check Cortex logs: ./scripts/daemon-control.sh logs
2. View task status: cat coordination/integrations/proxmox-mcp-server/security/proxmox-security-scan.json
3. Run health check: ./coordination/integrations/proxmox-mcp-server/monitoring/proxmox-health-check.sh
4. Check dashboard: http://localhost:3000
5. Review proxmox-mcp-server docs: https://github.com/ry-ops/proxmox-mcp-server

## References

- [Cortex Master-Worker Architecture](../master-worker-architecture.md)
- [Security Master Documentation](../docs/security-master.md)
- [Observability Pipeline](../docs/observability-pipeline-weeks-7-8.md)
- [API Reference](../docs/API-REFERENCE.md)
- [Proxmox MCP Server Repository](https://github.com/ry-ops/proxmox-mcp-server)
- [Proxmox VE API Documentation](https://pve.proxmox.com/wiki/Proxmox_VE_API)
- [n8n Integration Example](./n8n-mcp-server-integration.md)

## Comparison: n8n vs Proxmox Integration

| Feature | n8n-mcp-server | proxmox-mcp-server |
|---------|----------------|-------------------|
| Infrastructure Impact | Low (automation) | High (VMs/containers) |
| Security Risk | Medium (API keys) | High (infrastructure control) |
| Token Permissions | n8n instance only | Full cluster access |
| Breaking Changes | n8n API changes | Proxmox API changes |
| Monitoring Focus | Workflow health | Infrastructure health |
| Alert Priority | Medium | High |
| Rotation Requirement | Monthly | Monthly (critical) |

Both integrations follow the same Cortex pattern but proxmox-mcp-server requires heightened security monitoring due to its direct infrastructure control capabilities.
