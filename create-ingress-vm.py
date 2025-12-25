#!/usr/bin/env python3
"""
Create k3s-cluster-ingress VM via Proxmox API
Lightweight subnet router for Tailscale access to k3s cluster
"""

import requests
import time
import urllib.parse
import subprocess
import sys

# Disable SSL warnings for self-signed cert
requests.packages.urllib3.disable_warnings()

# Proxmox Configuration
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_API = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"

# VM Configuration
VMID = 350
VM_NAME = "k3s-cluster-ingress"
VM_IP = "10.88.145.199"
VM_GATEWAY = "10.88.145.1"
VM_NETMASK = "24"
VM_DNS = "8.8.8.8"
STORAGE = "local-lvm"

# Cloud image
CLOUD_IMAGE_URL = "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"

# Headers for API requests
headers = {
    "Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"
}

def api_request(method, endpoint, data=None):
    """Make API request to Proxmox"""
    url = f"{PROXMOX_API}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, verify=False)
        elif method == "POST":
            response = requests.post(url, headers=headers, data=data, verify=False)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, verify=False)

        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return None

def check_vm_exists(vmid):
    """Check if VM already exists"""
    result = api_request("GET", f"/nodes/{PROXMOX_NODE}/qemu")
    if result and 'data' in result:
        for vm in result['data']:
            if vm['vmid'] == vmid:
                return True
    return False

def delete_vm(vmid):
    """Delete existing VM"""
    print(f"Deleting existing VM {vmid}...")
    result = api_request("DELETE", f"/nodes/{PROXMOX_NODE}/qemu/{vmid}")
    if result:
        time.sleep(5)  # Wait for deletion
        return True
    return False

