# Wazuh MCP Server

MCP (Model Context Protocol) server for Cortex integration with Wazuh SIEM.

## Overview

The Wazuh MCP Server enables Cortex to:
- **Monitor security events** across your entire Proxmox infrastructure
- **Manage Wazuh agents** on all VMs and containers
- **Query alerts and vulnerabilities** in real-time
- **Coordinate security responses** automatically
- **Analyze threat intelligence** with AI

## Architecture

```
┌─────────────────┐
│  Cortex AI      │
│  (Claude Code)  │
└────────┬────────┘
         │ MCP Protocol
         ↓
┌─────────────────┐
│ Wazuh MCP Server│
│  (Node.js)      │
└────────┬────────┘
         │ Wazuh REST API
         ↓
┌─────────────────┐
│ Wazuh Manager   │
│  10.88.140.202  │
└────────┬────────┘
         │
    ┌────┴─────┬─────────┬─────────┐
    ↓          ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ VM 310 │ │ VM 900 │ │ VM 901 │ │  ...   │
│ K3s    │ │  Red   │ │  Blue  │ │  All   │
│ Master │ │ Team   │ │ Team   │ │  VMs   │
└────────┘ └────────┘ └────────┘ └────────┘
```

## Installation

### 1. Install Dependencies

```bash
cd /Users/ryandahlberg/Projects/cortex/lib/mcp-servers
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Wazuh Configuration
WAZUH_API_URL=https://10.88.140.202
WAZUH_API_USER=wazuh-api
WAZUH_API_PASSWORD=your-wazuh-api-password

# Optional: Custom port
# WAZUH_API_PORT=55000
```

### 3. Add to Claude Desktop Config

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wazuh": {
      "command": "node",
      "args": [
        "/Users/ryandahlberg/Projects/cortex/lib/mcp-servers/wazuh-server.js"
      ],
      "env": {
        "WAZUH_API_URL": "https://10.88.140.202",
        "WAZUH_API_USER": "wazuh-api",
        "WAZUH_API_PASSWORD": "your-password-here"
      }
    }
  }
}
```

## Available Tools

### Agent Management

**`get_agents`**
- List all Wazuh agents across Proxmox infrastructure
- Filter by status: active, disconnected, never_connected, pending
- Returns: agent ID, name, IP, OS, version, connection status

**`get_agent_details`**
- Get detailed information about specific agent
- Includes: configuration, system info, last keep-alive

**`get_agent_stats`**
- Get statistics and metrics for all agents
- Total agents, active/inactive counts, OS distribution

**`restart_agent`**
- Remotely restart a Wazuh agent
- Useful for applying configuration changes

### Security Monitoring

**`get_alerts`**
- Query security alerts with filters
- Filter by: agent, severity level, time range, keywords
- Returns: rule ID, description, severity, affected agent

**`get_vulnerabilities`**
- Get vulnerability scan results
- Filter by: agent, severity (Critical/High/Medium/Low)
- Shows: CVE IDs, affected packages, remediation

**`get_sca_results`**
- Security Configuration Assessment results
- Compliance checking (CIS, PCI-DSS, etc.)
- Shows: passed/failed checks, compliance score

### Threat Intelligence

**`analyze_security_events`**
- AI-powered analysis of recent security events
- Severity distribution
- Top triggered rules
- Affected agents
- Threat summary

**`search_rules`**
- Search Wazuh detection rules
- Filter by: keyword, rule ID, severity level
- Useful for understanding what Wazuh detects

### Sentinel Forge Integration

**`get_sentinel_forge_status`**
- Status of all Sentinel Forge Kali VMs
- Shows: red/blue/purple/green team agents
- Connection status and last activity

## Resources

**`wazuh://agents`**
- List of all Wazuh agents (entire Proxmox stack)

**`wazuh://alerts/recent`**
- Recent security alerts from all infrastructure

**`wazuh://sentinel-forge`**
- Sentinel Forge Kali VMs status specifically

## Usage Examples

### Monitor All Proxmox Infrastructure

```
Ask Claude: "Show me all Wazuh agents across my Proxmox infrastructure"

Claude will use: get_agents tool
Returns: All VMs and containers being monitored
```

### Check for Security Threats

```
Ask Claude: "Are there any critical security alerts in the last 24 hours?"

Claude will use: get_alerts with high severity filter
Returns: Critical alerts that need attention
```

