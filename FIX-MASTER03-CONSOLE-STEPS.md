# Fix k3s-master03 IP Address

## Problem
- k3s-master03 (VMID 306) is running but not accessible via SSH
- Target IP: 10.88.145.196
- Need to configure via Proxmox console

## Option 1: Via Proxmox Web Console (RECOMMENDED)

### Step 1: Access Proxmox Console
1. Open browser: `https://10.88.145.164:8006`
2. Login with your Proxmox credentials
3. Navigate to: `pve01` → `306 (k3s-master03)`
4. Click **Console** button (top right)

### Step 2: Login to VM
```
Username: k3s
Password: toor
```

### Step 3: Check Current IP
```bash
ip addr show ens18 | grep 'inet 10'
hostname
```

### Step 4: Fix the IP Address

```bash
# Edit netplan configuration
sudo nano /etc/netplan/50-cloud-init.yaml
```

Change the IP address to:
```yaml
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

Save and exit (Ctrl+X, Y, Enter)

### Step 5: Apply Configuration
```bash
# Set hostname
sudo hostnamectl set-hostname k3s-master03

# Apply network config
sudo netplan apply

# Reboot to ensure clean state
sudo reboot
```

### Step 6: Verify from your local machine
After ~30 seconds, from your Mac:
```bash
ssh k3s@10.88.145.196 "hostname && ip addr show ens18 | grep 'inet 10'"
```

You should see:
```
k3s-master03
    inet 10.88.145.196/24 ...
```

## Option 2: Via Automated Script (if SSH is accessible at any IP)

If you discover k3s-master03 is accessible at a different IP, update the script:

```bash
# Edit the script to set the OLD_IP to whatever IP it's currently at
nano fix-master03-ip.py

# Then run it
./fix-master03-ip.py
```

## After IP is Fixed

Once k3s-master03 is accessible at 10.88.145.196, join it to the cluster:

```bash
./join-k3s-nodes.py
```

Or manually:
```bash
# SSH to k3s-master03
ssh k3s@10.88.145.196

# Get the token from master01
K3S_TOKEN=$(ssh k3s@10.88.145.190 "sudo cat /var/lib/rancher/k3s/server/node-token")

# Install K3s in server mode
curl -sfL https://get.k3s.io | K3S_TOKEN="$K3S_TOKEN" sh -s - server \
  --server https://10.88.145.190:6443 \
  --disable traefik \
  --disable servicelb \
  --node-name k3s-master03
```

## Current Cluster Status

```
✓ k3s-master01 at 10.88.145.190 - Running, in cluster
✓ k3s-master02 at 10.88.145.193 - Running, ready to join
✗ k3s-master03 at ?.?.?.? → needs to be 10.88.145.196 - Not accessible
✓ k3s-worker01 at 10.88.145.191 - Running, in cluster
✓ k3s-worker02 at 10.88.145.192 - Running, in cluster
✓ k3s-worker03 at 10.88.145.194 - Running, in cluster
✓ k3s-worker04 at 10.88.145.195 - Running, in cluster (NotReady - just joined)
```

Target: 7 nodes total (3 masters + 4 workers)
Current: 5 nodes in cluster
