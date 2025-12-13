# Kubernetes API Integration

## Overview

The Cortex K8s API Integration connects the Resource Manager to a live K3s cluster via the K3s MCP Server, enabling dynamic resource management, service discovery, and health monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cortex Masters                                │
│  (Development, Security, CI/CD, Inventory)                       │
└────────────────────┬────────────────────────────────────────────┘
                     │ Use K8s tools via MCP
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│              Cortex MCP Server (Main)                            │
│  - K8s Tools (cortex_k8s_*)                                      │
│  - Proxies to K3s MCP Server                                     │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP/SSE
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│           K8s Resource Manager                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  K8s Client  │  │   Service    │  │    Health    │          │
│  │              │  │  Discovery   │  │   Monitor    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP/SSE (MCP Protocol)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│              K3s MCP Server (Container)                          │
│  - 12 K8s tools                                                  │
│  - 4 K8s resources                                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ Kubernetes API
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│           K3s Cluster (VMs 310-312)                              │
│  - 10.88.145.180:6443 (control plane)                            │
│  - 10.88.145.181:6443                                            │
│  - 10.88.145.182:6443                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. K8s Client (`lib/resource-manager/k8s-client.js`)

**Purpose**: Main client for interacting with K3s cluster via K3s MCP Server

**Features**:
- Connection management with retry logic (3 attempts, exponential backoff)
- Health checking and monitoring
- Graceful fallback if cluster unreachable
- Mock mode for development without live cluster
- Comprehensive K8s operations (pods, deployments, services, jobs, etc.)

**Usage**:
```javascript
const K8sResourceManager = require('./lib/resource-manager/k8s-client');

const k8sClient = new K8sResourceManager({
  mcpServerUrl: 'http://10.88.145.180:3001',
  mockMode: false,
  retryAttempts: 3,
  retryDelay: 1000
});

await k8sClient.initialize();

// List pods
const pods = await k8sClient.listPods('cortex-system', 'app=cortex');

// Scale deployment
await k8sClient.scaleDeployment('cortex-system', 'worker-deployment', 5);

// Get cluster health
const nodes = await k8sClient.getNodeStatus();
```

**Environment Variables**:
- `K3S_MCP_SERVER_URL`: URL of K3s MCP Server (default: `http://localhost:3001`)
- `MOCK_K8S`: Enable mock mode (`true`/`false`)

### 2. Service Discovery (`lib/resource-manager/service-discovery.js`)

**Purpose**: Auto-discovers MCP server deployments in K8s cluster

**Features**:
- Periodic discovery (every 60 seconds)
- Discovers services with label `app.cortex.ai/component=mcp-server`
- Automatic registry updates
- Service type inference from labels
- Capability mapping
- Stale service cleanup

**Usage**:
```javascript
const ServiceDiscovery = require('./lib/resource-manager/service-discovery');

const discovery = new ServiceDiscovery(k8sClient, {
  cortexHome: '/Users/ryandahlberg/Projects/cortex',
  discoveryInterval: 60000
});

await discovery.start();

// Get discovered services
const services = discovery.getDiscoveredServices();

// Get statistics
const stats = discovery.getStatistics();
```

**Registry Updates**:
- Automatically updates `/Users/ryandahlberg/Projects/cortex/coordination/mcp-server-registry.json`
- Adds K8s service metadata (cluster IP, ports, labels)
- Infers capabilities from server type
- Tracks discovery timestamps

### 3. Health Monitor (`lib/resource-manager/health-monitor.js`)

**Purpose**: Monitors pod readiness, liveness, and service health

**Features**:
- Periodic health checks (every 30 seconds)
- Multi-level monitoring: cluster, pods, deployments, services
- Health status logging to JSONL
- Degradation detection and alerting
- Failed check tracking with threshold
- Uptime statistics

**Usage**:
```javascript
const HealthMonitor = require('./lib/resource-manager/health-monitor');

const healthMonitor = new HealthMonitor(k8sClient, {
  cortexHome: '/Users/ryandahlberg/Projects/cortex',
  checkInterval: 30000,
  monitoredNamespaces: ['cortex-system', 'default']
});

await healthMonitor.start();

// Force health check
const health = await healthMonitor.forceCheck();

// Check specific service
const serviceHealth = await healthMonitor.checkServiceByName(
  'cortex-system',
  'k3s-mcp-server'
);
```

**Health Logging**:
- Logs to `/Users/ryandahlberg/Projects/cortex/coordination/observability/health-checks.jsonl`
- Alerts to `/Users/ryandahlberg/Projects/cortex/coordination/observability/alerts.jsonl`

