"""
Resource Manager MCP Server
Exposes resource allocation tools via MCP protocol.
"""

import asyncio
import json
from typing import Any, Optional
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)

from allocation_manager import AllocationManager
from worker_manager import WorkerManager, WorkerManagerError


class ResourceManagerServer:
    """MCP Server for resource management"""

    def __init__(self):
        self.server = Server("resource-manager")
        self.allocation_manager = AllocationManager()
        self.worker_manager = WorkerManager()
        self._setup_handlers()

        # Background task for cleanup
        self.cleanup_task: Optional[asyncio.Task] = None

    def _setup_handlers(self):
        """Setup MCP protocol handlers"""

        @self.server.list_tools()
        async def handle_list_tools() -> list[Tool]:
            """List available resource management tools"""
            return [
                Tool(
                    name="request_resources",
                    description=(
                        "Reserve resources for a job. Starts required MCP servers, "
                        "provisions workers if requested, and tracks allocation with unique ID. "
                        "Returns allocation details including endpoints and worker information."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "job_id": {
                                "type": "string",
                                "description": "Unique job identifier"
                            },
                            "mcp_servers": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of MCP server names to start (e.g., ['filesystem', 'github', 'database'])"
                            },
                            "workers": {
                                "type": "integer",
                                "description": "Number of workers to provision (optional)",
                                "minimum": 0
                            },
                            "priority": {
                                "type": "string",
                                "enum": ["low", "normal", "high", "critical"],
                                "description": "Job priority level",
                                "default": "normal"
                            },
                            "ttl_seconds": {
                                "type": "integer",
                                "description": "Time-to-live for allocation in seconds",
                                "default": 3600,
                                "minimum": 60
                            },
                            "metadata": {
                                "type": "object",
                                "description": "Additional metadata for the allocation"
                            }
                        },
                        "required": ["job_id", "mcp_servers"]
                    }
                ),
                Tool(
                    name="release_resources",
                    description=(
                        "Release resources after job completion. Scales down MCP servers "
                        "(or marks for idle timeout), queues burst workers for destruction, "
                        "and updates allocation status."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "allocation_id": {
                                "type": "string",
                                "description": "Allocation identifier to release"
                            }
                        },
                        "required": ["allocation_id"]
                    }
                ),
                Tool(
                    name="get_capacity",
                    description=(
                        "Return current cluster capacity including available CPU, memory, "
                        "workers, running MCP servers, and active allocations."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                Tool(
                    name="get_allocation",
                    description=(
                        "Get details of a specific allocation including status, resources, "
                        "age, and job information."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "allocation_id": {
                                "type": "string",
                                "description": "Allocation identifier to query"
                            }
                        },
                        "required": ["allocation_id"]
                    }
                ),
                Tool(
                    name="list_allocations",
                    description=(
                        "List allocations with optional filtering by state or job_id. "
                        "Returns summary information for each allocation."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "state": {
                                "type": "string",
                                "enum": ["pending", "active", "releasing", "released", "failed"],
                                "description": "Filter by allocation state (optional)"
                            },
                            "job_id": {
                                "type": "string",
                                "description": "Filter by job ID (optional)"
                            }
                        }
                    }
                ),
                Tool(
                    name="cleanup_expired",
                    description=(
                        "Manually trigger cleanup of expired allocations. "
                        "Returns list of cleaned up allocation IDs."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                Tool(
                    name="list_workers",
                    description=(
                        "List all Kubernetes workers with their status, type, and resources. "
                        "Optionally filter by worker type (permanent or burst)."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "type_filter": {
                                "type": "string",
                                "enum": ["permanent", "burst"],
                                "description": "Filter workers by type (optional)"
                            }
                        }
                    }
                ),
                Tool(
                    name="provision_workers",
                    description=(
                        "Create burst workers by provisioning VMs and joining them to the Kubernetes cluster. "
                        "Burst workers are temporary and will be automatically cleaned up after TTL expires. "
                        "Uses Talos or Proxmox MCP to create VMs."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "count": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 10,
                                "description": "Number of workers to provision (1-10)"
                            },
                            "ttl": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 168,
                                "description": "Time-to-live in hours (1-168, max 1 week)"
                            },
                            "size": {
                                "type": "string",
                                "enum": ["small", "medium", "large"],
                                "default": "medium",
                                "description": "Worker size (small: 2 CPU/4GB, medium: 4 CPU/8GB, large: 8 CPU/16GB)"
                            }
                        },
                        "required": ["count", "ttl"]
                    }
                ),
                Tool(
                    name="drain_worker",
                    description=(
                        "Gracefully drain a worker node by moving all pods to other nodes and marking it as unschedulable. "
                        "This should be done before destroying a worker to ensure no service disruption."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "worker_id": {
                                "type": "string",
                                "description": "Worker node name to drain"
                            }
                        },
                        "required": ["worker_id"]
                    }
                ),
                Tool(
                    name="destroy_worker",
                    description=(
                        "Destroy a burst worker by removing it from the cluster and deleting the VM. "
                        "SAFETY: Only burst workers can be destroyed - permanent workers are protected. "
                        "Worker should be drained first unless force=True (not recommended)."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "worker_id": {
                                "type": "string",
                                "description": "Worker node name to destroy"
                            },
                            "force": {
                                "type": "boolean",
                                "default": False,
                                "description": "Force destroy without draining first (use with caution)"
                            }
                        },
                        "required": ["worker_id"]
                    }
                ),
                Tool(
                    name="get_worker_details",
                    description=(
                        "Get detailed information about a specific worker including status, "
                        "resources, labels, annotations, and conditions."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "worker_id": {
                                "type": "string",
                                "description": "Worker node name"
                            }
                        },
                        "required": ["worker_id"]
                    }
                )
            ]

        @self.server.call_tool()
        async def handle_call_tool(name: str, arguments: dict) -> list[TextContent]:
            """Handle tool execution"""
            try:
                if name == "request_resources":
                    result = self.allocation_manager.request_resources(
                        job_id=arguments["job_id"],
                        mcp_servers=arguments["mcp_servers"],
                        workers=arguments.get("workers"),
                        priority=arguments.get("priority", "normal"),
                        ttl_seconds=arguments.get("ttl_seconds", 3600),
                        metadata=arguments.get("metadata")
                    )

                elif name == "release_resources":
                    result = self.allocation_manager.release_resources(
                        allocation_id=arguments["allocation_id"]
                    )

                elif name == "get_capacity":
                    result = self.allocation_manager.get_capacity()

                elif name == "get_allocation":
                    result = self.allocation_manager.get_allocation(
                        allocation_id=arguments["allocation_id"]
                    )
                    if result is None:
                        result = {
                            "error": f"Allocation {arguments['allocation_id']} not found"
                        }

                elif name == "list_allocations":
                    result = self.allocation_manager.list_allocations(
                        state=arguments.get("state"),
                        job_id=arguments.get("job_id")
                    )

                elif name == "cleanup_expired":
                    expired_ids = self.allocation_manager.cleanup_expired_allocations()
                    result = {
                        "cleaned_up": expired_ids,
                        "count": len(expired_ids)
                    }

                elif name == "list_workers":
                    type_filter = arguments.get("type_filter")
                    workers = self.worker_manager.list_workers(type_filter=type_filter)
                    result = {
                        "workers": workers,
                        "count": len(workers),
                        "filter": type_filter or "none"
                    }

                elif name == "provision_workers":
                    count = arguments.get("count")
                    ttl = arguments.get("ttl")
                    size = arguments.get("size", "medium")
                    workers = self.worker_manager.provision_workers(
                        count=count,
                        ttl=ttl,
                        size=size
                    )
                    result = {
                        "provisioned_workers": workers,
                        "count": len(workers),
                        "size": size,
                        "ttl_hours": ttl
                    }

                elif name == "drain_worker":
                    worker_id = arguments.get("worker_id")
                    result = self.worker_manager.drain_worker(worker_id)

                elif name == "destroy_worker":
                    worker_id = arguments.get("worker_id")
                    force = arguments.get("force", False)
                    result = self.worker_manager.destroy_worker(
                        worker_id=worker_id,
                        force=force
                    )

                elif name == "get_worker_details":
                    worker_id = arguments.get("worker_id")
                    result = self.worker_manager.get_worker_details(worker_id)

                else:
                    result = {"error": f"Unknown tool: {name}"}

                return [
                    TextContent(
                        type="text",
                        text=json.dumps(result, indent=2)
                    )
                ]

            except WorkerManagerError as e:
                return [
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "error": str(e),
                            "error_type": "WorkerManagerError",
                            "tool": name,
                            "arguments": arguments
                        }, indent=2)
                    )
                ]
            except Exception as e:
                return [
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "error": str(e),
                            "error_type": type(e).__name__,
                            "tool": name,
                            "arguments": arguments
                        }, indent=2)
                    )
                ]

    async def _periodic_cleanup(self):
        """Periodically clean up expired allocations"""
        while True:
            try:
                await asyncio.sleep(300)  # Every 5 minutes
                expired = self.allocation_manager.cleanup_expired_allocations()
                if expired:
                    print(f"Cleaned up {len(expired)} expired allocations: {expired}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in periodic cleanup: {e}")

    async def run(self):
        """Run the MCP server"""
        # Start background cleanup task
        self.cleanup_task = asyncio.create_task(self._periodic_cleanup())

        try:
            async with stdio_server() as (read_stream, write_stream):
                await self.server.run(
                    read_stream,
                    write_stream,
                    InitializationOptions(
                        server_name="resource-manager",
                        server_version="0.1.0",
                        capabilities=self.server.get_capabilities(
                            notification_options=NotificationOptions(),
                            experimental_capabilities={}
                        )
                    )
                )
        finally:
            # Cancel cleanup task
            if self.cleanup_task:
                self.cleanup_task.cancel()
                try:
                    await self.cleanup_task
                except asyncio.CancelledError:
                    pass


async def main():
    """Main entry point"""
    server = ResourceManagerServer()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
