#!/bin/bash
################################################################################
# Download Kali Linux QEMU Image Directly to Proxmox Storage
# Uses Proxmox download-url API - no external network access needed!
################################################################################

set -euo pipefail

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_TOKEN="root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33"

KALI_VERSION="2024.3"
KALI_URL="https://kali.download/base-images/kali-${KALI_VERSION}/kali-linux-${KALI_VERSION}-qemu-amd64.7z"
KALI_FILENAME="kali-linux-${KALI_VERSION}-qemu-amd64.7z"

echo "=== Downloading Kali Linux to Proxmox Storage ==="
echo "URL: $KALI_URL"
echo "Proxmox will download directly (no local bandwidth used)"

# Download to Proxmox local storage
echo "Initiating download..."
RESPONSE=$(curl -k -s -X POST \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/storage/local/download-url" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "content=iso" \
    --data-urlencode "filename=${KALI_FILENAME}" \
    --data-urlencode "url=${KALI_URL}")

# Check if download started
TASK=$(echo "$RESPONSE" | jq -r '.data // empty')

if [ -n "$TASK" ]; then
    echo "Download task started: $TASK"
    echo "Monitor progress in Proxmox UI or check /var/lib/vz/template/iso/"

    # Poll task status
    echo "Waiting for download to complete..."
    while true; do
        STATUS=$(curl -k -s "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/tasks/${TASK}/status" \
            -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" | jq -r '.data.status')

        if [ "$STATUS" = "stopped" ]; then
            echo "Download complete!"
            break
        fi

        echo "Status: $STATUS"
        sleep 10
    done
else
    echo "Error: Failed to start download"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""
echo "=== Next: Extract and Import ==="
echo "Run on Proxmox host:"
echo "  cd /var/lib/vz/template/iso/"
echo "  apt install -y p7zip-full"
echo "  7z x ${KALI_FILENAME}"
echo "  mv kali-linux-${KALI_VERSION}-qemu-amd64.qcow2 /var/lib/vz/template/qemu/"
echo ""
echo "Then deploy to VMs with:"
echo "  ./scripts/deploy/import-kali-to-vms.sh"
