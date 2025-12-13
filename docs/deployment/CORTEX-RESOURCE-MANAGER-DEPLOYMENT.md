# Cortex Resource Manager - K3s Deployment Guide

> **Phase 1 Critical Infrastructure Deployment**

This document provides complete instructions for deploying the cortex-resource-manager MCP server to the K3s cluster.

## Overview

**Repository**: https://github.com/ry-ops/cortex-resource-manager
**Deployment Target**: K3s cluster (10.88.145.180, 10.88.145.181, 10.88.145.182)
**Namespace**: cortex-system
**Service URL**: cortex-resource-manager.cortex-system.svc.cluster.local:8080

## Architecture

```
┌─────────────────────────────────────────────────┐
│            K3s Cluster (cortex)                  │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │   Namespace: cortex-system                 │ │
│  │                                             │ │
│  │  ┌──────────────────────────────────────┐  │ │
│  │  │  cortex-resource-manager             │  │ │
│  │  │  - Deployment (1 replica)            │  │ │
│  │  │  - Service (ClusterIP:8080)          │  │ │
│  │  │  - RBAC (cluster-admin)              │  │ │
│  │  │  - ConfigMap (resource limits)       │  │ │
│  │  └──────────────────────────────────────┘  │ │
│  │                                             │ │
│  │  APIs:                                      │ │
│  │  - Resource Allocation (5 tools)           │ │
│  │  - MCP Server Lifecycle (5 tools)          │ │
│  │  - Worker Management (6 tools)             │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Prerequisites

- K3s cluster running and accessible
- kubectl configured with cluster access
- SSH access to K3s control plane node (10.88.145.180)
- OR local kubectl with kubeconfig (~/.kube/k3s-cortex-config.yaml)

## Deployment Options

### Option 1: Automated Deployment Package (Recommended)

This is the **recommended approach** when direct kubectl access is not available.

#### Step 1: Generate Deployment Package

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy/package-resource-manager.sh
```

This creates:
- `/tmp/cortex-resource-manager-deployment.tar.gz` - Tarball package
- `/tmp/cortex-resource-manager-deployment/` - Extracted directory

#### Step 2: Transfer to K3s Node

```bash
# Option A: Transfer tarball
scp /tmp/cortex-resource-manager-deployment.tar.gz root@10.88.145.180:/tmp/

# Option B: Transfer directory directly
scp -r /tmp/cortex-resource-manager-deployment root@10.88.145.180:/tmp/
```

#### Step 3: Deploy on K3s Node

```bash
# SSH to K3s control plane
ssh root@10.88.145.180

# Extract (if using tarball)
cd /tmp
tar -xzf cortex-resource-manager-deployment.tar.gz

# Deploy
cd cortex-resource-manager-deployment
./deploy.sh
```

The deployment script will:
1. Create cortex-system namespace
2. Apply RBAC (ServiceAccount, ClusterRole, ClusterRoleBinding)
3. Create ConfigMap with resource limits
4. Deploy Service (ClusterIP on port 8080)
5. Deploy Deployment (1 replica, 500m CPU, 512Mi RAM)
6. Wait for rollout to complete (5-minute timeout)
7. Display pod and service status

### Option 2: Direct kubectl Deployment

If you have direct kubectl access to the K3s cluster:

```bash
cd /Users/ryandahlberg/Projects/cortex

# Set kubeconfig
export KUBECONFIG=~/.kube/k3s-cortex-config.yaml

# Deploy
./scripts/deploy/deploy-resource-manager.sh
```

### Option 3: Kustomize Deployment

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/services/resource-manager

# Deploy with kustomize
kubectl apply -k .
```

### Option 4: Manual Deployment

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/services/resource-manager

kubectl apply -f namespace.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f configmap.yaml
kubectl apply -f service.yaml
kubectl apply -f servicemonitor.yaml  # Optional, requires Prometheus Operator
kubectl apply -f deployment.yaml

# Wait for rollout
kubectl rollout status deployment/cortex-resource-manager -n cortex-system --timeout=300s
```

## Deployment Files

All manifests are located in: `/Users/ryandahlberg/Projects/cortex/k8s/services/resource-manager/`

### Manifest Breakdown

| File | Purpose | Key Configurations |
|------|---------|-------------------|
| `namespace.yaml` | Creates cortex-system namespace | Labels for component tracking |
| `serviceaccount.yaml` | RBAC configuration | Cluster-admin permissions for resource management |
| `configmap.yaml` | Environment configuration | Total CPU: 16.0, Memory: 32GB, Workers: 10 |
| `deployment.yaml` | Main workload | 1 replica, 500m CPU, 512Mi RAM, security context |
| `service.yaml` | Service exposure | ClusterIP on 8080 (MCP) and 9090 (metrics) |
| `servicemonitor.yaml` | Prometheus integration | Scrapes metrics every 30s |
| `kustomization.yaml` | Kustomize config | Image tag management |

## Configuration

### Resource Limits

Configured in `configmap.yaml`:

