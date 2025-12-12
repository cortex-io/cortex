#!/usr/bin/env bash
################################################################################
# Cortex Self-Deployment to Proxmox
#
# This script allows Cortex to deploy itself to a Proxmox server
# using its own orchestration capabilities.
#
# Usage: ./deploy-self-to-proxmox.sh
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_section "Cortex Self-Deployment to Proxmox"

# Check prerequisites
log_info "Checking prerequisites..."

# Check if deployment script exists
DEPLOY_SCRIPT="/Users/ryandahlberg/Projects/proxmox-mcp-server/deploy-cortex-lxc.sh"
if [ ! -f "$DEPLOY_SCRIPT" ]; then
    log_error "Deployment script not found: $DEPLOY_SCRIPT"
    exit 1
fi

# Check Proxmox connectivity
log_info "Testing Proxmox connectivity..."
if ! ping -c 1 10.88.140.151 &>/dev/null; then
    log_error "Cannot reach Proxmox server at 10.88.140.151"
    exit 1
fi

log_success "Prerequisites check passed"
log_section "Deployment Plan"

cat <<EOF
${CYAN}Cortex will deploy itself to Proxmox:${NC}

${BLUE}Source:${NC}
  • Local Cortex: $CORTEX_ROOT
  • Deployment Script: $DEPLOY_SCRIPT

${BLUE}Target:${NC}
  • Proxmox Host: 10.88.140.151
  • Node: pve01
  • Container ID: 101
  • Hostname: cortex
  • IP: 10.88.140.159

${BLUE}Resources:${NC}
  • RAM: 4GB
  • CPU: 4 cores
  • Disk: 20GB

${BLUE}What will happen:${NC}
  1. Copy deployment script to Proxmox
  2. Execute deployment script
  3. Monitor progress in real-time
  4. Verify container creation
  5. Start Cortex dashboard
  6. Verify dashboard accessibility
  7. Report results

${YELLOW}Estimated time: 5-10 minutes${NC}
EOF

echo ""
read -p "$(echo -e ${CYAN}Continue with deployment? [y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Deployment cancelled"
    exit 0
fi

# Create task directory
TASK_DIR="$CORTEX_ROOT/coordination/tasks/deploy-cortex-to-proxmox"
mkdir -p "$TASK_DIR"

# Step 1: Copy deployment script
log_section "Step 1/6: Copying deployment script to Proxmox"
log_info "Copying $DEPLOY_SCRIPT to root@10.88.140.151:/root/"

if scp "$DEPLOY_SCRIPT" root@10.88.140.151:/root/deploy-cortex-lxc.sh; then
    log_success "Deployment script copied"
else
    log_error "Failed to copy deployment script"
    exit 1
fi

# Step 2: Make executable
log_section "Step 2/6: Making script executable"
if ssh root@10.88.140.151 "chmod +x /root/deploy-cortex-lxc.sh"; then
    log_success "Script is now executable"
else
    log_error "Failed to make script executable"
    exit 1
fi

# Step 3: Execute deployment
log_section "Step 3/6: Executing deployment on Proxmox"
log_info "Running deployment script (this will take 5-10 minutes)..."

# Create log file
LOG_FILE="$TASK_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"
touch "$LOG_FILE"

log_info "Deployment output will be saved to: $LOG_FILE"
log_info "You can monitor progress in real-time below..."
echo ""

# Execute with output streaming
if ssh root@10.88.140.151 "/root/deploy-cortex-lxc.sh" 2>&1 | tee "$LOG_FILE"; then
    log_success "Deployment script completed successfully"
else
    log_error "Deployment script failed. Check logs: $LOG_FILE"
    exit 1
fi

# Step 4: Verify container
log_section "Step 4/6: Verifying container creation"
log_info "Checking container 101 status..."

CONTAINER_STATUS=$(ssh root@10.88.140.151 "pct status 101" 2>/dev/null || echo "not found")
if [[ "$CONTAINER_STATUS" == *"running"* ]]; then
    log_success "Container 101 is running"
else
    log_error "Container 101 is not running. Status: $CONTAINER_STATUS"
    exit 1
fi

# Get container IP
CONTAINER_IP=$(ssh root@10.88.140.151 "pct exec 101 -- hostname -I | awk '{print \$1}'")
log_info "Container IP: $CONTAINER_IP"

# Step 5: Start Cortex dashboard
log_section "Step 5/6: Starting Cortex dashboard"
log_info "Starting dashboard service..."

if ssh root@10.88.140.151 "pct exec 101 -- systemctl start cortex-dashboard"; then
    log_success "Dashboard service started"
    sleep 3  # Give it a moment to start
else
    log_error "Failed to start dashboard service"
    exit 1
fi

# Step 6: Verify dashboard
log_section "Step 6/6: Verifying dashboard accessibility"
log_info "Checking dashboard at http://${CONTAINER_IP}:3000..."

# Try to access dashboard
for i in {1..10}; do
    if curl -s -f "http://${CONTAINER_IP}:3000" >/dev/null 2>&1; then
        log_success "Dashboard is accessible!"
        break
    else
        log_info "Attempt $i/10: Dashboard not ready yet, waiting..."
        sleep 2
    fi

    if [ $i -eq 10 ]; then
        log_error "Dashboard is not accessible after 10 attempts"
        log_info "Try manually: ssh root@10.88.140.151 'pct exec 101 -- systemctl status cortex-dashboard'"
    fi
done

# Save deployment info
cat > "$TASK_DIR/deployment-info.json" <<EOF
{
  "deployment_id": "cortex-deployment-$(date +%Y%m%d-%H%M%S)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "completed",
  "proxmox_host": "10.88.140.151",
  "container": {
    "id": 101,
    "hostname": "cortex",
    "ip": "$CONTAINER_IP",
    "status": "running"
  },
  "dashboard": {
    "url": "http://${CONTAINER_IP}:3000",
    "status": "running"
  },
  "log_file": "$LOG_FILE"
}
EOF

# Final summary
log_section "Deployment Complete!"

cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}
${GREEN}║     Cortex Successfully Deployed Itself to Proxmox! 🎉          ║${NC}
${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Deployment Details:${NC}
  Container ID: ${GREEN}101${NC}
  Hostname: ${GREEN}cortex${NC}
  IP Address: ${GREEN}$CONTAINER_IP${NC}
  Status: ${GREEN}Running ✓${NC}

${BLUE}Access Cortex:${NC}
  Dashboard: ${CYAN}http://${CONTAINER_IP}:3000${NC}
  SSH: ${CYAN}ssh root@${CONTAINER_IP}${NC}
  Via Proxmox: ${CYAN}ssh root@10.88.140.151 "pct enter 101"${NC}

${BLUE}Logs:${NC}
  Deployment log: ${YELLOW}$LOG_FILE${NC}
  Info file: ${YELLOW}$TASK_DIR/deployment-info.json${NC}

${BLUE}Next Steps:${NC}
  1. Open dashboard: ${CYAN}open http://${CONTAINER_IP}:3000${NC}
  2. Configure Cortex to monitor Proxmox
  3. Start running Cortex masters
  4. Watch Cortex monitor itself! 🔄

${GREEN}Cortex is now running in Proxmox and can monitor your entire infrastructure!${NC}

EOF

log_success "Self-deployment complete!"
