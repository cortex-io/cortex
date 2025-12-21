# K3s Cluster IP Configuration Status

## Current Situation

### Nodes That Are GOOD ✓
1. **k3s-master01** - 10.88.145.190 ✓ (Original master, in cluster)
2. **k3s-master02** - 10.88.145.193 ✓ (IP already fixed, ready to join)
3. **k3s-worker01** - 10.88.145.191 ✓ (In cluster)
4. **k3s-worker02** - 10.88.145.192 ✓ (In cluster)
5. **k3s-worker03** - 10.88.145.194 ✓ (In cluster)
6. **k3s-worker04** - 10.88.145.195 ✓ (In cluster, showing NotReady but likely just initializing)

### Nodes That Need Work ✗
1. **k3s-master03** - Should be at 10.88.145.196 but NOT ACCESSIBLE
   - VMID: 306
   - Status: Running in Proxmox
   - Problem: Not accessible via SSH (unknown current IP or network issue)
   - Action: **Needs Proxmox console access to fix**

## What You Said

> "we just have two k3s nodes to update the ip address for"

Based on my analysis:
- **k3s-master02**: Already has correct IP (10.88.145.193) ✓
- **k3s-master03**: Needs IP fix - currently not accessible ✗

So really just **ONE** node needs IP fixing: **k3s-master03**

## How to Fix k3s-master03

### Quick Steps

1. **Access Proxmox Console**
   ```
   https://10.88.145.164:8006
   Navigate to: VM 306 (k3s-master03)
   Click: Console
   ```

2. **Login to VM**
   ```
   Username: k3s
   Password: toor
   ```

3. **Check Current State**
   ```bash
   hostname
   ip addr show ens18 | grep 'inet 10'
   ```

4. **Fix IP Address**
   ```bash
   sudo nano /etc/netplan/50-cloud-init.yaml
   ```

   Set IP to: `10.88.145.196/24`

   ```bash
   sudo hostnamectl set-hostname k3s-master03
   sudo netplan apply
   sudo reboot
   ```

5. **Verify (from your Mac after reboot)**
   ```bash
   ssh k3s@10.88.145.196 "hostname"
   ```
   Should output: `k3s-master03`

### Alternative: Automated Script (if you can SSH to master03)

If you discover k3s-master03 is accessible at some IP:

```bash
./fix-master03-ip.py <current_ip>
# Example: ./fix-master03-ip.py 10.88.145.XXX
```

## After IP Fix: Join Nodes to Cluster

Once k3s-master03 is at 10.88.145.196, join both master02 and master03:

```bash
# Option 1: Use the automated script
./join-k3s-nodes.py

# Option 2: Manual join
# For k3s-master02:
ssh k3s@10.88.145.193
K3S_TOKEN=$(ssh k3s@10.88.145.190 "sudo cat /var/lib/rancher/k3s/server/node-token")
curl -sfL https://get.k3s.io | K3S_TOKEN="$K3S_TOKEN" sh -s - server \
  --server https://10.88.145.190:6443 \
  --disable traefik \
  --disable servicelb \
  --node-name k3s-master02

# For k3s-master03:
ssh k3s@10.88.145.196
K3S_TOKEN=$(ssh k3s@10.88.145.190 "sudo cat /var/lib/rancher/k3s/server/node-token")
curl -sfL https://get.k3s.io | K3S_TOKEN="$K3S_TOKEN" sh -s - server \
  --server https://10.88.145.190:6443 \
  --disable traefik \
  --disable servicelb \
  --node-name k3s-master03
```

## Verify Final Cluster

```bash
./check-cluster-status.sh
```

Expected output:
```
✓ SUCCESS: All 7 nodes are in the cluster!
  - 3 server nodes (HA etcd quorum)
  - 4 worker nodes
```

## Files Created for You

1. **FIX-MASTER03-CONSOLE-STEPS.md** - Detailed console fix guide
2. **fix-master03-ip.py** - Automated IP fix script (needs current IP)
3. **scan-for-master03.py** - Scans network to find master03
4. **find-master03.py** - Gets Proxmox info for master03
5. **check-cluster-status.sh** - Checks cluster status

## Quick Check Commands

```bash
# Scan for all nodes
./scan-for-master03.py

# Check cluster status
./check-cluster-status.sh

# Get Proxmox VM info
./find-master03.py
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     K3s HA Cluster                          │
├─────────────────────────────────────────────────────────────┤
│  Control Plane (3 nodes - etcd quorum)                      │
│  ├─ k3s-master01  10.88.145.190  ✓ In cluster               │
│  ├─ k3s-master02  10.88.145.193  ✓ Ready to join            │
│  └─ k3s-master03  10.88.145.196  ✗ Needs IP fix             │
│                                                              │
│  Workers (4 nodes)                                           │
│  ├─ k3s-worker01  10.88.145.191  ✓ In cluster               │
│  ├─ k3s-worker02  10.88.145.192  ✓ In cluster               │
│  ├─ k3s-worker03  10.88.145.194  ✓ In cluster               │
│  └─ k3s-worker04  10.88.145.195  ✓ In cluster (NotReady)    │
└─────────────────────────────────────────────────────────────┘

Total: 7 nodes (3 control-plane + 4 workers)
Current: 5 nodes in cluster
Missing: 2 nodes (master02, master03) need to be joined
```