```yaml
TOTAL_CPU: "16.0"           # 16 cores total across cluster
TOTAL_MEMORY: "32768"       # 32GB in MB
TOTAL_WORKERS: "10"         # Maximum 10 workers
MCP_NAMESPACE: "cortex"     # Namespace for MCP servers
WORKER_NAMESPACE: "cortex"  # Namespace for workers
```

### Deployment Resources

Pod resource allocation:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### RBAC Permissions

The ServiceAccount has cluster-admin level permissions for:
- **Deployments**: Create, read, update, delete, scale
- **Pods**: Full lifecycle management
- **Services**: Create and update
- **ConfigMaps/Secrets**: Create and update
- **PVCs/PVs**: Manage persistent storage
- **Nodes**: Read and update (for worker operations)
- **HPA**: Horizontal Pod Autoscaler management
- **KEDA**: ScaledObject management
- **Metrics**: Read pod and node metrics

## Verification

### Quick Status Check

```bash
# Check deployment
kubectl get deployment cortex-resource-manager -n cortex-system

# Check pods
kubectl get pods -n cortex-system -l app=cortex-resource-manager

# Check service
kubectl get svc cortex-resource-manager -n cortex-system

# Check endpoints
kubectl get endpoints cortex-resource-manager -n cortex-system
```

### Automated Testing

Run the comprehensive test suite:

```bash
# On K3s node or with kubectl access
./scripts/testing/test-resource-manager.sh
```

This tests:
1. Deployment exists
2. Pods are running
3. Service exists and has endpoints
4. RBAC is configured correctly
5. Pod health and readiness
6. Health endpoint (/health)
7. Readiness endpoint (/ready)
8. Resource allocation API
9. MCP server list API
10. Worker list API
11. Capacity API
12. Metrics endpoint
13. Pod logs (no errors)
14. Resource usage

### Manual API Testing

```bash
# Test health endpoint
kubectl run test-health --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health

# Test resource allocation API
kubectl run test-allocations --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl -X POST http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/mcp/v1/tools/list_allocations \
  -H "Content-Type: application/json" \
  -d '{}'

# Test MCP server list
kubectl run test-mcp --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl -X POST http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/mcp/v1/tools/list_mcp_servers \
  -H "Content-Type: application/json" \
  -d '{}'

# Test capacity
kubectl run test-capacity --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl -X POST http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/mcp/v1/tools/get_capacity \
  -H "Content-Type: application/json" \
  -d '{}'
```

### View Logs

```bash
# Follow logs
kubectl logs -n cortex-system -l app=cortex-resource-manager -f

# Get recent logs
kubectl logs -n cortex-system -l app=cortex-resource-manager --tail=100

# Get logs from specific pod
POD_NAME=$(kubectl get pods -n cortex-system -l app=cortex-resource-manager -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n cortex-system $POD_NAME
```

## API Reference

The cortex-resource-manager provides 16 MCP tools:

### Resource Allocation APIs (5 tools)

```bash
# List all allocations
POST /mcp/v1/tools/list_allocations

# Request resources
POST /mcp/v1/tools/request_resources
{
  "job_id": "job-001",
  "mcp_servers": ["n8n", "proxmox"],
  "workers": 2,
  "cpu": 4.0,
  "memory": 8192
}

# Release resources
POST /mcp/v1/tools/release_resources
{
  "allocation_id": "alloc-12345"
}

# Get allocation details
POST /mcp/v1/tools/get_allocation
{
  "allocation_id": "alloc-12345"
}

# Get cluster capacity
POST /mcp/v1/tools/get_capacity
```

### MCP Server Lifecycle APIs (5 tools)

```bash
# List MCP servers
POST /mcp/v1/tools/list_mcp_servers

# Get MCP server status
POST /mcp/v1/tools/get_mcp_status
{
  "server_name": "n8n-mcp-server"
}

# Start MCP server
POST /mcp/v1/tools/start_mcp
{
  "server_name": "n8n-mcp-server"
}

# Stop MCP server
POST /mcp/v1/tools/stop_mcp
{
  "server_name": "n8n-mcp-server"
}

# Scale MCP server
POST /mcp/v1/tools/scale_mcp
{
  "server_name": "n8n-mcp-server",
  "replicas": 3
}
```

### Worker Management APIs (6 tools)

```bash
# List workers
POST /mcp/v1/tools/list_workers
{
  "worker_type": "burst"  # Optional: "permanent" or "burst"
}

# Provision burst workers
POST /mcp/v1/tools/provision_workers
{
  "count": 2,
  "size": "medium",
  "ttl_hours": 1
}

# Drain worker
POST /mcp/v1/tools/drain_worker
{
  "worker_name": "cortex-worker-001"
}

# Destroy worker
POST /mcp/v1/tools/destroy_worker
{
  "worker_name": "cortex-worker-burst-001"
}

# Get worker details
POST /mcp/v1/tools/get_worker_details
{
  "worker_name": "cortex-worker-001"
}

# Get worker capacity
POST /mcp/v1/tools/get_worker_capacity
{
  "worker_name": "cortex-worker-001"
}
```

## Troubleshooting

### Pod not starting

