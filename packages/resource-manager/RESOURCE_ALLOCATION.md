# Resource Allocation API

Core orchestration logic for cortex resource management.

## Overview

The Resource Allocation API provides tools for managing resources across cortex jobs:
- Request and release resources (MCP servers + workers)
- Track allocations with unique IDs
- Monitor cluster capacity
- Automatic TTL/expiry handling
- In-memory allocation tracking

## Quick Start

```python
from allocation_manager import AllocationManager

# Initialize manager
manager = AllocationManager(
    total_cpu=16.0,
    total_memory=32768,  # 32GB
    total_workers=10
)

# Request resources
allocation = manager.request_resources(
    job_id="feature-dev-001",
    mcp_servers=["filesystem", "github", "database"],
    workers=4,
    priority="high",
    ttl_seconds=7200
)

# Use the resources...
allocation_id = allocation['allocation_id']

# Release when done
manager.release_resources(allocation_id)
```

## API Reference

### request_resources()

Reserve resources for a job.

```python
allocation = manager.request_resources(
    job_id="job-001",
    mcp_servers=["filesystem", "github"],
    workers=4,
    priority="high",
    ttl_seconds=7200,
    metadata={"task_type": "feature"}
)
```

**Parameters:**
- `job_id` (str, required): Unique job identifier
- `mcp_servers` (list, required): MCP server names to start
- `workers` (int, optional): Number of workers to provision
- `priority` (str, optional): "low", "normal", "high", or "critical" (default: "normal")
- `ttl_seconds` (int, optional): Time-to-live in seconds (default: 3600)
- `metadata` (dict, optional): Additional metadata

**Returns:**
```python
{
    "allocation_id": "alloc-abc123",
    "status": "active",
    "job_id": "job-001",
    "mcp_servers": [
        {
            "name": "filesystem",
            "endpoint": "http://localhost:9000",
            "status": "running"
        }
    ],
    "workers_allocated": [
        {
            "worker_id": "worker-job-001-000",
            "endpoint": "http://localhost:8000",
            "cpu": 1.0,
            "memory": 2048
        }
    ],
    "resources": {
        "cpu": 4.0,
        "memory": 8192,
        "workers": 4
    },
    "ttl_seconds": 7200,
    "created_at": "2025-12-08T19:00:00Z"
}
```

**Failure Response:**
```python
{
    "allocation_id": "alloc-xyz789",
    "status": "failed",
    "error": "Insufficient workers: requested 10, available 6"
}
```

### release_resources()

Release resources after job completion.

```python
result = manager.release_resources(allocation_id="alloc-abc123")
```

**Parameters:**
- `allocation_id` (str, required): Allocation identifier

**Returns:**
```python
{
    "status": "released",
    "allocation_id": "alloc-abc123",
    "job_id": "job-001",
    "workers_released": 4,
    "cpu_freed": 4.0,
    "memory_freed": 8192,
    "released_at": "2025-12-08T21:00:00Z",
    "duration_seconds": 7200
}
```

### get_capacity()

Get current cluster capacity.

```python
capacity = manager.get_capacity()
```

**Returns:**
```python
{
    "total_cpu": 16.0,
    "total_memory": 32768,
    "total_workers": 10,
    "allocated_cpu": 4.0,
    "allocated_memory": 8192,
    "allocated_workers": 4,
    "available_cpu": 12.0,
    "available_memory": 24576,
    "available_workers": 6,
    "running_mcp_servers": ["filesystem", "github", "database"],
    "active_allocations": 2
}
```

### get_allocation()

Get details of a specific allocation.

```python
details = manager.get_allocation(allocation_id="alloc-abc123")
```

**Returns:**
```python
{
    "allocation_id": "alloc-abc123",
    "job_id": "job-001",
    "state": "active",
    "priority": "high",
    "resources": {
        "cpu_allocated": 4.0,
        "memory_allocated": 8192,
        "workers": 4
    },
    "mcp_servers": [...],
    "workers": [...],
    "timestamps": {
        "created_at": "2025-12-08T19:00:00Z",
        "activated_at": "2025-12-08T19:00:01Z",
        "released_at": null,
        "age_seconds": 3600
    },
    "ttl_seconds": 7200,
    "is_expired": false,
    "metadata": {}
}
```

**Returns None if allocation not found.**

### list_allocations()

