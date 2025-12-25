#!/bin/bash
# Create k3s-cluster-ingress VM via Proxmox API (simple curl version)

set -e

# Proxmox Configuration
PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
PROXMOX_HOST="10.88.140.164"
PROXMOX_NODE="pve01"
API="https://${PROXMOX_HOST}:8006/api2/json"

# VM Configuration
VMID="350"
VM_NAME="k3s-cluster-ingress"
VM_IP="10.88.145.199"
VM_GW="10.88.145.1"
STORAGE="local-lvm"

echo "=== Creating k3s-cluster-ingress VM ==="
echo "VMID: $VMID"
echo "Name: $VM_NAME"
echo "IP: $VM_IP"
echo ""

# Check if VM exists
echo "[1/8] Checking for existing VM..."
EXISTING=$(curl -k -s -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    "${API}/nodes/${PROXMOX_NODE}/qemu/${VMID}/status/current" 2>/dev/null)

if echo "$EXISTING" | grep -q '"status"'; then
    echo "⚠️  VM $VMID already exists!"
    echo "Please delete it first or choose a different VMID"
    echo "To delete: curl -k -X DELETE -H \"Authorization: PVEAPIToken=${PROXMOX_TOKEN}\" \"${API}/nodes/${PROXMOX_NODE}/qemu/${VMID}\""
    exit 1
fi

# Create VM
echo "[2/8] Creating VM $VMID..."
curl -k -s -X POST "${API}/nodes/${PROXMOX_NODE}/qemu" \
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
    -d "agent=1" \
    -d "onboot=1"

echo "✅ VM created"
sleep 2

# Configure cloud-init
echo "[3/8] Configuring cloud-init..."
curl -k -s -X POST "${API}/nodes/${PROXMOX_NODE}/qemu/${VMID}/config" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -d "ide2=${STORAGE}:cloudinit" \
    -d "ciuser=k3s" \
    -d "cipassword=toor" \
    -d "ipconfig0=ip=${VM_IP}/24,gw=${VM_GW}" \
    -d "nameserver=8.8.8.8" \
    -d "boot=order=scsi0"

echo "✅ Cloud-init configured"

echo ""
echo "[4/8] ⚠️  MANUAL STEP REQUIRED ⚠️"
echo ""
echo "You need to SSH to Proxmox and import the disk manually:"
echo ""
echo "  ssh root@${PROXMOX_HOST}"
echo "  cd /tmp"
echo "  wget -O ubuntu-24.04-cloudimg.img https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
echo "  qm importdisk ${VMID} ubuntu-24.04-cloudimg.img ${STORAGE}"
echo "  qm set ${VMID} --scsi0 ${STORAGE}:vm-${VMID}-disk-0"
echo "  qm resize ${VMID} scsi0 8G"
echo "  exit"
echo ""
read -p "Press Enter after completing the steps above..."

# Start VM
echo ""
echo "[5/8] Starting VM..."
curl -k -s -X POST "${API}/nodes/${PROXMOX_NODE}/qemu/${VMID}/status/start" \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}"

echo "✅ VM started"

# Wait for boot
echo "[6/8] Waiting for VM to boot (60 seconds)..."
for i in {12..1}; do
    echo "  $((i*5)) seconds remaining..."
    sleep 5
done

# Create setup script
echo "[7/8] Creating setup script..."
cat > /tmp/setup-k3s-ingress.sh <<'ENDSCRIPT'
#!/bin/bash
# k3s-cluster-ingress Setup Script
set -e

echo "=== k3s-cluster-ingress Setup ==="

# Update system
echo "[1/7] Updating system..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

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

# Start Tailscale
echo "[5/7] Starting Tailscale as subnet router..."
echo ""
echo "⚠️  AUTHENTICATE THIS DEVICE:"
echo "   Visit the URL shown below in your browser"
echo ""
sudo tailscale up \
    --advertise-routes=10.88.145.0/24,10.42.0.0/16,10.43.0.0/16 \
    --accept-routes \
    --hostname=k3s-cluster-ingress

# Wait for Tailscale
sleep 5

# Get Tailscale IP
TS_IP=$(tailscale status --self 2>/dev/null | grep '100\.' | awk '{print $1}' || echo "unknown")

# Configure port forwarding
echo ""
echo "[6/7] Configuring port forwarding to Traefik (10.88.145.200)..."
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
sudo iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 80 -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 443 -j MASQUERADE

# Save rules
echo "[7/7] Saving iptables rules..."
sudo netfilter-persistent save

echo ""
echo "=== ✅ Setup Complete! ==="
echo ""
echo "Configuration:"
echo "  Hostname: k3s-cluster-ingress"
echo "  Local IP: 10.88.145.199"
echo "  Tailscale IP: ${TS_IP}"
echo ""
echo "Next steps:"
echo "  1. Go to https://login.tailscale.com/admin/machines"
echo "  2. Find 'k3s-cluster-ingress' and approve subnet routes"
echo "  3. Update DNS: chat.ry-ops.dev → ${TS_IP}"
echo "  4. Test: curl -I http://chat.ry-ops.dev"
echo ""
ENDSCRIPT

chmod +x /tmp/setup-k3s-ingress.sh
echo "✅ Setup script created"

# Copy script to VM
echo "[8/8] Copying setup script to VM..."
echo "Attempting to copy script (may need to wait for SSH to be ready)..."

for i in {1..10}; do
    if scp -o StrictHostKeyChecking=no -o ConnectTimeout=5 /tmp/setup-k3s-ingress.sh k3s@${VM_IP}:/tmp/ 2>/dev/null; then
        echo "✅ Script copied successfully!"
        break
    else
        echo "  Attempt $i/10 failed, retrying in 10 seconds..."
        sleep 10
    fi
done

echo ""
echo "=== VM Creation Complete! ==="
echo ""
echo "VM Details:"
echo "  VMID: ${VMID}"
echo "  Name: ${VM_NAME}"
echo "  IP: ${VM_IP}"
echo "  Username: k3s"
echo "  Password: toor"
echo ""
echo "To complete setup:"
echo "  ssh k3s@${VM_IP}"
echo "  sudo bash /tmp/setup-k3s-ingress.sh"
echo ""
