# Cortex K3s Production Deployment Guide

Complete guide for deploying Cortex autonomous AI platform to K3s cluster (VMs 310-312).

## Prerequisites

### K3s Cluster
- **Cluster**: K3s running on VMs 310-312
- **Control Plane**: 10.88.145.180:6443 (VM 310)
- **Worker Nodes**: 10.88.145.181-182 (VMs 311-312)
- **Kubernetes Version**: 1.28+
- **Storage**: Longhorn or local-path provisioner
- **LoadBalancer**: MetalLB or K3s default servicelb

### Tools Required
```bash
kubectl >= 1.28
kustomize >= 5.0
helm >= 3.12
```

### Credentials
You'll need:
- Anthropic API Key (for Claude)
- GitHub Personal Access Token (for Git operations)
- Container Registry Access (ghcr.io/ry-ops)

## Deployment Architecture

### Namespaces
```
cortex-system       # Core masters and coordination
cortex-mcp          # MCP server integrations
cortex-workers      # Worker job execution
monitoring          # Prometheus, Grafana, AlertManager
```

### Components
- **5 Master Controllers**: coordinator, security, development, cicd, inventory
- **Dashboard**: Real-time EUI interface
- **9 Worker Types**: Autoscaling with KEDA (0-10 replicas each)
- **MCP Servers**: Wazuh, Proxmox, N8N, K3s, Talos, OpenTofu, Ansible, Unifi, Cloudflare
- **Monitoring Stack**: Prometheus + Grafana + AlertManager

## Step-by-Step Deployment

### Step 1: Verify K3s Cluster Access

```bash
# Configure kubeconfig
export KUBECONFIG=~/.kube/config-k3s

# Test connection
kubectl cluster-info
kubectl get nodes

# Expected output:
# NAME       STATUS   ROLES                  AGE   VERSION
# vm-310     Ready    control-plane,master   Xd    v1.28.x
# vm-311     Ready    <none>                 Xd    v1.28.x
# vm-312     Ready    <none>                 Xd    v1.28.x
```

### Step 2: Create Secrets

```bash
# Navigate to cortex directory
cd /Users/ryandahlberg/Projects/cortex

# Create cortex-credentials secret
kubectl create namespace cortex-system --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="YOUR_ANTHROPIC_API_KEY" \
  --from-literal=github-token="YOUR_GITHUB_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

# Create secrets.env for kustomize
cat > k8s/cortex-k3s/secrets.env <<EOF
anthropic-api-key=YOUR_ANTHROPIC_API_KEY
github-token=YOUR_GITHUB_TOKEN
EOF
```

**Security Note**: Never commit `secrets.env` to Git!

### Step 3: Deploy Storage

```bash
# Check storage class
kubectl get storageclass

# If using Longhorn:
kubectl apply -f k8s/storage/longhorn-storageclass.yaml

# If using local-path (K3s default):
kubectl get storageclass local-path
```

### Step 4: Deploy Core Platform (Kustomize)

```bash
# Deploy using kustomize
kubectl apply -k k8s/cortex-k3s/

# This deploys:
# - Namespaces (cortex-system, cortex-mcp, cortex-workers)
# - RBAC (ServiceAccounts, Roles, ClusterRoles)
# - ConfigMaps (cortex-config, deployment-info)
# - Secrets (cortex-credentials)
# - PVCs (coordination storage - 50Gi)
# - Masters (coordinator, security, development, cicd, inventory)
# - Dashboard (EUI)
# - Wazuh integration

# Wait for deployments to roll out
kubectl rollout status deployment/coordinator-master -n cortex-system
kubectl rollout status deployment/security-master -n cortex-system
kubectl rollout status deployment/development-master -n cortex-system
kubectl rollout status deployment/cicd-master -n cortex-system
```

### Step 5: Deploy Workers (KEDA Autoscaling)

```bash
# Install KEDA operator (if not already installed)
kubectl apply -f https://github.com/kedacore/keda/releases/download/v2.12.0/keda-2.12.0.yaml

# Deploy worker autoscaling
kubectl apply -f k8s/workers/

# Verify KEDA ScaledObjects
kubectl get scaledobject -n cortex-workers

# Expected: 9 ScaledObjects (one per worker type)
# - implementation-worker
# - test-worker
# - security-scan-worker
# - documentation-worker
# - refactor-worker
# - deployment-worker
# - monitoring-worker
# - cleanup-worker
# - mcp-integration-worker
```

### Step 6: Deploy MCP Servers (Helm)

```bash
# Deploy all MCP servers using umbrella chart
helm install cortex-mcp ./helm/umbrella-chart \
  --namespace cortex-mcp \
  --create-namespace \
  --set wazuh.enabled=true \
  --set wazuh.apiUrl="https://10.88.140.202:55000" \
  --set proxmox.enabled=true \
  --set proxmox.apiUrl="https://10.88.140.101:8006" \
  --set n8n.enabled=true \
  --set k3s.enabled=true

# Verify MCP server deployments
helm list -n cortex-mcp
kubectl get pods -n cortex-mcp
```

