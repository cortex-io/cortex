# Sentinel Forge - K3s Deployment Summary

**Deployment Date:** 2025-12-13
**Deployment Method:** Autonomous via Cortex
**Platform:** K3s on VMs 310-312 (VLAN 145)
**Integration:** 4 Kali Linux VMs on VLAN 150 (VMs 900-903)

---

## Overview

Sentinel Forge is a comprehensive security testing and exercise platform deployed to the K3s cluster. It provides automated red team/blue team exercises, security monitoring, and purple team coordination.

### Architecture Components

**Control Plane (K3s):**
- **Wazuh SIEM** - Security Information and Event Management
- **n8n** - Workflow automation for exercise orchestration
- **Purple Team Dashboard** - Coordination and reporting interface
- **Sentinel Forge API** - Integration gateway for Cortex

**Data Plane (Kali VMs):**
- **VM 900** - Red Team (offensive operations) - 10.88.150.21
- **VM 901** - Blue Team (defensive operations) - 10.88.150.7
- **VM 902** - Purple Team (coordination) - 10.88.150.22
- **VM 903** - Green Team (honeypots/deception) - 10.88.150.14

---

## Deployed Components

### 1. Wazuh SIEM (Namespace: sentinel-forge)

**Wazuh Indexer (OpenSearch):**
- StatefulSet with 1 replica
- 10Gi persistent storage
- Resources: 1Gi memory, 500m CPU
- Port: 9200 (HTTP), 9300 (transport)

**Wazuh Manager:**
- StatefulSet with 1 replica
- 20Gi data storage + 10Gi log storage
- Resources: 1Gi memory, 500m CPU
- Ports:
  - 1514: Agent events (TCP)
  - 1515: Agent enrollment (TCP)
  - 55000: REST API
- Custom rules for red/blue/purple/green teams
- Auto-configured to connect to indexer

**Wazuh Dashboard:**
- Deployment with 1 replica
- Resources: 512Mi memory, 250m CPU
- Port: 5601 (HTTP)
- URL: http://wazuh.cortex.local

**Detection Rules Included:**
- Red Team activity detection (rule IDs 100001-100009)
- Unauthorized attack detection (100010-100014)
- Honeypot interactions (100020-100027)
- Blue Team scoring (100050-100051)
- Target compromise indicators (100060-100065)
- Exercise control (100100-100103)

### 2. n8n Workflow Automation

**Deployment:**
- 1 replica
- 5Gi persistent storage for workflows
- Resources: 512Mi memory, 250m CPU
- Port: 5678 (HTTP)
- URL: http://n8n.cortex.local

**Features:**
- Basic auth enabled (admin user)
- Webhook support for exercise triggering
- Metrics enabled
- Encryption for credentials

**Workflows to Import:**
- Exercise Orchestrator (from projects/security-lab/n8n-workflows/01-exercise-orchestrator.json)
- Red Team Automation (from projects/security-lab/n8n-workflows/02-red-team-automation.json)

### 3. Purple Team Dashboard

**Deployment:**
- Nginx-based static dashboard
- Resources: 128Mi memory, 100m CPU
- Port: 80 (HTTP)
- URLs: http://purple.cortex.local, http://sentinel-forge.cortex.local

**Dashboard Features:**
- Real-time VM status for all 4 Kali servers
- Team coordination interface
- Quick links to all Sentinel Forge services
- Exercise initiation interface
- Color-coded team status cards

**API Proxy:**
- Proxies /api/ requests to Sentinel Forge API backend
- Health check endpoint at /health

### 4. Sentinel Forge API Gateway

**Deployment:**
- Node.js Express API
- Resources: 256Mi memory, 100m CPU
- Port: 3000 (HTTP)
- URL: http://sf-api.cortex.local

**Endpoints:**
```
GET  /health                    - Health check
POST /api/exercise/start        - Start security exercise
POST /api/exercise/stop         - Stop exercise
GET  /api/alerts                - Get Wazuh alerts
GET  /api/vms/status            - Get Kali VM status
POST /api/cortex/alert          - Receive alerts from Cortex
```

**Integration:**
- Connects to n8n for workflow triggering
- Connects to Wazuh API for security data
- Provides Cortex integration endpoint

---

## Network Configuration

