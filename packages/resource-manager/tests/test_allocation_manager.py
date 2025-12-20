"""
Tests for AllocationManager
"""

import pytest
import time
from datetime import datetime, timedelta
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from allocation_manager import (
    AllocationManager,
    AllocationState,
    Priority,
    ResourceAllocation,
    ClusterCapacity
)


class TestAllocationManager:
    """Test AllocationManager functionality"""

    def test_initialization(self):
        """Test manager initialization"""
        manager = AllocationManager(
            total_cpu=16.0,
            total_memory=32768,
            total_workers=10
        )

        assert manager.capacity.total_cpu == 16.0
        assert manager.capacity.total_memory == 32768
        assert manager.capacity.total_workers == 10
        assert manager.capacity.allocated_cpu == 0.0
        assert manager.capacity.allocated_workers == 0

    def test_request_resources_no_workers(self):
        """Test requesting resources without workers"""
        manager = AllocationManager()

        result = manager.request_resources(
            job_id="test-job-001",
            mcp_servers=["filesystem", "github"]
        )

        assert result['status'] == 'active'
        assert 'allocation_id' in result
        assert len(result['mcp_servers']) == 2
        assert len(result['workers_allocated']) == 0
        assert result['resources']['workers'] == 0

    def test_request_resources_with_workers(self):
        """Test requesting resources with workers"""
        manager = AllocationManager()

        result = manager.request_resources(
            job_id="test-job-002",
            mcp_servers=["filesystem"],
            workers=4,
            priority="high",
            ttl_seconds=7200
        )

        assert result['status'] == 'active'
        assert len(result['workers_allocated']) == 4
        assert result['resources']['cpu'] == 4.0
        assert result['resources']['memory'] == 8192
        assert result['resources']['workers'] == 4

    def test_request_resources_insufficient_capacity(self):
        """Test requesting more resources than available"""
        manager = AllocationManager(total_workers=5)

        result = manager.request_resources(
            job_id="test-job-003",
            mcp_servers=["filesystem"],
            workers=10  # Exceeds capacity
        )

        assert result['status'] == 'failed'
        assert 'error' in result
        assert 'Insufficient workers' in result['error']

    def test_mcp_server_reuse(self):
        """Test that MCP servers are reused across allocations"""
        manager = AllocationManager()

        # First allocation
        result1 = manager.request_resources(
            job_id="test-job-004",
            mcp_servers=["filesystem"]
        )

        # Second allocation with same MCP server
        result2 = manager.request_resources(
            job_id="test-job-005",
            mcp_servers=["filesystem"]
        )

        # Should reuse the same server
        assert result1['mcp_servers'][0]['endpoint'] == result2['mcp_servers'][0]['endpoint']

    def test_get_capacity(self):
        """Test capacity tracking"""
        manager = AllocationManager(
            total_cpu=16.0,
            total_memory=32768,
            total_workers=10
        )

        # Initial capacity
        capacity = manager.get_capacity()
        assert capacity['available_cpu'] == 16.0
        assert capacity['available_workers'] == 10

        # Allocate resources
        manager.request_resources(
            job_id="test-job-006",
            mcp_servers=["filesystem"],
            workers=4
        )

        # Check updated capacity
        capacity = manager.get_capacity()
        assert capacity['allocated_cpu'] == 4.0
        assert capacity['allocated_workers'] == 4
        assert capacity['available_cpu'] == 12.0
        assert capacity['available_workers'] == 6
        assert capacity['active_allocations'] == 1

    def test_release_resources(self):
        """Test releasing resources"""
        manager = AllocationManager()

        # Request resources
        result = manager.request_resources(
            job_id="test-job-007",
            mcp_servers=["filesystem"],
            workers=4
        )

        allocation_id = result['allocation_id']

        # Check capacity before release
        capacity = manager.get_capacity()
        assert capacity['allocated_workers'] == 4

        # Release resources
        release_result = manager.release_resources(allocation_id)

        assert release_result['status'] == 'released'
        assert release_result['workers_released'] == 4
        assert release_result['cpu_freed'] == 4.0
        assert release_result['memory_freed'] == 8192

        # Check capacity after release
        capacity = manager.get_capacity()
        assert capacity['allocated_workers'] == 0
        assert capacity['available_workers'] == 10
        assert capacity['active_allocations'] == 0

    def test_release_nonexistent_allocation(self):
        """Test releasing non-existent allocation"""
        manager = AllocationManager()

        result = manager.release_resources("nonexistent-id")

        assert result['status'] == 'error'
        assert 'not found' in result['error']

    def test_double_release(self):
        """Test releasing already released allocation"""
        manager = AllocationManager()

        # Request and release
        result = manager.request_resources(
            job_id="test-job-008",
            mcp_servers=["filesystem"],
            workers=2
        )
        allocation_id = result['allocation_id']
        manager.release_resources(allocation_id)

        # Try to release again
        result = manager.release_resources(allocation_id)

        assert result['status'] == 'already_released'

    def test_get_allocation(self):
        """Test getting allocation details"""
        manager = AllocationManager()

        # Create allocation
        result = manager.request_resources(
            job_id="test-job-009",
            mcp_servers=["filesystem", "github"],
            workers=3,
            priority="high",
            metadata={"test": "value"}
        )

        allocation_id = result['allocation_id']

        # Get allocation details
        details = manager.get_allocation(allocation_id)

        assert details is not None
        assert details['allocation_id'] == allocation_id
        assert details['job_id'] == "test-job-009"
        assert details['state'] == 'active'
        assert details['priority'] == 'high'
        assert details['resources']['workers'] == 3
        assert len(details['mcp_servers']) == 2
        assert details['metadata']['test'] == 'value'

    def test_get_nonexistent_allocation(self):
        """Test getting non-existent allocation"""
        manager = AllocationManager()

        details = manager.get_allocation("nonexistent-id")

        assert details is None

    def test_list_allocations(self):
        """Test listing allocations"""
        manager = AllocationManager()

        # Create multiple allocations
        manager.request_resources(
            job_id="test-job-010",
            mcp_servers=["filesystem"],
            workers=2
        )

        manager.request_resources(
            job_id="test-job-011",
            mcp_servers=["github"],
            workers=3
        )

        # List all
        all_allocations = manager.list_allocations()
        assert len(all_allocations) == 2

        # Filter by state
        active = manager.list_allocations(state="active")
        assert len(active) == 2

        # Filter by job_id
        job_allocations = manager.list_allocations(job_id="test-job-010")
        assert len(job_allocations) == 1
        assert job_allocations[0]['job_id'] == "test-job-010"

    def test_allocation_expiry(self):
        """Test allocation TTL expiry"""
        manager = AllocationManager()

        # Create allocation with very short TTL
        result = manager.request_resources(
            job_id="test-job-012",
            mcp_servers=["filesystem"],
            workers=2,
            ttl_seconds=1  # 1 second
        )

        allocation_id = result['allocation_id']

        # Initially not expired
        details = manager.get_allocation(allocation_id)
        assert not details['is_expired']

        # Wait for expiry
        time.sleep(2)

        # Now expired
        details = manager.get_allocation(allocation_id)
        assert details['is_expired']

    def test_cleanup_expired_allocations(self):
        """Test cleanup of expired allocations"""
        manager = AllocationManager()

        # Create allocation with short TTL
        result = manager.request_resources(
            job_id="test-job-013",
            mcp_servers=["filesystem"],
            workers=2,
            ttl_seconds=1
        )

        allocation_id = result['allocation_id']

        # Wait for expiry
        time.sleep(2)

        # Cleanup expired
        expired = manager.cleanup_expired_allocations()

        assert allocation_id in expired
        assert len(expired) == 1

        # Verify allocation was released
        details = manager.get_allocation(allocation_id)
        assert details['state'] == 'released'

    def test_priority_levels(self):
        """Test different priority levels"""
        manager = AllocationManager()

        priorities = ["low", "normal", "high", "critical"]

        for priority in priorities:
            result = manager.request_resources(
                job_id=f"test-job-priority-{priority}",
                mcp_servers=["filesystem"],
                priority=priority
            )

            assert result['status'] == 'active'
            details = manager.get_allocation(result['allocation_id'])
            assert details['priority'] == priority

    def test_multiple_workers_same_job(self):
        """Test allocating multiple workers for same job"""
        manager = AllocationManager()

        result = manager.request_resources(
            job_id="test-job-014",
            mcp_servers=["filesystem"],
            workers=5
        )

        workers = result['workers_allocated']
        assert len(workers) == 5

        # Verify unique worker IDs
        worker_ids = [w['worker_id'] for w in workers]
        assert len(worker_ids) == len(set(worker_ids))

        # Verify unique endpoints
        endpoints = [w['endpoint'] for w in workers]
        assert len(endpoints) == len(set(endpoints))

    def test_concurrent_allocations(self):
        """Test multiple concurrent allocations"""
        manager = AllocationManager(total_workers=10)

        # Create 3 concurrent allocations
        alloc1 = manager.request_resources(
            job_id="test-job-015",
            mcp_servers=["filesystem"],
            workers=2
        )

        alloc2 = manager.request_resources(
            job_id="test-job-016",
            mcp_servers=["github"],
            workers=3
        )

        alloc3 = manager.request_resources(
            job_id="test-job-017",
            mcp_servers=["database"],
            workers=2
        )

        # All should succeed
        assert alloc1['status'] == 'active'
        assert alloc2['status'] == 'active'
        assert alloc3['status'] == 'active'

        # Check capacity
        capacity = manager.get_capacity()
        assert capacity['allocated_workers'] == 7
        assert capacity['available_workers'] == 3
        assert capacity['active_allocations'] == 3

        # Fourth allocation should fail (insufficient workers)
        alloc4 = manager.request_resources(
            job_id="test-job-018",
            mcp_servers=["filesystem"],
            workers=5
        )

        assert alloc4['status'] == 'failed'

    def test_resource_accounting_accuracy(self):
        """Test that resource accounting is accurate"""
        manager = AllocationManager(
            total_cpu=10.0,
            total_memory=20480,
            total_workers=5
        )

        # Allocate 3 workers
        result = manager.request_resources(
            job_id="test-job-019",
            mcp_servers=["filesystem"],
            workers=3
        )

        allocation_id = result['allocation_id']

        # Check accounting
        capacity = manager.get_capacity()
        assert capacity['allocated_cpu'] == 3.0
        assert capacity['allocated_memory'] == 6144
        assert capacity['allocated_workers'] == 3

        # Release
        manager.release_resources(allocation_id)

        # Check accounting after release
        capacity = manager.get_capacity()
        assert capacity['allocated_cpu'] == 0.0
        assert capacity['allocated_memory'] == 0
        assert capacity['allocated_workers'] == 0


class TestAllocationDataStructures:
    """Test allocation data structures"""

    def test_allocation_state_enum(self):
        """Test AllocationState enum"""
        assert AllocationState.PENDING.value == "pending"
        assert AllocationState.ACTIVE.value == "active"
        assert AllocationState.RELEASING.value == "releasing"
        assert AllocationState.RELEASED.value == "released"
        assert AllocationState.FAILED.value == "failed"

    def test_priority_enum(self):
        """Test Priority enum"""
        assert Priority.LOW.value == "low"
        assert Priority.NORMAL.value == "normal"
        assert Priority.HIGH.value == "high"
        assert Priority.CRITICAL.value == "critical"

    def test_cluster_capacity_properties(self):
        """Test ClusterCapacity computed properties"""
        capacity = ClusterCapacity(
            total_cpu=16.0,
            total_memory=32768,
            total_workers=10,
            allocated_cpu=4.0,
            allocated_memory=8192,
            allocated_workers=3
        )

        assert capacity.available_cpu == 12.0
        assert capacity.available_memory == 24576
        assert capacity.available_workers == 7


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
