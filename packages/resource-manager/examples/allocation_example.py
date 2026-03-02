#!/usr/bin/env python3
"""
Example usage of the Resource Allocation Manager

Demonstrates:
- Requesting resources
- Checking capacity
- Managing allocations
- Releasing resources
"""

import sys
import os
import time

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from allocation_manager import AllocationManager


def print_section(title):
    """Print section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def print_capacity(manager):
    """Print current capacity"""
    capacity = manager.get_capacity()
    print("Cluster Capacity:")
    print(f"  CPU: {capacity['allocated_cpu']}/{capacity['total_cpu']} "
          f"({capacity['available_cpu']} available)")
    print(f"  Memory: {capacity['allocated_memory']}/{capacity['total_memory']} MB "
          f"({capacity['available_memory']} MB available)")
    print(f"  Workers: {capacity['allocated_workers']}/{capacity['total_workers']} "
          f"({capacity['available_workers']} available)")
    print(f"  Active allocations: {capacity['active_allocations']}")
    print(f"  Running MCP servers: {', '.join(capacity['running_mcp_servers']) or 'none'}")


def example_basic_allocation():
    """Basic allocation example"""
    print_section("Example 1: Basic Resource Allocation")

    # Create manager
    manager = AllocationManager(
        total_cpu=16.0,
        total_memory=32768,
        total_workers=10
    )

    print("Initial capacity:")
    print_capacity(manager)

    # Request resources
    print("\nRequesting resources for development task...")
    allocation = manager.request_resources(
        job_id="feature-dev-001",
        mcp_servers=["filesystem", "github"],
        workers=4,
        priority="normal",
        ttl_seconds=3600,
        metadata={
            "task_type": "feature_implementation",
            "master": "development"
        }
    )

    if allocation['status'] == 'active':
        print(f"\nAllocation successful!")
        print(f"  Allocation ID: {allocation['allocation_id']}")
        print(f"  MCP Servers: {len(allocation['mcp_servers'])}")
        for server in allocation['mcp_servers']:
            print(f"    - {server['name']}: {server['endpoint']}")
        print(f"  Workers: {len(allocation['workers_allocated'])}")
        for worker in allocation['workers_allocated']:
            print(f"    - {worker['worker_id']}: {worker['endpoint']}")
        print(f"  Resources: {allocation['resources']['cpu']} CPU, "
              f"{allocation['resources']['memory']} MB")

        print("\nCapacity after allocation:")
        print_capacity(manager)

        # Release resources
        print(f"\nReleasing allocation {allocation['allocation_id']}...")
        result = manager.release_resources(allocation['allocation_id'])
        print(f"Released {result['workers_released']} workers")
        print(f"Duration: {result['duration_seconds']}s")

        print("\nCapacity after release:")
        print_capacity(manager)
    else:
        print(f"Allocation failed: {allocation['error']}")


def example_multiple_allocations():
    """Multiple concurrent allocations example"""
    print_section("Example 2: Multiple Concurrent Allocations")

    manager = AllocationManager(total_workers=10)

    print("Creating 3 concurrent allocations...\n")

    allocations = []

    # Allocation 1: Development task
    alloc1 = manager.request_resources(
        job_id="dev-task-001",
        mcp_servers=["filesystem", "github"],
        workers=3,
        priority="normal"
    )
    allocations.append(alloc1)
    print(f"1. Development task: {alloc1['status']} - "
          f"{len(alloc1['workers_allocated'])} workers")

    # Allocation 2: Security scan
    alloc2 = manager.request_resources(
        job_id="security-scan-001",
        mcp_servers=["filesystem"],
        workers=2,
        priority="high"
    )
    allocations.append(alloc2)
    print(f"2. Security scan: {alloc2['status']} - "
          f"{len(alloc2['workers_allocated'])} workers")

    # Allocation 3: CI/CD deployment
    alloc3 = manager.request_resources(
        job_id="cicd-deploy-001",
        mcp_servers=["kubernetes"],
        workers=3,
        priority="normal"
    )
    allocations.append(alloc3)
    print(f"3. CI/CD deployment: {alloc3['status']} - "
          f"{len(alloc3['workers_allocated'])} workers")

    print("\nCurrent capacity:")
    print_capacity(manager)

    # Try to allocate more (should fail)
    print("\nAttempting to allocate 5 more workers (should fail)...")
    alloc4 = manager.request_resources(
        job_id="test-task-001",
        mcp_servers=["filesystem"],
        workers=5
    )
    print(f"Result: {alloc4['status']}")
    if alloc4['status'] == 'failed':
        print(f"Error: {alloc4['error']}")

    # List all allocations
    print("\nAll active allocations:")
    active = manager.list_allocations(state="active")
    for alloc in active:
        print(f"  - {alloc['job_id']}: {alloc['workers']} workers, "
              f"age {alloc['age_seconds']:.0f}s")

    # Release all
    print("\nReleasing all allocations...")
    for alloc in allocations:
        if alloc['status'] == 'active':
            manager.release_resources(alloc['allocation_id'])
            print(f"  Released {alloc['allocation_id']}")

    print("\nFinal capacity:")
    print_capacity(manager)


def example_capacity_checking():
    """Capacity checking before allocation example"""
    print_section("Example 3: Check Capacity Before Allocation")

    manager = AllocationManager(total_workers=5)

    def request_with_check(job_id, workers_needed):
        """Request resources with capacity check"""
        print(f"\nRequesting {workers_needed} workers for {job_id}...")

        capacity = manager.get_capacity()
        print(f"  Available workers: {capacity['available_workers']}")

        if capacity['available_workers'] >= workers_needed:
            print("  Sufficient capacity - proceeding with allocation")
            result = manager.request_resources(
                job_id=job_id,
                mcp_servers=["filesystem"],
                workers=workers_needed
            )
            print(f"  Result: {result['status']}")
            return result
        else:
            print("  Insufficient capacity - skipping allocation")
            return None

    # First allocation - should succeed
    alloc1 = request_with_check("task-001", 3)

    # Second allocation - should succeed
    alloc2 = request_with_check("task-002", 2)

    # Third allocation - should fail capacity check
    alloc3 = request_with_check("task-003", 3)

    print("\nFinal state:")
    print_capacity(manager)

    # Cleanup
    if alloc1:
        manager.release_resources(alloc1['allocation_id'])
    if alloc2:
        manager.release_resources(alloc2['allocation_id'])


def example_allocation_lifecycle():
    """Full allocation lifecycle example"""
    print_section("Example 4: Allocation Lifecycle")

    manager = AllocationManager()

    # Create allocation
    print("Creating allocation...")
    allocation = manager.request_resources(
        job_id="lifecycle-test-001",
        mcp_servers=["filesystem", "github"],
        workers=3,
        priority="high",
        ttl_seconds=10,  # 10 second TTL for demo
        metadata={"demo": "lifecycle"}
    )

    allocation_id = allocation['allocation_id']
    print(f"Allocation ID: {allocation_id}")
    print(f"Status: {allocation['status']}")

    # Get details
    print("\nAllocation details:")
    details = manager.get_allocation(allocation_id)
    print(f"  State: {details['state']}")
    print(f"  Priority: {details['priority']}")
    print(f"  Workers: {details['resources']['workers']}")
    print(f"  TTL: {details['ttl_seconds']}s")
    print(f"  Expired: {details['is_expired']}")

    # Wait a bit
    print("\nWaiting 3 seconds...")
    time.sleep(3)

    # Check age
    details = manager.get_allocation(allocation_id)
    print(f"Age: {details['timestamps']['age_seconds']:.1f}s")
    print(f"Expired: {details['is_expired']}")

    # Release
    print("\nReleasing allocation...")
    result = manager.release_resources(allocation_id)
    print(f"Status: {result['status']}")

    # Check final state
    details = manager.get_allocation(allocation_id)
    print(f"Final state: {details['state']}")
    print(f"Duration: {result['duration_seconds']:.1f}s")


def example_expiry_cleanup():
    """TTL expiry and cleanup example"""
    print_section("Example 5: TTL Expiry and Cleanup")

    manager = AllocationManager()

    # Create allocation with short TTL
    print("Creating allocation with 2-second TTL...")
    allocation = manager.request_resources(
        job_id="expiry-test-001",
        mcp_servers=["filesystem"],
        workers=2,
        ttl_seconds=2
    )

    allocation_id = allocation['allocation_id']
    print(f"Allocation ID: {allocation_id}")

    # Check immediately
    details = manager.get_allocation(allocation_id)
    print(f"\nImmediately after creation:")
    print(f"  State: {details['state']}")
    print(f"  Expired: {details['is_expired']}")

    # Wait for expiry
    print("\nWaiting 3 seconds for expiry...")
    time.sleep(3)

    # Check after expiry
    details = manager.get_allocation(allocation_id)
    print(f"\nAfter TTL expiry:")
    print(f"  State: {details['state']}")
    print(f"  Expired: {details['is_expired']}")

    # Cleanup expired
    print("\nCleaning up expired allocations...")
    expired = manager.cleanup_expired_allocations()
    print(f"Cleaned up: {expired}")

    # Check final state
    details = manager.get_allocation(allocation_id)
    print(f"\nAfter cleanup:")
    print(f"  State: {details['state']}")


def main():
    """Run all examples"""
    examples = [
        ("Basic Allocation", example_basic_allocation),
        ("Multiple Allocations", example_multiple_allocations),
        ("Capacity Checking", example_capacity_checking),
        ("Allocation Lifecycle", example_allocation_lifecycle),
        ("TTL Expiry & Cleanup", example_expiry_cleanup),
    ]

    print("\n" + "="*60)
    print("  Resource Allocation Manager - Examples")
    print("="*60)

    if len(sys.argv) > 1:
        # Run specific example
        try:
            example_num = int(sys.argv[1]) - 1
            if 0 <= example_num < len(examples):
                name, func = examples[example_num]
                func()
            else:
                print(f"\nInvalid example number. Choose 1-{len(examples)}")
        except ValueError:
            print("\nUsage: python allocation_example.py [example_number]")
    else:
        # Run all examples
        for i, (name, func) in enumerate(examples, 1):
            func()
            if i < len(examples):
                print("\n" + "-"*60)
                print("Press Enter to continue to next example...")
                input()

    print("\n" + "="*60)
    print("  Examples completed!")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
