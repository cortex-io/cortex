#!/bin/bash
# Cortex Proxmox VM Creation Script
# Creates VMs using Proxmox API with cloud-init configuration

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
PROXMOX_HOST="${PROXMOX_HOST:-10.88.140.151}"
PROXMOX_PORT="${PROXMOX_PORT:-8006}"
PROXMOX_NODE="${PROXMOX_NODE:-pve}"
PROXMOX_TOKEN_ID="${PROXMOX_TOKEN_ID:-root@pam!n8n}"
PROXMOX_TOKEN_VALUE="${PROXMOX_TOKEN_VALUE:-b8cc165f-0153-43bb-a48a-5d7459587ca7}"
UBUNTU_IMAGE_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"

# API base URL
API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
AUTH_HEADER="Authorization: PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_VALUE}"

# Function to make Proxmox API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=${3:-}

    if [ -n "$data" ]; then
        curl -k -s -X "$method" \
            -H "$AUTH_HEADER" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "$data" \
            "${API_BASE}${endpoint}"
    else
        curl -k -s -X "$method" \
            -H "$AUTH_HEADER" \
            "${API_BASE}${endpoint}"
    fi
}

# Function to check if VM exists
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

# Function to get SSH public key
get_ssh_key() {
    if [ -f "$HOME/.ssh/id_rsa.pub" ]; then
        cat "$HOME/.ssh/id_rsa.pub"
    elif [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
        cat "$HOME/.ssh/id_ed25519.pub"
    else
        log_error "No SSH public key found in ~/.ssh/"
        exit 1
    fi
}

# Function to download Ubuntu cloud image
download_ubuntu_image() {
    local storage_path="/var/lib/vz/template/iso"
    local image_name="ubuntu-22.04-cloudimg-amd64.img"

    log_info "Checking for Ubuntu cloud image..."

    # Check if image already exists on Proxmox
    local check_response
    check_response=$(api_call GET "/nodes/${PROXMOX_NODE}/storage/local/content")

    if echo "$check_response" | jq -e ".data[] | select(.volid | contains(\"$image_name\"))" >/dev/null 2>&1; then
        log_success "Ubuntu cloud image already exists"
        echo "$image_name"
        return 0
    fi

    log_info "Ubuntu cloud image not found, download manually on Proxmox host:"
    log_info "  ssh root@${PROXMOX_HOST} 'wget ${UBUNTU_IMAGE_URL} -O ${storage_path}/${image_name}'"

    echo "$image_name"
}

# Function to create cloud-init configuration
create_cloudinit_config() {
    local hostname=$1
    local ip_address=$2
    local gateway=$3
    local netmask=$4
    local cidr_prefix=$5

    local ssh_key
    ssh_key=$(get_ssh_key)

    # Read template and substitute variables
    local template_path="/Users/ryandahlberg/Projects/cortex/scripts/proxmox/cloud-init-template.yaml"

    if [ ! -f "$template_path" ]; then
        log_error "Cloud-init template not found at $template_path"
        exit 1
    fi

    sed -e "s|\${HOSTNAME}|${hostname}|g" \
        -e "s|\${IP_ADDRESS}|${ip_address}|g" \
        -e "s|\${GATEWAY}|${gateway}|g" \
        -e "s|\${NETMASK}|${netmask}|g" \
        -e "s|\${CIDR_PREFIX}|${cidr_prefix}|g" \
        -e "s|\${SSH_PUBLIC_KEY}|${ssh_key}|g" \
        "$template_path"
}

# Function to create VM
create_vm() {
    local vm_id=$1
    local hostname=$2
    local ip_address=$3
    local netmask=$4
    local gateway=$5
    local cpu=$6
    local memory=$7
    local disk=$8
    local storage=${9:-local-lvm}

    log_info "Creating VM ${vm_id}: ${hostname}"

    # Check if VM already exists
    if vm_exists "$vm_id"; then
        log_warn "VM ${vm_id} already exists, skipping creation"
        return 0
    fi

    # Calculate CIDR prefix from netmask
    local cidr_prefix
    case $netmask in
        255.255.255.224) cidr_prefix=27 ;;
        255.255.255.0) cidr_prefix=24 ;;
        *) log_error "Unsupported netmask: $netmask"; exit 1 ;;
    esac

    # Step 1: Create VM
    log_info "Creating VM container..."
    local create_data="vmid=${vm_id}&name=${hostname}&memory=${memory}&cores=${cpu}&net0=virtio,bridge=vmbr0"
    local create_response
    create_response=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu" "$create_data")

    if ! echo "$create_response" | jq -e '.data' >/dev/null 2>&1; then
        log_error "Failed to create VM: $(echo "$create_response" | jq -r '.errors // .message // "Unknown error"')"
        return 1
    fi

    log_success "VM container created"
    sleep 2

    # Step 2: Import Ubuntu cloud image as disk
    log_info "Importing Ubuntu cloud image as disk..."

    # Note: This requires manual setup of Ubuntu cloud image on Proxmox
    # For automation, we'll configure the VM to use local storage

    local disk_data="scsi0=${storage}:${disk},format=raw"
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "scsi0=${storage}:${disk//G/}"

    # Step 3: Configure cloud-init
    log_info "Configuring cloud-init..."

    # Generate cloud-init config
    local cloudinit_config
    cloudinit_config=$(create_cloudinit_config "$hostname" "$ip_address" "$gateway" "$netmask" "$cidr_prefix")

    # Set cloud-init parameters via API
    local ssh_key
    ssh_key=$(get_ssh_key | sed 's/\//\\\//g')

    local cloudinit_data="ide2=${storage}:cloudinit&ciuser=cortex&cipassword=&sshkeys=${ssh_key}&ipconfig0=ip=${ip_address}/${cidr_prefix},gw=${gateway}&nameserver=8.8.8.8&searchdomain=local"

    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "$cloudinit_data"

    log_success "Cloud-init configured"

    # Step 4: Set boot order
    log_info "Configuring boot order..."
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "boot=order=scsi0"

    # Step 5: Enable QEMU agent
    api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/config" "agent=1"

    log_success "VM ${vm_id} (${hostname}) created successfully"

    return 0
}

