# URGENT: Fix k3s-master03 IP via Proxmox Console

## Status: IMMEDIATE ACTION REQUIRED

VMID 306 (k3s-master03) needs IP configuration to 10.88.145.196

## Quick Console Fix (5 minutes)

### Step 1: Access Proxmox Console
```
URL: https://10.88.140.164:8006
VM: 306 (k3s-master03)
Click: Console button (top right)
```

### Step 2: Login
```
Username: k3s
Password: toor
```

### Step 3: Check Current IP
```bash
ip addr show ens18 | grep 'inet 10'
hostname
```

### Step 4: Fix IP Address
```bash
sudo nano /etc/netplan/50-cloud-init.yaml
```

Change to:
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

Save: Ctrl+X, Y, Enter

### Step 5: Apply
```bash
sudo hostnamectl set-hostname k3s-master03
sudo netplan apply
sudo reboot
```

### Step 6: Verify (from your Mac)
Wait 30 seconds after reboot, then:
```bash
ssh k3s@10.88.145.196 "hostname && ip addr show ens18 | grep 'inet 10'"
```

Should show:
```
k3s-master03
    inet 10.88.145.196/24
```

## Current Status

✅ VMID 300 (k3s-master01) → 10.88.145.190 - CORRECT
✅ VMID 303 (k3s-master02) → 10.88.145.192 - FIXED
⏳ VMID 306 (k3s-master03) → 10.88.145.196 - NEEDS CONSOLE FIX

Once complete, all VMs will have correct IPs per VMID mapping.
