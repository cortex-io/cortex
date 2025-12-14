# Wazuh Agent Deployment Report

**Report Generated:** 2025-12-14T15:12:00Z
**Security Master Task ID:** wazuh-agent-deployment-20251214
**Master Session ID:** D3E7AA88-CB9B-44A8-A1DC-8BEE4B0FA048

---

## Executive Summary

The Security Master has prepared comprehensive deployment packages for Wazuh agent installation across 8 infrastructure VMs. Due to the absence of QEMU guest agent support and pre-configured SSH key authentication on the target VMs, deployment scripts have been generated for manual or semi-automated execution.

**Status:** Deployment Package Ready - Awaiting Execution
**Total Target VMs:** 8
**Deployment Methods Available:** 4
**Estimated Deployment Time:** 15-30 minutes (parallel execution)

---

## Infrastructure Overview

### Target Systems

| VLAN | VM Count | Purpose |
|------|----------|---------|
| VLAN 145 (10.88.145.0/24) | 3 | K3s Cluster |
| VLAN 150 (10.88.150.0/24) | 4 | Kali Sentinel Forge |
| VLAN 140 (10.88.140.0/24) | 1 | Infrastructure |
| **Total** | **8** | **All Systems** |

### Detailed VM Inventory

#### K3s Cluster (VLAN 145)
- **VM 310:** k3s-master-vm (10.88.145.180)
  - Role: Kubernetes master node
  - Agent Name: k3s-master-vm-vm310

- **VM 311:** k3s-worker-1-vm (10.88.145.181)
  - Role: Kubernetes worker node
  - Agent Name: k3s-worker-1-vm-vm311

- **VM 312:** k3s-worker-2-vm (10.88.145.182)
  - Role: Kubernetes worker node
  - Agent Name: k3s-worker-2-vm-vm312

#### Kali Sentinel Forge (VLAN 150)
- **VM 900:** red-kali-server (10.88.150.2)
  - Team: Red Team
  - Agent Name: red-kali-server-vm900

- **VM 901:** blue-kali-server (10.88.150.3)
  - Team: Blue Team
  - Agent Name: blue-kali-server-vm901

- **VM 902:** purple-kali-server (10.88.150.4)
  - Team: Purple Team
  - Agent Name: purple-kali-server-vm902

- **VM 903:** green-kali-server (10.88.150.5)
  - Team: Green Team
  - Agent Name: green-kali-server-vm903

#### Infrastructure Servers (VLAN 140)
- **VM 200:** claude-code-agent (10.88.140.200)
  - Purpose: AI Agent Infrastructure
  - Agent Name: claude-code-agent-vm200

---

## Wazuh Manager Configuration

- **Manager IP:** 10.88.145.181
- **Manager Port:** 31514 (TCP, K3s NodePort)
- **API Port:** 55000 (HTTPS)
- **Dashboard Port:** 31518 (HTTPS)
- **Agent Version:** 4.7.1
- **Protocol:** TCP with pre-shared key authentication

---

## Deployment Package Contents

### 1. Individual VM Installation Scripts

**Location:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/deployment-snippets/`

| Script | Target VM | Description |
|--------|-----------|-------------|
| install-wazuh-310.sh | k3s-master-vm | K3s master agent installer |
| install-wazuh-311.sh | k3s-worker-1-vm | K3s worker 1 agent installer |
| install-wazuh-312.sh | k3s-worker-2-vm | K3s worker 2 agent installer |
| install-wazuh-900.sh | red-kali-server | Red team agent installer |
| install-wazuh-901.sh | blue-kali-server | Blue team agent installer |
| install-wazuh-902.sh | purple-kali-server | Purple team agent installer |
| install-wazuh-903.sh | green-kali-server | Green team agent installer |
| install-wazuh-200.sh | claude-code-agent | Infrastructure agent installer |

Each script includes:
- Pre-configured manager IP and port
- VM-specific agent naming
- Automatic service registration
- Error handling and verification
- Self-contained execution (no external dependencies)

### 2. Deployment One-Liners

**Location:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/deployment-snippets/deploy-*-oneliner.txt`

Base64-encoded inline execution scripts for systems without external file transfer capabilities.

### 3. Universal Standalone Installer

**Location:** `/Users/ryandahlberg/Projects/cortex/scripts/security/wazuh-agent-standalone-installer.sh`

Generic installer that auto-detects system configuration and can be used on any Debian/Ubuntu VM.

### 4. Deployment Utilities

