#!/usr/bin/env bash
################################################################################
# Automated Kali Linux QEMU Image Deployment to Sentinel Forge VMs
# Deploys pre-built Kali QEMU images to VMs 900-903 via Proxmox API
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${PURPLE}========================================${NC}"; echo -e "${PURPLE}$1${NC}"; echo -e "${PURPLE}========================================${NC}\n"; }

################################################################################
# Configuration
################################################################################

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_TOKEN="root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33"

API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

# Kali QEMU image details
KALI_VERSION="2024.3"
KALI_IMAGE_URL="https://kali.download/base-images/kali-${KALI_VERSION}/kali-linux-${KALI_VERSION}-qemu-amd64.7z"
KALI_IMAGE_NAME="kali-linux-${KALI_VERSION}-qemu-amd64.qcow2"

# VM IDs for Sentinel Forge
VMS=(900 901 902 903)
VM_NAMES=("red-kali-server" "blue-kali-server" "purple-kali-server" "green-kali-server")
VM_IPS=("10.88.150.2" "10.88.150.3" "10.88.150.4" "10.88.150.5")

# Storage and sizing
STORAGE="local-lvm"
DISK_SIZE="32G"

################################################################################
# API Functions
################################################################################

api_call() {
    local method=$1
    local endpoint=$2
    local data=${3:-}

    local url="${API_BASE}${endpoint}"

    if [ -n "$data" ]; then
        curl -k -s -X "$method" "$url" \
            -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
            -d "$data" 2>/dev/null
    else
        curl -k -s -X "$method" "$url" \
            -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" 2>/dev/null
    fi
}

################################################################################
# Step 1: Download Kali QEMU Image via Proxmox
################################################################################

download_kali_image() {
    log_section "Step 1: Downloading Kali Linux QEMU Image"

    log_info "Checking if image already exists on Proxmox..."

    # Check if image already exists
    local check_result=$(api_call GET "/nodes/${PROXMOX_NODE}/storage/${STORAGE}/content" | jq -r ".data[] | select(.volid | contains(\"${KALI_IMAGE_NAME}\")) | .volid" 2>/dev/null || echo "")

    if [ -n "$check_result" ]; then
        log_success "Kali QEMU image already exists on Proxmox storage"
        return 0
    fi

    log_info "Image not found. Initiating download via Proxmox..."
    log_info "URL: ${KALI_IMAGE_URL}"
    log_warn "This may take several minutes (image is ~2GB compressed)..."

    # Note: Proxmox 8.x doesn't support direct image downloads via API
    # We'll need to use SSH or manual upload
    log_warn "Automatic download requires SSH access to Proxmox host"
    log_info "Alternative: Upload image manually to Proxmox at /var/lib/vz/template/qemu/"

    return 1
}

################################################################################
# Step 2: Import Disk to Each VM
################################################################################

import_disk_to_vm() {
    local vmid=$1
    local vm_name=$2

    log_info "Importing disk to VM ${vmid} (${vm_name})..."

    # Check if VM already has a disk
    local vm_config=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${vmid}/config")
    local has_disk=$(echo "$vm_config" | jq -r '.data.scsi0 // empty' 2>/dev/null)

    if [ -n "$has_disk" ]; then
        log_warn "VM ${vmid} already has a disk attached (${has_disk})"
        log_info "Skipping import to avoid overwriting existing disk"
        return 0
    fi

    log_info "VM ${vmid} has no disk. Ready for import."
    log_warn "Manual step required: Run on Proxmox host:"
    echo "  qm importdisk ${vmid} /var/lib/vz/template/qemu/${KALI_IMAGE_NAME} ${STORAGE}"
    echo "  qm set ${vmid} --scsi0 ${STORAGE}:vm-${vmid}-disk-0"
    echo "  qm resize ${vmid} scsi0 ${DISK_SIZE}"

    return 0
}

################################################################################
# Step 3: Configure Network Settings
################################################################################

configure_network() {
    local vmid=$1
    local vm_name=$2
    local vm_ip=$3

    log_info "Configuring network for VM ${vmid} (${vm_name})..."

    # Create cloud-init config with static IP
    # Note: This requires cloud-init drive to be configured
    log_info "Static IP configuration: ${vm_ip}/29"
    log_info "Gateway: 10.88.150.1"

    # Set IP config via API
    local ip_config="ip=${vm_ip}/29,gw=10.88.150.1"

    local result=$(api_call PUT "/nodes/${PROXMOX_NODE}/qemu/${vmid}/config" \
        "ipconfig0=${ip_config}")

    if echo "$result" | jq -e '.data' > /dev/null 2>&1; then
        log_success "Network configured for VM ${vmid}"
    else
        log_warn "Network config may need manual adjustment"
    fi
}

