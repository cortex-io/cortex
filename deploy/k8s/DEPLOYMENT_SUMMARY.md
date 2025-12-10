# Cortex Kubernetes Deployment Summary

## What Was Created

Production-ready Kubernetes manifests for deploying Cortex AI orchestration platform to Talos Linux clusters.

## File Structure

```
deploy/k8s/
├── Core Manifests (10 files)
│   ├── namespace.yaml          # Cortex namespace with pod security standards
│   ├── rbac.yaml               # ServiceAccount, Role, RoleBinding
│   ├── configmap.yaml          # Application configuration
│   ├── secret.yaml             # Secrets template (NEVER commit actual secrets!)
│   ├── pvc.yaml                # PersistentVolumeClaim (50Gi)
│   ├── deployment.yaml         # Main deployment (3 replicas, HA, security)
│   ├── service.yaml            # ClusterIP + Headless services
│   ├── ingress.yaml            # Ingress with TLS/Cloudflare support
│   ├── pdb.yaml                # PodDisruptionBudget (min 2 available)
│   └── hpa.yaml                # HorizontalPodAutoscaler (3-10 replicas)
│
├── Kustomize Base
│   └── kustomization.yaml      # Base configuration
│
├── Environment Overlays (3 environments)
│   ├── overlays/development/   # 1 replica, minimal resources
│   ├── overlays/staging/       # 2 replicas, moderate resources
│   └── overlays/production/    # 5 replicas, high resources
│
├── Documentation (3 guides)
│   ├── README.md               # Comprehensive deployment guide
│   ├── QUICKSTART.md           # 5-minute quick start
│   └── VALUES_REFERENCE.md     # Complete configuration reference
│
├── Automation
│   ├── Makefile                # 30+ make targets for common operations
│   └── .gitignore              # Prevent committing secrets
│
└── This File
    └── DEPLOYMENT_SUMMARY.md   # You are here
```

## Key Features

### High Availability
- 3 replica deployment (configurable via HPA: 3-10)
- Pod anti-affinity spreads pods across nodes
- PodDisruptionBudget ensures 2+ pods during disruptions
- Rolling updates with zero downtime (maxUnavailable: 0)
- Topology spread constraints for better distribution

### Security
- Non-root user (UID 1000)
- Read-only root filesystem
- Dropped all Linux capabilities
- Seccomp profile (RuntimeDefault)
- Pod Security Standards (restricted)
- RBAC with minimal permissions
- Secret management (separate from ConfigMap)

### Observability
- Startup, liveness, and readiness probes
- Prometheus metrics annotations
- Structured logging to stdout
- Health check endpoint (/health)

### Autoscaling
- Horizontal Pod Autoscaler (CPU and memory based)
- Scale from 3 to 10 replicas automatically
- Configurable scale up/down policies
- Optional VerticalPodAutoscaler support

### Storage
- 50Gi PersistentVolumeClaim for data
- Support for multiple storage backends:
  - local-path (default, built into Talos)
  - Longhorn (recommended for production)
  - NFS, Ceph, others
- Separate volumes for data, logs, and repos
- EmptyDir for tmp and npm cache

### Networking
- ClusterIP service for internal access
- Headless service for StatefulSet-like discovery
- Ingress with TLS/SSL support
- WebSocket support (sticky sessions)
- Cloudflare Tunnel compatible
- CORS configuration

### Resource Management
- CPU: 500m request, 2000m limit
- Memory: 1Gi request, 4Gi limit
- Ephemeral storage: 1Gi request, 5Gi limit
- Configurable per environment (dev/staging/prod)

## Quick Deploy Commands

### Using Makefile (Recommended)
```bash
# One-line deploy
make build-push create-secrets deploy

# Check status
make status

# View logs
make logs

# Port forward
make port-forward
```

### Using kubectl
```bash
# Deploy all
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
# Create secrets manually
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f pdb.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```

### Using Kustomize
```bash
# Base deployment
kubectl apply -k .

# Environment-specific
kubectl apply -k overlays/production/
kubectl apply -k overlays/staging/
kubectl apply -k overlays/development/
```

## Configuration Points

### Must Configure (Before Deploy)

1. **Secrets** (secret.yaml)
   - Anthropic API key
   - API key for authentication

2. **Domain** (ingress.yaml)
   - Replace `cortex.example.com` with your domain

3. **Storage Class** (pvc.yaml)
   - Choose: local-path, longhorn, nfs-client, etc.

### Should Configure (For Production)

4. **CORS Origins** (configmap.yaml)
   - Update ALLOWED_ORIGINS

