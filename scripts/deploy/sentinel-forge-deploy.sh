#!/usr/bin/env bash
################################################################################
# Sentinel Forge Security Testing Infrastructure Deployment
# Creates 4 Kali Linux VMs via Proxmox API for Red/Blue/Purple/Green Teams
################################################################################

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${PURPLE}========================================${NC}"; echo -e "${PURPLE}$1${NC}"; echo -e "${PURPLE}========================================${NC}\n"; }

################################################################################
# Proxmox Configuration
################################################################################

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_TOKEN_ID="root@pam!cortex-deploy"
PROXMOX_TOKEN_VALUE="15d84996-1afe-4c00-9e5c-c6c5aa12da33"

# API base URL
API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
# Note: Use single quotes to prevent shell interpretation of special characters
AUTH_TOKEN="${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_VALUE}"

################################################################################
# Sentinel Forge VM Configurations
################################################################################

declare -A VM_CONFIG=(
    # Red Team - Offensive Security
    [900_ID]=900
    [900_NAME]="red-kali-server"
    [900_IP]="10.88.150.2"
    [900_ROLE]="Offensive/Red Team operations"
    [900_COLOR]="${RED}"

    # Blue Team - Defensive Security
    [901_ID]=901
    [901_NAME]="blue-kali-server"
    [901_IP]="10.88.150.3"
    [901_ROLE]="Defensive/Blue Team operations"
    [901_COLOR]="${BLUE}"

    # Purple Team - Control/Coordination
    [902_ID]=902
    [902_NAME]="purple-kali-server"
    [902_IP]="10.88.150.4"
    [902_ROLE]="Purple Team/Control/Coordination"
    [902_COLOR]="${PURPLE}"

    # Green Team - Honeypot/Deception
    [903_ID]=903
    [903_NAME]="green-kali-server"
    [903_IP]="10.88.150.5"
    [903_ROLE]="Honeypot/Deception network"
    [903_COLOR]="${GREEN}"
)

# Common network settings
VLAN_ID=150
BRIDGE="vmbr0"
VLAN_TAG="${BRIDGE}.${VLAN_ID}"
GATEWAY="10.88.150.1"
NETMASK="255.255.255.248"  # /29
CIDR=29

# Common VM specs
CPU_CORES=2
MEMORY_MB=4096
DISK_SIZE="32"  # GB
STORAGE="local-lvm"

# Kali Linux ISO (user must upload to Proxmox)
KALI_ISO="local:iso/kali-linux-2024.3-installer-amd64.iso"

################################################################################
# API Functions
################################################################################

api_call() {
    local method=$1
    local endpoint=$2
    local data=${3:-}

    if [ -n "$data" ]; then
        curl -k -s -X "$method" \
            -H "Authorization: PVEAPIToken=${AUTH_TOKEN}" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "$data" \
            "${API_BASE}${endpoint}"
    else
        curl -k -s -X "$method" \
            -H "Authorization: PVEAPIToken=${AUTH_TOKEN}" \
            "${API_BASE}${endpoint}"
    fi
}

check_api_connectivity() {
    log_info "Checking Proxmox API connectivity..."

    local response
    response=$(api_call GET "/version" 2>/dev/null || echo '{"data":null}')

    if echo "$response" | jq -e '.data.version' >/dev/null 2>&1; then
        local version
        version=$(echo "$response" | jq -r '.data.version')
        log_success "Connected to Proxmox VE ${version}"
        return 0
    else
        log_error "Failed to connect to Proxmox API at ${PROXMOX_HOST}:${PROXMOX_PORT}"
        log_error "Response: $response"
        exit 1
    fi
}

