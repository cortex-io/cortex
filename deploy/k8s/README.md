# Cortex Kubernetes Deployment for Talos Linux

Production-ready Kubernetes manifests for deploying Cortex AI orchestration platform to Talos Linux clusters.

## Overview

This directory contains production-grade Kubernetes manifests for deploying Cortex with:

- High availability (3+ replicas)
- Automatic horizontal pod autoscaling
- Pod disruption budgets for zero-downtime operations
- Security contexts and RBAC
- Persistent storage for data, logs, and repositories
- Ingress with TLS/SSL support
- Health probes (startup, liveness, readiness)
- Resource limits and requests
- Cloudflare Tunnel compatibility

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Talos Kubernetes Cluster                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Cortex Pod  │  │  Cortex Pod  │  │  Cortex Pod  │     │
│  │  (replica 1) │  │  (replica 2) │  │  (replica 3) │     │
│  │              │  │              │  │              │     │
│  │ - HTTP :9500 │  │ - HTTP :9500 │  │ - HTTP :9500 │     │
│  │ - WS   :9501 │  │ - WS   :9501 │  │ - WS   :9501 │     │
│  │ - Dash :3004 │  │ - Dash :3004 │  │ - Dash :3004 │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│                    ┌──────▼───────┐                        │
│                    │   Service    │                        │
│                    │  (ClusterIP) │                        │
│                    └──────┬───────┘                        │
│                           │                                │
│                    ┌──────▼───────┐                        │
│                    │   Ingress    │                        │
│                    │ (NGINX/CF)   │                        │
│                    └──────┬───────┘                        │
│                           │                                │
└───────────────────────────┼────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  External      │
                    │  Access        │
                    │  (TLS/SSL)     │
                    └────────────────┘
```

## Prerequisites

1. **Talos Linux Cluster** (v1.5+)
   - 3+ control plane nodes
   - 3+ worker nodes (recommended)
   - Storage provisioner (local-path, Longhorn, NFS, Ceph)

2. **kubectl** configured with cluster access
   ```bash
   kubectl version --short
   ```

3. **Optional Tools**:
   - `kustomize` (v5.0+) - for customization
   - `helm` (v3.0+) - if converting to Helm chart
   - `cert-manager` - for automatic TLS certificates
   - `cloudflared` - for Cloudflare Tunnel

## File Structure

```
deploy/k8s/
├── README.md               # This file
├── namespace.yaml          # Cortex namespace with labels
├── configmap.yaml          # Application configuration
├── secret.yaml             # Secrets template (API keys)
├── rbac.yaml               # ServiceAccount, Role, RoleBinding
├── pvc.yaml                # PersistentVolumeClaim for data
├── deployment.yaml         # Cortex deployment (3 replicas)
├── service.yaml            # ClusterIP service
├── ingress.yaml            # Ingress with TLS/Cloudflare support
├── pdb.yaml                # PodDisruptionBudget (HA)
├── hpa.yaml                # HorizontalPodAutoscaler
└── kustomization.yaml      # Kustomize base configuration
```

## Quick Start

### 1. Build and Push Docker Image

First, build and push the Cortex container image:

```bash
# From cortex project root
cd /Users/ryandahlberg/Projects/cortex

# Build image using the existing Dockerfile
docker build -t ghcr.io/ry-ops/cortex:2.0.0 \
  -f lib/coordination/deployment/Dockerfile .

# Tag as latest
docker tag ghcr.io/ry-ops/cortex:2.0.0 ghcr.io/ry-ops/cortex:latest

# Push to registry (requires authentication)
docker push ghcr.io/ry-ops/cortex:2.0.0
docker push ghcr.io/ry-ops/cortex:latest
```

### 2. Configure Secrets

Create actual secrets (DO NOT commit to git):

```bash
# Create namespace first
kubectl apply -f namespace.yaml

# Create secrets
kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key='sk-ant-your-actual-key' \
  --from-literal=api-key="$(openssl rand -base64 32)" \
  --namespace=cortex

# Verify secret created
kubectl get secret cortex-secrets -n cortex
```

### 3. Customize Configuration

Edit `configmap.yaml` to customize:

```yaml
data:
  ALLOWED_ORIGINS: "https://your-domain.com"
  MAX_WORKERS: "10000"
  # ... other settings
```

### 4. Deploy to Cluster

Using kubectl:

```bash
# Deploy all manifests
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
# Skip secret.yaml (created manually in step 2)
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f pdb.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```

Using kustomize:

```bash
# Deploy with kustomize
kubectl apply -k .

# Or build and preview first
kubectl kustomize . | less
kubectl kustomize . | kubectl apply -f -
```

### 5. Verify Deployment

```bash
# Check namespace
kubectl get namespace cortex

# Check all resources
kubectl get all -n cortex

# Check pods
kubectl get pods -n cortex -w

# Check logs
kubectl logs -n cortex -l app.kubernetes.io/name=cortex --tail=100 -f

# Check service
kubectl get svc -n cortex

# Check ingress
kubectl get ingress -n cortex
```

## Storage Configuration

### Local Path Provisioner (Default)

Talos includes local-path-provisioner by default:

```yaml
storageClassName: local-path
```

### Longhorn (Recommended for Production)

Install Longhorn for distributed storage:

```bash
# Install Longhorn
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.5.3/deploy/longhorn.yaml

# Update pvc.yaml
storageClassName: longhorn
```

### NFS Storage

For shared NFS storage:

```yaml
storageClassName: nfs-client
```

## Ingress Configuration

### Option 1: NGINX Ingress Controller

Install NGINX ingress:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.5/deploy/static/provider/cloud/deploy.yaml
```

Update `ingress.yaml` with your domain:

```yaml
spec:
  tls:
  - hosts:
    - cortex.yourdomain.com
    secretName: cortex-tls
  rules:
  - host: cortex.yourdomain.com
```

### Option 2: Cloudflare Tunnel

Use Cloudflare Tunnel (no exposed ports needed):

```bash
# Create tunnel
cloudflared tunnel create cortex

# Get tunnel credentials
cloudflared tunnel token cortex

# Deploy cloudflared (see ingress.yaml comments)
kubectl apply -f cloudflared-deployment.yaml
```

## TLS/SSL Certificates

### Option 1: cert-manager (Recommended)

Install cert-manager:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml
```

Create ClusterIssuer:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

### Option 2: Manual Certificates

Create TLS secret manually:

```bash
kubectl create secret tls cortex-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  --namespace=cortex
```

## Monitoring and Observability

### Prometheus Metrics

Cortex exposes metrics at `/metrics`:

```bash
# Port-forward to access metrics
kubectl port-forward -n cortex svc/cortex 9500:9500

# Access metrics
curl http://localhost:9500/metrics
```

### Logging

View logs:

```bash
# All pods
kubectl logs -n cortex -l app.kubernetes.io/name=cortex --tail=100

# Specific pod
kubectl logs -n cortex cortex-<pod-id> -f

# Previous container logs
kubectl logs -n cortex cortex-<pod-id> --previous
```

### Health Checks

```bash
# Check health endpoint
kubectl port-forward -n cortex svc/cortex 9500:9500
curl http://localhost:9500/health
```

## Scaling

### Manual Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment cortex -n cortex --replicas=5

# Verify
kubectl get deployment cortex -n cortex
```

### Autoscaling (HPA)

HPA is configured to scale based on CPU/memory:

```bash
# Check HPA status
kubectl get hpa -n cortex

# Describe HPA
kubectl describe hpa cortex -n cortex

# Adjust HPA settings in hpa.yaml
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod -n cortex cortex-<pod-id>

# Check events
kubectl get events -n cortex --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n cortex cortex-<pod-id>
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n cortex

# Describe PVC
kubectl describe pvc cortex-data -n cortex

# Check available storage classes
kubectl get storageclass
```

### Networking Issues

```bash
# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -n cortex -- sh
wget -O- http://cortex.cortex.svc.cluster.local:9500/health

# Check endpoints
kubectl get endpoints -n cortex

# Check ingress
kubectl describe ingress cortex -n cortex
```

### Permission Issues

```bash
# Check RBAC
kubectl get serviceaccount cortex -n cortex
kubectl get role cortex -n cortex
kubectl get rolebinding cortex -n cortex

# Test permissions
kubectl auth can-i list pods --namespace=cortex --as=system:serviceaccount:cortex:cortex
```

## Backup and Restore

### Backup PVC Data

```bash
# Create backup pod
kubectl run backup -n cortex --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"cortex-data"}}],"containers":[{"name":"backup","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}'

# Copy data out
kubectl cp cortex/backup:/data ./cortex-backup

# Clean up
kubectl delete pod backup -n cortex
```

### Restore from Backup

```bash
# Create restore pod
kubectl run restore -n cortex --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"cortex-data"}}],"containers":[{"name":"restore","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}'

# Copy data in
kubectl cp ./cortex-backup cortex/restore:/data

# Clean up
kubectl delete pod restore -n cortex
```

## Upgrading

### Rolling Update

```bash
# Update image tag in deployment.yaml or kustomization.yaml
# Then apply:
kubectl apply -k .

# Watch rollout
kubectl rollout status deployment cortex -n cortex

# Check rollout history
kubectl rollout history deployment cortex -n cortex
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment cortex -n cortex

# Rollback to specific revision
kubectl rollout undo deployment cortex -n cortex --to-revision=2
```

## Production Checklist

- [ ] Secrets properly configured (not using template values)
- [ ] Storage class configured for your cluster
- [ ] Ingress domain configured
- [ ] TLS certificates configured (cert-manager or manual)
- [ ] Resource limits reviewed and adjusted
- [ ] ALLOWED_ORIGINS updated in ConfigMap
- [ ] Backup strategy implemented
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Logging aggregation configured (ELK/Loki)
- [ ] Alerts configured for critical metrics
- [ ] PodDisruptionBudget configured (ensures 2+ pods during disruptions)
- [ ] HPA configured and tested
- [ ] Network policies applied (optional)
- [ ] Pod security policies/standards applied

## Security Best Practices

1. **Secrets Management**: Use external secret managers (Vault, AWS Secrets Manager)
2. **RBAC**: Review and minimize permissions in rbac.yaml
3. **Network Policies**: Implement network policies to restrict pod communication
4. **Pod Security Standards**: Namespace uses "restricted" pod security standard
5. **Image Scanning**: Scan container images for vulnerabilities
6. **TLS Everywhere**: Use TLS for all external communication
7. **Audit Logging**: Enable Kubernetes audit logging

## Customization with Kustomize

Create overlays for different environments:

```bash
# Create overlay for staging
mkdir -p overlays/staging
cat > overlays/staging/kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: cortex-staging
resources:
- ../../base
patchesStrategicMerge:
- deployment-patch.yaml
images:
- name: ghcr.io/ry-ops/cortex
  newTag: staging
EOF

# Deploy staging
kubectl apply -k overlays/staging
```

## Support

- Documentation: `/Users/ryandahlberg/Projects/cortex/docs/`
- Talos Contractor: `/Users/ryandahlberg/Projects/cortex/coordination/contractors/talos-contractor.md`
- Issues: GitHub Issues

## License

MIT License - See LICENSE file in project root