5. **Resource Limits** (deployment.yaml)
   - Adjust based on your workload

6. **Replica Count** (deployment.yaml, hpa.yaml)
   - Set min/max replicas

7. **TLS Certificates** (ingress.yaml)
   - Configure cert-manager or provide manual certs

### Optional Configuration

8. **Monitoring** (deployment.yaml annotations)
   - Prometheus scraping enabled by default

9. **Network Policies**
   - Add for additional network security

10. **Service Mesh**
    - Istio/Linkerd compatible

## Environment Overlays

### Development
- **Namespace**: cortex-dev
- **Replicas**: 1
- **Resources**: 100m CPU, 256Mi RAM
- **Image Tag**: dev
- **Debug**: Enabled

### Staging
- **Namespace**: cortex-staging
- **Replicas**: 2
- **Resources**: 250m CPU, 512Mi RAM
- **Image Tag**: staging
- **Debug**: Enabled

### Production
- **Namespace**: cortex-prod
- **Replicas**: 5
- **Resources**: 1000m CPU, 2Gi RAM
- **Image Tag**: 2.0.0
- **Debug**: Disabled

## Makefile Targets

### Build & Push
- `make build` - Build Docker image
- `make push` - Push to registry
- `make build-push` - Build and push

### Deployment
- `make deploy` - Deploy to cluster
- `make deploy-kustomize` - Deploy with Kustomize
- `make delete` - Delete deployment

### Operations
- `make status` - Show deployment status
- `make logs` - View logs
- `make shell` - Get shell in pod
- `make port-forward` - Port forward to service
- `make restart` - Restart deployment
- `make scale REPLICAS=5` - Scale deployment

### Secrets
- `make create-secrets` - Create secrets interactively
- `make update-secret` - Update specific secret

### Troubleshooting
- `make describe` - Describe all resources
- `make events` - Show recent events
- `make debug` - Run debug pod
- `make test-health` - Test health endpoint

### Backup & Restore
- `make backup` - Backup PVC data
- `make restore BACKUP=path` - Restore from backup

### Maintenance
- `make clean` - Clean up completed pods
- `make update-image TAG=2.1.0` - Update image
- `make rollback` - Rollback to previous version
- `make history` - Show rollout history

### Monitoring
- `make metrics` - Show HPA metrics
- `make top` - Show resource usage

Run `make help` for full list.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Talos Kubernetes Cluster                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Namespace: cortex                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  Deployment: cortex (3-10 replicas)                  │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │  │
│  │  │   Pod 1     │ │   Pod 2     │ │   Pod 3     │   │  │
│  │  │             │ │             │ │             │   │  │
│  │  │ HTTP :9500  │ │ HTTP :9500  │ │ HTTP :9500  │   │  │
│  │  │ WS   :9501  │ │ WS   :9501  │ │ WS   :9501  │   │  │
│  │  │ Dash :3004  │ │ Dash :3004  │ │ Dash :3004  │   │  │
│  │  │             │ │             │ │             │   │  │
│  │  │ Resources:  │ │ Resources:  │ │ Resources:  │   │  │
│  │  │ CPU: 500m   │ │ CPU: 500m   │ │ CPU: 500m   │   │  │
│  │  │ RAM: 1Gi    │ │ RAM: 1Gi    │ │ RAM: 1Gi    │   │  │
│  │  │             │ │             │ │             │   │  │
│  │  │ Health:     │ │ Health:     │ │ Health:     │   │  │
│  │  │ ✓ Startup   │ │ ✓ Startup   │ │ ✓ Startup   │   │  │
│  │  │ ✓ Liveness  │ │ ✓ Liveness  │ │ ✓ Liveness  │   │  │
│  │  │ ✓ Readiness │ │ ✓ Readiness │ │ ✓ Readiness │   │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │  │
│  │         │                │                │          │  │
│  │         └────────────────┴────────────────┘          │  │
│  │                          │                           │  │
│  │                   ┌──────▼────────┐                  │  │
│  │                   │   Service     │                  │  │
│  │                   │  (ClusterIP)  │                  │  │
│  │                   │  9500/9501/   │                  │  │
│  │                   │     3004      │                  │  │
│  │                   └──────┬────────┘                  │  │
│  │                          │                           │  │
│  │                   ┌──────▼────────┐                  │  │
│  │                   │   Ingress     │                  │  │
│  │                   │ (NGINX/TLS)   │                  │  │
│  │                   │ cortex.       │                  │  │
│  │                   │ example.com   │                  │  │
│  │                   └──────┬────────┘                  │  │
│  │                          │                           │  │
│  └──────────────────────────┼───────────────────────────┘  │
│                             │                              │
│  Supporting Resources:                                     │
│  ├─ ConfigMap: cortex-config                              │
│  ├─ Secret: cortex-secrets                                │
│  ├─ PVC: cortex-data (50Gi)                               │
│  ├─ ServiceAccount: cortex                                │
│  ├─ Role: cortex                                          │
│  ├─ RoleBinding: cortex                                   │
│  ├─ PodDisruptionBudget: cortex (minAvailable: 2)         │
│  └─ HorizontalPodAutoscaler: cortex (3-10 replicas)       │
│                             │                              │
└─────────────────────────────┼──────────────────────────────┘
                              │
                       ┌──────▼──────┐
                       │   External  │
                       │   Access    │
                       │  (HTTPS)    │
                       └─────────────┘
