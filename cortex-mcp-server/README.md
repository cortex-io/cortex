# Cortex MCP Server

Complete Model Context Protocol (MCP) server that exposes the entire Cortex construction company as a unified interface for AI agents.

## Overview

The Cortex MCP Server provides 6 tiers of capabilities:

- **Tier 1**: Simple queries (UniFi, Proxmox, Wazuh, k8s)
- **Tier 2**: Infrastructure management (VMs, containers, pods)
- **Tier 3**: Worker swarms (1-10,000 workers)
- **Tier 4**: Master coordination (Development, Security, Infrastructure, CICD)
- **Tier 5**: Full project builds (e.g., "build 50 microservices in 4 hours")
- **Tier 6**: Monitoring & control (status, pause/resume/cancel operations)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cortex MCP Server                        │
│                    (Port 3000: MCP)                         │
│                    (Port 8080: Status)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼────────┐     ┌───────▼────────┐
        │  MoE Router    │     │  MCP Protocol  │
        │  (Pre-route)   │     │  (JSON-RPC)    │
        └───────┬────────┘     └───────┬────────┘
                │                      │
    ┌───────────┴──────────────────────┴────────────┐
    │              Tool Dispatcher                   │
    └───────┬──────────────────┬────────────────────┘
            │                  │
    ┌───────▼────────┐  ┌──────▼─────────────────┐
    │  Infrastructure│  │  Worker/Master Layer   │
    │  Clients       │  │                        │
    │  (Tier 1-2)    │  │  (Tier 3-6)            │
    └────────────────┘  └────────────────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production mode
npm start
```

## Docker Deployment

```bash
# Build Docker image
npm run docker:build

# Run locally
npm run docker:run

# Or use docker-compose
docker-compose up -d
```

## Kubernetes Deployment

```bash
# Deploy to k8s cluster
kubectl apply -f k8s/cortex-mcp-server.yaml

# Check deployment
kubectl get pods -n cortex-system

# View logs
kubectl logs -n cortex-system -l app=cortex-mcp-server -f

# Port forward for testing
kubectl port-forward -n cortex-system svc/cortex-mcp-server 3000:3000 8080:8080
```

## MCP Tools

### Tier 1: cortex_query

Query Cortex infrastructure with intelligent routing.

**Example queries:**
```javascript
// UniFi queries
"Show all UniFi access points"
"List WiFi clients connected to the guest network"
"What is the status of AP-Office-1?"

// Proxmox queries
"List all Proxmox VMs"
"Show VM resource usage for node pve-01"
"What containers are running on Proxmox?"

// Wazuh queries
"Show recent security alerts"
"List critical vulnerabilities"
"What agents are offline?"

// Kubernetes queries
"Show all pods in cortex-system namespace"
"List deployments with their replica counts"
"What services are running in the cluster?"
```

**MCP Tool Call:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "cortex_query",
    "arguments": {
      "query": "Show all pods in cortex-system namespace",
      "target": "auto"
    }
  }
}
```

### Tier 2: cortex_manage_infrastructure

Manage infrastructure resources (VMs, containers, pods).

**Examples:**
```json
// Create a VM on Proxmox
{
  "name": "cortex_manage_infrastructure",
  "arguments": {
    "operation": "create_vm",
    "target_system": "proxmox",
    "params": {
      "vmid": 1001,
      "name": "test-vm",
      "cores": 2,
      "memory": 4096,
      "disk": "50G"
    }
  }
}

// Scale a k8s deployment
{
  "name": "cortex_manage_infrastructure",
  "arguments": {
    "operation": "scale_deployment",
    "target_system": "k8s",
    "params": {
      "deployment": "cortex-mcp-server",
      "replicas": 5,
      "namespace": "cortex-system"
    }
  }
}
```

### Tier 3: cortex_spawn_workers

Spawn 1 to 10,000 workers for parallel task execution.

