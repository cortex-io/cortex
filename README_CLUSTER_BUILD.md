# K3s HA Cluster Build - Status and Next Steps

## Current Status: 70% Complete

### ✅ Completed

1. **Updated existing VMs** (VMID 300-302)
   - Adjusted to 2 cores, 6GB RAM each
   - Storage already at 100GB

2. **Cloned new VMs** (VMID 303-306)
   - k3s-master02 (303) - cloned from k3s-master01 (300)
   - k3s-worker03 (304) - cloned from k3s-worker01 (301)
   - k3s-worker04 (305) - cloned from k3s-worker01 (301)
   - k3s-master03 (306) - cloned from k3s-master01 (300)
   - All configured with 2 cores, 6GB RAM, 100GB storage

3. **Started all new VMs**
   - VMs are running but need network reconfiguration

### 🔄 In Progress

**Network Configuration Required** (Manual Step via Proxmox Console)

The cloned VMs inherited their source VM's network configuration, causing IP conflicts.
They must be reconfigured via Proxmox console before SSH access is possible.

## Next Steps: Manual Network Configuration

### Access Proxmox Web UI

1. Go to: https://10.88.140.164:8006
2. Login with your Proxmox credentials

### Configure Each New VM

For each VM below, open its Console in Proxmox and run the commands:

---

#### VM 303: k3s-master02 → 10.88.145.193

```bash
sudo hostnamectl set-hostname k3s-master02

sudo tee /etc/netplan/50-cloud-init.yaml > /dev/null <<EOF
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.193/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF

sudo netplan apply
```

Verify: `ip addr show ens18 | grep inet`

---

#### VM 304: k3s-worker03 → 10.88.145.194

```bash
sudo hostnamectl set-hostname k3s-worker03

sudo tee /etc/netplan/50-cloud-init.yaml > /dev/null <<EOF
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.194/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF

sudo netplan apply
```

Verify: `ip addr show ens18 | grep inet`

---

#### VM 305: k3s-worker04 → 10.88.145.195

```bash
sudo hostnamectl set-hostname k3s-worker04

sudo tee /etc/netplan/50-cloud-init.yaml > /dev/null <<EOF
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.195/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF

sudo netplan apply
```

Verify: `ip addr show ens18 | grep inet`

---

#### VM 306: k3s-master03 → 10.88.145.196

```bash
sudo hostnamectl set-hostname k3s-master03

sudo tee /etc/netplan/50-cloud-init.yaml > /dev/null <<EOF
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.196/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF

sudo netplan apply
```

Verify: `ip addr show ens18 | grep inet`

---

## After Network Configuration

### Step 1: Verify Connectivity

Test SSH access to all new VMs:

```bash
ssh k3s@10.88.145.193 "hostname"  # Should return: k3s-master02
ssh k3s@10.88.145.194 "hostname"  # Should return: k3s-worker03
ssh k3s@10.88.145.195 "hostname"  # Should return: k3s-worker04
ssh k3s@10.88.145.196 "hostname"  # Should return: k3s-master03
```

### Step 2: Complete Cluster Build

Once all 4 new VMs are accessible via SSH, run:

```bash
./complete-cluster-build.py
```

This automated script will:

1. ✅ Verify connectivity to all 7 nodes
2. ✅ Retrieve K3s token from k3s-master01
3. ✅ Join k3s-master02 and k3s-master03 as control-plane nodes
4. ✅ Join k3s-worker03 and k3s-worker04 as worker nodes
5. ✅ Verify final cluster has all 7 nodes
6. ✅ Display cluster status

## Final Cluster Configuration

| Node | VMID | IP | Role | Cores | RAM | Storage |
|------|------|-----|------|-------|-----|---------|
| k3s-master01 | 300 | 10.88.145.190 | control-plane | 2 | 6GB | 100GB |
| k3s-master02 | 303 | 10.88.145.193 | control-plane | 2 | 6GB | 100GB |
| k3s-master03 | 306 | 10.88.145.196 | control-plane | 2 | 6GB | 100GB |
| k3s-worker01 | 301 | 10.88.145.191 | worker | 2 | 6GB | 100GB |
| k3s-worker02 | 302 | 10.88.145.192 | worker | 2 | 6GB | 100GB |
| k3s-worker03 | 304 | 10.88.145.194 | worker | 2 | 6GB | 100GB |
| k3s-worker04 | 305 | 10.88.145.195 | worker | 2 | 6GB | 100GB |

**Total Resources:**
- 7 nodes (3 control-plane + 4 workers)
- 14 CPU cores
- 42GB RAM
- 700GB total storage

## Verification Commands

After cluster build completes:

```bash
# Check all nodes
ssh k3s@10.88.145.190 'kubectl get nodes -o wide'

# Expected output: 7 nodes, all Ready status
# - 3 nodes with control-plane,etcd,master roles
# - 4 nodes with <none> role (workers)

# Check all pods
ssh k3s@10.88.145.190 'kubectl get pods -A'

# Check cluster info
ssh k3s@10.88.145.190 'kubectl cluster-info'
```

## Credentials

**SSH Access:**
- Username: `k3s`
- Password: `toor`
- Root: `sudo su` (no additional password required)

**Proxmox:**
- URL: https://10.88.140.164:8006
- API Token: `root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58`

**Network:**
- Subnet: 10.88.145.0/24
- Gateway: 10.88.145.1
- DNS: 8.8.8.8, 8.8.4.4
- VLAN: 145

## Troubleshooting

### If a node fails to join:

```bash
# SSH into the problem node
ssh k3s@<node-ip>

# Check K3s service status
sudo systemctl status k3s        # For masters
sudo systemctl status k3s-agent  # For workers

# Check logs
sudo journalctl -u k3s -f           # For masters
sudo journalctl -u k3s-agent -f     # For workers

# Restart service
sudo systemctl restart k3s          # For masters
sudo systemctl restart k3s-agent    # For workers
```

### If network configuration fails:

- Ensure netplan config is valid YAML (indentation matters!)
- Try `sudo netplan apply --debug` for detailed error messages
- Reboot the VM if needed: `sudo reboot`

## Files Created

- `provision-k3s-automated.py` - Initial automated provisioning (already run)
- `complete-cluster-build.py` - **Run this after network config**
- `configure-cloned-vms.sh` - Alternative manual config helper
- `finalize-k3s-cluster.py` - Alternative finalization script
- `CLUSTER_BUILD_STATUS.md` - Detailed status document
- `README_CLUSTER_BUILD.md` - This file

## Summary

**What's Done:**
- ✅ All 7 VMs created and sized correctly
- ✅ All VMs started
- ✅ Existing cluster (3 nodes) operational

**What's Needed:**
- 🔧 Manual network configuration on 4 new VMs (via Proxmox console)
- 🔧 Run `./complete-cluster-build.py` to join nodes

**Estimated Time to Complete:**
- Network config: 10-15 minutes (manual)
- Cluster build script: 5-10 minutes (automated)
- **Total: 15-25 minutes**