```

## Production Readiness Checklist

Before deploying to production:

- [ ] Docker image built and pushed to registry
- [ ] Secrets configured with actual values (not templates)
- [ ] Storage class selected and available
- [ ] Ingress domain configured
- [ ] TLS certificates configured (cert-manager or manual)
- [ ] ALLOWED_ORIGINS updated in ConfigMap
- [ ] Resource limits reviewed and adjusted
- [ ] Backup strategy implemented
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Logging aggregation configured
- [ ] Alerts configured for critical metrics
- [ ] High availability tested (PDB working)
- [ ] Autoscaling tested (HPA working)
- [ ] Disaster recovery plan documented
- [ ] Security scanning completed
- [ ] Performance testing completed

## Security Considerations

1. **Never commit secrets to git**
   - Use external secret managers (Vault, AWS Secrets Manager)
   - Or use sealed-secrets/SOPS for GitOps

2. **Review RBAC permissions**
   - Minimal permissions granted
   - Can be further restricted based on needs

3. **Enable network policies**
   - Restrict pod-to-pod communication
   - Deny by default, allow specific

4. **Scan container images**
   - Use Trivy/Grype for vulnerability scanning
   - Implement image signing

5. **Enable audit logging**
   - Track all API server access
   - Monitor for suspicious activity

## Talos-Specific Notes

### Storage
- Default `local-path` provisioner available
- Longhorn recommended for production (distributed storage)
- Install with: `kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.5.3/deploy/longhorn.yaml`

### Networking
- CNI: Cilium (recommended), Flannel, Calico supported
- MetalLB for LoadBalancer service type (bare metal)

### Ingress
- Install NGINX: `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.5/deploy/static/provider/cloud/deploy.yaml`
- Or use Cloudflare Tunnel (no open ports needed)

### Monitoring
- Talos has built-in metrics
- Install kube-prometheus-stack for full observability

## Next Steps

1. **Review Configuration**
   - Read through all YAML files
   - Customize for your environment

2. **Test in Development**
   - Deploy to dev overlay first
   - Verify all functionality works

3. **Setup CI/CD**
   - Automate image builds
   - Implement GitOps (ArgoCD/Flux)

4. **Configure Monitoring**
   - Deploy Prometheus/Grafana
   - Setup alerts

5. **Implement Backups**
   - Velero for cluster backups
   - Regular PVC snapshots

6. **Document Runbooks**
   - Incident response procedures
   - Maintenance procedures

## Support Resources

- **Documentation**: See README.md for full docs
- **Quick Start**: See QUICKSTART.md for 5-minute deploy
- **Configuration**: See VALUES_REFERENCE.md for all options
- **Talos**: https://www.talos.dev/
- **Kubernetes**: https://kubernetes.io/docs/
- **Cortex**: https://github.com/ry-ops/cortex

## Files Created

Total: 24 files

### Core (11 files)
- namespace.yaml
- rbac.yaml
- configmap.yaml
- secret.yaml
- pvc.yaml
- deployment.yaml
- service.yaml
- ingress.yaml
- pdb.yaml
- hpa.yaml
- kustomization.yaml

### Overlays (9 files)
- overlays/production/kustomization.yaml
- overlays/production/deployment-patch.yaml
- overlays/production/ingress-patch.yaml
- overlays/staging/kustomization.yaml
- overlays/staging/deployment-patch.yaml
- overlays/staging/ingress-patch.yaml
- overlays/development/kustomization.yaml
- overlays/development/deployment-patch.yaml

### Documentation (3 files)
- README.md
- QUICKSTART.md
- VALUES_REFERENCE.md

### Automation (2 files)
- Makefile
- .gitignore

## License

MIT License - See main project LICENSE file
