#!/bin/bash
# Cortex K3s Cluster Bootstrap Orchestration Script
# Complete end-to-end deployment of K3s cluster on Proxmox

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_phase() { echo -e "${MAGENTA}[PHASE]${NC} $1"; }

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXMOX_SCRIPTS="${SCRIPT_DIR}/proxmox"
K3S_SCRIPTS="${SCRIPT_DIR}/k3s"

# Configuration from handoff file
PROXMOX_HOST="${PROXMOX_HOST:-10.88.140.151}"
PROXMOX_PORT="${PROXMOX_PORT:-8006}"
PROXMOX_NODE="${PROXMOX_NODE:-pve}"
PROXMOX_TOKEN_ID="${PROXMOX_TOKEN_ID:-root@pam!n8n}"
PROXMOX_TOKEN_VALUE="${PROXMOX_TOKEN_VALUE:-b8cc165f-0153-43bb-a48a-5d7459587ca7}"

# VM specifications
declare -A CONTROL_PLANE=(
    [vm_id]=110
    [hostname]="cortex-k3s-control"
    [ip]="10.88.140.152"
    [netmask]="255.255.255.224"
    [gateway]="10.88.140.144"
    [cpu]=4
    [memory]=8192
    [disk]="40G"
)

declare -A WORKER_01=(
    [vm_id]=111
    [hostname]="cortex-k3s-worker-01"
    [ip]="10.88.140.153"
    [netmask]="255.255.255.224"
    [gateway]="10.88.140.144"
    [cpu]=4
    [memory]=8192
    [disk]="40G"
)

declare -A WORKER_02=(
    [vm_id]=112
    [hostname]="cortex-k3s-worker-02"
    [ip]="10.88.140.154"
    [netmask]="255.255.255.224"
    [gateway]="10.88.140.144"
    [cpu]=4
    [memory]=8192
    [disk]="40G"
)

# Deployment state
DEPLOYMENT_LOG="/tmp/cortex-k3s-bootstrap-$(date +%Y%m%d-%H%M%S).log"
STATE_FILE="/tmp/cortex-k3s-bootstrap-state.json"

# Function to initialize deployment state
init_deployment_state() {
    log_info "Initializing deployment state..."

    cat > "$STATE_FILE" <<EOF
{
  "deployment_id": "k3s-bootstrap-$(date +%Y%m%d-%H%M%S)",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "phase": "initialization",
  "vms_created": [],
  "vms_started": [],
  "control_plane_ready": false,
  "workers_joined": [],
  "cluster_ready": false
}
EOF

    log_success "Deployment state initialized: ${STATE_FILE}"
}

# Function to update deployment state
update_state() {
    local key=$1
    local value=$2

    if command -v jq >/dev/null 2>&1; then
        local temp_file
        temp_file=$(mktemp)
        jq ".${key} = ${value}" "$STATE_FILE" > "$temp_file"
        mv "$temp_file" "$STATE_FILE"
    fi
}

# Function to display banner
display_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗         ║
║  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝         ║
║  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝          ║
║  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗          ║
║  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗         ║
║   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝         ║
║                                                               ║
║        K3s Cluster Bootstrap - Infrastructure Phase          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Function to validate prerequisites
validate_prerequisites() {
    log_phase "Validating Prerequisites"

    local missing_deps=()

    # Check required commands
    for cmd in curl jq ssh nc; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install with: brew install ${missing_deps[*]}"
        exit 1
    fi

    log_success "All prerequisites met"

    # Test Proxmox connectivity
    log_info "Testing Proxmox API connectivity..."

    if timeout 5 curl -k -s "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/version" \
        -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_VALUE}" >/dev/null 2>&1; then
        log_success "Proxmox API is accessible"
    else
        log_error "Cannot connect to Proxmox API at ${PROXMOX_HOST}:${PROXMOX_PORT}"
        exit 1
    fi

    # Validate network configuration
    log_info "Validating network configuration..."
    if bash "${PROXMOX_SCRIPTS}/configure-network.sh"; then
        log_success "Network configuration validated"
    else
        log_warn "Network validation had warnings, but continuing..."
    fi
}

