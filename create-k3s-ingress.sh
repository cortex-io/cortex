#!/bin/bash
# Create k3s-cluster-ingress VM via Proxmox API
# Lightweight subnet router for Tailscale access to k3s cluster

set -e

# Load Proxmox credentials
PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

# VM Configuration
VMID="350"
VM_NAME="k3s-cluster-ingress"
VM_IP="10.88.145.199"
VM_GATEWAY="10.88.145.1"
VM_NETMASK="24"
VM_DNS="8.8.8.8"

# Ubuntu 24.04 Cloud Image
STORAGE="local-lvm"
CLOUD_IMAGE_URL="https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
CLOUD_IMAGE="/tmp/ubuntu-24.04-cloudimg.img"

echo "=== Creating k3s-cluster-ingress VM ==="
echo "VMID: $VMID"
echo "Name: $VM_NAME"
echo "IP: $VM_IP"
echo "Gateway: $VM_GATEWAY"
echo ""

# Download Ubuntu cloud image if not exists
if [ ! -f "$CLOUD_IMAGE" ]; then
    echo "[1/8] Downloading Ubuntu 24.04 cloud image..."
    curl -L -o "$CLOUD_IMAGE" "$CLOUD_IMAGE_URL"
else
    echo "[1/8] Using cached cloud image"
fi

# Create VM
echo "[2/8] Creating VM $VMID..."
curl -k -s -X POST "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -d "vmid=${VMID}" \
    -d "name=${VM_NAME}" \
    -d "memory=512" \
    -d "cores=1" \
    -d "sockets=1" \
    -d "cpu=host" \
    -d "net0=virtio,bridge=vmbr145" \
    -d "scsihw=virtio-scsi-pci" \
    -d "ostype=l26" \
    -d "agent=1"

echo "[3/8] Importing disk image..."
# Note: This requires SSH to Proxmox host or using qm command locally
# We'll create the disk via API instead
curl -k -s -X POST "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/resize" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -d "disk=scsi0" \
    -d "size=8G"

# Create cloud-init drive
echo "[4/8] Configuring cloud-init..."
curl -k -s -X POST "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/config" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -d "ide2=${STORAGE}:cloudinit" \
    -d "ciuser=k3s" \
    -d "cipassword=toor" \
    -d "ipconfig0=ip=${VM_IP}/${VM_NETMASK},gw=${VM_GATEWAY}" \
    -d "nameserver=${VM_DNS}" \
    -d "sshkeys=$(cat <<'EOF' | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))'
# Add your SSH public key here if desired
EOF
)"

# Enable start on boot
echo "[5/8] Configuring boot settings..."
curl -k -s -X POST "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/config" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -d "onboot=1" \
    -d "boot=order=scsi0"

echo "[6/8] VM created successfully!"
echo ""
echo "Next steps (manual):"
echo "1. Import Ubuntu cloud image disk to VM:"
echo "   SSH to Proxmox host and run:"
echo "   qm importdisk ${VMID} ${CLOUD_IMAGE} ${STORAGE}"
echo "   qm set ${VMID} --scsi0 ${STORAGE}:vm-${VMID}-disk-0"
echo ""
echo "2. Start the VM:"
echo "   qm start ${VMID}"
echo ""
echo "3. Wait 2-3 minutes for cloud-init, then SSH:"
echo "   ssh k3s@${VM_IP}  # password: toor"
echo ""
echo "4. Run the setup script to configure Tailscale and port forwarding"
echo ""

# Create setup script for the VM
cat > /tmp/setup-k3s-ingress.sh <<'SETUP_SCRIPT'
#!/bin/bash
# Setup script for k3s-cluster-ingress VM
# Run this on the VM after it boots

set -e

echo "=== k3s-cluster-ingress Setup ==="

# Install Tailscale
echo "[1/6] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale (will need manual auth)
echo "[2/6] Starting Tailscale..."
echo "You'll need to authenticate this device with Tailscale"
echo "After running this, visit the URL shown to authenticate"
sudo tailscale up --advertise-routes=10.88.145.0/24,10.42.0.0/16,10.43.0.0/16 --accept-routes --hostname=k3s-cluster-ingress

echo "[3/6] Enabling IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Install iptables-persistent
echo "[4/6] Installing iptables-persistent..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt install -y iptables-persistent netfilter-persistent

# Configure port forwarding to Traefik
echo "[5/6] Configuring NAT port forwarding..."
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 80 -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 443 -j MASQUERADE

# Save rules
echo "[6/6] Saving iptables rules..."
sudo netfilter-persistent save

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Configuration summary:"
echo "  Hostname: k3s-cluster-ingress"
echo "  Local IP: 10.88.145.199"
echo "  Tailscale IP: $(tailscale status --self 2>/dev/null | grep '100\.' | awk '{print $1}')"
echo "  Advertised subnets: 10.88.145.0/24, 10.42.0.0/16, 10.43.0.0/16"
echo "  Port forwarding: 80,443 → 10.88.145.200"
echo ""
echo "Next steps:"
echo "  1. Approve subnet routes in Tailscale admin console"
echo "  2. Update DNS: chat.ry-ops.dev → <Tailscale IP above>"
echo "  3. Test: curl -I http://chat.ry-ops.dev"
echo ""
SETUP_SCRIPT

chmod +x /tmp/setup-k3s-ingress.sh

echo "Setup script created: /tmp/setup-k3s-ingress.sh"
echo "Copy this to the VM and run after it boots"
