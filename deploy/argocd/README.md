# Cortex ArgoCD GitOps Configuration

Production-ready ArgoCD manifests for deploying the Cortex automation system to Kubernetes clusters.

## Architecture

```
cortex (ArgoCD Project)
├── cortex-dashboard          (Application - Sync Wave 1)
├── cortex-monitoring          (Application - Sync Wave 0)
├── cortex-mcp-orchestrator    (Application - Sync Wave 2)
└── cortex-mcp-servers         (ApplicationSet - Sync Wave 2)
    ├── mcp-k8s-orchestrator   (Generated)
    ├── mcp-n8n-workflow       (Generated)
    ├── mcp-talos-node         (Generated)
    ├── mcp-s3-storage         (Generated)
    └── mcp-postgres-data      (Generated)
```

## Files

| File | Description |
|------|-------------|
| `project.yaml` | ArgoCD Project with RBAC, sync windows, resource whitelist |
| `application.yaml` | Static Applications (dashboard, monitoring, orchestrator) |
| `applicationset.yaml` | Dynamic ApplicationSet for MCP servers |
| `values-*.yaml` | Environment-specific value overrides |

## Quick Start

### 1. Install ArgoCD

```bash
# Create namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 2. Configure ArgoCD

```bash
# Port forward to ArgoCD server
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Login with CLI
argocd login localhost:8080 --username admin --password <password> --insecure

# Update password
argocd account update-password
```

### 3. Deploy Cortex Project

```bash
# Apply project configuration
kubectl apply -f deploy/argocd/project.yaml

# Deploy applications
kubectl apply -f deploy/argocd/application.yaml

# Deploy ApplicationSet
kubectl apply -f deploy/argocd/applicationset.yaml

# Verify deployment
argocd app list
```

### 4. Access ArgoCD UI

```bash
# Port forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Open browser
open https://localhost:8080
```

## ApplicationSet Generators

### List Generator

Deploys all MCP servers with custom configuration per server:

```yaml
generators:
  - list:
      elements:
        - name: mcp-k8s-orchestrator
          replicas: 3
          priority: high
```

### Matrix Generator

Deploys MCP servers across multiple environments:

```yaml
generators:
  - matrix:
      generators:
        - list:  # Environments
            elements:
              - env: production
              - env: staging
        - list:  # Servers
            elements:
              - name: mcp-k8s-orchestrator
```

### Git Directory Generator

Auto-discovers new MCP servers from repository:

```yaml
generators:
  - git:
      directories:
        - path: packages/mcp-*
```

## Sync Waves

Applications are deployed in order using sync waves:

1. **Wave 0**: Monitoring infrastructure (Prometheus, Grafana)
2. **Wave 1**: Dashboard and supporting services
3. **Wave 2**: MCP servers and orchestrator

## Sync Policy

All applications use automated sync with:

- **Prune**: Removes resources deleted from Git
- **Self-Heal**: Reverts manual cluster changes
- **Retry**: Exponential backoff on failures

## Health Checks

Applications report healthy when:

- All pods are ready
- HPA is functioning
- Service endpoints are available
- Health probes passing

## Rollback

### Via ArgoCD UI

1. Navigate to application
2. Click "History"
3. Select stable revision
4. Click "Rollback"

### Via CLI

```bash
# View history
argocd app history cortex-dashboard

# Rollback to specific revision
argocd app rollback cortex-dashboard 5

# Rollback to previous revision
argocd app rollback cortex-dashboard
```

## Monitoring

### Application Status

```bash
# List all applications
argocd app list

# Get application details
argocd app get cortex-dashboard

# Watch sync progress
argocd app wait cortex-dashboard --health --timeout 300
```

### Sync Status

```bash
# Check sync status
argocd app sync-status cortex-dashboard

# View last sync result
argocd app manifests cortex-dashboard
```

### Logs

```bash
# View application logs
kubectl logs -n cortex-dashboard -l app.kubernetes.io/name=cortex-dashboard

# View ArgoCD controller logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller
```

## Secrets Management

### Using Sealed Secrets

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create sealed secret
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=changeme \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml

# Apply sealed secret
kubectl apply -f sealed-secret.yaml
```

### Using External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cortex-secrets
spec:
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: cortex-credentials
  data:
    - secretKey: api-key
      remoteRef:
        key: cortex/api-key
```

## RBAC

### Project Roles

| Role | Permissions | Groups |
|------|-------------|--------|
| `read-only` | View applications | `cortex-viewers`, `platform-team` |
| `developer` | Sync, override parameters | `cortex-developers`, `sre-team` |
| `admin` | Full access | `cortex-admins`, `platform-admins` |

### Grant Access

```bash
# Add user to developer role
argocd proj role add-group cortex developer user@example.com

