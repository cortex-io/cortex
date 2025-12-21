# K3s HA Cluster Build Status

## Current Status

### Completed Steps
1. ✅ Updated existing VM resources (300-302) to 2 cores, 6GB RAM
2. ✅ Cloned new VMs:
   - VM 303: k3s-master02 (cloned from VM 300)
   - VM 304: k3s-worker03 (cloned from VM 301)
   - VM 305: k3s-worker04 (cloned from VM 301)
   - VM 306: k3s-master03 (cloned from VM 300)
3. ✅ All new VMs created with 2 cores, 6GB RAM, 100GB storage
4. ✅ All new VMs have been started

### Remaining Steps

#### MANUAL STEP REQUIRED: Configure Network on New VMs

The cloned VMs need their network configuration updated via **Proxmox Console** because:
- Cloned VMs inherit the MAC address and IP configuration from source VMs
- This causes network conflicts
- SSH is not yet accessible on the new VMs

**For each new VM, follow these steps:**

1. **Open Proxmox Web UI**: https://10.88.140.164:8006
2. **Access Console**: Click on VM → Console

3. **Login**: Username: `k3s`, Password: `toor`

4. **Configure Network**:

##### VM 303 (k3s-master02)
```bash
sudo hostnamectl set-hostname k3s-master02
sudo nano /etc/netplan/50-cloud-init.yaml
```
Edit the file to contain:
```yaml
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
```
Apply the configuration:
```bash
sudo netplan apply
```

##### VM 304 (k3s-worker03)
```bash
sudo hostnamectl set-hostname k3s-worker03
sudo nano /etc/netplan/50-cloud-init.yaml
```
Edit the file to set IP to: `10.88.145.194/24`
```bash
sudo netplan apply
```

##### VM 305 (k3s-worker04)
```bash
sudo hostnamectl set-hostname k3s-worker04
sudo nano /etc/netplan/50-cloud-init.yaml
```
Edit the file to set IP to: `10.88.145.195/24`
```bash
sudo netplan apply
```

##### VM 306 (k3s-master03)
```bash
sudo hostnamectl set-hostname k3s-master03
sudo nano /etc/netplan/50-cloud-init.yaml
```
Edit the file to set IP to: `10.88.145.196/24`
```bash
sudo netplan apply
```

#### After Manual Configuration

Once all 4 new VMs have their static IPs configured and are accessible via SSH, run:

```bash
./finalize-k3s-cluster.py
```

This script will:
1. Verify connectivity to all new VMs
2. Retrieve K3s token from master01
3. Join k3s-master02 and k3s-master03 as control-plane nodes
4. Join k3s-worker03 and k3s-worker04 as worker nodes
5. Verify cluster has all 7 nodes

## Target Cluster Configuration

| Node | VMID | IP | Role | Cores | RAM | Storage |
|------|------|-----|------|-------|-----|---------|
| k3s-master01 | 300 | 10.88.145.190 | master | 2 | 6GB | 100GB |
| k3s-master02 | 303 | 10.88.145.193 | master | 2 | 6GB | 100GB |
| k3s-master03 | 306 | 10.88.145.196 | master | 2 | 6GB | 100GB |
| k3s-worker01 | 301 | 10.88.145.191 | worker | 2 | 6GB | 100GB |
| k3s-worker02 | 302 | 10.88.145.192 | worker | 2 | 6GB | 100GB |
| k3s-worker03 | 304 | 10.88.145.194 | worker | 2 | 6GB | 100GB |
| k3s-worker04 | 305 | 10.88.145.195 | worker | 2 | 6GB | 100GB |

**Total**: 7 nodes, 14 cores, 42GB RAM

## Verification Commands

After cluster build is complete, verify with:

```bash
# Check all nodes
ssh k3s@10.88.145.190 'kubectl get nodes -o wide'

# Should show:
# - 3 control-plane nodes (masters)
# - 4 worker nodes
# - All nodes in Ready state

# Check pods
ssh k3s@10.88.145.190 'kubectl get pods -A'

# Check cluster health
ssh k3s@10.88.145.190 'kubectl get nodes -o json | jq ".items[] | {name: .metadata.name, status: .status.conditions[] | select(.type==\"Ready\") | .status}"'
```

## Quick Reference

**SSH Credentials**:
- User: `k3s`
- Password: `toor`
- Root access: `sudo su`

**Proxmox API Credentials**:
- Host: 10.88.140.164:8006
- Token: root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58

**Network**:
- Subnet: 10.88.145.0/24
- Gateway: 10.88.145.1
- VLAN: 145
