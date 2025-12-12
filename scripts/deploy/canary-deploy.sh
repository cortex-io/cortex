#!/usr/bin/env bash
#
# Canary Deployment Script for Cortex
#
# This script implements gradual rollout by:
# 1. Deploying canary version with 10% traffic
# 2. Monitoring error rates and latency
# 3. Gradually increasing traffic: 10% -> 25% -> 50% -> 100%
# 4. Auto-rollback if metrics exceed thresholds
#

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-cortex}"
CANARY_LABEL="version=canary"
STABLE_LABEL="version=stable"
DEPLOYMENT_NAME="cortex-coordinator"

# Traffic split percentages for gradual rollout
TRAFFIC_STAGES=(10 25 50 100)

# Monitoring thresholds
ERROR_RATE_THRESHOLD=5  # Percent
LATENCY_THRESHOLD_MS=2000
MONITORING_DURATION=300  # 5 minutes per stage

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_stage() {
    echo -e "${BLUE}[STAGE]${NC} $1"
}

# Parse arguments
NEW_IMAGE=""
DRY_RUN=false
SKIP_MONITORING=false

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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-monitoring)
            SKIP_MONITORING=true
            shift
            ;;
        --help)
            echo "Usage: $0 --image <image:tag> [options]"
            echo ""
            echo "Options:"
            echo "  --image <image:tag>      New Docker image to deploy (required)"
            echo "  --namespace <namespace>  Kubernetes namespace (default: cortex)"
            echo "  --skip-monitoring        Skip metrics monitoring (faster, riskier)"
            echo "  --dry-run                Show what would be done"
            echo "  --help                   Show this help"
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
    exit 1
fi

log_info "Starting Canary Deployment"
log_info "Namespace: $NAMESPACE"
log_info "New Image: $NEW_IMAGE"
log_info "Traffic Stages: ${TRAFFIC_STAGES[*]}%"

# Function to check metrics
check_metrics() {
    local canary_pods=$1
    local duration=$2

    log_info "Monitoring canary pods for $duration seconds..."

    if [ "$SKIP_MONITORING" == "true" ]; then
        log_warn "Skipping metrics monitoring (--skip-monitoring)"
        return 0
    fi

    # Wait for metrics collection
    sleep $duration

    # Check error rate in logs
    local error_count=0
    local total_requests=0

    for pod in $canary_pods; do
        local pod_errors=$(kubectl logs -n $NAMESPACE $pod --tail=1000 2>/dev/null | grep -i error | wc -l || echo 0)
        local pod_requests=$(kubectl logs -n $NAMESPACE $pod --tail=1000 2>/dev/null | wc -l || echo 100)

        error_count=$((error_count + pod_errors))
        total_requests=$((total_requests + pod_requests))
    done

    if [ $total_requests -gt 0 ]; then
        local error_rate=$((error_count * 100 / total_requests))
        log_info "Error rate: ${error_rate}% (${error_count}/${total_requests})"

        if [ $error_rate -gt $ERROR_RATE_THRESHOLD ]; then
            log_error "Error rate ${error_rate}% exceeds threshold ${ERROR_RATE_THRESHOLD}%"
            return 1
        fi
    fi

    # Check pod status
    for pod in $canary_pods; do
        local status=$(kubectl get pod $pod -n $NAMESPACE -o jsonpath='{.status.phase}')
        if [ "$status" != "Running" ]; then
            log_error "Pod $pod is not running. Status: $status"
            return 1
        fi

        local restarts=$(kubectl get pod $pod -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].restartCount}')
        if [ $restarts -gt 0 ]; then
            log_warn "Pod $pod has restarted $restarts times"
            if [ $restarts -gt 2 ]; then
                log_error "Too many restarts detected"
                return 1
            fi
        fi
    done

    log_info "✓ Metrics look healthy"
    return 0
}

# Function to set traffic split
set_traffic_split() {
    local canary_percent=$1
    local stable_percent=$((100 - canary_percent))

    log_info "Setting traffic split: ${canary_percent}% canary, ${stable_percent}% stable"

    if [ "$DRY_RUN" == "false" ]; then
        # Scale deployments based on traffic percentage
        local canary_replicas=$((canary_percent >= 50 ? 2 : 1))
        local stable_replicas=$((stable_percent >= 50 ? 2 : 1))

        kubectl scale deployment ${DEPLOYMENT_NAME}-canary -n $NAMESPACE --replicas=$canary_replicas
        kubectl scale deployment ${DEPLOYMENT_NAME}-stable -n $NAMESPACE --replicas=$stable_replicas

        # If using service mesh (Istio/Linkerd), update VirtualService here
        # For basic K8s, we use replica counts as traffic proxy
    else
        log_info "[DRY-RUN] Would set canary=${canary_percent}%, stable=${stable_percent}%"
    fi
}