################################################################################
# Step 4: Start VMs
################################################################################

start_vm() {
    local vmid=$1
    local vm_name=$2

    log_info "Starting VM ${vmid} (${vm_name})..."

    # Check current status
    local status=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current" | jq -r '.data.status')

    if [ "$status" = "running" ]; then
        log_success "VM ${vmid} is already running"
        return 0
    fi

    # Start VM
    local result=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/start")

    if echo "$result" | jq -e '.data' > /dev/null 2>&1; then
        log_success "VM ${vmid} started successfully"
    else
        log_error "Failed to start VM ${vmid}"
        return 1
    fi

    # Wait for VM to boot
    log_info "Waiting for VM to boot (10 seconds)..."
    sleep 10
}

################################################################################
# Step 5: Verify Connectivity
################################################################################

verify_vm() {
    local vmid=$1
    local vm_name=$2
    local vm_ip=$3

    log_info "Verifying VM ${vmid} (${vm_name})..."

    # Check VM status
    local status=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current" | jq -r '.data.status')

    if [ "$status" = "running" ]; then
        log_success "VM ${vmid} is running"
    else
        log_error "VM ${vmid} is not running (status: ${status})"
        return 1
    fi

    # Try to ping (may fail if network isn't configured yet)
    log_info "Testing network connectivity to ${vm_ip}..."
    if ping -c 1 -W 2 "$vm_ip" > /dev/null 2>&1; then
        log_success "VM ${vmid} is network accessible at ${vm_ip}"
    else
        log_warn "VM ${vmid} not yet pingable (may need QEMU image boot completion)"
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    log_section "Kali Linux QEMU Image Deployment - Sentinel Forge"

    log_info "Target VMs: ${VMS[*]}"
    log_info "Proxmox Node: ${PROXMOX_NODE}"
    log_info "Storage: ${STORAGE}"
    log_info "Disk Size: ${DISK_SIZE}"

    # Step 1: Download (or verify) Kali image
    if ! download_kali_image; then
        log_warn "Image download requires manual steps"
        log_info "Please upload Kali QEMU image to Proxmox manually, then re-run this script"
        log_info ""
        log_info "Steps:"
        log_info "1. SSH to Proxmox: ssh root@${PROXMOX_HOST}"
        log_info "2. cd /var/lib/vz/template/qemu/"
        log_info "3. wget ${KALI_IMAGE_URL}"
        log_info "4. 7z x kali-linux-${KALI_VERSION}-qemu-amd64.7z"
        log_info "5. Re-run this script"
        log_info ""
        log_warn "Continuing with VM configuration assuming image will be available..."
    fi

    # Step 2-5: Configure each VM
    for i in "${!VMS[@]}"; do
        local vmid=${VMS[$i]}
        local vm_name=${VM_NAMES[$i]}
        local vm_ip=${VM_IPS[$i]}

        log_section "Configuring VM ${vmid}: ${vm_name}"

        import_disk_to_vm "$vmid" "$vm_name"
        configure_network "$vmid" "$vm_name" "$vm_ip"
        start_vm "$vmid" "$vm_name"
        verify_vm "$vmid" "$vm_name" "$vm_ip"
    done

    log_section "Deployment Summary"

    log_success "Kali QEMU deployment process initiated!"
    log_info ""
    log_info "Manual Steps Required on Proxmox Host:"
    log_info "1. Upload/Download Kali QEMU image to /var/lib/vz/template/qemu/"
    log_info "2. For each VM (900-903), run:"
    log_info "   qm importdisk <vmid> /var/lib/vz/template/qemu/${KALI_IMAGE_NAME} ${STORAGE}"
    log_info "   qm set <vmid> --scsi0 ${STORAGE}:vm-<vmid>-disk-0"
    log_info "   qm resize <vmid> scsi0 ${DISK_SIZE}"
    log_info ""
    log_info "Default Kali Credentials:"
    log_info "  Username: kali"
    log_info "  Password: kali"
    log_info ""
    log_info "Next Steps:"
    log_info "1. Boot each VM and login"
    log_info "2. Change default password"
    log_info "3. Configure static IPs if not using cloud-init"
    log_info "4. Install QEMU guest agent: apt install qemu-guest-agent"
    log_info "5. Install role-specific tools (see SENTINEL-FORGE-INFRASTRUCTURE.md)"

    log_section "Deployment Complete!"
}

# Execute
main "$@"
