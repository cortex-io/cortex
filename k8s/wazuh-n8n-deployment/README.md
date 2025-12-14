# Wazuh + n8n + MCP Server Deployment for K3s

Complete deployment package for Wazuh SIEM, n8n automation, and MCP servers on K3s cluster.

## Architecture

**K3s Cluster:**
- VM 310 (10.88.145.180): k3s-master
- VM 311 (10.88.145.181): k3s-worker1 - Wazuh stack
- VM 312 (10.88.145.182): k3s-worker2 - n8n + MCP servers

**Resource Allocation:**
- Wazuh: ~4 CPU / 12GB RAM
  - Indexer: 4GB heap, 50GB storage
  - Manager: 2GB RAM, NodePort 1514/1515
  - Dashboard: 1GB RAM
- n8n: ~2 CPU / 4GB RAM
  - PostgreSQL: 512MB RAM, 5GB storage
  - n8n: 1GB RAM, webhooks enabled
- MCP: ~1 CPU / 2GB RAM
  - wazuh-mcp-server: 256MB RAM, port 3000
  - n8n-mcp-server: 256MB RAM, port 3001

## Quick Deployment

### Option 1: Automated (via kubectl)

If you have kubectl configured for the k3s cluster:

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment

# Apply all manifests
kubectl apply -f wazuh/
kubectl apply -f n8n/
kubectl apply -f mcp/

# Watch deployment
kubectl get pods -n wazuh -w
```

### Option 2: Manual SSH Deployment

SSH to k3s master (10.88.145.180) and run:

```bash
# 1. Build MCP server images
cd /tmp
git clone https://github.com/ry-ops/wazuh-mcp-server.git
cd wazuh-mcp-server
docker build -t wazuh-mcp-server:latest .

cd /tmp
git clone https://github.com/ry-ops/n8n-mcp-server.git
cd n8n-mcp-server
docker build -t n8n-mcp-server:latest .

# 2. Load images to containerd
docker save wazuh-mcp-server:latest | ctr -n k8s.io image import -
docker save n8n-mcp-server:latest | ctr -n k8s.io image import -

# 3. Deploy stacks
kubectl apply -f /path/to/wazuh/
kubectl apply -f /path/to/n8n/
kubectl apply -f /path/to/mcp/
```

### Option 3: Via Proxmox API

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/scripts
./deploy-via-proxmox.sh
```

## Stacks Overview

### Wazuh Stack (Namespace: wazuh)

**Components:**
1. **Indexer** (StatefulSet)
   - Image: wazuh/wazuh-indexer:4.7.1
   - Storage: 50GB PVC
   - Heap: 2GB (adjustable)
   - Ports: 9200 (HTTP), 9300 (transport)
   - Node: k3s-worker1

2. **Manager** (Deployment)
   - Image: wazuh/wazuh-manager:4.7.1
   - Ports: 1514 (agents), 1515 (registration), 55000 (API)
   - Service: NodePort 31514, 31515
   - Node: k3s-worker1

3. **Dashboard** (Deployment)
   - Image: wazuh/wazuh-dashboard:4.7.1
   - Port: 5601
   - Service: ClusterIP
   - Node: k3s-worker1

**Credentials:**
- API: `wazuh-api` / `MyS3cr3tP@ssw0rd!`
- Indexer: `admin` / `SecureP@ssw0rd123`
- Dashboard: `kibanaserver` / `KibanaP@ss2024`

### n8n Stack (Namespace: n8n)

**Components:**
1. **PostgreSQL** (StatefulSet)
   - Image: postgres:15-alpine
   - Storage: 5GB PVC
   - Node: k3s-worker2

2. **n8n** (Deployment)
   - Image: n8nio/n8n:latest
   - Port: 5678
   - Timezone: America/Chicago
   - Webhooks: Enabled
   - Node: k3s-worker2

**Credentials:**
- PostgreSQL: `n8n` / `n8nP@ssw0rd2024!`
- Encryption Key: `g8KAcPnZm9XjYfR3QwE5tVbN7uHsLdMp`

### MCP Servers (Namespace: mcp)

**Components:**
1. **wazuh-mcp-server** (Deployment)
   - Image: wazuh-mcp-server:latest (built from github.com/ry-ops/wazuh-mcp-server)
   - Port: 3000
   - Transport: HTTP/SSE
   - Node: k3s-worker2

2. **n8n-mcp-server** (Deployment)
   - Image: n8n-mcp-server:latest (built from github.com/ry-ops/n8n-mcp-server)
   - Port: 3001
   - Transport: HTTP/SSE
   - Node: k3s-worker2

3. **KEDA ScaledObjects**
   - Metric: cortex_mcp_requests_total
   - Threshold: 10 requests/min
   - Min replicas: 1, Max replicas: 5

## Integration

### Wazuh → n8n Webhook

Configured automatically in Wazuh Manager:

```xml
<integration>
  <name>custom-webhook</name>
  <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
  <level>7</level>
  <alert_format>json</alert_format>
</integration>
```

**Alerts Level 7+ are forwarded to n8n for automation.**

### MCP Server Registration

Update `/Users/ryandahlberg/Projects/cortex/coordination/mcp-server-registry.json`:

```json
{
  "name": "wazuh-mcp-server",
  "url": "http://wazuh-mcp-server.mcp.svc.cluster.local:3000",
  "type": "wazuh",
  "namespace": "mcp",
  "transport": "sse",
  "capabilities": [
    "agent_management",
    "alert_monitoring",
    "vulnerability_scanning",
    "compliance_checking"
  ]
}
```

## Access URLs

