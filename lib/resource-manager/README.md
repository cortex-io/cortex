# Cortex K8s Resource Manager

## Overview

The K8s Resource Manager provides Kubernetes integration for Cortex, enabling dynamic resource management, service discovery, and health monitoring through the K3s MCP Server.

## Components

### K8s Client (`k8s-client.js`)
- Main client for K3s cluster operations
- Connection management with retry logic
- Mock mode for development
- Comprehensive K8s API coverage

### Service Discovery (`service-discovery.js`)
- Auto-discovers MCP server deployments
- Updates MCP server registry
- Tracks service endpoints and health
- Infers capabilities from labels

### Health Monitor (`health-monitor.js`)
- Monitors pod and service health
- Logs health status to JSONL
- Alerts on degradation
- Tracks uptime statistics

## Quick Start

```bash
# Install dependencies
npm install

# Run tests in mock mode
MOCK_K8S=true node test-k8s-client.js

# Use in production (requires K3s cluster)
export K3S_MCP_SERVER_URL=http://10.88.145.180:3001
node -e "
const K8sResourceManager = require('./k8s-client');
const client = new K8sResourceManager();
await client.initialize();
const pods = await client.listPods('cortex-system');
console.log('Pods:', pods);
"
```

## Architecture

```
Masters → MCP Tools → K8s Resource Manager → K3s MCP Server → K3s Cluster
```

## Features

- **12 K8s Operations**: Pods, deployments, services, jobs, logs, scaling
- **Auto-Discovery**: Finds MCP servers in cluster automatically
- **Health Monitoring**: Periodic health checks with alerting
- **Graceful Fallback**: Works in degraded mode if cluster unreachable
- **Mock Mode**: Test without live cluster
- **Retry Logic**: 3 attempts with exponential backoff

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `K3S_MCP_SERVER_URL` | K3s MCP Server URL | `http://localhost:3001` |
| `MOCK_K8S` | Enable mock mode | `false` |
| `CORTEX_HOME` | Cortex home directory | `process.cwd()` |

## Files

| File | Purpose |
|------|---------|
| `k8s-client.js` | K8s client implementation |
| `service-discovery.js` | Service discovery |
| `health-monitor.js` | Health monitoring |
| `test-k8s-client.js` | Test suite |
| `README.md` | This file |

## Testing

```bash
# Run full test suite
MOCK_K8S=true node test-k8s-client.js

# Test individual components
node -e "
const K8sResourceManager = require('./k8s-client');
const client = new K8sResourceManager({ mockMode: true });
await client.initialize();
const health = await client.checkHealth();
console.log(health);
"
```

## Integration

The K8s Resource Manager integrates with:
- **Cortex MCP Server**: Provides K8s tools (`cortex_k8s_*`)
- **K3s MCP Server**: Proxies to K3s cluster
- **MCP Server Registry**: Auto-updates with discovered services
- **Observability**: Logs health checks and alerts

## Documentation

See [/Users/ryandahlberg/Projects/cortex/docs/k8s-integration.md](../../docs/k8s-integration.md) for complete documentation.

## Troubleshooting

**K3s MCP Server unreachable**:
```bash
# Enable mock mode
export MOCK_K8S=true

# Check server health
curl http://10.88.145.180:3001/health
```

**Service discovery not working**:
```bash
# Check K8s labels
kubectl get services -l app.cortex.ai/component=mcp-server

# Force discovery
node -e "
const ServiceDiscovery = require('./service-discovery');
const K8sResourceManager = require('./k8s-client');
const client = new K8sResourceManager();
await client.initialize();
const discovery = new ServiceDiscovery(client);
await discovery.forceDiscovery();
"
```

## License

MIT
