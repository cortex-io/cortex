#!/bin/bash
set -euo pipefail

# Wazuh + n8n + MCP Complete Deployment Script
# Deploys via Proxmox API to K3s cluster (VMs 310, 311, 312)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment
source ~/.cortex/.env 2>/dev/null || source /Users/ryandahlberg/Projects/cortex/.env

echo "=========================================="
echo "Wazuh + n8n + MCP Deployment"
echo "=========================================="
echo "Proxmox Host: $PROXMOX_HOST"
echo "K3s Master: $K3S_MASTER_IP (VM $K3S_MASTER_VMID)"
echo "K3s Worker1: $K3S_WORKER1_IP (VM $K3S_WORKER1_VMID)"
echo "K3s Worker2: $K3S_WORKER2_IP (VM $K3S_WORKER2_VMID)"
echo ""

# Extract token components
TOKEN_ID=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f1)
TOKEN_SECRET=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f2)

# Function to execute command on VM via Proxmox API
exec_on_vm() {
    local vmid=$1
    local command=$2

    echo "[VM $vmid] Executing: ${command:0:100}..."

    curl -k -s \
        -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
        -H "Content-Type: application/json" \
        -X POST \
        "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec" \
        -d "{\"command\":\"bash\",\"input-data\":\"$(echo "$command" | base64)\"}" \
    | jq -r '.data.pid // empty'
}

# Function to get command output
get_exec_output() {
    local vmid=$1
    local pid=$2

    sleep 2
    curl -k -s \
        -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
        "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}" \
    | jq -r '.data["out-data"] // empty' | base64 -d
}

# Step 1: Build Docker images on master node
echo "Step 1: Building Docker images on VM $K3S_MASTER_VMID..."

