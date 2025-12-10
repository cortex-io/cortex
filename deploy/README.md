# Cortex Deployment Guide

Production-ready deployment configurations for the Cortex automation system.

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                      │
│                    (Source of Truth)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Git Commit/Push
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions CI/CD                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Lint   │  │   Test   │  │  Build   │  │ Security │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Build & Push
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Container Registry (ghcr.io)            │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ mcp-k8s-orch.  │  │ mcp-n8n-work.  │  │ mcp-talos... │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ GitOps Sync
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                        ArgoCD                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Applications │  │ ApplicationSet│  │  Sync Policy   │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Deploy
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Talos Kubernetes Cluster                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                Namespace: cortex-dashboard            │  │
│  │  ┌──────────────┐  ┌──────────────┐                  │  │
│  │  │  Dashboard   │  │   Ingress    │                  │  │
│  │  └──────────────┘  └──────────────┘                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Namespace: cortex-mcp                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │  │
│  │  │  K8s     │ │   n8n    │ │  Talos   │ │   S3    │ │  │
│  │  │  Orch.   │ │ Workflow │ │   Node   │ │ Storage │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Namespace: cortex-monitoring             │  │
│  │  ┌──────────────┐  ┌──────────────┐                  │  │
│  │  │ Prometheus   │  │   Grafana    │                  │  │
│  │  └──────────────┘  └──────────────┘                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
deploy/
├── argocd/                      # ArgoCD GitOps configurations
│   ├── application.yaml         # Static applications
│   ├── applicationset.yaml      # Dynamic MCP server deployment
│   ├── project.yaml            # ArgoCD project with RBAC
│   └── README.md               # ArgoCD documentation
│
├── kubernetes/                  # Kubernetes manifests (future)
│   ├── namespaces/
│   ├── rbac/
│   └── network-policies/
│
├── helm/                        # Helm charts (future)
│   ├── cortex-dashboard/
│   └── mcp-servers/
│
└── README.md                    # This file
```

## Deployment Methods

### 1. GitOps with ArgoCD (Recommended)

**Best for**: Production, staging, automated deployments

```bash
# Prerequisites
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Deploy Cortex
kubectl apply -f deploy/argocd/project.yaml
kubectl apply -f deploy/argocd/application.yaml
kubectl apply -f deploy/argocd/applicationset.yaml

# Access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

**Advantages**:
- Declarative configuration
- Automated sync from Git
- Self-healing on drift
- Audit trail in Git
- Multi-environment support

**See**: [deploy/argocd/README.md](./argocd/README.md)

### 2. Helm Charts

**Best for**: Local development, custom deployments

```bash
# Add Cortex Helm repository (future)
helm repo add cortex https://charts.cortex.dev
helm repo update

# Install dashboard
helm install cortex-dashboard cortex/dashboard \
  --namespace cortex-dashboard \
  --create-namespace

# Install MCP servers
helm install cortex-mcp cortex/mcp-servers \
  --namespace cortex-mcp \
  --create-namespace \
  --values values-production.yaml
```

### 3. kubectl Apply

**Best for**: Development, testing, troubleshooting

```bash
# Apply manifests directly
kubectl apply -f deploy/kubernetes/namespaces/
kubectl apply -f deploy/kubernetes/rbac/
kubectl apply -f deploy/kubernetes/applications/
```

### 4. Terraform

**Best for**: Infrastructure as Code, compliance

```hcl
module "cortex" {
  source = "./terraform/modules/cortex"

  cluster_name = "production"
  namespace    = "cortex-mcp"
  replicas     = 3
}
```

## Environment Setup

### Development

```yaml
environment: development
replicas: 1
resources:
  limits:
    cpu: 500m
    memory: 512Mi
autoscaling: false
ingress:
  enabled: false
monitoring:
  enabled: false
```

### Staging

```yaml
environment: staging
replicas: 2
resources:
  limits:
    cpu: 1000m
    memory: 1Gi
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 5
ingress:
  enabled: true
  host: staging.cortex.local
monitoring:
  enabled: true
```

### Production

