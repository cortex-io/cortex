#!/usr/bin/env bash
################################################################################
# Complete Cortex Installation Script for Container 104
# Run this on Proxmox host: pct exec 104 -- bash < install-cortex-104.sh
################################################################################

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Cortex Auto-Installation for Container 104                   ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Update system
echo "[1/7] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js 20
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y nodejs git curl wget build-essential jq -qq

echo "   ✓ Node.js: $(node --version)"
echo "   ✓ npm: $(npm --version)"

# Clone Cortex
echo "[3/7] Cloning Cortex from GitHub..."
cd /opt
rm -rf cortex 2>/dev/null || true
git clone https://github.com/ry-ops/cortex.git
cd cortex

# Install dependencies
echo "[4/7] Installing Node.js dependencies..."
npm install --silent

# Create directories
echo "[5/7] Creating Cortex directories..."
mkdir -p coordination/{masters,tasks,worker-specs,security,monitoring}
mkdir -p logs agents/workers

# Configure Proxmox API access
echo "[6/7] Configuring Proxmox API access..."
cat > /opt/cortex/.env <<'EOFENV'
PROXMOX_HOST=10.88.140.151
PROXMOX_USER=root@pam
PROXMOX_TOKEN_NAME=cortex-automation
PROXMOX_TOKEN_VALUE=8d1d247d-7798-4c02-b4a1-9ec74b90f5d9
PROXMOX_PORT=8006
PROXMOX_VERIFY_SSL=false
EOFENV

# Create systemd service
echo "[7/7] Creating and starting systemd service..."
cat > /etc/systemd/system/cortex-dashboard.service <<'EOFSERVICE'
[Unit]
Description=Cortex Dashboard Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cortex
ExecStart=/usr/bin/node dashboard/server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cortex-dashboard
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOFSERVICE

# Reload systemd
systemctl daemon-reload
systemctl enable cortex-dashboard >/dev/null 2>&1
systemctl start cortex-dashboard

# Wait for startup
sleep 3

# Check status
if systemctl is-active --quiet cortex-dashboard; then
    CONTAINER_IP=$(hostname -I | awk '{print $1}')

    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║     ✅ Cortex Installation Complete!                            ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📊 Dashboard URL: http://${CONTAINER_IP}:3000"
    echo "📁 Cortex Location: /opt/cortex"
    echo "🔧 Service: cortex-dashboard.service"
    echo ""
    echo "Container Details:"
    echo "  ID: 104"
    echo "  Hostname: cortex"
    echo "  IP: ${CONTAINER_IP}"
    echo ""
    echo "Useful Commands:"
    echo "  systemctl status cortex-dashboard  # Check status"
    echo "  systemctl restart cortex-dashboard # Restart"
    echo "  journalctl -u cortex-dashboard -f  # View logs"
    echo "  cd /opt/cortex && ./scripts/run-security-master.sh"
    echo ""
    echo "🎉 Cortex is now monitoring your Proxmox infrastructure!"
    echo "   Including itself - the meta-loop is complete! 🔄"
    echo ""
else
    echo "⚠️  Dashboard may need manual start"
    echo "Run: systemctl start cortex-dashboard"
fi