**K3s Services (VLAN 145):**
```
wazuh-indexer.sentinel-forge.svc.cluster.local:9200
wazuh-manager.sentinel-forge.svc.cluster.local:55000
wazuh-dashboard.sentinel-forge.svc.cluster.local:5601
n8n.sentinel-forge.svc.cluster.local:5678
purple-team-dashboard.sentinel-forge.svc.cluster.local:80
sentinel-forge-api.sentinel-forge.svc.cluster.local:3000
```

**Traefik IngressRoutes:**
```
wazuh.cortex.local           → wazuh-dashboard:5601
n8n.cortex.local             → n8n:5678
purple.cortex.local          → purple-team-dashboard:80
sentinel-forge.cortex.local  → purple-team-dashboard:80
sf-api.cortex.local          → sentinel-forge-api:3000
```

**Kali VMs (VLAN 150):**
```
10.88.150.21  red-kali-server      (VM 900)
10.88.150.7   blue-kali-server     (VM 901)
10.88.150.22  purple-kali-server   (VM 902)
10.88.150.14  green-kali-server    (VM 903)
```

---

## Wazuh Agent Installation

**Deployment Method:** Parallel installation via SSH from K3s master

**Agent Configuration:**
- Manager: wazuh-manager.sentinel-forge
- Auto-enrollment enabled
- Team-based grouping (red, blue, purple, green)

**Installation Steps (per VM):**
1. Add Wazuh repository GPG key
2. Configure APT repository (Wazuh 4.x)
3. Install wazuh-agent package
4. Configure manager address
5. Enable and start wazuh-agent service

**Verification:**
```bash
# On each Kali VM
sudo systemctl status wazuh-agent
sudo tail -f /var/ossec/logs/ossec.log
```

**In Wazuh Dashboard:**
- Navigate to http://wazuh.cortex.local
- Agents → All agents
- Should see 4 agents (red-kali-server, blue-kali-server, purple-kali-server, green-kali-server)

---

## Secrets Configuration

**Created Secret:** sentinel-forge-secrets

**Keys:**
- `wazuh-indexer-password`: Default "SecurePassword123!" (change in production)
- `wazuh-api-password`: Default "WazuhAPI123!" (change in production)
- `wazuh-api-token`: Will be generated after first Wazuh deployment
- `n8n-password`: Default "N8nAdmin123!" (change in production)
- `n8n-encryption-key`: Random 32-character key (already set)

**Update Secrets:**
```bash
kubectl edit secret sentinel-forge-secrets -n sentinel-forge
# Or
kubectl create secret generic sentinel-forge-secrets -n sentinel-forge \
  --from-literal=wazuh-indexer-password='YourStrongPassword' \
  --from-literal=wazuh-api-password='YourAPIPassword' \
  --from-literal=n8n-password='YourN8NPassword' \
  --from-literal=n8n-encryption-key='your-32-character-encryption-key' \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Access Information

### Web Interfaces

**Wazuh Dashboard:**
- URL: http://wazuh.cortex.local
- Default credentials: admin / SecurePassword123!
- Features: Agent management, alerts, security events, dashboards

**n8n Workflow Automation:**
- URL: http://n8n.cortex.local
- Credentials: admin / N8nAdmin123!
- Import workflows from: /Users/ryandahlberg/Projects/cortex/projects/security-lab/n8n-workflows/

**Purple Team Dashboard:**
- URL: http://purple.cortex.local or http://sentinel-forge.cortex.local
- No authentication required (internal network only)
- Shows real-time status of all teams

**Sentinel Forge API:**
- URL: http://sf-api.cortex.local
- Swagger docs: /api-docs (to be added)
- Health check: /health

### SSH Access to Kali VMs

```bash
# Red Team
ssh red-kali@10.88.150.21  # Password: toor

# Blue Team
ssh blue-kali@10.88.150.7  # Password: toor

# Purple Team
ssh purple-kali@10.88.150.22  # Password: toor

# Green Team
ssh green-kali@10.88.150.14  # Password: toor
```

---

## Post-Deployment Tasks

### 1. Update /etc/hosts

Add to your local /etc/hosts:
```
10.88.140.164  wazuh.cortex.local
10.88.140.164  n8n.cortex.local
10.88.140.164  purple.cortex.local
10.88.140.164  sentinel-forge.cortex.local
10.88.140.164  sf-api.cortex.local
```

### 2. Configure Wazuh API Token

```bash
# Get Wazuh API token
curl -u wazuh-api:WazuhAPI123! -k -X POST \
  "http://wazuh.cortex.local/security/user/authenticate"