### Step 7: Deploy Monitoring Stack

```bash
# Deploy Prometheus, Grafana, AlertManager
kubectl apply -f k8s/monitoring/

# Wait for monitoring stack
kubectl rollout status deployment/prometheus -n monitoring
kubectl rollout status deployment/grafana -n monitoring
kubectl rollout status deployment/alertmanager -n monitoring

# Get Grafana admin password
kubectl get secret grafana-admin -n monitoring -o jsonpath='{.data.password}' | base64 -d
echo ""

# Access Grafana
kubectl port-forward svc/grafana -n monitoring 3000:3000
# Open: http://localhost:3000
# Login: admin / <password-from-above>
```

### Step 8: Verify Deployment

```bash
# Run verification script
./k8s/cortex-k3s/verify-deployment.sh

# Check all pods are running
kubectl get pods -A | grep cortex

# Check services
kubectl get svc -n cortex-system
kubectl get svc -n cortex-mcp
kubectl get svc -n monitoring

# Check dashboard access
kubectl get svc cortex-dashboard -n cortex-system
# Note the LoadBalancer IP or use port-forward:
kubectl port-forward svc/cortex-dashboard -n cortex-system 8080:80
# Open: http://localhost:8080
```

## Post-Deployment Configuration

### Configure GitOps (Optional)

```bash
# Deploy FluxCD
kubectl apply -f k8s/cortex-k3s/10-flux-gitops.yaml

# Or deploy ArgoCD
kubectl apply -f scripts/deploy/argocd-app.yaml
```

### Enable Continuous Deployment

```bash
# Set up GitHub Actions secrets (in repository settings):
# - KUBECONFIG_K3S (base64-encoded kubeconfig)
# - ANTHROPIC_API_KEY
# - GITHUB_TOKEN

# Workflows are already in .github/workflows/:
# - cortex-ci.yml (tests on PR)
# - cortex-deploy.yml (deploys on merge to main)
```

### Configure Dashboard Ingress

```bash
# If using Traefik (K3s default):
kubectl apply -f k8s/cortex-k3s/09-dashboard-ingress.yaml

# Access via: https://cortex.yourdomain.com
```

## Monitoring and Observability

### Grafana Dashboards

Four dashboards are pre-configured:

1. **Cortex Overview** - Master health, worker count, task throughput
2. **Token Usage** - Budget utilization, cost tracking, API usage
3. **MCP Servers** - Request rate, latency, availability per integration
4. **Worker Performance** - Success rate, runtime, resource usage

Access: http://<grafana-ip>:3000

### Prometheus Metrics

Key metrics exposed:
- `cortex_masters_health{master="coordinator|security|development|cicd|inventory"}`
- `cortex_workers_active{worker_type="implementation|test|security|..."}`
- `cortex_token_budget_utilization{master="..."}`
- `cortex_task_duration_seconds{task_type="..."}`
- `cortex_mcp_requests_total{server="wazuh|proxmox|n8n|..."}`

### AlertManager Alerts

Critical alerts configured:
- **MasterDown**: Master pod unavailable for 2+ minutes
- **TokenBudgetExhausted**: 95%+ token budget usage for 5+ minutes
- **WorkerFailureRate**: 50%+ worker failure rate for 10+ minutes
- **MCPServerDown**: MCP server unavailable for 5+ minutes

## Scaling Configuration

### Master Replicas
Masters run as single replicas (stateful coordination):
```yaml
spec:
  replicas: 1  # Do not scale horizontally
```

### Worker Autoscaling (KEDA)
Workers autoscale based on task queue depth:
```yaml
minReplicaCount: 0      # Scale to zero when idle
maxReplicaCount: 10     # Max 10 workers per type
pollingInterval: 15     # Check every 15 seconds
```

Metrics: `cortex_task_queue_depth{worker_type="..."}`

### MCP Server Autoscaling
MCP servers autoscale based on request rate:
```yaml
minReplicas: 0          # Scale to zero when idle
maxReplicas: 5          # Max 5 replicas per MCP server
threshold: 10           # Scale when >10 requests/second
```

## Troubleshooting

### Masters Not Starting

```bash
# Check logs
kubectl logs deployment/coordinator-master -n cortex-system
kubectl logs deployment/security-master -n cortex-system

# Common issues:
# 1. Missing secrets (anthropic-api-key, github-token)
kubectl get secret cortex-credentials -n cortex-system

# 2. PVC not bound
kubectl get pvc -n cortex-system

# 3. Image pull errors
kubectl describe pod <pod-name> -n cortex-system
```

### Workers Not Autoscaling

