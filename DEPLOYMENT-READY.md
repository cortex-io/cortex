# 🚀 Cortex Deployment Ready - K3s Cluster

## Status: ALL CODE COMPLETE ✅

All Cortex Construction HQ Phases 4-8 are implemented and ready for deployment to your K3s cluster (VMs 310-312 at 10.88.145.180-182).

---

## Quick Start Deployment

### Prerequisites Checklist

- [ ] K3s cluster accessible (VMs 310-312 running)
- [ ] kubectl configured for cluster access
- [ ] Helm 3.x installed
- [ ] GitHub Container Registry access
- [ ] Anthropic API key

### 1. Verify Cluster Access

```bash
# Test connectivity
ping -c 3 10.88.145.180

# Test K3s API
kubectl --kubeconfig=/path/to/k3s-config get nodes

# Should show:
# k3s-master-vm    Ready    control-plane   ...
# k3s-worker-1-vm  Ready    <none>          ...
# k3s-worker-2-vm  Ready    <none>          ...
```

### 2. Create Secrets

```bash
# Anthropic API Key
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key='your-anthropic-api-key' \
  -n cortex-system

# GitHub Token (for container registry)
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=your-github-username \
  --docker-password=your-github-token \
  -n cortex-system

# MCP Server Credentials
kubectl create secret generic wazuh-credentials \
  --from-literal=username=admin \
  --from-literal=password='your-wazuh-password' \
  -n cortex-mcp
```

### 3. Deploy Cortex Core

```bash
# Deploy all Cortex components
kubectl apply -k k8s/cortex-k3s/

# Wait for pods to be ready
kubectl wait --for=condition=ready pod \
  -l app.cortex.ai/component=master \
  -n cortex-system \
  --timeout=300s
```

### 4. Deploy MCP Servers

```bash
# Install all MCP servers via Helm umbrella chart
helm install cortex-mcp ./helm/umbrella-chart \
  -n cortex-mcp \
  --create-namespace \
  --set wazuh.credentials.secretName=wazuh-credentials

# Or install individually
helm install wazuh-mcp ./helm/mcp-server-chart \
  -n cortex-mcp \
  --set mcpServer.name=wazuh-mcp-server \
  --set mcpServer.image.repository=ghcr.io/ry-ops/cortex/wazuh-mcp-server
```

### 5. Deploy Monitoring Stack

```bash
# Install Prometheus, Grafana, AlertManager
kubectl apply -f k8s/monitoring/

# Wait for monitoring to be ready
kubectl wait --for=condition=ready pod \
  -l app=prometheus \
  -n monitoring \
  --timeout=180s

# Access Grafana
kubectl port-forward -n monitoring svc/grafana 3000:3000

# Login: admin / admin (change on first login)
```

### 6. Verify Deployment

```bash
# Run automated verification
./k8s/cortex-k3s/verify-deployment.sh

# Should output:
# ✓ Namespaces created
# ✓ RBAC configured
# ✓ ConfigMaps present
# ✓ PVCs bound
# ✓ Masters running (6/6)
# ✓ Dashboard running
# ✓ Workers configured
# ✓ MCP servers ready
# ✓ Monitoring active
# ✓ NetworkPolicies applied
```

### 7. Enable GitOps (Optional)

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Deploy Cortex ArgoCD application
kubectl apply -f scripts/deploy/argocd-app.yaml

# Access ArgoCD UI
kubectl port-forward -n argocd svc/argocd-server 8080:443

# Get initial password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

---

## Post-Deployment Validation

### Test Core Functionality

```bash
# Check master health
kubectl logs -n cortex-system deployment/coordinator-master

# Check worker scaling
kubectl get scaledobjects -n cortex-system

# Check MCP server availability
kubectl get pods -n cortex-mcp

# Test K3s MCP Server
kubectl exec -it -n cortex-mcp deployment/k3s-mcp-server -- \
  curl http://localhost:3001/health
```

### Access Dashboards

```bash
# EUI Dashboard
kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001
# Open: http://localhost:3001

# Grafana (Cortex Overview)
kubectl port-forward -n monitoring svc/grafana 3000:3000
# Open: http://localhost:3000
# Dashboard: "Cortex - System Overview"

# Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Open: http://localhost:9090
```

### Test Natural Language Interface

```bash
# Port-forward to MCP server
kubectl port-forward -n cortex-system svc/cortex-mcp-server 8000:8000

# Test NL request
curl -X POST http://localhost:8000/tools/cortex_nl_request \
  -H "Content-Type: application/json" \
  -d '{"request": "Deploy a monitoring stack with Prometheus"}'
```

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n cortex-system

# Describe problematic pod
kubectl describe pod <pod-name> -n cortex-system

# Check logs
kubectl logs <pod-name> -n cortex-system

# Common issues:
# - ImagePullBackOff: Check GHCR credentials
# - CrashLoopBackOff: Check environment variables
# - Pending: Check PVC status and storage class
```

### Network Connectivity

```bash
# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default

# Test service connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://cortex-dashboard.cortex-system:3000/health
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n cortex-system

# Check storage class
kubectl get sc