def create_vm():
    """Create the VM"""
    print(f"\n=== Creating k3s-cluster-ingress VM ===")
    print(f"VMID: {VMID}")
    print(f"Name: {VM_NAME}")
    print(f"IP: {VM_IP}/{VM_NETMASK}")
    print(f"Gateway: {VM_GATEWAY}\n")

    # Check if VM exists
    if check_vm_exists(VMID):
        print(f"⚠️  VM {VMID} already exists!")
        response = input("Delete and recreate? (yes/no): ")
        if response.lower() != "yes":
            print("Aborted.")
            return False
        delete_vm(VMID)

    # Step 1: Create VM
    print("[1/7] Creating VM...")
    data = {
        "vmid": VMID,
        "name": VM_NAME,
        "memory": 512,
        "cores": 1,
        "sockets": 1,
        "cpu": "host",
        "net0": "virtio,bridge=vmbr145",
        "scsihw": "virtio-scsi-pci",
        "ostype": "l26",
        "agent": "1",
        "onboot": "1"
    }

    result = api_request("POST", f"/nodes/{PROXMOX_NODE}/qemu", data)
    if not result:
        print("❌ Failed to create VM")
        return False

    print("✅ VM created")
    time.sleep(2)

    # Step 2: Import disk (requires SSH to Proxmox host)
    print("[2/7] Preparing disk import...")
    print("\nNOTE: Disk import requires SSH access to Proxmox host")
    print("Generating commands for manual execution...\n")

    ssh_commands = f"""
# SSH to Proxmox host and run these commands:
ssh root@{PROXMOX_HOST}

# Download cloud image (if not already present)
cd /tmp
wget -O ubuntu-24.04-cloudimg.img {CLOUD_IMAGE_URL}

# Import disk to VM
qm importdisk {VMID} /tmp/ubuntu-24.04-cloudimg.img {STORAGE}

# Attach disk to VM
qm set {VMID} --scsi0 {STORAGE}:vm-{VMID}-disk-0

# Resize disk to 8GB
qm resize {VMID} scsi0 8G

# Exit Proxmox SSH
exit
"""

    print("=" * 60)
    print(ssh_commands)
    print("=" * 60)

    response = input("\nHave you completed the disk import steps above? (yes/no): ")
    if response.lower() != "yes":
        print("\n⚠️  Please complete disk import, then run this script with --configure-only flag")
        print(f"   python3 {sys.argv[0]} --configure-only")
        return False

    # Step 3: Configure cloud-init
    print("[3/7] Configuring cloud-init...")

    # URL encode SSH keys (empty for now, password auth)
    sshkeys = urllib.parse.quote("")

    data = {
        "ide2": f"{STORAGE}:cloudinit",
        "ciuser": "k3s",
        "cipassword": "toor",
        "ipconfig0": f"ip={VM_IP}/{VM_NETMASK},gw={VM_GATEWAY}",
        "nameserver": VM_DNS,
        "sshkeys": sshkeys,
        "boot": "order=scsi0"
    }

    result = api_request("POST", f"/nodes/{PROXMOX_NODE}/qemu/{VMID}/config", data)
    if result:
        print("✅ Cloud-init configured")
    else:
        print("⚠️  Cloud-init configuration may have issues")

    time.sleep(1)

    # Step 4: Start VM
    print("[4/7] Starting VM...")
    result = api_request("POST", f"/nodes/{PROXMOX_NODE}/qemu/{VMID}/status/start")
    if result:
        print("✅ VM started")
    else:
        print("❌ Failed to start VM")
        return False

    # Step 5: Wait for cloud-init
    print("[5/7] Waiting for cloud-init to complete (60 seconds)...")
    for i in range(12):
        time.sleep(5)
        print(f"  {(i+1)*5}s...")

    # Step 6: Create setup script
    print("[6/7] Creating setup script...")

    setup_script = """#!/bin/bash
# Setup script for k3s-cluster-ingress VM
set -e

echo "=== k3s-cluster-ingress Setup ==="

# Update and upgrade
echo "[1/7] Updating system..."
sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

# Install Tailscale
echo "[2/7] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Install iptables-persistent
echo "[3/7] Installing iptables-persistent..."
sudo DEBIAN_FRONTEND=noninteractive apt install -y iptables-persistent netfilter-persistent

# Enable IP forwarding
echo "[4/7] Enabling IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Start Tailscale
echo "[5/7] Starting Tailscale..."
echo ""
echo "⚠️  IMPORTANT: You'll need to authenticate with Tailscale"
echo "   Visit the URL shown below to complete authentication"
echo ""
sudo tailscale up --advertise-routes=10.88.145.0/24,10.42.0.0/16,10.43.0.0/16 --accept-routes --hostname=k3s-cluster-ingress

# Wait for Tailscale to be ready
sleep 5

# Configure port forwarding
echo "[6/7] Configuring NAT port forwarding..."
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 80 -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 443 -j MASQUERADE

# Save iptables rules
echo "[7/7] Saving iptables rules..."
sudo netfilter-persistent save

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Configuration:"
echo "  Hostname: k3s-cluster-ingress"
echo "  Local IP: 10.88.145.199"
echo "  Tailscale IP: $(tailscale status --self 2>/dev/null | grep '100\\.' | awk '{print $1}')"
echo ""
echo "Next steps:"
echo "  1. Go to Tailscale admin console"
echo "  2. Approve subnet routes for this device"
echo "  3. Update DNS: chat.ry-ops.dev → <Tailscale IP above>"
echo "  4. Test: curl -I http://chat.ry-ops.dev"
echo ""
"""

    with open('/tmp/setup-k3s-ingress.sh', 'w') as f:
        f.write(setup_script)

    subprocess.run(['chmod', '+x', '/tmp/setup-k3s-ingress.sh'])
    print("✅ Setup script created: /tmp/setup-k3s-ingress.sh")

    # Step 7: Copy script to VM and run
    print("[7/7] Ready to configure VM...")
    print(f"\nTo complete setup, run these commands:")
    print(f"  scp /tmp/setup-k3s-ingress.sh k3s@{VM_IP}:/tmp/")
    print(f"  ssh k3s@{VM_IP}  # password: toor")
    print(f"  sudo bash /tmp/setup-k3s-ingress.sh")

    return True

if __name__ == "__main__":
    if "--configure-only" in sys.argv:
        print("Skipping VM creation, configuring existing VM...")
        VMID = int(input(f"Enter VMID (default {VMID}): ") or VMID)

    success = create_vm()

    if success:
        print("\n✅ VM creation successful!")
        print(f"\nVM Details:")
        print(f"  VMID: {VMID}")
        print(f"  Name: {VM_NAME}")
        print(f"  IP: {VM_IP}")
        print(f"  Username: k3s")
        print(f"  Password: toor")
    else:
        print("\n❌ VM creation failed")
        sys.exit(1)