### Internal (within cluster)
- Wazuh API: `http://wazuh-manager.wazuh.svc.cluster.local:55000`
- Wazuh Indexer: `http://wazuh-indexer.wazuh.svc.cluster.local:9200`
- Wazuh Dashboard: `http://wazuh-dashboard.wazuh.svc.cluster.local:5601`
- n8n: `http://n8n.n8n.svc.cluster.local:5678`
- Wazuh MCP: `http://wazuh-mcp-server.mcp.svc.cluster.local:3000`
- n8n MCP: `http://n8n-mcp-server.mcp.svc.cluster.local:3001`

### External (NodePort)
- Wazuh Agent Port: `10.88.145.181:31514` (TCP)
- Wazuh Registration: `10.88.145.181:31515` (TCP)

### Port Forwarding (for ClusterIP services)

```bash
# Wazuh Dashboard
kubectl port-forward -n wazuh svc/wazuh-dashboard 5601:5601

# n8n
kubectl port-forward -n n8n svc/n8n 5678:5678

# Wazuh MCP Server
kubectl port-forward -n mcp svc/wazuh-mcp-server 3000:3000

# n8n MCP Server
kubectl port-forward -n mcp svc/n8n-mcp-server 3001:3001
```

## Verification

### Check Pod Status

```bash
# All pods
kubectl get pods -n wazuh -n n8n -n mcp

# Detailed status
kubectl describe pods -n wazuh
kubectl describe pods -n n8n
kubectl describe pods -n mcp
```

### Check Services

```bash
kubectl get svc -n wazuh
kubectl get svc -n n8n
kubectl get svc -n mcp
```

### Check PVCs

```bash
kubectl get pvc -n wazuh
kubectl get pvc -n n8n
```

### Test Wazuh API

```bash
# From within cluster
kubectl run -it --rm curl --image=curlimages/curl -- \
  curl -u wazuh-api:MyS3cr3tP@ssw0rd! \
  http://wazuh-manager.wazuh.svc.cluster.local:55000/
```

### Test n8n

```bash
# Port-forward first
kubectl port-forward -n n8n svc/n8n 5678:5678

# Then access http://localhost:5678
```

### Test MCP Servers

```bash
# Wazuh MCP health
kubectl exec -n mcp deployment/wazuh-mcp-server -- \
  wget -qO- http://localhost:3000/health

# n8n MCP health
kubectl exec -n mcp deployment/n8n-mcp-server -- \
  wget -qO- http://localhost:3001/health
```

## Troubleshooting

### Pods not starting

```bash
# Check events
kubectl get events -n wazuh --sort-by='.lastTimestamp'
kubectl get events -n n8n --sort-by='.lastTimestamp'
kubectl get events -n mcp --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n wazuh -l app=wazuh-indexer --tail=50
kubectl logs -n wazuh -l app=wazuh-manager --tail=50
kubectl logs -n n8n -l app=n8n --tail=50
kubectl logs -n mcp -l app=wazuh-mcp-server --tail=50
```

### Images not found

MCP server images must be built and loaded manually:

```bash
# On k3s master or any node
ctr -n k8s.io images ls | grep mcp

# If missing, build and load:
docker save wazuh-mcp-server:latest | ctr -n k8s.io image import -
docker save n8n-mcp-server:latest | ctr -n k8s.io image import -
```

### Wazuh Indexer fails to start

```bash
# Check vm.max_map_count on nodes
ssh root@10.88.145.181 sysctl vm.max_map_count

# Should be >= 262144
# Set if needed:
ssh root@10.88.145.181 sysctl -w vm.max_map_count=262144
```

### Webhook not working

```bash
# Check Wazuh Manager config
kubectl exec -n wazuh deployment/wazuh-manager -- \
  cat /var/ossec/etc/ossec.conf.d/webhook.conf

# Check n8n webhook endpoint
kubectl port-forward -n n8n svc/n8n 5678:5678
# Access http://localhost:5678 and create webhook
```

## Maintenance

### Scaling

```bash
# Scale deployments
kubectl scale deployment/wazuh-manager -n wazuh --replicas=2
kubectl scale deployment/n8n -n n8n --replicas=2

# KEDA will auto-scale MCP servers based on metrics
```

### Updates

```bash
# Update image
kubectl set image deployment/wazuh-manager -n wazuh \
  manager=wazuh/wazuh-manager:4.8.0

# Rollout status
kubectl rollout status deployment/wazuh-manager -n wazuh

# Rollback if needed
kubectl rollout undo deployment/wazuh-manager -n wazuh
```

### Backup

```bash
# Backup PVCs
kubectl get pvc -n wazuh -o yaml > wazuh-pvcs-backup.yaml
kubectl get pvc -n n8n -o yaml > n8n-pvcs-backup.yaml

# Export manifests
kubectl get all -n wazuh -o yaml > wazuh-backup.yaml
kubectl get all -n n8n -o yaml > n8n-backup.yaml
kubectl get all -n mcp -o yaml > mcp-backup.yaml
```

## Security Notes

1. **Change default passwords** in production!
2. **TLS disabled** for simplicity - enable in production
3. **Security plugin disabled** in Wazuh Indexer - enable for prod
4. **Webhooks over HTTP** - use HTTPS in production
5. **No ingress** configured - add for external access

## GitHub Repositories

- Wazuh MCP Server: https://github.com/ry-ops/wazuh-mcp-server
- n8n MCP Server: https://github.com/ry-ops/n8n-mcp-server

## Support

For issues or questions:
1. Check logs: `kubectl logs -n <namespace> <pod-name>`
2. Check events: `kubectl get events -n <namespace>`
3. Verify connectivity: `kubectl exec -it <pod> -- sh`

## License

MIT
