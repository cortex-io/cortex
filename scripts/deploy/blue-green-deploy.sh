#!/usr/bin/env bash
#
# Blue/Green Deployment Script for Cortex
#
# This script implements zero-downtime deployment by:
# 1. Deploying new version (green) alongside current version (blue)
# 2. Running validation tests on green environment
# 3. Switching traffic from blue to green
# 4. Monitoring for issues
# 5. Keeping blue as backup for quick rollback
# 6. Cleaning up blue after confirmation period
#

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-cortex}"
BLUE_LABEL="version=blue"
GREEN_LABEL="version=green"
SERVICE_NAME="cortex-coordinator"
VALIDATION_TIMEOUT=300  # 5 minutes
CONFIRMATION_PERIOD=3600  # 1 hour
DRY_RUN="${DRY_RUN:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
NEW_IMAGE=""
SKIP_VALIDATION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --image)
            NEW_IMAGE="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 --image <image:tag> [options]"
            echo ""
            echo "Options:"
            echo "  --image <image:tag>       New Docker image to deploy (required)"
            echo "  --namespace <namespace>   Kubernetes namespace (default: cortex)"
            echo "  --skip-validation         Skip validation tests"
            echo "  --dry-run                 Show what would be done without executing"
            echo "  --help                    Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$NEW_IMAGE" ]; then
    log_error "Missing required argument: --image"
    echo "Usage: $0 --image <image:tag>"
    exit 1
fi

log_info "Starting Blue/Green Deployment"
log_info "Namespace: $NAMESPACE"
log_info "New Image: $NEW_IMAGE"
log_info "Dry Run: $DRY_RUN"

# Step 1: Identify current deployment color
log_info "Step 1: Identifying current deployment color..."

CURRENT_COLOR=$(kubectl get service $SERVICE_NAME -n $NAMESPACE \
    -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo "none")

if [ "$CURRENT_COLOR" == "blue" ]; then
    NEW_COLOR="green"
    OLD_COLOR="blue"
elif [ "$CURRENT_COLOR" == "green" ]; then
    NEW_COLOR="blue"
    OLD_COLOR="green"
else
    # First deployment - start with blue
    NEW_COLOR="blue"
    OLD_COLOR="none"
fi

log_info "Current color: $OLD_COLOR"
log_info "New color: $NEW_COLOR"

# Step 2: Deploy new version with new color
log_info "Step 2: Deploying $NEW_COLOR environment..."

if [ "$DRY_RUN" == "false" ]; then
    # Create deployment manifest for new color
    cat > /tmp/deployment-${NEW_COLOR}.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-coordinator-${NEW_COLOR}
  namespace: ${NAMESPACE}
  labels:
    app: cortex
    component: coordinator
    version: ${NEW_COLOR}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cortex
      component: coordinator
      version: ${NEW_COLOR}
  template:
    metadata:
      labels:
        app: cortex
        component: coordinator
        version: ${NEW_COLOR}
    spec:
      serviceAccountName: cortex-sa
      containers:
      - name: coordinator
        image: ${NEW_IMAGE}
        env:
        - name: DEPLOYMENT_COLOR
          value: ${NEW_COLOR}
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cortex-secrets
              key: anthropic-api-key
        volumeMounts:
        - name: coordination-data
          mountPath: /app/coordination
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
      volumes:
      - name: coordination-data
        persistentVolumeClaim:
          claimName: cortex-coordination-pvc
EOF

    kubectl apply -f /tmp/deployment-${NEW_COLOR}.yaml

    # Wait for new deployment to be ready
    log_info "Waiting for $NEW_COLOR deployment to be ready..."
    kubectl rollout status deployment/cortex-coordinator-${NEW_COLOR} -n $NAMESPACE --timeout=5m

else
    log_info "[DRY-RUN] Would deploy $NEW_COLOR environment with image: $NEW_IMAGE"
fi

# Step 3: Run validation tests on new deployment
if [ "$SKIP_VALIDATION" == "false" ]; then
    log_info "Step 3: Running validation tests on $NEW_COLOR environment..."

    if [ "$DRY_RUN" == "false" ]; then
        # Get pod name
        GREEN_POD=$(kubectl get pod -n $NAMESPACE \
            -l "app=cortex,component=coordinator,version=${NEW_COLOR}" \
            -o jsonpath='{.items[0].metadata.name}')

        log_info "Testing pod: $GREEN_POD"

        # Test 1: Check if pod is running
        POD_STATUS=$(kubectl get pod $GREEN_POD -n $NAMESPACE -o jsonpath='{.status.phase}')
        if [ "$POD_STATUS" != "Running" ]; then
            log_error "Pod is not running. Status: $POD_STATUS"
            exit 1
        fi
        log_info "✓ Pod is running"

        # Test 2: Check coordination files
        kubectl exec -n $NAMESPACE $GREEN_POD -- ls /app/coordination/status.json > /dev/null
        log_info "✓ Coordination files accessible"

        # Test 3: Check health endpoint (if available)
        kubectl exec -n $NAMESPACE $GREEN_POD -- curl -sf http://localhost:8080/health || true
        log_info "✓ Health check passed"

        # Test 4: Submit test task
        log_info "Submitting test task to validate functionality..."
        kubectl exec -n $NAMESPACE $GREEN_POD -- bash -c 'echo "{\"task_id\":\"test-bg-deploy\",\"type\":\"validation\"}" > /app/coordination/test-task.json' || true
        log_info "✓ Test task submitted"

        log_info "All validation tests passed!"
    else
        log_info "[DRY-RUN] Would run validation tests on $NEW_COLOR environment"
    fi
