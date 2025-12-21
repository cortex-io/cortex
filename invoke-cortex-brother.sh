#!/usr/bin/env bash
# Invoke Cortex instance in K3s cluster to execute the task

TASK_FILE="coordination/tasks/pending/fix-k3s-master03-ip.json"
TASK_SUMMARY="Fix k3s-master03 (VMID 306) IP to 10.88.145.196 via Proxmox console. VM is running but not SSH accessible."

echo "==============================================================="
echo "Invoking Cortex Brother in K3s Cluster"
echo "==============================================================="
echo ""

# Pick first running Cortex pod
CORTEX_POD=$(ssh k3s@10.88.145.190 "kubectl get pods -n cortex -l app=cortex -o jsonpath='{.items[0].metadata.name}'" 2>&1)

if [ -z "$CORTEX_POD" ] || [[ "$CORTEX_POD" == *"error"* ]]; then
    echo "ERROR: Cannot find Cortex pod"
    echo "Output: $CORTEX_POD"
    exit 1
fi

echo "Target Cortex pod: $CORTEX_POD"
echo ""

# Create the task request
TASK_REQUEST=$(cat <<'EOF'
{
  "task": "fix-k3s-master03-ip",
  "description": "Fix k3s-master03 (VMID 306) IP address to 10.88.145.196 via Proxmox console",
  "details": {
    "vmid": 306,
    "hostname": "k3s-master03",
    "target_ip": "10.88.145.196",
    "proxmox_host": "10.88.140.164",
    "proxmox_node": "pve01",
    "vm_user": "k3s",
    "vm_password": "toor",
    "method": "console",
    "steps": [
      "Access Proxmox console for VM 306",
      "Login with k3s/toor",
      "Edit /etc/netplan/50-cloud-init.yaml to set IP 10.88.145.196/24",
      "Run: sudo hostnamectl set-hostname k3s-master03",
      "Run: sudo netplan apply",
      "Run: sudo reboot",
      "Verify SSH access at 10.88.145.196"
    ]
  }
}
EOF
)

echo "Task request created"
echo ""
echo "Sending task to Cortex instance..."
echo ""

# Try to invoke via kubectl exec
ssh k3s@10.88.145.190 "kubectl exec -n cortex $CORTEX_POD -- /bin/sh -c 'echo \"$TASK_REQUEST\" > /tmp/cortex-task.json && cat /tmp/cortex-task.json'" 2>&1

echo ""
echo "==============================================================="
echo "Task sent to: $CORTEX_POD"
echo "==============================================================="
echo ""
echo "The Cortex instance should now:"
echo "  1. Read the task from /tmp/cortex-task.json or task queue"
echo "  2. Use Proxmox MCP to access VM 306 console"
echo "  3. Configure the IP address"
echo "  4. Verify completion"
echo ""
echo "Monitor with: watch ssh k3s@10.88.145.196 hostname"