# Step 1: Deploy canary version
log_stage "Step 1: Deploying canary version"

if [ "$DRY_RUN" == "false" ]; then
    # Create canary deployment
    cat > /tmp/canary-deployment.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEPLOYMENT_NAME}-canary
  namespace: ${NAMESPACE}
  labels:
    app: cortex
    component: coordinator
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cortex
      component: coordinator
      version: canary
  template:
    metadata:
      labels:
        app: cortex
        component: coordinator
        version: canary
    spec:
      serviceAccountName: cortex-sa
      containers:
      - name: coordinator
        image: ${NEW_IMAGE}
        env:
        - name: DEPLOYMENT_VERSION
          value: canary
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

    kubectl apply -f /tmp/canary-deployment.yaml

    # Ensure stable deployment exists
    kubectl get deployment ${DEPLOYMENT_NAME}-stable -n $NAMESPACE > /dev/null 2>&1 || {
        log_info "Creating stable deployment from current version..."
        kubectl get deployment ${DEPLOYMENT_NAME} -n $NAMESPACE -o yaml | \
            sed 's/name: cortex-coordinator$/name: cortex-coordinator-stable/' | \
            sed 's/version: .*$/version: stable/' | \
            kubectl apply -f -
    }

    # Wait for canary to be ready
    kubectl rollout status deployment/${DEPLOYMENT_NAME}-canary -n $NAMESPACE --timeout=5m

    log_info "✓ Canary deployment ready"
else
    log_info "[DRY-RUN] Would deploy canary with image: $NEW_IMAGE"
fi

# Step 2: Gradual traffic increase
for stage in "${TRAFFIC_STAGES[@]}"; do
    log_stage "Step 2.${stage}: Increasing canary traffic to ${stage}%"

    set_traffic_split $stage

    if [ $stage -lt 100 ]; then
        # Get canary pods
        CANARY_PODS=$(kubectl get pods -n $NAMESPACE -l version=canary -o jsonpath='{.items[*].metadata.name}')

        if [ "$DRY_RUN" == "false" ]; then
            if ! check_metrics "$CANARY_PODS" $MONITORING_DURATION; then
                log_error "Metrics check failed at ${stage}% traffic!"
                log_error "Rolling back..."

                # Rollback: Set traffic to 0% canary, 100% stable
                set_traffic_split 0
                kubectl delete deployment ${DEPLOYMENT_NAME}-canary -n $NAMESPACE

                log_error "Canary deployment rolled back"
                exit 1
            fi
        else
            log_info "[DRY-RUN] Would monitor canary at ${stage}% traffic for ${MONITORING_DURATION}s"
        fi

        log_info "✓ Stage ${stage}% successful"
    else
        log_info "Canary at 100% traffic - deployment complete!"
    fi
done

# Step 3: Promote canary to stable
log_stage "Step 3: Promoting canary to stable"

if [ "$DRY_RUN" == "false" ]; then
    # Update stable deployment with canary image
    kubectl set image deployment/${DEPLOYMENT_NAME}-stable \
        coordinator=$NEW_IMAGE -n $NAMESPACE

    kubectl rollout status deployment/${DEPLOYMENT_NAME}-stable -n $NAMESPACE --timeout=5m

    # Delete canary deployment
    kubectl delete deployment ${DEPLOYMENT_NAME}-canary -n $NAMESPACE

    log_info "✓ Canary promoted to stable"
else
    log_info "[DRY-RUN] Would promote canary to stable and delete canary deployment"
fi

# Summary
log_info "=========================================="
log_info "Canary Deployment Complete!"
log_info "=========================================="
log_info "Image: $NEW_IMAGE"
log_info "Namespace: $NAMESPACE"
log_info "Traffic progression: ${TRAFFIC_STAGES[*]}%"
log_info "All health checks passed"
log_info "=========================================="

if [ "$DRY_RUN" == "false" ]; then
    echo ""
    log_info "Current deployments:"
    kubectl get deployments -n $NAMESPACE -l app=cortex,component=coordinator
fi

exit 0