# Function to create VMs
create_vms() {
    log_phase "Creating Virtual Machines on Proxmox"

    local vms=(
        "CONTROL_PLANE"
        "WORKER_01"
        "WORKER_02"
    )

    for vm_ref in "${vms[@]}"; do
        local -n vm=$vm_ref

        log_step "Creating VM ${vm[vm_id]}: ${vm[hostname]}"

        if bash "${PROXMOX_SCRIPTS}/create-vm.sh" \
            "${vm[vm_id]}" \
            "${vm[hostname]}" \
            "${vm[ip]}" \
            "${vm[netmask]}" \
            "${vm[gateway]}" \
            "${vm[cpu]}" \
            "${vm[memory]}" \
            "${vm[disk]}"; then

            log_success "VM ${vm[vm_id]} created successfully"
            update_state "vms_created" "$(jq '.vms_created + ["'${vm[vm_id]}'"]' "$STATE_FILE" | jq -c '.vms_created')"
        else
            log_error "Failed to create VM ${vm[vm_id]}"
            exit 1
        fi

        sleep 5
    done

    log_success "All VMs created"
}

# Function to wait for VMs to be ready
wait_for_vms_ready() {
    log_phase "Waiting for VMs to Complete Cloud-Init"

    local vms=(
        "${CONTROL_PLANE[ip]}"
        "${WORKER_01[ip]}"
        "${WORKER_02[ip]}"
    )

    for vm_ip in "${vms[@]}"; do
        log_step "Waiting for VM at ${vm_ip} to be ready..."

        local max_attempts=60
        local attempt=0

        while [ $attempt -lt $max_attempts ]; do
            if timeout 3 ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 "cortex@${vm_ip}" "test -f /var/log/cortex-init-complete.log" >/dev/null 2>&1; then
                log_success "VM at ${vm_ip} is ready"
                break
            fi

            attempt=$((attempt + 1))
            echo -n "."
            sleep 5
        done

        echo ""

        if [ $attempt -eq $max_attempts ]; then
            log_warn "VM at ${vm_ip} may not be fully initialized, but continuing..."
        fi
    done

    log_success "All VMs are ready for K3s installation"
}

# Function to install K3s control plane
install_control_plane() {
    log_phase "Installing K3s Control Plane"

    local control_ip="${CONTROL_PLANE[ip]}"

    log_step "Installing K3s on control plane (${control_ip})..."

    # Copy installation script to control plane
    if scp -o StrictHostKeyChecking=no "${K3S_SCRIPTS}/install-control-plane.sh" "cortex@${control_ip}:/tmp/"; then
        log_success "Installation script copied to control plane"
    else
        log_error "Failed to copy installation script"
        exit 1
    fi

    # Execute installation script
    if ssh -o StrictHostKeyChecking=no "cortex@${control_ip}" "sudo bash /tmp/install-control-plane.sh"; then
        log_success "K3s control plane installed successfully"
        update_state "control_plane_ready" "true"
    else
        log_error "Failed to install K3s control plane"
        exit 1
    fi

    # Retrieve K3s token
    log_info "Retrieving K3s token..."

    K3S_TOKEN=$(ssh -o StrictHostKeyChecking=no "cortex@${control_ip}" "sudo cat /tmp/k3s-token.txt")

    if [ -n "$K3S_TOKEN" ]; then
        log_success "K3s token retrieved"
        echo "$K3S_TOKEN" > /tmp/k3s-token.txt
    else
        log_error "Failed to retrieve K3s token"
        exit 1
    fi

    # Retrieve kubeconfig
    log_info "Retrieving kubeconfig..."

    if scp -o StrictHostKeyChecking=no "cortex@${control_ip}:/tmp/k3s-kubeconfig.yaml" /tmp/k3s-kubeconfig.yaml; then
        log_success "Kubeconfig retrieved"
        export KUBECONFIG=/tmp/k3s-kubeconfig.yaml
    else
        log_error "Failed to retrieve kubeconfig"
        exit 1
    fi
}

