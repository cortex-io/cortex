# Cortex Resource Manager

> Part of the [Cortex Ecosystem](https://github.com/ry-ops/cortex) - Multi-agent AI system for autonomous repository management

An MCP (Model Context Protocol) server for managing resource allocation, MCP server lifecycle, and Kubernetes workers in the Cortex automation system.

**Repository**: [ry-ops/cortex-resource-manager](https://github.com/ry-ops/cortex-resource-manager)
**Main Cortex Repository**: [ry-ops/cortex](https://github.com/ry-ops/cortex)

## Features

### Resource Allocation (Core Orchestration)
- Request resources for jobs (MCP servers + workers)
- Release resources after job completion
- Track allocations with unique IDs
- Get current cluster capacity
- Query allocation details
- Automatic TTL/expiry handling
- In-memory allocation tracking

### MCP Server Lifecycle Management
- List all registered MCP servers with status
- Get detailed status of individual MCP servers
- Start MCP servers (scale from 0 to 1)
- Stop MCP servers (scale to 0)
- Scale MCP servers horizontally (0-10 replicas)
- Automatic health checking and readiness waiting
- Graceful and forced shutdown options

### Worker Management
- List Kubernetes workers (permanent and burst) with filtering
- Provision burst workers with configurable TTL and size
- Drain workers gracefully before destruction
- Destroy burst workers safely with protection for permanent workers
- Get detailed worker information including resources and status
- Integration with Talos MCP and Proxmox MCP for VM provisioning

## Overview

The Cortex Resource Manager provides 16 tools organized into 3 categories.

This MCP server is part of Cortex's infrastructure division, enabling dynamic resource allocation across the multi-divisional organization. See the [Cortex Holdings Structure](https://github.com/ry-ops/cortex/blob/main/coordination/divisions/README.md) for more information about how Cortex operates as a multi-divisional automation system.

### Tool Categories

1. **Resource Allocation (5 tools)**: Core orchestration API for managing cortex job resources
   - `request_resources` - Request MCP servers and workers for a job
   - `release_resources` - Release allocated resources
   - `get_allocation` - Query allocation details
   - `get_capacity` - Check cluster capacity
   - `list_allocations` - List all active allocations

2. **MCP Server Lifecycle (5 tools)**: Manage MCP server deployments in Kubernetes
   - `list_mcp_servers` - List all MCP servers with status
   - `get_mcp_status` - Get detailed server status
   - `start_mcp` - Start an MCP server (scale to 1)
   - `stop_mcp` - Stop an MCP server (scale to 0)
   - `scale_mcp` - Scale MCP server horizontally (0-10 replicas)

3. **Worker Management (6 tools)**: Manage Kubernetes workers (permanent and burst)
   - `list_workers` - List all workers with filtering
   - `provision_workers` - Create burst workers with TTL
   - `drain_worker` - Gracefully drain a worker
   - `destroy_worker` - Safely destroy burst workers
   - `get_worker_details` - Get detailed worker information
   - `get_worker_capacity` - Check worker resource capacity

## Installation

```bash
# Install from PyPI (when published)
pip install cortex-resource-manager

# Or install from source
git clone https://github.com/ry-ops/cortex-resource-manager.git
cd cortex-resource-manager
pip install -r requirements.txt
pip install -e .
```

## Requirements

- Python 3.8+
- Kubernetes cluster access
- Properly configured kubeconfig or in-cluster service account

## Usage

### Resource Allocation Tools

The core orchestration API for cortex job management:

```python
from allocation_manager import AllocationManager

# Create manager
manager = AllocationManager(
    total_cpu=16.0,
    total_memory=32768,  # 32GB
    total_workers=10
)

# Request resources for a job
allocation = manager.request_resources(
    job_id="feature-dev-001",
    mcp_servers=["filesystem", "github", "database"],
    workers=4,
    priority="high",
    ttl_seconds=7200,
    metadata={"task_type": "feature_implementation"}
)

print(f"Allocation ID: {allocation['allocation_id']}")
print(f"MCP Servers: {allocation['mcp_servers']}")
print(f"Workers: {allocation['workers_allocated']}")

# Check cluster capacity
capacity = manager.get_capacity()
print(f"Available workers: {capacity['available_workers']}")
print(f"Available CPU: {capacity['available_cpu']}")

# Get allocation details
details = manager.get_allocation(allocation['allocation_id'])
print(f"State: {details['state']}")
print(f"Age: {details['timestamps']['age_seconds']}s")

# Release resources when done
result = manager.release_resources(allocation['allocation_id'])
print(f"Released {result['workers_released']} workers")
```

### MCP Server Lifecycle (Convenience Functions)

```python
from resource_manager_mcp_server import (
    list_mcp_servers,
    get_mcp_status,
    start_mcp,
    stop_mcp,
    scale_mcp
)

# List all MCP servers
servers = list_mcp_servers()
for server in servers:
    print(f"Server: {server['name']}, Status: {server['status']}, Replicas: {server['replicas']}")

# Get detailed status
status = get_mcp_status("example-mcp-server")
print(f"Status: {status['status']}")
print(f"Ready: {status['ready_replicas']}/{status['replicas']}")
print(f"Endpoints: {status['endpoints']}")

# Start a server (wait for ready)
result = start_mcp("example-mcp-server", wait_ready=True)
print(f"Started: {result['name']}, Status: {result['status']}")

# Scale a server
result = scale_mcp("example-mcp-server", replicas=3)
print(f"Scaled to {result['replicas']} replicas")

# Stop a server (graceful shutdown)
result = stop_mcp("example-mcp-server")
print(f"Stopped: {result['name']}")

# Force stop (immediate termination)
result = stop_mcp("example-mcp-server", force=True)
```

### Advanced Usage (Manager Class)

```python
from resource_manager_mcp_server import MCPLifecycleManager

# Create manager instance
manager = MCPLifecycleManager(
    namespace="production",
    kubeconfig_path="/path/to/kubeconfig"
)

# List servers with custom label selector
servers = manager.list_mcp_servers(
    label_selector="app.kubernetes.io/component=mcp-server,environment=prod"
)

# Start server without waiting
status = manager.start_mcp("my-mcp-server", wait_ready=False)

# Scale with custom timeout
status = manager.scale_mcp(
    "my-mcp-server",
    replicas=5,
    wait_ready=True,
    timeout=600  # 10 minutes
)
```

## API Reference

### list_mcp_servers()

List all registered MCP servers.

**Parameters:**
- `namespace` (str): Kubernetes namespace (default: "default")
- `label_selector` (str): Label selector to filter deployments (default: "app.kubernetes.io/component=mcp-server")

**Returns:**
List of dictionaries with:
- `name`: Server name
- `status`: Current status ("running", "stopped", "scaling", "pending")
- `replicas`: Desired replica count
- `ready_replicas`: Number of ready replicas
- `endpoints`: List of service endpoints

### get_mcp_status(name)

Get detailed status of one MCP server.

**Parameters:**
- `name` (str): MCP server name
- `namespace` (str): Kubernetes namespace (default: "default")

**Returns:**
Dictionary with:
- `name`: Server name
- `status`: Current status
- `replicas`: Desired replica count
- `ready_replicas`: Number of ready replicas
- `available_replicas`: Number of available replicas
- `updated_replicas`: Number of updated replicas
- `endpoints`: List of service endpoints
- `last_activity`: Timestamp of last deployment update
- `conditions`: List of deployment conditions

**Raises:**
- `ValueError`: If server not found

### start_mcp(name, wait_ready=True)

Start an MCP server by scaling from 0 to 1 replica.

**Parameters:**
- `name` (str): MCP server name
- `wait_ready` (bool): Wait for server to be ready (default: True)
- `timeout` (int): Maximum wait time in seconds (default: 300)
- `namespace` (str): Kubernetes namespace (default: "default")

**Returns:**
Dictionary with server status after starting

**Raises:**
- `ValueError`: If server not found
- `TimeoutError`: If wait_ready=True and server doesn't become ready

### stop_mcp(name, force=False)

Stop an MCP server by scaling to 0 replicas.

**Parameters:**
- `name` (str): MCP server name
- `force` (bool): Force immediate termination (default: False)
- `namespace` (str): Kubernetes namespace (default: "default")

**Returns:**
Dictionary with server status after stopping

**Raises:**
- `ValueError`: If server not found

### scale_mcp(name, replicas)

Scale an MCP server horizontally.

**Parameters:**
- `name` (str): MCP server name
- `replicas` (int): Desired replica count (0-10)
- `wait_ready` (bool): Wait for all replicas to be ready (default: False)
- `timeout` (int): Maximum wait time in seconds (default: 300)
- `namespace` (str): Kubernetes namespace (default: "default")

**Returns:**
Dictionary with server status after scaling

**Raises:**
- `ValueError`: If server not found or invalid replica count

### Worker Management Tools

#### list_workers(type_filter=None)

List all Kubernetes workers with their status, type, and resources.

**Parameters:**
- `type_filter` (str, optional): Filter by worker type ("permanent" or "burst")

**Returns:**
List of dictionaries with:
- `name`: Worker node name
- `status`: Worker status ("ready", "busy", "draining", "not_ready")
- `type`: Worker type ("permanent" or "burst")
- `resources`: Resource capacity and allocatable amounts
- `labels`: Node labels
- `annotations`: Node annotations
- `created`: Node creation timestamp
- `ttl_expires` (burst workers only): TTL expiration timestamp

**Example:**
```python
from worker_manager import WorkerManager

manager = WorkerManager()

# List all workers
all_workers = manager.list_workers()
print(f"Total workers: {len(all_workers)}")

# List only burst workers
burst_workers = manager.list_workers(type_filter="burst")
print(f"Burst workers: {len(burst_workers)}")

# List only permanent workers
permanent_workers = manager.list_workers(type_filter="permanent")
print(f"Permanent workers: {len(permanent_workers)}")
```

#### provision_workers(count, ttl, size="medium")

Create burst workers by provisioning VMs and joining them to the Kubernetes cluster.

**Parameters:**
- `count` (int): Number of workers to provision (1-10)
- `ttl` (int): Time-to-live in hours (1-168, max 1 week)
- `size` (str): Worker size ("small", "medium", or "large")
  - small: 2 CPU, 4GB RAM, 50GB disk
  - medium: 4 CPU, 8GB RAM, 100GB disk
  - large: 8 CPU, 16GB RAM, 200GB disk

**Returns:**
List of provisioned worker information dictionaries

**Raises:**
- `WorkerManagerError`: If provisioning fails or parameters are invalid

**Example:**
```python
# Provision 3 medium burst workers with 24-hour TTL
workers = manager.provision_workers(count=3, ttl=24, size="medium")

for worker in workers:
    print(f"Provisioned: {worker['name']}")
    print(f"  Status: {worker['status']}")
    print(f"  TTL: {worker['ttl_hours']} hours")
    print(f"  Resources: {worker['resources']}")
```

**Note:** This function integrates with Talos MCP or Proxmox MCP servers to create VMs. The VMs are automatically joined to the Kubernetes cluster and labeled as burst workers.

#### drain_worker(worker_id)

Gracefully drain a worker node by moving all pods to other nodes and marking it unschedulable.

**Parameters:**
- `worker_id` (str): Worker node name to drain

**Returns:**
Dictionary with drain operation status:
- `worker_id`: Worker node name
- `status`: Operation status ("draining")
- `message`: Status message
- `output`: kubectl drain command output

**Raises:**
- `WorkerManagerError`: If worker not found or drain fails

**Example:**
```python
# Drain a worker before destroying it
result = manager.drain_worker("burst-worker-1234567890-0")
print(f"Status: {result['status']}")
print(f"Message: {result['message']}")
```

**Note:** This operation may take several minutes as pods are gracefully terminated and rescheduled to other nodes. DaemonSets are ignored, and pods with emptyDir volumes are deleted.

#### destroy_worker(worker_id, force=False)

Destroy a burst worker by removing it from the cluster and deleting the VM.

**Parameters:**
- `worker_id` (str): Worker node name to destroy
- `force` (bool): Force destroy without draining first (not recommended, default: False)

**Returns:**
Dictionary with destroy operation status:
- `worker_id`: Worker node name
- `status`: Operation status ("destroyed" or "partial_destroy")
- `message`: Status message
- `removed_from_cluster`: Whether node was removed from cluster
- `vm_deleted`: Whether VM was deleted
- `error` (if failed): Error message

**Raises:**
- `WorkerManagerError`: If worker is permanent (SAFETY VIOLATION), not found, or not drained

**SAFETY FEATURES:**
- Only burst workers can be destroyed - attempting to destroy a permanent worker raises an error
- Requires worker to be drained first unless force=True
- Protected worker patterns prevent accidental deletion

**Example:**
```python
# Safe workflow: drain then destroy
worker_id = "burst-worker-1234567890-0"

# Step 1: Drain the worker
drain_result = manager.drain_worker(worker_id)
print(f"Drained: {drain_result['status']}")

# Step 2: Destroy the worker
destroy_result = manager.destroy_worker(worker_id)
print(f"Destroyed: {destroy_result['status']}")
print(f"Cluster removal: {destroy_result['removed_from_cluster']}")
print(f"VM deletion: {destroy_result['vm_deleted']}")

# Force destroy (not recommended - skips drain)
# destroy_result = manager.destroy_worker(worker_id, force=True)
```

**WARNING:** Never destroy permanent workers! The system prevents this, but always verify worker type before destroying.

#### get_worker_details(worker_id)

Get detailed information about a specific worker.

**Parameters:**
- `worker_id` (str): Worker node name

**Returns:**
Dictionary with detailed worker information:
- `name`: Worker node name
- `status`: Worker status
- `type`: Worker type
- `resources`: Capacity and allocatable resources
- `labels`: All node labels
- `annotations`: All node annotations
- `created`: Creation timestamp
- `conditions`: Node conditions (Ready, MemoryPressure, DiskPressure, etc.)
- `addresses`: Node IP addresses
- `ttl_expires` (burst workers only): TTL expiration timestamp

**Raises:**
- `WorkerManagerError`: If worker not found

**Example:**
```python
# Get detailed information about a worker
details = manager.get_worker_details("burst-worker-1234567890-0")

print(f"Worker: {details['name']}")
print(f"Type: {details['type']}")
print(f"Status: {details['status']}")

# Check resources
resources = details['resources']
print(f"CPU Capacity: {resources['capacity']['cpu']}")
print(f"Memory Capacity: {resources['capacity']['memory']}")

# Check conditions
for condition in details['conditions']:
    print(f"{condition['type']}: {condition['status']}")
```

## Kubernetes Setup

### Required Labels

MCP server deployments must have the label:
```yaml
labels:
  app.kubernetes.io/component: mcp-server
```

### Example Deployment

See `config/example-mcp-deployment.yaml` for a complete example.

Key requirements:
1. Deployment with `app.kubernetes.io/component: mcp-server` label
2. Service with matching selector
3. Health and readiness probes configured
4. Appropriate resource limits

### RBAC Permissions

The service account needs these permissions:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mcp-lifecycle-manager
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "patch", "update"]
- apiGroups: [""]
  resources: ["services", "pods"]
  verbs: ["get", "list", "delete"]
```

## Error Handling

All functions raise appropriate exceptions:

- `ValueError`: Invalid input parameters or resource not found
- `ApiException`: Kubernetes API errors
- `TimeoutError`: Operations that exceed timeout limits

Example error handling:

```python
from kubernetes.client.rest import ApiException

try:
    status = get_mcp_status("non-existent-server")
except ValueError as e:
    print(f"Server not found: {e}")
except ApiException as e:
    print(f"Kubernetes API error: {e.reason}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Status Values

### Deployment Status

- `running`: All replicas are ready and available
- `stopped`: Scaled to 0 replicas
- `scaling`: Replicas are being added or removed
- `pending`: Waiting for replicas to become ready

## Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-mock

# Run tests
pytest tests/
```

### Project Structure

```
resource-manager-mcp-server/
├── src/
│   └── resource_manager_mcp_server/
│       └── __init__.py          # Main implementation
├── config/
│   └── example-mcp-deployment.yaml  # Example K8s config
├── requirements.txt             # Python dependencies
└── README.md                    # This file
```

## License

MIT License

## Contributing

Contributions welcome! Please submit pull requests or open issues.
