# IMMEDIATE ACTION: Fix k3s-master03 IP Configuration

## Critical Status
**VMID 306 (k3s-master03)** needs IP reconfiguration to **10.88.145.196/24**

This is the FINAL VM that requires configuration to complete the K3s cluster setup.

## Execute These Steps NOW

### Step 1: Access Proxmox Console (30 seconds)
```
Open browser: https://10.88.140.164:8006
Login to Proxmox
Navigate: Datacenter > pve01 > 306 (k3s-master03)
Click: Console button (top-right toolbar)
```

### Step 2: Login to VM Console (10 seconds)
```
Username: k3s
Password: toor
```

### Step 3: Execute IP Fix Commands (2 minutes)
Copy and paste these commands one at a time into the console:

```bash
# Fix IP address in netplan configuration
sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml

# Set correct hostname
sudo hostnamectl set-hostname k3s-master03

# Apply network configuration
sudo netplan apply

# Reboot to ensure all changes take effect
sudo reboot
```

### Step 4: Wait for Reboot (30 seconds)
The VM will disconnect and reboot. Wait approximately 30-45 seconds.

### Step 5: Verify Configuration (30 seconds)
From your Mac terminal, run:

```bash
# Test SSH connectivity
ssh k3s@10.88.145.196 "hostname && ip addr show ens18 | grep 'inet 10'"
```

Expected output:
```
k3s-master03
    inet 10.88.145.196/24 brd 10.88.145.255 scope global ens18
```

## Current Cluster Status

| VMID | Hostname | IP Address | Status |
|------|----------|------------|--------|
| 300 | k3s-master01 | 10.88.145.190 | ✅ CORRECT |
| 303 | k3s-master02 | 10.88.145.192 | ✅ FIXED |
| 306 | k3s-master03 | ??? → 10.88.145.196 | ⚠️ FIXING NOW |

## Why This Matters

Once VM 306 is configured:
- All 3 master nodes will be on correct IPs
- K3s HA cluster can be properly initialized
- Worker nodes can join the cluster
- Full cluster operations can begin

## Troubleshooting

**If netplan apply fails:**
```bash
# Check netplan syntax
sudo netplan --debug apply

# If still failing, manually verify file
sudo cat /etc/netplan/50-cloud-init.yaml
```

**If SSH still doesn't work after reboot:**
```bash
# Check from console
ip addr show ens18
ping 10.88.145.1  # Test gateway
systemctl status ssh
```

**If wrong IP persists:**
```bash
# Force network restart
sudo systemctl restart systemd-networkd
sudo netplan apply
```

## Time Estimate
**Total time: 3-4 minutes**
- Console access: 30s
- Login: 10s
- Execute commands: 2m
- Reboot & verify: 1m

## Success Criteria
- ✅ SSH accessible at 10.88.145.196
- ✅ Hostname returns "k3s-master03"
- ✅ IP configuration permanent across reboots
- ✅ Gateway connectivity working

## Next Steps After Success
Once verified:
1. Initialize K3s cluster on master nodes
2. Join worker nodes to cluster
3. Deploy monitoring stack
4. Begin workload deployment

---

**Action Required:** Execute the console commands above NOW to complete this critical configuration task.
