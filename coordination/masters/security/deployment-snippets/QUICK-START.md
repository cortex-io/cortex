# Wazuh Agent Deployment - Quick Start Guide

## TL;DR - Fast Deployment

### Option 1: Automated SSH Deployment (5 minutes)

```bash
# If SSH keys are configured:
cd /Users/ryandahlberg/Projects/cortex
./scripts/security/deploy-wazuh-all-vms-ssh.sh

# Verify:
./coordination/masters/security/verify-wazuh-agents.sh
```

### Option 2: Manual Deployment (15-20 minutes)

For each VM, access via Proxmox console:

**K3s Cluster:**
```bash
# VM 310 (k3s-master-vm - 10.88.145.180)
bash /path/to/install-wazuh-310.sh

# VM 311 (k3s-worker-1-vm - 10.88.145.181)
bash /path/to/install-wazuh-311.sh

# VM 312 (k3s-worker-2-vm - 10.88.145.182)
bash /path/to/install-wazuh-312.sh
```

**Kali Sentinel Forge:**
```bash
# VM 900 (red-kali-server - 10.88.150.2)
bash /path/to/install-wazuh-900.sh

# VM 901 (blue-kali-server - 10.88.150.3)
bash /path/to/install-wazuh-901.sh

# VM 902 (purple-kali-server - 10.88.150.4)
bash /path/to/install-wazuh-902.sh

# VM 903 (green-kali-server - 10.88.150.5)
bash /path/to/install-wazuh-903.sh
```

**Infrastructure:**
```bash
# VM 200 (claude-code-agent - 10.88.140.200)
bash /path/to/install-wazuh-200.sh
```

---

## One-Time SSH Setup (for automated deployment)

```bash
# Setup SSH keys to all VMs
for ip in 10.88.145.180 10.88.145.181 10.88.145.182 \
          10.88.150.2 10.88.150.3 10.88.150.4 10.88.150.5 \
          10.88.140.200; do
    ssh-copy-id root@${ip}
done
```

---

## Verification Commands

### On Agent VM:
```bash
systemctl status wazuh-agent
/var/ossec/bin/wazuh-control info
```

### On Manager:
```bash
curl -k -u admin:SecurePass \
    "https://10.88.145.181:55000/agents?pretty=true"
```

### Dashboard:
```
https://10.88.145.181:31518
```

---

## Files Location

**Installation Scripts:**
```
coordination/masters/security/deployment-snippets/install-wazuh-*.sh
```

**Deployment Tools:**
```
scripts/security/deploy-wazuh-all-vms-ssh.sh
coordination/masters/security/verify-wazuh-agents.sh
```

**Documentation:**
```
docs/security/WAZUH-AGENT-DEPLOYMENT-GUIDE.md
coordination/masters/security/reports/wazuh-agent-deployment-report.md
```

---

## Target Systems (8 VMs)

| VMID | Name | IP | Agent Name |
|------|------|----|-----------|
| 310 | k3s-master-vm | 10.88.145.180 | k3s-master-vm-vm310 |
| 311 | k3s-worker-1-vm | 10.88.145.181 | k3s-worker-1-vm-vm311 |
| 312 | k3s-worker-2-vm | 10.88.145.182 | k3s-worker-2-vm-vm312 |
| 900 | red-kali-server | 10.88.150.2 | red-kali-server-vm900 |
| 901 | blue-kali-server | 10.88.150.3 | blue-kali-server-vm901 |
| 902 | purple-kali-server | 10.88.150.4 | purple-kali-server-vm902 |
| 903 | green-kali-server | 10.88.150.5 | green-kali-server-vm903 |
| 200 | claude-code-agent | 10.88.140.200 | claude-code-agent-vm200 |

---

## Troubleshooting

**Agent won't connect:**
```bash
telnet 10.88.145.181 31514  # Test connectivity
systemctl restart wazuh-agent
tail -f /var/ossec/logs/ossec.log
```

**Installation fails:**
```bash
apt-get update
apt-get install -f -y
# Re-run installation script
```

---

## Support

Full documentation: `/Users/ryandahlberg/Projects/cortex/docs/security/WAZUH-AGENT-DEPLOYMENT-GUIDE.md`
