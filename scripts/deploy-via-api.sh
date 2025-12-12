#!/usr/bin/env bash
################################################################################
# Deploy Cortex to Proxmox via API (No SSH Required!)
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"

# Proxmox API config
PROXMOX_HOST="10.88.140.151"
PROXMOX_PORT="8006"
PROXMOX_USER="root@pam"
PROXMOX_TOKEN_NAME="cortex-automation"
PROXMOX_TOKEN_VALUE="8d1d247d-7798-4c02-b4a1-9ec74b90f5d9"

API_URL="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
AUTH_HEADER="Authorization: PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}"

log_section "Cortex Deployment via Proxmox API"

# Container config
CTID=101
HOSTNAME="cortex"
OSTEMPLATE="local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst"
STORAGE="local-lvm"
MEMORY=4096
CORES=4
DISK="20"
IP="10.88.140.159/24"
GATEWAY="10.88.140.1"
BRIDGE="vmbr0"
PASSWORD="cortex123"  # Change this!

log_info "Creating LXC container via API..."

# Check if container exists
if curl -s -k -H "${AUTH_HEADER}" "${API_URL}/nodes/pve01/lxc/${CTID}/status/current" 2>/dev/null | grep -q "data"; then
    log_warn "Container ${CTID} already exists!"
    echo "Would you like to destroy and recreate it? This will delete all data!"
    read -p "Type 'yes' to continue: " confirm
    if [ "$confirm" = "yes" ]; then
        log_info "Stopping container..."
        curl -s -k -X POST -H "${AUTH_HEADER}" "${API_URL}/nodes/pve01/lxc/${CTID}/status/stop" || true
        sleep 3

        log_info "Destroying container..."
        curl -s -k -X DELETE -H "${AUTH_HEADER}" "${API_URL}/nodes/pve01/lxc/${CTID}"
        sleep 2
    else
        log_error "Cancelled"
        exit 1
    fi
fi

# Create container
log_info "Creating container ${CTID}..."
CREATE_RESPONSE=$(curl -s -k -X POST -H "${AUTH_HEADER}" \
    "${API_URL}/nodes/pve01/lxc" \
    -d "vmid=${CTID}" \
    -d "ostemplate=${OSTEMPLATE}" \
    -d "hostname=${HOSTNAME}" \
    -d "memory=${MEMORY}" \
    -d "cores=${CORES}" \
    -d "rootfs=${STORAGE}:${DISK}" \
    -d "net0=name=eth0,bridge=${BRIDGE},ip=${IP},gw=${GATEWAY}" \
    -d "nameserver=8.8.8.8" \
    -d "password=${PASSWORD}" \
    -d "unprivileged=1" \
    -d "features=nesting=1" \
    -d "start=0")

if echo "$CREATE_RESPONSE" | grep -q "data"; then
    log_success "Container ${CTID} created!"
else
    log_error "Failed to create container"
    echo "$CREATE_RESPONSE"
    exit 1
fi

# Start container
log_info "Starting container..."
curl -s -k -X POST -H "${AUTH_HEADER}" "${API_URL}/nodes/pve01/lxc/${CTID}/status/start"
sleep 5

log_success "Container started!"
log_section "Next Steps"

cat <<EOF
Container ${CTID} is now running!

To complete the Cortex installation, you need to:

1. Access Proxmox web UI: https://10.88.140.151:8006
2. Open container 101 console
3. Run these commands:

   apt update && apt upgrade -y
   apt install -y curl wget git nodejs npm
   cd /opt
   git clone https://github.com/ry-ops/cortex.git
   cd cortex
   npm install
   node dashboard/server/index.js

Or use the quick setup script from the Proxmox host:
   pct enter 101
   # Then paste the installation commands

Container IP: 10.88.140.159
Dashboard will be at: http://10.88.140.159:3000
EOF

log_success "Deployment initiated!"
