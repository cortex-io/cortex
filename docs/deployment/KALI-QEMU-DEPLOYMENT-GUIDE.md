# Kali Linux QEMU Image Deployment Guide

**Fast Track:** Deploy pre-built Kali Linux images to Sentinel Forge VMs (900-903)

**Time Savings:** 10 minutes vs. 2 hours (manual installation × 4 VMs)

---

## Why QEMU Images Over ISO Installation?

| Method | Time | Manual Steps | QEMU Agent | Pre-configured |
|--------|------|--------------|------------|----------------|
| **ISO Installation** | 2 hours | High (4× installs) | Manual install | No |
| **QEMU Image** | 10 minutes | Low (import × 4) | Pre-installed | Yes |

**Recommendation:** Use QEMU images for faster deployment

---

## Prerequisites

1. **Network Access:** SSH or console access to Proxmox host (10.88.140.164)
2. **Storage:** ~8GB free space in `/var/lib/vz/template/qemu/`
3. **VMs Created:** Sentinel Forge VMs 900-903 (already created ✓)

---

## Method 1: Automated Deployment (Recommended)

### Step 1: Prepare Kali Image on Proxmox

SSH to Proxmox host and download/extract Kali QEMU image:

```bash
# SSH to Proxmox
ssh root@10.88.140.164

# Navigate to template storage
cd /var/lib/vz/template/qemu/

# Download Kali QEMU image
wget https://kali.download/base-images/kali-2024.3/kali-linux-2024.3-qemu-amd64.7z

# Extract (requires p7zip)
apt install p7zip-full  # if not installed
7z x kali-linux-2024.3-qemu-amd64.7z

# Verify extraction
ls -lh kali-linux-2024.3-qemu-amd64.qcow2
# Should show ~8GB file
```

### Step 2: Run Automated Deployment Script

From your local machine (with network access to Proxmox):

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy/deploy-kali-qemu-images.sh
```

**What it does:**
- Imports QEMU disk to all 4 VMs
- Configures network settings (static IPs)
- Sets boot order
- Starts all VMs
- Verifies connectivity

**Duration:** ~5-10 minutes for all 4 VMs

---

## Method 2: Manual Deployment (If Script Fails)

### For Each VM (900, 901, 902, 903):

```bash
# SSH to Proxmox host
ssh root@10.88.140.164

# Import disk to VM
qm importdisk 900 /var/lib/vz/template/qemu/kali-linux-2024.3-qemu-amd64.qcow2 local-lvm

# Attach disk to VM (SCSI0)
qm set 900 --scsi0 local-lvm:vm-900-disk-0

# Resize disk to 32GB
qm resize 900 scsi0 32G

# Set boot order (disk first)
qm set 900 --boot order=scsi0

# Start VM
qm start 900
```

Repeat for VMs 901, 902, 903 (change VM ID in commands).

---

## Post-Deployment Configuration

### Step 1: Access VM Console

Via Proxmox Web UI:
1. Open https://10.88.140.164:8006
2. Navigate to VM 900 (red-kali-server)
3. Click "Console"

### Step 2: Login with Default Credentials

```
Username: kali
Password: kali
```

### Step 3: Change Default Password

```bash
# Change kali user password
passwd

# Change root password
sudo passwd root
```

### Step 4: Configure Static IP

Edit network configuration:

```bash
sudo nano /etc/network/interfaces
```

**For VM 900 (red-kali-server) - 10.88.150.2:**
```
auto eth0
iface eth0 inet static
    address 10.88.150.2
    netmask 255.255.255.248
    gateway 10.88.150.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

**For VM 901 (blue-kali-server) - 10.88.150.3:**
```
auto eth0
iface eth0 inet static
    address 10.88.150.3
    netmask 255.255.255.248
    gateway 10.88.150.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

**For VM 902 (purple-kali-server) - 10.88.150.4:**
```
auto eth0
iface eth0 inet static
    address 10.88.150.4
    netmask 255.255.255.248
    gateway 10.88.150.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

**For VM 903 (green-kali-server) - 10.88.150.5:**
```
auto eth0
iface eth0 inet static
    address 10.88.150.5
    netmask 255.255.255.248
    gateway 10.88.150.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

Restart networking:
```bash
sudo systemctl restart networking
```

### Step 5: Verify Network Connectivity

```bash
# Check IP configuration
ip addr show eth0

# Test gateway
ping -c 3 10.88.150.1

# Test internet
ping -c 3 8.8.8.8
```

### Step 6: Update System

```bash
# Update package lists
sudo apt update

# Upgrade all packages
sudo apt upgrade -y

# Install QEMU guest agent (if not present)
sudo apt install qemu-guest-agent -y
sudo systemctl enable qemu-guest-agent
sudo systemctl start qemu-guest-agent
```

---

## Role-Specific Tool Installation

### Red Team (VM 900) - Offensive Tools

```bash
sudo apt install -y \
    metasploit-framework \
    sqlmap \
    nikto \
    wpscan \
    nmap \
    masscan \
    gobuster \
    john \
    hashcat \
    hydra

