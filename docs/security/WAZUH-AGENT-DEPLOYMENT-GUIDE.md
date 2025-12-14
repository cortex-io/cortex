# Wazuh Agent Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying Wazuh agents to all infrastructure VMs for centralized security monitoring.

**Deployment Target:** 8 VMs across 3 VLANs
**Wazuh Manager:** 10.88.145.181:31514 (K3s NodePort Service)
**Agent Version:** 4.7.1

---

## Infrastructure Inventory

### K3s Cluster (VLAN 145: 10.88.145.0/24)

| VM ID | Hostname | IP Address | Role |
|-------|----------|------------|------|
| 310 | k3s-master-vm | 10.88.145.180 | K3s Master |
| 311 | k3s-worker-1-vm | 10.88.145.181 | K3s Worker 1 |
| 312 | k3s-worker-2-vm | 10.88.145.182 | K3s Worker 2 |

### Kali Sentinel Forge (VLAN 150: 10.88.150.0/24)

| VM ID | Hostname | IP Address | Team |
|-------|----------|------------|------|
| 900 | red-kali-server | 10.88.150.2 | Red Team |
| 901 | blue-kali-server | 10.88.150.3 | Blue Team |
| 902 | purple-kali-server | 10.88.150.4 | Purple Team |
| 903 | green-kali-server | 10.88.150.5 | Green Team |

### Infrastructure Servers (VLAN 140: 10.88.140.0/24)

| VM ID | Hostname | IP Address | Purpose |
|-------|----------|------------|---------|
| 200 | claude-code-agent | 10.88.140.200 | AI Agent Infrastructure |

---

## Deployment Methods

### Prerequisites

- Root/sudo access to target VMs
- Network connectivity to Wazuh Manager (10.88.145.181:31514)
- Debian/Ubuntu-based systems
- Internet access for package download

### Method 1: Automated Script Execution (Recommended)

Individual installation scripts have been generated for each VM in:
```
/Users/ryandahlberg/Projects/cortex/coordination/masters/security/deployment-snippets/
```

**Deploy to a single VM:**
```bash
# Via SSH (if key auth configured)
ssh root@<VM_IP> 'bash -s' < install-wazuh-<VMID>.sh

# Example for k3s-master (VM 310)
ssh root@10.88.145.180 'bash -s' < install-wazuh-310.sh
```

**Deploy to all VMs (if SSH configured):**
```bash
# K3s Cluster
for vmid in 310 311 312; do
    ssh root@10.88.145.$((180 + vmid - 310)) 'bash -s' < install-wazuh-${vmid}.sh &
done

# Kali Sentinel Forge
for vmid in 900 901 902 903; do
    ssh root@10.88.150.$((2 + vmid - 900)) 'bash -s' < install-wazuh-${vmid}.sh &
done

# Infrastructure
ssh root@10.88.140.200 'bash -s' < install-wazuh-200.sh &

wait
```

### Method 2: Manual Execution

1. Access VM via Proxmox console or SSH
2. Download the installation script:
   ```bash
   curl -o /tmp/install-wazuh.sh \
       https://<YOUR_SERVER>/install-wazuh-<VMID>.sh
   chmod +x /tmp/install-wazuh.sh
   ```

3. Execute as root:
   ```bash
   sudo /tmp/install-wazuh.sh
   ```

### Method 3: Standalone Installer

Use the universal standalone installer:
```bash
# On any target VM
curl -sSL https://<YOUR_SERVER>/wazuh-agent-standalone-installer.sh | \
    AGENT_NAME="custom-name" bash
```

Or download and execute:
```bash
wget https://raw.githubusercontent.com/<YOUR_REPO>/cortex/main/scripts/security/wazuh-agent-standalone-installer.sh
chmod +x wazuh-agent-standalone-installer.sh
sudo ./wazuh-agent-standalone-installer.sh
```

### Method 4: Base64 Inline Execution

For systems without external connectivity, use the base64-encoded inline execution method from:
```
deployment-snippets/deploy-<VMID>-oneliner.txt
```

---

## Deployment Workflow

### Phase 1: K3s Cluster Deployment