List allocations with optional filtering.

```python
# All allocations
allocations = manager.list_allocations()

# Filter by state
active = manager.list_allocations(state="active")

# Filter by job
job_allocs = manager.list_allocations(job_id="job-001")
```

**Parameters:**
- `state` (str, optional): Filter by state
- `job_id` (str, optional): Filter by job ID

**Returns:**
```python
[
    {
        "allocation_id": "alloc-abc123",
        "job_id": "job-001",
        "state": "active",
        "priority": "high",
        "workers": 4,
        "age_seconds": 3600,
        "is_expired": false
    }
]
```

### cleanup_expired_allocations()

Manually trigger cleanup of expired allocations.

```python
expired = manager.cleanup_expired_allocations()
print(f"Cleaned up: {expired}")
```

**Returns:**
List of cleaned up allocation IDs.

## Data Structures

### Allocation States

| State | Description |
|-------|-------------|
| `pending` | Allocation created but not yet active |
| `active` | Resources allocated and active |
| `releasing` | In process of being released |
| `released` | Resources released |
| `failed` | Allocation failed |

### Priority Levels

| Priority | Description |
|----------|-------------|
| `low` | Best-effort, may be preempted |
| `normal` | Standard priority (default) |
| `high` | Preferred scheduling |
| `critical` | Highest priority, reserved resources |

### Worker Specification

```python
{
    "worker_id": "worker-job-001-000",
    "worker_type": "cortex-worker",
    "cpu": 1.0,
    "memory": 2048,  # MB
    "status": "active",
    "endpoint": "http://localhost:8000"
}
```

### MCP Server Specification

```python
{
    "server_name": "filesystem",
    "endpoint": "http://localhost:9000",
    "status": "running",
    "port": 9000
}
```

## Configuration

### Default Cluster Capacity

```python
AllocationManager(
    total_cpu=16.0,      # 16 cores
    total_memory=32768,  # 32GB
    total_workers=10     # 10 worker slots
)
```

### Default Resource Usage Per Worker

- CPU: 1.0 core
- Memory: 2048 MB (2GB)

### Port Allocation

- MCP servers: 9000-9099 (100 ports)
- Workers: 8000+ (dynamic)

## Usage Patterns

### Check Capacity Before Allocation

```python
capacity = manager.get_capacity()
if capacity['available_workers'] >= 4:
    allocation = manager.request_resources(
        job_id="job-001",
        mcp_servers=["filesystem"],
        workers=4
    )
else:
    print("Insufficient capacity")
```

### Handle Allocation Failures

```python
result = manager.request_resources(
    job_id="job-001",
    mcp_servers=["filesystem"],
    workers=100  # Too many
)

if result['status'] == 'failed':
    print(f"Allocation failed: {result['error']}")
else:
    allocation_id = result['allocation_id']
```

### Monitor Active Allocations

```python
# List all active allocations
active = manager.list_allocations(state="active")

for alloc in active:
    print(f"Job: {alloc['job_id']}")
    print(f"Workers: {alloc['workers']}")
    print(f"Age: {alloc['age_seconds']}s")
    print(f"Expired: {alloc['is_expired']}")
```

### Automatic Expiry Cleanup

The manager automatically cleans up expired allocations:
- Background task runs every 5 minutes (in MCP server)
- Checks all active allocations for TTL expiry
- Automatically releases expired allocations
- Manual trigger: `cleanup_expired_allocations()`

```python
# Manual cleanup
expired = manager.cleanup_expired_allocations()
if expired:
    print(f"Cleaned up {len(expired)} expired allocations")
```

## Integration with Cortex

### Coordinator Master

```python
# Request resources for a development task
allocation = manager.request_resources(
    job_id="task-feature-auth",
    mcp_servers=["filesystem", "github"],
    workers=2,
    priority="normal",
    metadata={
        "master": "development",
        "task_type": "feature_implementation"
    }
)

# Hand off allocation_id to development master
```

### Development Master

```python
# Receive allocation from coordinator
allocation_id = task_data['allocation_id']

# Get allocation details
allocation = manager.get_allocation(allocation_id)
mcp_endpoints = allocation['mcp_servers']
worker_endpoints = allocation['workers']

# Use resources for development work...

# Release when done
manager.release_resources(allocation_id)
```

### Security Master

