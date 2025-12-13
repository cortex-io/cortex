#!/bin/bash
################################################################################
# Automated Deployment via Browser Console
#
# This script opens the Proxmox web console and attempts to automate
# the deployment by opening the browser and preparing the command
################################################################################

set -e

PROXMOX_URL="https://10.88.140.164:8006"
DEPLOYMENT_CMD='curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash'

echo "╔═══════════════════════════════════════════════════╗"
echo "║  Cortex Auto-Deployment via Proxmox Console      ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "This script will:"
echo "  1. Open Proxmox web UI in your default browser"
echo "  2. Copy the deployment command to clipboard"
echo "  3. Wait for you to paste it into CT 300 console"
echo ""
echo "DEPLOYMENT COMMAND:"
echo "  $DEPLOYMENT_CMD"
echo ""
echo "Press ENTER to continue..."
read

# Copy deployment command to clipboard
echo "$DEPLOYMENT_CMD" | pbcopy
echo "✓ Deployment command copied to clipboard!"
echo ""

# Open Proxmox UI
echo "✓ Opening Proxmox Web UI..."
open "$PROXMOX_URL"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  MANUAL STEPS REQUIRED                            ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "1. Log in to Proxmox (browser should open automatically)"
echo "2. Navigate to: pve > 300 (k3s-master)"
echo "3. Click 'Console' button"
echo "4. Press Cmd+V to paste the deployment command"
echo "5. Press ENTER to execute"
echo ""
echo "The deployment command is already in your clipboard!"
echo ""
echo "Expected deployment time: 3-5 minutes"
echo ""
echo "Dashboard will be available at: http://10.88.145.180:30000"
echo ""
