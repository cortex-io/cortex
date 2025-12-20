#!/usr/bin/env python3
"""
Example usage of the MCP Lifecycle Manager

This script demonstrates how to use the resource-manager-mcp-server
to manage MCP servers running on Kubernetes.
"""

import sys
import json
from typing import Dict, Any


def print_status(status: Dict[str, Any]) -> None:
    """Pretty print MCP server status."""
    print(json.dumps(status, indent=2))


def example_basic_usage():
    """Demonstrate basic usage with convenience functions."""
    print("=" * 60)
    print("Basic Usage Example")
    print("=" * 60)

    from resource_manager_mcp_server import (
        list_mcp_servers,
        get_mcp_status,
        start_mcp,
        stop_mcp,
        scale_mcp
    )

    # List all MCP servers
    print("\n1. Listing all MCP servers...")
    try:
        servers = list_mcp_servers()
        print(f"Found {len(servers)} MCP servers:")
        for server in servers:
            print(f"  - {server['name']}: {server['status']} "
                  f"({server['ready_replicas']}/{server['replicas']} replicas)")
    except Exception as e:
        print(f"Error listing servers: {e}")
        return

    if not servers:
        print("\nNo MCP servers found. Deploy some servers first.")
        print("See config/example-mcp-deployment.yaml for an example.")
        return

    # Use the first server for demonstration
    server_name = servers[0]['name']
    print(f"\n2. Getting detailed status for '{server_name}'...")
    try:
        status = get_mcp_status(server_name)
        print_status(status)
    except Exception as e:
        print(f"Error getting status: {e}")
        return

    # Scale the server
    print(f"\n3. Scaling '{server_name}' to 2 replicas...")
    try:
        result = scale_mcp(server_name, replicas=2, wait_ready=False)
        print(f"Scaled to {result['replicas']} replicas")
        print(f"Current status: {result['status']}")
    except Exception as e:
        print(f"Error scaling server: {e}")

    # Get updated status
    print(f"\n4. Checking updated status...")
    try:
        status = get_mcp_status(server_name)
        print(f"Status: {status['status']}")
        print(f"Replicas: {status['ready_replicas']}/{status['replicas']}")
    except Exception as e:
        print(f"Error getting status: {e}")


def example_advanced_usage():
    """Demonstrate advanced usage with the manager class."""
    print("\n" + "=" * 60)
    print("Advanced Usage Example")
    print("=" * 60)

    from resource_manager_mcp_server import MCPLifecycleManager

    # Create a manager instance
    print("\n1. Creating MCPLifecycleManager instance...")
    try:
        manager = MCPLifecycleManager(namespace="default")
        print("Manager created successfully")
    except Exception as e:
        print(f"Error creating manager: {e}")
        return

    # List servers with custom label selector
    print("\n2. Listing MCP servers with custom label selector...")
    try:
        servers = manager.list_mcp_servers(
            label_selector="app.kubernetes.io/component=mcp-server"
        )
        print(f"Found {len(servers)} servers")
    except Exception as e:
        print(f"Error listing servers: {e}")
        return

    if not servers:
        print("No servers found for advanced demo")
        return

    server_name = servers[0]['name']

    # Demonstrate start operation
    current_replicas = servers[0]['replicas']
    if current_replicas == 0:
        print(f"\n3. Starting '{server_name}' (currently stopped)...")
        try:
            result = manager.start_mcp(server_name, wait_ready=False)
            print(f"Start initiated: {result['status']}")
        except Exception as e:
            print(f"Error starting server: {e}")

    # Demonstrate detailed status checking
    print(f"\n4. Getting detailed status with conditions...")
    try:
        status = manager.get_mcp_status(server_name)
        print(f"\nServer: {status['name']}")
        print(f"Status: {status['status']}")
        print(f"Replicas: {status['ready_replicas']}/{status['replicas']}")
        print(f"Endpoints: {', '.join(status['endpoints']) if status['endpoints'] else 'None'}")
        print(f"Last Activity: {status['last_activity']}")
        print(f"\nConditions:")
        for condition in status['conditions']:
            print(f"  - {condition['type']}: {condition['status']}")
            if condition['message']:
                print(f"    Message: {condition['message']}")
    except Exception as e:
        print(f"Error getting status: {e}")


def example_lifecycle_operations():
    """Demonstrate full lifecycle operations."""
    print("\n" + "=" * 60)
    print("Lifecycle Operations Example")
    print("=" * 60)

    from resource_manager_mcp_server import (
        list_mcp_servers,
        start_mcp,
        scale_mcp,
        stop_mcp,
        get_mcp_status
    )

    # Get first server
    try:
        servers = list_mcp_servers()
        if not servers:
            print("No servers available for lifecycle demo")
            return
        server_name = servers[0]['name']
    except Exception as e:
        print(f"Error listing servers: {e}")
        return

    print(f"\nDemonstrating lifecycle for '{server_name}'...")

    # Step 1: Ensure server is stopped
    print("\n1. Stopping server (if running)...")
    try:
        result = stop_mcp(server_name, force=False)
        print(f"Stop result: {result['status']}")
    except Exception as e:
        print(f"Note: {e}")

    # Step 2: Start server
    print("\n2. Starting server...")
    try:
        result = start_mcp(server_name, wait_ready=False)
        print(f"Start initiated: {result['status']}")
    except Exception as e:
        print(f"Error starting: {e}")

    # Step 3: Scale up
    print("\n3. Scaling to 3 replicas...")
    try:
        result = scale_mcp(server_name, replicas=3, wait_ready=False)
        print(f"Scale result: {result['status']}, replicas: {result['replicas']}")
    except Exception as e:
        print(f"Error scaling: {e}")

    # Step 4: Scale down
    print("\n4. Scaling back to 1 replica...")
    try:
        result = scale_mcp(server_name, replicas=1, wait_ready=False)
        print(f"Scale result: {result['status']}, replicas: {result['replicas']}")
    except Exception as e:
        print(f"Error scaling: {e}")

    # Step 5: Final status
    print("\n5. Final status check...")
    try:
        status = get_mcp_status(server_name)
        print(f"Final state: {status['status']}")
        print(f"Replicas: {status['ready_replicas']}/{status['replicas']}")
    except Exception as e:
        print(f"Error getting status: {e}")


def main():
    """Run all examples."""
    print("\nMCP Lifecycle Manager - Usage Examples")
    print("=" * 60)

    try:
        # Basic usage
        example_basic_usage()

        # Advanced usage
        example_advanced_usage()

        # Lifecycle operations
        example_lifecycle_operations()

        print("\n" + "=" * 60)
        print("Examples completed!")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n\nExamples interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
