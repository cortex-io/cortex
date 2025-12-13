# Cortex MCP Server Scaling

KEDA-based autoscaling for MCP (Model Context Protocol) servers.

## Overview

This directory contains Kubernetes manifests for deploying and autoscaling MCP servers using KEDA (Kubernetes Event-Driven Autoscaling).

## MCP Servers

### 1. Wazuh MCP Server
- **Purpose**: Security event monitoring and SIEM integration
- **Scaling Strategy**: Scale to zero (occasionally used)
- **Min/Max Replicas**: 0-5
- **Scale-up Trigger**: >10 requests/min OR >5 requests queued
- **Cooldown**: 5 minutes

### 2. Proxmox MCP Server
- **Purpose**: VM/container management and infrastructure automation
- **Scaling Strategy**: Scale to zero (occasionally used)
- **Min/Max Replicas**: 0-5
- **Scale-up Trigger**: >10 requests/min OR >5 requests queued
- **Cooldown**: 5 minutes

### 3. n8n MCP Server
- **Purpose**: Workflow automation and integration platform
- **Scaling Strategy**: Warm standby (frequently used)
- **Min/Max Replicas**: 1-10
- **Scale-up Trigger**: >20 requests/min OR >10 requests queued
- **Cooldown**: 5 minutes

## Files

- `namespace.yaml` - Namespace, ServiceAccount, and RBAC
- `*-deployment.yaml` - Deployment manifests for each MCP server
- `*-scaledobject.yaml` - KEDA ScaledObject configurations

## Deployment

### Prerequisites

1. KEDA installed in cluster:
   ```bash
   kubectl apply -f https://github.com/kedacore/keda/releases/download/v2.12.0/keda-2.12.0.yaml
   ```

2. Prometheus running and accessible at `prometheus.monitoring:9090`

3. MCP server credentials stored as secrets:
   ```bash
   kubectl create secret generic wazuh-mcp-credentials -n cortex-mcp \
     --from-literal=api_url=https://wazuh.example.com \
     --from-literal=username=admin \
     --from-literal=password=secret

   kubectl create secret generic proxmox-mcp-credentials -n cortex-mcp \
     --from-literal=api_url=https://proxmox.example.com:8006 \
     --from-literal=token_id=user@pam!token \
     --from-literal=token_secret=secret

   kubectl create secret generic n8n-mcp-credentials -n cortex-mcp \
     --from-literal=api_url=https://n8n.example.com \
     --from-literal=api_key=secret
   ```

### Deploy MCP Servers

```bash
# Create namespace and RBAC
kubectl apply -f namespace.yaml

# Deploy MCP servers
kubectl apply -f wazuh-mcp-deployment.yaml
kubectl apply -f proxmox-mcp-deployment.yaml
kubectl apply -f n8n-mcp-deployment.yaml

# Deploy KEDA ScaledObjects
kubectl apply -f wazuh-mcp-scaledobject.yaml
kubectl apply -f proxmox-mcp-scaledobject.yaml
kubectl apply -f n8n-mcp-scaledobject.yaml
```

### Verify Deployment

```bash
# Check MCP server pods
kubectl get pods -n cortex-mcp

# Check KEDA ScaledObjects
kubectl get scaledobjects -n cortex-mcp

# Check HPA (created by KEDA)
kubectl get hpa -n cortex-mcp

# View scaling events
kubectl describe scaledobject wazuh-mcp-scaler -n cortex-mcp
```

## Monitoring

MCP servers export Prometheus metrics on port 9090:

- `cortex_mcp_requests_total{mcp_server}` - Total requests
- `cortex_mcp_request_queue_depth{mcp_server}` - Queued requests
- `cortex_mcp_request_duration_seconds{mcp_server}` - Request duration

### Example Prometheus Queries

```promql
# Request rate by MCP server
sum(rate(cortex_mcp_requests_total[5m])) by (mcp_server)

# Queue depth by MCP server
sum(cortex_mcp_request_queue_depth) by (mcp_server)

# Current replica count
kube_deployment_status_replicas{deployment=~".*-mcp-server"}
```

## Scaling Behavior

### Scale-Up
- **Immediate**: No stabilization window
- **Policies**:
  - 100% increase (double capacity) every 15s
  - OR add 2-3 pods, whichever is higher

### Scale-Down
- **Stabilization**: 2 minutes
- **Policies**: Remove 1 pod at a time every 60s
- **Cooldown**: 5 minutes before scaling to zero

### Scale-to-Zero
- **Wazuh**: Yes (min: 0)
- **Proxmox**: Yes (min: 0)
- **n8n**: No (min: 1, warm standby)

## Programmatic Control

Use the `mcp-scaler.js` library for programmatic scaling control:

```bash
# Monitor scaling recommendations
node /Users/ryandahlberg/Projects/cortex/lib/resource-manager/mcp-scaler.js monitor

# Get recommendation for specific server
node /Users/ryandahlberg/Projects/cortex/lib/resource-manager/mcp-scaler.js recommend wazuh

# Get all recommendations
node /Users/ryandahlberg/Projects/cortex/lib/resource-manager/mcp-scaler.js recommend

# Export scaling metrics
node /Users/ryandahlberg/Projects/cortex/lib/resource-manager/mcp-scaler.js metrics
```

## Troubleshooting

### MCP Server Won't Scale Up

1. Check KEDA logs:
   ```bash
   kubectl logs -n keda deployment/keda-operator
   ```

2. Verify Prometheus metrics:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus 9090:9090
   # Visit http://localhost:9090
   ```

3. Check ScaledObject status:
   ```bash
   kubectl describe scaledobject wazuh-mcp-scaler -n cortex-mcp
   ```

### MCP Server Won't Scale to Zero

1. Check for active connections
2. Verify cooldown period has elapsed
3. Check KEDA metrics:
   ```bash
   kubectl get --raw /apis/external.metrics.k8s.io/v1beta1
   ```

## Cost Optimization

MCP servers scale to zero when idle, reducing costs:

- **Wazuh**: ~$0 when idle, ~$20/month at 50% utilization
- **Proxmox**: ~$0 when idle, ~$20/month at 50% utilization
- **n8n**: ~$10/month (1 replica), ~$50/month at peak (10 replicas)

Total estimated savings: **60-80%** compared to always-on deployment.

## References

- [KEDA Documentation](https://keda.sh/docs/)
- [KEDA Prometheus Scaler](https://keda.sh/docs/scalers/prometheus/)
- [Cortex MCP Integration](../../docs/integrations/)
