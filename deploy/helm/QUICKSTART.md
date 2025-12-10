# MCP Servers Helm - Quick Start Guide

Fast deployment guide for MCP servers on Kubernetes.

## TL;DR

```bash
cd /Users/ryandahlberg/Projects/cortex/deploy/helm

# 1. Test charts
./test-chart.sh

# 2. Configure secrets in values/*.yaml files
# (see Configuration section below)

# 3. Deploy all servers
./install-mcp-servers.sh

# 4. Verify
kubectl get pods -n cortex-mcp
```

## Prerequisites Check

```bash
# Kubernetes cluster access
kubectl cluster-info

# Helm installed
helm version

# Optional: KEDA for autoscaling
kubectl get deploy -n keda
```

## Configuration (5 minutes)

### 1. Generate Base64 Secrets

```bash
# Helper function
encode() { echo -n "$1" | base64; }

# Generate random key
random_key() { openssl rand -base64 32; }

# Example
encode "my-password"
random_key | tr -d '\n' | base64
```

### 2. Update Values Files

Edit each file in `values/` directory:

**n8n-mcp.yaml:**
```yaml
secret:
  data:
    N8N_ENCRYPTION_KEY: "$(random_key | tr -d '\n' | base64)"
    DB_POSTGRESDB_USER: "$(encode 'n8n')"
    DB_POSTGRESDB_PASSWORD: "$(encode 'your-password')"
    QUEUE_BULL_REDIS_PASSWORD: "$(encode 'redis-password')"
```

**talos-mcp.yaml:**
```yaml
secret:
  data:
    TALOS_API_TOKEN: "$(cat ~/.talos/config | base64)"
```

**proxmox-mcp.yaml:**
```yaml
secret:
  data:
    PROXMOX_API_TOKEN_ID: "$(encode 'root@pam!cortex')"
    PROXMOX_API_TOKEN_SECRET: "$(encode 'your-token-secret')"
```

**resource-manager.yaml:**
```yaml
secret:
  data:
    DB_USER: "$(encode 'resource_manager')"
    DB_PASSWORD: "$(encode 'your-password')"
    REDIS_PASSWORD: "$(encode 'redis-password')"
    ENCRYPTION_KEY: "$(random_key | tr -d '\n' | base64)"
```

## Installation Commands

### All Servers (Recommended)

```bash
./install-mcp-servers.sh
```

### Individual Servers

```bash
# n8n MCP
helm install n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  -n cortex-mcp --create-namespace

# Talos MCP
helm install talos-mcp ./mcp-server \
  -f values/talos-mcp.yaml \
  -n cortex-mcp --create-namespace

# Proxmox MCP
helm install proxmox-mcp ./mcp-server \
  -f values/proxmox-mcp.yaml \
  -n cortex-mcp --create-namespace

# Resource Manager
helm install resource-manager ./mcp-server \
  -f values/resource-manager.yaml \
  -n cortex-mcp --create-namespace
```

## Verification

```bash
# Check deployments
kubectl get deploy -n cortex-mcp

# Check pods
kubectl get pods -n cortex-mcp

# Check services
kubectl get svc -n cortex-mcp

# Check KEDA (if enabled)
kubectl get scaledobject -n cortex-mcp

# View logs
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server --tail=50
```

## Quick Tests

```bash
# Test n8n-mcp
kubectl port-forward -n cortex-mcp svc/n8n-mcp 8080:8080 &
curl http://localhost:8080/healthz

# Test talos-mcp
kubectl port-forward -n cortex-mcp svc/talos-mcp 8081:8080 &
curl http://localhost:8081/health

# Test proxmox-mcp
kubectl port-forward -n cortex-mcp svc/proxmox-mcp 8082:8080 &
curl http://localhost:8082/health

# Test resource-manager
kubectl port-forward -n cortex-mcp svc/resource-manager 8083:8080 &
curl http://localhost:8083/health
```

## Common Operations

### Scale Manually

```bash
# Scale specific server
kubectl scale deploy n8n-mcp -n cortex-mcp --replicas=5

# Via Helm
helm upgrade n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  --set replicaCount=5 \
  -n cortex-mcp
```