# If PVC pending, check storage provisioner:
kubectl get pods -n kube-system | grep storage
```

---

## Component Health Checks

### Masters (6 expected)

```bash
kubectl get deployments -n cortex-system -l app.cortex.ai/component=master
```

Expected:
- coordinator-master
- development-master
- security-master
- cicd-master
- inventory-master
- cleanup-master

### Workers (9 types)

```bash
kubectl get scaledobjects -n cortex-system
```

Expected:
- implementation-worker
- scan-worker
- fix-worker
- test-worker
- documentation-worker
- analysis-worker
- catalog-worker
- pr-worker
- review-worker

### MCP Servers (9 expected)

```bash
kubectl get deployments -n cortex-mcp
```

Expected:
- wazuh-mcp-server
- proxmox-mcp-server
- n8n-mcp-server
- k3s-mcp-server
- talos-mcp-server
- opentofu-mcp-server
- ansible-mcp-server
- unifi-mcp-server
- cloudflare-mcp-server

---

## Scaling and Performance

### Monitor Autoscaling

```bash
# Watch KEDA scaling in action
watch kubectl get hpa -n cortex-system

# Check worker pod count
kubectl get pods -n cortex-system -l app.cortex.ai/component=worker

# View scaling events
kubectl get events -n cortex-system --sort-by='.lastTimestamp' | grep Scaled
```

### Resource Utilization

```bash
# Check resource usage
kubectl top nodes
kubectl top pods -n cortex-system
kubectl top pods -n cortex-mcp

# View cost tracking metrics
curl http://localhost:9090/api/v1/query?query=cortex_estimated_cost_usd
```

---

## Backup and Recovery

### Backup Coordination State

```bash
# Backup PVC data
kubectl exec -n cortex-system deployment/coordinator-master -- \
  tar czf /tmp/coordination-backup.tar.gz /app/coordination

kubectl cp cortex-system/coordinator-master-xxx:/tmp/coordination-backup.tar.gz \
  ./backups/coordination-$(date +%Y%m%d).tar.gz
```

### Restore from Backup

```bash
# Restore coordination data
kubectl cp ./backups/coordination-20251213.tar.gz \
  cortex-system/coordinator-master-xxx:/tmp/

kubectl exec -n cortex-system deployment/coordinator-master -- \
  tar xzf /tmp/coordination-20251213.tar.gz -C /app/
```

---

## Monitoring Alerts

### AlertManager Receivers

Configured receivers:
- **Slack**: Critical master failures
- **Email**: Budget alerts
- **Webhook**: All alerts to dashboard

### Key Alerts

| Alert | Severity | Threshold | Action |
|-------|----------|-----------|--------|
| MasterDown | Critical | 2 min | Auto-restart |
| TokenBudgetExhausted | Warning | >95% | Notify + block tasks |
| WorkerFailureRate | Warning | >20% | Self-healing trigger |
| HighErrorRate | Critical | >5% | Auto-rollback |
| PVCAlmostFull | Warning | >80% | Expand storage |

---

## Performance Tuning

### Optimize Resource Requests

```bash
# Get recommendations from cost optimizer
kubectl logs -n cortex-system deployment/cost-optimizer-daemon

# Apply recommendations (example)
kubectl patch deployment coordinator-master -n cortex-system \
  --patch '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","resources":{"requests":{"cpu":"500m","memory":"1Gi"}}}]}}}}'
```

### Enable Cost Optimization

```bash
# Schedule daily analysis
kubectl apply -f k8s/cost-optimization/cronjob.yaml

# Manual run
kubectl create job cost-analysis-manual --from=cronjob/cost-optimizer
```

---

## Security

### Update Secrets Rotation

```bash
# Rotate API keys (recommended every 90 days)
kubectl create secret generic anthropic-api-key-new \
  --from-literal=api-key='new-key' \
  -n cortex-system

# Update deployment to use new secret
kubectl set env deployment/coordinator-master \
  -n cortex-system \
  ANTHROPIC_API_KEY=new-key

# Delete old secret
kubectl delete secret anthropic-api-key -n cortex-system
```

### RBAC Audit

```bash
# View service accounts
kubectl get sa -n cortex-system

# Check role bindings
kubectl get rolebindings -n cortex-system

# Audit access logs
kubectl logs -n cortex-system deployment/audit-logger
```

---

## Next Steps

Once deployed:

1. **Monitor Performance**: Check Grafana dashboards for 24-48 hours
2. **Test Workflows**: Run sample cross-contractor workflows
3. **Enable Self-Healing**: Monitor anomaly detection and remediation
4. **Configure Multi-Region**: Set up failover region when ready
5. **Optimize Costs**: Review cost optimizer recommendations weekly
6. **Update Documentation**: Document any environment-specific changes

---

## Support

- **Documentation**: `/docs/*`
- **Architecture**: `CORTEX-PHASES-4-8-COMPLETE.md`
- **Blog Post**: `blog/meta-programming-cortex-phases-4-8.md`
- **Issues**: https://github.com/ry-ops/cortex/issues

---

## Success Criteria

Your deployment is successful when:

✅ All 6 masters running (1 replica each)
✅ All 9 worker types configured (KEDA ScaledObjects)
✅ All 9 MCP servers available (scale-to-zero working)
✅ Monitoring stack operational (Prometheus + Grafana + AlertManager)
✅ Dashboard accessible and showing live data
✅ At least one successful workflow execution
✅ Self-healing responding to test anomaly
✅ Cost tracking showing accurate metrics

**Status**: READY FOR DEPLOYMENT 🚀
