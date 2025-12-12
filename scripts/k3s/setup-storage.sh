#!/bin/bash
# Cortex K3s Storage Configuration Script
# Sets up persistent storage for Cortex coordination state and applications

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
KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
KUBECTL_CMD="${KUBECTL_CMD:-kubectl}"

# Storage paths
CORTEX_STORAGE_PATH="/opt/cortex/storage"
BACKUP_PATH="/opt/cortex/backups"

# Function to check kubectl access
check_kubectl_access() {
    log_info "Checking kubectl access..."

    if ! command -v kubectl >/dev/null 2>&1; then
        if command -v k3s >/dev/null 2>&1; then
            KUBECTL_CMD='k3s kubectl'
        else
            log_error "kubectl not found"
            exit 1
        fi
    fi

    if ! $KUBECTL_CMD version --short >/dev/null 2>&1; then
        log_error "Cannot connect to cluster"
        exit 1
    fi

    log_success "kubectl is accessible"
}

# Function to verify local-path provisioner
verify_local_path_provisioner() {
    log_info "Verifying local-path provisioner..."

    if ! $KUBECTL_CMD get storageclass local-path >/dev/null 2>&1; then
        log_error "local-path storage class not found"
        log_info "Installing local-path provisioner..."
        install_local_path_provisioner
    else
        log_success "local-path storage class exists"
    fi

    # Check if it's the default storage class
    local is_default
    is_default=$($KUBECTL_CMD get storageclass local-path -o jsonpath='{.metadata.annotations.storageclass\.kubernetes\.io/is-default-class}' 2>/dev/null || echo "false")

    if [ "$is_default" != "true" ]; then
        log_info "Setting local-path as default storage class..."
        $KUBECTL_CMD patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
        log_success "local-path set as default storage class"
    else
        log_success "local-path is already the default storage class"
    fi
}

# Function to install local-path provisioner
install_local_path_provisioner() {
    log_info "Installing local-path provisioner..."

    local manifest_url="https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml"

    if $KUBECTL_CMD apply -f "$manifest_url"; then
        log_success "local-path provisioner installed"
    else
        log_error "Failed to install local-path provisioner"
        exit 1
    fi

    # Wait for deployment to be ready
    log_info "Waiting for local-path-provisioner to be ready..."
    $KUBECTL_CMD wait --for=condition=available deployment/local-path-provisioner -n local-path-storage --timeout=120s
    log_success "local-path provisioner is ready"
}