### Update Configuration

```bash
# Edit values file
vim values/n8n-mcp.yaml

# Apply changes
helm upgrade n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  -n cortex-mcp
```

### View Logs

```bash
# All servers
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server -f

# Specific server
kubectl logs -n cortex-mcp -l app.kubernetes.io/name=n8n-mcp -f

# Specific pod
kubectl logs -n cortex-mcp <pod-name> -f
```

### Restart Pods

```bash
# Rolling restart
kubectl rollout restart deploy/n8n-mcp -n cortex-mcp

# Force restart all
kubectl delete pods -n cortex-mcp -l cortex.ai/mcp-server
```

## Troubleshooting

### Pods Not Starting

```bash
# Describe pod
kubectl describe pod <pod-name> -n cortex-mcp

# Check events
kubectl get events -n cortex-mcp --sort-by='.lastTimestamp'

# Check logs
kubectl logs <pod-name> -n cortex-mcp
```

### Secret Issues

```bash
# Check if secrets exist
kubectl get secrets -n cortex-mcp

# Verify secret data
kubectl get secret n8n-mcp-secret -n cortex-mcp -o yaml

# Recreate secret
kubectl delete secret n8n-mcp-secret -n cortex-mcp
helm upgrade n8n-mcp ./mcp-server -f values/n8n-mcp.yaml -n cortex-mcp
```

### Service Not Accessible

```bash
# Check endpoints
kubectl get endpoints -n cortex-mcp

# Test from debug pod
kubectl run -it --rm debug --image=curlimages/curl -n cortex-mcp -- \
  curl http://n8n-mcp:8080/health
```

## Cleanup

```bash
# Remove all servers
helm uninstall n8n-mcp talos-mcp proxmox-mcp resource-manager -n cortex-mcp

# Delete namespace
kubectl delete namespace cortex-mcp
```

## Next Steps

- **Full Documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Chart Details**: See [mcp-server/README.md](mcp-server/README.md)
- **Monitoring Setup**: Configure Prometheus/Grafana
- **Ingress Setup**: Configure external access
- **Backups**: Set up backup strategy for persistent data

## Resource Requirements

Minimum cluster resources needed:

| Server | CPU (req) | Memory (req) | CPU (limit) | Memory (limit) |
|--------|-----------|--------------|-------------|----------------|
| n8n-mcp | 200m | 256Mi | 2000m | 1Gi |
| talos-mcp | 100m | 128Mi | 1000m | 512Mi |
| proxmox-mcp | 100m | 128Mi | 1000m | 512Mi |
| resource-manager | 200m | 256Mi | 2000m | 1Gi |
| **Total (min)** | **600m** | **768Mi** | **6000m** | **3Gi** |

With autoscaling (max replicas):
- Max CPU: ~50 cores
- Max Memory: ~25Gi

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│           Kubernetes Cluster                     │
│  ┌───────────────────────────────────────────┐  │
│  │     Namespace: cortex-mcp                 │  │
│  │                                           │  │
│  │  ┌─────────┐  ┌──────────┐              │  │
│  │  │ n8n-mcp │  │talos-mcp │              │  │
│  │  │ (2 pods)│  │ (2 pods) │              │  │
│  │  └────┬────┘  └────┬─────┘              │  │
│  │       │            │                     │  │
│  │  ┌────┴─────┐  ┌──┴─────────┐           │  │
│  │  │proxmox-  │  │ resource-  │           │  │
│  │  │mcp       │  │ manager    │           │  │
│  │  │(2 pods)  │  │ (3 pods)   │           │  │
│  │  └──────────┘  └──────┬─────┘           │  │
│  │                       │                  │  │
│  │              ┌────────┴────────┐         │  │
│  │              │  KEDA Scaler    │         │  │
│  │              └─────────────────┘         │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────┐  ┌──────────────────┐      │
│  │  Prometheus    │  │  Ingress         │      │
│  │  (Monitoring)  │  │  (External)      │      │
│  └────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────┘
```

## Support

- Issues: https://github.com/ryandahlberg/cortex/issues
- Docs: See DEPLOYMENT.md
- Chart README: mcp-server/README.md
