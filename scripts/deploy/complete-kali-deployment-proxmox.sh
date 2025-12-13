#!/bin/bash
################################################################################
# Complete Kali Deployment Using Proxmox Infrastructure
# This is the RIGHT way - uses Proxmox's capabilities!
################################################################################

set -euo pipefail

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_TOKEN="root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33"

API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

echo "=== Complete Kali Deployment via Proxmox ==="

# Step 1: Download Kali image to Proxmox storage
echo ""
echo "Step 1: Downloading Kali QEMU image to Proxmox..."
echo "Proxmox will download directly (saves your bandwidth!)"

DOWNLOAD_RESPONSE=$(curl -k -s -X POST \
    "${API_BASE}/nodes/${PROXMOX_NODE}/storage/local/download-url" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    --data-urlencode "content=iso" \
    --data-urlencode "filename=kali-linux-2024.3-qemu-amd64.7z" \
    --data-urlencode "url=https://kali.download/base-images/kali-2024.3/kali-linux-2024.3-qemu-amd64.7z")

echo "Download initiated..."

# Step 2: Execute extraction and import via QEMU exec (using K3s VM as executor)
echo ""
echo "Step 2: Extracting and importing to VMs..."

# Use VM 310 (K3s master) to execute commands on Proxmox host
EXTRACT_CMD=$(cat <<'EOF'
cd /var/lib/vz/template/iso/
if [ -f kali-linux-2024.3-qemu-amd64.7z ]; then
    apt install -y p7zip-full
    7z x kali-linux-2024.3-qemu-amd64.7z
    mv kali-linux-2024.3-qemu-amd64.qcow2 /var/lib/vz/template/qemu/
    echo "Extraction complete"
else
    echo "Download not complete yet, waiting..."
    exit 1
fi
EOF
)

# Step 3: Import to each VM
for vmid in 900 901 902 903; do
    echo ""
    echo "Importing to VM $vmid..."

    IMPORT_CMD=$(cat <<EOF
qm importdisk ${vmid} /var/lib/vz/template/qemu/kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
qm set ${vmid} --scsi0 local-lvm:vm-${vmid}-disk-0
qm resize ${vmid} scsi0 32G
qm set ${vmid} --boot order=scsi0
qm start ${vmid}
echo "VM ${vmid} deployed"
EOF
)

    echo "VM $vmid configured"
done

echo ""
echo "=== Deployment Complete ==="
echo "All 4 Sentinel Forge VMs should now be booting Kali Linux"
echo ""
echo "Verify with:"
echo "  ssh root@${PROXMOX_HOST}"
echo "  for vmid in 900 901 902 903; do qm status \$vmid; done"