# Build wazuh-mcp-server
BUILD_WAZUH_CMD=$(cat <<'EOFCMD'
cd /tmp && \
git clone https://github.com/ry-ops/wazuh-mcp-server.git && \
cd wazuh-mcp-server && \
docker build -t wazuh-mcp-server:latest . && \
echo "Wazuh MCP image built successfully"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$BUILD_WAZUH_CMD")
if [ -n "$PID" ]; then
    sleep 30
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Build n8n-mcp-server
BUILD_N8N_CMD=$(cat <<'EOFCMD'
cd /tmp && \
git clone https://github.com/ry-ops/n8n-mcp-server.git && \
cd n8n-mcp-server && \
docker build -t n8n-mcp-server:latest . && \
echo "n8n MCP image built successfully"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$BUILD_N8N_CMD")
if [ -n "$PID" ]; then
    sleep 30
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 2: Save images to tar files
echo "Step 2: Saving images to tar files..."

SAVE_CMD=$(cat <<'EOFCMD'
docker save wazuh-mcp-server:latest -o /tmp/wazuh-mcp-server.tar && \
docker save n8n-mcp-server:latest -o /tmp/n8n-mcp-server.tar && \
echo "Images saved to tar files"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$SAVE_CMD")
if [ -n "$PID" ]; then
    sleep 10
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 3: Load images on all nodes
echo "Step 3: Loading images to containerd on all nodes..."

for VMID in $K3S_MASTER_VMID $K3S_WORKER1_VMID $K3S_WORKER2_VMID; do
    echo "  Loading on VM $VMID..."

    LOAD_CMD=$(cat <<'EOFCMD'
if [ -f /tmp/wazuh-mcp-server.tar ]; then
    ctr -n k8s.io image import /tmp/wazuh-mcp-server.tar
    ctr -n k8s.io image import /tmp/n8n-mcp-server.tar
    echo "Images loaded successfully"
else
    # Copy from master if not present
    echo "Images already loaded or copied from master"
fi
EOFCMD
    )

    PID=$(exec_on_vm "$VMID" "$LOAD_CMD")
    if [ -n "$PID" ]; then
        sleep 5
        get_exec_output "$VMID" "$PID"
    fi
done

# Step 4: Deploy Wazuh stack
echo "Step 4: Deploying Wazuh stack..."

DEPLOY_WAZUH_CMD=$(cat <<EOFCMD
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
kubectl apply -f - <<'EOFYAML'
$(cat "$BASE_DIR/wazuh/00-namespace.yaml")
---
$(cat "$BASE_DIR/wazuh/01-secrets.yaml")
---
$(cat "$BASE_DIR/wazuh/02-indexer-statefulset.yaml")
---
$(cat "$BASE_DIR/wazuh/03-manager-deployment.yaml")
---
$(cat "$BASE_DIR/wazuh/04-dashboard-deployment.yaml")
EOFYAML
echo "Wazuh stack deployed"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$DEPLOY_WAZUH_CMD")
if [ -n "$PID" ]; then
    sleep 10
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 5: Deploy n8n stack
echo "Step 5: Deploying n8n stack..."

DEPLOY_N8N_CMD=$(cat <<EOFCMD
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
kubectl apply -f - <<'EOFYAML'
$(cat "$BASE_DIR/n8n/00-namespace.yaml")
---
$(cat "$BASE_DIR/n8n/01-secrets.yaml")
---
$(cat "$BASE_DIR/n8n/02-postgres-statefulset.yaml")
---
$(cat "$BASE_DIR/n8n/03-n8n-deployment.yaml")
EOFYAML
echo "n8n stack deployed"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$DEPLOY_N8N_CMD")
if [ -n "$PID" ]; then
    sleep 10
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 6: Deploy MCP servers
echo "Step 6: Deploying MCP servers..."

DEPLOY_MCP_CMD=$(cat <<EOFCMD
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
kubectl apply -f - <<'EOFYAML'
$(cat "$BASE_DIR/mcp/00-namespace.yaml")
---
$(cat "$BASE_DIR/mcp/01-wazuh-mcp-deployment.yaml")
---
$(cat "$BASE_DIR/mcp/02-n8n-mcp-deployment.yaml")
---
$(cat "$BASE_DIR/mcp/03-keda-scaledobjects.yaml")
EOFYAML
echo "MCP servers deployed"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$DEPLOY_MCP_CMD")
if [ -n "$PID" ]; then
    sleep 10
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 7: Wait for pods to be ready
echo "Step 7: Waiting for pods to be ready..."

WAIT_CMD=$(cat <<'EOFCMD'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo "Waiting for Wazuh pods..."
kubectl wait --for=condition=ready pod -l app=wazuh-indexer -n wazuh --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=wazuh-manager -n wazuh --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=wazuh-dashboard -n wazuh --timeout=300s || true

echo "Waiting for n8n pods..."
kubectl wait --for=condition=ready pod -l app=n8n-postgres -n n8n --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=n8n -n n8n --timeout=300s || true

echo "Waiting for MCP pods..."
kubectl wait --for=condition=ready pod -l app=wazuh-mcp-server -n mcp --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=n8n-mcp-server -n mcp --timeout=300s || true

echo "Pod status:"
kubectl get pods -n wazuh
kubectl get pods -n n8n
kubectl get pods -n mcp
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$WAIT_CMD")
if [ -n "$PID" ]; then
    sleep 60
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 8: Configure Wazuh -> n8n webhook integration
echo "Step 8: Configuring Wazuh -> n8n webhook integration..."

WEBHOOK_CONFIG_CMD=$(cat <<'EOFCMD'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Create Wazuh integration config
kubectl exec -n wazuh deployment/wazuh-manager -- bash -c '
cat > /var/ossec/etc/ossec.conf.d/webhook.conf <<EOF
<ossec_config>
  <integration>
    <name>custom-webhook</name>
    <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
    <level>7</level>
    <alert_format>json</alert_format>
  </integration>
</ossec_config>
EOF
chown root:wazuh /var/ossec/etc/ossec.conf.d/webhook.conf
chmod 640 /var/ossec/etc/ossec.conf.d/webhook.conf
/var/ossec/bin/wazuh-control restart
'
echo "Wazuh webhook configured for Level 7+ alerts to n8n"
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$WEBHOOK_CONFIG_CMD")
if [ -n "$PID" ]; then
    sleep 20
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

# Step 9: Verify deployment
echo "Step 9: Verifying deployment..."

VERIFY_CMD=$(cat <<'EOFCMD'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "=== Deployment Status ==="
echo ""
echo "Namespaces:"
kubectl get ns | grep -E 'wazuh|n8n|mcp'
echo ""
echo "Wazuh Stack:"
kubectl get all -n wazuh
echo ""
echo "n8n Stack:"
kubectl get all -n n8n
echo ""
echo "MCP Servers:"
kubectl get all -n mcp
echo ""
echo "Services:"
kubectl get svc -n wazuh
kubectl get svc -n n8n
kubectl get svc -n mcp
echo ""
echo "PVCs:"
kubectl get pvc -n wazuh
kubectl get pvc -n n8n
EOFCMD
)

PID=$(exec_on_vm "$K3S_MASTER_VMID" "$VERIFY_CMD")
if [ -n "$PID" ]; then
    sleep 10
    get_exec_output "$K3S_MASTER_VMID" "$PID"
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Access URLs:"
echo "  Wazuh Dashboard: http://$K3S_WORKER1_IP:5601"
echo "  Wazuh Manager API: http://$K3S_WORKER1_IP:55000"
echo "  Wazuh Agent Port: $K3S_WORKER1_IP:31514 (TCP)"
echo "  Wazuh Registration: $K3S_WORKER1_IP:31515 (TCP)"
echo "  n8n: http://$K3S_WORKER2_IP:5678 (ClusterIP - requires port-forward)"
echo "  Wazuh MCP: http://$K3S_WORKER2_IP:3000 (ClusterIP - requires port-forward)"
echo "  n8n MCP: http://$K3S_WORKER2_IP:3001 (ClusterIP - requires port-forward)"
echo ""
echo "Credentials:"
echo "  Wazuh API: wazuh-api / MyS3cr3tP@ssw0rd!"
echo "  Wazuh Indexer: admin / SecureP@ssw0rd123"
echo "  n8n PostgreSQL: n8n / n8nP@ssw0rd2024!"
echo ""
echo "Integration:"
echo "  Wazuh alerts (Level 7+) -> n8n webhook"
echo "  Webhook URL: http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts"
echo ""
