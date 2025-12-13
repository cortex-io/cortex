# UniFi MCP Server - Cortex Integration

**Integration Date**: 2025-12-13
**Repository**: [ry-ops/unifi-mcp-server](https://github.com/ry-ops/unifi-mcp-server)
**Status**: Active
**Health Monitoring**: Enabled

## Overview

The UniFi MCP Server provides comprehensive UniFi network infrastructure management through the Model Context Protocol (MCP). This integration enables Cortex to autonomously monitor, manage, and optimize UniFi network infrastructure including network devices, Protect cameras, and Access door controls.

## Key Features

### Network Infrastructure Management
- **Real-time Device Monitoring**: Track health, uptime, and status of routers, switches, and access points
- **Client Activity Tracking**: Monitor bandwidth usage, connection quality, and client distribution
- **Network Performance**: Analyze device CPU, memory, temperature, and firmware versions
- **WLAN Management**: Enable/disable wireless networks with multi-API fallback

### UniFi Protect Integration
- **Camera Management**: Reboot cameras, control LEDs, toggle privacy mode
- **Recording Monitoring**: Track recording status and storage usage
- **Motion Detection**: Monitor motion detection events

### UniFi Access Integration
- **Door Control**: Timed door unlocks with automatic reversion
- **Lock Status**: Monitor lock status and battery levels
- **Access Events**: Track door access events

### A2A Protocol Support
- **9 Specialized Skills**: System health, device management, client monitoring, client blocking, WLAN management, Protect cameras, Access doors, host discovery, API troubleshooting
- **15+ Prompt Playbooks**: Guided workflows for complex operations
- **30+ MCP Tools**: Comprehensive network operation tools
- **Safety Model**: Confirmation workflows for destructive operations

## Architecture

### Multi-API Support
The server intelligently manages multiple UniFi APIs with automatic fallback:

1. **Integration API** (Local) - Primary for real-time network operations
2. **Legacy API** (Local) - Fallback for WLAN management and older features
3. **Site Manager API** (Cloud) - Infrastructure overview and remote monitoring
4. **Protect API** - Camera and security system integration
5. **Access API** - Door and access control management

### Authentication Methods
- **Local Controller API Key**: Integration API (primary)
- **Cloud Site Manager Token**: Cloud-based infrastructure access
- **Legacy Credentials**: Username/password for legacy API operations

## Cortex Integration Components

### 1. Monitoring Configuration
**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/monitoring/unifi-mcp-server.json`

**Health Checks Enabled**:
- UniFi controller connectivity (5-minute intervals)
- Dependency health (daily)
- Code quality (on commit)
- Security posture (daily)
- UniFi infrastructure health (15-minute intervals)
- A2A protocol compliance (on commit)

**Alert Thresholds**:
- Critical: API key exposure, all APIs down, door connectivity lost
- High: Controller unreachable, device offline spike, TLS verification disabled (production)
- Medium: Protect camera offline, device threshold breaches
- Low: Dependency updates, warnings

### 2. Health Check Script
**Location**: `/Users/ryandahlberg/Projects/cortex/scripts/monitoring/check-unifi-health.sh`

**Checks Performed**:
1. Monitoring configuration validation
2. Repository clone and update status
3. A2A protocol compliance (agent-card.json validation)
4. Python environment (version 3.12+, uv package manager)
5. Environment variables configuration (secrets.env)
6. Security posture (gitignore, SSRF protection)
7. Cortex integration status
8. Health summary generation

**Execution**:
```bash
./scripts/monitoring/check-unifi-health.sh
```

**Exit Codes**:
- `0`: Healthy
- `1`: Degraded (warnings present)
- `2`: Unhealthy (failed checks)

### 3. Security Scan Task
**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/tasks/unifi-mcp-security-scan.json`

**Scan Types**:
- Dependency vulnerabilities (pip-audit, safety)
- Secrets detection (gitleaks, trufflehog)
- Static analysis (bandit, semgrep)
- API key exposure
- SSRF validation
- TLS configuration
- Multi-API security

**UniFi-Specific Checks**:
- API key exposure and rotation
- SSRF protection validation
- Allowed hosts whitelist
- TLS verification settings
- Camera access controls
- Door unlock authorization
- Client blocking workflows
- WLAN toggle safety

**Compliance Requirements**:
- Data privacy (client MAC, IP, hostname)
- Physical security (door unlock capability)
- Video surveillance (camera privacy mode)
- Network security (client blocking)

### 4. Dashboard API Endpoints
**Location**: `/Users/ryandahlberg/Projects/cortex/eui-dashboard/server/index.js`

**Available Endpoints**:

#### `/api/unifi/health`
Returns UniFi MCP server health status
```json
{
  "status": "healthy",
  "failed_checks": 0,
  "warnings": 0,
  "last_check": "2025-12-13T08:20:00Z",
  "monitoring_enabled": true,
  "checks_completed": {}
}
```

#### `/api/unifi/infrastructure`
Returns UniFi network infrastructure statistics
```json
{
  "controller_status": "healthy",
  "total_devices": 15,
  "online_devices": 14,
  "offline_devices": 1,
  "device_types": {
    "routers": 1,
    "switches": 3,
    "access_points": 11
  },
  "total_clients": 42,
  "active_clients": 38,
  "bandwidth_usage": {
    "download_mbps": 150,
    "upload_mbps": 45
  }
}
```

#### `/api/unifi/metrics`
Returns monitoring metrics and events
```json
{
  "health_check_success_rate": 95,
  "controller_availability": 99,
  "total_health_checks": 288,
  "total_connectivity_checks": 1440,
  "recent_events": [],
  "a2a_protocol": {}
}
```

#### `/api/unifi/security`
Returns security scan status
```json
{
  "scan_status": "pending",
  "priority": "high",
  "focus_areas": [],
  "unifi_specific_checks": {},
  "compliance_requirements": {}
}
```

#### `/api/unifi/network-stats`
Returns aggregated network statistics
```json
{
  "network_health": {
    "overall_score": 95,
    "device_uptime_avg": 99.5
  },
  "device_summary": {
    "total": 15,
    "healthy": 14,
    "offline": 1
  },
  "api_health": {
    "integration_api": "healthy",
    "legacy_api": "healthy",
    "site_manager_api": "healthy"
  }
}
```

## Repository Inventory

The UniFi MCP server is tracked in the Cortex repository inventory with comprehensive metadata:

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/repository-inventory.json`

**Key Metadata**:
- Project type: `mcp-server`
- Tech stack: Python 3.12+, MCP, uv
- A2A protocol: 9 skills, 9 prompts, 30+ tools
- Health status: `active`
- Cortex integration: Enabled (2025-12-13)
- Local clone: `/Users/ryandahlberg/Projects/unifi-mcp-server`

## Security Considerations

### Critical Security Controls

1. **API Key Management**
   - UniFi controller API keys grant **full network access**
   - Cloud Site Manager tokens provide **cross-site infrastructure access**
   - **Rotate monthly** for production environments
   - Store in `secrets.env` (never commit to git)

2. **SSRF Protection**
   - Built-in SSRF protection with allowed hosts whitelist
   - Validates URLs before requests
   - Configured hosts: local controller, api.ui.com

3. **TLS Verification**
   - Configurable per environment
   - Disable for home lab (self-signed certs)
   - **Must enable for production**

4. **Confirmation Workflows**
   - Client blocking requires user confirmation
   - WLAN toggle requires confirmation
   - Camera reboots require confirmation
   - Door unlocks require confirmation and time limits

5. **Access Controls**
   - Door unlock capability affects physical security
   - Camera privacy mode affects surveillance compliance
   - Client blocking affects network access
   - Device control operations logged

### Secrets Management

**Required Environment Variables** (`secrets.env`):
```bash
# Local Controller Configuration
UNIFI_API_KEY=your_local_controller_api_key
UNIFI_GATEWAY_HOST=10.88.140.144
UNIFI_GATEWAY_PORT=443
UNIFI_VERIFY_TLS=false  # true for production

# Legacy API (optional, for WLANs)
UNIFI_USERNAME=your_unifi_username
UNIFI_PASSWORD=your_unifi_password

# Cloud Site Manager Configuration
UNIFI_SITEMGR_BASE=https://api.ui.com
UNIFI_SITEMGR_TOKEN=your_site_manager_api_key

# Optional Settings
UNIFI_TIMEOUT_S=15
```

**Security Checklist**:
- [ ] `secrets.env` in `.gitignore`
- [ ] File permissions set to `600` (user read/write only)
- [ ] API keys rotated monthly
- [ ] TLS verification enabled for production
- [ ] 2FA enabled on UniFi controller
- [ ] Legacy credentials use app-specific passwords
- [ ] Cloud API token has minimal required scope

## A2A Protocol Details

### Agent Card Location
`/Users/ryandahlberg/Projects/unifi-mcp-server/agent-card.json`

### Skills Overview

| Skill | Category | Safety Level | Tools |
|-------|----------|--------------|-------|
| System Health Monitoring | monitoring | read-only | unifi_health, get_system_status |
| Device Management | device_control | safe | get_device_health, locate_device |
| Client Monitoring | monitoring | read-only | get_client_activity, list_hosts |
| Client Blocking | access_control | requires_confirmation | block_client, unblock_client |
| WLAN Management | network_control | requires_confirmation | wlan_set_enabled_legacy |
| Protect Camera Management | security | requires_confirmation | protect_camera_reboot, protect_toggle_privacy |
| Access Door Control | access_control | requires_confirmation | access_unlock_door |
| Multi-Site Host Discovery | discovery | read-only | working_list_hosts_example |
| API Troubleshooting | diagnostics | read-only | debug_api_connectivity |

### Prompt Playbooks

1. `how_to_check_unifi_health` - Controller health verification
2. `how_to_check_system_status` - Comprehensive system overview
3. `how_to_monitor_devices` - Device health tracking
4. `how_to_check_network_activity` - Client activity analysis
5. `how_to_find_device` - Device search and LED locate
6. `how_to_block_client` - Safe client blocking workflow
7. `how_to_toggle_wlan` - WLAN enable/disable workflow
8. `how_to_list_hosts` - Multi-site host discovery
9. `how_to_debug_api_issues` - API troubleshooting

## Operational Procedures

### Daily Operations

1. **Health Check** (automated, 5-minute intervals)
   ```bash
   ./scripts/monitoring/check-unifi-health.sh
   ```

2. **Review Dashboard** (manual, as needed)
   - Check `/api/unifi/health` for system status
   - Review `/api/unifi/infrastructure` for network overview
   - Monitor `/api/unifi/metrics` for trends

3. **Security Scan** (automated, daily)
   - Task executes via security-master
   - Results in `coordination/security/reports/`

### Weekly Maintenance

1. **Repository Update**
   ```bash
   cd /Users/ryandahlberg/Projects/unifi-mcp-server
   git pull origin main
   ```

2. **Dependency Review**
   - Check for outdated packages
   - Review security advisories
   - Plan updates (manual approval required)

3. **Metrics Review**
   - Analyze network trends
   - Review device uptime
   - Check client activity patterns

### Monthly Tasks

1. **API Key Rotation** (production only)
   - Generate new UniFi controller API key
   - Generate new Site Manager token
   - Update `secrets.env`
   - Verify connectivity

2. **Security Audit**
   - Review access logs
   - Check for API key exposure
   - Validate SSRF protection
   - Verify TLS settings

3. **Performance Review**
   - Controller uptime analysis
   - Device health trends
   - Client satisfaction metrics

## Troubleshooting

### Common Issues

#### 1. Health Check Failures
```bash
# Check health summary
cat coordination/monitoring/unifi-health-summary.json | jq

# Review recent events
tail -50 coordination/dashboard-events.jsonl | jq 'select(.component == "unifi-mcp-server")'

# Manual health check
./scripts/monitoring/check-unifi-health.sh
```

#### 2. Controller Connectivity Issues
```bash
# Verify environment variables
cd /Users/ryandahlberg/Projects/unifi-mcp-server
grep "UNIFI_" secrets.env

# Test API connectivity (requires uv and MCP server)
cd /Users/ryandahlberg/Projects/unifi-mcp-server
uv run python -c "from main import debug_api_connectivity; print(debug_api_connectivity())"
```

#### 3. API Authentication Failures
- Verify API key is valid and not expired
- Check if 2FA is blocking API access (use app-specific password)
- Confirm Site Manager token hasn't been revoked
- Validate TLS settings match controller configuration

#### 4. Missing Devices or Sites
```bash
# Auto-discover site IDs
cd /Users/ryandahlberg/Projects/unifi-mcp-server
uv run python -c "from main import discover_sites; print(discover_sites())"

# List all hosts (local + cloud)
uv run python -c "from main import working_list_hosts_example; print(working_list_hosts_example())"
```

## Integration Testing

### Test Scenarios

1. **Health Check Validation**
   ```bash
   # Run health check and verify exit code
   ./scripts/monitoring/check-unifi-health.sh
   echo "Exit code: $?"
   ```

2. **Dashboard API Testing**
   ```bash
   # Test all UniFi endpoints
   curl http://localhost:3004/api/unifi/health
   curl http://localhost:3004/api/unifi/infrastructure
   curl http://localhost:3004/api/unifi/metrics
   curl http://localhost:3004/api/unifi/security
   curl http://localhost:3004/api/unifi/network-stats
   ```

3. **Security Scan Execution**
   ```bash
   # Trigger security scan via security-master
   # (requires security-master implementation)
   ```

4. **A2A Protocol Compliance**
   ```bash
   # Validate agent-card.json
   jq empty /Users/ryandahlberg/Projects/unifi-mcp-server/agent-card.json
   echo "Agent card is valid JSON"

   # Check skills count
   jq '.skills | length' /Users/ryandahlberg/Projects/unifi-mcp-server/agent-card.json
   ```

## Performance Metrics

### Target KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Controller Uptime | >99.5% | `/api/unifi/infrastructure` |
| Health Check Success Rate | >95% | `/api/unifi/metrics` |
| Device Availability | >98% | `/api/unifi/infrastructure` |
| API Response Time | <500ms | Monitoring logs |
| Security Scan Coverage | 100% | Security task config |

### Monitoring Intervals

- Controller connectivity: 5 minutes
- Device health: 15 minutes
- Client activity: 15 minutes
- Security scans: Daily
- Dependency checks: Daily
- Full system health: Hourly

## Future Enhancements

### Planned Features

1. **Real-time Event Streaming**
   - WebSocket support for live events
   - Motion detection alerts
   - Client connection/disconnection events

2. **Advanced Analytics**
   - Bandwidth trend analysis
   - Client behavior patterns
   - Device performance forecasting

3. **Automated Remediation**
   - Auto-reboot offline devices
   - Client bandwidth throttling
   - WLAN optimization suggestions

4. **Enhanced Protect Integration**
   - Video stream access
   - Motion detection zones
   - Recording schedule management

5. **Grafana Dashboard**
   - Network topology visualization
   - Real-time bandwidth graphs
   - Device health heatmaps

## References

- **Repository**: https://github.com/ry-ops/unifi-mcp-server
- **README**: https://github.com/ry-ops/unifi-mcp-server/blob/main/README.md
- **Playbook**: https://github.com/ry-ops/unifi-mcp-server/blob/main/NETWORK_PLAYBOOK.md
- **Troubleshooting**: https://github.com/ry-ops/unifi-mcp-server/blob/main/TROUBLESHOOTING.md
- **Agent Card**: https://github.com/ry-ops/unifi-mcp-server/blob/main/agent-card.json
- **MCP Documentation**: https://modelcontextprotocol.io/
- **A2A Protocol**: https://modelcontextprotocol.io/docs/a2a

## Support

For issues related to:
- **UniFi MCP Server**: https://github.com/ry-ops/unifi-mcp-server/issues
- **Cortex Integration**: Internal Cortex issue tracking
- **UniFi Hardware**: UniFi community forums
- **MCP Protocol**: MCP GitHub discussions

---

**Last Updated**: 2025-12-13
**Maintained By**: Cortex Development Master
**Integration Status**: Active and Monitored
