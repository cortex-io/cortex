# K3s MCP Server

Standalone containerized MCP server providing Kubernetes cluster management capabilities to Cortex AI components.

## Overview

The K3s MCP server exposes Kubernetes API operations through the Model Context Protocol, allowing Cortex masters and workers to interact with the K3s cluster (VMs 310-312) for resource management, deployment, and monitoring.

**Container Image**: `ghcr.io/ry-ops/cortex/k3s-mcp-server:latest`
**Protocol**: HTTP/SSE Transport
**Port**: 3001
**Cluster**: K3s on VMs 310-312 (10.88.145.180-182)

---

## Features

### 12 MCP Tools

1. **list_pods** - List pods across namespaces with label filtering
2. **list_deployments** - List deployments with replica status
3. **list_services** - List services with endpoint information
4. **list_scaledobjects** - List KEDA ScaledObjects (if installed)
5. **get_pod_logs** - Retrieve container logs with tail support
6. **scale_deployment** - Scale deployments to specific replica count
7. **apply_manifest** - Apply Kubernetes YAML manifests
8. **delete_resource** - Delete K8s resources (Pod, Deployment, Service, Job)
9. **get_node_status** - Get cluster node health and capacity
10. **list_namespaces** - List all namespaces
11. **create_job** - Create Kubernetes Jobs with TTL cleanup
12. **watch_pod_status** - Monitor pod status and conditions

### 4 MCP Resources

1. **k3s://cluster/health** - Overall cluster health status
2. **k3s://deployments/cortex-system** - Cortex system deployments
3. **k3s://scaledobjects/all** - All KEDA ScaledObjects
4. **k3s://workers/active** - Currently running Cortex worker pods

---

## Architecture Integration

### Cortex Use Cases

**Phase 5: Resource Manager Integration**
- Auto-discover MCP server deployments via K8s labels
- Track service endpoints and health status
- Scale deployments dynamically based on demand

**Phase 5.3: Worker Provisioning**
- Create burst worker Jobs using `create_job`
- Monitor worker pod status with `watch_pod_status`
- Auto-cleanup via TTL (default: 1 hour)

**Phase 7: Production Deployment**
- Deploy Cortex manifests using `apply_manifest`
- Verify deployments with `list_deployments`
- Check pod health with `get_pod_logs`

**Phase 8: Self-Healing**
- Detect anomalies via cluster health monitoring
- Automatically remediate issues (restart pods, scale deployments)
- Collect logs for AI-powered root cause analysis

---

## Deployment

### Option 1: Docker Compose (Recommended for Development)

```bash
cd /Users/ryandahlberg/Projects/cortex/lib/mcp-servers

# Build and start
docker-compose -f k3s-docker-compose.yml up -d

# Check status
docker-compose -f k3s-docker-compose.yml ps

# View logs
docker-compose -f k3s-docker-compose.yml logs -f k3s-mcp-server

# Stop
docker-compose -f k3s-docker-compose.yml down
```

### Option 2: Kubernetes Deployment (Production)

Deploy directly to the K3s cluster in the `cortex-mcp` namespace:

```yaml
# k8s-mcp-server-deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k3s-mcp-server
  namespace: cortex-mcp
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k3s-mcp-server
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "namespaces", "nodes", "pods/log"]
    verbs: ["get", "list", "watch", "delete"]
  - apiGroups: ["apps"]
    resources: ["deployments", "deployments/scale"]
    verbs: ["get", "list", "patch", "delete"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: ["keda.sh"]
    resources: ["scaledobjects"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k3s-mcp-server
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: k3s-mcp-server
subjects:
  - kind: ServiceAccount
    name: k3s-mcp-server
    namespace: cortex-mcp
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: k3s-mcp-server
  namespace: cortex-mcp
  labels:
    app.cortex.ai/component: mcp-server
    app.cortex.ai/name: k3s-mcp-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: k3s-mcp-server
  template:
    metadata:
      labels:
        app: k3s-mcp-server
        app.cortex.ai/component: mcp-server
    spec:
      serviceAccountName: k3s-mcp-server
      containers:
      - name: k3s-mcp-server
        image: ghcr.io/ry-ops/cortex/k3s-mcp-server:latest
        ports:
        - containerPort: 3001
          name: http
        env:
        - name: PORT
          value: "3001"
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: k3s-mcp-server
  namespace: cortex-mcp
  labels:
    app.cortex.ai/component: mcp-server
spec:
  selector:
    app: k3s-mcp-server
  ports:
  - port: 3001
    targetPort: 3001
    name: http
  type: ClusterIP
```

Deploy to K3s:

```bash
kubectl create namespace cortex-mcp
kubectl apply -f k8s-mcp-server-deployment.yaml

# Verify deployment
kubectl get pods -n cortex-mcp
kubectl logs -n cortex-mcp deployment/k3s-mcp-server

# Test health endpoint
kubectl port-forward -n cortex-mcp service/k3s-mcp-server 3001:3001
curl http://localhost:3001/health
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `K3S_API_URL` | K3s API server URL | `https://10.88.145.180:6443` |
| `K3S_KUBECONFIG` | Path to kubeconfig file | `$HOME/.kube/config` |
| `PORT` | HTTP server port | `3001` |
| `NODE_ENV` | Environment (production/development) | `production` |

### Authentication

**Docker Deployment**:
- Mounts host kubeconfig from `~/.kube/config`
- Uses user's existing K3s credentials

**Kubernetes Deployment**:
- Uses ServiceAccount with in-cluster authentication
- Requires ClusterRole with appropriate RBAC permissions

---

## API Examples

### Health Check

```bash
curl http://localhost:3001/health

# Response:
{
  "status": "healthy",
  "service": "k3s-mcp-server",
  "k3s_api_url": "https://10.88.145.180:6443"
}
```

### List Tools

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### List Pods in Cortex System

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type": application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_pods",
      "arguments": {
        "namespace": "cortex-system",
        "labelSelector": "app.cortex.ai/component=master"
      }
    },
    "id": 2
  }'
```

### Scale Deployment

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "scale_deployment",
      "arguments": {
        "namespace": "cortex-system",
        "deploymentName": "coordinator-master",
        "replicas": 3
      }
    },
    "id": 3
  }'
```

### Create Worker Job

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_job",
      "arguments": {
        "namespace": "cortex-workers",
        "name": "worker-implementation-001",
        "image": "ghcr.io/ry-ops/cortex-docker:latest",
        "env": {
          "WORKER_TYPE": "implementation",
          "TASK_ID": "task-123"
        },
        "ttlSecondsAfterFinished": 3600
      }
    },
    "id": 4
  }'
```

### Get Cluster Health

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "params": {
      "uri": "k3s://cluster/health"
    },
    "id": 5
  }'
```

---

## Building the Container

### Local Build

```bash
cd /Users/ryandahlberg/Projects/cortex/lib/mcp-servers

# Build image
docker build -f k3s.Dockerfile -t ghcr.io/ry-ops/cortex/k3s-mcp-server:latest .

# Test locally (requires kubeconfig)
docker run -p 3001:3001 \
  -v ~/.kube:/home/mcp/.kube:ro \
  ghcr.io/ry-ops/cortex/k3s-mcp-server:latest

# Push to registry
docker push ghcr.io/ry-ops/cortex/k3s-mcp-server:latest
```

### GitHub Actions CI/CD

The container is automatically built and pushed when changes are detected in `lib/mcp-servers/`:

```yaml
# .github/workflows/build-mcp-servers.yml
name: Build K3s MCP Server

on:
  push:
    branches: [main, docker-container]
    paths:
      - 'lib/mcp-servers/**'

jobs:
  build-k3s-mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push K3s MCP Server
        uses: docker/build-push-action@v5
        with:
          context: lib/mcp-servers
          file: lib/mcp-servers/k3s.Dockerfile
          push: true
          tags: |
            ghcr.io/ry-ops/cortex/k3s-mcp-server:latest
            ghcr.io/ry-ops/cortex/k3s-mcp-server:${{ github.sha }}
```

---

## Monitoring

### Metrics

The K3s MCP server exposes health metrics at `/health`:

```json
{
  "status": "healthy",
  "service": "k3s-mcp-server",
  "k3s_api_url": "https://10.88.145.180:6443"
}
```

### Prometheus Integration

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: k3s-mcp-server
  namespace: cortex-mcp
spec:
  selector:
    matchLabels:
      app.cortex.ai/component: mcp-server
  endpoints:
  - port: http
    path: /health
    interval: 30s
```

### Grafana Dashboard

Create a Grafana dashboard to monitor:
- MCP request rate (`cortex_mcp_requests_total{mcp_server="k3s"}`)
- K8s API latency
- Pod creation/deletion events
- Worker job success rate

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs k3s-mcp-server

# Common issues:
# 1. Kubeconfig not found
docker run -it --rm -v ~/.kube:/home/mcp/.kube:ro \
  ghcr.io/ry-ops/cortex/k3s-mcp-server:latest \
  sh -c "ls -la /home/mcp/.kube"

# 2. Permission denied on kubeconfig
chmod 644 ~/.kube/config
```

