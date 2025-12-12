#!/bin/bash
# Cortex K3s Control Plane Installation Script
# Installs K3s on the control plane node (VM 110)

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
CONTROL_PLANE_IP="${CONTROL_PLANE_IP:-10.88.140.152}"
K3S_VERSION="${K3S_VERSION:-}"  # Empty = latest stable
K3S_TOKEN_FILE="/var/lib/rancher/k3s/server/node-token"
KUBECONFIG_FILE="/etc/rancher/k3s/k3s.yaml"

# Function to check if running on control plane
check_environment() {
    log_info "Checking environment..."

    # Check if we're root or have sudo
    if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
        log_error "This script must be run as root or with sudo access"
        exit 1
    fi

    # Check internet connectivity
    if ! timeout 5 curl -s https://get.k3s.io >/dev/null; then
        log_error "Cannot reach K3s installation endpoint"
        exit 1
    fi

    log_success "Environment check passed"
}

# Function to install K3s
install_k3s() {
    log_info "Installing K3s control plane..."

    local install_cmd="curl -sfL https://get.k3s.io | sh -s - server"

    # K3s installation options
    local k3s_options=(
        "--write-kubeconfig-mode=644"           # Make kubeconfig readable
        "--disable=traefik"                     # Disable Traefik (we'll use our own ingress)
        "--disable=servicelb"                   # Disable ServiceLB (we'll use MetalLB)
        "--flannel-backend=vxlan"               # Use VXLAN for Flannel CNI
        "--node-name=cortex-k3s-control"        # Set node name
        "--cluster-cidr=10.42.0.0/16"          # Pod CIDR
        "--service-cidr=10.43.0.0/16"          # Service CIDR
        "--kube-apiserver-arg=service-node-port-range=30000-32767"  # NodePort range
    )

    # Add version if specified
    if [ -n "$K3S_VERSION" ]; then
        export INSTALL_K3S_VERSION="$K3S_VERSION"
    fi

    # Export K3s options
    export INSTALL_K3S_EXEC="${k3s_options[*]}"

    log_info "K3s options: ${INSTALL_K3S_EXEC}"

    # Run installation
    if curl -sfL https://get.k3s.io | sh -; then
        log_success "K3s installed successfully"
    else
        log_error "K3s installation failed"
        exit 1
    fi
}