| Script | Purpose |
|--------|---------|
| deploy-wazuh-agent-ssh.sh | SSH-based single VM deployment |
| deploy-wazuh-all-vms-ssh.sh | Mass parallel SSH deployment |
| generate-deployment-snippets.sh | Regenerate deployment scripts |
| verify-wazuh-agents.sh | Verify agent registration |
| discover-proxmox-vms.sh | Discover all Proxmox VMs |

---

## Deployment Methods

### Method 1: SSH Deployment (Recommended - If SSH Configured)

**Prerequisites:**
- SSH key authentication configured to target VMs
- Root access via SSH

**Command:**
```bash
# Single VM deployment
ssh root@<VM_IP> 'bash -s' < install-wazuh-<VMID>.sh

# All VMs in parallel
/Users/ryandahlberg/Projects/cortex/scripts/security/deploy-wazuh-all-vms-ssh.sh
```

**Deployment Time:** ~5 minutes (parallel execution)

### Method 2: Manual Console Execution

**Prerequisites:**
- Proxmox console access to VMs
- Root/sudo credentials

**Steps:**
1. Access VM via Proxmox console or direct SSH
2. Copy content of `install-wazuh-<VMID>.sh` to VM
3. Execute: `bash /path/to/install-wazuh-<VMID>.sh`

**Deployment Time:** ~15-20 minutes (sequential execution)

### Method 3: HTTP Download Execution

**Prerequisites:**
- Web server hosting deployment scripts
- VM internet connectivity

**Command:**
```bash
curl -sSL https://<YOUR_SERVER>/install-wazuh-<VMID>.sh | bash
```

**Deployment Time:** ~5 minutes (parallel execution)

### Method 4: Base64 Inline

**Prerequisites:**
- Console/SSH access
- No external connectivity required

**Command:**
Use one-liner from `deploy-<VMID>-oneliner.txt`

**Deployment Time:** ~15-20 minutes (sequential execution)

---

## Deployment Workflow

### Phase 1: Pre-Deployment Validation

- [x] Wazuh Manager operational (10.88.145.181:31514)
- [x] All 8 target VMs discovered via Proxmox API
- [x] Deployment scripts generated and validated
- [x] Network connectivity verified
- [ ] SSH access configured (if using Method 1)

### Phase 2: K3s Cluster Deployment

Deploy to 3 K3s cluster VMs in parallel:
```bash
for vmid in 310 311 312; do
    ssh root@10.88.145.$((180 + vmid - 310)) 'bash -s' < \
        coordination/masters/security/deployment-snippets/install-wazuh-${vmid}.sh &
done
wait
```

**Expected Duration:** 5 minutes

### Phase 3: Kali Sentinel Forge Deployment

Deploy to 4 Kali VMs in parallel:
```bash
for config in "900:10.88.150.2" "901:10.88.150.3" "902:10.88.150.4" "903:10.88.150.5"; do
    IFS=':' read -r vmid ip <<< "$config"
    ssh root@${ip} 'bash -s' < \
        coordination/masters/security/deployment-snippets/install-wazuh-${vmid}.sh &
done
wait
```

**Expected Duration:** 5 minutes

### Phase 4: Infrastructure Server Deployment

Deploy to claude-code-agent:
```bash
ssh root@10.88.140.200 'bash -s' < \
    coordination/masters/security/deployment-snippets/install-wazuh-200.sh
```

**Expected Duration:** 2 minutes

### Phase 5: Verification

Run verification script:
```bash
/Users/ryandahlberg/Projects/cortex/coordination/masters/security/verify-wazuh-agents.sh
```

**Expected Results:**
- 8 agents registered
- All agents status: Active
- All agents connected to 10.88.145.181:31514

---

## Agent Configuration

Each agent is configured with:

### Security Settings
- **Authentication:** Pre-shared keys (auto-generated)
- **Encryption:** TLS for all communications
- **Protocol:** TCP
- **Reconnection:** Automatic (60s interval)

### Monitoring Capabilities
- **System Collector:** Enabled (1h interval)
  - Hardware inventory
  - Installed packages
  - Running processes
  - Network configuration

- **Security Configuration Assessment:** Enabled (12h interval)
  - CIS benchmarks
  - Security hardening checks
  - Compliance scanning

- **File Integrity Monitoring:** Enabled
  - System files
  - Configuration files
  - Application binaries

- **Log Collection:** Enabled
  - Syslog
  - Authentication logs
  - Kernel logs
  - Application logs

### Performance Settings
- **Event Buffer:** 5000 events
- **Events per Second:** 500
- **Auto-restart:** Enabled
- **Notify Time:** 10 seconds

---

## Verification Procedures

### 1. VM-Level Verification

On each deployed VM, verify:

```bash
# Service status
systemctl status wazuh-agent

# Expected output: active (running)

# Agent information
/var/ossec/bin/wazuh-control info

# Expected output: Agent ID, Name, Manager IP

# Connection status
tail -f /var/ossec/logs/ossec.log

# Expected output: "Connected to the server"
```

### 2. Manager-Level Verification

Query Wazuh Manager API:

```bash
# List all agents
curl -k -u admin:SecurePass -X GET \
    "https://10.88.145.181:55000/agents?pretty=true&limit=100"

# Expected: 8 agents with status "active"

# Check specific agent
curl -k -u admin:SecurePass -X GET \
    "https://10.88.145.181:55000/agents?name=k3s-master-vm-vm310"
```

### 3. Dashboard Verification

Access Wazuh Dashboard at https://10.88.145.181:31518

Verify:
- [ ] All 8 agents visible in "Agents" page
- [ ] All agents status: "Active"
- [ ] Security events being received
- [ ] System inventory populated
- [ ] No critical errors

---

## Expected Security Metrics Post-Deployment

Once all agents are deployed and active:

| Metric | Expected Value |
|--------|----------------|
| Total Agents | 8 |
| Active Agents | 8 |
| Disconnected Agents | 0 |
| Never Connected Agents | 0 |
| Security Events/Hour | 100-500 |
| File Integrity Alerts | Varies |
| Vulnerability Findings | TBD (initial scan) |
| Compliance Score | TBD (initial assessment) |

---

## Troubleshooting Guide

### Issue 1: Agent Not Connecting

**Symptoms:**
- Agent status: "Never connected"
- No events in dashboard

**Resolution:**
1. Verify network connectivity:
   ```bash
   telnet 10.88.145.181 31514
   ```
2. Check agent logs:
   ```bash
   tail -f /var/ossec/logs/ossec.log
   ```
3. Restart agent:
   ```bash
   systemctl restart wazuh-agent
   ```

### Issue 2: Installation Failure

**Symptoms:**
- Installation script exits with error
- Agent package not installed

**Resolution:**
1. Check internet connectivity for package download
2. Verify disk space: `df -h`
3. Check installation logs
4. Manually install:
   ```bash
   curl -so /tmp/wazuh-agent.deb \
       https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.1-1_amd64.deb
   dpkg -i /tmp/wazuh-agent.deb
   apt-get install -f -y
   ```

### Issue 3: Firewall Blocking

**Symptoms:**
- Connection timeout to manager
- Telnet to 31514 fails

**Resolution:**
1. Check iptables/ufw rules
2. Verify Wazuh Manager service:
   ```bash
   kubectl get svc -n wazuh wazuh-manager-service
   ```
3. Test from different VLAN
4. Check K3s firewall rules

---

## Post-Deployment Recommendations

### Immediate Actions (Within 24 Hours)

1. **Configure File Integrity Monitoring**
   - Add critical directories to monitoring
   - Set up real-time alerting for tampering

2. **Set Up Alert Rules**
   - Authentication failures (3+ attempts)
   - Privilege escalation events
   - Rootkit detection
   - Malware signatures

3. **Run Initial Scans**
   - Vulnerability assessment
   - Security compliance audit
   - System inventory baseline

### Short-Term Actions (Within 1 Week)

1. **Tune Alert Thresholds**
   - Reduce false positives
   - Adjust severity levels
   - Configure notification channels

2. **Configure Active Response**
   - Automatic IP blocking
   - Process termination
   - File quarantine

3. **Set Up Reporting**
   - Daily security summary
   - Weekly compliance report
   - Monthly vulnerability trends

### Long-Term Actions (Within 1 Month)

1. **Integrate with SIEM**
   - Export events to central logging
   - Correlate with other security tools

2. **Implement Automation**
   - Automated remediation workflows
   - Compliance drift detection
   - Patch management integration

3. **Security Hardening**
   - Apply CIS benchmark recommendations
   - Implement least privilege policies
   - Configure advanced threat detection

---

## Security Considerations

### Agent Security

- Agents run with minimal required privileges
- Pre-shared keys unique per agent
- All communications encrypted
- No inbound connections accepted

### Network Security

- Manager-agent communication via NodePort (31514)
- Consider adding firewall rules:
  ```bash
  # Allow only from managed VLANs
  iptables -A INPUT -p tcp --dport 31514 -s 10.88.145.0/24 -j ACCEPT
  iptables -A INPUT -p tcp --dport 31514 -s 10.88.150.0/24 -j ACCEPT
  iptables -A INPUT -p tcp --dport 31514 -s 10.88.140.0/24 -j ACCEPT
  iptables -A INPUT -p tcp --dport 31514 -j DROP
  ```

### Data Privacy

- Agent data includes system information
- Logs may contain sensitive data
- Consider data retention policies
- Implement log sanitization if needed