**Examples:**
```json
// Spawn 10 implementation workers
{
  "name": "cortex_spawn_workers",
  "arguments": {
    "count": 10,
    "worker_type": "implementation",
    "swarm_type": "feature-development",
    "master": "development",
    "priority": "high"
  }
}

// Spawn 1000 security scan workers
{
  "name": "cortex_spawn_workers",
  "arguments": {
    "count": 1000,
    "worker_type": "scan",
    "swarm_type": "security-audit",
    "master": "security",
    "priority": "normal"
  }
}
```

### Tier 4: cortex_coordinate_masters

Coordinate master agents for task routing and delegation.

**Examples:**
```json
// Route a task to the best master
{
  "name": "cortex_coordinate_masters",
  "arguments": {
    "action": "route_task",
    "task_description": "Implement user authentication with OAuth2",
    "priority": "high"
  }
}

// List all available masters
{
  "name": "cortex_coordinate_masters",
  "arguments": {
    "action": "list_masters"
  }
}

// Get master status
{
  "name": "cortex_coordinate_masters",
  "arguments": {
    "action": "get_status",
    "master_id": "development"
  }
}
```

### Tier 5: cortex_build_project

Build complete projects with massive parallelization.

**Examples:**
```json
// Build 50 microservices
{
  "name": "cortex_build_project",
  "arguments": {
    "project_description": "Build 50 REST API microservices with Node.js, Express, and PostgreSQL",
    "target_count": 50,
    "time_limit": "4 hours",
    "requirements": {
      "technologies": ["nodejs", "express", "postgresql"],
      "patterns": ["REST", "OpenAPI"],
      "quality": {
        "test_coverage": 80,
        "documentation": true
      }
    }
  }
}

// Build documentation site
{
  "name": "cortex_build_project",
  "arguments": {
    "project_description": "Build comprehensive documentation site with tutorials and API references",
    "target_count": 1,
    "time_limit": "2 hours",
    "requirements": {
      "framework": "docusaurus",
      "features": ["search", "versioning", "dark-mode"]
    }
  }
}
```

### Tier 6: cortex_get_status

Get comprehensive system status.

**Examples:**
```json
// Get all system status
{
  "name": "cortex_get_status",
  "arguments": {
    "scope": "all",
    "details": true
  }
}

// Get worker status only
{
  "name": "cortex_get_status",
  "arguments": {
    "scope": "workers",
    "details": false
  }
}
```

### Tier 6: cortex_control

Control system operations (pause/resume/cancel).

**Examples:**
```json
// Pause all workers
{
  "name": "cortex_control",
  "arguments": {
    "operation": "pause",
    "target": "workers",
    "reason": "Emergency maintenance"
  }
}

// Resume operations
{
  "name": "cortex_control",
  "arguments": {
    "operation": "resume",
    "target": "all",
    "reason": "Maintenance complete"
  }
}

// Cancel specific operation
{
  "name": "cortex_control",
  "arguments": {
    "operation": "cancel",
    "target": "specific",
    "target_id": "swarm-1234567890",
    "reason": "Requirements changed"
  }
}
```

## Status HTTP Endpoints

The server provides HTTP endpoints for monitoring:

```bash
# Health check
curl http://localhost:8080/health

# Comprehensive status
curl http://localhost:8080/status

# MoE routing statistics
curl http://localhost:8080/routing
```

## MoE (Mixture of Experts) Router

The integrated MoE router intelligently routes queries to the correct backend:

**Routing Examples:**
- "Show all UniFi access points" → UniFi client (confidence: 1.0)
- "List Proxmox VMs" → Proxmox client (confidence: 1.0)
- "Get Wazuh security alerts" → Wazuh client (confidence: 1.0)
- "Show k8s pods" → Kubernetes client (confidence: 1.0)

**Routing Tiers:**
- Tier 1 (Infrastructure): UniFi, Proxmox, Wazuh, k8s
- Tier 2 (Management): Infrastructure operations
- Tier 3 (Workers): Worker swarm spawning
- Tier 4 (Masters): Master coordination
- Tier 5 (Projects): Full project builds
- Tier 6 (Control): Monitoring and control

## Environment Variables

