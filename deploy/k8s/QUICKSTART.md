# Cortex Kubernetes Quick Start

Get Cortex running on your Talos cluster in 5 minutes.

## Prerequisites

- Talos Kubernetes cluster (v1.5+)
- `kubectl` configured
- Docker for building images
- Anthropic API key

## Option 1: Using Makefile (Recommended)

### 1. Build and Push Image

```bash
# Build and push to registry
make build-push IMAGE_TAG=2.0.0

# Or build only (for local testing)
make build IMAGE_TAG=2.0.0
```

### 2. Create Secrets

```bash
# Interactive secret creation
make create-secrets

# Or manual creation
kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key='sk-ant-your-key' \
  --from-literal=api-key="$(openssl rand -base64 32)" \
  --namespace=cortex
```

### 3. Deploy

```bash
# Deploy everything
make deploy

# Or with kustomize
make deploy-kustomize
```

### 4. Verify

```bash
# Check status
make status

# View logs
make logs

# Port forward to access
make port-forward
```

Access at:
- HTTP API: http://localhost:9500
- WebSocket: ws://localhost:9501
- Dashboard: http://localhost:3004

## Option 2: Manual kubectl

### 1. Build Image

```bash
cd /Users/ryandahlberg/Projects/cortex
docker build -t ghcr.io/ry-ops/cortex:2.0.0 \
  -f lib/coordination/deployment/Dockerfile .
docker push ghcr.io/ry-ops/cortex:2.0.0
```

### 2. Create Namespace and Secrets

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Create secrets
kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key='your-key' \
  --from-literal=api-key="$(openssl rand -base64 32)" \
  --namespace=cortex
```

### 3. Deploy Resources

```bash
# Deploy in order
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f pdb.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```

### 4. Wait for Ready

```bash
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=cortex \
  -n cortex --timeout=300s
```

## Option 3: Using Kustomize

### Base Deployment

```bash
# Deploy base configuration
kubectl apply -k .
```

### Environment-Specific Overlays

```bash
# Development (1 replica, minimal resources)
kubectl apply -k overlays/development/

# Staging (2 replicas, moderate resources)
kubectl apply -k overlays/staging/

# Production (5 replicas, high resources)
kubectl apply -k overlays/production/
```

## Accessing Cortex

### Port Forward (Development)

```bash
kubectl port-forward -n cortex svc/cortex 9500:9500 9501:9501 3004:3004
```

Then access:
- API: http://localhost:9500/health
- Dashboard: http://localhost:3004

### Ingress (Production)

Update `ingress.yaml` with your domain:

```yaml
spec:
  rules:
  - host: cortex.yourdomain.com  # Change this
```

Then apply:

```bash
kubectl apply -f ingress.yaml
```

Access at: https://cortex.yourdomain.com

## Common Operations

### View Logs

```bash
# All pods
kubectl logs -n cortex -l app.kubernetes.io/name=cortex --tail=100 -f

# Specific pod
kubectl logs -n cortex cortex-<pod-id> -f
```

### Scale

```bash
# Manual scaling
kubectl scale deployment cortex -n cortex --replicas=5

# With makefile
make scale REPLICAS=5
```

### Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap cortex-config -n cortex

# Restart to apply changes
kubectl rollout restart deployment cortex -n cortex
```

### Check Status

```bash
# Pod status
kubectl get pods -n cortex

# All resources
kubectl get all -n cortex

# HPA status
kubectl get hpa -n cortex

# With makefile
make status
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod -n cortex cortex-<pod-id>

# Check events
kubectl get events -n cortex --sort-by='.lastTimestamp'
```

### Storage Issues

```bash
# Check PVC
kubectl get pvc -n cortex
kubectl describe pvc cortex-data -n cortex

# Check storage classes
kubectl get storageclass
```

### Secret Not Found

```bash
# Check if secret exists
kubectl get secret cortex-secrets -n cortex

# Recreate if missing
make create-secrets
```

### Health Check Failing

```bash
# Test health endpoint
kubectl exec -n cortex cortex-<pod-id> -- \
  wget -qO- http://localhost:9500/health

# Check logs
kubectl logs -n cortex cortex-<pod-id>
```

## Next Steps

1. **Configure Ingress**: Set up your domain and TLS certificates
2. **Setup Monitoring**: Deploy Prometheus and Grafana
3. **Configure Storage**: Choose appropriate StorageClass for your cluster
4. **Enable Autoscaling**: Tune HPA metrics based on your workload
5. **Setup Backups**: Implement PVC backup strategy

## Clean Up

```bash
# Delete everything
make delete

# Or manually
kubectl delete namespace cortex
```

## Production Checklist

Before deploying to production:

- [ ] Secrets configured (not template values)
- [ ] Storage class selected (Longhorn recommended)
- [ ] Ingress domain configured
- [ ] TLS certificates setup (cert-manager)
- [ ] Resource limits reviewed
- [ ] Monitoring configured
- [ ] Backup strategy implemented
- [ ] ALLOWED_ORIGINS updated in ConfigMap
- [ ] PodDisruptionBudget configured
- [ ] Network policies applied (optional)

## Support

- Full Documentation: [README.md](README.md)
- Makefile Commands: `make help`
- Talos Documentation: https://www.talos.dev/

## Examples

### Quick Development Deploy

```bash
make build
make create-secrets
make deploy
make port-forward
```

### Production Deploy with Kustomize

```bash
make build-push IMAGE_TAG=2.0.0
kubectl apply -k overlays/production/
kubectl get pods -n cortex-prod -w
```

### Update to New Version

```bash
make build-push IMAGE_TAG=2.1.0
make update-image TAG=2.1.0
```

### Rollback

```bash
make rollback
```

## Architecture

```
Cortex Deployment
├── 3 Replicas (default)
├── Pod Anti-Affinity (spread across nodes)
├── Resource Limits (500m-2000m CPU, 1Gi-4Gi RAM)
├── Health Probes (startup, liveness, readiness)
├── Persistent Storage (50Gi PVC)
├── Autoscaling (3-10 replicas based on CPU/memory)
├── High Availability (PDB ensures 2+ pods)
└── Security (non-root, read-only filesystem, RBAC)
```
