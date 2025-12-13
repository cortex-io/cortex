# Wazuh Version Mismatch - Quick Fix Guide

## Problem
- API version: 4.14.1
- Dashboard version: 4.11.2
- Error: "API and dashboard version mismatch"

## Solution: Automated Fix

### Prerequisites
- Network access to Wazuh server (SSH)
- Root/sudo access on Wazuh server

### Quick Start - Automated Execution

**Option 1: If you know the Wazuh server IP**

```bash
cd /Users/ryandahlberg/Projects/cortex
export WAZUH_SERVER=<wazuh-server-ip>
./scripts/security/fix-wazuh-version-mismatch.sh
```

**Option 2: If Wazuh is on Proxmox VM**

```bash
cd /Users/ryandahlberg/Projects/cortex
export PROXMOX_HOST=10.88.140.151
./scripts/security/fix-wazuh-version-mismatch.sh
```

The script will automatically:
1. Detect the Wazuh server
2. Identify the OS type
3. Backup current configuration
4. Upgrade wazuh-dashboard to 4.14.1
5. Restart the service
6. Verify the fix

### Quick Start - Manual Execution

If the automated script fails, execute manually on the Wazuh server:

```bash
# SSH to Wazuh server
ssh root@<wazuh-server-ip>

# Backup configuration
mkdir -p /var/ossec/backup-$(date +%Y%m%d-%H%M%S)
cp -r /etc/wazuh-dashboard /var/ossec/backup-$(date +%Y%m%d-%H%M%S)/

# Stop dashboard
systemctl stop wazuh-dashboard

# Upgrade (Ubuntu/Debian)
apt-get update
apt-get install --only-upgrade wazuh-dashboard=4.14.1-1 -y

# OR upgrade (RHEL/CentOS)
yum install wazuh-dashboard-4.14.1-1 -y

# Restart dashboard
systemctl restart wazuh-dashboard

# Verify
systemctl status wazuh-dashboard
dpkg -l | grep wazuh-dashboard  # Should show 4.14.1
```

## Verification

After the fix:
1. Access Wazuh dashboard in browser
2. Verify no version mismatch error
3. Check that all features work correctly

## Support

- **Full Documentation**: `/Users/ryandahlberg/Projects/cortex/coordination/tasks/wazuh-version-mismatch-remediation-report.md`
- **Script Location**: `/Users/ryandahlberg/Projects/cortex/scripts/security/fix-wazuh-version-mismatch.sh`
- **Task ID**: wazuh-version-fix-1765571682

## Network Issue

The Proxmox host at 10.88.140.151 is not currently accessible from the Cortex environment. You'll need to run this script from a machine that has network access to:
- The Proxmox host (10.88.140.151), OR
- The Wazuh server directly

## Estimated Time

- Automated script: 5-10 minutes
- Manual execution: 5-10 minutes
- Downtime: 1-2 minutes (dashboard only)
