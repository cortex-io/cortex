#!/usr/bin/env bash
# Submit task to Cortex cluster for processing
# Creates task file and notifies via Proxmox MCP

set -euo pipefail

TASK_FILE="coordination/tasks/pending/fix-k3s-master03-ip.json"
TASK_ID="fix-k3s-master03-ip-1734739200"

echo "==============================================================="
echo "Submitting Task to Cortex Cluster"
echo "==============================================================="
echo ""
echo "Task: Fix k3s-master03 IP Address"
echo "File: $TASK_FILE"
echo ""

# Verify task file exists
if [ ! -f "$TASK_FILE" ]; then
    echo "ERROR: Task file not found: $TASK_FILE"
    exit 1
fi

echo "✓ Task file created"
echo ""

# Show task summary
echo "Task Summary:"
jq -r '
  "  ID: " + .id + "\n" +
  "  Title: " + .title + "\n" +
  "  Priority: " + .priority + "\n" +
  "  Type: " + .type + "\n" +
  "  Status: " + .status
' "$TASK_FILE"
echo ""

# Check if we can reach K3s cluster
echo "Checking Cortex cluster accessibility..."
if ssh k3s@10.88.145.190 "kubectl get svc -n cortex cortex" >/dev/null 2>&1; then
    echo "✓ K3s cluster accessible"
    echo "✓ Cortex service found"
else
    echo "✗ Cannot reach K3s cluster"
    exit 1
fi
echo ""

# Get Cortex pods
echo "Active Cortex instances:"
ssh k3s@10.88.145.190 "kubectl get pods -n cortex -l app=cortex -o wide" || true
echo ""

# Check for Proxmox MCP
echo "Checking Proxmox MCP availability..."
if ssh k3s@10.88.145.190 "kubectl get svc -n cortex proxmox-mcp" >/dev/null 2>&1; then
    echo "✓ Proxmox MCP service available"
    PROXMOX_MCP_IP=$(ssh k3s@10.88.145.190 "kubectl get svc -n cortex proxmox-mcp -o jsonpath='{.spec.clusterIP}'")
    echo "  Service IP: $PROXMOX_MCP_IP:8080"
else
    echo "⚠ Proxmox MCP not found (task may still be picked up)"
fi
echo ""

echo "==============================================================="
echo "Task Submitted Successfully!"
echo "==============================================================="
echo ""
echo "The task is now available in: $TASK_FILE"
echo ""
echo "Cortex instances can pick up this task by:"
echo "  1. Polling the coordination/tasks/pending/ directory"
echo "  2. Reading the task specification"
echo "  3. Using Proxmox MCP to access VM 306 console"
echo "  4. Executing the configuration steps"
echo ""
echo "To monitor task status:"
echo "  watch -n 5 'cat $TASK_FILE | jq .status'"
echo ""
echo "To check if a Cortex instance has claimed the task:"
echo "  cat $TASK_FILE | jq .assigned_to"
echo ""

# Create a marker file to signal new task
MARKER_FILE="coordination/tasks/.new-task-signal"
echo "$TASK_ID" > "$MARKER_FILE"
echo "✓ Created task signal marker"
echo ""

echo "Next: Monitor task pickup and completion"
echo "The Cortex cluster should process this within the next polling interval."
