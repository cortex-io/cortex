#!/bin/bash
set -euo pipefail

# Complete Wazuh + n8n + MCP deployment with image building
# Uses SSH to k3s master node for building and deploying

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment
source /Users/ryandahlberg/Projects/cortex/.env

K3S_MASTER_SSH="root@${K3S_MASTER_IP}"

echo "=========================================="
echo "Wazuh + n8n + MCP Complete Deployment"
echo "=========================================="
echo "K3s Master: $K3S_MASTER_IP"
echo ""

# Function to run command on k3s master
run_on_master() {
    ssh -o StrictHostKeyChecking=no "$K3S_MASTER_SSH" "$@"
}

# Step 1: Build Docker images on k3s master
echo "Step 1: Building Docker images on k3s master..."

run_on_master bash <<'EOFBUILD'
set -e

# Build wazuh-mcp-server
echo "Building wazuh-mcp-server..."
cd /tmp
rm -rf wazuh-mcp-server
git clone https://github.com/ry-ops/wazuh-mcp-server.git
cd wazuh-mcp-server
docker build -t wazuh-mcp-server:latest .
echo "✓ wazuh-mcp-server built"

# Build n8n-mcp-server
echo "Building n8n-mcp-server..."
cd /tmp
rm -rf n8n-mcp-server
git clone https://github.com/ry-ops/n8n-mcp-server.git
cd n8n-mcp-server
docker build -t n8n-mcp-server:latest .
echo "✓ n8n-mcp-server built"

# Save images
echo "Saving images to tar..."
docker save wazuh-mcp-server:latest -o /tmp/wazuh-mcp.tar
docker save n8n-mcp-server:latest -o /tmp/n8n-mcp.tar

# Import to containerd
echo "Importing to containerd..."
ctr -n k8s.io image import /tmp/wazuh-mcp.tar
ctr -n k8s.io image import /tmp/n8n-mcp.tar

echo "✓ Images built and loaded"
EOFBUILD

echo ""

# Step 2: Copy images to worker nodes
echo "Step 2: Distributing images to worker nodes..."

for WORKER_IP in "$K3S_WORKER1_IP" "$K3S_WORKER2_IP"; do
    echo "  Copying to $WORKER_IP..."
    run_on_master "scp -o StrictHostKeyChecking=no /tmp/wazuh-mcp.tar /tmp/n8n-mcp.tar root@${WORKER_IP}:/tmp/" || echo "    Warning: Failed to copy to $WORKER_IP"

    ssh -o StrictHostKeyChecking=no "root@${WORKER_IP}" bash <<'EOFLOAD'
ctr -n k8s.io image import /tmp/wazuh-mcp.tar
ctr -n k8s.io image import /tmp/n8n-mcp.tar
rm /tmp/wazuh-mcp.tar /tmp/n8n-mcp.tar
echo "✓ Images loaded"
EOFLOAD
done

echo ""

# Step 3: Create temporary manifest directory on master
echo "Step 3: Uploading manifests to k3s master..."

# Create combined manifest
MANIFEST_FILE="/tmp/wazuh-n8n-mcp-all.yaml"
cat "$BASE_DIR/wazuh/"*.yaml > "$MANIFEST_FILE"
echo "---" >> "$MANIFEST_FILE"
cat "$BASE_DIR/n8n/"*.yaml >> "$MANIFEST_FILE"
echo "---" >> "$MANIFEST_FILE"
cat "$BASE_DIR/mcp/"*.yaml >> "$MANIFEST_FILE"

# Copy to master
scp -o StrictHostKeyChecking=no "$MANIFEST_FILE" "${K3S_MASTER_SSH}:/tmp/"

echo ""

# Step 4: Deploy all stacks
echo "Step 4: Deploying all stacks..."

run_on_master bash <<'EOFDEPLOY'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "Deploying all manifests..."
kubectl apply -f /tmp/wazuh-n8n-mcp-all.yaml

echo ""
echo "Waiting for pods to start..."
sleep 10

echo ""
echo "=== Wazuh Stack ==="
kubectl get pods -n wazuh

echo ""
echo "=== n8n Stack ==="
kubectl get pods -n n8n

echo ""
echo "=== MCP Servers ==="
kubectl get pods -n mcp
EOFDEPLOY

echo ""

# Step 5: Wait for core services
echo "Step 5: Waiting for core services to be ready..."

run_on_master bash <<'EOFWAIT'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "Waiting for Wazuh Indexer..."
kubectl wait --for=condition=ready pod -l app=wazuh-indexer -n wazuh --timeout=180s || echo "  (still starting...)"

echo "Waiting for Wazuh Manager..."
kubectl wait --for=condition=ready pod -l app=wazuh-manager -n wazuh --timeout=180s || echo "  (still starting...)"

echo "Waiting for n8n PostgreSQL..."
kubectl wait --for=condition=ready pod -l app=n8n-postgres -n n8n --timeout=180s || echo "  (still starting...)"

echo "Waiting for n8n..."
kubectl wait --for=condition=ready pod -l app=n8n -n n8n --timeout=180s || echo "  (still starting...)"
EOFWAIT

echo ""

# Step 6: Configure Wazuh webhook
echo "Step 6: Configuring Wazuh -> n8n webhook integration..."

run_on_master bash <<'EOFWEBHOOK'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Wait a bit more for Wazuh Manager
sleep 30

MANAGER_POD=$(kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}')

if [ -n "$MANAGER_POD" ]; then
    echo "Configuring webhook in $MANAGER_POD..."
    kubectl exec -n wazuh "$MANAGER_POD" -- bash -c '
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
echo "✓ Webhook configured"
'
    # Restart Wazuh to apply config
    kubectl rollout restart deployment/wazuh-manager -n wazuh
else
    echo "⚠ Wazuh Manager pod not found yet"
fi
EOFWEBHOOK

echo ""

# Step 7: Final status
echo "Step 7: Deployment verification..."

run_on_master bash <<'EOFSTATUS'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo ""
echo "=== FINAL STATUS ==="
echo ""
echo "Namespaces:"
kubectl get ns | grep -E 'NAME|wazuh|n8n|mcp'

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
echo "PVCs:"
kubectl get pvc --all-namespaces | grep -E 'NAMESPACE|wazuh|n8n'

echo ""
echo "Services:"
kubectl get svc -n wazuh
kubectl get svc -n n8n
kubectl get svc -n mcp
EOFSTATUS

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Access Points:"
echo "  Wazuh Dashboard: http://${K3S_WORKER1_IP}:5601"
echo "  Wazuh Manager API: http://${K3S_WORKER1_IP}:55000"
echo "  Wazuh Agent Port: ${K3S_WORKER1_IP}:31514 (TCP)"
echo ""
echo "To access n8n and MCP servers (ClusterIP):"
echo "  kubectl port-forward -n n8n svc/n8n 5678:5678"
echo "  kubectl port-forward -n mcp svc/wazuh-mcp-server 3000:3000"
echo "  kubectl port-forward -n mcp svc/n8n-mcp-server 3001:3001"
echo ""
echo "Credentials:"
echo "  Wazuh API: wazuh-api / MyS3cr3tP@ssw0rd!"
echo "  Wazuh Indexer: admin / SecureP@ssw0rd123"
echo ""
echo "Integration:"
echo "  Wazuh Level 7+ alerts -> n8n webhook"
echo "  Webhook: http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts"
echo ""
