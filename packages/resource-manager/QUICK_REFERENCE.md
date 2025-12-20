# Resource Allocation - Quick Reference

## Core API

### Request Resources
```python
allocation = manager.request_resources(
    job_id="job-001",
    mcp_servers=["filesystem", "github"],
    workers=4,
    priority="high",  # low, normal, high, critical
    ttl_seconds=7200,
    metadata={"task": "feature"}
)
```

Returns:
- `allocation_id`: Unique identifier
- `status`: "active" or "failed"
- `mcp_servers`: List with endpoints
- `workers_allocated`: List with endpoints
- `resources`: CPU, memory, worker count

### Release Resources
```python
result = manager.release_resources(allocation_id)
```

Returns:
- `status`: "released"
- `workers_released`: Count
- `cpu_freed`, `memory_freed`: Resources freed
- `duration_seconds`: Total time

### Check Capacity
```python
capacity = manager.get_capacity()
```

Returns:
- `total_*`, `allocated_*`, `available_*` for CPU, memory, workers
- `running_mcp_servers`: List
- `active_allocations`: Count

### Get Allocation
```python
details = manager.get_allocation(allocation_id)
```

Returns allocation details or None if not found.

## Quick Start

```python
from allocation_manager import AllocationManager

# Create manager
manager = AllocationManager()

# Request
alloc = manager.request_resources(
    job_id="test-001",
    mcp_servers=["filesystem"],
    workers=2
)

# Use allocation_id
allocation_id = alloc['allocation_id']

# ... do work ...

# Release
manager.release_resources(allocation_id)
```

## Common Patterns

### Check Before Allocate
```python
capacity = manager.get_capacity()
if capacity['available_workers'] >= 4:
    alloc = manager.request_resources(...)
```

### Handle Failures
```python
result = manager.request_resources(...)
if result['status'] == 'failed':
    print(f"Error: {result['error']}")
```

### List Active
```python
active = manager.list_allocations(state="active")
for a in active:
    print(f"{a['job_id']}: {a['workers']} workers")
```

## Files

- Implementation: `src/allocation_manager.py`
- MCP Server: `src/server.py`
- Full Docs: `RESOURCE_ALLOCATION.md`
- Tests: `tests/test_allocation_manager.py`
- Examples: `examples/allocation_example.py`
- Validation: `validate.py`

## Run

```bash
# MCP server
python src/server.py

# Examples
python examples/allocation_example.py

# Validation
python validate.py

# Tests (requires pytest)
pytest tests/test_allocation_manager.py -v
```