# Initialize Metasploit database
sudo msfdb init
```

### Blue Team (VM 901) - Defensive Tools

```bash
sudo apt install -y \
    suricata \
    zeek \
    wireshark \
    tcpdump \
    snort \
    ossec-hids \
    aide \
    rkhunter \
    chkrootkit

# Configure Suricata
sudo suricata-update
sudo systemctl enable suricata
sudo systemctl start suricata
```

### Purple Team (VM 902) - Coordination Tools

```bash
sudo apt install -y \
    docker.io \
    docker-compose \
    ansible \
    git \
    python3-pip \
    tmux \
    screen

# Enable Docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker kali
```

### Green Team (VM 903) - Honeypot Tools

```bash
sudo apt install -y \
    cowrie \
    dionaea \
    honeytrap \
    kippo

# Honeypots require specific configuration
# See individual tool documentation
```

---

## Verification

### Check All VMs Are Running

From Proxmox host:

```bash
for vmid in 900 901 902 903; do
    status=$(qm status $vmid | awk '{print $2}')
    echo "VM $vmid: $status"
done
```

Expected output:
```
VM 900: running
VM 901: running
VM 902: running
VM 903: running
```

### Test Network Connectivity

From purple team (VM 902) coordinator:

```bash
# Ping all team VMs
ping -c 1 10.88.150.2  # Red
ping -c 1 10.88.150.3  # Blue
ping -c 1 10.88.150.5  # Green
```

### Verify QEMU Guest Agent

From Proxmox host:

```bash
for vmid in 900 901 902 903; do
    echo "=== VM $vmid ==="
    qm agent $vmid ping
    qm agent $vmid get-osinfo
done
```

---

## Troubleshooting

### VM Won't Boot

**Symptom:** VM starts but immediately stops

**Solution:**
```bash
# Check boot order
qm config 900 | grep boot

# Set boot order to disk
qm set 900 --boot order=scsi0

# Check if disk is attached
qm config 900 | grep scsi0

# Start VM
qm start 900
```

### No Network Connectivity

**Symptom:** Can't ping gateway or internet

**Solutions:**

1. **Check bridge configuration:**
   ```bash
   # On Proxmox host
   brctl show vmbr0
   ip link show vmbr0.150
   ```

2. **Verify VLAN tag:**
   ```bash
   # Check VM network config
   qm config 900 | grep net0
   # Should show: net0: virtio=...,bridge=vmbr0,tag=150
   ```

3. **Inside VM - check interface:**
   ```bash
   ip link set eth0 up
   ip addr show eth0
   ```

### QEMU Guest Agent Not Working

**Symptom:** `qm agent 900 ping` fails

**Solution:**
```bash
# Inside VM
sudo apt install qemu-guest-agent
sudo systemctl enable qemu-guest-agent
sudo systemctl start qemu-guest-agent

# Verify service is running
sudo systemctl status qemu-guest-agent
```

### Disk Import Failed

**Symptom:** `qm importdisk` command errors

**Solution:**
```bash
# Check if QEMU image exists
ls -lh /var/lib/vz/template/qemu/kali-linux-2024.3-qemu-amd64.qcow2

# Check storage has space
pvs  # Physical volumes
lvs  # Logical volumes
df -h /dev/pve/data

# Try import again with full path
qm importdisk 900 /var/lib/vz/template/qemu/kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
```

---

## Security Hardening (Post-Installation)

### All VMs

```bash
# Enable firewall
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 10.88.150.0/29  # Sentinel Forge network
sudo ufw enable

# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Set up automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Backup & Snapshots

### Create Pre-Exercise Snapshot

Before running security exercises, create snapshots:

```bash
# On Proxmox host
for vmid in 900 901 902 903; do
    qm snapshot $vmid "pre-exercise-$(date +%Y%m%d)" \
        --description "Snapshot before security exercise"
done
```

### Full VM Backup

```bash
# Backup all Sentinel Forge VMs
vzdump 900 901 902 903 \
    --compress zstd \
    --mode snapshot \
    --storage local
```

---

## Next Steps

1. ✅ Deploy Kali QEMU images (this guide)
2. Configure static IPs on all VMs
3. Install role-specific tools
4. Run security hardening
5. Create baseline snapshot
6. Begin purple team exercises

---

## Related Documentation

- **Sentinel Forge Infrastructure:** `/docs/deployment/SENTINEL-FORGE-INFRASTRUCTURE.md`
- **Deployment Summary:** `/docs/deployment/SENTINEL-FORGE-DEPLOYMENT-SUMMARY.md`
- **Automated Script:** `/scripts/deploy/deploy-kali-qemu-images.sh`

---

**Created:** 2025-12-13
**Author:** Cortex CI/CD Master
**Status:** Ready for Deployment