# Function to create storage directories on nodes
create_storage_directories() {
    log_info "Creating storage directories on nodes..."

    # Get list of nodes
    local nodes
    nodes=$($KUBECTL_CMD get nodes -o jsonpath='{.items[*].metadata.name}')

    for node in $nodes; do
        log_info "Creating directories on node: ${node}"

        # Create directories via SSH
        # Note: This requires SSH access to nodes
        local node_ip
        node_ip=$($KUBECTL_CMD get node "$node" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')

        if [ -n "$node_ip" ]; then
            log_info "Node ${node} IP: ${node_ip}"

            # Create directories
            if ssh -o StrictHostKeyChecking=no "cortex@${node_ip}" "sudo mkdir -p ${CORTEX_STORAGE_PATH} ${BACKUP_PATH}"; then
                log_success "Directories created on ${node}"
            else
                log_warn "Could not create directories on ${node} (may need manual setup)"
            fi
        fi
    done
}

# Function to create Cortex namespace
create_cortex_namespace() {
    log_info "Creating Cortex namespace..."

    if $KUBECTL_CMD get namespace cortex >/dev/null 2>&1; then
        log_success "Namespace 'cortex' already exists"
    else
        $KUBECTL_CMD create namespace cortex
        log_success "Namespace 'cortex' created"
    fi
}

# Function to create PVCs for Cortex
create_cortex_pvcs() {
    log_info "Creating PVCs for Cortex components..."

    # Coordination state PVC
    local coordination_pvc_yaml
    coordination_pvc_yaml=$(cat <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-coordination-state
  namespace: cortex
  labels:
    app: cortex
    component: coordination
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 10Gi
EOF
)

    echo "$coordination_pvc_yaml" | $KUBECTL_CMD apply -f -
    log_success "Coordination state PVC created"

    # Dashboard data PVC
    local dashboard_pvc_yaml
    dashboard_pvc_yaml=$(cat <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-dashboard-data
  namespace: cortex
  labels:
    app: cortex
    component: dashboard
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 5Gi
EOF
)

    echo "$dashboard_pvc_yaml" | $KUBECTL_CMD apply -f -
    log_success "Dashboard data PVC created"

    # Logs PVC
    local logs_pvc_yaml
    logs_pvc_yaml=$(cat <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-logs
  namespace: cortex
  labels:
    app: cortex
    component: logs
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 20Gi
EOF
)

    echo "$logs_pvc_yaml" | $KUBECTL_CMD apply -f -
    log_success "Logs PVC created"

    # Backups PVC
    local backups_pvc_yaml
    backups_pvc_yaml=$(cat <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-backups
  namespace: cortex
  labels:
    app: cortex
    component: backups
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 50Gi
EOF
)

    echo "$backups_pvc_yaml" | $KUBECTL_CMD apply -f -
    log_success "Backups PVC created"
}

# Function to configure backup cronjob
create_backup_cronjob() {
    log_info "Creating backup CronJob..."

    local backup_cronjob_yaml
    backup_cronjob_yaml=$(cat <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cortex-backup
  namespace: cortex
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: alpine:latest
            command:
            - /bin/sh
            - -c
            - |
              echo "Backup starting at $(date)"
              mkdir -p /backups/$(date +%Y%m%d)
              cp -r /coordination/* /backups/$(date +%Y%m%d)/ || true
              echo "Backup completed at $(date)"
              # Keep only last 7 days of backups
              find /backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;
            volumeMounts:
            - name: coordination-state
              mountPath: /coordination
            - name: backups
              mountPath: /backups
          volumes:
          - name: coordination-state
            persistentVolumeClaim:
              claimName: cortex-coordination-state
          - name: backups
            persistentVolumeClaim:
              claimName: cortex-backups
          restartPolicy: OnFailure
EOF
)

    echo "$backup_cronjob_yaml" | $KUBECTL_CMD apply -f -
    log_success "Backup CronJob created"
}

# Function to verify PVCs are bound
verify_pvcs_bound() {
    log_info "Verifying PVCs are bound..."

    local pvcs=("cortex-coordination-state" "cortex-dashboard-data" "cortex-logs" "cortex-backups")
    local all_bound=true

    for pvc in "${pvcs[@]}"; do
        local status
        status=$($KUBECTL_CMD get pvc -n cortex "$pvc" -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")

        if [ "$status" = "Bound" ]; then
            log_success "PVC ${pvc} is Bound"
        else
            log_error "PVC ${pvc} status: ${status}"
            all_bound=false
        fi
    done

    if [ "$all_bound" = true ]; then
        log_success "All PVCs are bound"
        return 0
    else
        log_error "Some PVCs are not bound"
        return 1
    fi
}

# Function to display storage summary
display_storage_summary() {
    log_info "Storage Configuration Summary:"
    echo "================================"

    echo "Storage Classes:"
    $KUBECTL_CMD get storageclass

    echo ""
    echo "Cortex PVCs:"
    $KUBECTL_CMD get pvc -n cortex

    echo ""
    echo "PV Details:"
    $KUBECTL_CMD get pv

    echo "================================"
}

# Main function
main() {
    log_info "Starting K3s storage configuration"

    # Check kubectl access
    check_kubectl_access

    # Verify local-path provisioner
    verify_local_path_provisioner

    # Create storage directories on nodes
    create_storage_directories

    # Create Cortex namespace
    create_cortex_namespace

    # Create PVCs for Cortex
    create_cortex_pvcs

    # Wait for PVCs to be bound
    log_info "Waiting for PVCs to be bound..."
    sleep 5

    # Verify PVCs are bound
    if ! verify_pvcs_bound; then
        log_warn "Some PVCs are not bound yet, they may bind later"
    fi

    # Create backup CronJob
    create_backup_cronjob

    # Display summary
    display_storage_summary

    log_success "Storage configuration complete"
    echo ""
    log_info "PVCs created for:"
    log_info "  - Coordination state (10Gi)"
    log_info "  - Dashboard data (5Gi)"
    log_info "  - Logs (20Gi)"
    log_info "  - Backups (50Gi)"
    log_info ""
    log_info "Backup CronJob scheduled daily at 2 AM"
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
