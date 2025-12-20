"""
Example usage of Worker Management tools for Resource Manager MCP Server

This file demonstrates how to use the worker management functionality.
"""

from src.worker_manager import WorkerManager, WorkerManagerError


def main():
    """Demonstrate worker management functionality"""

    # Initialize the worker manager
    # In production, you would load configuration from a file
    config = {
        "talos_mcp_endpoint": "stdio://talos-mcp-server",
        "proxmox_mcp_endpoint": "stdio://proxmox-mcp-server",
        "kubectl_context": None  # Use default context
    }

    manager = WorkerManager(config)

    print("=" * 80)
    print("Worker Management Examples")
    print("=" * 80)

    # Example 1: List all workers
    print("\n1. Listing all workers:")
    print("-" * 80)
    try:
        all_workers = manager.list_workers()
        print(f"Total workers: {len(all_workers)}")

        for worker in all_workers:
            print(f"\nWorker: {worker['name']}")
            print(f"  Status: {worker['status']}")
            print(f"  Type: {worker['type']}")
            resources = worker['resources']['allocatable']
            print(f"  Resources:")
            print(f"    CPU: {resources.get('cpu', 'unknown')}")
            print(f"    Memory: {resources.get('memory', 'unknown')}")
            if worker['type'] == 'burst' and 'ttl_expires' in worker:
                print(f"  TTL Expires: {worker['ttl_expires']}")

    except WorkerManagerError as e:
        print(f"Error listing workers: {e}")

    # Example 2: List only burst workers
    print("\n\n2. Listing burst workers only:")
    print("-" * 80)
    try:
        burst_workers = manager.list_workers(type_filter="burst")
        print(f"Burst workers: {len(burst_workers)}")

        for worker in burst_workers:
            print(f"\nBurst Worker: {worker['name']}")
            print(f"  Status: {worker['status']}")
            if 'ttl_expires' in worker:
                print(f"  TTL Expires: {worker['ttl_expires']}")

    except WorkerManagerError as e:
        print(f"Error listing burst workers: {e}")

    # Example 3: List only permanent workers
    print("\n\n3. Listing permanent workers only:")
    print("-" * 80)
    try:
        permanent_workers = manager.list_workers(type_filter="permanent")
        print(f"Permanent workers: {len(permanent_workers)}")

        for worker in permanent_workers:
            print(f"\nPermanent Worker: {worker['name']}")
            print(f"  Status: {worker['status']}")

    except WorkerManagerError as e:
        print(f"Error listing permanent workers: {e}")

    # Example 4: Provision burst workers
    print("\n\n4. Provisioning burst workers:")
    print("-" * 80)
    print("NOTE: This is a dry-run example. Actual provisioning requires Talos/Proxmox MCP.")

    try:
        # Uncomment to actually provision workers
        # workers = manager.provision_workers(count=2, ttl=24, size="medium")

        # Simulated output
        print("Would provision 2 medium burst workers with 24-hour TTL:")
        print("  - burst-worker-1234567890-0")
        print("    Size: medium (4 CPU, 8GB RAM, 100GB disk)")
        print("    TTL: 24 hours")
        print("  - burst-worker-1234567890-1")
        print("    Size: medium (4 CPU, 8GB RAM, 100GB disk)")
        print("    TTL: 24 hours")

    except WorkerManagerError as e:
        print(f"Error provisioning workers: {e}")

    # Example 5: Get worker details
    print("\n\n5. Getting worker details:")
    print("-" * 80)
    try:
        # Get details for the first worker
        all_workers = manager.list_workers()
        if all_workers:
            worker_id = all_workers[0]['name']
            details = manager.get_worker_details(worker_id)

            print(f"Worker: {details['name']}")
            print(f"Type: {details['type']}")
            print(f"Status: {details['status']}")
            print(f"Created: {details['created']}")

            print("\nResources:")
            capacity = details['resources']['capacity']
            allocatable = details['resources']['allocatable']
            print(f"  Capacity:")
            print(f"    CPU: {capacity.get('cpu', 'unknown')}")
            print(f"    Memory: {capacity.get('memory', 'unknown')}")
            print(f"    Pods: {capacity.get('pods', 'unknown')}")
            print(f"  Allocatable:")
            print(f"    CPU: {allocatable.get('cpu', 'unknown')}")
            print(f"    Memory: {allocatable.get('memory', 'unknown')}")
            print(f"    Pods: {allocatable.get('pods', 'unknown')}")

            print("\nConditions:")
            for condition in details['conditions']:
                print(f"  {condition.get('type')}: {condition.get('status')}")

    except WorkerManagerError as e:
        print(f"Error getting worker details: {e}")

    # Example 6: Drain a worker (commented out for safety)
    print("\n\n6. Draining a worker:")
    print("-" * 80)
    print("NOTE: This is a dry-run example. Uncomment to actually drain a worker.")

    # Uncomment to actually drain a worker
    # try:
    #     worker_id = "burst-worker-1234567890-0"
    #     result = manager.drain_worker(worker_id)
    #     print(f"Worker: {result['worker_id']}")
    #     print(f"Status: {result['status']}")
    #     print(f"Message: {result['message']}")
    # except WorkerManagerError as e:
    #     print(f"Error draining worker: {e}")

    print("Would drain worker by:")
    print("  1. Marking node as unschedulable")
    print("  2. Evicting all pods (except DaemonSets)")
    print("  3. Waiting for graceful pod termination (5 min grace period)")

    # Example 7: Destroy a burst worker (commented out for safety)
    print("\n\n7. Destroying a burst worker:")
    print("-" * 80)
    print("NOTE: This is a dry-run example. Uncomment to actually destroy a worker.")
    print("IMPORTANT: Always drain workers before destroying!")

    # Safe workflow example (commented out)
    # try:
    #     worker_id = "burst-worker-1234567890-0"
    #
    #     # Step 1: Verify it's a burst worker
    #     details = manager.get_worker_details(worker_id)
    #     if details['type'] != 'burst':
    #         print(f"SAFETY VIOLATION: Cannot destroy permanent worker {worker_id}")
    #     else:
    #         # Step 2: Drain the worker
    #         drain_result = manager.drain_worker(worker_id)
    #         print(f"Drained: {drain_result['status']}")
    #
    #         # Step 3: Destroy the worker
    #         destroy_result = manager.destroy_worker(worker_id)
    #         print(f"Destroyed: {destroy_result['status']}")
    #         print(f"Cluster removal: {destroy_result['removed_from_cluster']}")
    #         print(f"VM deletion: {destroy_result['vm_deleted']}")
    #
    # except WorkerManagerError as e:
    #     print(f"Error destroying worker: {e}")

    print("Safe destroy workflow:")
    print("  1. Verify worker is a burst worker (not permanent)")
    print("  2. Drain the worker to move pods")
    print("  3. Remove worker from Kubernetes cluster")
    print("  4. Delete the VM via Talos/Proxmox MCP")
    print("\nSAFETY FEATURES:")
    print("  - Only burst workers can be destroyed")
    print("  - Permanent workers are protected")
    print("  - Requires drain before destroy (unless force=True)")

    # Example 8: Error handling
    print("\n\n8. Error handling examples:")
    print("-" * 80)

    # Try to destroy a permanent worker (will fail)
    print("\nAttempting to destroy a permanent worker (will fail):")
    try:
        # This would fail with a safety violation
        # manager.destroy_worker("permanent-worker-1", force=True)
        print("BLOCKED: WorkerManagerError - SAFETY VIOLATION")
        print("Cannot destroy permanent worker. Only burst workers can be destroyed.")

    except WorkerManagerError as e:
        print(f"Error (expected): {e}")

    # Try to get details for non-existent worker
    print("\nAttempting to get details for non-existent worker:")
    try:
        manager.get_worker_details("non-existent-worker")
    except WorkerManagerError as e:
        print(f"Error (expected): {e}")

    print("\n" + "=" * 80)
    print("Examples complete!")
    print("=" * 80)


if __name__ == "__main__":
    main()
