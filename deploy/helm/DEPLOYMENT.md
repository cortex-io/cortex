# MCP Servers Helm Deployment Guide

This guide covers deploying all MCP (Model Context Protocol) servers to Kubernetes using Helm charts.

## Quick Start

```bash
# 1. Test the charts
./test-chart.sh

# 2. Configure secrets (see Configuration section)
# Edit values/*.yaml files

# 3. Install all MCP servers
./install-mcp-servers.sh

# 4. Verify deployment
kubectl get pods -n cortex-mcp
```

## Prerequisites

### Required

- **Kubernetes 1.23+**: Running cluster with kubectl access
- **Helm 3.8+**: Package manager for Kubernetes
- **Namespace**: `cortex-mcp` (created automatically)

### Optional but Recommended

- **KEDA 2.0+**: For event-driven autoscaling
- **Prometheus Operator**: For ServiceMonitor support
- **cert-manager**: For automatic TLS certificates
- **Ingress Controller**: nginx or similar (for external access)

## Directory Structure

```
deploy/helm/
├── mcp-server/              # Helm chart
│   ├── Chart.yaml           # Chart metadata
│   ├── values.yaml          # Default values
│   ├── templates/           # Kubernetes templates
│   │   ├── _helpers.tpl
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   ├── secret.yaml
│   │   ├── serviceaccount.yaml
│   │   ├── hpa.yaml
│   │   ├── pdb.yaml
│   │   ├── scaledobject.yaml
│   │   └── NOTES.txt
│   └── README.md
├── values/                  # Server-specific values
│   ├── n8n-mcp.yaml
│   ├── talos-mcp.yaml
│   ├── proxmox-mcp.yaml
│   └── resource-manager.yaml
├── install-mcp-servers.sh   # Installation script
├── test-chart.sh            # Validation script
└── DEPLOYMENT.md            # This file
```

## Configuration

### 1. n8n MCP Server (Workflow Automation)

Edit `values/n8n-mcp.yaml`:

```yaml
secret:
  enabled: true
  data:
    # Base64 encode your values:
    # echo -n "your-key" | base64
    N8N_ENCRYPTION_KEY: "<base64-encoded-key>"
    DB_POSTGRESDB_USER: "<base64-encoded-user>"
    DB_POSTGRESDB_PASSWORD: "<base64-encoded-password>"
    QUEUE_BULL_REDIS_PASSWORD: "<base64-encoded-redis-password>"
```

**Generate encryption key:**
```bash
openssl rand -base64 32 | tr -d '\n' | base64
```

**Configuration requirements:**
- PostgreSQL database (configured in configMap)
- Redis for queue management
- Ingress hostname (update in ingress section)

### 2. Talos MCP Server (Kubernetes Management)

Edit `values/talos-mcp.yaml`:

```yaml
secret:
  enabled: true
  data:
    # Talos API credentials
    TALOS_API_TOKEN: "<base64-encoded-token>"
    TALOS_CLIENT_CERT: "<base64-encoded-cert>"
    TALOS_CLIENT_KEY: "<base64-encoded-key>"
    TALOS_CA_CERT: "<base64-encoded-ca>"
```

**Get Talos credentials:**
```bash
# From talosctl
talosctl config merge <talosconfig>

# Extract and base64 encode
cat ~/.talos/config | base64
```

**Configuration requirements:**
- Talos API endpoint (update TALOS_API_ENDPOINT in configMap)
- Valid Talos certificates
- RBAC permissions (auto-created)

### 3. Proxmox MCP Server (Infrastructure Management)

Edit `values/proxmox-mcp.yaml`:

```yaml
secret:
  enabled: true
  data:
    # Proxmox API credentials
    PROXMOX_API_TOKEN_ID: "<base64-encoded-token-id>"
    PROXMOX_API_TOKEN_SECRET: "<base64-encoded-secret>"
    # OR username/password
    PROXMOX_API_USER: "<base64-encoded-user>"
    PROXMOX_API_PASSWORD: "<base64-encoded-password>"
```