```bash
# Deploy to k3s-master-vm (VM 310)
ssh root@10.88.145.180 'bash -s' < \
    coordination/masters/security/deployment-snippets/install-wazuh-310.sh

# Deploy to k3s-worker-1-vm (VM 311)
ssh root@10.88.145.181 'bash -s' < \
    coordination/masters/security/deployment-snippets/install-wazuh-311.sh

# Deploy to k3s-worker-2-vm (VM 312)
ssh root@10.88.145.182 'bash -s' < \
    coordination/masters/security/deployment-snippets/install-wazuh-312.sh
```

### Phase 2: Kali Sentinel Forge Deployment

```bash
# Deploy to all Kali VMs in parallel
for config in "900:10.88.150.2" "901:10.88.150.3" "902:10.88.150.4" "903:10.88.150.5"; do
    IFS=':' read -r vmid ip <<< "$config"
    echo "Deploying to VM ${vmid} at ${ip}..."
    ssh root@${ip} 'bash -s' < \
        coordination/masters/security/deployment-snippets/install-wazuh-${vmid}.sh &
done
wait
```

### Phase 3: Infrastructure Servers

```bash
# Deploy to claude-code-agent (VM 200)
ssh root@10.88.140.200 'bash -s' < \
    coordination/masters/security/deployment-snippets/install-wazuh-200.sh
```

---

## Verification

### 1. Check Agent Status on VM

On each deployed VM:
```bash
# Check service status
sudo systemctl status wazuh-agent

# Check agent info
sudo /var/ossec/bin/wazuh-control info

# Check agent logs
sudo tail -f /var/ossec/logs/ossec.log
```

### 2. Verify Registration on Wazuh Manager

Use the verification script:
```bash
/Users/ryandahlberg/Projects/cortex/coordination/masters/security/verify-wazuh-agents.sh
```

Or manually query the Wazuh API:
```bash
# List all agents
curl -k -u admin:SecurePass -X GET \
    "https://10.88.145.181:55000/agents?pretty=true&limit=100" | jq

# Check specific agent
curl -k -u admin:SecurePass -X GET \
    "https://10.88.145.181:55000/agents?pretty=true&name=k3s-master-vm-vm310" | jq
```

### 3. Expected Agent Names

| VM ID | Expected Agent Name |
|-------|-------------------|
| 310 | k3s-master-vm-vm310 |
| 311 | k3s-worker-1-vm-vm311 |
| 312 | k3s-worker-2-vm-vm312 |
| 900 | red-kali-server-vm900 |
| 901 | blue-kali-server-vm901 |
| 902 | purple-kali-server-vm902 |
| 903 | green-kali-server-vm903 |
| 200 | claude-code-agent-vm200 |

---

## Troubleshooting

### Agent Not Connecting

1. **Check network connectivity:**
   ```bash
   telnet 10.88.145.181 31514
   nc -zv 10.88.145.181 31514
   ```

2. **Verify Wazuh Manager is listening:**
   ```bash
   kubectl get svc -n wazuh wazuh-manager-service
   kubectl get pods -n wazuh
   ```

3. **Check agent logs:**
   ```bash
   tail -f /var/ossec/logs/ossec.log
   ```

4. **Restart agent:**
   ```bash
   systemctl restart wazuh-agent
   ```

### Agent Registration Issues

1. **Remove and re-register:**
   ```bash
   # On agent
   systemctl stop wazuh-agent
   rm -f /var/ossec/etc/client.keys
   systemctl start wazuh-agent
   ```

2. **On manager (if direct access):**
   ```bash
   # Remove agent
   /var/ossec/bin/manage_agents -r <AGENT_ID>
   ```

### Firewall Issues

Ensure the following ports are open:
- TCP 31514: Agent enrollment and communication
- TCP 55000: Wazuh API (for verification)

---

## Post-Deployment Tasks

### 1. Configure Security Policies

Access Wazuh Dashboard and configure:
- File integrity monitoring (FIM) policies
- Vulnerability detection schedules
- Security compliance checks (SCA)
- Active response rules

### 2. Set Up Alerts