# Function to join worker nodes
join_workers() {
    log_phase "Joining Worker Nodes to Cluster"

    local workers=(
        "WORKER_01"
        "WORKER_02"
    )

    for worker_ref in "${workers[@]}"; do
        local -n worker=$worker_ref

        log_step "Joining worker ${worker[hostname]} (${worker[ip]})..."

        # Copy join script to worker
        if scp -o StrictHostKeyChecking=no "${K3S_SCRIPTS}/join-worker.sh" "cortex@${worker[ip]}:/tmp/"; then
            log_success "Join script copied to ${worker[hostname]}"
        else
            log_error "Failed to copy join script to ${worker[hostname]}"
            exit 1
        fi

        # Execute join script
        if ssh -o StrictHostKeyChecking=no "cortex@${worker[ip]}" \
            "K3S_TOKEN=${K3S_TOKEN} CONTROL_PLANE_IP=${CONTROL_PLANE[ip]} WORKER_NAME=${worker[hostname]} sudo -E bash /tmp/join-worker.sh"; then
            log_success "Worker ${worker[hostname]} joined successfully"
            update_state "workers_joined" "$(jq '.workers_joined + ["'${worker[hostname]}'"]' "$STATE_FILE" | jq -c '.workers_joined')"
        else
            log_error "Failed to join worker ${worker[hostname]}"
            exit 1
        fi

        sleep 10
    done

    log_success "All workers joined"
}

# Function to verify cluster
verify_cluster() {
    log_phase "Verifying Cluster Health"

    log_step "Running cluster verification tests..."

    # Copy verification script to control plane
    local control_ip="${CONTROL_PLANE[ip]}"

    if scp -o StrictHostKeyChecking=no "${K3S_SCRIPTS}/verify-cluster.sh" "cortex@${control_ip}:/tmp/"; then
        log_success "Verification script copied"
    else
        log_error "Failed to copy verification script"
        exit 1
    fi

    # Execute verification
    if ssh -o StrictHostKeyChecking=no "cortex@${control_ip}" "sudo bash /tmp/verify-cluster.sh"; then
        log_success "Cluster verification passed"
        update_state "cluster_ready" "true"
    else
        log_warn "Some cluster verification tests failed, review output above"
    fi
}

# Function to setup storage
setup_storage() {
    log_phase "Configuring Cluster Storage"

    local control_ip="${CONTROL_PLANE[ip]}"

    # Copy storage setup script
    if scp -o StrictHostKeyChecking=no "${K3S_SCRIPTS}/setup-storage.sh" "cortex@${control_ip}:/tmp/"; then
        log_success "Storage setup script copied"
    else
        log_error "Failed to copy storage setup script"
        exit 1
    fi

    # Execute storage setup
    if ssh -o StrictHostKeyChecking=no "cortex@${control_ip}" "sudo bash /tmp/setup-storage.sh"; then
        log_success "Storage configured successfully"
    else
        log_warn "Storage setup had warnings, but continuing..."
    fi
}

# Function to setup MetalLB
setup_metallb() {
    log_phase "Configuring MetalLB LoadBalancer"

    local control_ip="${CONTROL_PLANE[ip]}"

    # Copy MetalLB setup script
    if scp -o StrictHostKeyChecking=no "${K3S_SCRIPTS}/setup-metallb.sh" "cortex@${control_ip}:/tmp/"; then
        log_success "MetalLB setup script copied"
    else
        log_error "Failed to copy MetalLB setup script"
        exit 1
    fi

    # Execute MetalLB setup
    if ssh -o StrictHostKeyChecking=no "cortex@${control_ip}" "sudo bash /tmp/setup-metallb.sh"; then
        log_success "MetalLB configured successfully"
    else
        log_warn "MetalLB setup had warnings, but continuing..."
    fi
}

# Function to display cluster access information
display_access_info() {
    log_phase "Cluster Access Information"

    echo -e "${GREEN}"
    cat << EOF
╔═══════════════════════════════════════════════════════════════╗
║                    CLUSTER READY                              ║
╚═══════════════════════════════════════════════════════════════╝

Cluster Details:
  Control Plane: ${CONTROL_PLANE[hostname]} (${CONTROL_PLANE[ip]})
  Worker 01:     ${WORKER_01[hostname]} (${WORKER_01[ip]})
  Worker 02:     ${WORKER_02[hostname]} (${WORKER_02[ip]})

Access Instructions:

  1. Set KUBECONFIG environment variable:
     export KUBECONFIG=/tmp/k3s-kubeconfig.yaml

  2. Verify cluster:
     kubectl get nodes

  3. SSH to control plane:
     ssh cortex@${CONTROL_PLANE[ip]}

  4. View cluster resources:
     kubectl get all --all-namespaces

Network Configuration:
  Pod CIDR:           10.42.0.0/16
  Service CIDR:       10.43.0.0/16
  LoadBalancer IPs:   10.88.140.155-10.88.140.158

Deployment Logs:
  ${DEPLOYMENT_LOG}

State File:
  ${STATE_FILE}

Next Steps:
  - Deploy Cortex application to cluster
  - Configure ingress for dashboard
  - Set up monitoring and logging

EOF
    echo -e "${NC}"
}

