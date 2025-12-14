# Wazuh Agent Deployment Package

This directory contains ready-to-deploy Wazuh agent installation scripts for all infrastructure VMs.

## Quick Navigation

- **[QUICK-START.md](QUICK-START.md)** - Fast deployment guide (start here!)
- **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** - Track deployment progress
- **install-wazuh-\*.sh** - Individual VM installation scripts (8 files)
- **deploy-\*-oneliner.txt** - Base64 inline execution scripts (8 files)

## Installation Scripts

| Script | Target VM | IP Address | Agent Name |
|--------|-----------|------------|------------|
| install-wazuh-310.sh | k3s-master-vm | 10.88.145.180 | k3s-master-vm-vm310 |
| install-wazuh-311.sh | k3s-worker-1-vm | 10.88.145.181 | k3s-worker-1-vm-vm311 |
| install-wazuh-312.sh | k3s-worker-2-vm | 10.88.145.182 | k3s-worker-2-vm-vm312 |
| install-wazuh-900.sh | red-kali-server | 10.88.150.2 | red-kali-server-vm900 |
| install-wazuh-901.sh | blue-kali-server | 10.88.150.3 | blue-kali-server-vm901 |
| install-wazuh-902.sh | purple-kali-server | 10.88.150.4 | purple-kali-server-vm902 |
| install-wazuh-903.sh | green-kali-server | 10.88.150.5 | green-kali-server-vm903 |
| install-wazuh-200.sh | claude-code-agent | 10.88.140.200 | claude-code-agent-vm200 |

## Quick Start

### Automated Deployment (5 minutes)
```bash
# From cortex root directory:
./scripts/security/deploy-wazuh-all-vms-ssh.sh
```

### Manual Deployment (per VM)
```bash
# Access VM via Proxmox console or SSH
bash /path/to/install-wazuh-<VMID>.sh
```

## Deployment Methods

1. **SSH Automated** - `../../scripts/security/deploy-wazuh-all-vms-ssh.sh`
2. **Manual Console** - Copy and execute individual scripts
3. **HTTP Download** - Host scripts and use curl one-liners
4. **Base64 Inline** - Use deploy-*-oneliner.txt for air-gapped systems

## Verification

```bash
# Verify all agents registered
../../verify-wazuh-agents.sh

# Or check manually on each VM
systemctl status wazuh-agent
/var/ossec/bin/wazuh-control info
```

## Documentation

- **Comprehensive Guide:** `/Users/ryandahlberg/Projects/cortex/docs/security/WAZUH-AGENT-DEPLOYMENT-GUIDE.md`
- **Deployment Report:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/reports/wazuh-agent-deployment-report.md`
- **Summary:** `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/WAZUH-DEPLOYMENT-SUMMARY.md`

## Wazuh Manager

- **Manager IP:** 10.88.145.181
- **Manager Port:** 31514
- **Dashboard:** https://10.88.145.181:31518
- **API:** https://10.88.145.181:55000

## Support

See [QUICK-START.md](QUICK-START.md) for troubleshooting and common issues.

---

**Generated:** 2025-12-14
**Security Master Session:** D3E7AA88-CB9B-44A8-A1DC-8BEE4B0FA048