### Compliance

- Agents support compliance scanning for:
  - PCI-DSS
  - GDPR
  - HIPAA
  - NIST 800-53
  - CIS Benchmarks

---

## Rollback Procedure

If deployment needs to be rolled back:

```bash
# On each agent VM
systemctl stop wazuh-agent
systemctl disable wazuh-agent
apt-get remove --purge -y wazuh-agent
rm -rf /var/ossec
rm -f /tmp/wazuh-agent.deb
```

Rollback time: ~5 minutes per VM (~10 minutes parallel)

---

## Files and Artifacts

### Generated Files

```
/Users/ryandahlberg/Projects/cortex/
├── coordination/masters/security/
│   ├── deployment-snippets/
│   │   ├── install-wazuh-200.sh          # Claude Code Agent installer
│   │   ├── install-wazuh-310.sh          # K3s Master installer
│   │   ├── install-wazuh-311.sh          # K3s Worker 1 installer
│   │   ├── install-wazuh-312.sh          # K3s Worker 2 installer
│   │   ├── install-wazuh-900.sh          # Red Team installer
│   │   ├── install-wazuh-901.sh          # Blue Team installer
│   │   ├── install-wazuh-902.sh          # Purple Team installer
│   │   ├── install-wazuh-903.sh          # Green Team installer
│   │   ├── deploy-*-oneliner.txt         # Base64 inline scripts
│   │   └── DEPLOYMENT-CHECKLIST.md       # Deployment tracking
│   ├── reports/
│   │   └── wazuh-agent-deployment-report.md  # This report
│   ├── logs/                             # Deployment logs (when executed)
│   └── verify-wazuh-agents.sh            # Verification script
├── scripts/security/
│   ├── deploy-wazuh-agent-ssh.sh         # Single VM SSH deployment
│   ├── deploy-wazuh-all-vms-ssh.sh       # Mass SSH deployment
│   ├── wazuh-agent-standalone-installer.sh # Universal installer
│   ├── generate-deployment-snippets.sh   # Script generator
│   └── discover-proxmox-vms.sh           # VM discovery
└── docs/security/
    └── WAZUH-AGENT-DEPLOYMENT-GUIDE.md   # Comprehensive guide
```

### Documentation

- **Deployment Guide:** `/Users/ryandahlberg/Projects/cortex/docs/security/WAZUH-AGENT-DEPLOYMENT-GUIDE.md`
- **Deployment Checklist:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/deployment-snippets/DEPLOYMENT-CHECKLIST.md`
- **This Report:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/reports/wazuh-agent-deployment-report.md`

---

## Success Criteria

Deployment is considered successful when:

- [x] All 8 installation scripts generated
- [x] All deployment methods documented
- [x] Verification script created
- [x] Comprehensive documentation provided
- [ ] All 8 agents installed (pending execution)
- [ ] All 8 agents registered with manager (pending execution)
- [ ] All 8 agents status: Active (pending execution)
- [ ] Security events flowing to manager (pending execution)
- [ ] Dashboard reflects all agents (pending execution)
- [ ] No critical errors in logs (pending execution)

---

## Next Steps

1. **Execute Deployment**
   - Choose deployment method based on environment
   - Run installation on all 8 VMs
   - Monitor installation progress

2. **Run Verification**
   - Execute `verify-wazuh-agents.sh`
   - Confirm all agents active
   - Check dashboard for events

3. **Configure Monitoring**
   - Set up alert rules
   - Configure compliance policies
   - Enable vulnerability scanning

4. **Update Dashboard**
   - Security master will update cortex dashboard
   - Add security metrics
   - Configure security event widgets

5. **Hand Off to CI/CD Master**
   - Request dashboard deployment update
   - Trigger security metrics refresh
   - Update task status

---

## Conclusion

The Security Master has successfully prepared a comprehensive Wazuh agent deployment package for all 8 infrastructure VMs. The deployment is ready for execution using one of four available methods, with SSH-based parallel deployment being the recommended approach if SSH access is configured.

All necessary scripts, documentation, and verification tools have been created. The deployment package supports both automated and manual installation methods to accommodate various access restrictions and security policies.

**Recommendation:** Configure SSH key authentication to all target VMs to enable rapid parallel deployment via `deploy-wazuh-all-vms-ssh.sh`, reducing total deployment time from 15-20 minutes (sequential) to approximately 5 minutes (parallel).

---

**Report Prepared By:** Security Master
**Session ID:** D3E7AA88-CB9B-44A8-A1DC-8BEE4B0FA048
**Report Version:** 1.0
**Report Date:** 2025-12-14
**Next Review:** Post-deployment verification