```bash
# Check KEDA operator
kubectl get pods -n keda

# Check ScaledObject configuration
kubectl describe scaledobject implementation-worker -n cortex-workers

# Check HPA created by KEDA
kubectl get hpa -n cortex-workers

# Check metrics availability
kubectl get --raw /apis/external.metrics.k8s.io/v1beta1/namespaces/cortex-workers/cortex_task_queue_depth
```

### MCP Servers Connection Issues

```bash
# Check MCP server pods
kubectl get pods -n cortex-mcp

# Check secrets for API credentials
kubectl get secret wazuh-credentials -n cortex-mcp
kubectl get secret proxmox-credentials -n cortex-mcp

# Test connectivity from pod
kubectl exec -it <mcp-pod> -n cortex-mcp -- curl -k https://10.88.140.202:55000
```

### Dashboard Not Accessible

```bash
# Check dashboard pod
kubectl get pods -l app=cortex-dashboard -n cortex-system

# Check service
kubectl get svc cortex-dashboard -n cortex-system

# Check ingress
kubectl get ingress -n cortex-system

# Port-forward for direct access
kubectl port-forward svc/cortex-dashboard -n cortex-system 8080:80
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n cortex-system

# Check storage class
kubectl get storageclass

# If using Longhorn, check volumes
kubectl get volumes -n longhorn-system

# Check PV provisioning
kubectl get pv | grep cortex
```

## Maintenance

### Updating Cortex

```bash
# Pull latest container image
# Image is built by .github/workflows/cortex-ci.yml on every commit

# Restart deployments to pull new image
kubectl rollout restart deployment/coordinator-master -n cortex-system
kubectl rollout restart deployment/security-master -n cortex-system
kubectl rollout restart deployment/development-master -n cortex-system
kubectl rollout restart deployment/cicd-master -n cortex-system
kubectl rollout restart deployment/cortex-dashboard -n cortex-system

# Or use GitOps (FluxCD/ArgoCD) for automatic updates
```

### Backing Up Coordination State

```bash
# Coordination state is stored in PVCs
# Back up using Longhorn snapshots or Velero

# Manual backup (requires pod access):
kubectl exec -it coordinator-master-<pod-id> -n cortex-system -- \
  tar czf /tmp/coordination-backup.tar.gz /coordination/

kubectl cp cortex-system/coordinator-master-<pod-id>:/tmp/coordination-backup.tar.gz \
  ./coordination-backup-$(date +%Y%m%d).tar.gz
```

### Rotating Secrets

```bash
# Update API keys
kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="NEW_KEY" \
  --from-literal=github-token="NEW_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart masters to pick up new secrets
kubectl rollout restart deployment -n cortex-system
```

## Security Best Practices

1. **Network Policies**: Already configured in `k8s/security/`
2. **RBAC**: Principle of least privilege for ServiceAccounts
3. **Secrets**: Use external secret managers (Vault, Sealed Secrets)
4. **Image Scanning**: GitHub Actions runs Trivy scans on every build
5. **TLS**: Enable TLS for all ingress endpoints
6. **Pod Security**: Enforce PodSecurityStandards (restricted)

## Performance Tuning

### Resource Requests/Limits

Current configuration:
- **Coordinator Master**: 2Gi/4Gi RAM, 1/2 CPU cores
- **Security Master**: 2Gi/4Gi RAM, 1/2 CPU cores
- **Development Master**: 4Gi/8Gi RAM, 2/4 CPU cores
- **CI/CD Master**: 2Gi/4Gi RAM, 1/2 CPU cores
- **Workers**: 512Mi/2Gi RAM, 250m/1 CPU core

Adjust in deployment manifests based on actual usage.

### Token Budget Optimization

Monitor token usage via Grafana dashboard. Adjust master token budgets in coordination/token-budget.json if needed.

## Disaster Recovery

### Cluster Failure

1. Coordination state is persisted in PVCs (survive pod restarts)
2. Use Longhorn replication (3 replicas across nodes)
3. Regular backups to S3/NFS (see Maintenance section)

### Rollback Procedure

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/coordinator-master -n cortex-system
kubectl rollout undo deployment/security-master -n cortex-system
kubectl rollout undo deployment/development-master -n cortex-system
kubectl rollout undo deployment/cicd-master -n cortex-system

# Or use GitOps to revert to previous Git commit
git revert HEAD
git push origin main
# FluxCD/ArgoCD will auto-sync to previous state
```

## Support and Documentation

- **Architecture**: See `/docs/k8s/architecture.md`
- **MCP Integrations**: See `/docs/integrations/`
- **Security Hardening**: See `/docs/security/SECURITY.md`
- **Monitoring Guide**: See `/docs/monitoring-deployment-guide.md`

## Next Steps

1. Access dashboard: http://<loadbalancer-ip>
2. Monitor Grafana: http://<grafana-ip>:3000
3. Review alerts in AlertManager
4. Test autonomous operations via dashboard
5. Configure additional MCP servers as needed

Deployment complete! Cortex is now running autonomously on K3s.
