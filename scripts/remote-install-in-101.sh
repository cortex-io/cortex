#!/usr/bin/env bash
################################################################################
# Remote Installation of Cortex in Container 101
# Runs from your Mac, installs in Proxmox container 101
################################################################################

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Installing Cortex in Container 101 Remotely                 ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we can reach Proxmox
if ! ping -c 1 10.88.140.151 >/dev/null 2>&1; then
    echo "❌ Cannot reach Proxmox at 10.88.140.151"
    exit 1
fi

echo "✓ Proxmox is reachable"
echo "✓ Installing Cortex in container 101..."
echo ""

# Execute installation in container 101 via SSH
ssh root@10.88.140.151 'pct exec 101 -- bash -c '"'"'
set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Cortex Auto-Installation                                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

echo "[1/7] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq

echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git curl wget build-essential jq -qq

echo "   ✓ Node.js: $(node --version)"

echo "[3/7] Cloning Cortex..."
cd /opt
rm -rf cortex 2>/dev/null
git clone https://github.com/ry-ops/cortex.git
cd cortex

echo "[4/7] Installing dependencies..."
npm install --silent

echo "[5/7] Creating directories..."
mkdir -p coordination/{masters,tasks,worker-specs,security,monitoring}
mkdir -p logs agents/workers

echo "[6/7] Configuring Proxmox API..."
cat > .env <<'"'"'EOFENV'"'"'
PROXMOX_HOST=10.88.140.151
PROXMOX_USER=root@pam
PROXMOX_TOKEN_NAME=cortex-automation
PROXMOX_TOKEN_VALUE=8d1d247d-7798-4c02-b4a1-9ec74b90f5d9
PROXMOX_PORT=8006
PROXMOX_VERIFY_SSL=false
EOFENV

echo "[7/7] Creating systemd service..."
cat > /etc/systemd/system/cortex-dashboard.service <<'"'"'EOFSERVICE'"'"'
[Unit]
Description=Cortex Dashboard
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
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOFSERVICE

systemctl daemon-reload
systemctl enable cortex-dashboard
systemctl start cortex-dashboard

sleep 3

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     ✅ Cortex Installation Complete!                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Dashboard: http://10.88.140.159:3000"
echo ""
'"'"''

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     ✅ Remote Installation Complete!                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 Access Cortex Dashboard:"
echo "   http://10.88.140.159:3000"
echo ""
echo "🔍 Check status:"
echo "   ssh root@10.88.140.151 'pct exec 101 -- systemctl status cortex-dashboard'"
echo ""
echo "📋 View logs:"
echo "   ssh root@10.88.140.151 'pct exec 101 -- journalctl -u cortex-dashboard -f'"
echo ""
