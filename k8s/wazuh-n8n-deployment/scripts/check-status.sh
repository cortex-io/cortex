#!/bin/bash
set -euo pipefail

# Check deployment status via Proxmox API

source /Users/ryandahlberg/Projects/cortex/.env

TOKEN_ID=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f1)
TOKEN_SECRET=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f2)
PROXMOX_API="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

echo "Checking deployment status..."
echo ""

STATUS_CMD='
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "=== NAMESPACES ==="
kubectl get ns wazuh n8n mcp 2>/dev/null || echo "Namespaces not created"

echo ""
echo "=== WAZUH PODS ==="
kubectl get pods -n wazuh 2>/dev/null || echo "No wazuh pods"

echo ""
echo "=== N8N PODS ==="
kubectl get pods -n n8n 2>/dev/null || echo "No n8n pods"

echo ""
echo "=== MCP PODS ==="
kubectl get pods -n mcp 2>/dev/null || echo "No mcp pods"

echo ""
echo "=== SERVICES ==="
kubectl get svc -n wazuh -n n8n -n mcp 2>/dev/null || echo "No services"

echo ""
echo "=== PVCs ==="
kubectl get pvc --all-namespaces 2>/dev/null | grep -E "wazuh|n8n" || echo "No PVCs"

echo ""
echo "=== IMAGES IN CONTAINERD ==="
ctr -n k8s.io images ls | grep -E "wazuh-mcp|n8n-mcp" || echo "No MCP images"
'

# Execute on master
response=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
    -H "Content-Type: application/json" \
    -X POST \
    "${PROXMOX_API}/nodes/${PROXMOX_NODE}/qemu/${K3S_MASTER_VMID}/agent/exec" \
    -d "{\"command\":[\"bash\",\"-c\",\"$(echo "$STATUS_CMD" | sed 's/"/\\"/g')\"]}")

pid=$(echo "$response" | jq -r '.data.pid // empty')

if [ -n "$pid" ]; then
    sleep 5
    output=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
        "${PROXMOX_API}/nodes/${PROXMOX_NODE}/qemu/${K3S_MASTER_VMID}/agent/exec-status?pid=${pid}")

    echo "$output" | jq -r '.data["out-data"] // empty' | base64 -d 2>/dev/null || echo "Failed to get output"
else
    echo "Failed to execute command"
    echo "Response: $response"
fi