```yaml
environment: production
replicas: 3
resources:
  limits:
    cpu: 2000m
    memory: 2Gi
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
ingress:
  enabled: true
  host: cortex.production.local
  tls:
    enabled: true
monitoring:
  enabled: true
  alerting: true
backup:
  enabled: true
```

## Prerequisites

### Cluster Requirements

- **Kubernetes**: 1.28+
- **Nodes**: 3+ (production)
- **CPU**: 8+ cores total
- **Memory**: 16+ GB total
- **Storage**: 100+ GB

### Required Components

1. **Ingress Controller** (nginx recommended)
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.0/deploy/static/provider/cloud/deploy.yaml
   ```

2. **Cert Manager** (for TLS)
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
   ```

3. **Metrics Server** (for HPA)
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

4. **ArgoCD** (for GitOps)
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

### Optional Components

- **Prometheus/Grafana** (monitoring)
- **Velero** (backup/restore)
- **External Secrets Operator** (secrets management)
- **Sealed Secrets** (encrypted secrets in Git)

## Quick Start

### 1. Prepare Cluster

```bash
# Create namespaces
kubectl create namespace cortex-dashboard
kubectl create namespace cortex-mcp
kubectl create namespace cortex-monitoring

# Apply RBAC
kubectl apply -f deploy/kubernetes/rbac/

# Apply network policies
kubectl apply -f deploy/kubernetes/network-policies/
```

### 2. Deploy with ArgoCD

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s

# Get admin password
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
echo "ArgoCD Password: $ARGOCD_PASSWORD"

# Port forward ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# Login
argocd login localhost:8080 --username admin --password "$ARGOCD_PASSWORD" --insecure

# Deploy Cortex
kubectl apply -f deploy/argocd/project.yaml
kubectl apply -f deploy/argocd/application.yaml
kubectl apply -f deploy/argocd/applicationset.yaml

# Watch deployment
argocd app list
argocd app wait cortex-dashboard --health --timeout 600
```

### 3. Verify Deployment

```bash
# Check applications
argocd app list

# Check pods
kubectl get pods -n cortex-dashboard
kubectl get pods -n cortex-mcp

# Check services
kubectl get svc -n cortex-dashboard
kubectl get svc -n cortex-mcp

# Check ingress
kubectl get ingress -n cortex-dashboard
```

### 4. Access Applications

```bash
# Port forward dashboard
kubectl port-forward -n cortex-dashboard svc/cortex-dashboard 3000:80

# Access dashboard
open http://localhost:3000

# Port forward MCP orchestrator
kubectl port-forward -n cortex-mcp svc/mcp-k8s-orchestrator 3001:3000

# Test health endpoint
curl http://localhost:3001/health
```

## Configuration

### Environment Variables

Create secret with environment-specific configuration:

```bash
kubectl create secret generic cortex-config \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  --from-literal=API_BASE_URL=https://api.cortex.local \
  -n cortex-mcp
```

### Secrets Management

#### Option 1: Sealed Secrets

```bash
# Install sealed-secrets
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create sealed secret
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=changeme \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml

# Commit to Git
git add sealed-secret.yaml
git commit -m "feat: add database credentials"
```

#### Option 2: External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cortex-secrets
  namespace: cortex-mcp
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: cortex-credentials
    creationPolicy: Owner
  data:
    - secretKey: api-key
      remoteRef:
        key: cortex/api-key
    - secretKey: db-password
      remoteRef:
        key: cortex/db-password
```

### Resource Limits

Configure appropriate limits per environment:

```yaml
# Development
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# Production
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
```

## Monitoring

### Prometheus Metrics

All MCP servers expose metrics at `/metrics`:

```bash
# Access metrics
kubectl port-forward -n cortex-mcp svc/mcp-k8s-orchestrator 3000:3000
curl http://localhost:3000/metrics
```

### Grafana Dashboards

Pre-configured dashboards available:

- Cortex Overview
- MCP Servers Performance
- Resource Usage
- Error Rates

```bash
# Access Grafana
kubectl port-forward -n cortex-monitoring svc/grafana 3001:80
open http://localhost:3001
```

