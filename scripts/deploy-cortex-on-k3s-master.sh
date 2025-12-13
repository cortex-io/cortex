#!/bin/bash
# Deploy Cortex from K3s Master Node
# Run this script ON the K3s master (10.88.145.180)

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${CYAN}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  CORTEX K3S DEPLOYMENT                            ║"
echo "║  Running on K3s Master Node                       ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check we're on the right machine
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [[ ! "$CURRENT_IP" =~ ^10\.88\.145\. ]]; then
    warn "This script should run on K3s master (10.88.145.180)"
    warn "Current IP: $CURRENT_IP"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# Check environment variables
log "Checking environment variables..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
    error "ANTHROPIC_API_KEY not set"
    echo "  Run: export ANTHROPIC_API_KEY='your-key'"
    exit 1
fi
if [ -z "$GITHUB_TOKEN" ]; then
    error "GITHUB_TOKEN not set"
    echo "  Run: export GITHUB_TOKEN='your-token'"
    exit 1
fi
success "Environment variables set"

# Set paths
MANIFEST_DIR="./k8s/cortex-k3s"
export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"

# Check kubectl access
log "Verifying kubectl access..."
if ! sudo kubectl cluster-info &>/dev/null; then
    error "Cannot access K3s cluster"
    exit 1
fi
success "K3s cluster accessible"

# Show cluster info
log "Cluster nodes:"
sudo kubectl get nodes

# Prepare NFS on CT 105 (via Proxmox host)
log "Preparing NFS server (CT 105)..."
ssh root@10.88.140.164 "pct exec 105 -- bash -c '
    mkdir -p /var/lib/vz/private/105/cortex-coordination
    chmod 777 /var/lib/vz/private/105/cortex-coordination

    # Configure NFS export
    if ! grep -q cortex-coordination /etc/exports; then
        echo \"/var/lib/vz/private/105/cortex-coordination *(rw,sync,no_subtree_check,no_root_squash)\" >> /etc/exports
        exportfs -ra
    fi

    systemctl restart nfs-kernel-server 2>/dev/null || systemctl restart nfs-server
    systemctl status nfs-server --no-pager | head -3
'" && success "NFS server configured" || warn "NFS setup may need manual attention"

# Create secrets file
log "Creating secrets file..."
cat > "$MANIFEST_DIR/secrets.env" <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}
EOF
success "Secrets file created"

# Deploy namespace first
log "Creating cortex-system namespace..."
envsubst < "$MANIFEST_DIR/00-namespace.yaml" | sudo kubectl apply -f -

# Create secrets
log "Creating secrets..."
sudo kubectl create secret generic cortex-credentials \
    --namespace=cortex-system \
    --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY" \
    --from-literal=github-token="$GITHUB_TOKEN" \
    --from-literal=github-user="ry-ops" \
    --from-literal=wazuh-url="https://10.88.140.202:55000" \
    --from-literal=wazuh-user="admin" \
    --from-literal=wazuh-password='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
    --from-literal=proxmox-host="10.88.140.164" \
    --from-literal=proxmox-token='root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7' \
    --from-literal=nfs-server="10.88.140.164" \
    --from-literal=nfs-path="/var/lib/vz/private/105/cortex-coordination" \
    --dry-run=client -o yaml | sudo kubectl apply -f -

# Create ConfigMap
log "Creating configmap..."
envsubst < "$MANIFEST_DIR/01-secrets.yaml" | grep -A 100 "kind: ConfigMap" | sudo kubectl apply -f -

# Deploy storage
log "Deploying NFS storage..."
sudo kubectl apply -f "$MANIFEST_DIR/02-storage.yaml"

# Wait for PVC to bind
log "Waiting for PVC to bind..."
for i in {1..30}; do
    PVC_STATUS=$(sudo kubectl get pvc cortex-coordination-pvc -n cortex-system -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    if [ "$PVC_STATUS" = "Bound" ]; then
        success "PVC bound successfully"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Deploy masters
log "Deploying Cortex masters..."
for manifest in 03-coordinator-master.yaml 04-security-master.yaml 05-development-master.yaml 06-cicd-master.yaml; do
    log "  Applying $manifest..."
    envsubst < "$MANIFEST_DIR/$manifest" | sudo kubectl apply -f -
done

# Deploy Wazuh integration
log "Deploying Wazuh integration..."
sudo kubectl apply -f "$MANIFEST_DIR/07-wazuh-integration.yaml"

# Deploy dashboard
log "Deploying dashboard..."
sudo kubectl apply -f "$MANIFEST_DIR/09-dashboard-ingress.yaml"

# Wait for pods to be ready
log "Waiting for pods to start (this may take 2-3 minutes)..."
sudo kubectl wait --for=condition=ready pod \
    -l app.kubernetes.io/name=cortex \
    -n cortex-system \
    --timeout=300s 2>&1 | grep -v "error:" || warn "Some pods may still be starting"

# Show status
echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""

log "Pods:"
sudo kubectl get pods -n cortex-system -o wide

echo ""
log "Services:"
sudo kubectl get svc -n cortex-system

echo ""
log "Dashboard:"
DASHBOARD_IP=$(sudo kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -n "$DASHBOARD_IP" ]; then
    echo "  http://$DASHBOARD_IP"
else
    DASHBOARD_PORT=$(sudo kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null)
    echo "  http://10.88.145.180:${DASHBOARD_PORT:-30000} (NodePort)"
fi

echo ""
log "Next steps:"
echo "  1. Access dashboard at URL above"
echo "  2. Check Wazuh: https://10.88.140.202"
echo "  3. Submit a test task"
echo ""
success "Cortex is now running in K3s!"