### Analyze Sentinel Forge Exercise

```
Ask Claude: "How are the Sentinel Forge red and blue team VMs doing?"

Claude will use: get_sentinel_forge_status
Returns: Status of VMs 900-903
```

### Find Vulnerabilities

```
Ask Claude: "What critical vulnerabilities exist on my K3s VMs?"

Claude will use: get_vulnerabilities filtered by severity
Returns: CVEs affecting VMs 310-312
```

### Security Posture Analysis

```
Ask Claude: "Analyze the security posture of my infrastructure"

Claude will use:
- get_agents (inventory)
- get_alerts (recent threats)
- get_vulnerabilities (weaknesses)
- analyze_security_events (AI analysis)

Returns: Comprehensive security assessment
```

## Integration with Cortex

### Security Master Integration

The Security Master can use Wazuh MCP to:
- Monitor all VMs for security events
- Detect CVE vulnerabilities
- Track compliance status
- Automate remediation workflows

### Sentinel Forge Integration

For red/blue team exercises:
- Monitor attack patterns from red team (VM 900)
- Track blue team detection (VM 901)
- Coordinate purple team analysis (VM 902)
- Monitor honeypot activity (VM 903)

### Automated Workflows

Example automated security workflow:

```javascript
// In Cortex Security Master
1. Use get_alerts to detect high-severity event
2. Use get_agent_details to understand affected system
3. Use get_vulnerabilities to check for related CVEs
4. Use analyze_security_events for threat intelligence
5. Trigger remediation via Proxmox MCP (patch, isolate, etc.)
6. Document incident in Wazuh
```

## API Endpoints Used

The MCP server uses Wazuh REST API v4:

- `GET /agents` - List agents
- `GET /agents/{agent_id}` - Agent details
- `GET /security/alerts` - Query alerts
- `GET /vulnerability` - Vulnerability data
- `GET /sca/{agent_id}` - SCA results
- `GET /rules` - Detection rules
- `PUT /agents/{agent_id}/restart` - Restart agent
- `POST /security/user/authenticate` - Authentication

## Security Considerations

**API Credentials:**
- Store in environment variables, never in code
- Use dedicated API user with minimal permissions
- Rotate credentials regularly

**Network Security:**
- MCP server connects to Wazuh via HTTPS
- Certificate verification disabled for self-signed certs (configurable)
- Runs locally, no external exposure

**Access Control:**
- Only Cortex can use MCP server (local stdio)
- Wazuh API enforces role-based access
- All actions logged in Wazuh audit trail

## Troubleshooting

### Connection Issues

```bash
# Test Wazuh API manually
curl -u wazuh-api:password -k \
  https://10.88.140.202/security/user/authenticate

# Should return JWT token
```

### Agent Not Showing

```bash
# Check agent status on VM
sudo systemctl status wazuh-agent

# Check connectivity to manager
sudo tail -f /var/ossec/logs/ossec.log
```

### MCP Server Not Starting

```bash
# Check Node.js version (needs >=18)
node --version

# Test directly
cd lib/mcp-servers
node wazuh-server.js

# Should output: "Wazuh MCP Server running on stdio"
```

## Performance

**Caching:**
- Authentication token cached for session
- No persistent caching (always real-time data)

**Rate Limiting:**
- Respects Wazuh API rate limits
- Automatic retry with exponential backoff (planned)

**Scalability:**
- Handles 1000+ agents
- Efficient filtering server-side
- Pagination for large result sets

## Future Enhancements

**Planned Features:**
- [ ] Real-time event streaming (WebSocket)
- [ ] Custom rule deployment
- [ ] Agent configuration management
- [ ] Automated remediation actions
- [ ] Integration with TheHive (case management)
- [ ] MISP threat intelligence feeds
- [ ] Grafana dashboard generation
- [ ] Slack/Discord notifications

## Related Documentation

- [Wazuh API Documentation](https://documentation.wazuh.com/current/user-manual/api/index.html)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Sentinel Forge Deployment Guide](/Users/ryandahlberg/Projects/cortex/SENTINEL-FORGE-K3S-DEPLOYMENT.md)
- [Cortex Security Master](/Users/ryandahlberg/Projects/cortex/coordination/masters/security/)

---

**Status:** Ready for Testing
**Version:** 1.0.0
**Last Updated:** 2025-12-13
**Maintained By:** Cortex AI Team
