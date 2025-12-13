#!/bin/bash
# Remote Deployment Orchestrator
# Deploys Cortex to K3s from your local machine

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${CYAN}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  CORTEX K3S REMOTE DEPLOYMENT                     ║"
echo "║  One-Command Autonomous Installation              ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
log "Checking prerequisites..."

if [ -z "$ANTHROPIC_API_KEY" ]; then
    error "ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY='your-key'"
fi

if [ -z "$GITHUB_TOKEN" ]; then
    error "GITHUB_TOKEN not set. Run: export GITHUB_TOKEN='your-token'"
fi

K3S_MASTER="${K3S_MASTER:-10.88.145.180}"
K3S_USER="${K3S_USER:-cortex}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

success "Prerequisites OK"

# Test SSH connection
log "Testing SSH connection to K3s master..."
if ! ssh -o ConnectTimeout=5 "$K3S_USER@$K3S_MASTER" "echo 'SSH OK'" &>/dev/null; then
    error "Cannot SSH to $K3S_USER@$K3S_MASTER. Check SSH keys or run: ssh-copy-id $K3S_USER@$K3S_MASTER"
fi
success "SSH connection verified"

# Sync files to K3s master
log "Syncing Cortex files to K3s master..."
rsync -avz --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='agents/' \
    --exclude='*.log' \
    "$PROJECT_DIR/" "$K3S_USER@$K3S_MASTER:~/cortex/"
success "Files synced"

# Create remote deployment script
log "Creating deployment script on K3s master..."
ssh "$K3S_USER@$K3S_MASTER" "cat > ~/cortex/deploy-local.sh" <<'REMOTE_SCRIPT'
#!/bin/bash
set -e

export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
cd ~/cortex

echo "🚀 Starting Cortex deployment..."

# Configure NFS on CT 105
echo "📦 Configuring NFS server..."
ssh -o StrictHostKeyChecking=no root@10.88.140.164 "pct exec 105 -- bash -c '
    mkdir -p /var/lib/vz/private/105/cortex-coordination
    chmod 777 /var/lib/vz/private/105/cortex-coordination
    if ! grep -q cortex-coordination /etc/exports; then
        echo \"/var/lib/vz/private/105/cortex-coordination *(rw,sync,no_subtree_check,no_root_squash)\" >> /etc/exports
        exportfs -ra
    fi
    systemctl restart nfs-kernel-server 2>/dev/null || systemctl restart nfs-server
'" 2>/dev/null || echo "⚠️  NFS may need manual setup"

# Deploy to K3s
echo "☸️  Deploying to K3s cluster..."

# Namespace
sudo kubectl apply -f k8s/cortex-k3s/00-namespace.yaml

# Secrets
echo "🔐 Creating secrets..."
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

# ConfigMap
sudo kubectl create configmap cortex-config \
    --namespace=cortex-system \
    --from-literal=k3s-master="10.88.145.180" \
    --from-literal=wazuh-dashboard="https://10.88.140.202" \
    --from-literal=enable-self-evaluation="true" \
    --from-literal=enable-rlhf="true" \
    --from-literal=enable-autonomous-remediation="true" \
    --dry-run=client -o yaml | sudo kubectl apply -f -

# Storage
echo "💾 Deploying NFS storage..."
sudo kubectl apply -f k8s/cortex-k3s/02-storage.yaml

# Wait for PVC
echo "⏳ Waiting for PVC to bind..."
for i in {1..30}; do
    if sudo kubectl get pvc cortex-coordination-pvc -n cortex-system -o jsonpath='{.status.phase}' 2>/dev/null | grep -q Bound; then
        echo "✅ PVC bound"
        break
    fi
    sleep 2
done

# Masters
echo "🤖 Deploying Cortex masters..."
sudo kubectl apply -f k8s/cortex-k3s/03-coordinator-master.yaml
sudo kubectl apply -f k8s/cortex-k3s/04-security-master.yaml
sudo kubectl apply -f k8s/cortex-k3s/05-development-master.yaml
sudo kubectl apply -f k8s/cortex-k3s/06-cicd-master.yaml

# Wazuh
echo "🔒 Deploying Wazuh integration..."
sudo kubectl apply -f k8s/cortex-k3s/07-wazuh-integration.yaml

# Dashboard
echo "📊 Deploying dashboard..."
sudo kubectl apply -f k8s/cortex-k3s/09-dashboard-ingress.yaml

# Wait for pods
echo "⏳ Waiting for pods to start..."
sleep 10

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""

sudo kubectl get pods -n cortex-system -o wide
echo ""
sudo kubectl get svc -n cortex-system

echo ""
echo "🎉 Cortex is running in K3s!"
echo ""
echo "Dashboard:"
DASHBOARD_IP=$(sudo kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -n "$DASHBOARD_IP" ]; then
    echo "  http://$DASHBOARD_IP"
else
    echo "  Check: sudo kubectl get svc cortex-dashboard -n cortex-system"
fi
echo ""
echo "Wazuh: https://10.88.140.202"
echo "Credentials: admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay"
echo ""
REMOTE_SCRIPT

chmod +x ~/cortex/deploy-local.sh

success "Deployment script created"

# Execute deployment remotely
log "Executing deployment on K3s master..."
ssh -t "$K3S_USER@$K3S_MASTER" "
    export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'
    export GITHUB_TOKEN='$GITHUB_TOKEN'
    cd ~/cortex
    ./deploy-local.sh
"

success "Deployment complete!"

# Get status
log "Fetching deployment status..."
ssh "$K3S_USER@$K3S_MASTER" "sudo kubectl get all -n cortex-system"

echo ""
echo "✅ Cortex is now running autonomously in your K3s cluster!"
echo ""