**Create Proxmox API token:**
```bash
# In Proxmox UI: Datacenter > Permissions > API Tokens
# Format: user@pam!tokenid
# Example: root@pam!cortex-mcp
```

**Configuration requirements:**
- Proxmox API endpoint (update PROXMOX_API_ENDPOINT in configMap)
- API token or username/password
- Network policy allows egress to Proxmox (port 8006)

### 4. Resource Manager (Orchestration)

Edit `values/resource-manager.yaml`:

```yaml
secret:
  enabled: true
  data:
    # Database credentials
    DB_USER: "<base64-encoded-user>"
    DB_PASSWORD: "<base64-encoded-password>"
    REDIS_PASSWORD: "<base64-encoded-redis-password>"

    # MCP server API keys
    N8N_API_KEY: "<base64-encoded-key>"
    TALOS_API_TOKEN: "<base64-encoded-token>"
    PROXMOX_API_TOKEN: "<base64-encoded-token>"

    # Encryption for sensitive data
    ENCRYPTION_KEY: "<base64-encoded-key>"
```

**Configuration requirements:**
- PostgreSQL database
- Redis for caching/state
- Access to other MCP servers (auto-configured via service discovery)

## Installation

### Test Charts First

```bash
./test-chart.sh
```

This validates:
- Chart structure
- Template syntax
- Values file compatibility
- Kubernetes resource validity

### Install Individual Server

```bash
helm install n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp \
  --create-namespace
```

### Install All Servers

```bash
./install-mcp-servers.sh
```

This script:
1. Checks prerequisites (helm, kubectl)
2. Creates namespace with labels
3. Validates each chart
4. Installs or upgrades each server
5. Waits for deployments to be ready

### Custom Installation

```bash
# Install with custom namespace
NAMESPACE=my-namespace ./install-mcp-servers.sh

# Install specific server with overrides
helm install talos-mcp ./mcp-server \
  -f ./values/talos-mcp.yaml \
  --set replicaCount=3 \
  --set keda.maxReplicaCount=15 \
  --namespace cortex-mcp
```

## Verification

### Check Deployments

```bash
kubectl get deployments -n cortex-mcp
kubectl get pods -n cortex-mcp
kubectl get svc -n cortex-mcp
```

Expected output:
```
NAME               READY   UP-TO-DATE   AVAILABLE
n8n-mcp            2/2     2            2
talos-mcp          2/2     2            2
proxmox-mcp        2/2     2            2
resource-manager   3/3     3            3
```

### Check KEDA ScaledObjects

```bash
kubectl get scaledobject -n cortex-mcp
kubectl describe scaledobject n8n-mcp -n cortex-mcp
```

### View Logs

```bash
# All MCP servers
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server --tail=100

# Specific server
kubectl logs -n cortex-mcp -l app.kubernetes.io/name=n8n-mcp --tail=100 -f

# Resource Manager
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server=resource-manager -f
```

### Test Service Connectivity

```bash
# Port forward to test locally
kubectl port-forward -n cortex-mcp svc/n8n-mcp 8080:8080

# Test endpoint
curl http://localhost:8080/health
```

### Check Metrics (if Prometheus enabled)

```bash
# Port forward to view metrics
kubectl port-forward -n cortex-mcp svc/n8n-mcp 8080:8080
curl http://localhost:8080/metrics
```

## Scaling

### Manual Scaling

```bash
# Scale deployment directly
kubectl scale deployment n8n-mcp -n cortex-mcp --replicas=5

# Update via Helm
helm upgrade n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --set replicaCount=5 \
  --namespace cortex-mcp
```

### KEDA Autoscaling

KEDA is enabled by default in all values files. Configure triggers:

```yaml
keda:
  enabled: true
  minReplicaCount: 2
  maxReplicaCount: 10
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: custom_metric
        threshold: '100'
        query: sum(rate(http_requests_total[2m]))
```

