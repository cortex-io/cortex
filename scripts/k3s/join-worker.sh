#!/bin/bash
# Cortex K3s Worker Join Script
# Joins worker nodes to the K3s cluster

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
K3S_TOKEN="${K3S_TOKEN:-}"
WORKER_NAME="${WORKER_NAME:-}"
WORKER_LABELS="${WORKER_LABELS:-node-role.kubernetes.io/worker=true}"
K3S_VERSION="${K3S_VERSION:-}"  # Empty = latest stable

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
        log_error "This script must be run as root or with sudo access"
        exit 1
    fi
}

# Function to validate parameters
validate_parameters() {
    log_info "Validating parameters..."

    if [ -z "$K3S_TOKEN" ]; then
        log_error "K3S_TOKEN is required"
        echo "Usage: K3S_TOKEN=<token> WORKER_NAME=<name> $0"
        exit 1
    fi

    if [ -z "$WORKER_NAME" ]; then
        log_error "WORKER_NAME is required"
        echo "Usage: K3S_TOKEN=<token> WORKER_NAME=<name> $0"
        exit 1
    fi

    # Test connectivity to control plane
    log_info "Testing connectivity to control plane at ${CONTROL_PLANE_IP}:6443..."

    if ! timeout 5 nc -zv "$CONTROL_PLANE_IP" 6443 2>/dev/null; then
        log_error "Cannot reach control plane at ${CONTROL_PLANE_IP}:6443"
        exit 1
    fi

    log_success "Parameters validated"
}

# Function to install K3s agent
install_k3s_agent() {
    log_info "Installing K3s agent on worker node ${WORKER_NAME}..."

    # Set K3s URL and token
    export K3S_URL="https://${CONTROL_PLANE_IP}:6443"
    export K3S_TOKEN="$K3S_TOKEN"

    # K3s agent options
    local k3s_options=(
        "--node-name=${WORKER_NAME}"
        "--node-label=${WORKER_LABELS}"
    )

    # Add version if specified
    if [ -n "$K3S_VERSION" ]; then
        export INSTALL_K3S_VERSION="$K3S_VERSION"
    fi

    # Export K3s options
    export INSTALL_K3S_EXEC="${k3s_options[*]}"

    log_info "K3s URL: ${K3S_URL}"
    log_info "K3s options: ${INSTALL_K3S_EXEC}"

    # Run installation
    if curl -sfL https://get.k3s.io | sh -; then
        log_success "K3s agent installed successfully"
    else
        log_error "K3s agent installation failed"
        exit 1
    fi
}

# Function to wait for agent to be ready
wait_for_agent() {
    log_info "Waiting for K3s agent to be ready..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if sudo systemctl is-active k3s-agent >/dev/null 2>&1; then
            log_success "K3s agent service is running"
            break
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""

    if [ $attempt -eq $max_attempts ]; then
        log_error "K3s agent did not start within timeout"
        exit 1
    fi
}

# Function to verify node joined cluster
verify_node_joined() {
    log_info "Verifying node joined cluster..."

    # We need to check from the control plane
    log_info "SSH to control plane to verify node status"
    log_info "From control plane, run: kubectl get nodes"

    # If we have kubectl access, try to verify
    if command -v kubectl >/dev/null 2>&1; then
        local max_attempts=30
        local attempt=0

        while [ $attempt -lt $max_attempts ]; do
            local node_status
            node_status=$(kubectl get node "$WORKER_NAME" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")

            if [ "$node_status" = "True" ]; then
                log_success "Worker node ${WORKER_NAME} is Ready in the cluster"
                kubectl get node "$WORKER_NAME" -o wide
                return 0
            fi

            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done

        echo ""
        log_warn "Node may not be Ready yet, check manually"
    else
        log_info "kubectl not available on worker, verify from control plane"
    fi
}

# Function to display agent info
display_agent_info() {
    log_info "Worker Agent Information:"
    echo "================================"

    echo "K3s Version:"
    sudo k3s --version | head -1 || echo "k3s command not available"

    echo ""
    echo "K3s Agent Service Status:"
    sudo systemctl status k3s-agent --no-pager || true

    echo "================================"
}

# Function to create worker health check script
create_health_check_script() {
    local script_path="/usr/local/bin/k3s-worker-health-check.sh"

    log_info "Creating worker health check script..."

    sudo tee "$script_path" >/dev/null <<'EOF'
#!/bin/bash
# K3s Worker Health Check

set -euo pipefail

echo "K3s Worker Health Check"
echo "======================="

# Check K3s agent service
echo "K3s Agent Service Status:"
systemctl is-active k3s-agent || echo "K3s agent service is not active"

# Check kubelet
echo ""
echo "Kubelet Health:"
curl -sk https://localhost:10250/healthz || echo "Kubelet health check failed"

# Check containerd
echo ""
echo "Containerd Status:"
systemctl is-active containerd || echo "Containerd is not active"

echo ""
echo "======================="
echo "Health check complete"
EOF

    sudo chmod +x "$script_path"
    log_success "Health check script created at ${script_path}"
}

# Main function
main() {
    log_info "Starting K3s worker join process"

    # Check root
    check_root

    # Validate parameters
    validate_parameters

    # Check if K3s agent is already installed
    if command -v k3s >/dev/null 2>&1; then
        log_warn "K3s is already installed"

        if sudo systemctl is-active k3s-agent >/dev/null 2>&1; then
            log_info "K3s agent service is already running"
            display_agent_info
            exit 0
        else
            log_warn "K3s agent service is not running, attempting to start..."
            sudo systemctl start k3s-agent
        fi
    else
        # Install K3s agent
        install_k3s_agent
    fi

    # Wait for agent to be ready
    wait_for_agent

    # Verify node joined
    verify_node_joined

    # Create health check script
    create_health_check_script

    # Display agent info
    display_agent_info

    log_success "K3s worker ${WORKER_NAME} joined successfully"
    echo ""
    log_info "Verify from control plane:"
    log_info "  ssh cortex@${CONTROL_PLANE_IP}"
    log_info "  kubectl get nodes"
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