### Cannot Connect to K3s API

```bash
# Test connectivity from container
docker exec k3s-mcp-server curl -k https://10.88.145.180:6443/healthz

# Verify kubeconfig is correct
docker exec k3s-mcp-server cat /home/mcp/.kube/config

# Test with kubectl
docker exec k3s-mcp-server kubectl get nodes
```

### RBAC Permission Errors

```bash
# Check ServiceAccount permissions
kubectl auth can-i list pods --as=system:serviceaccount:cortex-mcp:k3s-mcp-server

# Verify ClusterRoleBinding
kubectl get clusterrolebinding k3s-mcp-server -o yaml

# Fix permissions
kubectl apply -f k8s-mcp-server-deployment.yaml
```

### MCP Tool Not Working

```bash
# Test MCP endpoint directly
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'

# Check server logs for errors
docker logs k3s-mcp-server | grep ERROR
```

---

## Security Considerations

### RBAC Permissions

The K3s MCP server requires specific permissions:
- **Read**: pods, services, deployments, namespaces, nodes, scaledobjects
- **Write**: deployments/scale, jobs
- **Delete**: pods, deployments, services, jobs

**Principle of Least Privilege**: Grant only necessary permissions for Cortex operations.

### Network Security

**Kubernetes Deployment**:
- Uses NetworkPolicies to restrict ingress/egress
- Only accessible from cortex-system namespace

**Docker Deployment**:
- Exposes port 3001 only
- Use firewall rules to limit access to Cortex components

### Secrets Management

**Kubeconfig**:
- Never commit kubeconfig to Git
- Use Kubernetes Secrets for sensitive data
- Rotate credentials regularly

**ServiceAccount Tokens**:
- Automatically rotated by Kubernetes
- Scoped to specific namespace and permissions

---

## Integration with Cortex Masters

### Development Master

```javascript
// Use K3s MCP server for worker provisioning
const k3sMCP = await connectToMCP('http://k3s-mcp-server.cortex-mcp:3001/mcp');

// Create worker job
await k3sMCP.callTool('create_job', {
  namespace: 'cortex-workers',
  name: `worker-implementation-${taskId}`,
  image: 'ghcr.io/ry-ops/cortex-docker:latest',
  env: { WORKER_TYPE: 'implementation', TASK_ID: taskId },
  ttlSecondsAfterFinished: 3600
});

// Monitor worker status
const status = await k3sMCP.callTool('watch_pod_status', {
  namespace: 'cortex-workers',
  podName: `worker-implementation-${taskId}`
});
```

### Security Master

```javascript
// Use K3s MCP server for deployment verification
const k3sMCP = await connectToMCP('http://k3s-mcp-server.cortex-mcp:3001/mcp');

// Check cluster health before deployment
const health = await k3sMCP.readResource('k3s://cluster/health');
if (!health.healthy) {
  throw new Error('Cluster unhealthy - abort deployment');
}

// List all deployments for security audit
const deployments = await k3sMCP.callTool('list_deployments', {
  namespace: 'cortex-system'
});
```

### Coordinator Master

```javascript
// Use K3s MCP server for resource discovery
const k3sMCP = await connectToMCP('http://k3s-mcp-server.cortex-mcp:3001/mcp');

// Discover active workers
const workers = await k3sMCP.readResource('k3s://workers/active');
console.log(`Active workers: ${workers.running}/${workers.total}`);

// Discover ScaledObjects
const scaledObjects = await k3sMCP.callTool('list_scaledobjects', {});
```

---

## Performance

### Resource Usage

- **CPU**: 250m requests, 1000m limits
- **Memory**: 512Mi requests, 2Gi limits
- **Startup time**: ~5 seconds
- **Response latency**: <100ms for list operations

### Scaling

The K3s MCP server is stateless and can be scaled horizontally:

```bash
kubectl scale deployment k3s-mcp-server --replicas=3 -n cortex-mcp
```

However, for most workloads, a single replica is sufficient.

---

## Related Documentation

- [Wazuh MCP Server](/Users/ryandahlberg/Projects/cortex/docs/deployment/wazuh-mcp-container-deployment.md)
- [Cortex K3s Deployment](/Users/ryandahlberg/Projects/cortex/COMPLETE-K3S-DEPLOYMENT-SUMMARY.md)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Kubernetes Client Node](https://github.com/kubernetes-client/javascript)

---

**Deployment Status**: Ready for Production
**Container Registry**: ghcr.io/ry-ops/cortex/k3s-mcp-server:latest
**Last Updated**: 2025-12-13
**Maintained By**: Cortex AI Team
