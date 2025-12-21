# K3s HA Cluster Setup Summary

## Current Situation

4 new K3s VMs have been cloned from existing VMs but have incorrect IP addresses due to inheriting IPs from source VMs:

| VMID | Name | Current IP | Target IP | Role |
|------|------|------------|-----------|------|
| 303 | k3s-master02 | 10.88.145.190 | 10.88.145.193 | Server |
| 304 | k3s-worker03 | 10.88.145.191 | 10.88.145.194 | Agent |
| 305 | k3s-worker04 | 10.88.145.191 | 10.88.145.195 | Agent |
| 306 | k3s-master03 | 10.88.145.190 | 10.88.145.196 | Server |

**Problem:** IP conflicts prevent SSH access, requiring manual console configuration.

## Solution Approach

### Phase 1: Fix IP Addresses (MANUAL - Via Proxmox Console)

Since SSH doesn't work due to IP conflicts, you must use Proxmox web console.

**Access:** https://10.88.140.164:8006

**For each VM:**
1. Click on VM in Proxmox UI
2. Click "Console" button
3. Login with: `k3s` / `toor`
4. Run the commands below
5. VM will reboot with correct IP

#### VM 303 (k3s-master02)
```bash
sudo sed -i 's/10.88.145.190/10.88.145.193/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master02
sudo netplan apply && sudo reboot
```

#### VM 304 (k3s-worker03)
```bash
sudo sed -i 's/10.88.145.191/10.88.145.194/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker03
sudo netplan apply && sudo reboot
```

#### VM 305 (k3s-worker04)
```bash
sudo sed -i 's/10.88.145.191/10.88.145.195/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker04
sudo netplan apply && sudo reboot
```

#### VM 306 (k3s-master03)
```bash
sudo sed -i 's/10.88.145.190/10.88.145.196/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master03
sudo netplan apply && sudo reboot
```

**Tip:** Open 4 console windows and execute in parallel to save time.

### Phase 2: Automated Cluster Join (AUTOMATIC)

After IP fixes are complete, run:

```bash
./complete-cluster-setup.sh
```

This script will automatically:
1. Verify all 4 VMs are accessible at new IPs
2. Retrieve K3s join token from master01
3. Join k3s-master02 and k3s-master03 as server nodes
4. Join k3s-worker03 and k3s-worker04 as agent nodes
5. Verify all 7 nodes appear in cluster

## Scripts Created

| Script | Purpose |
|--------|---------|
| `PROXMOX-CONSOLE-STEPS.md` | Detailed manual instructions for console fixes |
| `verify-ips.sh` | Quick check if IP fixes are complete |
| `join-nodes-to-cluster.py` | Automated cluster join script |
| `complete-cluster-setup.sh` | Master script that runs everything |

## Expected Final State

```bash
kubectl get nodes
```

Should show 7 nodes:

| Node | IP | Role |
|------|-------|------|
| k3s-master01 | 10.88.145.190 | Server |
| k3s-master02 | 10.88.145.193 | Server |
| k3s-master03 | 10.88.145.196 | Server |
| k3s-worker01 | 10.88.145.191 | Agent |
| k3s-worker02 | 10.88.145.192 | Agent |
| k3s-worker03 | 10.88.145.194 | Agent |
| k3s-worker04 | 10.88.145.195 | Agent |

**Total Resources:**
- 3 server nodes (for HA etcd quorum)
- 4 worker nodes (for workload distribution)

## Quick Start

```bash
# 1. Do manual IP fixes via Proxmox console (see Phase 1 above)

# 2. Run the automated setup
./complete-cluster-setup.sh

# 3. Verify cluster
ssh k3s@10.88.145.190 "kubectl get nodes -o wide"
```

## Troubleshooting

### IP fixes not working
- Verify netplan file was edited: `cat /etc/netplan/00-installer-config.yaml`
- Check network status: `ip addr show`
- Check routes: `ip route`
- Manually reapply: `sudo netplan apply`

### Cannot join cluster
- Verify token: `ssh k3s@10.88.145.190 "sudo cat /var/lib/rancher/k3s/server/node-token"`
- Check master01 API: `curl -k https://10.88.145.190:6443`
- Check firewall: `sudo ufw status`
- View logs: `sudo journalctl -u k3s -f`

### Nodes not appearing
- Wait 60s for etcd sync
- Check node logs: `sudo journalctl -u k3s -f` (server) or `sudo journalctl -u k3s-agent -f` (agent)
- Restart k3s service: `sudo systemctl restart k3s` or `sudo systemctl restart k3s-agent`

## References

- K3s Documentation: https://docs.k3s.io/
- Netplan Documentation: https://netplan.io/
- Proxmox VE Console: https://pve.proxmox.com/wiki/VNC_Client

## Author

Created by Brother Cortex for Cortex Holdings K3s HA deployment.
Date: 2025-12-20