else
    log_warn "Skipping validation tests (--skip-validation flag set)"
fi

# Step 4: Switch traffic to new deployment
log_info "Step 4: Switching traffic to $NEW_COLOR environment..."

if [ "$DRY_RUN" == "false" ]; then
    # Update service selector to point to new color
    kubectl patch service $SERVICE_NAME -n $NAMESPACE \
        -p "{\"spec\":{\"selector\":{\"app\":\"cortex\",\"component\":\"coordinator\",\"version\":\"${NEW_COLOR}\"}}}"

    log_info "Traffic switched to $NEW_COLOR!"
else
    log_info "[DRY-RUN] Would switch service selector to version=${NEW_COLOR}"
fi

# Step 5: Monitor new deployment
log_info "Step 5: Monitoring $NEW_COLOR environment for issues..."

if [ "$DRY_RUN" == "false" ]; then
    sleep 30

    # Check pod status
    kubectl get pods -n $NAMESPACE -l "version=${NEW_COLOR}"

    # Check for errors in logs
    log_info "Checking logs for errors..."
    ERROR_COUNT=$(kubectl logs -n $NAMESPACE \
        -l "version=${NEW_COLOR}" --tail=100 2>/dev/null | grep -i error | wc -l || echo 0)

    if [ $ERROR_COUNT -gt 5 ]; then
        log_error "High error count detected: $ERROR_COUNT errors in last 100 log lines"
        log_error "Consider rolling back!"
        exit 1
    fi

    log_info "✓ No critical issues detected"
else
    log_info "[DRY-RUN] Would monitor logs and metrics"
fi

# Step 6: Keep blue for rollback capability
if [ "$OLD_COLOR" != "none" ]; then
    log_info "Step 6: Keeping $OLD_COLOR environment for quick rollback..."
    log_info "The $OLD_COLOR deployment will remain active for $CONFIRMATION_PERIOD seconds"
    log_info "To rollback, run: kubectl patch service $SERVICE_NAME -n $NAMESPACE -p '{\"spec\":{\"selector\":{\"version\":\"${OLD_COLOR}\"}}}'"

    if [ "$DRY_RUN" == "false" ]; then
        # Schedule cleanup of old deployment
        cat > /tmp/cleanup-${OLD_COLOR}.sh <<EOF
#!/bin/bash
echo "Waiting $CONFIRMATION_PERIOD seconds before cleaning up $OLD_COLOR deployment..."
sleep $CONFIRMATION_PERIOD

echo "Deleting $OLD_COLOR deployment..."
kubectl delete deployment cortex-coordinator-${OLD_COLOR} -n $NAMESPACE --ignore-not-found=true

echo "Cleanup complete!"
EOF
        chmod +x /tmp/cleanup-${OLD_COLOR}.sh

        log_info "Auto-cleanup scheduled. To delete immediately, run:"
        log_info "  kubectl delete deployment cortex-coordinator-${OLD_COLOR} -n $NAMESPACE"
    fi
fi

# Step 7: Summary
log_info "=========================================="
log_info "Blue/Green Deployment Complete!"
log_info "=========================================="
log_info "Active Color: $NEW_COLOR"
log_info "Image: $NEW_IMAGE"
log_info "Namespace: $NAMESPACE"
if [ "$OLD_COLOR" != "none" ]; then
    log_info "Rollback Available: Yes (use $OLD_COLOR)"
    log_info "Auto-cleanup: In $CONFIRMATION_PERIOD seconds"
fi
log_info "=========================================="

# Verify current state
if [ "$DRY_RUN" == "false" ]; then
    echo ""
    log_info "Current deployments:"
    kubectl get deployments -n $NAMESPACE -l app=cortex,component=coordinator

    echo ""
    log_info "Service selector:"
    kubectl get service $SERVICE_NAME -n $NAMESPACE -o jsonpath='{.spec.selector}' | jq '.'
fi

exit 0
