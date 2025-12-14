# Wazuh + n8n + MCP - Quick Reference Card

## Access URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| **Wazuh Dashboard** | https://10.88.145.180:30561 | admin / (check secret) |
| **n8n** (port-forward) | http://localhost:5678 | (after port-forward) |
| **Wazuh API** | http://wazuh-manager.wazuh.svc.cluster.local:55000 | admin / (check secret) |

## Quick Commands

### SSH to K3s Cluster
```bash
ssh root@10.88.145.180
```

### Check Deployment Status
```bash
# All pods
kubectl get pods -A | grep -E 'wazuh|n8n|mcp'

# By namespace
kubectl get pods -n wazuh
kubectl get pods -n n8n
kubectl get pods -n mcp
```

### Port Forward Services
```bash
# n8n UI
kubectl port-forward -n n8n svc/n8n 5678:5678

# Wazuh API
kubectl port-forward -n wazuh svc/wazuh-manager 55000:55000

# Wazuh Indexer
kubectl port-forward -n wazuh svc/wazuh-indexer 9200:9200
```

### Get Credentials
```bash
# Wazuh credentials
kubectl get secret -n wazuh wazuh-credentials -o jsonpath='{.data.wazuh-api-password}' | base64 -d

# n8n database password
kubectl get secret -n n8n n8n-credentials -o jsonpath='{.data.postgres-password}' | base64 -d

# n8n encryption key
kubectl get secret -n n8n n8n-credentials -o jsonpath='{.data.n8n-encryption-key}' | base64 -d
```

### Check Logs
```bash
# Wazuh Manager
kubectl logs -n wazuh $(kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}')

# n8n
kubectl logs -n n8n $(kubectl get pod -n n8n -l app=n8n -o jsonpath='{.items[0].metadata.name}')

# Wazuh MCP Server
kubectl logs -n mcp $(kubectl get pod -n mcp -l app=wazuh-mcp-server -o jsonpath='{.items[0].metadata.name}')

# n8n MCP Server
kubectl logs -n mcp $(kubectl get pod -n mcp -l app=n8n-mcp-server -o jsonpath='{.items[0].metadata.name}')
```

### Test Connectivity
```bash
# Test Wazuh MCP Server
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health

# Test n8n MCP Server
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n-mcp-server.mcp.svc.cluster.local:3001/health

# Test n8n health
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n.n8n.svc.cluster.local:5678/healthz
```

### Restart Services
```bash
# Restart Wazuh Manager
kubectl rollout restart deployment -n wazuh wazuh-manager

# Restart Wazuh Dashboard
kubectl rollout restart deployment -n wazuh wazuh-dashboard

# Restart n8n
kubectl rollout restart deployment -n n8n n8n

# Restart Wazuh Indexer
kubectl rollout restart statefulset -n wazuh wazuh-indexer
```

### Scale Services
```bash
# Scale MCP servers
kubectl scale deployment -n mcp wazuh-mcp-server --replicas=3
kubectl scale deployment -n mcp n8n-mcp-server --replicas=3

# Check autoscaling status
kubectl get scaledobject -n mcp
```

## Integration Commands

### Import n8n Workflow
```bash
# Port-forward n8n
kubectl port-forward -n n8n svc/n8n 5678:5678

# Then access: http://localhost:5678
# Import from: /tmp/wazuh-webhook-workflow.json
```

### Configure Wazuh Integration
```bash
# Edit Wazuh Manager config
kubectl exec -n wazuh $(kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}') -it -- vi /var/ossec/etc/ossec.conf

# Add before </ossec_config>:
# <integration>
#   <name>custom-webhook</name>
#   <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
#   <level>7</level>
#   <alert_format>json</alert_format>
# </integration>

# Restart Wazuh Manager
kubectl rollout restart deployment -n wazuh wazuh-manager
```

