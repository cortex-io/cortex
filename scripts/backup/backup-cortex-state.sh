#!/usr/bin/env bash
#
# Cortex State Backup Script
#
# Backs up coordination state, task queue, and configuration from K8s
#

set -euo pipefail

NAMESPACE="${NAMESPACE:-cortex}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/cortex-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="cortex-backup-${TIMESTAMP}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_info "=========================================="
log_info "Cortex State Backup"
log_info "=========================================="
log_info "Namespace: $NAMESPACE"
log_info "Backup Directory: $BACKUP_DIR"
log_info "Backup Name: $BACKUP_NAME"
log_info ""

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Step 1: Backup coordination files from PVC
log_info "Step 1: Backing up coordination files from PVC..."

COORDINATOR_POD=$(kubectl get pod -n $NAMESPACE -l component=coordinator \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$COORDINATOR_POD" ]; then
    log_warn "No coordinator pod found. Skipping PVC backup."
else
    log_info "Using pod: $COORDINATOR_POD"

    # Create tar archive of coordination directory
    kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
        tar czf /tmp/coordination-backup.tar.gz -C /app coordination/

    # Copy archive from pod
    kubectl cp $NAMESPACE/$COORDINATOR_POD:/tmp/coordination-backup.tar.gz \
        "$BACKUP_DIR/$BACKUP_NAME/coordination-data.tar.gz"

    # Cleanup temp file in pod
    kubectl exec -n $NAMESPACE $COORDINATOR_POD -- rm /tmp/coordination-backup.tar.gz

    log_info "✓ Coordination files backed up"
fi

# Step 2: Backup ConfigMaps
log_info "Step 2: Backing up ConfigMaps..."

kubectl get configmap -n $NAMESPACE -o yaml > \
    "$BACKUP_DIR/$BACKUP_NAME/configmaps.yaml"

log_info "✓ ConfigMaps backed up"

# Step 3: Backup Secrets (base64 encoded - handle with care!)
log_info "Step 3: Backing up Secrets..."

kubectl get secrets -n $NAMESPACE -o yaml > \
    "$BACKUP_DIR/$BACKUP_NAME/secrets.yaml"

log_warn "Secrets file contains sensitive data - encrypt before storing!"

# Step 4: Backup deployments and services
log_info "Step 4: Backing up K8s manifests..."

kubectl get deployments -n $NAMESPACE -o yaml > \
    "$BACKUP_DIR/$BACKUP_NAME/deployments.yaml"

kubectl get services -n $NAMESPACE -o yaml > \
    "$BACKUP_DIR/$BACKUP_NAME/services.yaml"

kubectl get pvc -n $NAMESPACE -o yaml > \
    "$BACKUP_DIR/$BACKUP_NAME/pvcs.yaml"

log_info "✓ K8s manifests backed up"

# Step 5: Create backup metadata
log_info "Step 5: Creating backup metadata..."

cat > "$BACKUP_DIR/$BACKUP_NAME/metadata.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "namespace": "$NAMESPACE",
  "coordinator_pod": "$COORDINATOR_POD",
  "backed_up_by": "${USER}@${HOSTNAME}",
  "cortex_version": "$(kubectl get deployment cortex-coordinator -n $NAMESPACE \
      -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo 'unknown')",
  "retention_until": "$(date -d "+${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v +${RETENTION_DAYS}d +%Y-%m-%d)"
}
EOF

log_info "✓ Metadata created"

# Step 6: Create compressed archive
log_info "Step 6: Creating compressed archive..."

cd "$BACKUP_DIR"
tar czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
log_info "✓ Archive created: ${BACKUP_NAME}.tar.gz ($BACKUP_SIZE)"

# Step 7: Upload to remote storage (optional)
if [ -n "${S3_BUCKET:-}" ]; then
    log_info "Step 7: Uploading to S3..."

    aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
        "s3://${S3_BUCKET}/cortex-backups/${BACKUP_NAME}.tar.gz"

    log_info "✓ Uploaded to S3: s3://${S3_BUCKET}/cortex-backups/${BACKUP_NAME}.tar.gz"
elif [ -n "${PROXMOX_BACKUP_STORAGE:-}" ]; then
    log_info "Step 7: Uploading to Proxmox backup storage..."

    # Copy to Proxmox backup mount point
    cp "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
        "${PROXMOX_BACKUP_STORAGE}/cortex-backups/${BACKUP_NAME}.tar.gz"

    log_info "✓ Uploaded to Proxmox: ${PROXMOX_BACKUP_STORAGE}/cortex-backups/"
else
    log_info "Step 7: No remote storage configured, keeping local backup"
fi

# Step 8: Cleanup old backups
log_info "Step 8: Cleaning up old backups..."

find "$BACKUP_DIR" -name "cortex-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete

REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "cortex-backup-*.tar.gz" | wc -l)
log_info "✓ Cleanup complete. $REMAINING_BACKUPS backups remaining."

# Summary
log_info "=========================================="
log_info "Backup Complete!"
log_info "=========================================="
log_info "Backup File: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
log_info "Size: $BACKUP_SIZE"
log_info "Retention: $RETENTION_DAYS days"
log_info "=========================================="

exit 0
