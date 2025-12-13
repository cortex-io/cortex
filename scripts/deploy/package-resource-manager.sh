#!/bin/bash
set -euo pipefail

# Package cortex-resource-manager deployment for transfer to K3s cluster
# This creates a self-contained deployment package

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$CORTEX_ROOT/k8s/services/resource-manager"
PACKAGE_DIR="/tmp/cortex-resource-manager-deployment"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Clean and create package directory
log_info "Creating deployment package..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy manifests
cp "$K8S_DIR"/*.yaml "$PACKAGE_DIR/"

# Create deployment script for K3s cluster
cat > "$PACKAGE_DIR/deploy.sh" <<'DEPLOY_SCRIPT'
#!/bin/bash
set -euo pipefail

# Deploy cortex-resource-manager on K3s cluster
# Run this script ON the K3s control plane node

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if running on K3s node
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl not found. This script must run on a K3s node."
    exit 1
fi

log_info "Deploying cortex-resource-manager..."

# Apply manifests in order
log_info "Creating namespace..."
kubectl apply -f namespace.yaml

log_info "Creating RBAC..."
kubectl apply -f serviceaccount.yaml

log_info "Creating ConfigMap..."
kubectl apply -f configmap.yaml

log_info "Creating Service..."
kubectl apply -f service.yaml

log_info "Creating ServiceMonitor (if Prometheus CRD exists)..."
kubectl apply -f servicemonitor.yaml 2>/dev/null || echo "ServiceMonitor CRD not found, skipping"

log_info "Creating Deployment..."
kubectl apply -f deployment.yaml

log_info "Waiting for rollout to complete..."
kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s

log_success "Deployment complete!"

log_info "Pod status:"
kubectl get pods -n cortex-system -l app=cortex-resource-manager -o wide

log_info "Service endpoints:"
kubectl get endpoints cortex-resource-manager -n cortex-system

log_info ""
log_info "Service URL: cortex-resource-manager.cortex-system.svc.cluster.local:8080"
log_info "To view logs: kubectl logs -n cortex-system -l app=cortex-resource-manager -f"
log_info "To test: kubectl run test-rm --image=curlimages/curl:latest --rm -i --restart=Never -- curl http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health"
DEPLOY_SCRIPT

chmod +x "$PACKAGE_DIR/deploy.sh"

# Create README
cat > "$PACKAGE_DIR/README.md" <<'README'
# Cortex Resource Manager Deployment Package

This package contains all manifests and scripts needed to deploy cortex-resource-manager to your K3s cluster.

## Contents

- `namespace.yaml` - cortex-system namespace
- `serviceaccount.yaml` - RBAC (ServiceAccount, ClusterRole, ClusterRoleBinding)
- `configmap.yaml` - Configuration
- `deployment.yaml` - Deployment manifest
- `service.yaml` - Service (ClusterIP on port 8080)
- `servicemonitor.yaml` - Prometheus ServiceMonitor (optional)
- `kustomization.yaml` - Kustomize configuration
- `deploy.sh` - Automated deployment script

## Deployment Instructions

### Option 1: Automated Deployment (Recommended)

1. Transfer this directory to your K3s control plane node:
   ```bash
   scp -r cortex-resource-manager-deployment/ root@10.88.145.180:/tmp/
   ```

2. SSH into the K3s node:
   ```bash
   ssh root@10.88.145.180
   ```

3. Run the deployment script:
   ```bash
   cd /tmp/cortex-resource-manager-deployment
   ./deploy.sh
   ```

### Option 2: Manual Deployment

```bash
# On K3s control plane node
cd /tmp/cortex-resource-manager-deployment

kubectl apply -f namespace.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f configmap.yaml
kubectl apply -f service.yaml
kubectl apply -f servicemonitor.yaml  # Optional
kubectl apply -f deployment.yaml

kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s
```

### Option 3: Kustomize Deployment

```bash
kubectl apply -k .
```

## Verification

After deployment:

```bash
# Check pod status
kubectl get pods -n cortex-system -l app=cortex-resource-manager

# Check service
kubectl get svc cortex-resource-manager -n cortex-system

# View logs
kubectl logs -n cortex-system -l app=cortex-resource-manager -f

# Test health endpoint
kubectl run test-health --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health
```

## Service Details

- **Namespace**: cortex-system
- **Service Name**: cortex-resource-manager
- **Port**: 8080 (MCP API), 9090 (Metrics)
- **Service URL**: cortex-resource-manager.cortex-system.svc.cluster.local:8080
- **Image**: ghcr.io/ry-ops/cortex-resource-manager:latest

## Resource Allocation

- **Requests**: 250m CPU, 256Mi RAM
- **Limits**: 500m CPU, 512Mi RAM

## RBAC Permissions

The service account has cluster-admin level permissions for:
- Deployment management
- Pod lifecycle management
- Service management
- ConfigMap/Secret management
- PVC/PV management
- Node management (for worker operations)
- HPA and KEDA ScaledObject management
- Metrics access

## Troubleshooting

### Pod not starting

```bash
kubectl describe pod -n cortex-system -l app=cortex-resource-manager
kubectl logs -n cortex-system -l app=cortex-resource-manager
```

### Image pull errors

Ensure the K3s cluster can access ghcr.io. You may need to configure image pull secrets.

### RBAC errors

Check the ClusterRoleBinding:
```bash
kubectl get clusterrolebinding cortex-resource-manager -o yaml
```

## Uninstall

```bash
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f servicemonitor.yaml
kubectl delete -f configmap.yaml
kubectl delete -f serviceaccount.yaml
# Optional: kubectl delete -f namespace.yaml
```
README

# Create tarball
log_info "Creating tarball..."
cd /tmp
tar -czf cortex-resource-manager-deployment.tar.gz cortex-resource-manager-deployment/

log_success "Deployment package created!"
echo ""
log_info "Package location: /tmp/cortex-resource-manager-deployment.tar.gz"
log_info "Package directory: /tmp/cortex-resource-manager-deployment/"
echo ""
log_info "Next steps:"
echo "  1. Transfer to K3s node:"
echo "     scp /tmp/cortex-resource-manager-deployment.tar.gz root@10.88.145.180:/tmp/"
echo ""
echo "  2. SSH to K3s node and deploy:"
echo "     ssh root@10.88.145.180"
echo "     cd /tmp && tar -xzf cortex-resource-manager-deployment.tar.gz"
echo "     cd cortex-resource-manager-deployment && ./deploy.sh"
echo ""
log_info "Or copy the directory directly:"
echo "     scp -r /tmp/cortex-resource-manager-deployment root@10.88.145.180:/tmp/"
