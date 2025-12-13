# Sentinel Forge Security Testing Infrastructure

**Deployment Date:** $(date)
**Deployment Tool:** Cortex CI/CD Master - Autonomous Deployment
**Proxmox Node:** pve01 (10.88.140.164)

## Overview

Sentinel Forge is a comprehensive security testing environment consisting of 4 Kali Linux VMs organized by security team role.

## Network Architecture

- **VLAN:** 150 (vmbr0.150)
- **Subnet:** 10.88.150.0/29 (255.255.255.248)
- **Gateway:** 10.88.150.1
- **Usable IPs:** 10.88.150.2 - 10.88.150.5
- **Network Isolation:** Dedicated VLAN for security testing

## VM Inventory

### Red Team - Offensive Security (VM 900)

- **Hostname:** red-kali-server
- **VM ID:** 900
- **IP Address:** 10.88.150.2/29
- **Role:** Offensive/Red Team operations
- **Specs:** 2 vCPU, 4GB RAM, 32GB disk
- **Tools:** Kali Linux penetration testing suite
- **Purpose:**
  - Vulnerability scanning
  - Penetration testing
  - Exploit development
  - Attack simulation

### Blue Team - Defensive Security (VM 901)

- **Hostname:** blue-kali-server
- **VM ID:** 901
- **IP Address:** 10.88.150.3/29
- **Role:** Defensive/Blue Team operations
- **Specs:** 2 vCPU, 4GB RAM, 32GB disk
- **Tools:** Security monitoring and incident response tools
- **Purpose:**
  - Security monitoring
  - Incident response
  - Log analysis
  - Threat detection

### Purple Team - Control/Coordination (VM 902)

- **Hostname:** purple-kali-server
- **VM ID:** 902
- **IP Address:** 10.88.150.4/29
- **Role:** Purple Team/Control/Coordination
- **Specs:** 2 vCPU, 4GB RAM, 32GB disk
- **Tools:** Coordination and reporting tools
- **Purpose:**
  - Exercise coordination
  - Metrics collection
  - Reporting and analysis
  - Knowledge sharing between Red and Blue teams

### Green Team - Honeypot/Deception (VM 903)

- **Hostname:** green-kali-server
- **VM ID:** 903
- **IP Address:** 10.88.150.5/29
- **Role:** Honeypot/Deception network
- **Specs:** 2 vCPU, 4GB RAM, 32GB disk
- **Tools:** Honeypot and deception technology
- **Purpose:**
  - Honeypot deployment
  - Attacker tracking
  - Threat intelligence gathering
  - Deception network operations

## Post-Deployment Setup

### 1. Complete Kali Linux Installation

For each VM (900-903):

1. Access VM console via Proxmox web UI: https://10.88.140.164:8006
2. Boot from Kali Linux ISO
3. Follow installation wizard:
   - Language/Locale: English (US)
   - Hostname: Use designated name (red-kali-server, blue-kali-server, etc.)
   - Domain: sentinel-forge.local
   - Root password: (Set secure password)
   - Partition: Guided - use entire disk
   - Install GRUB: Yes

### 2. Network Configuration

After installation, configure static IP for each VM:

```bash
# Edit /etc/network/interfaces
auto eth0
iface eth0 inet static
    address <VM_IP>
    netmask 255.255.255.248
    gateway 10.88.150.1
    dns-nameservers 8.8.8.8 8.8.4.4

# Restart networking
systemctl restart networking
```

**VM IP Assignments:**
- red-kali-server: 10.88.150.2
- blue-kali-server: 10.88.150.3
- purple-kali-server: 10.88.150.4
- green-kali-server: 10.88.150.5

### 3. Initial Security Hardening

Run on all VMs:

```bash
# Update system
apt update && apt upgrade -y

# Install essential tools
apt install -y qemu-guest-agent vim tmux htop

# Enable QEMU guest agent
systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent

# Configure SSH (if needed)
systemctl enable ssh
systemctl start ssh

# Set up firewall
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.88.150.0/29  # Allow Sentinel Forge network
ufw enable
```

### 4. Role-Specific Tool Installation

#### Red Team (VM 900)

```bash
# Additional offensive tools
apt install -y metasploit-framework sqlmap nikto wpscan

# Update Metasploit database
msfdb init
```

#### Blue Team (VM 901)

```bash
# Defensive and monitoring tools
apt install -y suricata zeek wireshark tcpdump

# Configure Suricata
suricata-update
systemctl enable suricata
```