Monitor KEDA:
```bash
kubectl get scaledobject -n cortex-mcp
kubectl describe scaledobject n8n-mcp -n cortex-mcp
```

## Upgrades

### Upgrade Single Server

```bash
helm upgrade n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp
```

### Upgrade All Servers

```bash
./install-mcp-servers.sh
```

The script detects existing installations and upgrades them.

### Rollback

```bash
# List revisions
helm history n8n-mcp -n cortex-mcp

# Rollback to previous version
helm rollback n8n-mcp -n cortex-mcp

# Rollback to specific revision
helm rollback n8n-mcp 2 -n cortex-mcp
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n cortex-mcp

# Check events
kubectl get events -n cortex-mcp --sort-by='.lastTimestamp'

# Check logs
kubectl logs <pod-name> -n cortex-mcp
```

Common issues:
- Missing secrets (fill in values/*.yaml)
- Image pull errors (check image repository access)
- Resource limits (adjust in values files)

### KEDA Not Scaling

```bash
# Check KEDA operator logs
kubectl logs -n keda -l app=keda-operator

# Check ScaledObject status
kubectl describe scaledobject <name> -n cortex-mcp

# Verify metrics are available
kubectl get --raw /apis/external.metrics.k8s.io/v1beta1
```

### Service Not Accessible

```bash
# Check service endpoints
kubectl get endpoints -n cortex-mcp

# Check network policies
kubectl get networkpolicy -n cortex-mcp

# Test from another pod
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://n8n-mcp.cortex-mcp.svc.cluster.local:8080/health
```

### Certificate Issues (Ingress)

```bash
# Check cert-manager
kubectl get certificate -n cortex-mcp
kubectl describe certificate <cert-name> -n cortex-mcp

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager
```

## Uninstallation

### Remove Single Server

```bash
helm uninstall n8n-mcp -n cortex-mcp
```

### Remove All Servers

```bash
helm uninstall n8n-mcp talos-mcp proxmox-mcp resource-manager -n cortex-mcp
```

### Complete Cleanup

```bash
# Uninstall all releases
helm uninstall n8n-mcp talos-mcp proxmox-mcp resource-manager -n cortex-mcp

# Delete namespace (removes all resources)
kubectl delete namespace cortex-mcp

# Delete PVCs if any
kubectl delete pvc --all -n cortex-mcp
```

## Best Practices

### Security

1. **Use Secrets**: Never commit plain text credentials
2. **RBAC**: Use minimal service account permissions
3. **Network Policies**: Enable for production environments
4. **Security Contexts**: Already configured with non-root users
5. **TLS**: Enable ingress TLS with cert-manager

### High Availability

1. **Multiple Replicas**: Set `replicaCount >= 2`
2. **Pod Disruption Budgets**: Enabled by default
3. **Anti-Affinity**: Configured to spread pods across nodes
4. **Topology Spread**: Use for multi-zone clusters
5. **Resource Limits**: Set appropriate limits and requests

### Monitoring

1. **Enable ServiceMonitor**: For Prometheus Operator
2. **Configure Alerts**: Based on metrics
3. **Log Aggregation**: Use ELK/Loki for log collection
4. **Metrics Dashboard**: Create Grafana dashboards
5. **Health Checks**: Already configured (liveness/readiness)

### Performance

1. **KEDA Scaling**: Preferred over basic HPA
2. **Resource Tuning**: Adjust based on workload
3. **Connection Pooling**: Configured for database connections
4. **Caching**: Enabled where appropriate
5. **Concurrency Limits**: Set in configMaps

## Support

For issues or questions:
- GitHub Issues: https://github.com/ryandahlberg/cortex/issues
- Documentation: See `mcp-server/README.md`
- Chart Validation: Run `./test-chart.sh`

## License

MIT License - See LICENSE file for details.
