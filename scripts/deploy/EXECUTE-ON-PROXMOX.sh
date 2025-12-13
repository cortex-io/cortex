#!/bin/bash
################################################################################
# EXECUTE THIS SCRIPT ON PROXMOX HOST (pve01)
# Copy and paste this entire script into Proxmox web UI shell
################################################################################

set -e

echo "=================================================================="
echo "Kali Linux 2024.3 Deployment to Sentinel Forge VMs (900-903)"
echo "=================================================================="

# Step 1: Download and Extract Kali Image
echo
echo "[1/4] Downloading Kali Linux QEMU image..."
cd /var/lib/vz/template/qemu

if [ -f "kali-linux-2024.3-qemu-amd64.qcow2" ]; then
    echo "✓ Kali image already extracted"
    ls -lh kali-linux-2024.3-qemu-amd64.qcow2
else
    if [ ! -f "kali-linux-2024.3-qemu-amd64.7z" ]; then
        echo "Downloading from Kali.org..."
        wget -c "https://kali.download/base-images/kali-2024.3/kali-linux-2024.3-qemu-amd64.7z"
    fi

    echo "Installing p7zip..."
    apt-get update > /dev/null && apt-get install -y p7zip-full > /dev/null

    echo "Extracting archive (this may take a few minutes)..."
    7z x kali-linux-2024.3-qemu-amd64.7z

    echo "✓ Extraction complete"
    ls -lh kali-linux-2024.3-qemu-amd64.qcow2
fi

# Step 2: Import Disk to VM 900 (Red Team)
echo
echo "[2/4] Importing disk to VM 900 (red-kali-server)..."
qm importdisk 900 kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
qm set 900 --scsi0 local-lvm:vm-900-disk-1
qm set 900 --boot order=scsi0
qm set 900 --description "Kali Linux 2024.3 - Red Team Operations"
echo "✓ VM 900 configured"

# Step 3: Import Disk to VM 901 (Blue Team)
echo
echo "[3/4] Importing disk to VM 901 (blue-kali-server)..."
qm importdisk 901 kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
qm set 901 --scsi0 local-lvm:vm-901-disk-1
qm set 901 --boot order=scsi0
qm set 901 --description "Kali Linux 2024.3 - Blue Team Defensive"
echo "✓ VM 901 configured"

# Step 4: Import Disk to VM 902 (Purple Team)
echo
echo "[4/4] Importing disk to VM 902 (purple-kali-server)..."
qm importdisk 902 kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
qm set 902 --scsi0 local-lvm:vm-902-disk-1
qm set 902 --boot order=scsi0
qm set 902 --description "Kali Linux 2024.3 - Purple Team Coordination"
echo "✓ VM 902 configured"

# Step 5: Import Disk to VM 903 (Green Team)
echo
echo "[5/5] Importing disk to VM 903 (green-kali-server)..."
qm importdisk 903 kali-linux-2024.3-qemu-amd64.qcow2 local-lvm
qm set 903 --scsi0 local-lvm:vm-903-disk-1
qm set 903 --boot order=scsi0
qm set 903 --description "Kali Linux 2024.3 - Green Team Honeypot"
echo "✓ VM 903 configured"

# Step 6: Start All VMs
echo
echo "Starting all Sentinel Forge VMs..."
qm start 900 && echo "✓ VM 900 started"
sleep 2
qm start 901 && echo "✓ VM 901 started"
sleep 2
qm start 902 && echo "✓ VM 902 started"
sleep 2
qm start 903 && echo "✓ VM 903 started"

# Step 7: Verify Status
echo
echo "=================================================================="
echo "Deployment Complete - Verification"
echo "=================================================================="
echo

for vmid in 900 901 902 903; do
    echo "VM ${vmid}:"
    qm config ${vmid} | grep -E "(name|scsi0|boot|description)" | sed 's/^/  /'
    qm status ${vmid} | sed 's/^/  /'
    echo
done

echo "=================================================================="
echo "SUCCESS!"
echo "=================================================================="
echo
echo "All Sentinel Forge VMs are now running Kali Linux 2024.3"
echo
echo "Next Steps:"
echo "  1. Access VMs via Proxmox web console"
echo "  2. Default login: kali / kali"
echo "  3. Change default passwords immediately!"
echo "  4. Configure SSH keys for remote access"
echo "  5. Update system: apt update && apt upgrade"
echo
echo "Network Configuration:"
echo "  VLAN: 150"
echo "  Subnet: 10.88.150.0/29"
echo "  Gateway: 10.88.150.1"
echo
echo "VM IP Assignments:"
echo "  VM 900 (Red):    10.88.150.2"
echo "  VM 901 (Blue):   10.88.150.3"
echo "  VM 902 (Purple): 10.88.150.4"
echo "  VM 903 (Green):  10.88.150.5"
echo
echo "=================================================================="