# List role permissions
argocd proj role get cortex developer
```

## Sync Windows

### Business Hours (Allow)

- **Schedule**: Monday-Friday, 9 AM - 5 PM UTC
- **Duration**: 8 hours
- **Applications**: All

### Peak Hours (Deny)

- **Schedule**: Monday-Friday, 12 PM - 2 PM EST
- **Duration**: 2 hours
- **Applications**: Production MCP servers
- **Manual Sync**: Allowed (emergency override)

## Troubleshooting

### Application Not Syncing

```bash
# Check application status
argocd app get cortex-dashboard

# View sync errors
argocd app logs cortex-dashboard

# Force sync
argocd app sync cortex-dashboard --force
```

### Resource Stuck in Progressing

```bash
# Check resource status
kubectl get -n cortex-dashboard deployment cortex-dashboard

# View pod events
kubectl describe pod -n cortex-dashboard -l app=cortex-dashboard

# Check resource hooks
argocd app get cortex-dashboard --show-operation
```

### Out of Sync State

```bash
# View diff
argocd app diff cortex-dashboard

# Refresh application
argocd app refresh cortex-dashboard

# Hard refresh (ignore cache)
argocd app refresh cortex-dashboard --hard
```

### Permission Denied

```bash
# Check RBAC permissions
argocd account can-i sync applications 'cortex/*'

# View current user
argocd account get

# Check project permissions
argocd proj get cortex
```

## Best Practices

### 1. Use Sync Waves

Order application deployment to handle dependencies:

```yaml
annotations:
  argocd.argoproj.io/sync-wave: "0"  # Deploy first
```

### 2. Implement Health Checks

Define custom health checks for CRDs:

```yaml
argocd-cm:
  resource.customizations: |
    cortex.automation/MCPServer:
      health.lua: |
        health_status = {}
        if obj.status.ready then
          health_status.status = "Healthy"
        else
          health_status.status = "Degraded"
        end
        return health_status
```

### 3. Use ApplicationSets

Automate deployment of similar applications:

```yaml
generators:
  - list:
      elements:
        - name: app1
        - name: app2
```

### 4. Enable Notifications

Get alerts on sync failures:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
data:
  service.slack: |
    token: $slack-token
  trigger.on-deployed: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-deployed]
```

### 5. Implement Progressive Delivery

Use canary deployments:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 20
      - pause: {duration: 5m}
      - setWeight: 50
      - pause: {duration: 5m}
      - setWeight: 100
```

## Integration with CI/CD

### GitHub Actions

See `.github/workflows/cd.yaml` for:

- Automated image builds
- ArgoCD manifest updates
- Deployment triggers

### Manual Deployment

```bash
# Build and push image
docker build -t ghcr.io/ryandahlberg/cortex/mcp-k8s-orchestrator:v1.0.0 .
docker push ghcr.io/ryandahlberg/cortex/mcp-k8s-orchestrator:v1.0.0

# Update image tag in Git
git commit -am "chore: update image to v1.0.0"
git push

# ArgoCD will automatically sync the change
```

## Disaster Recovery

### Backup ArgoCD Configuration

```bash
# Export all applications
argocd app list -o yaml > backup-apps.yaml

# Export project
argocd proj get cortex -o yaml > backup-project.yaml

# Backup cluster secrets
kubectl get secrets -n argocd -o yaml > backup-secrets.yaml
```

### Restore ArgoCD Configuration

```bash
# Restore project
kubectl apply -f backup-project.yaml

# Restore applications
kubectl apply -f backup-apps.yaml

# Verify
argocd app list
```

## Advanced Configuration

### Multi-Cluster Setup

```bash
# Add cluster
argocd cluster add staging-cluster --name staging

# Deploy to multiple clusters
cat > multi-cluster-app.yaml <<EOF
spec:
  destination:
    server: https://staging.k8s.local
    namespace: cortex-mcp
EOF
```

### App of Apps Pattern

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cortex-root
spec:
  source:
    path: deploy/argocd/apps
  destination:
    namespace: argocd
```

### Image Updater

```yaml
annotations:
  argocd-image-updater.argoproj.io/image-list: ghcr.io/ryandahlberg/cortex/mcp-k8s-orchestrator
  argocd-image-updater.argoproj.io/write-back-method: git
```

## Resources

- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [ApplicationSet Documentation](https://argocd-applicationset.readthedocs.io/)
- [Cortex GitHub Repository](https://github.com/ryandahlberg/cortex)
- [Cortex Dashboard](https://dashboard.cortex.local)

## Support

- Slack: `#cortex-team`
- Email: `platform@example.com`
- Issues: [GitHub Issues](https://github.com/ryandahlberg/cortex/issues)