### Test Webhook
```bash
# Send test alert to n8n
kubectl run webhook-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl -X POST -H 'Content-Type: application/json' \
  -d '{"rule":{"id":"5710","description":"Test","level":7},"agent":{"name":"test"}}' \
  http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts
```

## Testing Scripts

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment

# Verify deployment (via Proxmox)
./scripts/verify-via-proxmox.sh

# Configure integration
./scripts/configure-integration.sh

# Test integration
./scripts/test-integration.sh

# Test MCP servers
./scripts/test-mcp-servers.sh
```

## Troubleshooting

### Pod Stuck in Pending/CrashLoopBackOff
```bash
# Describe the pod
kubectl describe pod -n <namespace> <pod-name>

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name> --previous  # Previous container logs
```

### Service Not Accessible
```bash
# Check service
kubectl get svc -n <namespace>

# Check endpoints
kubectl get endpoints -n <namespace>

# Check network policies
kubectl get networkpolicies -n <namespace>
```

### High Resource Usage
```bash
# Check pod resource usage
kubectl top pods -n wazuh
kubectl top pods -n n8n
kubectl top pods -n mcp

# Check node resource usage
kubectl top nodes

# Check resource limits
kubectl describe pod -n <namespace> <pod-name> | grep -A 5 Resources
```

## Common Issues

### Issue: n8n webhook not receiving alerts
**Solution:**
1. Verify n8n workflow is active
2. Check webhook URL matches in Wazuh config
3. Test webhook endpoint manually
4. Check n8n logs for errors

### Issue: Wazuh Indexer not starting
**Solution:**
1. Check memory limits (needs 4Gi)
2. Verify vm.max_map_count on nodes
3. Check logs: `kubectl logs -n wazuh wazuh-indexer-0`
4. Ensure persistent storage is available

### Issue: MCP servers returning 404
**Solution:**
1. Check pod is running: `kubectl get pods -n mcp`
2. Verify service endpoints: `kubectl get endpoints -n mcp`
3. Check logs for errors
4. Verify service port configuration

## Useful Kubernetes Commands

```bash
# Get all resources in a namespace
kubectl get all -n wazuh

# Describe a resource
kubectl describe <resource-type> -n <namespace> <resource-name>

# Execute command in pod
kubectl exec -n <namespace> <pod-name> -- <command>

# Interactive shell in pod
kubectl exec -n <namespace> <pod-name> -it -- /bin/bash

# Copy file to/from pod
kubectl cp <namespace>/<pod-name>:/path/to/file ./local-file
kubectl cp ./local-file <namespace>/<pod-name>:/path/to/file

# Watch resources
kubectl get pods -n wazuh --watch

# Get YAML of running resource
kubectl get deployment -n wazuh wazuh-manager -o yaml
```

## File Locations

### Local (Development Machine)
- **Deployment manifests:** `/Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/`
- **Scripts:** `/Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/scripts/`
- **Reports:** `/Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/verification/`
- **Workflow template:** `/tmp/wazuh-webhook-workflow.json`
- **Integration config:** `/tmp/wazuh-integration.xml`

### K3s Cluster
- **Wazuh config:** `/var/ossec/etc/ossec.conf` (in wazuh-manager pod)
- **n8n data:** `/home/node/.n8n` (in n8n pod)
- **Postgres data:** `/var/lib/postgresql/data` (in n8n-postgres pod)

## Environment Variables

```bash
# From /Users/ryandahlberg/Projects/cortex/.env
PROXMOX_HOST="10.88.140.164"
K3S_MASTER_IP="10.88.145.180"
K3S_WORKER1_IP="10.88.145.181"
K3S_WORKER2_IP="10.88.145.182"
```

## Documentation

- **Deployment Guide:** README.md
- **Integration Guide:** INTEGRATION-GUIDE.md
- **Quick Start:** QUICK-START.md
- **Completion Report:** DEPLOYMENT-COMPLETION-REPORT.md
- **This Reference:** QUICK-REFERENCE.md

---

**Last Updated:** December 14, 2025
**Deployment Path:** /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment
