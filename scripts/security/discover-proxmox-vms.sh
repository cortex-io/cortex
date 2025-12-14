#!/bin/bash
# Discover all VMs in Proxmox infrastructure
# Security Master - VM Discovery Script

set -euo pipefail

# Load environment variables
if [ -f "/Users/ryandahlberg/Projects/cortex/.env" ]; then
    source "/Users/ryandahlberg/Projects/cortex/.env"
else
    echo "ERROR: .env file not found"
    exit 1
fi

echo "========================================="
echo "Proxmox VM Discovery"
echo "========================================="
echo "Host: ${PROXMOX_HOST}"
echo "Node: ${PROXMOX_NODE}"
echo ""

# Get all VMs from Proxmox
echo "Querying Proxmox API for all VMs..."
curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu" | jq -r '.data[] | "\(.vmid) \(.name) \(.status)"'

echo ""
echo "========================================="
echo "VM Discovery Complete"
echo "========================================="