### Health Checks

```bash
# Dashboard health
curl http://dashboard.cortex.local/health

# MCP server health
curl http://mcp-k8s-orchestrator.cortex-mcp.svc.cluster.local:3000/health
```

## Backup & Restore

### Velero Setup

```bash
# Install Velero
velero install \
  --provider aws \
  --bucket cortex-backups \
  --secret-file ./credentials-velero

# Create backup
velero backup create cortex-backup-$(date +%Y%m%d) \
  --include-namespaces cortex-dashboard,cortex-mcp

# List backups
velero backup get

# Restore from backup
velero restore create --from-backup cortex-backup-20240101
```

### Manual Backup

```bash
# Backup all resources
kubectl get all -n cortex-dashboard -o yaml > backup-dashboard.yaml
kubectl get all -n cortex-mcp -o yaml > backup-mcp.yaml

# Backup secrets
kubectl get secrets -n cortex-dashboard -o yaml > backup-secrets-dashboard.yaml
kubectl get secrets -n cortex-mcp -o yaml > backup-secrets-mcp.yaml
```

## Scaling

### Manual Scaling

```bash
# Scale deployment
kubectl scale deployment mcp-k8s-orchestrator \
  --replicas=5 \
  -n cortex-mcp

# Scale via ArgoCD
argocd app set cortex-mcp-k8s-orchestrator \
  --helm-set replicaCount=5
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-k8s-orchestrator
  namespace: cortex-mcp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-k8s-orchestrator
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Troubleshooting

### Common Issues

#### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n cortex-mcp

# Describe pod
kubectl describe pod <pod-name> -n cortex-mcp

# View logs
kubectl logs <pod-name> -n cortex-mcp

# Check events
kubectl get events -n cortex-mcp --sort-by='.lastTimestamp'
```

#### ArgoCD Out of Sync

```bash
# View diff
argocd app diff cortex-dashboard

# Refresh app
argocd app refresh cortex-dashboard

# Hard refresh
argocd app refresh cortex-dashboard --hard

# Force sync
argocd app sync cortex-dashboard --force
```

#### Image Pull Errors

```bash
# Create image pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<username> \
  --docker-password=<token> \
  -n cortex-mcp

# Patch service account
kubectl patch serviceaccount default \
  -n cortex-mcp \
  -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}'
```

#### Resource Limits

```bash
# Check resource usage
kubectl top pods -n cortex-mcp

# Check node capacity
kubectl describe nodes

# Adjust limits
kubectl set resources deployment mcp-k8s-orchestrator \
  --limits=cpu=2000m,memory=2Gi \
  --requests=cpu=500m,memory=512Mi \
  -n cortex-mcp
```

## Security

### RBAC Configuration

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mcp-orchestrator
  namespace: cortex-mcp
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-servers
  namespace: cortex-mcp
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/part-of: cortex
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              app.kubernetes.io/part-of: cortex
  egress:
    - to:
        - namespaceSelector: {}
```

### Pod Security Standards

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cortex-mcp
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

## Production Checklist

- [ ] Resource limits configured
- [ ] HPA enabled with appropriate thresholds
- [ ] Health checks configured (liveness, readiness, startup)
- [ ] Monitoring and alerting setup
- [ ] Backup strategy implemented
- [ ] Secrets properly managed
- [ ] RBAC configured with least privilege
- [ ] Network policies enforced
- [ ] TLS/SSL certificates configured
- [ ] Ingress properly configured
- [ ] Pod disruption budgets set
- [ ] Anti-affinity rules configured
- [ ] Security scanning enabled
- [ ] Disaster recovery plan documented
- [ ] Rollback procedure tested

## Support

- **Documentation**: [Cortex Docs](https://cortex.docs.example.com)
- **Issues**: [GitHub Issues](https://github.com/ryandahlberg/cortex/issues)
- **Slack**: `#cortex-team`
- **Email**: `platform@example.com`

## Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Helm Documentation](https://helm.sh/docs/)
- [Talos Linux](https://www.talos.dev/)