```bash
# Check pod status
kubectl describe pod -n cortex-system -l app=cortex-resource-manager

# Check events
kubectl get events -n cortex-system --sort-by='.lastTimestamp' | grep cortex-resource-manager

# Check logs
kubectl logs -n cortex-system -l app=cortex-resource-manager
```

### Image pull errors

The deployment uses `ghcr.io/ry-ops/cortex-resource-manager:latest`. Ensure:
1. K3s cluster can reach ghcr.io
2. Image is public or image pull secrets are configured
3. Network policies allow egress to ghcr.io

### RBAC errors

```bash
# Check ServiceAccount
kubectl get serviceaccount cortex-resource-manager -n cortex-system -o yaml

# Check ClusterRole
kubectl get clusterrole cortex-resource-manager -o yaml

# Check ClusterRoleBinding
kubectl get clusterrolebinding cortex-resource-manager -o yaml
```

### Service not accessible

```bash
# Check service
kubectl get svc cortex-resource-manager -n cortex-system

# Check endpoints
kubectl get endpoints cortex-resource-manager -n cortex-system

# Test from another pod
kubectl run test-curl --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl -v http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health
```

### Health check failures

```bash
# Check liveness probe
kubectl get pod -n cortex-system -l app=cortex-resource-manager -o yaml | grep -A 10 livenessProbe

# Check readiness probe
kubectl get pod -n cortex-system -l app=cortex-resource-manager -o yaml | grep -A 10 readinessProbe

# Manual health check
kubectl exec -n cortex-system -it $(kubectl get pods -n cortex-system -l app=cortex-resource-manager -o jsonpath='{.items[0].metadata.name}') -- \
  wget -O- http://localhost:8080/health
```

## Monitoring

### Prometheus Integration

If Prometheus Operator is installed:

```bash
# Check ServiceMonitor
kubectl get servicemonitor cortex-resource-manager -n cortex-system

# Access metrics
kubectl run test-metrics --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://cortex-resource-manager.cortex-system.svc.cluster.local:9090/metrics
```

### Grafana Dashboard

Create a Grafana dashboard to monitor:
- Active resource allocations
- MCP server status
- Worker provisioning/destruction events
- API response times
- Resource utilization

## Scaling

### Vertical Scaling

To increase resource limits:

```bash
# Edit deployment
kubectl edit deployment cortex-resource-manager -n cortex-system

# Or update deployment.yaml and reapply
kubectl apply -f k8s/services/resource-manager/deployment.yaml
```

### Horizontal Scaling

To run multiple replicas:

```bash
# Scale deployment
kubectl scale deployment cortex-resource-manager -n cortex-system --replicas=2

# Or edit deployment
kubectl edit deployment cortex-resource-manager -n cortex-system
```

**Note**: Ensure resource allocation state is handled correctly with multiple replicas (currently uses in-memory state).

## Rollback

### Rollback to previous version

```bash
# View rollout history
kubectl rollout history deployment/cortex-resource-manager -n cortex-system

# Rollback to previous revision
kubectl rollout undo deployment/cortex-resource-manager -n cortex-system

# Rollback to specific revision
kubectl rollout undo deployment/cortex-resource-manager -n cortex-system --to-revision=2
```

## Uninstall

```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/services/resource-manager

kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f servicemonitor.yaml
kubectl delete -f configmap.yaml
kubectl delete -f serviceaccount.yaml

# Optional: Delete namespace (if no other resources exist)
kubectl delete -f namespace.yaml
```

## Integration with Cortex

### MCP Server Configuration

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cortex-resource-manager": {
      "command": "kubectl",
      "args": [
        "proxy",
        "--port=8080"
      ],
      "env": {
        "KUBECONFIG": "/Users/ryandahlberg/.kube/k3s-cortex-config.yaml"
      }
    }
  }
}
```

Then access via: `http://localhost:8080/api/v1/namespaces/cortex-system/services/cortex-resource-manager:8080/proxy/`

### Cortex Master Integration

Update cortex masters to use resource-manager API for:
1. **Job scheduling**: Request resources before spawning workers
2. **MCP lifecycle**: Start/stop MCP servers on demand
3. **Worker provisioning**: Create burst workers for high load
4. **Capacity planning**: Query cluster capacity before task assignment

## Next Steps

1. **Deploy to K3s cluster** using Option 1 (package transfer)
2. **Run test suite** to verify all APIs
3. **Integrate with cortex masters** for resource orchestration
4. **Set up monitoring** with Prometheus/Grafana
5. **Document worker provisioning** workflows

## References

- **Repository**: https://github.com/ry-ops/cortex-resource-manager
- **Main Cortex Repo**: https://github.com/ry-ops/cortex
- **MCP Protocol**: https://modelcontextprotocol.io/
- **K3s Documentation**: https://docs.k3s.io/

## Support

For issues or questions:
1. Check pod logs: `kubectl logs -n cortex-system -l app=cortex-resource-manager`
2. Run test suite: `./scripts/testing/test-resource-manager.sh`
3. Review GitHub issues: https://github.com/ry-ops/cortex-resource-manager/issues
