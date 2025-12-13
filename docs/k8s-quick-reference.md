# K8s Integration Quick Reference

## Quick Start

### Initialize K8s Client
```javascript
const K8sResourceManager = require('./lib/resource-manager/k8s-client');
const client = new K8sResourceManager();
await client.initialize();
```

### Mock Mode (Development)
```bash
export MOCK_K8S=true
node lib/resource-manager/test-k8s-client.js
```

## Common Operations

### List Pods
```javascript
const pods = await client.listPods('cortex-system');
const workerPods = await client.listPods('cortex-system', 'app=worker');
```

### Scale Deployment
```javascript
await client.scaleDeployment('cortex-system', 'cortex-workers', 10);
```

### Get Pod Logs
```javascript
const logs = await client.getPodLogs('cortex-system', 'pod-name', null, 100);
console.log(logs.logs);
```

### Create Job
```javascript
await client.createJob(
  'cortex-system',
  'worker-task-123',
  'ghcr.io/cortex-ai/worker:latest',
  ['node', 'worker.js'],
  { TASK_ID: 'task-123' }
);
```

### Check Health
```javascript
const health = await client.checkHealth();
const nodes = await client.getNodeStatus();
```

## Service Discovery

### Start Discovery
```javascript
const ServiceDiscovery = require('./lib/resource-manager/service-discovery');
const discovery = new ServiceDiscovery(client);
await discovery.start();
```

### Get Discovered Services
```javascript
const services = discovery.getDiscoveredServices();
const stats = discovery.getStatistics();
```

## Health Monitoring

### Start Monitor
```javascript
const HealthMonitor = require('./lib/resource-manager/health-monitor');
const monitor = new HealthMonitor(client);
await monitor.start();
```

### Check Service Health
```javascript
const health = await monitor.checkServiceByName('cortex-system', 'k3s-mcp-server');
```

### Force Health Check
```javascript
const result = await monitor.forceCheck();
console.log(`Overall: ${result.overall_status}`);
```

## MCP Tools (for Masters)

### List Pods
```javascript
const pods = await mcp.callTool('cortex_k8s_list_pods', {
  namespace: 'cortex-system',
  label_selector: 'app=cortex'
});
```

### Scale Deployment
```javascript
await mcp.callTool('cortex_k8s_scale_deployment', {
  namespace: 'cortex-system',
  deployment_name: 'workers',
  replicas: 5
});
```

### Get Cluster Health
```javascript
const health = await mcp.callTool('cortex_k8s_get_cluster_health', {});
```

### Discover MCP Servers
```javascript
const servers = await mcp.callTool('cortex_k8s_discover_mcp_servers', {
  namespace: 'cortex-system'
});
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `K3S_MCP_SERVER_URL` | `http://localhost:3001` | K3s MCP Server URL |
| `MOCK_K8S` | `false` | Enable mock mode |
| `CORTEX_HOME` | `process.cwd()` | Cortex home directory |

## File Locations

| Path | Description |
|------|-------------|
| `lib/resource-manager/k8s-client.js` | K8s client |
| `lib/resource-manager/service-discovery.js` | Service discovery |
| `lib/resource-manager/health-monitor.js` | Health monitor |
| `mcp-server/tools/k8s-tools.js` | K8s MCP tools |
| `coordination/mcp-server-registry.json` | MCP server registry |
| `coordination/observability/health-checks.jsonl` | Health logs |
| `coordination/observability/alerts.jsonl` | Alert logs |

## Testing

```bash
# Run all tests
MOCK_K8S=true node lib/resource-manager/test-k8s-client.js

# Test individual component
node -e "
const K8sResourceManager = require('./lib/resource-manager/k8s-client');
const client = new K8sResourceManager({ mockMode: true });
await client.initialize();
console.log(await client.listNamespaces());
"
```

## Troubleshooting

### K3s MCP Server unreachable
```bash
# Check server
curl http://10.88.145.180:3001/health

# Enable mock mode
export MOCK_K8S=true
```

### Service discovery not finding servers
```bash
# Check labels
kubectl get services -l app.cortex.ai/component=mcp-server

# Force discovery
node -e "
const discovery = new ServiceDiscovery(client);
await discovery.forceDiscovery();
"
```

### Health checks failing
```bash
# View health logs
tail -f coordination/observability/health-checks.jsonl | jq

# View alerts
tail -f coordination/observability/alerts.jsonl | jq
```

## Architecture

```
Masters → MCP Tools → K8s Resource Manager → K3s MCP Server → K3s Cluster
```

## MCP Tools Available

1. `cortex_k8s_list_pods` - List pods
2. `cortex_k8s_list_deployments` - List deployments
3. `cortex_k8s_scale_deployment` - Scale deployment
4. `cortex_k8s_get_pod_logs` - Get logs
5. `cortex_k8s_create_job` - Create job
6. `cortex_k8s_get_cluster_health` - Cluster health
7. `cortex_k8s_discover_mcp_servers` - Discover servers
8. `cortex_k8s_get_service_health` - Service health
9. `cortex_k8s_watch_pod_status` - Pod status
10. `cortex_k8s_list_namespaces` - List namespaces
11. `cortex_k8s_get_discovery_status` - Discovery status
12. `cortex_k8s_get_health_status` - Health status

## Documentation

- Full docs: [docs/k8s-integration.md](./k8s-integration.md)
- Summary: [PHASE-5.1-K8S-INTEGRATION-SUMMARY.md](../PHASE-5.1-K8S-INTEGRATION-SUMMARY.md)
- Component README: [lib/resource-manager/README.md](../lib/resource-manager/README.md)