#### Purple Team (VM 902)

```bash
# Coordination tools
apt install -y docker.io docker-compose ansible

# Enable Docker
systemctl enable docker
systemctl start docker
```

#### Green Team (VM 903)

```bash
# Honeypot tools
apt install -y cowrie dionaea

# Configure honeypots (separate documentation)
```

## Security Testing Workflows

### Purple Team Exercises

1. **Exercise Planning:** Coordinate on purple-kali-server (902)
2. **Attack Execution:** Launch from red-kali-server (900)
3. **Defense Monitoring:** Monitor from blue-kali-server (901)
4. **Deception Layer:** Honeypots on green-kali-server (903)
5. **Analysis:** Collect metrics on purple-kali-server (902)

### Network Flow

```
Attacker → Red Team (900) → Target Systems
                ↓
         Green Team (903) - Honeypots detect
                ↓
         Blue Team (901) - Defense responds
                ↓
         Purple Team (902) - Coordinates & analyzes
```

## Monitoring & Metrics

### VM Health Checks

```bash
# Check all Sentinel Forge VMs
for vm_id in 900 901 902 903; do
    pvesh get /nodes/pve01/qemu/${vm_id}/status/current
done
```

### Network Connectivity

```bash
# Ping all VMs from purple team coordinator
ping -c 1 10.88.150.2  # Red
ping -c 1 10.88.150.3  # Blue
ping -c 1 10.88.150.5  # Green
```

## Backup & Recovery

### VM Snapshots

```bash
# Create snapshot before exercises
pvesh create /nodes/pve01/qemu/900/snapshot -snapname pre-exercise-$(date +%Y%m%d)
pvesh create /nodes/pve01/qemu/901/snapshot -snapname pre-exercise-$(date +%Y%m%d)
pvesh create /nodes/pve01/qemu/902/snapshot -snapname pre-exercise-$(date +%Y%m%d)
pvesh create /nodes/pve01/qemu/903/snapshot -snapname pre-exercise-$(date +%Y%m%d)
```

### VM Backup

```bash
# Backup all Sentinel Forge VMs
vzdump 900 901 902 903 --compress zstd --mode snapshot
```

## Access Information

### Proxmox Web UI
- **URL:** https://10.88.140.164:8006
- **Node:** pve01
- **VMs:** 900, 901, 902, 903

### VM Console Access
- Access via Proxmox web UI → VM → Console
- Or use VNC viewer (if configured)

### SSH Access (after OS installation)
```bash
ssh root@10.88.150.2  # Red team
ssh root@10.88.150.3  # Blue team
ssh root@10.88.150.4  # Purple team
ssh root@10.88.150.5  # Green team
```

## Troubleshooting

### VM Not Starting

```bash
# Check VM configuration
pvesh get /nodes/pve01/qemu/<vmid>/config

# Check VM status
pvesh get /nodes/pve01/qemu/<vmid>/status/current

# View VM logs
tail -f /var/log/pve/qemu-server/<vmid>.log
```

### Network Issues

```bash
# Check VLAN configuration on Proxmox
pvesh get /nodes/pve01/network

# Verify bridge configuration
brctl show vmbr0

# Check VLAN interface
ip link show vmbr0.150
```

### ISO Not Found

If Kali Linux ISO is not available:

```bash
# Upload ISO to Proxmox
cd /var/lib/vz/template/iso/
wget https://cdimage.kali.org/kali-2024.3/kali-linux-2024.3-installer-amd64.iso
```

## Maintenance Schedule

- **Daily:** Health checks via Proxmox
- **Weekly:** System updates on all VMs
- **Monthly:** Full backup of all VMs
- **Quarterly:** Security tool updates and testing

## Decommissioning

To remove Sentinel Forge infrastructure:

```bash
# Stop all VMs
for vm_id in 900 901 902 903; do
    pvesh create /nodes/pve01/qemu/${vm_id}/status/stop
done

# Delete VMs (after backup!)
for vm_id in 900 901 902 903; do
    pvesh delete /nodes/pve01/qemu/${vm_id}
done
```

## Related Documentation

- [Proxmox VE Documentation](https://pve.proxmox.com/pve-docs/)
- [Kali Linux Documentation](https://www.kali.org/docs/)
- [Cortex Security Master Guide](/docs/security/)

---

**Deployed by:** Cortex CI/CD Master (Autonomous)
**Infrastructure:** Proxmox VE (pve01)
**Project:** Sentinel Forge Security Testing Lab
