#!/usr/bin/env python3
"""
Quick validation of allocation_manager implementation
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from allocation_manager import AllocationManager


def test_basic_functionality():
    """Test basic allocation manager functionality"""
    print("Testing AllocationManager...")

    # Create manager
    manager = AllocationManager(
        total_cpu=16.0,
        total_memory=32768,
        total_workers=10
    )
    print("  Created manager")

    # Test capacity
    capacity = manager.get_capacity()
    assert capacity['total_workers'] == 10
    assert capacity['available_workers'] == 10
    print("  Initial capacity: OK")

    # Request resources
    allocation = manager.request_resources(
        job_id="test-job",
        mcp_servers=["filesystem", "github"],
        workers=4,
        priority="high"
    )
    assert allocation['status'] == 'active'
    assert len(allocation['workers_allocated']) == 4
    print(f"  Requested resources: OK (allocation_id={allocation['allocation_id']})")

    # Check capacity after allocation
    capacity = manager.get_capacity()
    assert capacity['allocated_workers'] == 4
    assert capacity['available_workers'] == 6
    print("  Capacity tracking: OK")

    # Get allocation
    details = manager.get_allocation(allocation['allocation_id'])
    assert details is not None
    assert details['state'] == 'active'
    print("  Get allocation: OK")

    # List allocations
    allocations = manager.list_allocations()
    assert len(allocations) == 1
    print("  List allocations: OK")

    # Release resources
    result = manager.release_resources(allocation['allocation_id'])
    assert result['status'] == 'released'
    assert result['workers_released'] == 4
    print("  Released resources: OK")

    # Check capacity after release
    capacity = manager.get_capacity()
    assert capacity['allocated_workers'] == 0
    assert capacity['available_workers'] == 10
    print("  Capacity after release: OK")

    print("\nAll tests passed!")
    return True


if __name__ == "__main__":
    try:
        test_basic_functionality()
        sys.exit(0)
    except Exception as e:
        print(f"\nTest failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
