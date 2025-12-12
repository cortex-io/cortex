#!/usr/bin/env bash
#
# Rollback Script for Cortex Deployments
#
# This script provides one-command rollback capability for Cortex deployments.
# It can rollback to a specific version or to the previous deployment.
#

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-cortex}"
DEPLOYMENTS=("cortex-coordinator" "cortex-development-master" "cortex-cicd-master" "cortex-security-master")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
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
TARGET_VERSION=""
REVISION=""
DRY_RUN=false
RESTORE_STATE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --to-version)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --to-revision)
            REVISION="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --restore-state)
            RESTORE_STATE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            cat <<EOF
Cortex Rollback Script

Usage: $0 [options]

Options:
  --to-version <version>    Rollback to specific image version
  --to-revision <number>    Rollback to specific revision (default: previous)
  --namespace <namespace>   Kubernetes namespace (default: cortex)
  --restore-state           Also restore coordination state from backup
  --dry-run                 Show what would be done
  --help                    Show this help

Examples:
  # Rollback to previous revision
  $0

  # Rollback to specific version
  $0 --to-version v1.2.3

  # Rollback with state restore
  $0 --restore-state

  # Dry run
  $0 --dry-run
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info "=========================================="
log_info "Cortex Rollback Procedure"
log_info "=========================================="
log_info "Namespace: $NAMESPACE"
log_info "Dry Run: $DRY_RUN"
log_info ""

# Step 1: Get current state
log_info "Step 1: Checking current deployment state..."

for deployment in "${DEPLOYMENTS[@]}"; do
    if kubectl get deployment $deployment -n $NAMESPACE > /dev/null 2>&1; then
        CURRENT_IMAGE=$(kubectl get deployment $deployment -n $NAMESPACE \
            -o jsonpath='{.spec.template.spec.containers[0].image}')
        CURRENT_REPLICAS=$(kubectl get deployment $deployment -n $NAMESPACE \
            -o jsonpath='{.spec.replicas}')

        echo "  $deployment:"
        echo "    Current image: $CURRENT_IMAGE"
        echo "    Replicas: $CURRENT_REPLICAS"

        # Get rollout history
        echo "    Rollout history:"
        kubectl rollout history deployment/$deployment -n $NAMESPACE | tail -5 || true
        echo ""
    else
        log_warn "Deployment $deployment not found"
    fi
done

# Step 2: Confirm rollback
if [ "$DRY_RUN" == "false" ]; then
    echo ""
    log_warn "This will rollback all Cortex deployments in namespace: $NAMESPACE"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
fi

# Step 3: Perform rollback
log_info "Step 2: Rolling back deployments..."

for deployment in "${DEPLOYMENTS[@]}"; do
    if ! kubectl get deployment $deployment -n $NAMESPACE > /dev/null 2>&1; then
        log_warn "Skipping $deployment (not found)"
        continue
    fi

    log_info "Rolling back $deployment..."

    if [ "$DRY_RUN" == "false" ]; then
        if [ -n "$REVISION" ]; then
            # Rollback to specific revision
            kubectl rollout undo deployment/$deployment -n $NAMESPACE --to-revision=$REVISION
        elif [ -n "$TARGET_VERSION" ]; then
            # Rollback to specific version
            NEW_IMAGE="ghcr.io/ryandahlberg/cortex:$TARGET_VERSION"
            kubectl set image deployment/$deployment \
                coordinator=$NEW_IMAGE -n $NAMESPACE 2>/dev/null || \
                kubectl set image deployment/$deployment \
                master=$NEW_IMAGE -n $NAMESPACE
        else
            # Rollback to previous revision
            kubectl rollout undo deployment/$deployment -n $NAMESPACE
        fi

        # Wait for rollout
        log_info "Waiting for $deployment rollout to complete..."
        kubectl rollout status deployment/$deployment -n $NAMESPACE --timeout=5m || {
            log_error "Rollout of $deployment failed!"
            log_error "Check status with: kubectl rollout status deployment/$deployment -n $NAMESPACE"
        }

        log_info "✓ $deployment rolled back successfully"
    else
        log_info "[DRY-RUN] Would rollback $deployment"
    fi
    echo ""
done

# Step 4: Verify rollback
log_info "Step 3: Verifying rollback..."

