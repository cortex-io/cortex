# Quick Start Guide

Get started with the MCP Lifecycle Manager in 5 minutes.

## Prerequisites

1. Python 3.8 or higher
2. Access to a Kubernetes cluster
3. kubectl configured with cluster access

## Installation

```bash
# Clone or navigate to the project directory
cd resource-manager-mcp-server

# Install dependencies
pip install -r requirements.txt

# Or install in development mode
pip install -e ".[dev]"
```

## Deploy Example MCP Server

First, deploy an example MCP server to your Kubernetes cluster:

```bash
kubectl apply -f config/example-mcp-deployment.yaml
```

This creates:
- A deployment named `example-mcp-server`
- A ClusterIP service for the server
- Proper labels for lifecycle management

## Basic Usage

### 1. List All MCP Servers

```python
from resource_manager_mcp_server import list_mcp_servers

servers = list_mcp_servers()
for server in servers:
    print(f"{server['name']}: {server['status']} - {server['ready_replicas']}/{server['replicas']} replicas")
```

Output:
```
example-mcp-server: running - 1/1 replicas
```

### 2. Get Server Status

```python
from resource_manager_mcp_server import get_mcp_status

status = get_mcp_status("example-mcp-server")
print(f"Status: {status['status']}")
print(f"Endpoints: {status['endpoints']}")
print(f"Last Activity: {status['last_activity']}")
```

### 3. Scale Server

```python
from resource_manager_mcp_server import scale_mcp

# Scale to 3 replicas
result = scale_mcp("example-mcp-server", replicas=3)
print(f"Scaled to {result['replicas']} replicas")

# Scale to 1 replica
result = scale_mcp("example-mcp-server", replicas=1)
```

### 4. Stop Server

```python
from resource_manager_mcp_server import stop_mcp

# Graceful shutdown (default)
result = stop_mcp("example-mcp-server")
print(f"Server status: {result['status']}")

# Force shutdown (immediate)
result = stop_mcp("example-mcp-server", force=True)
```

### 5. Start Server

```python
from resource_manager_mcp_server import start_mcp

# Start and wait for ready
result = start_mcp("example-mcp-server", wait_ready=True)
print(f"Server started: {result['status']}")

# Start without waiting
result = start_mcp("example-mcp-server", wait_ready=False)
```

## Run Example Script

The project includes a complete example script:

```bash
python example_usage.py
```

This demonstrates:
- Listing servers
- Getting detailed status
- Scaling operations
- Full lifecycle management

## Advanced Usage

### Custom Namespace

```python
from resource_manager_mcp_server import MCPLifecycleManager

manager = MCPLifecycleManager(namespace="production")
servers = manager.list_mcp_servers()
```

### Custom Label Selector

```python
manager = MCPLifecycleManager()
servers = manager.list_mcp_servers(
    label_selector="app.kubernetes.io/component=mcp-server,env=prod"
)
```

### Timeout Configuration

```python
# Start with 10-minute timeout
result = start_mcp("my-server", wait_ready=True, timeout=600)

# Scale with custom timeout
result = scale_mcp("my-server", replicas=5, wait_ready=True, timeout=300)
```

## Testing

Run the test suite:

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Or use Make
make test
```

## Common Patterns

### Start-Scale-Stop Workflow

```python
from resource_manager_mcp_server import start_mcp, scale_mcp, stop_mcp

# Start server
start_mcp("my-server", wait_ready=True)

# Scale up for heavy workload
scale_mcp("my-server", replicas=5)

# Scale down after workload
scale_mcp("my-server", replicas=1)

# Stop when done
stop_mcp("my-server")
```

### Health Monitoring

```python
from resource_manager_mcp_server import get_mcp_status
import time

def wait_for_healthy(name, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        status = get_mcp_status(name)
        if status['status'] == 'running':
            return True
        time.sleep(5)
    return False

if wait_for_healthy("my-server"):
    print("Server is healthy!")
```

### Error Handling

```python
from resource_manager_mcp_server import start_mcp
from kubernetes.client.rest import ApiException

try:
    result = start_mcp("my-server", wait_ready=True)
    print(f"Started successfully: {result['status']}")
except ValueError as e:
    print(f"Server not found: {e}")
except TimeoutError as e:
    print(f"Server didn't become ready: {e}")
except ApiException as e:
    print(f"Kubernetes error: {e.reason}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Troubleshooting

### Server Not Found

Ensure your MCP server deployment has the required label:

```yaml
labels:
  app.kubernetes.io/component: mcp-server
```

### Timeout Errors

If servers take long to start:
- Increase timeout parameter
- Check pod events: `kubectl describe pod <pod-name>`
- Check resource availability
- Verify health/readiness probes

### Permission Errors

Ensure your kubeconfig or service account has permissions:

```bash
# Check current permissions
kubectl auth can-i get deployments
kubectl auth can-i patch deployments
kubectl auth can-i get services
```

Required RBAC permissions: see README.md

## Next Steps

- Read the full [README.md](README.md) for detailed API documentation
- Check [config/example-mcp-deployment.yaml](config/example-mcp-deployment.yaml) for deployment examples
- Review [tests/test_lifecycle_manager.py](tests/test_lifecycle_manager.py) for more usage patterns
- Integrate with your existing cortex automation workflows

## Support

For issues or questions:
1. Check the README.md
2. Review test files for examples
3. Check Kubernetes events and logs
4. Open an issue on the project repository