vm_exists() {
    local vmid=$1
    local response
    response=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current" 2>/dev/null || echo '{"data":null}')

    if echo "$response" | jq -e '.data' >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

################################################################################
# VM Creation Functions
################################################################################

create_kali_vm() {
    local vm_id=$1
    local vm_name=$2
    local ip_address=$3
    local role=$4
    local color=$5

    log_section "Creating ${vm_name} (VM ${vm_id})"
    echo -e "${color}Role: ${role}${NC}"
    echo -e "IP: ${ip_address}/${CIDR}"
    echo ""

    # Check if VM already exists
    if vm_exists "$vm_id"; then
        log_warn "VM ${vm_id} already exists!"
        read -p "Destroy and recreate? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            log_info "Stopping VM ${vm_id}..."
            api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/status/stop" || true
            sleep 5

            log_info "Destroying VM ${vm_id}..."
            api_call DELETE "/nodes/${PROXMOX_NODE}/qemu/${vm_id}"
            sleep 3
        else
            log_warn "Skipping VM ${vm_id}"
            return 0
        fi
    fi

    # Create VM with proper QEMU parameters
    log_info "Creating VM ${vm_id}..."

    local create_data="vmid=${vm_id}"
    create_data+="&name=${vm_name}"
    create_data+="&cores=${CPU_CORES}"
    create_data+="&memory=${MEMORY_MB}"
    create_data+="&sockets=1"
    create_data+="&cpu=host"
    create_data+="&ostype=l26"  # Linux 2.6+ kernel
    create_data+="&scsihw=virtio-scsi-pci"
    create_data+="&agent=1"

    local create_response
    create_response=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu" "$create_data")

    if ! echo "$create_response" | jq -e '.data' >/dev/null 2>&1; then
        log_error "Failed to create VM: $(echo "$create_response" | jq -r '.errors // .message // "Unknown error"')"
        return 1
    fi

    log_success "VM container created"
    sleep 2

    # Add disk
    log_info "Adding ${DISK_SIZE}GB disk..."
    local disk_data="scsi0=${STORAGE}:${DISK_SIZE},format=raw,cache=writeback"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "$disk_data"

    # Add network interface with VLAN tag
    log_info "Configuring network on VLAN ${VLAN_ID}..."
    local net_data="net0=virtio,bridge=${BRIDGE},tag=${VLAN_ID},firewall=0"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "$net_data"

    # Add Kali Linux ISO as CD-ROM
    log_info "Attaching Kali Linux ISO..."
    local cdrom_data="ide2=${KALI_ISO},media=cdrom"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "$cdrom_data"

    # Set boot order (must be done after devices are created)
    log_info "Setting boot order..."
    local boot_data="boot=order=ide2;scsi0"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "$boot_data"

    # Set description
    local description="Sentinel Forge - ${role}%0AIP: ${ip_address}/${CIDR}%0AGateway: ${GATEWAY}%0AVLAN: ${VLAN_ID}%0ADeployed: $(date)"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "description=${description}"

    log_success "${color}VM ${vm_id} (${vm_name}) created successfully${NC}"

    return 0
}

start_vm() {
    local vm_id=$1
    local vm_name=$2

    log_info "Starting VM ${vm_id} (${vm_name})..."

    local response
    response=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/status/start")

    if echo "$response" | jq -e '.data' >/dev/null 2>&1; then
        log_success "VM ${vm_id} started"
        return 0
    else
        log_error "Failed to start VM ${vm_id}"
        echo "$response" | jq .
        return 1
    fi
}

check_vm_status() {
    local vm_id=$1

    local response
    response=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/status/current")

    if echo "$response" | jq -e '.data' >/dev/null 2>&1; then
        local status
        status=$(echo "$response" | jq -r '.data.status')
        echo "$status"
        return 0
    else
        echo "unknown"
        return 1
    fi
}

################################################################################
# Network Verification
################################################################################

verify_network() {
    local vm_id=$1
    local ip_address=$2
    local vm_name=$3

    log_info "Verifying network connectivity for ${vm_name} (${ip_address})..."

    # Try ping (will likely fail until OS is installed and configured)
    if timeout 3 ping -c 1 "$ip_address" >/dev/null 2>&1; then
        log_success "VM ${vm_id} is reachable via ping"
        return 0
    else
        log_warn "VM ${vm_id} not yet reachable (OS installation required)"
        return 1
    fi
}

################################################################################
# Documentation Generation
################################################################################

generate_documentation() {
    local doc_file="/Users/ryandahlberg/Projects/cortex/docs/deployment/SENTINEL-FORGE-INFRASTRUCTURE.md"

    log_info "Generating infrastructure documentation..."

    mkdir -p "$(dirname "$doc_file")"

    cat > "$doc_file" <<'EOF'
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
EOF

    log_success "Documentation generated: ${doc_file}"
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    log_section "Sentinel Forge Security Testing Infrastructure Deployment"

    echo "This script will create 4 Kali Linux VMs on Proxmox:"
    echo ""
    echo -e "${RED}  VM 900 - red-kali-server   (10.88.150.2) - Red Team${NC}"
    echo -e "${BLUE}  VM 901 - blue-kali-server  (10.88.150.3) - Blue Team${NC}"
    echo -e "${PURPLE}  VM 902 - purple-kali-server (10.88.150.4) - Purple Team${NC}"
    echo -e "${GREEN}  VM 903 - green-kali-server (10.88.150.5) - Green Team${NC}"
    echo ""
    echo "Network: VLAN ${VLAN_ID} (${GATEWAY}/29)"
    echo "Proxmox: ${PROXMOX_HOST} (node: ${PROXMOX_NODE})"
    echo ""

    read -p "Continue with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warn "Deployment cancelled"
        exit 0
    fi

    # Check API connectivity
    check_api_connectivity

    # Create all VMs
    local vm_ids=(900 901 902 903)
    local created_vms=()

    for vm_id in "${vm_ids[@]}"; do
        local name="${VM_CONFIG[${vm_id}_NAME]}"
        local ip="${VM_CONFIG[${vm_id}_IP]}"
        local role="${VM_CONFIG[${vm_id}_ROLE]}"
        local color="${VM_CONFIG[${vm_id}_COLOR]}"

        if create_kali_vm "$vm_id" "$name" "$ip" "$role" "$color"; then
            created_vms+=("$vm_id")
        fi
    done

    # Start all VMs
    log_section "Starting All VMs"

    for vm_id in "${created_vms[@]}"; do
        local name="${VM_CONFIG[${vm_id}_NAME]}"
        start_vm "$vm_id" "$name"
        sleep 2
    done

    # Check status
    log_section "VM Status Summary"

    echo -e "\n${CYAN}VM Status:${NC}\n"
    printf "%-6s %-20s %-15s %-10s %s\n" "VM ID" "Hostname" "IP Address" "Status" "Role"
    printf "%-6s %-20s %-15s %-10s %s\n" "-----" "--------" "----------" "------" "----"

    for vm_id in "${vm_ids[@]}"; do
        local name="${VM_CONFIG[${vm_id}_NAME]}"
        local ip="${VM_CONFIG[${vm_id}_IP]}"
        local role="${VM_CONFIG[${vm_id}_ROLE]}"
        local status
        status=$(check_vm_status "$vm_id")

        printf "%-6s %-20s %-15s %-10s %s\n" "$vm_id" "$name" "$ip" "$status" "$role"
    done

    echo ""

    # Generate documentation
    generate_documentation

    # Final summary
    log_section "Deployment Complete!"

    cat <<EOF

${GREEN}Sentinel Forge infrastructure successfully deployed!${NC}

${CYAN}Next Steps:${NC}

1. ${YELLOW}Complete Kali Linux Installation${NC}
   - Access Proxmox web UI: https://${PROXMOX_HOST}:${PROXMOX_PORT}
   - Open each VM console (900, 901, 902, 903)
   - Follow Kali Linux installation wizard
   - Configure network settings (see documentation)

2. ${YELLOW}Configure Static IPs${NC}
   - red-kali-server:    10.88.150.2/29
   - blue-kali-server:   10.88.150.3/29
   - purple-kali-server: 10.88.150.4/29
   - green-kali-server:  10.88.150.5/29
   - Gateway: ${GATEWAY}

3. ${YELLOW}Install Role-Specific Tools${NC}
   - See documentation for tool installation guides

4. ${YELLOW}Run Security Hardening${NC}
   - Update systems
   - Configure firewalls
   - Enable QEMU guest agent

${CYAN}Documentation:${NC}
   /Users/ryandahlberg/Projects/cortex/docs/deployment/SENTINEL-FORGE-INFRASTRUCTURE.md

${CYAN}Proxmox Access:${NC}
   https://${PROXMOX_HOST}:${PROXMOX_PORT}

${GREEN}Happy hunting! 🎯${NC}

EOF
}

# Run main deployment
main "$@"