if [ "$DRY_RUN" == "false" ]; then
    sleep 5

    ALL_HEALTHY=true

    for deployment in "${DEPLOYMENTS[@]}"; do
        if ! kubectl get deployment $deployment -n $NAMESPACE > /dev/null 2>&1; then
            continue
        fi

        # Check if deployment is available
        AVAILABLE=$(kubectl get deployment $deployment -n $NAMESPACE \
            -o jsonpath='{.status.conditions[?(@.type=="Available")].status}')

        if [ "$AVAILABLE" != "True" ]; then
            log_error "$deployment is not available!"
            ALL_HEALTHY=false
        else
            log_info "✓ $deployment is healthy"
        fi

        # Check pod status
        POD_COUNT=$(kubectl get pods -n $NAMESPACE -l app=cortex \
            --field-selector=status.phase=Running 2>/dev/null | grep $deployment | wc -l || echo 0)

        if [ $POD_COUNT -eq 0 ]; then
            log_warn "$deployment has no running pods"
            ALL_HEALTHY=false
        fi
    done

    if [ "$ALL_HEALTHY" == "true" ]; then
        log_info "✓ All deployments are healthy"
    else
        log_error "Some deployments are unhealthy - manual intervention may be required"
    fi
else
    log_info "[DRY-RUN] Would verify deployment health"
fi

# Step 5: Restore coordination state (optional)
if [ "$RESTORE_STATE" == "true" ]; then
    log_info "Step 4: Restoring coordination state from backup..."

    if [ "$DRY_RUN" == "false" ]; then
        if [ -f "/tmp/cortex-state-backup.tar.gz" ]; then
            # This would typically restore from S3 or Proxmox backup
            # For now, using local backup

            COORDINATOR_POD=$(kubectl get pod -n $NAMESPACE -l component=coordinator \
                -o jsonpath='{.items[0].metadata.name}')

            if [ -n "$COORDINATOR_POD" ]; then
                log_info "Restoring to pod: $COORDINATOR_POD"

                # Copy backup to pod
                kubectl cp /tmp/cortex-state-backup.tar.gz \
                    $NAMESPACE/$COORDINATOR_POD:/tmp/backup.tar.gz

                # Extract backup
                kubectl exec -n $NAMESPACE $COORDINATOR_POD -- \
                    tar -xzf /tmp/backup.tar.gz -C /app/coordination/

                log_info "✓ Coordination state restored"
            else
                log_error "Could not find coordinator pod"
            fi
        else
            log_warn "No backup file found at /tmp/cortex-state-backup.tar.gz"
            log_warn "Skipping state restoration"
        fi
    else
        log_info "[DRY-RUN] Would restore coordination state from backup"
    fi
fi

# Step 6: Log rollback event
log_info "Step 5: Logging rollback event..."

if [ "$DRY_RUN" == "false" ]; then
    ROLLBACK_EVENT=$(cat <<EOF
{
  "event_type": "rollback",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "namespace": "$NAMESPACE",
  "target_version": "${TARGET_VERSION:-previous}",
  "target_revision": "${REVISION:-previous}",
  "state_restored": $RESTORE_STATE,
  "initiated_by": "${USER}@${HOSTNAME}"
}
EOF
)

    echo "$ROLLBACK_EVENT" >> /tmp/cortex-rollback-log.jsonl
    log_info "Rollback event logged"
else
    log_info "[DRY-RUN] Would log rollback event"
fi

# Summary
echo ""
log_info "=========================================="
log_info "Rollback Complete"
log_info "=========================================="

if [ "$DRY_RUN" == "false" ]; then
    log_info "Current deployment state:"
    echo ""

    for deployment in "${DEPLOYMENTS[@]}"; do
        if kubectl get deployment $deployment -n $NAMESPACE > /dev/null 2>&1; then
            CURRENT_IMAGE=$(kubectl get deployment $deployment -n $NAMESPACE \
                -o jsonpath='{.spec.template.spec.containers[0].image}')
            READY=$(kubectl get deployment $deployment -n $NAMESPACE \
                -o jsonpath='{.status.readyReplicas}')
            DESIRED=$(kubectl get deployment $deployment -n $NAMESPACE \
                -o jsonpath='{.spec.replicas}')

            echo "$deployment:"
            echo "  Image: $CURRENT_IMAGE"
            echo "  Ready: $READY/$DESIRED"
        fi
    done

    echo ""
    log_info "Verify application health:"
    log_info "  kubectl get pods -n $NAMESPACE"
    log_info "  kubectl logs -n $NAMESPACE deployment/cortex-coordinator"
fi

log_info "=========================================="

exit 0
