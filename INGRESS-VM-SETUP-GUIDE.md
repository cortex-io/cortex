# k3s-cluster-ingress VM Setup Guide

## Current Status: VM Created ✅

**VMID:** 350
**Name:** k3s-cluster-ingress
**Target IP:** 10.88.145.199
**Purpose:** Tailscale subnet router + port forwarding to Traefik

---

## Step 1: Import Disk Image (SSH to Proxmox Required)

The VM has been created but needs a disk. You must SSH to your Proxmox host to import the Ubuntu cloud image.

### Commands to Run on Proxmox Host:

```bash
# SSH to Proxmox
ssh root@10.88.140.164

# Download Ubuntu 24.04 cloud image
cd /var/lib/vz/template/iso
wget https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img

# Import disk to VM 350
qm importdisk 350 ubuntu-24.04-server-cloudimg-amd64.img local-lvm

# Attach the disk to VM
qm set 350 --scsi0 local-lvm:vm-350-disk-0

# Resize disk to 8GB
qm resize 350 scsi0 8G

# Exit Proxmox SSH
exit
```

---

## Step 2: Configure Cloud-Init

After importing the disk, configure cloud-init for network and user setup:

```bash
# Configure cloud-init (run from your local machine)
curl -k -s -X POST https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/350/config \
-H "Authorization: PVEAPIToken=root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58" \
-d "ide2=local-lvm:cloudinit" \
-d "ciuser=k3s" \
-d "cipassword=toor" \
-d "ipconfig0=ip=10.88.145.199/24,gw=10.88.145.1" \
-d "nameserver=8.8.8.8" \
-d "boot=c" \
-d "bootdisk=scsi0"
```

---

## Step 3: Start the VM

```bash
# Start VM 350
curl -k -s -X POST https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/350/status/start \
-H "Authorization: PVEAPIToken=root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"

# Wait 60 seconds for cloud-init to complete
sleep 60
```

---

## Step 4: Configure Tailscale and Port Forwarding

Once the VM is running, SSH to it and run the setup script:

```bash
# SSH to the new VM
ssh k3s@10.88.145.199
# Password: toor

# Run these commands on the VM:
```

### Setup Script (run on k3s-cluster-ingress VM):

```bash
#!/bin/bash
# k3s-cluster-ingress setup

set -e

echo "=== k3s-cluster-ingress Setup ==="

# Update system
echo "[1/7] Updating system..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

# Install Tailscale
echo "[2/7] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Install iptables-persistent
echo "[3/7] Installing iptables-persistent..."
sudo DEBIAN_FRONTEND=noninteractive apt install -y iptables-persistent netfilter-persistent

# Enable IP forwarding
echo "[4/7] Enabling IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Start Tailscale as subnet router
echo "[5/7] Starting Tailscale..."
echo ""
echo "⚠️  IMPORTANT: You'll be prompted to authenticate"
echo "   Visit the URL shown to complete authentication"
echo ""
sudo tailscale up \
    --advertise-routes=10.88.145.0/24,10.42.0.0/16,10.43.0.0/16 \
    --accept-routes \
    --hostname=k3s-cluster-ingress

# Wait for Tailscale
sleep 5

# Get Tailscale IP
TS_IP=$(tailscale status --self 2>/dev/null | grep '100\.' | awk '{print $1}' || echo "unknown")

# Configure port forwarding to Traefik
echo ""
echo "[6/7] Configuring port forwarding to Traefik (10.88.145.200)..."
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 80 -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 443 -j MASQUERADE

# Save iptables rules
echo "[7/7] Saving iptables rules..."
sudo netfilter-persistent save

echo ""
echo "=== ✅ Setup Complete! ==="
echo ""
echo "Configuration:"
echo "  Hostname: k3s-cluster-ingress"
echo "  Local IP: 10.88.145.199"
echo "  Tailscale IP: ${TS_IP}"
echo ""
echo "Next steps:"
echo "  1. Go to https://login.tailscale.com/admin/machines"
echo "  2. Find 'k3s-cluster-ingress' and approve subnet routes"
echo "  3. Update DNS: chat.ry-ops.dev → ${TS_IP}"
echo "  4. Test: curl -I http://chat.ry-ops.dev"
echo ""
```

---

## Step 5: Approve Subnet Routes in Tailscale

1. Go to https://login.tailscale.com/admin/machines
2. Find the device "k3s-cluster-ingress"
3. Click on it
4. Approve the advertised subnet routes:
   - 10.88.145.0/24
   - 10.42.0.0/16
   - 10.43.0.0/16

---

## Step 6: Update DNS

Once Tailscale is configured and subnet routes approved:

1. Get the Tailscale IP from the setup script output (starts with 100.x.x.x)
2. Update your DNS record:
   ```
   chat.ry-ops.dev → <Tailscale IP from step above>
   ```

---

## Step 7: Test

```bash
# From any device on your Tailscale network
curl -I http://chat.ry-ops.dev

# Should return: HTTP/1.1 200 OK (not 502)
```

---

## Troubleshooting

### VM won't start
```bash
# Check VM status
curl -k -s https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/350/status/current \
-H "Authorization: PVEAPIToken=root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
```

### Can't SSH to VM
- Wait 2-3 minutes for cloud-init to complete
- Check VM console in Proxmox web UI
- Verify IP is correct: `10.88.145.199`

### Tailscale authentication not working
- Make sure you're logged into Tailscale admin console
- Try re-running: `sudo tailscale up --advertise-routes=...`

### Port forwarding not working
```bash
# Check iptables rules
sudo iptables -t nat -L -n -v

# Verify IP forwarding
cat /proc/sys/net/ipv4/ip_forward  # Should be 1

# Test Traefik directly
curl -I http://10.88.145.200 -H "Host: chat.ry-ops.dev"
```

---

## Quick Reference

**VM Details:**
- VMID: 350
- Name: k3s-cluster-ingress
- IP: 10.88.145.199
- Username: k3s
- Password: toor

**Traefik LoadBalancer:**
- IP: 10.88.145.200
- Ports: 80, 443

**Subnet Routes:**
- 10.88.145.0/24 (k3s cluster network)
- 10.42.0.0/16 (k3s pod network)
- 10.43.0.0/16 (k3s service network)

---

## Summary

This VM provides a clean separation between external Tailscale access and your k3s cluster. All external traffic flows through this single ingress point, which forwards to Traefik, which routes to your k3s services.

**Architecture:**
```
Tailscale Network (100.x.x.x)
        ↓
k3s-cluster-ingress (10.88.145.199)
  Tailscale IP: 100.x.x.x
  iptables NAT: 80,443 → 10.88.145.200
        ↓
Traefik LoadBalancer (10.88.145.200)
        ↓
K3s Services (cortex-chat, etc.)
```