```bash
# Core configuration
CORTEX_HOME=/Users/ryandahlberg/Projects/cortex
STATUS_PORT=8080
NODE_ENV=production

# MCP server endpoints
UNIFI_MCP_SERVER=http://unifi-mcp-server.cortex-system.svc.cluster.local:3000
PROXMOX_MCP_SERVER=http://proxmox-mcp-server.cortex-system.svc.cluster.local:3000
WAZUH_MCP_SERVER=http://wazuh-mcp-server.cortex-system.svc.cluster.local:8080
```

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Check health
npm run health

# View status
npm run status

# View routing stats
npm run routing
```

## Integration with Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/path/to/cortex-mcp-server/src/index.js"],
      "env": {
        "CORTEX_HOME": "/Users/ryandahlberg/Projects/cortex",
        "STATUS_PORT": "8080"
      }
    }
  }
}
```

## Examples: Real-World Usage

### Example 1: Infrastructure Audit

```javascript
// Query all systems
await cortex_query({ query: "Show all UniFi devices" });
await cortex_query({ query: "List all Proxmox VMs with resource usage" });
await cortex_query({ query: "Get Wazuh critical alerts from last 24 hours" });
await cortex_query({ query: "Show all k8s pods with their status" });
```

### Example 2: Microservice Build Pipeline

```javascript
// Build 50 microservices in parallel
await cortex_build_project({
  project_description: "Build 50 REST API microservices",
  target_count: 50,
  time_limit: "4 hours",
  requirements: {
    technologies: ["nodejs", "express", "postgresql"],
    patterns: ["REST", "OpenAPI"],
    quality: { test_coverage: 80 }
  }
});

// Monitor progress
await cortex_get_status({ scope: "workers", details: true });
```

### Example 3: Security Audit at Scale

```javascript
// Spawn 1000 security scanners
await cortex_spawn_workers({
  count: 1000,
  worker_type: "scan",
  swarm_type: "infrastructure-audit",
  master: "security",
  priority: "high"
});

// Get security alerts
await cortex_query({ query: "Show all Wazuh vulnerabilities" });

// Monitor scan progress
await cortex_get_status({ scope: "workers" });
```

### Example 4: Infrastructure Scaling

```javascript
// Scale up for high load
await cortex_manage_infrastructure({
  operation: "scale_deployment",
  target_system: "k8s",
  params: {
    deployment: "api-gateway",
    replicas: 20,
    namespace: "production"
  }
});

// Create new VMs for capacity
await cortex_manage_infrastructure({
  operation: "create_vm",
  target_system: "proxmox",
  params: {
    vmid: 2001,
    name: "worker-node-01",
    cores: 8,
    memory: 16384
  }
});
```

## Troubleshooting

### Check Server Health

```bash
curl http://localhost:8080/health
```

### View Logs

```bash
# Docker
docker logs cortex-mcp-server

# Kubernetes
kubectl logs -n cortex-system -l app=cortex-mcp-server -f
```

### Common Issues

1. **Connection refused to infrastructure servers**
   - Verify MCP server endpoints are correct
   - Check network connectivity
   - Ensure servers are running

2. **Worker spawn failures**
   - Check worker pool capacity
   - Verify spawn-worker.sh script exists
   - Check file permissions

3. **Master coordination errors**
   - Verify master manifests are loaded
   - Check handoff directory permissions
   - Ensure task queue is accessible

## Performance

- **Query latency**: < 100ms (infrastructure queries)
- **Worker spawn rate**: 100-200 workers/second
- **Concurrent operations**: Supports 1000+ concurrent workers
- **Scalability**: Horizontal scaling via k8s HPA

## Security

- Runs as non-root user (UID 1001)
- RBAC-enabled for k8s operations
- Secret management via k8s Secrets
- Network policies for isolation

## License

UNLICENSED - Cortex Holdings Private

## Support

For issues and questions, contact the Cortex infrastructure team.

---

**Built by Larry, the Coordinator Master**
**Version 1.0.0**
**2025-12-24**