```python
# High priority security scan
allocation = manager.request_resources(
    job_id="security-scan-001",
    mcp_servers=["filesystem", "github"],
    workers=4,
    priority="high",
    ttl_seconds=1800,  # 30 minutes
    metadata={
        "master": "security",
        "scan_type": "vulnerability_scan"
    }
)
```

## Error Handling

### Insufficient Resources

```python
result = manager.request_resources(
    job_id="job-001",
    mcp_servers=["filesystem"],
    workers=20  # Exceeds capacity
)

if result['status'] == 'failed':
    print(result['error'])
    # "Insufficient workers: requested 20, available 10"
```

### Allocation Not Found

```python
details = manager.get_allocation("nonexistent-id")
if details is None:
    print("Allocation not found")
```

### Release Non-Existent Allocation

```python
result = manager.release_resources("nonexistent-id")
if result['status'] == 'error':
    print(result['error'])
    # "Allocation nonexistent-id not found"
```

## Best Practices

### 1. Check Capacity First

Always check capacity before requesting resources:

```python
capacity = manager.get_capacity()
workers_needed = 4

if capacity['available_workers'] >= workers_needed:
    allocation = manager.request_resources(...)
```

### 2. Set Appropriate TTL

Choose TTL based on expected job duration:

```python
# Short task: 30 minutes
ttl_seconds=1800

# Normal task: 1 hour (default)
ttl_seconds=3600

# Long task: 4 hours
ttl_seconds=14400
```

### 3. Use Priority Correctly

- `low`: Background/non-urgent tasks
- `normal`: Standard tasks (default)
- `high`: Important/time-sensitive tasks
- `critical`: Emergency/critical tasks only

### 4. Always Release Resources

```python
try:
    allocation = manager.request_resources(...)
    allocation_id = allocation['allocation_id']

    # Do work...

finally:
    manager.release_resources(allocation_id)
```

### 5. Add Metadata for Tracking

```python
allocation = manager.request_resources(
    job_id="job-001",
    mcp_servers=["filesystem"],
    metadata={
        "master": "development",
        "task_type": "feature_implementation",
        "assigned_to": "dev-worker-001",
        "project": "authentication_system"
    }
)
```

## Performance Considerations

### Resource Limits

- Max workers per allocation: Limited by cluster capacity
- Max concurrent allocations: Unlimited (memory permitting)
- MCP server reuse: Servers are shared across allocations
- Worker isolation: Each worker is dedicated to one allocation

### Memory Usage

In-memory tracking means:
- Fast allocation/release operations
- No database overhead
- State lost on server restart
- Suitable for transient resource management

### Scalability

For production deployment:
- Consider persistent storage (SQLite/PostgreSQL)
- Implement allocation recovery on restart
- Add metrics and monitoring
- Consider distributed allocation management

## MCP Server Integration

The allocation manager is exposed via MCP tools in `server.py`:

### Available MCP Tools

1. `request_resources` - Request resources for a job
2. `release_resources` - Release resources
3. `get_capacity` - Get cluster capacity
4. `get_allocation` - Get allocation details
5. `list_allocations` - List allocations with filtering
6. `cleanup_expired` - Trigger manual cleanup

### Running the MCP Server

```bash
python src/server.py
```

### Using from MCP Client

```python
# Via MCP protocol
result = mcp_client.call_tool("request_resources", {
    "job_id": "job-001",
    "mcp_servers": ["filesystem", "github"],
    "workers": 4,
    "priority": "high",
    "ttl_seconds": 7200
})
```

## Future Enhancements

Planned improvements:

1. **Persistent Storage**: SQLite/PostgreSQL backend
2. **Resource Quotas**: Per-job-type resource limits
3. **Advanced Scheduling**: Bin packing, affinity rules
4. **Preemption**: Low-priority job preemption
5. **Metrics**: Prometheus integration
6. **Health Checks**: MCP server/worker health monitoring
7. **Auto-Scaling**: Dynamic capacity adjustment
8. **Allocation Recovery**: Recover state on restart
9. **Resource Reservation**: Pre-reserve resources
10. **Cost Tracking**: Track resource costs per job

## See Also

- [Main README](README.md) - MCP server lifecycle management
- [Worker Management](src/worker_manager.py) - Worker provisioning and management
- [MCP Server](src/server.py) - MCP server implementation
