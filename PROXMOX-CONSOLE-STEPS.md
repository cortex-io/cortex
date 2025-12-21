# K3s VM IP Fix - Proxmox Console Instructions

## Overview
The 4 new K3s VMs were cloned but have wrong IP addresses. Use Proxmox console to fix them.

## Access Proxmox
Open: https://10.88.140.164:8006

Login credentials: (use your Proxmox credentials)

## VMs to Fix

### VM 303: k3s-master02
**Current IP:** 10.88.145.190 (conflict)
**Target IP:** 10.88.145.193

**Console Commands:**
```bash
# Login as: k3s / toor
sudo sed -i 's/10.88.145.190/10.88.145.193/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master02
sudo netplan apply && sudo reboot
```

---

### VM 304: k3s-worker03
**Current IP:** 10.88.145.191 (conflict)
**Target IP:** 10.88.145.194

**Console Commands:**
```bash
# Login as: k3s / toor
sudo sed -i 's/10.88.145.191/10.88.145.194/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker03
sudo netplan apply && sudo reboot
```

---

### VM 305: k3s-worker04
**Current IP:** 10.88.145.191 (conflict)
**Target IP:** 10.88.145.195

**Console Commands:**
```bash
# Login as: k3s / toor
sudo sed -i 's/10.88.145.191/10.88.145.195/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker04
sudo netplan apply && sudo reboot
```

---

### VM 306: k3s-master03
**Current IP:** 10.88.145.190 (conflict)
**Target IP:** 10.88.145.196

**Console Commands:**
```bash
# Login as: k3s / toor
sudo sed -i 's/10.88.145.190/10.88.145.196/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master03
sudo netplan apply && sudo reboot
```

---

## Parallel Execution
You can open 4 console windows (one per VM) and execute all commands in parallel to save time.

## After All VMs Reboot

Run the verification and join script:
```bash
./join-nodes-to-cluster.py
```

This will:
1. Verify SSH connectivity to all new IPs
2. Retrieve K3s join token from master01
3. Join master02 and master03 as server nodes
4. Join worker03 and worker04 as agent nodes
5. Verify all 7 nodes appear in `kubectl get nodes`

## Expected Final State

```
kubectl get nodes
```

Should show 7 nodes:
- k3s-master01 (10.88.145.190)
- k3s-master02 (10.88.145.193)
- k3s-master03 (10.88.145.196)
- k3s-worker01 (10.88.145.191)
- k3s-worker02 (10.88.145.192)
- k3s-worker03 (10.88.145.194)
- k3s-worker04 (10.88.145.195)

## Troubleshooting

If a VM doesn't respond after IP fix:
1. Check console for error messages
2. Verify netplan config: `cat /etc/netplan/00-installer-config.yaml`
3. Check network status: `ip addr show`
4. Manually reapply: `sudo netplan apply`

If join fails:
1. Check token: `ssh k3s@10.88.145.190 "sudo cat /var/lib/rancher/k3s/server/node-token"`
2. Check master01 is accessible: `curl -k https://10.88.145.190:6443`
3. Check k3s logs: `ssh k3s@<new-ip> "sudo journalctl -u k3s -f"`
