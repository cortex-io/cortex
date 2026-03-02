"""
MCP Lifecycle Management Tools for Kubernetes-based MCP Servers

This module provides tools for managing the lifecycle of MCP (Model Context Protocol)
servers running on Kubernetes, including starting, stopping, scaling, and monitoring.
"""

import time
from typing import Dict, List, Optional, Any
from datetime import datetime
from kubernetes import client, config
from kubernetes.client.rest import ApiException


class MCPLifecycleManager:
    """Manages lifecycle operations for MCP servers running on Kubernetes."""

    def __init__(self, namespace: str = "default", kubeconfig_path: Optional[str] = None):
        """
        Initialize the MCP Lifecycle Manager.

        Args:
            namespace: Kubernetes namespace where MCP servers are deployed
            kubeconfig_path: Path to kubeconfig file (optional, uses default if not provided)
        """
        self.namespace = namespace
        self._load_kubernetes_config(kubeconfig_path)
        self.apps_v1 = client.AppsV1Api()
        self.core_v1 = client.CoreV1Api()

    def _load_kubernetes_config(self, kubeconfig_path: Optional[str] = None):
        """Load Kubernetes configuration from cluster or kubeconfig file."""
        try:
            # Try in-cluster config first (for running inside k8s)
            config.load_incluster_config()
        except config.ConfigException:
            # Fall back to kubeconfig file
            if kubeconfig_path:
                config.load_kube_config(config_file=kubeconfig_path)
            else:
                config.load_kube_config()

    def _validate_mcp_name(self, name: str) -> str:
        """
        Validate MCP server name.

        Args:
            name: MCP server name

        Returns:
            Validated name

        Raises:
            ValueError: If name is invalid
        """
        if not name or not isinstance(name, str):
            raise ValueError("MCP server name must be a non-empty string")

        # Kubernetes name validation (lowercase alphanumeric with hyphens)
        if not all(c.isalnum() or c == '-' for c in name):
            raise ValueError(f"Invalid MCP server name: {name}. Must contain only alphanumeric characters and hyphens")

        if name.startswith('-') or name.endswith('-'):
            raise ValueError(f"Invalid MCP server name: {name}. Cannot start or end with hyphen")

        return name.lower()

    def _validate_replicas(self, replicas: int) -> int:
        """
        Validate replica count.

        Args:
            replicas: Number of replicas

        Returns:
            Validated replica count

        Raises:
            ValueError: If replica count is invalid
        """
        if not isinstance(replicas, int):
            raise ValueError("Replicas must be an integer")

        if replicas < 0 or replicas > 10:
            raise ValueError(f"Replicas must be between 0 and 10, got: {replicas}")

        return replicas

    def _get_deployment(self, name: str) -> client.V1Deployment:
        """
        Get Kubernetes deployment for MCP server.

        Args:
            name: MCP server name

        Returns:
            Deployment object

        Raises:
            ValueError: If deployment not found
            ApiException: If Kubernetes API error occurs
        """
        try:
            deployment = self.apps_v1.read_namespaced_deployment(
                name=name,
                namespace=self.namespace
            )
            return deployment
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"MCP server '{name}' not found in namespace '{self.namespace}'")
            raise

    def _get_service_endpoints(self, name: str) -> List[str]:
        """
        Get service endpoints for MCP server.

        Args:
            name: MCP server name

        Returns:
            List of endpoint URLs
        """
        try:
            service = self.core_v1.read_namespaced_service(
                name=name,
                namespace=self.namespace
            )

            endpoints = []
            if service.spec.type == "LoadBalancer":
                if service.status.load_balancer.ingress:
                    for ingress in service.status.load_balancer.ingress:
                        ip = ingress.ip or ingress.hostname
                        for port in service.spec.ports:
                            endpoints.append(f"http://{ip}:{port.port}")
            elif service.spec.type == "NodePort":
                for port in service.spec.ports:
                    endpoints.append(f"nodePort://*:{port.node_port}")
            elif service.spec.type == "ClusterIP":
                cluster_ip = service.spec.cluster_ip
                for port in service.spec.ports:
                    endpoints.append(f"http://{cluster_ip}:{port.port}")

            return endpoints
        except ApiException:
            # Service might not exist
            return []

    def _get_deployment_status(self, deployment: client.V1Deployment) -> str:
        """
        Determine deployment status.

        Args:
            deployment: Kubernetes deployment object

        Returns:
            Status string: "running", "stopped", "scaling", "pending"
        """
        spec_replicas = deployment.spec.replicas or 0
        status = deployment.status
        ready_replicas = status.ready_replicas or 0
        replicas = status.replicas or 0

        if spec_replicas == 0:
            return "stopped"
        elif ready_replicas == spec_replicas:
            return "running"
        elif replicas != spec_replicas or ready_replicas != spec_replicas:
            return "scaling"
        else:
            return "pending"

    def _wait_for_ready(self, name: str, timeout: int = 300) -> bool:
        """
        Wait for deployment to be ready.

        Args:
            name: MCP server name
            timeout: Maximum time to wait in seconds

        Returns:
            True if ready, False if timeout
        """
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                deployment = self._get_deployment(name)
                spec_replicas = deployment.spec.replicas or 0
                ready_replicas = deployment.status.ready_replicas or 0

                if spec_replicas > 0 and ready_replicas == spec_replicas:
                    return True

                time.sleep(2)
            except Exception:
                time.sleep(2)

        return False

    def list_mcp_servers(self, label_selector: str = "app.kubernetes.io/component=mcp-server") -> List[Dict[str, Any]]:
        """
        List all registered MCP servers.

        Args:
            label_selector: Kubernetes label selector to filter MCP deployments

        Returns:
            List of dictionaries containing:
                - name: Server name
                - status: Current status (running/stopped/scaling/pending)
                - replicas: Desired number of replicas
                - ready_replicas: Number of ready replicas
                - endpoints: List of service endpoints

        Raises:
            ApiException: If Kubernetes API error occurs
        """
        try:
            deployments = self.apps_v1.list_namespaced_deployment(
                namespace=self.namespace,
                label_selector=label_selector
            )

            servers = []
            for deployment in deployments.items:
                name = deployment.metadata.name
                status_str = self._get_deployment_status(deployment)
                spec_replicas = deployment.spec.replicas or 0
                ready_replicas = deployment.status.ready_replicas or 0
                endpoints = self._get_service_endpoints(name)

                servers.append({
                    "name": name,
                    "status": status_str,
                    "replicas": spec_replicas,
                    "ready_replicas": ready_replicas,
                    "endpoints": endpoints
                })

            return servers

        except ApiException as e:
            raise Exception(f"Failed to list MCP servers: {e.reason}")

    def get_mcp_status(self, name: str) -> Dict[str, Any]:
        """
        Get detailed status of one MCP server.

        Args:
            name: MCP server name

        Returns:
            Dictionary containing:
                - name: Server name
                - status: Current status (running/stopped/scaling/pending)
                - replicas: Desired number of replicas
                - ready_replicas: Number of ready replicas
                - available_replicas: Number of available replicas
                - updated_replicas: Number of updated replicas
                - endpoints: List of service endpoints
                - last_activity: Timestamp of last deployment update
                - conditions: List of deployment conditions

        Raises:
            ValueError: If MCP server not found
            ApiException: If Kubernetes API error occurs
        """
        name = self._validate_mcp_name(name)

        try:
            deployment = self._get_deployment(name)
            status_str = self._get_deployment_status(deployment)
            endpoints = self._get_service_endpoints(name)

            # Extract status information
            status = deployment.status
            spec_replicas = deployment.spec.replicas or 0
            ready_replicas = status.ready_replicas or 0
            available_replicas = status.available_replicas or 0
            updated_replicas = status.updated_replicas or 0

            # Get last activity timestamp
            last_activity = None
            if deployment.metadata.annotations:
                last_activity = deployment.metadata.annotations.get(
                    "deployment.kubernetes.io/revision-timestamp"
                )

            if not last_activity and status.conditions:
                # Use the latest condition timestamp
                timestamps = [c.last_update_time for c in status.conditions if c.last_update_time]
                if timestamps:
                    last_activity = max(timestamps).isoformat()

            # Format conditions
            conditions = []
            if status.conditions:
                for condition in status.conditions:
                    conditions.append({
                        "type": condition.type,
                        "status": condition.status,
                        "reason": condition.reason,
                        "message": condition.message,
                        "last_update": condition.last_update_time.isoformat() if condition.last_update_time else None
                    })

            return {
                "name": name,
                "status": status_str,
                "replicas": spec_replicas,
                "ready_replicas": ready_replicas,
                "available_replicas": available_replicas,
                "updated_replicas": updated_replicas,
                "endpoints": endpoints,
                "last_activity": last_activity,
                "conditions": conditions
            }

        except ValueError:
            raise
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"MCP server '{name}' not found in namespace '{self.namespace}'")
            raise Exception(f"Failed to get MCP server status: {e.reason}")

    def start_mcp(self, name: str, wait_ready: bool = True, timeout: int = 300) -> Dict[str, Any]:
        """
        Start an MCP server by scaling from 0 to 1 replica.

        Args:
            name: MCP server name
            wait_ready: Wait for the server to be ready before returning
            timeout: Maximum time to wait for ready state (seconds)

        Returns:
            Dictionary containing the new status of the MCP server

        Raises:
            ValueError: If MCP server not found or invalid parameters
            ApiException: If Kubernetes API error occurs
            TimeoutError: If wait_ready=True and server doesn't become ready in time
        """
        name = self._validate_mcp_name(name)

        try:
            deployment = self._get_deployment(name)
            current_replicas = deployment.spec.replicas or 0

            if current_replicas > 0:
                # Already running, return current status
                return self.get_mcp_status(name)

            # Scale to 1 replica
            deployment.spec.replicas = 1
            self.apps_v1.patch_namespaced_deployment(
                name=name,
                namespace=self.namespace,
                body=deployment
            )

            # Wait for ready if requested
            if wait_ready:
                ready = self._wait_for_ready(name, timeout)
                if not ready:
                    raise TimeoutError(
                        f"MCP server '{name}' did not become ready within {timeout} seconds"
                    )

            # Return updated status
            return self.get_mcp_status(name)

        except ValueError:
            raise
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"MCP server '{name}' not found in namespace '{self.namespace}'")
            raise Exception(f"Failed to start MCP server: {e.reason}")

    def stop_mcp(self, name: str, force: bool = False) -> Dict[str, Any]:
        """
        Stop an MCP server by scaling to 0 replicas.

        Args:
            name: MCP server name
            force: If True, immediately terminate pods. If False, allow graceful shutdown

        Returns:
            Dictionary containing the new status of the MCP server

        Raises:
            ValueError: If MCP server not found or invalid parameters
            ApiException: If Kubernetes API error occurs
        """
        name = self._validate_mcp_name(name)

        try:
            deployment = self._get_deployment(name)
            current_replicas = deployment.spec.replicas or 0

            if current_replicas == 0:
                # Already stopped, return current status
                return self.get_mcp_status(name)

            # Scale to 0 replicas
            deployment.spec.replicas = 0

            # Handle force shutdown
            if force:
                # Set terminationGracePeriodSeconds to 0 for immediate termination
                if deployment.spec.template.spec.termination_grace_period_seconds != 0:
                    deployment.spec.template.spec.termination_grace_period_seconds = 0

            self.apps_v1.patch_namespaced_deployment(
                name=name,
                namespace=self.namespace,
                body=deployment
            )

            # If force, delete pods immediately
            if force:
                try:
                    self.core_v1.delete_collection_namespaced_pod(
                        namespace=self.namespace,
                        label_selector=f"app={name}",
                        grace_period_seconds=0
                    )
                except ApiException:
                    # Ignore errors during forced pod deletion
                    pass

            # Return updated status
            time.sleep(1)  # Brief pause to allow status to update
            return self.get_mcp_status(name)

        except ValueError:
            raise
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"MCP server '{name}' not found in namespace '{self.namespace}'")
            raise Exception(f"Failed to stop MCP server: {e.reason}")

    def scale_mcp(self, name: str, replicas: int, wait_ready: bool = False, timeout: int = 300) -> Dict[str, Any]:
        """
        Scale an MCP server horizontally.

        Args:
            name: MCP server name
            replicas: Desired number of replicas (0-10)
            wait_ready: Wait for all replicas to be ready before returning
            timeout: Maximum time to wait for ready state (seconds)

        Returns:
            Dictionary containing the new status of the MCP server

        Raises:
            ValueError: If MCP server not found or invalid parameters
            ApiException: If Kubernetes API error occurs
            TimeoutError: If wait_ready=True and replicas don't become ready in time
        """
        name = self._validate_mcp_name(name)
        replicas = self._validate_replicas(replicas)

        try:
            deployment = self._get_deployment(name)
            current_replicas = deployment.spec.replicas or 0

            if current_replicas == replicas:
                # Already at desired scale, return current status
                return self.get_mcp_status(name)

            # Update replica count
            deployment.spec.replicas = replicas
            self.apps_v1.patch_namespaced_deployment(
                name=name,
                namespace=self.namespace,
                body=deployment
            )

            # Wait for ready if requested
            if wait_ready and replicas > 0:
                ready = self._wait_for_ready(name, timeout)
                if not ready:
                    raise TimeoutError(
                        f"MCP server '{name}' did not scale to {replicas} replicas within {timeout} seconds"
                    )

            # Return updated status
            return self.get_mcp_status(name)

        except ValueError:
            raise
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"MCP server '{name}' not found in namespace '{self.namespace}'")
            raise Exception(f"Failed to scale MCP server: {e.reason}")