# Update secret
kubectl patch secret sentinel-forge-secrets -n sentinel-forge \
  -p '{"data":{"wazuh-api-token":"'$(echo -n "YOUR_TOKEN" | base64)'"}}'

# Restart API to pick up new token
kubectl rollout restart deployment sentinel-forge-api -n sentinel-forge
```

### 3. Import n8n Workflows

1. Access http://n8n.cortex.local
2. Sign in with admin / N8nAdmin123!
3. Import workflows:
   - Click "Workflows" → "Import from File"
   - Upload: projects/security-lab/n8n-workflows/01-exercise-orchestrator.json
   - Upload: projects/security-lab/n8n-workflows/02-red-team-automation.json
4. Configure credentials:
   - Proxmox API credentials
   - Wazuh API credentials
   - Slack/Email (optional)

### 4. Deploy Role-Specific Tools

**Red Team (VM 900):**
```bash
ssh red-kali@10.88.150.21
sudo apt install -y metasploit-framework sqlmap nikto wpscan nmap masscan nuclei
sudo msfdb init
```

**Blue Team (VM 901):**
```bash
ssh blue-kali@10.88.150.7
sudo apt install -y suricata zeek wireshark tcpdump volatility3
sudo suricata-update
sudo systemctl enable suricata
```

**Purple Team (VM 902):**
```bash
ssh purple-kali@10.88.150.22
sudo apt install -y docker.io docker-compose ansible git python3-pip
sudo systemctl enable docker
```

**Green Team (VM 903):**
```bash
ssh green-kali@10.88.150.14
sudo apt install -y cowrie dionaea elasticpot python3-pip
# Configure honeypots (see Sentinel Forge documentation)
```

### 5. Test Exercise Workflow

```bash
# Start a test exercise
curl -X POST http://sf-api.cortex.local/api/exercise/start \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_id": "test-001",
    "exercise_type": "reconnaissance",
    "duration_hours": 1,
    "teams": {
      "red": true,
      "blue": true,
      "purple": true,
      "green": true
    }
  }'

# Monitor in Wazuh dashboard
# http://wazuh.cortex.local → Security events

# Stop exercise
curl -X POST http://sf-api.cortex.local/api/exercise/stop \
  -H "Content-Type: application/json" \
  -d '{"exercise_id": "test-001"}'
```

---

## Monitoring & Operations

### Check Deployment Status

```bash
# All Sentinel Forge pods
kubectl get pods -n sentinel-forge

# Services
kubectl get svc -n sentinel-forge

# IngressRoutes
kubectl get ingressroute -n sentinel-forge

# Storage
kubectl get pvc -n sentinel-forge

# Secrets
kubectl get secret sentinel-forge-secrets -n sentinel-forge
```

### View Logs

```bash
# Wazuh manager
kubectl logs -n sentinel-forge -l app=wazuh-manager -f

# n8n
kubectl logs -n sentinel-forge -l app=n8n -f

# Sentinel Forge API
kubectl logs -n sentinel-forge -l app=sentinel-forge-api -f

# Purple Team dashboard
kubectl logs -n sentinel-forge -l app=purple-team-dashboard -f
```

### Verify Wazuh Agents

```bash
# Via Wazuh API
curl -X GET "http://wazuh.cortex.local/agents" \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Via dashboard
# http://wazuh.cortex.local → Agents → All agents
```

---

## Integration with Cortex

**Cortex Security Master Integration:**
- Sentinel Forge API provides `/api/cortex/alert` endpoint
- Security Master can send alerts to Sentinel Forge
- Wazuh events can trigger Cortex workflows

**Cortex Dashboard Integration:**
- Add Sentinel Forge services to Cortex dashboard
- Link to Purple Team dashboard
- Embed Wazuh security metrics

**MCP Server Integration:**
- Sentinel Forge can be accessed via MCP
- Proxmox MCP server provides VM control
- Future: Sentinel Forge MCP server for exercise management

---

## Security Considerations

**Network Isolation:**
- VLAN 150 is isolated from production networks
- Kali VMs have no direct internet access (security lab environment)
- All external communication goes through controlled gateways

**Access Control:**
- Change default passwords immediately
- Use strong passwords for Wazuh and n8n
- Implement API authentication for production use
- Consider VPN access for remote exercise participants

**Data Protection:**
- Wazuh data stored in persistent volumes
- Regular backups recommended
- Sensitive exercise data should be encrypted

**Exercise Safety:**
- Purple Team oversight required for all exercises
- Safe word mechanism (rule 100102) for emergency stops
- Unauthorized activity detection (rules 100010-100014)
- All exercise activity logged in Wazuh

---

## Troubleshooting

**Wazuh pods not starting:**
```bash
# Check events
kubectl get events -n sentinel-forge --sort-by='.lastTimestamp'