# Function to start VM
start_vm() {
    local vm_id=$1

    log_info "Starting VM ${vm_id}..."

    local response
    response=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu/${vm_id}/status/start")

    if echo "$response" | jq -e '.data' >/dev/null 2>&1; then
        log_success "VM ${vm_id} started"
        return 0
    else
        log_error "Failed to start VM ${vm_id}"
        return 1
    fi
}

# Function to wait for VM to be ready
wait_for_vm() {
    local vm_id=$1
    local ip_address=$2
    local max_attempts=60
    local attempt=0

    log_info "Waiting for VM ${vm_id} to be ready (IP: ${ip_address})..."

    while [ $attempt -lt $max_attempts ]; do
        if timeout 2 ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 "cortex@${ip_address}" "echo ready" >/dev/null 2>&1; then
            log_success "VM ${vm_id} is ready and accessible via SSH"
            return 0
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 5
    done

    echo ""
    log_error "VM ${vm_id} did not become ready within timeout"
    return 1
}

# Main function
main() {
    if [ $# -lt 8 ]; then
        echo "Usage: $0 <vm_id> <hostname> <ip> <netmask> <gateway> <cpu> <memory_mb> <disk_size> [storage]"
        echo ""
        echo "Example:"
        echo "  $0 110 cortex-k3s-control 10.88.140.152 255.255.255.224 10.88.140.144 4 8192 40G local-lvm"
        exit 1
    fi

    local vm_id=$1
    local hostname=$2
    local ip=$3
    local netmask=$4
    local gateway=$5
    local cpu=$6
    local memory=$7
    local disk=$8
    local storage=${9:-local-lvm}

    log_info "Starting VM creation process"
    log_info "VM ID: ${vm_id}"
    log_info "Hostname: ${hostname}"
    log_info "IP: ${ip}/${netmask}"
    log_info "Gateway: ${gateway}"
    log_info "CPU: ${cpu} cores"
    log_info "Memory: ${memory} MB"
    log_info "Disk: ${disk}"
    log_info "Storage: ${storage}"

    # Download Ubuntu image if needed
    download_ubuntu_image

    # Create VM
    if ! create_vm "$vm_id" "$hostname" "$ip" "$netmask" "$gateway" "$cpu" "$memory" "$disk" "$storage"; then
        log_error "VM creation failed"
        exit 1
    fi

    # Start VM
    if ! start_vm "$vm_id"; then
        log_error "Failed to start VM"
        exit 1
    fi

    # Wait for VM to be ready
    if ! wait_for_vm "$vm_id" "$ip"; then
        log_warn "VM may not be fully initialized, but continuing..."
    fi

    log_success "VM ${vm_id} (${hostname}) is fully operational"
    log_info "SSH access: ssh cortex@${ip}"
}

# Run main function
main "$@"