### 4. K8s Tools for MCP Server (`mcp-server/tools/k8s-tools.js`)

**Purpose**: Exposes K8s operations as MCP tools for Cortex masters

**Available Tools**:

| Tool Name | Description |
|-----------|-------------|
| `cortex_k8s_list_pods` | List pods with optional filtering |
| `cortex_k8s_list_deployments` | List deployments |
| `cortex_k8s_scale_deployment` | Scale deployment replicas |
| `cortex_k8s_get_pod_logs` | Retrieve pod logs |
| `cortex_k8s_create_job` | Create Kubernetes Job |
| `cortex_k8s_get_cluster_health` | Get cluster health status |
| `cortex_k8s_discover_mcp_servers` | Discover MCP server deployments |
| `cortex_k8s_get_service_health` | Check service health |
| `cortex_k8s_watch_pod_status` | Get pod status details |
| `cortex_k8s_list_namespaces` | List all namespaces |
| `cortex_k8s_get_discovery_status` | Get discovery status |
| `cortex_k8s_get_health_status` | Get health monitoring status |

**Integration**:
```javascript
// Tools are automatically integrated into main MCP server
const { getToolDefinitions } = require('./mcp-server/tools');

const allTools = getToolDefinitions();
// Returns core tools + K8s tools
```

## Configuration

### K3s MCP Server

**Location**: `/Users/ryandahlberg/Projects/cortex/lib/mcp-servers/k3s-server-http.js`

**Environment Variables**:
```bash
K3S_API_URL=https://10.88.145.180:6443
K3S_KUBECONFIG=/Users/ryandahlberg/.kube/config
PORT=3001
```

**Start Server**:
```bash
cd /Users/ryandahlberg/Projects/cortex
node lib/mcp-servers/k3s-server-http.js
```

**Endpoints**:
- Health: `http://localhost:3001/health`
- MCP SSE: `http://localhost:3001/mcp`

### MCP Server Registry

**Location**: `/Users/ryandahlberg/Projects/cortex/coordination/mcp-server-registry.json`

**K3s Server Entry**:
```json
{
  "name": "k3s-mcp-server",
  "url": "http://k3s-mcp-server.cortex-system.svc.cluster.local:3001",
  "external_url": "http://10.88.145.180:3001",
  "type": "k3s",
  "namespace": "cortex-system",
  "transport": "sse",
  "status": "active",
  "capabilities": [
    "kubernetes_management",
    "pod_operations",
    "deployment_scaling",
    "job_creation",
    "log_retrieval",
    "resource_monitoring"
  ],
  "tools": [
    "list_pods",
    "list_deployments",
    "list_services",
    "list_scaledobjects",
    "get_pod_logs",
    "scale_deployment",
    "apply_manifest",
    "delete_resource",
    "get_node_status",
    "list_namespaces",
    "create_job",
    "watch_pod_status"
  ]
}
```

## Mock Mode for Development

When K3s cluster is unreachable, enable mock mode for testing:

```bash
export MOCK_K8S=true
export K3S_MCP_SERVER_URL=http://localhost:3001

# Run tests
node lib/resource-manager/test-k8s-client.js
```

**Mock Data**:
- 2 nodes (k3s-node-1, k3s-node-2)
- 3 namespaces (default, kube-system, cortex-system)
- 2 MCP servers (k3s-mcp-server, n8n-mcp-server)
- 3 pods in cortex-system
- 2 deployments

## Testing

**Run Test Suite**:
```bash
cd /Users/ryandahlberg/Projects/cortex
MOCK_K8S=true node lib/resource-manager/test-k8s-client.js
```

**Test Coverage**:
- K8s client initialization
- Health checking
- Namespace listing
- MCP server discovery
- Pod operations
- Deployment management
- Node status
- Service discovery lifecycle
- Health monitoring lifecycle

## Usage Examples

### Example 1: Discover MCP Servers in Cluster

```javascript
const K8sResourceManager = require('./lib/resource-manager/k8s-client');

const client = new K8sResourceManager();
await client.initialize();

const mcpServers = await client.discoverMCPServers('cortex-system');

console.log('Discovered MCP Servers:');
mcpServers.forEach(svc => {
  console.log(`- ${svc.name}: ${svc.clusterIP}:${svc.ports[0].port}`);
});
```

### Example 2: Monitor Service Health

