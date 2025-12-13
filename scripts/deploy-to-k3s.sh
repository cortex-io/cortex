#!/bin/bash
# Deploy Cortex to K3s Cluster - Full Autonomous Stack
# Deploys: Masters, Wazuh Integration, GitOps, Full Autonomy

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
K8S_DIR="$PROJECT_ROOT/k8s/cortex-k3s"

# K3s cluster info
K3S_MASTER="10.88.145.180"
K3S_USER="${K3S_USER:-cortex}"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-$HOME/.kube/cortex-k3s-config}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date +'%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

# Step 1: Get kubeconfig from K3s master
get_kubeconfig() {
    log "Fetching kubeconfig from K3s master ${K3S_MASTER}..."

    if ssh "${K3S_USER}@${K3S_MASTER}" "test -f /etc/rancher/k3s/k3s.yaml"; then
        scp "${K3S_USER}@${K3S_MASTER}:/etc/rancher/k3s/k3s.yaml" "$KUBECONFIG_PATH"

        # Update server URL
        sed -i.bak "s/127.0.0.1/${K3S_MASTER}/g" "$KUBECONFIG_PATH"

        export KUBECONFIG="$KUBECONFIG_PATH"
        success "Kubeconfig saved to $KUBECONFIG_PATH"
    else
        error "K3s not found on ${K3S_MASTER}. Is it installed?"
        exit 1
    fi
}

# Step 2: Verify K3s cluster
verify_cluster() {
    log "Verifying K3s cluster..."

    if ! kubectl cluster-info &>/dev/null; then
        error "Cannot connect to K3s cluster"
        exit 1
    fi

    local nodes=$(kubectl get nodes --no-headers | wc -l)
    success "K3s cluster accessible ($nodes nodes)"

    kubectl get nodes
}

# Step 3: Create secrets from environment
create_secrets() {
    log "Creating secrets..."

    if [ -z "$ANTHROPIC_API_KEY" ]; then
        error "ANTHROPIC_API_KEY not set. Export it first."
        exit 1
    fi

    if [ -z "$GITHUB_TOKEN" ]; then
        error "GITHUB_TOKEN not set. Export it first."
        exit 1
    fi

    # Create secrets.env file
    cat > "$K8S_DIR/secrets.env" <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}
WAZUH_URL=https://10.88.140.202:55000
WAZUH_USER=admin
WAZUH_PASSWORD=*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
PROXMOX_HOST=10.88.140.164
PROXMOX_TOKEN=root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7
NFS_SERVER=10.88.140.164
NFS_PATH=/var/lib/vz/private/105/cortex-coordination
EOF

    success "Secrets file created"
}

# Step 4: Prepare NFS server (CT 105)
prepare_nfs() {
    log "Preparing NFS server on CT 105..."

    # SSH to Proxmox host, execute in CT 105
    ssh root@10.88.140.164 "pct exec 105 -- bash -c '
        mkdir -p /var/lib/vz/private/105/cortex-coordination
        chmod 777 /var/lib/vz/private/105/cortex-coordination

        # Ensure NFS exports
        if ! grep -q cortex-coordination /etc/exports; then
            echo \"/var/lib/vz/private/105/cortex-coordination *(rw,sync,no_subtree_check,no_root_squash)\" >> /etc/exports
            exportfs -ra
        fi

        systemctl restart nfs-kernel-server || systemctl restart nfs-server
        echo \"NFS server ready\"
    '"

    success "NFS server configured"
}

# Step 5: Deploy Cortex to K3s
deploy_cortex() {
    log "Deploying Cortex to K3s cluster..."

    cd "$K8S_DIR"

    # Apply manifests in order
    local manifests=(
        "00-namespace.yaml"
        "01-secrets.yaml"
        "02-storage.yaml"
        "03-coordinator-master.yaml"
        "04-security-master.yaml"
        "05-development-master.yaml"
        "06-cicd-master.yaml"
        "07-wazuh-integration.yaml"
        "09-dashboard-ingress.yaml"
    )

    for manifest in "${manifests[@]}"; do
        log "Applying $manifest..."
        envsubst < "$manifest" | kubectl apply -f -
    done

    success "All manifests applied"
}

# Step 6: Wait for pods to be ready
wait_for_pods() {
    log "Waiting for Cortex masters to be ready..."

    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=cortex \
        -n cortex-system \
        --timeout=300s

    success "All Cortex masters are ready!"
}

# Step 7: Install Flux (optional)
install_flux() {
    if command -v flux &>/dev/null; then
        log "Installing Flux CD..."

        flux bootstrap github \
            --owner=ry-ops \
            --repository=cortex \
            --branch=docker-container \
            --path=k8s/cortex-k3s \
            --personal \
            --token-auth

        success "Flux CD installed and watching repository"
    else
        warn "Flux CLI not found. Skipping GitOps setup."
        warn "Install Flux: https://fluxcd.io/docs/installation/"
    fi
}

# Step 8: Display status
show_status() {
    echo ""
    echo "=========================================="
    echo "  CORTEX DEPLOYED TO K3S CLUSTER"
    echo "=========================================="
    echo ""

    log "Pods:"
    kubectl get pods -n cortex-system
    echo ""

    log "Services:"
    kubectl get svc -n cortex-system
    echo ""

    log "Dashboard URL:"
    local dashboard_ip=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -n "$dashboard_ip" ]; then
        echo "  http://$dashboard_ip"
    else
        echo "  Pending LoadBalancer IP assignment..."
    fi
    echo ""

    log "Wazuh Integration:"
    echo "  Wazuh Dashboard: https://10.88.140.202"
    echo "  Wazuh Agents:"
    kubectl get pods -n cortex-system -l app=wazuh-agent
    echo ""

    log "Next Steps:"
    echo "  1. Access dashboard at the URL above"
    echo "  2. Submit a task to test worker spawning"
    echo "  3. Check Wazuh dashboard for agent connections"
    echo "  4. Verify GitOps: Make a change and push to GitHub"
    echo ""

    success "Deployment complete! Cortex is now fully autonomous."
}

# Main execution
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║  CORTEX → K3S DEPLOYMENT                          ║"
    echo "║  Autonomous AI Orchestration Stack                ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo ""

    get_kubeconfig
    verify_cluster
    create_secrets
    prepare_nfs
    deploy_cortex
    wait_for_pods
    install_flux
    show_status
}

main "$@"
