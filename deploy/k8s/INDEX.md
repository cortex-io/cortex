# Cortex Kubernetes Deployment - File Index

Quick reference for all files in this directory.

## Start Here

1. **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
2. **[README.md](README.md)** - Full deployment documentation
3. **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** - What was created and why

## Core Kubernetes Manifests

Deploy in this order:

| # | File | Description | Size |
|---|------|-------------|------|
| 1 | [namespace.yaml](namespace.yaml) | Cortex namespace with pod security standards | 642B |
| 2 | [rbac.yaml](rbac.yaml) | ServiceAccount, Role, RoleBinding for cortex | 4.0K |
| 3 | [configmap.yaml](configmap.yaml) | Application configuration (non-sensitive) | 930B |
| 4 | [secret.yaml](secret.yaml) | **SECRET TEMPLATE** - Configure before deploy! | 1.6K |
| 5 | [pvc.yaml](pvc.yaml) | PersistentVolumeClaim for data storage (50Gi) | 1.8K |
| 6 | [deployment.yaml](deployment.yaml) | Main cortex deployment (3 replicas, HA) | 8.8K |
| 7 | [service.yaml](service.yaml) | ClusterIP and Headless services | 1.5K |
| 8 | [pdb.yaml](pdb.yaml) | PodDisruptionBudget (ensures min 2 pods) | 875B |
| 9 | [hpa.yaml](hpa.yaml) | HorizontalPodAutoscaler (3-10 replicas) | 2.6K |
| 10 | [ingress.yaml](ingress.yaml) | Ingress with TLS and Cloudflare support | 5.8K |

## Kustomize

| File | Description |
|------|-------------|
| [kustomization.yaml](kustomization.yaml) | Base kustomize configuration |

## Environment Overlays

Customize for different environments:

### Production (overlays/production/)
- [kustomization.yaml](overlays/production/kustomization.yaml) - 5 replicas, high resources
- [deployment-patch.yaml](overlays/production/deployment-patch.yaml) - Resource overrides
- [ingress-patch.yaml](overlays/production/ingress-patch.yaml) - Production domain

### Staging (overlays/staging/)
- [kustomization.yaml](overlays/staging/kustomization.yaml) - 2 replicas, moderate resources
- [deployment-patch.yaml](overlays/staging/deployment-patch.yaml) - Resource overrides
- [ingress-patch.yaml](overlays/staging/ingress-patch.yaml) - Staging domain

### Development (overlays/development/)
- [kustomization.yaml](overlays/development/kustomization.yaml) - 1 replica, minimal resources
- [deployment-patch.yaml](overlays/development/deployment-patch.yaml) - Resource overrides

## Documentation

| File | Purpose | Size |
|------|---------|------|
| [README.md](README.md) | Comprehensive deployment guide | 14K |
| [QUICKSTART.md](QUICKSTART.md) | 5-minute quick start guide | 6.0K |
| [VALUES_REFERENCE.md](VALUES_REFERENCE.md) | Complete configuration reference | 13K |
| [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) | Summary of what was created | 15K |
| [INDEX.md](INDEX.md) | This file - navigation guide | - |

## Automation

| File | Purpose | Size |
|------|---------|------|
| [Makefile](Makefile) | 30+ make targets for common operations | 10K |
| [.gitignore](.gitignore) | Prevent committing secrets | 304B |

## Quick Commands Reference

### Deploy Everything
```bash
# Using Makefile
make build-push create-secrets deploy

# Using kubectl
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
# Create secrets manually!
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f pdb.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml

# Using Kustomize
kubectl apply -k .
```

### Check Status
```bash
make status
# or
kubectl get all -n cortex
```

### View Logs
```bash
make logs
# or
kubectl logs -n cortex -l app.kubernetes.io/name=cortex -f
```

### Access Cortex
```bash
make port-forward
# Then visit:
# - http://localhost:9500 (API)
# - http://localhost:3004 (Dashboard)
```

## File Dependencies

```
namespace.yaml (create first)
    ↓
rbac.yaml (depends on namespace)
    ↓
configmap.yaml (depends on namespace)
    ↓
secret.yaml (depends on namespace) ← CREATE MANUALLY!
    ↓
pvc.yaml (depends on namespace)
    ↓
deployment.yaml (depends on all above)
    ↓
service.yaml (depends on deployment)
    ↓
pdb.yaml (depends on deployment)
    ↓
hpa.yaml (depends on deployment)
    ↓
ingress.yaml (depends on service)
```

## What to Customize

### Required (Before Deploy)
1. **secret.yaml** - Add actual API keys
2. **ingress.yaml** - Change domain from example.com
3. **pvc.yaml** - Choose storage class for your cluster

### Recommended
4. **configmap.yaml** - Update ALLOWED_ORIGINS
5. **deployment.yaml** - Adjust resource limits
6. **hpa.yaml** - Set min/max replicas

