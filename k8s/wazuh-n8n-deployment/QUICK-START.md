# Quick Start Guide - Wazuh + n8n + MCP Deployment

## TL;DR - Deploy Everything Now

```bash
# 1. SSH to k3s master
ssh root@10.88.145.180

# 2. Build and load MCP images
cd /tmp
git clone https://github.com/ry-ops/wazuh-mcp-server.git
cd wazuh-mcp-server && docker build -t wazuh-mcp-server:latest .
docker save wazuh-mcp-server:latest | ctr -n k8s.io image import -

cd /tmp
git clone https://github.com/ry-ops/n8n-mcp-server.git
cd n8n-mcp-server && docker build -t n8n-mcp-server:latest .
docker save n8n-mcp-server:latest | ctr -n k8s.io image import -

# 3. Create deployment directory and upload manifests
mkdir -p /tmp/k8s-deploy
# (Copy manifest files to /tmp/k8s-deploy or use kubectl apply -f <url>)

# 4. Deploy all stacks
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl apply -f /tmp/k8s-deploy/wazuh/
kubectl apply -f /tmp/k8s-deploy/n8n/
kubectl apply -f /tmp/k8s-deploy/mcp/

# 5. Watch deployment
kubectl get pods -n wazuh -n n8n -n mcp -w
```

## Quick Commands

### Check Status
```bash
kubectl get pods -n wazuh -n n8n -n mcp
kubectl get svc --all-namespaces | grep -E 'wazuh|n8n|mcp'
```

### Access Services
```bash
# Wazuh Dashboard
kubectl port-forward -n wazuh svc/wazuh-dashboard 5601:5601

# n8n
kubectl port-forward -n n8n svc/n8n 5678:5678

# Wazuh MCP
kubectl port-forward -n mcp svc/wazuh-mcp-server 3000:3000

# n8n MCP
kubectl port-forward -n mcp svc/n8n-mcp-server 3001:3001
```

### Credentials

**Wazuh:**
- API: `wazuh-api` / `MyS3cr3tP@ssw0rd!`
- Indexer: `admin` / `SecureP@ssw0rd123`

**n8n:**
- PostgreSQL: `n8n` / `n8nP@ssw0rd2024!`

### Agent Connection

Connect Wazuh agents to:
- **IP:** 10.88.145.181
- **Port:** 31514

### Troubleshooting

```bash
# Logs
kubectl logs -n wazuh -l app=wazuh-manager --tail=50
kubectl logs -n n8n -l app=n8n --tail=50
kubectl logs -n mcp -l app=wazuh-mcp-server --tail=50

# Restart
kubectl rollout restart deployment/wazuh-manager -n wazuh
kubectl rollout restart deployment/n8n -n n8n
```

## Architecture

```
VM 311 (10.88.145.181): Wazuh Stack
  ├─ Indexer (50GB storage)
  ├─ Manager (NodePort 31514/31515)
  └─ Dashboard (port 5601)

VM 312 (10.88.145.182): n8n + MCP
  ├─ PostgreSQL (5GB storage)
  ├─ n8n (port 5678)
  ├─ wazuh-mcp-server (port 3000)
  └─ n8n-mcp-server (port 3001)
```

## Integration

Wazuh alerts (Level 7+) → n8n webhook:
```
http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts
```

## Files Location

All deployment files:
```
/Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/
```

## Full Documentation

See `README.md` and `DEPLOYMENT-SUMMARY.md` for complete details.
