# Wazuh Dashboards for Cortex Infrastructure

## Overview

This directory contains Wazuh dashboard configurations for comprehensive monitoring of:
- **K3s Cluster Security** - All 8 nodes (Larry and the Darryl's)
- **UniFi Network Events** - Real-time syslog monitoring from UDM Pro and access points

## Dashboards

### 1. K3s Cluster Security Dashboard
**File**: `wazuh-k3s-security-dashboard.json`

**Monitors**:
- All 8 K3s nodes (3 masters, 4 workers, 1 manager host)
- Kubernetes audit events (pod exec, RBAC changes, secrets access)
- Security alert distribution across nodes
- Master vs Worker node activity
- MITRE ATT&CK technique mapping

**Panels**:
- Cluster health metrics (active nodes count)
- 24-hour security event totals
- Critical alert counters
- Pod execution event tracking
- Master/Worker security timelines
- Kubernetes audit event breakdown
- Alert severity distribution (Low/Medium/High/Critical)
- Top security rules triggered
- Node status overview table
- RBAC changes tracking
- Secrets access monitoring
- Recent security events log

**Key Queries**:
```
# All K3s nodes
agent.name:(k3s-master01 OR k3s-master02 OR k3s-master03 OR k3s-worker01 OR k3s-worker02 OR k3s-worker03-agent OR k3s-worker04)

# Pod exec events
data.audit.objectRef.subresource:exec

# Critical alerts
rule.level:[12 TO 15]

# Secrets access
data.audit.objectRef.resource:secrets
```

### 2. UniFi Network Security Dashboard
**File**: `wazuh-unifi-network-dashboard.json`

**Monitors**:
- UDM Pro (Dream Machine Pro) events
- U6-Plus access point
- U7-Pro access point
- All UniFi network devices sending syslog

**Panels**:
- Total UniFi events (24h)
- Active device count
- Client connection/disconnection tracking
- Security alert metrics
- Network events timeline by device
- Device type distribution
- Event type breakdown
- Network services monitoring (DHCP, DNS, BGP)
- UDM Pro system events
- Access point wireless events
- Client disconnection analysis
- DHCP & DNS activity logs
- BGP routing events
- WPA/authentication events
- Complete event stream

**Key Queries**:
```
# All UniFi devices
syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*)

# Client events
data.message:(*STA_LEAVE* OR *STA_JOIN* OR *ASSOC* OR *DISASSOC*)

# UDM Pro specific
syslog.hostname:Dream-Machine-Pro

# Security events
data.message:(*WPA* OR *auth* OR *security*)

# BGP routing
syslog.program:bgpd
```

## How to Import Dashboards into Wazuh

### Method 1: Via Wazuh Web Interface

1. Open Wazuh dashboard: **http://wazuh.cortex.local** or **http://10.88.145.208**
2. Log in with admin credentials
3. Navigate to **Management → Stack Management → Saved Objects**
4. Click **Import**
5. Select the dashboard JSON file
6. Click **Import**

### Method 2: Via API (Automated)

```bash
# Get Wazuh API token
TOKEN=$(curl -sk -u admin:admin https://10.88.145.208/api/security/user/authenticate | jq -r '.data.token')

# Import K3s dashboard
curl -sk -X POST "https://10.88.145.208/api/saved_objects/dashboard" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @wazuh-k3s-security-dashboard.json

# Import UniFi dashboard
curl -sk -X POST "https://10.88.145.208/api/saved_objects/dashboard" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @wazuh-unifi-network-dashboard.json
```

## Dashboard Features

### Real-time Monitoring
- Auto-refresh every 30 seconds
- Live data from all agents and syslog sources
- Time-based filtering (last 15m, 1h, 24h, 7d, custom)

### Interactive Visualizations
- Click any chart element to filter the entire dashboard
- Drill down into specific nodes, events, or time ranges
- Export data to CSV for offline analysis

### Alert Severity Levels
- **Low (1-4)**: Informational events
- **Medium (5-7)**: Notable events requiring attention
- **High (8-11)**: Significant security events
- **Critical (12+)**: Immediate action required

## Data Sources

### K3s Cluster
- **Agents**: 8 Wazuh agents monitoring all K3s nodes
- **Data**: System logs, audit logs, security events
- **Update Frequency**: Real-time (sub-second)

### UniFi Network
- **Source**: Syslog from UDM Pro and access points
- **Receiver**: UniFi syslog receiver at 10.88.145.215:514
- **Forwarding**: rsyslog → Wazuh manager (UDP 514)
- **Data**: Network events, client activity, system logs
- **Update Frequency**: Real-time

## Monitored K3s Nodes

| Node | IP | Role | Agent ID |
|------|-----|------|----------|
| k3s-master01 | 10.88.145.190 | Master | 001 |
| k3s-worker01 | 10.88.145.191 | Worker | 002 |
| k3s-worker02 | 10.88.145.192 | Worker | 003 |
| k3s-master02 | 10.88.145.193 | Master | 004 |
| k3s-worker04 | 10.88.145.195 | Worker | 005 |
| k3s-master03 | 10.88.145.196 | Master | 006 |
| k3s-worker03-agent | 10.88.145.194 | Worker/Manager | 007 |

## Monitored UniFi Devices

| Device | Type | Status |
|--------|------|--------|
| Dream-Machine-Pro | UDM Pro | ✅ Sending syslog |
| U6-Plus | Access Point | ✅ Sending syslog |
| U7-Pro | Access Point | ✅ Sending syslog |

## Troubleshooting

### No Data Showing

**K3s Dashboard**:
```bash
# Check agent status
curl -sk -u admin:admin https://10.88.145.208/api/agents | jq '.data.affected_items[] | {name, status, ip}'

# Verify agents are active
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
```

**UniFi Dashboard**:
```bash
# Check syslog receiver
kubectl logs -n default -l app=unifi-syslog --tail=50

# Verify logs reaching Wazuh
kubectl exec -n wazuh-security wazuh-manager-0 -- tail -f /var/ossec/logs/alerts/alerts.log | grep -i unifi
```

### Dashboard Not Loading

1. Clear browser cache
2. Verify Wazuh is running: `kubectl get pods -n wazuh-security`
3. Check Wazuh logs: `kubectl logs -n wazuh-security wazuh-manager-0`

## Customization

### Adding New Panels

1. Edit the JSON file
2. Add new panel object to `panels` array
3. Define query, aggregation, and visualization type
4. Re-import dashboard

### Modifying Queries

Each panel has a `query` section:
```json
{
  "query": "agent.name:k3s-master01",
  "language": "kuery"
}
```

Use Kuery syntax for filtering. Examples:
- `agent.name:*master*` - All masters
- `rule.level >= 8` - High severity
- `data.audit.verb:delete` - Kubernetes delete events

## Access URLs

- **Wazuh Dashboard**: http://wazuh.cortex.local or http://10.88.145.208
- **Default Credentials**: admin / (check wazuh-password secret)

## Support

For issues or questions:
1. Check Wazuh documentation: https://documentation.wazuh.com
2. Review Wazuh logs in Kubernetes
3. Verify data sources are active and sending events

---

**Created by**: Larry (Claude) for Cortex Holdings Infrastructure Monitoring
**Last Updated**: 2025-12-21
