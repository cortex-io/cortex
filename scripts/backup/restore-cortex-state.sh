#!/usr/bin/env bash
#
# Cortex State Restoration Script
#
# Restores coordination state from backup
#

set -euo pipefail

NAMESPACE="${NAMESPACE:-cortex}"
BACKUP_FILE=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 --backup <backup-file> [--namespace <namespace>]"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$BACKUP_FILE" ]; then
    log_error "Missing required argument: --backup"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log_info "=========================================="
log_info "Cortex State Restoration"
log_info "=========================================="
log_info "Namespace: $NAMESPACE"
log_info "Backup File: $BACKUP_FILE"
log_info ""

# Confirm restoration
log_warn "This will restore Cortex state from backup."
log_warn "Current state will be overwritten!"
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    log_info "Restoration cancelled"
    exit 0
fi

# Extract backup
RESTORE_DIR="/tmp/cortex-restore-$$"
mkdir -p "$RESTORE_DIR"

log_info "Extracting backup..."
tar xzf "$BACKUP_FILE" -C "$RESTORE_DIR"

BACKUP_DIR=$(find "$RESTORE_DIR" -maxdepth 1 -type d -name "cortex-backup-*" | head -1)

if [ -z "$BACKUP_DIR" ]; then
    log_error "Invalid backup file structure"
    exit 1
fi

log_info "✓ Backup extracted"

# Read metadata
if [ -f "$BACKUP_DIR/metadata.json" ]; then
    log_info "Backup metadata:"
    cat "$BACKUP_DIR/metadata.json" | jq '.'
fi

# Step 1: Restore ConfigMaps
log_info "Step 1: Restoring ConfigMaps..."

if [ -f "$BACKUP_DIR/configmaps.yaml" ]; then
    kubectl apply -f "$BACKUP_DIR/configmaps.yaml" -n $NAMESPACE
    log_info "✓ ConfigMaps restored"
fi

# Step 2: Restore Secrets
log_info "Step 2: Restoring Secrets..."

if [ -f "$BACKUP_DIR/secrets.yaml" ]; then
    kubectl apply -f "$BACKUP_DIR/secrets.yaml" -n $NAMESPACE
    log_info "✓ Secrets restored"
fi

# Step 3: Restore coordination data to PVC
log_info "Step 3: Restoring coordination data..."

COORDINATOR_POD=$(kubectl get pod -n $NAMESPACE -l component=coordinator \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$COORDINATOR_POD" ]; then
    log_error "No coordinator pod found. Cannot restore coordination data."
    log_warn "Please start coordinator pod first, then re-run restoration."
else
    if [ -f "$BACKUP_DIR/coordination-data.tar.gz" ]; then
        # Copy backup to pod
        kubectl cp "$BACKUP_DIR/coordination-data.tar.gz" \
            $NAMESPACE/$COORDINATOR_POD:/tmp/coordination-restore.tar.gz

        # Extract in pod
        kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
            tar xzf /tmp/coordination-restore.tar.gz -C /app

        # Cleanup
        kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
            rm /tmp/coordination-restore.tar.gz

        log_info "✓ Coordination data restored"
    fi
fi

# Step 4: Verify restoration
log_info "Step 4: Verifying restoration..."

if [ -n "$COORDINATOR_POD" ]; then
    # Check if key files exist
    kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
        ls /app/coordination/status.json > /dev/null 2>&1 && \
        log_info "✓ status.json found"

    kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
        ls /app/coordination/task-queue.json > /dev/null 2>&1 && \
        log_info "✓ task-queue.json found"
fi

# Cleanup
log_info "Cleaning up temporary files..."
rm -rf "$RESTORE_DIR"

# Summary
log_info "=========================================="
log_info "Restoration Complete!"
log_info "=========================================="
log_info "Namespace: $NAMESPACE"
log_info "Restored from: $BACKUP_FILE"
log_info ""
log_info "Next steps:"
log_info "  1. Verify coordinator logs: kubectl logs -n $NAMESPACE deployment/cortex-coordinator"
log_info "  2. Check coordination files: kubectl exec -n $NAMESPACE $COORDINATOR_POD -- ls /app/coordination"
log_info "  3. Monitor application: kubectl get pods -n $NAMESPACE"
log_info "=========================================="

exit 0
