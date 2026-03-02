#!/usr/bin/env python3
"""
Cortex MCP Server

Model Context Protocol server for interacting with the Cortex AI orchestration system.
Provides tools for cluster management, agent spawning, deployment status, and observability.

Transport Protocol:
    This server uses stdio with newline-delimited JSON (NDJSON) format.
    - Input: One JSON-RPC message per line from stdin
    - Output: One JSON-RPC response per line to stdout
    - Logs: Written to stderr (captured by Claude Desktop)

    Note: Claude Desktop does NOT use Content-Length framing. Each message is a
    complete JSON object terminated by a newline character.
"""

import asyncio
import json
import logging
import subprocess
import sys
import os
from typing import Any, Optional
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("cortex-mcp")

# Cortex paths
CORTEX_BASE = Path(os.getenv("CORTEX_HOME", "/Users/ryandahlberg/Projects/cortex-io"))
GITOPS_PATH = CORTEX_BASE / "cortex-gitops"
PLATFORM_PATH = CORTEX_BASE / "cortex-platform"
K3S_PATH = CORTEX_BASE / "cortex-k3s"


class CortexMCPServer:
    """MCP Server for Cortex infrastructure integration."""

    def __init__(self):
        self.tools = self._define_tools()

    def _define_tools(self) -> list[dict]:
        """Define available MCP tools."""
        return [
            {
                "name": "cortex_cluster_status",
                "description": "Get the status of the Cortex Kubernetes cluster including nodes, pods, and resource usage.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "namespace": {
                            "type": "string",
                            "description": "Kubernetes namespace to query (default: all)",
                        },
                    },
                },
            },
            {
                "name": "cortex_list_pods",
                "description": "List all pods in the Cortex cluster with their status and resource usage.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "namespace": {
                            "type": "string",
                            "description": "Namespace filter (default: cortex)",
                            "default": "cortex",
                        },
                        "label_selector": {
                            "type": "string",
                            "description": "Label selector to filter pods (e.g., 'app=worker')",
                        },
                    },
                },
            },
            {
                "name": "cortex_get_logs",
                "description": "Get logs from a specific pod in the Cortex cluster.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pod_name": {
                            "type": "string",
                            "description": "Name of the pod",
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace (default: cortex)",
                            "default": "cortex",
                        },
                        "tail": {
                            "type": "integer",
                            "description": "Number of lines to tail (default: 100)",
                            "default": 100,
                        },
                        "container": {
                            "type": "string",
                            "description": "Container name if pod has multiple containers",
                        },
                    },
                    "required": ["pod_name"],
                },
            },
            {
                "name": "cortex_argocd_status",
                "description": "Get ArgoCD application sync status for Cortex deployments.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "app_name": {
                            "type": "string",
                            "description": "Specific application name (optional, lists all if not provided)",
                        },
                    },
                },
            },
            {
                "name": "cortex_sync_app",
                "description": "Trigger an ArgoCD sync for a specific application.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "app_name": {
                            "type": "string",
                            "description": "Name of the ArgoCD application to sync",
                        },
                    },
                    "required": ["app_name"],
                },
            },
            {
                "name": "cortex_list_agents",
                "description": "List all Cortex agents (masters and workers) with their current state.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "cortex_agent_metrics",
                "description": "Get performance metrics for Cortex agents including CPU, memory, and task throughput.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "agent_type": {
                            "type": "string",
                            "description": "Filter by agent type (master, worker, or specific role)",
                        },
                    },
                },
            },
            {
                "name": "cortex_task_queue",
                "description": "View the current task queue status including pending, in-progress, and completed tasks.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "status_filter": {
                            "type": "string",
                            "description": "Filter by status: pending, in_progress, completed, failed",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of tasks to return (default: 20)",
                            "default": 20,
                        },
                    },
                },
            },
            {
                "name": "cortex_gitops_diff",
                "description": "Show the diff between current cluster state and GitOps desired state.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path within gitops repo to check (default: all)",
                        },
                    },
                },
            },
            {
                "name": "cortex_health_check",
                "description": "Run a comprehensive health check on all Cortex components.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "cortex_list_services",
                "description": "List all MCP servers and services registered in the Cortex ecosystem.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "cortex_resource_usage",
                "description": "Get cluster resource usage summary (CPU, memory, storage).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "by_namespace": {
                            "type": "boolean",
                            "description": "Group resources by namespace",
                            "default": True,
                        },
                    },
                },
            },
        ]

    def _run_kubectl(self, args: list[str]) -> dict:
        """Run a kubectl command and return the result."""
        try:
            result = subprocess.run(
                ["kubectl"] + args,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return {"success": True, "output": result.stdout}
            else:
                return {"success": False, "error": result.stderr}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Command timed out"}
        except FileNotFoundError:
            return {"success": False, "error": "kubectl not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _run_argocd(self, args: list[str]) -> dict:
        """Run an argocd CLI command and return the result."""
        try:
            result = subprocess.run(
                ["argocd"] + args,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return {"success": True, "output": result.stdout}
            else:
                return {"success": False, "error": result.stderr}
        except FileNotFoundError:
            return {"success": False, "error": "argocd CLI not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def handle_tool_call(self, name: str, arguments: dict) -> dict:
        """Handle a tool call and return the result."""
        try:
            if name == "cortex_cluster_status":
                return self._cluster_status(arguments)
            elif name == "cortex_list_pods":
                return self._list_pods(arguments)
            elif name == "cortex_get_logs":
                return self._get_logs(arguments)
            elif name == "cortex_argocd_status":
                return self._argocd_status(arguments)
            elif name == "cortex_sync_app":
                return self._sync_app(arguments)
            elif name == "cortex_list_agents":
                return self._list_agents()
            elif name == "cortex_agent_metrics":
                return self._agent_metrics(arguments)
            elif name == "cortex_task_queue":
                return self._task_queue(arguments)
            elif name == "cortex_gitops_diff":
                return self._gitops_diff(arguments)
            elif name == "cortex_health_check":
                return self._health_check()
            elif name == "cortex_list_services":
                return self._list_services()
            elif name == "cortex_resource_usage":
                return self._resource_usage(arguments)
            else:
                return {"error": f"Unknown tool: {name}"}
        except Exception as e:
            logger.error(f"Error handling tool call {name}: {e}")
            return {"error": str(e)}

    def _cluster_status(self, args: dict) -> dict:
        """Get cluster status."""
        nodes = self._run_kubectl(["get", "nodes", "-o", "wide"])

        namespace = args.get("namespace")
        if namespace:
            pods = self._run_kubectl(["get", "pods", "-n", namespace, "-o", "wide"])
        else:
            pods = self._run_kubectl(["get", "pods", "-A", "-o", "wide"])

        return {
            "nodes": nodes.get("output", nodes.get("error")),
            "pods_summary": pods.get("output", pods.get("error")),
            "timestamp": datetime.now().isoformat(),
        }

    def _list_pods(self, args: dict) -> dict:
        """List pods with details."""
        namespace = args.get("namespace", "cortex")
        cmd = ["get", "pods", "-n", namespace, "-o", "json"]

        if args.get("label_selector"):
            cmd.extend(["-l", args["label_selector"]])

        result = self._run_kubectl(cmd)
        if result.get("success"):
            try:
                pods = json.loads(result["output"])
                return {
                    "pods": [
                        {
                            "name": p["metadata"]["name"],
                            "status": p["status"]["phase"],
                            "ready": all(
                                c.get("ready", False)
                                for c in p["status"].get("containerStatuses", [])
                            ),
                            "restarts": sum(
                                c.get("restartCount", 0)
                                for c in p["status"].get("containerStatuses", [])
                            ),
                            "age": p["metadata"].get("creationTimestamp"),
                        }
                        for p in pods.get("items", [])
                    ],
                    "count": len(pods.get("items", [])),
                }
            except json.JSONDecodeError:
                return {"output": result["output"]}
        return result

    def _get_logs(self, args: dict) -> dict:
        """Get pod logs."""
        cmd = [
            "logs",
            args["pod_name"],
            "-n", args.get("namespace", "cortex"),
            f"--tail={args.get('tail', 100)}",
        ]
        if args.get("container"):
            cmd.extend(["-c", args["container"]])

        return self._run_kubectl(cmd)

    def _argocd_status(self, args: dict) -> dict:
        """Get ArgoCD application status."""
        if args.get("app_name"):
            return self._run_argocd(["app", "get", args["app_name"], "-o", "json"])
        else:
            return self._run_argocd(["app", "list", "-o", "json"])

    def _sync_app(self, args: dict) -> dict:
        """Sync an ArgoCD application."""
        return self._run_argocd(["app", "sync", args["app_name"]])

    def _list_agents(self) -> dict:
        """List Cortex agents."""
        # Get pods with agent labels
        result = self._run_kubectl([
            "get", "pods", "-A",
            "-l", "cortex.io/component=agent",
            "-o", "json",
        ])

        if result.get("success"):
            try:
                pods = json.loads(result["output"])
                agents = []
                for p in pods.get("items", []):
                    labels = p["metadata"].get("labels", {})
                    agents.append({
                        "name": p["metadata"]["name"],
                        "namespace": p["metadata"]["namespace"],
                        "type": labels.get("cortex.io/agent-type", "unknown"),
                        "role": labels.get("cortex.io/role", "worker"),
                        "status": p["status"]["phase"],
                    })
                return {"agents": agents, "count": len(agents)}
            except json.JSONDecodeError:
                pass

        # Fallback: check coordination files
        coord_file = PLATFORM_PATH / "coordination" / "worker-pool.json"
        if coord_file.exists():
            try:
                with open(coord_file) as f:
                    pool = json.load(f)
                return {"agents": pool.get("workers", []), "source": "coordination-file"}
            except Exception as e:
                return {"error": f"Failed to read coordination file: {e}"}

        return {"agents": [], "note": "No agents found in cluster or coordination files"}

    def _agent_metrics(self, args: dict) -> dict:
        """Get agent metrics."""
        cmd = ["top", "pods", "-A", "-l", "cortex.io/component=agent"]
        if args.get("agent_type"):
            cmd[-1] = f"cortex.io/agent-type={args['agent_type']}"
        return self._run_kubectl(cmd)

    def _task_queue(self, args: dict) -> dict:
        """Get task queue status."""
        queue_file = PLATFORM_PATH / "coordination" / "task-queue.json"
        if queue_file.exists():
            try:
                with open(queue_file) as f:
                    queue = json.load(f)

                tasks = queue.get("tasks", [])
                status_filter = args.get("status_filter")
                if status_filter:
                    tasks = [t for t in tasks if t.get("status") == status_filter]

                limit = args.get("limit", 20)
                return {
                    "tasks": tasks[:limit],
                    "total": len(queue.get("tasks", [])),
                    "returned": min(len(tasks), limit),
                }
            except Exception as e:
                return {"error": f"Failed to read task queue: {e}"}
        return {"tasks": [], "note": "Task queue file not found"}

    def _gitops_diff(self, args: dict) -> dict:
        """Show GitOps diff."""
        if not GITOPS_PATH.exists():
            return {"error": f"GitOps path not found: {GITOPS_PATH}"}

        try:
            result = subprocess.run(
                ["git", "diff", "HEAD", "origin/main"],
                cwd=GITOPS_PATH,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return {
                "diff": result.stdout if result.stdout else "No differences",
                "path": str(GITOPS_PATH),
            }
        except Exception as e:
            return {"error": str(e)}

    def _health_check(self) -> dict:
        """Run comprehensive health check."""
        checks = {}

        # Kubectl connectivity
        kubectl = self._run_kubectl(["cluster-info"])
        checks["kubernetes"] = "healthy" if kubectl.get("success") else "unhealthy"

        # ArgoCD connectivity
        argocd = self._run_argocd(["app", "list"])
        checks["argocd"] = "healthy" if argocd.get("success") else "unavailable"

        # GitOps repo
        checks["gitops_repo"] = "present" if GITOPS_PATH.exists() else "missing"

        # Platform coordination
        coord_path = PLATFORM_PATH / "coordination"
        checks["coordination"] = "present" if coord_path.exists() else "missing"

        # Overall status
        critical_healthy = checks["kubernetes"] == "healthy"
        checks["overall"] = "healthy" if critical_healthy else "degraded"

        return {
            "checks": checks,
            "timestamp": datetime.now().isoformat(),
        }

    def _list_services(self) -> dict:
        """List MCP services."""
        servers_file = PLATFORM_PATH / "mcp" / "servers.json"
        if servers_file.exists():
            try:
                with open(servers_file) as f:
                    return {"services": json.load(f)}
            except Exception as e:
                return {"error": f"Failed to read servers.json: {e}"}

        # Fallback: list from kubectl
        result = self._run_kubectl([
            "get", "services", "-A",
            "-l", "cortex.io/type=mcp-server",
            "-o", "json",
        ])
        return result

    def _resource_usage(self, args: dict) -> dict:
        """Get resource usage."""
        if args.get("by_namespace", True):
            return self._run_kubectl(["top", "pods", "-A", "--sort-by=memory"])
        else:
            return self._run_kubectl(["top", "nodes"])

    def get_server_info(self) -> dict:
        """Return server information."""
        return {
            "name": "cortex",
            "version": "1.0.0",
            "description": "Cortex AI Orchestration MCP Server",
        }


async def handle_message(server: CortexMCPServer, message: dict) -> Optional[dict]:
    """Handle an incoming MCP message."""
    method = message.get("method")
    msg_id = message.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": server.get_server_info(),
                "capabilities": {"tools": {}},
            },
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {"tools": server.tools},
        }

    elif method == "tools/call":
        params = message.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        result = await server.handle_tool_call(tool_name, arguments)

        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
            },
        }

    elif method == "notifications/initialized":
        return None

    else:
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }


def write_response(response: dict):
    """Write a response to stdout as newline-delimited JSON."""
    response_json = json.dumps(response)
    sys.stdout.write(response_json + "\n")
    sys.stdout.flush()


async def main():
    """Main entry point for MCP server."""
    server = CortexMCPServer()
    logger.info("Cortex MCP Server started")

    try:
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while True:
            # Read one line of JSON
            line = await reader.readline()
            if not line:
                break

            line = line.decode().strip()
            if not line:
                continue

            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON: {line}")
                continue

            logger.info(f"Received: {message.get('method')}")

            response = await handle_message(server, message)
            if response:
                write_response(response)
                logger.info(f"Sent response for: {message.get('method')}")

    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        logger.info("Cortex MCP Server stopped")


if __name__ == "__main__":
    asyncio.run(main())