Configure alerting for:
- Critical security events (severity >= 10)
- Authentication failures
- Privilege escalation attempts
- Malware detection
- File tampering

### 3. Update Dashboard

The security master will automatically update the dashboard with:
- Agent deployment status
- Security metrics
- Active alerts
- Compliance status

### 4. Regular Maintenance

Schedule regular tasks:
- Weekly vulnerability scans
- Monthly compliance audits
- Quarterly security reviews
- Agent version updates

---

## Security Considerations

### Agent Authentication

Agents use pre-shared keys for authentication. Keys are:
- Automatically generated during registration
- Stored in `/var/ossec/etc/client.keys`
- Unique per agent
- Encrypted in transit

### Network Security

- All agent-manager communication is encrypted
- Agents connect to manager, not vice versa
- NodePort service (31514) exposed on K3s cluster
- Consider adding firewall rules to restrict access

### Least Privilege

Agents run with minimal required privileges:
- Read access to monitored files
- Execute access for active response
- No write access to system files (except logs)

---

## Rollback Procedure

If issues arise, remove agents:

```bash
# On each agent VM
systemctl stop wazuh-agent
systemctl disable wazuh-agent
apt-get remove -y wazuh-agent
rm -rf /var/ossec
```

---

## Files and Scripts

### Generated Scripts Location
```
/Users/ryandahlberg/Projects/cortex/coordination/masters/security/deployment-snippets/
├── install-wazuh-200.sh       # Claude Code Agent
├── install-wazuh-310.sh       # K3s Master
├── install-wazuh-311.sh       # K3s Worker 1
├── install-wazuh-312.sh       # K3s Worker 2
├── install-wazuh-900.sh       # Red Team Kali
├── install-wazuh-901.sh       # Blue Team Kali
├── install-wazuh-902.sh       # Purple Team Kali
├── install-wazuh-903.sh       # Green Team Kali
├── deploy-*-oneliner.txt      # Base64 inline execution
└── DEPLOYMENT-CHECKLIST.md    # Deployment tracking
```

### Utility Scripts
```
/Users/ryandahlberg/Projects/cortex/scripts/security/
├── deploy-wazuh-agent-ssh.sh           # SSH-based deployment
├── deploy-wazuh-all-vms-ssh.sh         # Mass SSH deployment
├── wazuh-agent-standalone-installer.sh # Universal installer
├── generate-deployment-snippets.sh     # Snippet generator
└── verify-wazuh-agents.sh              # Verification script
```

---

## Success Criteria

- ✅ All 8 VMs have Wazuh agents installed
- ✅ All agents are registered with Wazuh Manager
- ✅ All agents show "Active" status
- ✅ Security events are flowing to manager
- ✅ Dashboard reflects all registered agents
- ✅ No critical errors in agent logs

---

## Support and Escalation

For issues during deployment:

1. Check the deployment logs in:
   ```
   /Users/ryandahlberg/Projects/cortex/coordination/masters/security/logs/
   ```

2. Review individual VM logs:
   ```
   /var/ossec/logs/ossec.log
   ```

3. Contact Security Master team with:
   - VM ID and hostname
   - Deployment method used
   - Error messages from logs
   - Network connectivity test results

---

## Appendix: Configuration Details

### Wazuh Manager Configuration

- **Manager IP:** 10.88.145.181
- **Manager Port:** 31514 (TCP)
- **API Port:** 55000 (HTTPS)
- **Dashboard Port:** 31518 (HTTPS)
- **Protocol:** TCP
- **Authentication:** Pre-shared keys

### Agent Configuration

Each agent is configured with:
- Automatic reconnection (60s interval)
- Event buffer: 5000 events
- Events per second: 500
- System collector: Enabled (1h interval)
- Security configuration assessment: Enabled (12h interval)
- OpenSCAP: Disabled
- CIS-CAT: Disabled
- Vulnerability detection: Disabled (managed by manager)

### Monitored Data

Agents collect and send:
- System logs (syslog, auth, kernel)
- File integrity monitoring events
- Process and network data
- Security configuration compliance
- System inventory
- Custom application logs (if configured)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-14
**Maintained By:** Security Master
**Review Cycle:** Monthly