```javascript
const HealthMonitor = require('./lib/resource-manager/health-monitor');

const monitor = new HealthMonitor(k8sClient);
await monitor.start();

// Check specific service
const health = await monitor.checkServiceByName(
  'cortex-system',
  'k3s-mcp-server'
);

if (health.healthy) {
  console.log(`${health.service} is healthy: ${health.ready_pods}/${health.total_pods} pods ready`);
} else {
  console.error(`${health.service} is unhealthy!`);
}
```

### Example 3: Scale Worker Deployment

```javascript
// Scale up workers for high load
await k8sClient.scaleDeployment(
  'cortex-system',
  'cortex-worker-deployment',
  10  // Scale to 10 replicas
);

// Later, scale down
await k8sClient.scaleDeployment(
  'cortex-system',
  'cortex-worker-deployment',
  3  // Scale to 3 replicas
);
```

### Example 4: Create Job for Worker Task

```javascript
await k8sClient.createJob(
  'cortex-system',
  'worker-feature-implementation',
  'ghcr.io/cortex-ai/worker:latest',
  ['node', 'worker.js'],
  {
    TASK_ID: 'task-abc123',
    WORKER_TYPE: 'feature-implementer',
    CORTEX_HOME: '/cortex'
  },
  3600  // TTL 1 hour after completion
);
```

## Error Handling

### Connection Failures

The K8s client implements retry logic with exponential backoff:

```javascript
// Attempt 1: Wait 1000ms
// Attempt 2: Wait 2000ms
// Attempt 3: Wait 4000ms
// Then fail with error
```

### Graceful Degradation

When K3s MCP Server is unreachable:
- Client operates in degraded mode
- Health checks fail gracefully
- Mock mode can be enabled
- Logs warnings instead of crashing

### Health Alerts

When services degrade:
1. Track failed health checks
2. Alert after threshold (default: 3 failures)
3. Log to `/Users/ryandahlberg/Projects/cortex/coordination/observability/alerts.jsonl`
4. Mark service unhealthy in registry

## Future Enhancements

1. **Auto-scaling Integration**: Connect health monitor to KEDA ScaledObjects
2. **Multi-cluster Support**: Manage multiple K3s clusters
3. **Advanced Metrics**: Prometheus metrics export
4. **Webhook Notifications**: Slack/email alerts for critical issues
5. **Resource Quotas**: Enforce resource limits per namespace
6. **Custom Resources**: Support for Cortex CRDs

## Files Created

| File | Purpose |
|------|---------|
| `/Users/ryandahlberg/Projects/cortex/lib/resource-manager/k8s-client.js` | K8s client with retry logic |
| `/Users/ryandahlberg/Projects/cortex/lib/resource-manager/service-discovery.js` | MCP server discovery |
| `/Users/ryandahlberg/Projects/cortex/lib/resource-manager/health-monitor.js` | Health monitoring |
| `/Users/ryandahlberg/Projects/cortex/mcp-server/tools/k8s-tools.js` | K8s MCP tools |
| `/Users/ryandahlberg/Projects/cortex/lib/resource-manager/test-k8s-client.js` | Test suite |
| `/Users/ryandahlberg/Projects/cortex/docs/k8s-integration.md` | This documentation |

## Troubleshooting

### K3s MCP Server Not Reachable

```bash
# Check if K3s MCP Server is running
curl http://10.88.145.180:3001/health

# Check K3s cluster
kubectl --kubeconfig ~/.kube/config get nodes

# Enable mock mode
export MOCK_K8S=true
```

### Service Discovery Not Finding MCP Servers

```bash
# Check K8s labels
kubectl get services -n cortex-system -l app.cortex.ai/component=mcp-server

# Manually trigger discovery
node -e "
const ServiceDiscovery = require('./lib/resource-manager/service-discovery');
const K8sResourceManager = require('./lib/resource-manager/k8s-client');
const client = new K8sResourceManager();
await client.initialize();
const discovery = new ServiceDiscovery(client);
await discovery.forceDiscovery();
"
```

### Health Checks Failing

```bash
# Check health logs
tail -f coordination/observability/health-checks.jsonl | jq

# Force health check
node -e "
const HealthMonitor = require('./lib/resource-manager/health-monitor');
const K8sResourceManager = require('./lib/resource-manager/k8s-client');
const client = new K8sResourceManager();
await client.initialize();
const monitor = new HealthMonitor(client);
const result = await monitor.checkHealth();
console.log(JSON.stringify(result, null, 2));
"
```

## Related Documentation

- [K3s MCP Server](../lib/mcp-servers/k3s-server-http.js)
- [MCP Server Registry](../coordination/mcp-server-registry.json)
- [K8s Deployment Guide](./k8s/README.md)
- [Resource Manager Architecture](./architecture/resource-manager.md)
