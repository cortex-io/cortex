#!/bin/bash
#
# k3s LXC Cluster Backup Script
# Run this on the Proxmox host or a machine that can SSH to the k3s master
#

set -euo pipefail

# Configuration
OLD_MASTER_IP="10.88.145.170"
BACKUP_DIR="/root/k3s-backup"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "========================================="
echo "k3s Cluster Backup Script"
echo "Target: $OLD_MASTER_IP"
echo "Timestamp: $TIMESTAMP"
echo "========================================="

# Function to execute kubectl commands on LXC master
k3s_exec() {
    ssh root@10.88.140.164 "pct exec 300 -- /usr/local/bin/k3s kubectl $*"
}

# Create backup directory on old master
echo ""
echo "[1/7] Creating backup directory..."
ssh root@10.88.140.164 "pct exec 300 -- mkdir -p $BACKUP_DIR"

# Export Flux configuration
echo ""
echo "[2/7] Backing up Flux configuration..."
k3s_exec get gitrepository -A -o yaml > flux-gitrepository.yaml 2>/dev/null || echo "No GitRepository found"
k3s_exec get kustomization -A -o yaml > flux-kustomizations.yaml 2>/dev/null || echo "No Kustomizations found"
k3s_exec get helmrelease -A -o yaml > flux-helmreleases.yaml
k3s_exec get helmrepository -A -o yaml > flux-helmrepositories.yaml
k3s_exec get secret -n flux-system flux-system -o yaml > flux-secret.yaml 2>/dev/null || echo "No flux-system secret found"

# Backup MetalLB configuration
echo ""
echo "[3/7] Backing up MetalLB configuration..."
k3s_exec get ipaddresspool,l2advertisement -n metallb-system -o yaml > metallb-config.yaml

# Backup storage configuration
echo ""
echo "[4/7] Backing up storage configuration..."
k3s_exec get storageclass -o yaml > storageclasses.yaml
k3s_exec get pvc -A -o yaml > all-pvcs.yaml
k3s_exec get pv -o yaml > all-pvs.yaml 2>/dev/null || echo "No PVs found"

# Backup application resources
echo ""
echo "[5/7] Backing up application resources..."
k3s_exec get configmap -A -o yaml > all-configmaps.yaml
k3s_exec get secret -A -o yaml > all-secrets.yaml
k3s_exec get ingress -A -o yaml > all-ingresses.yaml 2>/dev/null || echo "No Ingresses found"
k3s_exec get service -A -o yaml > all-services.yaml

# Backup namespace definitions
echo ""
echo "[6/7] Backing up namespaces..."
k3s_exec get namespace -o yaml > all-namespaces.yaml

# Create archive
echo ""
echo "[7/7] Creating backup archive..."
tar -czf k3s-backup-${TIMESTAMP}.tar.gz *.yaml
mkdir -p ./backups
mv k3s-backup-${TIMESTAMP}.tar.gz ./backups/
rm -f *.yaml

echo ""
echo "========================================="
echo "Backup completed successfully!"
echo "Backup location: ./backups/k3s-backup-${TIMESTAMP}.tar.gz"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Review backup archive: tar -tzf ./backups/k3s-backup-${TIMESTAMP}.tar.gz"
echo "2. Copy to safe location: scp ./backups/k3s-backup-${TIMESTAMP}.tar.gz user@backup-server:/path/"
echo "3. Proceed with Phase 2: Bootstrap new k3s cluster"
