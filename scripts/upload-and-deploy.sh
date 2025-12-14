#!/bin/bash
# Upload deployment script to VM and execute it

set -e

PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
K3S_MASTER_VMID=310

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Uploading and Executing Deployment Script                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Encode deployment script
SCRIPT_B64=$(cat /tmp/cortex-k3s-deploy.sh | base64)

# Step 2: Write script to VM via guest-file-write
echo "→ Writing deployment script to VM..."
# Open file
open_response=$(curl -k -s -X POST \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/file-open" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"file\":\"/tmp/deploy-cortex.sh\",\"mode\":\"w+\"}")

file_handle=$(echo "$open_response" | jq -r '.data // empty')

if [ -z "$file_handle" ]; then
    echo "  ✗ Failed to open file on VM"
    echo "$open_response" | jq .
    exit 1
fi

echo "  ✓ File handle: $file_handle"

# Write content
echo "→ Writing script content..."
curl -k -s -X POST \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/file-write" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"handle\":$file_handle,\"content\":\"$SCRIPT_B64\"}" > /dev/null

# Close file
curl -k -s -X POST \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/file-close" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"handle\":$file_handle}" > /dev/null

echo "  ✓ Script uploaded to /tmp/deploy-cortex.sh"

# Step 3: Make executable and run
echo "→ Executing deployment script..."
exec_response=$(curl -k -s -X POST \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"command\":[\"bash\",\"/tmp/deploy-cortex.sh\",\"$ANTHROPIC_API_KEY\"]}")

pid=$(echo "$exec_response" | jq -r '.data.pid // empty')

if [ -z "$pid" ]; then
    echo "  ✗ Failed to start deployment"
    echo "$exec_response" | jq .
    exit 1
fi

echo "  ✓ Deployment started (PID: $pid)"
echo ""
echo "Waiting for deployment to complete (this may take 2-3 minutes)..."

# Poll for completion
for i in {1..60}; do
    sleep 5
    result=$(curl -k -s -X GET \
        "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/$K3S_MASTER_VMID/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    exited=$(echo "$result" | jq -r '.data.exited // false')

    if [ "$exited" = "true" ]; then
        exitcode=$(echo "$result" | jq -r '.data.exitcode')

        echo ""
        echo "=== Deployment Output ==="
        stdout_b64=$(echo "$result" | jq -r '.data["out-data"] // empty')
        if [ -n "$stdout_b64" ]; then
            echo "$stdout_b64" | base64 -d
        fi

        echo ""
        if [ "$exitcode" -eq 0 ]; then
            echo "╔════════════════════════════════════════════════════════════╗"
            echo "║  Deployment Successful!                                    ║"
            echo "╚════════════════════════════════════════════════════════════╝"
            exit 0
        else
            echo "Deployment failed (exit code: $exitcode)"
            stderr_b64=$(echo "$result" | jq -r '.data["err-data"] // empty')
            if [ -n "$stderr_b64" ]; then
                echo "Errors:"
                echo "$stderr_b64" | base64 -d
            fi
            exit 1
        fi
    fi

    echo -n "."
done

echo ""
echo "Deployment still running after 5 minutes. Check manually:"
echo "  kubectl get pods -n cortex-system"