# Function to save deployment artifacts
save_deployment_artifacts() {
    log_info "Saving deployment artifacts..."

    local artifacts_dir="/tmp/cortex-k3s-artifacts-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$artifacts_dir"

    # Copy kubeconfig
    cp /tmp/k3s-kubeconfig.yaml "$artifacts_dir/"

    # Copy K3s token
    cp /tmp/k3s-token.txt "$artifacts_dir/"

    # Copy state file
    cp "$STATE_FILE" "$artifacts_dir/"

    # Create access instructions
    cat > "$artifacts_dir/ACCESS.md" << EOF
# Cortex K3s Cluster Access

## Cluster Endpoints

- Control Plane: ${CONTROL_PLANE[ip]}:6443
- Dashboard: (To be deployed)

## Authentication

Kubeconfig: \`k3s-kubeconfig.yaml\`

\`\`\`bash
export KUBECONFIG=$(pwd)/k3s-kubeconfig.yaml
kubectl get nodes
\`\`\`

## SSH Access

\`\`\`bash
ssh cortex@${CONTROL_PLANE[ip]}  # Control Plane
ssh cortex@${WORKER_01[ip]}      # Worker 01
ssh cortex@${WORKER_02[ip]}      # Worker 02
\`\`\`

## K3s Token

For joining additional nodes:

\`\`\`bash
K3S_URL=https://${CONTROL_PLANE[ip]}:6443
K3S_TOKEN=\$(cat k3s-token.txt)
\`\`\`

## Deployment Details

See \`bootstrap-state.json\` for complete deployment state.
EOF

    cp "$artifacts_dir/ACCESS.md" "$artifacts_dir/README.md"

    log_success "Artifacts saved to: ${artifacts_dir}"
    echo "$artifacts_dir"
}

# Function to handle errors
handle_error() {
    local exit_code=$?
    log_error "Deployment failed with exit code ${exit_code}"
    log_error "Check logs: ${DEPLOYMENT_LOG}"

    update_state "phase" '"failed"'
    update_state "failed_at" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""

    exit "$exit_code"
}

# Main function
main() {
    # Set up error handler
    trap handle_error ERR

    # Start logging
    exec 2>&1 | tee -a "$DEPLOYMENT_LOG"

    # Display banner
    display_banner

    log_info "Starting Cortex K3s Cluster Bootstrap"
    log_info "Deployment log: ${DEPLOYMENT_LOG}"

    # Initialize state
    init_deployment_state

    # Phase 1: Prerequisites
    update_state "phase" '"prerequisites"'
    validate_prerequisites

    # Phase 2: Create VMs
    update_state "phase" '"vm_creation"'
    create_vms

    # Phase 3: Wait for VMs
    update_state "phase" '"vm_initialization"'
    wait_for_vms_ready

    # Phase 4: Install control plane
    update_state "phase" '"control_plane_installation"'
    install_control_plane

    # Phase 5: Join workers
    update_state "phase" '"worker_join"'
    join_workers

    # Phase 6: Verify cluster
    update_state "phase" '"cluster_verification"'
    verify_cluster

    # Phase 7: Setup storage
    update_state "phase" '"storage_configuration"'
    setup_storage

    # Phase 8: Setup MetalLB
    update_state "phase" '"metallb_configuration"'
    setup_metallb

    # Phase 9: Save artifacts
    update_state "phase" '"finalization"'
    artifacts_dir=$(save_deployment_artifacts)

    # Mark complete
    update_state "phase" '"complete"'
    update_state "completed_at" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""

    # Display access info
    display_access_info

    log_success "K3s Cluster Bootstrap Complete!"
    log_info "Artifacts directory: ${artifacts_dir}"
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