# Convenience functions for direct usage

_manager_instance = None


def get_manager(namespace: str = "default", kubeconfig_path: Optional[str] = None) -> MCPLifecycleManager:
    """
    Get or create a singleton instance of MCPLifecycleManager.

    Args:
        namespace: Kubernetes namespace
        kubeconfig_path: Path to kubeconfig file

    Returns:
        MCPLifecycleManager instance
    """
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = MCPLifecycleManager(namespace, kubeconfig_path)
    return _manager_instance


def list_mcp_servers(namespace: str = "default", label_selector: str = "app.kubernetes.io/component=mcp-server") -> List[Dict[str, Any]]:
    """
    List all registered MCP servers.

    Args:
        namespace: Kubernetes namespace
        label_selector: Label selector to filter MCP deployments

    Returns:
        List of MCP server information dictionaries
    """
    manager = get_manager(namespace)
    return manager.list_mcp_servers(label_selector)


def get_mcp_status(name: str, namespace: str = "default") -> Dict[str, Any]:
    """
    Get detailed status of one MCP server.

    Args:
        name: MCP server name
        namespace: Kubernetes namespace

    Returns:
        MCP server status dictionary
    """
    manager = get_manager(namespace)
    return manager.get_mcp_status(name)


def start_mcp(name: str, wait_ready: bool = True, timeout: int = 300, namespace: str = "default") -> Dict[str, Any]:
    """
    Start an MCP server.

    Args:
        name: MCP server name
        wait_ready: Wait for server to be ready
        timeout: Maximum wait time in seconds
        namespace: Kubernetes namespace

    Returns:
        MCP server status dictionary after starting
    """
    manager = get_manager(namespace)
    return manager.start_mcp(name, wait_ready, timeout)


def stop_mcp(name: str, force: bool = False, namespace: str = "default") -> Dict[str, Any]:
    """
    Stop an MCP server.

    Args:
        name: MCP server name
        force: Force immediate termination
        namespace: Kubernetes namespace

    Returns:
        MCP server status dictionary after stopping
    """
    manager = get_manager(namespace)
    return manager.stop_mcp(name, force)


def scale_mcp(name: str, replicas: int, wait_ready: bool = False, timeout: int = 300, namespace: str = "default") -> Dict[str, Any]:
    """
    Scale an MCP server.

    Args:
        name: MCP server name
        replicas: Desired replica count (0-10)
        wait_ready: Wait for all replicas to be ready
        timeout: Maximum wait time in seconds
        namespace: Kubernetes namespace

    Returns:
        MCP server status dictionary after scaling
    """
    manager = get_manager(namespace)
    return manager.scale_mcp(name, replicas, wait_ready, timeout)


__all__ = [
    "MCPLifecycleManager",
    "list_mcp_servers",
    "get_mcp_status",
    "start_mcp",
    "stop_mcp",
    "scale_mcp",
    "get_manager"
]
