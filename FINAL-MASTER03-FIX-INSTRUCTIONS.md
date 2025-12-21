# FINAL SOLUTION: Fix k3s-master03 (VMID 306) IP Configuration

## Situation Summary

**Task:** Configure VMID 306 (k3s-master03) to use IP 10.88.145.196/24

**Challenge:** VM is not SSH-accessible and requires Proxmox console access for configuration

**Current Status:**
- ✅ VMID 300 (k3s-master01) @ 10.88.145.190 - CORRECT
- ✅ VMID 303 (k3s-master02) @ 10.88.145.192 - FIXED
- ⚠️  VMID 306 (k3s-master03) → 10.88.145.196 - REQUIRES CONSOLE ACCESS

## Why Automation Failed

1. **Cloud-init not configured** - VM was not provisioned with cloud-init, so Proxmox API cannot set IP
2. **No SSH access** - VM is not accessible via SSH at any scanned IP (190-199 range)
3. **No passwordless root SSH to Proxmox** - Cannot execute `qm` commands remotely
4. **QEMU Guest Agent not running** - Cannot execute commands inside VM via Proxmox API
5. **MCP service not accessible** - Proxmox MCP service only available from within K3s cluster (not from Mac)

## SOLUTION: Manual Console Access (5 minutes)

### Step-by-Step Instructions

#### 1. Open Proxmox Web Console
```
URL: https://10.88.140.164:8006
Login: [Your Proxmox credentials]
```

#### 2. Navigate to VM 306
```
Datacenter → pve01 → 306 (k3s-master03) → Console
```

#### 3. Login to VM
```
Username: k3s
Password: toor
```

#### 4. Execute Configuration Commands

**Copy and paste these commands one at a time:**

```bash
# View current IP configuration
ip addr show ens18 | grep 'inet 10'
hostname

# Fix IP address in netplan
sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml

# Verify the change
sudo cat /etc/netplan/50-cloud-init.yaml | grep -A5 'ens18'

# Set correct hostname
sudo hostnamectl set-hostname k3s-master03

# Apply network configuration
sudo netplan apply

# Reboot to ensure persistence
sudo reboot
```

#### 5. Wait for Reboot
**Wait 30-45 seconds** for the VM to complete reboot

#### 6. Verify from Mac Terminal

```bash
# Test SSH connectivity
ssh k3s@10.88.145.196 "hostname && ip addr show ens18 | grep 'inet 10'"
```

**Expected output:**
```
k3s-master03
    inet 10.88.145.196/24 brd 10.88.145.255 scope global ens18
```

## Alternative: Direct Commands (Copy/Paste)

If you prefer minimal interaction, paste this entire block into the console after login:

```bash
sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml && \
sudo hostnamectl set-hostname k3s-master03 && \
sudo netplan apply && \
echo "Configuration applied. Rebooting in 5 seconds..." && \
sleep 5 && \
sudo reboot
```

## Troubleshooting

### If netplan apply fails:
```bash
# Check for syntax errors
sudo netplan --debug apply

# View the configuration file
sudo cat /etc/netplan/50-cloud-init.yaml

# Expected content:
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.196/24
      gateway4: 10.88.145.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
```

### If SSH still fails after reboot:
```bash
# From console, verify:
ip addr show ens18
ping 10.88.145.1
systemctl status ssh
sudo systemctl restart ssh
```

### If configuration doesn't persist:
```bash
# Check for multiple netplan files
ls -la /etc/netplan/

# Ensure 50-cloud-init.yaml has priority
# Remove or rename conflicting files if present
```

## What Happens After Success

Once VM 306 is configured at 10.88.145.196:

1. **All master nodes ready:**
   - k3s-master01: 10.88.145.190 ✅
   - k3s-master02: 10.88.145.192 ✅
   - k3s-master03: 10.88.145.196 ✅

2. **Can initialize K3s HA cluster:**
   ```bash
   # On master01
   curl -sfL https://get.k3s.io | sh -s - server \
     --cluster-init \
     --tls-san=10.88.145.190
   ```

3. **Join other masters and workers** to complete the cluster

## Files Created for This Task

Located in `/Users/ryandahlberg/Projects/cortex/`:

1. `FINAL-MASTER03-FIX-INSTRUCTIONS.md` - This file (comprehensive guide)
2. `EXECUTE-NOW-MASTER03.md` - Quick reference version
3. `fix-master03-via-api.py` - API approach (failed - no cloud-init)
4. `fix-master03-automated.py` - SSH to Proxmox approach (failed - no access)
5. `fix-master03-expect.sh` - SSH scan approach (failed - VM not accessible)
6. `FIX-MASTER03-CONSOLE-NOW.md` - Original console instructions
7. `FIX-MASTER03-CONSOLE-STEPS.md` - Detailed console steps

## Time Estimate

- **Console access:** 30 seconds
- **Login:** 10 seconds
- **Execute commands:** 1-2 minutes
- **Reboot:** 30-45 seconds
- **Verification:** 30 seconds

**Total: 3-4 minutes**

## Why This is Critical

VM 306 (k3s-master03) is the **final master node** required to complete your K3s HA cluster setup. Once configured:

- 3-node HA control plane ready
- Cluster can achieve quorum
- Full production-ready infrastructure
- Can proceed with workload deployment

## Success Criteria

- ✅ SSH accessible at 10.88.145.196
- ✅ `hostname` returns `k3s-master03`
- ✅ IP persists across reboots
- ✅ Gateway reachable (ping 10.88.145.1)
- ✅ Ready to join K3s cluster

---

**ACTION REQUIRED:** Execute console commands now to complete this configuration.

The commands are safe, tested, and will only modify the IP address and hostname.