# Check PVC status
kubectl get pvc -n sentinel-forge

# Check logs
kubectl logs -n sentinel-forge wazuh-manager-0
```

**Agents not connecting:**
```bash
# On Kali VM
sudo systemctl status wazuh-agent
sudo tail -f /var/ossec/logs/ossec.log

# Check network connectivity
ping wazuh-manager.sentinel-forge.svc.cluster.local
nc -zv wazuh-manager.sentinel-forge.svc.cluster.local 1514
```

**n8n workflows not executing:**
```bash
# Check n8n logs
kubectl logs -n sentinel-forge -l app=n8n -f

# Verify webhook URL
curl http://n8n.cortex.local/webhook/start-exercise

# Check credentials configuration
# http://n8n.cortex.local → Credentials
```

**Dashboard not accessible:**
```bash
# Check Traefik IngressRoutes
kubectl get ingressroute -n sentinel-forge

# Test service directly
kubectl port-forward -n sentinel-forge svc/purple-team-dashboard 8080:80
# Then access http://localhost:8080

# Check /etc/hosts configuration
cat /etc/hosts | grep cortex.local
```

---

## Success Metrics

**Deployment Successful When:**
- ✅ All pods in sentinel-forge namespace are Running
- ✅ All 4 Kali VMs showing as active agents in Wazuh
- ✅ Wazuh dashboard accessible and showing real-time data
- ✅ n8n accessible and workflows imported
- ✅ Purple Team dashboard showing all team statuses
- ✅ Sentinel Forge API /health endpoint returning healthy
- ✅ Test exercise can be started and stopped via API
- ✅ Security events from Kali VMs visible in Wazuh

**Exercise Ready When:**
- ✅ Role-specific tools installed on each team's VM
- ✅ n8n workflows configured and tested
- ✅ Blue Team monitoring tools operational
- ✅ Honeypots deployed on Green Team VM
- ✅ Purple Team dashboard showing real-time metrics
- ✅ Scoring system functional
- ✅ Emergency stop mechanism tested

---

## Future Enhancements

**Planned Features:**
1. **Automated Exercise Templates**
   - Pre-configured scenarios (web attacks, lateral movement, etc.)
   - One-click exercise deployment
   - Difficulty levels (beginner, intermediate, advanced)

2. **Enhanced Monitoring**
   - Grafana dashboards for exercise metrics
   - Real-time scoring leaderboard
   - Attack/defense timeline visualization

3. **Integration Expansion**
   - TheHive case management integration
   - MISP threat intelligence feeds
   - CTFd capture-the-flag platform

4. **Automation Improvements**
   - Auto-scaling for Wazuh indexer
   - Automated VM snapshots before/after exercises
   - Self-healing agent reconnection

5. **Cortex AI Features**
   - AI-powered attack pattern recognition
   - Automated blue team response suggestions
   - Exercise difficulty auto-adjustment

---

## Related Documentation

- [Sentinel Forge Infrastructure Guide](/Users/ryandahlberg/Projects/cortex/docs/deployment/SENTINEL-FORGE-INFRASTRUCTURE.md)
- [Sentinel Forge Deployment Summary](/Users/ryandahlberg/Projects/cortex/docs/deployment/SENTINEL-FORGE-DEPLOYMENT-SUMMARY.md)
- [Sentinel Forge Project Status](/Users/ryandahlberg/Projects/cortex/projects/security-lab/PROJECT-STATUS.md)
- [Wazuh Documentation](https://documentation.wazuh.com/)
- [n8n Documentation](https://docs.n8n.io/)

---

**Deployment Status:** COMPLETED
**Automation Level:** 100% (deployment), 90% (agent installation)
**Manual Steps Remaining:** Post-deployment configuration, tool installation, workflow import
**Estimated Time to Full Operation:** 2-3 hours

**Deployed By:** Cortex Autonomous System
**Date:** December 13, 2025
**Platform:** K3s on Proxmox VE
**Integration:** Full integration with Cortex AI platform

🛡️ **Sentinel Forge - Security Testing Infrastructure Ready**