# Function to wait for K3s to be ready
wait_for_k3s() {
    log_info "Waiting for K3s to be ready..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if sudo k3s kubectl get nodes >/dev/null 2>&1; then
            log_success "K3s API server is responding"
            break
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""

    if [ $attempt -eq $max_attempts ]; then
        log_error "K3s did not become ready within timeout"
        exit 1
    fi

    # Wait for control plane node to be Ready
    log_info "Waiting for control plane node to be Ready..."
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local node_status
        node_status=$(sudo k3s kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")

        if [ "$node_status" = "True" ]; then
            log_success "Control plane node is Ready"
            break
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""

    if [ $attempt -eq $max_attempts ]; then
        log_error "Control plane node did not become Ready within timeout"
        exit 1
    fi
}

# Function to verify system pods
verify_system_pods() {
    log_info "Verifying system pods..."

    # Wait for CoreDNS
    log_info "Waiting for CoreDNS..."
    if ! sudo k3s kubectl wait --for=condition=ready pod -l k8s-app=kube-dns -n kube-system --timeout=120s; then
        log_error "CoreDNS pods did not become ready"
        exit 1
    fi

    log_success "CoreDNS is ready"

    # Wait for metrics-server
    log_info "Waiting for metrics-server..."
    if ! sudo k3s kubectl wait --for=condition=ready pod -l k8s-app=metrics-server -n kube-system --timeout=120s; then
        log_warn "Metrics-server pods did not become ready (may start later)"
    else
        log_success "Metrics-server is ready"
    fi

    # Display pod status
    log_info "System pods status:"
    sudo k3s kubectl get pods -n kube-system
}

# Function to extract and save K3s token
save_k3s_token() {
    log_info "Extracting K3s token..."

    if [ ! -f "$K3S_TOKEN_FILE" ]; then
        log_error "K3s token file not found at ${K3S_TOKEN_FILE}"
        exit 1
    fi

    local token
    token=$(sudo cat "$K3S_TOKEN_FILE")

    # Save to accessible location
    echo "$token" | sudo tee /tmp/k3s-token.txt >/dev/null
    sudo chmod 644 /tmp/k3s-token.txt

    log_success "K3s token saved to /tmp/k3s-token.txt"
    log_info "Token: ${token}"

    echo "$token"
}

# Function to configure kubeconfig for external access
configure_kubeconfig() {
    log_info "Configuring kubeconfig for external access..."

    if [ ! -f "$KUBECONFIG_FILE" ]; then
        log_error "Kubeconfig file not found at ${KUBECONFIG_FILE}"
        exit 1
    fi

    # Create external kubeconfig
    local external_kubeconfig="/tmp/k3s-kubeconfig.yaml"

    sudo cp "$KUBECONFIG_FILE" "$external_kubeconfig"

    # Replace localhost/127.0.0.1 with actual IP
    sudo sed -i "s/127.0.0.1/${CONTROL_PLANE_IP}/g" "$external_kubeconfig"
    sudo sed -i "s/localhost/${CONTROL_PLANE_IP}/g" "$external_kubeconfig"

    sudo chmod 644 "$external_kubeconfig"

    log_success "External kubeconfig created at ${external_kubeconfig}"
    log_info "To use this kubeconfig:"
    log_info "  export KUBECONFIG=${external_kubeconfig}"
    log_info "  kubectl get nodes"

    echo "$external_kubeconfig"
}

# Function to display cluster info
display_cluster_info() {
    log_info "Cluster Information:"
    echo "================================"

    echo "K3s Version:"
    sudo k3s --version | head -1

    echo ""
    echo "Nodes:"
    sudo k3s kubectl get nodes -o wide

    echo ""
    echo "System Namespaces:"
    sudo k3s kubectl get ns

    echo ""
    echo "System Pods:"
    sudo k3s kubectl get pods -n kube-system

    echo "================================"
}

# Function to create cluster health check script
create_health_check_script() {
    local script_path="/usr/local/bin/k3s-health-check.sh"

    log_info "Creating cluster health check script..."

    sudo tee "$script_path" >/dev/null <<'EOF'
#!/bin/bash
# K3s Cluster Health Check

set -euo pipefail

echo "K3s Cluster Health Check"
echo "========================"

# Check K3s service
echo "K3s Service Status:"
systemctl is-active k3s || echo "K3s service is not active"

# Check nodes
echo ""
echo "Nodes:"
k3s kubectl get nodes

# Check system pods
echo ""
echo "System Pods:"
k3s kubectl get pods -n kube-system

# Check API server
echo ""
echo "API Server Health:"
k3s kubectl get --raw /healthz

echo ""
echo "========================"
echo "Health check complete"
EOF

    sudo chmod +x "$script_path"
    log_success "Health check script created at ${script_path}"
}

# Main function
main() {
    log_info "Starting K3s control plane installation"

    # Check environment
    check_environment

    # Check if K3s is already installed
    if command -v k3s >/dev/null 2>&1; then
        log_warn "K3s is already installed"

        if sudo systemctl is-active k3s >/dev/null 2>&1; then
            log_info "K3s service is running"
            display_cluster_info
            exit 0
        else
            log_warn "K3s service is not running, attempting to start..."
            sudo systemctl start k3s
        fi
    else
        # Install K3s
        install_k3s
    fi

    # Wait for K3s to be ready
    wait_for_k3s

    # Verify system pods
    verify_system_pods

    # Save K3s token
    k3s_token=$(save_k3s_token)

    # Configure kubeconfig
    kubeconfig=$(configure_kubeconfig)

    # Create health check script
    create_health_check_script

    # Display cluster info
    display_cluster_info

    log_success "K3s control plane installation complete"
    echo ""
    log_info "Join workers with:"
    log_info "  K3S_URL=https://${CONTROL_PLANE_IP}:6443"
    log_info "  K3S_TOKEN=${k3s_token}"
    echo ""
    log_info "Access cluster with:"
    log_info "  export KUBECONFIG=${kubeconfig}"
    log_info "  kubectl get nodes"
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
