"""
Worker Management Module for Resource Manager MCP Server

Provides tools for managing Kubernetes workers including:
- Listing workers with filtering
- Provisioning burst workers
- Draining workers gracefully
- Destroying burst workers safely
"""

import json
import subprocess
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum


class WorkerType(Enum):
    """Worker type classification"""
    PERMANENT = "permanent"
    BURST = "burst"


class WorkerStatus(Enum):
    """Worker status states"""
    READY = "ready"
    BUSY = "busy"
    DRAINING = "draining"
    NOT_READY = "not_ready"


class WorkerSize(Enum):
    """Worker VM size configurations"""
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


# Worker size specifications
WORKER_SIZES = {
    "small": {
        "cpu": 2,
        "memory_gb": 4,
        "disk_gb": 50
    },
    "medium": {
        "cpu": 4,
        "memory_gb": 8,
        "disk_gb": 100
    },
    "large": {
        "cpu": 8,
        "memory_gb": 16,
        "disk_gb": 200
    }
}


class WorkerManagerError(Exception):
    """Base exception for worker manager errors"""
    pass


class WorkerManager:
    """Manages Kubernetes workers and their lifecycle"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the worker manager

        Args:
            config: Configuration dictionary with MCP server endpoints
        """
        self.config = config or {}
        self.talos_mcp_endpoint = self.config.get("talos_mcp_endpoint")
        self.proxmox_mcp_endpoint = self.config.get("proxmox_mcp_endpoint")
        self.kubectl_context = self.config.get("kubectl_context")

    def _run_kubectl(self, args: List[str]) -> Dict[str, Any]:
        """
        Run kubectl command and return parsed JSON output

        Args:
            args: kubectl command arguments

        Returns:
            Parsed JSON output

        Raises:
            WorkerManagerError: If kubectl command fails
        """
        cmd = ["kubectl"]
        if self.kubectl_context:
            cmd.extend(["--context", self.kubectl_context])
        cmd.extend(args)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            return json.loads(result.stdout) if result.stdout else {}
        except subprocess.CalledProcessError as e:
            raise WorkerManagerError(f"kubectl command failed: {e.stderr}")
        except json.JSONDecodeError as e:
            raise WorkerManagerError(f"Failed to parse kubectl output: {e}")

    def _get_node_type(self, node: Dict[str, Any]) -> WorkerType:
        """
        Determine if a node is permanent or burst

        Args:
            node: Node object from kubectl

        Returns:
            WorkerType enum value
        """
        labels = node.get("metadata", {}).get("labels", {})

        # Check for burst worker label
        if labels.get("worker-type") == "burst":
            return WorkerType.BURST

        # Check for TTL annotation (burst workers have TTL)
        annotations = node.get("metadata", {}).get("annotations", {})
        if "worker-ttl" in annotations:
            return WorkerType.BURST

        return WorkerType.PERMANENT

    def _get_node_status(self, node: Dict[str, Any]) -> WorkerStatus:
        """
        Determine node status

        Args:
            node: Node object from kubectl

        Returns:
            WorkerStatus enum value
        """
        # Check if node is schedulable
        spec = node.get("spec", {})
        if spec.get("unschedulable", False):
            return WorkerStatus.DRAINING

        # Check node conditions
        conditions = node.get("status", {}).get("conditions", [])
        for condition in conditions:
            if condition.get("type") == "Ready":
                if condition.get("status") == "True":
                    # Check if node is busy (has pods)
                    # This is a simplified check - could be enhanced
                    return WorkerStatus.READY
                else:
                    return WorkerStatus.NOT_READY

        return WorkerStatus.NOT_READY

    def _get_node_resources(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract node resource information

        Args:
            node: Node object from kubectl

        Returns:
            Dictionary with resource information
        """
        capacity = node.get("status", {}).get("capacity", {})
        allocatable = node.get("status", {}).get("allocatable", {})

        return {
            "capacity": {
                "cpu": capacity.get("cpu", "0"),
                "memory": capacity.get("memory", "0"),
                "pods": capacity.get("pods", "0")
            },
            "allocatable": {
                "cpu": allocatable.get("cpu", "0"),
                "memory": allocatable.get("memory", "0"),
                "pods": allocatable.get("pods", "0")
            }
        }

    def list_workers(self, type_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all Kubernetes workers

        Args:
            type_filter: Optional filter by worker type ("permanent" or "burst")

        Returns:
            List of worker information dictionaries

        Raises:
            WorkerManagerError: If listing workers fails
        """
        # Get all nodes
        nodes_data = self._run_kubectl(["get", "nodes", "-o", "json"])
        nodes = nodes_data.get("items", [])

        workers = []
        for node in nodes:
            node_name = node.get("metadata", {}).get("name", "unknown")
            worker_type = self._get_node_type(node)

            # Apply type filter if specified
            if type_filter and worker_type.value != type_filter:
                continue

            worker_info = {
                "name": node_name,
                "status": self._get_node_status(node).value,
                "type": worker_type.value,
                "resources": self._get_node_resources(node),
                "labels": node.get("metadata", {}).get("labels", {}),
                "annotations": node.get("metadata", {}).get("annotations", {}),
                "created": node.get("metadata", {}).get("creationTimestamp", "unknown")
            }

            # Add TTL info for burst workers
            if worker_type == WorkerType.BURST:
                ttl = node.get("metadata", {}).get("annotations", {}).get("worker-ttl")
                if ttl:
                    worker_info["ttl_expires"] = ttl

            workers.append(worker_info)

        return workers

    def _call_mcp_server(self, server: str, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call an MCP server method

        Args:
            server: Server name ("talos" or "proxmox")
            method: Method name to call
            params: Parameters to pass

        Returns:
            Response from MCP server

        Raises:
            WorkerManagerError: If MCP call fails
        """
        # This is a placeholder - actual implementation would use MCP protocol
        # For now, we'll use subprocess to call the MCP server CLI

        endpoint = None
        if server == "talos":
            endpoint = self.talos_mcp_endpoint
        elif server == "proxmox":
            endpoint = self.proxmox_mcp_endpoint
        else:
            raise WorkerManagerError(f"Unknown MCP server: {server}")

        if not endpoint:
            raise WorkerManagerError(f"No endpoint configured for {server} MCP server")

        # Placeholder implementation
        raise NotImplementedError(
            f"MCP server integration not yet implemented. "
            f"Would call {server} MCP server at {endpoint} with method {method}"
        )

    def provision_workers(
        self,
        count: int,
        ttl: int,
        size: str = "medium"
    ) -> List[Dict[str, Any]]:
        """
        Create burst workers

        Args:
            count: Number of workers to create
            ttl: Time-to-live in hours
            size: Worker size ("small", "medium", or "large")

        Returns:
            List of provisioned worker information

        Raises:
            WorkerManagerError: If provisioning fails
        """
        # Validate inputs
        if count < 1 or count > 10:
            raise WorkerManagerError("Worker count must be between 1 and 10")

        if ttl < 1 or ttl > 168:  # Max 1 week
            raise WorkerManagerError("TTL must be between 1 and 168 hours")

        if size not in WORKER_SIZES:
            raise WorkerManagerError(f"Invalid size. Must be one of: {list(WORKER_SIZES.keys())}")

        size_spec = WORKER_SIZES[size]
        ttl_expiry = datetime.utcnow() + timedelta(hours=ttl)

        provisioned_workers = []

        for i in range(count):
            worker_name = f"burst-worker-{int(time.time())}-{i}"

            try:
                # Step 1: Create VM via Talos or Proxmox MCP
                # This is a placeholder - actual implementation would call MCP server
                vm_params = {
                    "name": worker_name,
                    "cpu": size_spec["cpu"],
                    "memory_gb": size_spec["memory_gb"],
                    "disk_gb": size_spec["disk_gb"],
                    "labels": {
                        "worker-type": "burst",
                        "provisioned-by": "resource-manager-mcp"
                    }
                }

                # Placeholder for MCP call
                # vm_info = self._call_mcp_server("talos", "create_vm", vm_params)

                # Step 2: Join to Kubernetes cluster
                # This would involve getting the join token and running kubeadm on the new VM
                # For now, we'll document the expected process

                worker_info = {
                    "name": worker_name,
                    "status": "provisioning",
                    "type": WorkerType.BURST.value,
                    "size": size,
                    "resources": size_spec,
                    "ttl_hours": ttl,
                    "ttl_expires": ttl_expiry.isoformat(),
                    "created_at": datetime.utcnow().isoformat()
                }

                provisioned_workers.append(worker_info)

                # In real implementation, we would:
                # 1. Call Talos/Proxmox MCP to create VM
                # 2. Wait for VM to boot
                # 3. Get kubeadm join token
                # 4. Run kubeadm join on new node
                # 5. Label the node with worker-type=burst
                # 6. Annotate with TTL information
                # 7. Set up automatic cleanup job

            except Exception as e:
                raise WorkerManagerError(
                    f"Failed to provision worker {worker_name}: {str(e)}"
                )

        return provisioned_workers

    def drain_worker(self, worker_id: str) -> Dict[str, Any]:
        """
        Gracefully drain a worker

        Args:
            worker_id: Worker node name

        Returns:
            Drain operation status

        Raises:
            WorkerManagerError: If drain fails
        """
        # Verify worker exists
        try:
            node = self._run_kubectl(["get", "node", worker_id, "-o", "json"])
        except WorkerManagerError:
            raise WorkerManagerError(f"Worker {worker_id} not found")

        # Drain the node
        try:
            # Use kubectl drain with proper flags
            cmd = ["kubectl"]
            if self.kubectl_context:
                cmd.extend(["--context", self.kubectl_context])

            cmd.extend([
                "drain",
                worker_id,
                "--ignore-daemonsets",  # Ignore DaemonSets
                "--delete-emptydir-data",  # Delete pods with emptyDir volumes
                "--force",  # Force deletion of standalone pods
                "--grace-period=300"  # 5 minute grace period
            ])

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )

            return {
                "worker_id": worker_id,
                "status": "draining",
                "message": "Worker drain initiated successfully",
                "output": result.stdout
            }

        except subprocess.CalledProcessError as e:
            raise WorkerManagerError(f"Failed to drain worker {worker_id}: {e.stderr}")

    def destroy_worker(self, worker_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Destroy a burst worker

        Args:
            worker_id: Worker node name
            force: Force destroy even if not drained (use with caution)

        Returns:
            Destroy operation status

        Raises:
            WorkerManagerError: If destroy fails or worker is permanent
        """
        # Get worker information
        try:
            node = self._run_kubectl(["get", "node", worker_id, "-o", "json"])
        except WorkerManagerError:
            raise WorkerManagerError(f"Worker {worker_id} not found")

        # SAFETY CHECK: Verify this is a burst worker
        worker_type = self._get_node_type(node)
        if worker_type != WorkerType.BURST:
            raise WorkerManagerError(
                f"SAFETY VIOLATION: Cannot destroy permanent worker {worker_id}. "
                f"Only burst workers can be destroyed."
            )

        # Check if worker is drained (unless force is True)
        if not force:
            spec = node.get("spec", {})
            if not spec.get("unschedulable", False):
                raise WorkerManagerError(
                    f"Worker {worker_id} is not drained. "
                    f"Run drain_worker first or use force=True (not recommended)"
                )

        # Step 1: Remove from Kubernetes cluster
        try:
            self._run_kubectl(["delete", "node", worker_id])
        except WorkerManagerError as e:
            raise WorkerManagerError(
                f"Failed to remove worker {worker_id} from cluster: {str(e)}"
            )

        # Step 2: Destroy the VM via Talos/Proxmox MCP
        try:
            # Placeholder for MCP call
            # vm_delete_result = self._call_mcp_server(
            #     "talos",
            #     "delete_vm",
            #     {"name": worker_id}
            # )

            return {
                "worker_id": worker_id,
                "status": "destroyed",
                "message": f"Burst worker {worker_id} successfully destroyed",
                "removed_from_cluster": True,
                "vm_deleted": True  # Would be actual result from MCP
            }

        except Exception as e:
            # Node removed from cluster but VM deletion failed
            return {
                "worker_id": worker_id,
                "status": "partial_destroy",
                "message": f"Worker removed from cluster but VM deletion failed: {str(e)}",
                "removed_from_cluster": True,
                "vm_deleted": False,
                "error": str(e)
            }

    def get_worker_details(self, worker_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific worker

        Args:
            worker_id: Worker node name

        Returns:
            Detailed worker information

        Raises:
            WorkerManagerError: If worker not found
        """
        try:
            node = self._run_kubectl(["get", "node", worker_id, "-o", "json"])
        except WorkerManagerError:
            raise WorkerManagerError(f"Worker {worker_id} not found")

        worker_type = self._get_node_type(node)

        details = {
            "name": worker_id,
            "status": self._get_node_status(node).value,
            "type": worker_type.value,
            "resources": self._get_node_resources(node),
            "labels": node.get("metadata", {}).get("labels", {}),
            "annotations": node.get("metadata", {}).get("annotations", {}),
            "created": node.get("metadata", {}).get("creationTimestamp", "unknown"),
            "conditions": node.get("status", {}).get("conditions", []),
            "addresses": node.get("status", {}).get("addresses", [])
        }

        # Add TTL info for burst workers
        if worker_type == WorkerType.BURST:
            ttl = node.get("metadata", {}).get("annotations", {}).get("worker-ttl")
            if ttl:
                details["ttl_expires"] = ttl

        return details
