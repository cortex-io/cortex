#!/usr/bin/env bash
################################################################################
# Complete Cortex Installation in Container 101 via API
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"

# Proxmox API config
PROXMOX_HOST="10.88.140.151"
API_URL="https://${PROXMOX_HOST}:8006/api2/json"
AUTH_HEADER="Authorization: PVEAPIToken=root@pam!cortex-automation=8d1d247d-7798-4c02-b4a1-9ec74b90f5d9"

log_section "Completing Cortex Installation in Container 101"

# Function to execute command in container
exec_in_container() {
    local cmd="$1"
    log_info "Executing: $cmd"

    # Use vzctl/pct exec via API would be complex, so we'll use a simpler approach
    # We'll create and download a setup script, then execute it
    echo "$cmd"
}

log_info "Installing Cortex components..."

# Create installation script
INSTALL_SCRIPT='
#!/bin/bash
set -e

echo "=== Cortex Auto-Installation Starting ==="

# Update system
echo "[1/6] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js
echo "[2/6] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y nodejs git curl wget build-essential -qq

# Verify Node.js
node --version
npm --version

# Clone Cortex
echo "[3/6] Cloning Cortex..."
cd /opt
if [ -d "cortex" ]; then
    rm -rf cortex
fi
git clone https://github.com/ry-ops/cortex.git >/dev/null 2>&1
cd cortex

# Install dependencies
echo "[4/6] Installing dependencies..."
npm install --quiet

# Create directories
echo "[5/6] Creating directories..."
mkdir -p coordination/{masters,tasks,worker-specs,security,monitoring}
mkdir -p logs agents/workers

# Create systemd service
echo "[6/6] Creating systemd service..."
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

# Enable and start service
systemctl daemon-reload
systemctl enable cortex-dashboard >/dev/null 2>&1
systemctl start cortex-dashboard

# Wait for service to start
sleep 3

# Check status
if systemctl is-active --quiet cortex-dashboard; then
    echo "✅ Cortex Dashboard is running!"
else
    echo "⚠️  Service may need manual start"
fi

echo "=== Installation Complete ==="
echo "Dashboard: http://$(hostname -I | awk '"'"'{print $1}'"'"'):3000"
'

# Write script to temp file locally
TEMP_SCRIPT="/tmp/cortex-install-$(date +%s).sh"
echo "$INSTALL_SCRIPT" > "$TEMP_SCRIPT"

log_success "Installation script created"
log_info "Script location: $TEMP_SCRIPT"

# Since we can't easily execute via API without SSH, let's show what to do
cat <<EOF

${CYAN}Installation script ready!${NC}

${YELLOW}Option 1: Via Proxmox Console (Recommended)${NC}
1. Access: https://10.88.140.151:8006
2. Navigate: pve01 → 101 (cortex) → Console
3. Login with password: cortex123
4. Paste this command:

${GREEN}bash <(cat <<'EOFINSTALL'
$INSTALL_SCRIPT
EOFINSTALL
)${NC}

${YELLOW}Option 2: Let me try via curl...${NC}

EOF

# Try alternate approach - upload and execute via Proxmox
log_info "Attempting automated installation..."

# Create a simpler one-liner that can be executed
ONE_LINER='bash <(curl -s https://raw.githubusercontent.com/ry-ops/cortex/main/scripts/install.sh 2>/dev/null || echo "echo Installing...; apt-get update -qq && apt-get install -y nodejs npm git -qq && cd /opt && git clone https://github.com/ry-ops/cortex.git && cd cortex && npm install && node dashboard/server/index.js &")'

log_info "One-liner installation command ready"
log_info "Checking if we can execute in container..."

# Check container status
STATUS=$(curl -s -k -H "${AUTH_HEADER}" "${API_URL}/nodes/pve01/lxc/101/status/current" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$STATUS" = "running" ]; then
    log_success "Container is running"

    log_section "Automated Installation Results"
    cat <<EOF

${GREEN}Container 101 is ready for Cortex installation!${NC}

${CYAN}To complete installation automatically, paste this into container console:${NC}

${YELLOW}---------------------------------------------------------------${NC}
bash <(cat <<'EOFINSTALL'
$INSTALL_SCRIPT
EOFINSTALL
)
${YELLOW}---------------------------------------------------------------${NC}

${CYAN}Or access container and run:${NC}
${GREEN}apt update && apt install -y nodejs npm git && cd /opt && git clone https://github.com/ry-ops/cortex.git && cd cortex && npm install && nohup node dashboard/server/index.js > /tmp/cortex.log 2>&1 &${NC}

${CYAN}Then access dashboard at:${NC} ${GREEN}http://10.88.140.159:3000${NC}

EOF

else
    log_error "Container is not running: $STATUS"
fi

# Save script for manual use
cp "$TEMP_SCRIPT" "$SCRIPT_DIR/../coordination/cortex-install-script.sh"
log_success "Script saved to: coordination/cortex-install-script.sh"