### Optional
7. **rbac.yaml** - Adjust permissions
8. **pdb.yaml** - Change minAvailable
9. **service.yaml** - Change service type

## Resource Manifest Details

### namespace.yaml
- Creates `cortex` namespace
- Sets pod security standards to `restricted`
- Adds standard labels and annotations

### rbac.yaml
Contains 3 resources:
- `ServiceAccount: cortex` - Identity for pods
- `Role: cortex` - Namespace-scoped permissions
- `RoleBinding: cortex` - Binds role to service account
- `ClusterRole: cortex-cluster-reader` - Optional cluster-wide read (commented out)

### configmap.yaml
Environment variables:
- NODE_ENV
- ALLOWED_ORIGINS
- MAX_WORKERS (10000)
- WORKER_TIMEOUT_MINUTES (45)
- WORKER_TOKEN_BUDGET (10000)
- DEBUG (false)
- METRICS_RETENTION_DAYS (30)
- GIT_AUTHOR_NAME/EMAIL
- NODE_OPTIONS
- TZ (UTC)

### secret.yaml
**WARNING**: Template only! Contains:
- anthropic-api-key (REPLACE!)
- api-key (REPLACE!)

### pvc.yaml
- 50Gi storage request
- ReadWriteOnce access
- local-path storage class (change to longhorn for production)

### deployment.yaml
- 3 replicas (HA)
- Rolling updates (maxUnavailable: 0)
- Security contexts (non-root, read-only FS)
- Resource limits (500m-2000m CPU, 1-4Gi RAM)
- Health probes (startup, liveness, readiness)
- Pod anti-affinity (spread across nodes)
- Init container for permissions
- Volumes: data (PVC), tmp, npm-cache

### service.yaml
Two services:
1. `cortex` - ClusterIP with sticky sessions
   - Port 9500 (HTTP)
   - Port 9501 (WebSocket)
   - Port 3004 (Dashboard)
2. `cortex-headless` - For service discovery
   - Same ports, clusterIP: None

### pdb.yaml
- minAvailable: 2 pods
- Ensures HA during disruptions
- unhealthyPodEvictionPolicy: IfHealthyBudget

### hpa.yaml
- Min: 3 replicas
- Max: 10 replicas
- Metrics: CPU (70%), Memory (80%)
- Smart scale up/down policies
- Optional VPA section (commented out)

### ingress.yaml
Two ingress resources:
1. `cortex` - Main API/Dashboard
   - TLS enabled
   - NGINX annotations
   - WebSocket support
   - CORS enabled
   - Rate limiting
2. `cortex-dashboard` - Separate dashboard domain (optional)
   - Similar configuration

Also includes:
- Cloudflare Tunnel configuration (commented out)

### kustomization.yaml
- Base configuration
- Resource list
- Common labels/annotations
- Image configuration
- Replica count
- Patch examples (commented out)

## Makefile Targets

Run `make help` for full list. Categories:

### Build & Push
- build, push, build-push

### Deployment
- deploy, deploy-kustomize, delete, validate

### Operations
- status, logs, shell, port-forward, restart, scale

### Secrets
- create-secrets, update-secret

### Troubleshooting
- describe, events, debug, test-health, test-connectivity

### Backup & Restore
- backup, restore

### Maintenance
- clean, update-image, rollback, history

### Monitoring
- metrics, top

## Best Practices

1. **Never commit secrets** - Use .gitignore, sealed-secrets, or external secret managers
2. **Deploy to dev first** - Test in overlays/development before production
3. **Use Kustomize overlays** - Separate configs for dev/staging/prod
4. **Monitor resource usage** - Adjust limits based on actual usage
5. **Enable autoscaling** - Let HPA handle traffic spikes
6. **Implement backups** - Regular PVC snapshots
7. **Document changes** - Keep this index updated

## Troubleshooting Quick Links

### Pods Not Starting
See: [README.md - Troubleshooting](README.md#troubleshooting)

### Storage Issues
See: [README.md - Storage Configuration](README.md#storage-configuration)

### Networking Issues
See: [README.md - Networking Issues](README.md#networking-issues)

### Permission Issues
See: [README.md - Permission Issues](README.md#permission-issues)

## Next Steps

1. Read [QUICKSTART.md](QUICKSTART.md)
2. Review [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)
3. Customize manifests for your environment
4. Deploy to development overlay first
5. Test thoroughly
6. Deploy to production

## Support

- Talos Contractor: `/Users/ryandahlberg/Projects/cortex/coordination/contractors/talos-contractor.md`
- Cortex Docs: `/Users/ryandahlberg/Projects/cortex/docs/`
- Kubernetes Docs: https://kubernetes.io/docs/
- Talos Docs: https://www.talos.dev/

---

Last Updated: 2025-12-09
Version: 2.0.0
