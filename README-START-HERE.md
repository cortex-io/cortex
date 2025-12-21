# K3s Cluster Expansion - Start Here

## Current Status

Your K3s cluster currently has **3 nodes**:
- k3s-master01 (10.88.145.190) - Server
- k3s-worker01 (10.88.145.191) - Agent
- k3s-worker02 (10.88.145.192) - Agent

**Goal:** Expand to **7 nodes** (3 servers, 4 workers) for HA

## What Needs to Be Done

4 new VMs have been cloned but have **wrong IP addresses**. They need manual fixing via Proxmox console because SSH doesn't work due to IP conflicts.

## Step-by-Step Process

### Step 1: Fix IP Addresses (MANUAL - 10-15 minutes)

Open Proxmox web UI: **https://10.88.140.164:8006**

For each of the 4 VMs below:
1. Click the VM in Proxmox
2. Click "Console" button
3. Login: `k3s` / `toor`
4. Copy/paste the commands
5. VM will reboot with correct IP

**You can do all 4 in parallel by opening 4 console windows!**

#### Commands for each VM:

**VM 303 (k3s-master02):**
```bash
sudo sed -i 's/10.88.145.190/10.88.145.193/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master02
sudo netplan apply && sudo reboot
```

**VM 304 (k3s-worker03):**
```bash
sudo sed -i 's/10.88.145.191/10.88.145.194/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker03
sudo netplan apply && sudo reboot
```

**VM 305 (k3s-worker04):**
```bash
sudo sed -i 's/10.88.145.191/10.88.145.195/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker04
sudo netplan apply && sudo reboot
```

**VM 306 (k3s-master03):**
```bash
sudo sed -i 's/10.88.145.190/10.88.145.196/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master03
sudo netplan apply && sudo reboot
```

### Step 2: Run Automated Setup (AUTOMATIC)

After all 4 VMs have rebooted, run this command from your terminal:

```bash
cd ~/Projects/cortex
./complete-cluster-setup.sh
```

This will automatically:
- ✓ Verify all 4 VMs are accessible
- ✓ Retrieve cluster join token
- ✓ Join master02 and master03 as servers
- ✓ Join worker03 and worker04 as agents
- ✓ Verify all 7 nodes are in the cluster

**Total time: ~5 minutes**

### Step 3: Verify Success

Check cluster status:

```bash
ssh k3s@10.88.145.190 "kubectl get nodes -o wide"
```

You should see **7 nodes** all with STATUS=Ready:
- k3s-master01 (10.88.145.190)
- k3s-master02 (10.88.145.193) ← new
- k3s-master03 (10.88.145.196) ← new
- k3s-worker01 (10.88.145.191)
- k3s-worker02 (10.88.145.192)
- k3s-worker03 (10.88.145.194) ← new
- k3s-worker04 (10.88.145.195) ← new

## If Something Goes Wrong

### "I can't SSH to a VM after IP fix"
Check the console for errors. Verify the netplan file:
```bash
cat /etc/netplan/00-installer-config.yaml
```
Make sure the IP is correct, then run:
```bash
sudo netplan apply
```

### "A node won't join the cluster"
Check the logs on the node:
```bash
# On server nodes:
sudo journalctl -u k3s -f

# On worker nodes:
sudo journalctl -u k3s-agent -f
```

### "I need help"
All scripts are in: `~/Projects/cortex/`

Detailed docs:
- `K3S-SETUP-SUMMARY.md` - Complete technical details
- `PROXMOX-CONSOLE-STEPS.md` - Step-by-step console instructions

Quick tests:
- `./verify-ips.sh` - Check if IP fixes are done
- `./join-nodes-to-cluster.py` - Join nodes manually

## TL;DR

```bash
# 1. Open Proxmox UI
#    https://10.88.140.164:8006
#
# 2. For each of VMs 303, 304, 305, 306:
#    - Open console
#    - Run the sed/hostname/netplan commands above
#    - Let it reboot
#
# 3. Run automated setup:
cd ~/Projects/cortex
./complete-cluster-setup.sh

# 4. Verify:
ssh k3s@10.88.145.190 "kubectl get nodes"
# Should show 7 nodes!
```

## Ready?

Start with **Step 1** above - open Proxmox and fix those IPs!

---
Created: 2025-12-20 by Brother Cortex
