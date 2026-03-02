"""
Unit tests for MCP Lifecycle Manager

These tests use mocking to avoid requiring a real Kubernetes cluster.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime
from kubernetes.client.rest import ApiException


@pytest.fixture
def mock_deployment():
    """Create a mock Kubernetes deployment."""
    deployment = Mock()
    deployment.metadata = Mock()
    deployment.metadata.name = "test-mcp-server"
    deployment.metadata.annotations = {}

    deployment.spec = Mock()
    deployment.spec.replicas = 1
    deployment.spec.template = Mock()
    deployment.spec.template.spec = Mock()
    deployment.spec.template.spec.termination_grace_period_seconds = 30

    deployment.status = Mock()
    deployment.status.replicas = 1
    deployment.status.ready_replicas = 1
    deployment.status.available_replicas = 1
    deployment.status.updated_replicas = 1
    deployment.status.conditions = []

    return deployment


@pytest.fixture
def mock_service():
    """Create a mock Kubernetes service."""
    service = Mock()
    service.spec = Mock()
    service.spec.type = "ClusterIP"
    service.spec.cluster_ip = "10.0.0.1"

    port = Mock()
    port.port = 8080
    port.node_port = None
    service.spec.ports = [port]

    service.status = Mock()
    service.status.load_balancer = Mock()
    service.status.load_balancer.ingress = []

    return service


@pytest.fixture
def manager():
    """Create a MCPLifecycleManager instance with mocked Kubernetes client."""
    with patch('resource_manager_mcp_server.config.load_kube_config'):
        from resource_manager_mcp_server import MCPLifecycleManager
        manager = MCPLifecycleManager(namespace="test-namespace")
        return manager


class TestMCPLifecycleManager:
    """Test suite for MCPLifecycleManager."""

    def test_validate_mcp_name_valid(self, manager):
        """Test validation of valid MCP server names."""
        assert manager._validate_mcp_name("test-server") == "test-server"
        assert manager._validate_mcp_name("server123") == "server123"
        assert manager._validate_mcp_name("my-mcp-server-1") == "my-mcp-server-1"

    def test_validate_mcp_name_invalid(self, manager):
        """Test validation rejects invalid names."""
        with pytest.raises(ValueError):
            manager._validate_mcp_name("")

        with pytest.raises(ValueError):
            manager._validate_mcp_name("-invalid")

        with pytest.raises(ValueError):
            manager._validate_mcp_name("invalid-")

        with pytest.raises(ValueError):
            manager._validate_mcp_name("invalid_name")

        with pytest.raises(ValueError):
            manager._validate_mcp_name(None)

    def test_validate_replicas_valid(self, manager):
        """Test validation of valid replica counts."""
        assert manager._validate_replicas(0) == 0
        assert manager._validate_replicas(5) == 5
        assert manager._validate_replicas(10) == 10

    def test_validate_replicas_invalid(self, manager):
        """Test validation rejects invalid replica counts."""
        with pytest.raises(ValueError):
            manager._validate_replicas(-1)

        with pytest.raises(ValueError):
            manager._validate_replicas(11)

        with pytest.raises(ValueError):
            manager._validate_replicas("invalid")

        with pytest.raises(ValueError):
            manager._validate_replicas(None)

    def test_get_deployment_status_running(self, manager, mock_deployment):
        """Test status detection for running deployment."""
        mock_deployment.spec.replicas = 3
        mock_deployment.status.ready_replicas = 3
        mock_deployment.status.replicas = 3

        status = manager._get_deployment_status(mock_deployment)
        assert status == "running"

    def test_get_deployment_status_stopped(self, manager, mock_deployment):
        """Test status detection for stopped deployment."""
        mock_deployment.spec.replicas = 0
        mock_deployment.status.ready_replicas = 0
        mock_deployment.status.replicas = 0

        status = manager._get_deployment_status(mock_deployment)
        assert status == "stopped"

    def test_get_deployment_status_scaling(self, manager, mock_deployment):
        """Test status detection for scaling deployment."""
        mock_deployment.spec.replicas = 3
        mock_deployment.status.ready_replicas = 1
        mock_deployment.status.replicas = 2

        status = manager._get_deployment_status(mock_deployment)
        assert status == "scaling"

    def test_list_mcp_servers(self, manager, mock_deployment):
        """Test listing MCP servers."""
        deployments = Mock()
        deployments.items = [mock_deployment]

        with patch.object(manager.apps_v1, 'list_namespaced_deployment', return_value=deployments):
            with patch.object(manager, '_get_service_endpoints', return_value=["http://10.0.0.1:8080"]):
                servers = manager.list_mcp_servers()

                assert len(servers) == 1
                assert servers[0]['name'] == "test-mcp-server"
                assert servers[0]['status'] == "running"
                assert servers[0]['replicas'] == 1
                assert servers[0]['ready_replicas'] == 1
                assert len(servers[0]['endpoints']) == 1

    def test_get_mcp_status(self, manager, mock_deployment):
        """Test getting detailed status of an MCP server."""
        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager, '_get_service_endpoints', return_value=["http://10.0.0.1:8080"]):
                status = manager.get_mcp_status("test-mcp-server")

                assert status['name'] == "test-mcp-server"
                assert status['status'] == "running"
                assert status['replicas'] == 1
                assert status['ready_replicas'] == 1
                assert status['available_replicas'] == 1
                assert len(status['endpoints']) == 1

    def test_get_mcp_status_not_found(self, manager):
        """Test error handling when server not found."""
        error = ApiException(status=404)
        with patch.object(manager.apps_v1, 'read_namespaced_deployment', side_effect=error):
            with pytest.raises(ValueError) as exc_info:
                manager.get_mcp_status("non-existent")

            assert "not found" in str(exc_info.value)

    def test_start_mcp(self, manager, mock_deployment):
        """Test starting an MCP server."""
        mock_deployment.spec.replicas = 0

        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager.apps_v1, 'patch_namespaced_deployment'):
                with patch.object(manager, 'get_mcp_status', return_value={'name': 'test', 'status': 'running'}):
                    with patch.object(manager, '_wait_for_ready', return_value=True):
                        result = manager.start_mcp("test-mcp-server", wait_ready=True)

                        assert mock_deployment.spec.replicas == 1
                        assert result['status'] == 'running'

    def test_start_mcp_already_running(self, manager, mock_deployment):
        """Test starting an already running MCP server."""
        mock_deployment.spec.replicas = 1

        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager, 'get_mcp_status', return_value={'name': 'test', 'status': 'running'}):
                result = manager.start_mcp("test-mcp-server", wait_ready=False)

                # Should return current status without changes
                assert result['status'] == 'running'

    def test_stop_mcp(self, manager, mock_deployment):
        """Test stopping an MCP server."""
        mock_deployment.spec.replicas = 1

        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager.apps_v1, 'patch_namespaced_deployment'):
                with patch.object(manager, 'get_mcp_status', return_value={'name': 'test', 'status': 'stopped'}):
                    result = manager.stop_mcp("test-mcp-server", force=False)

                    assert mock_deployment.spec.replicas == 0
                    assert result['status'] == 'stopped'

    def test_stop_mcp_force(self, manager, mock_deployment):
        """Test force stopping an MCP server."""
        mock_deployment.spec.replicas = 1

        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager.apps_v1, 'patch_namespaced_deployment'):
                with patch.object(manager.core_v1, 'delete_collection_namespaced_pod'):
                    with patch.object(manager, 'get_mcp_status', return_value={'name': 'test', 'status': 'stopped'}):
                        result = manager.stop_mcp("test-mcp-server", force=True)

                        assert mock_deployment.spec.replicas == 0
                        assert mock_deployment.spec.template.spec.termination_grace_period_seconds == 0

    def test_scale_mcp(self, manager, mock_deployment):
        """Test scaling an MCP server."""
        mock_deployment.spec.replicas = 1

        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with patch.object(manager.apps_v1, 'patch_namespaced_deployment'):
                with patch.object(manager, 'get_mcp_status', return_value={'name': 'test', 'replicas': 3}):
                    result = manager.scale_mcp("test-mcp-server", replicas=3, wait_ready=False)

                    assert mock_deployment.spec.replicas == 3
                    assert result['replicas'] == 3

    def test_scale_mcp_invalid_replicas(self, manager, mock_deployment):
        """Test scaling with invalid replica count."""
        with patch.object(manager, '_get_deployment', return_value=mock_deployment):
            with pytest.raises(ValueError):
                manager.scale_mcp("test-mcp-server", replicas=15)

            with pytest.raises(ValueError):
                manager.scale_mcp("test-mcp-server", replicas=-1)

    def test_get_service_endpoints_clusterip(self, manager, mock_service):
        """Test getting ClusterIP service endpoints."""
        mock_service.spec.type = "ClusterIP"
        mock_service.spec.cluster_ip = "10.0.0.1"

        with patch.object(manager.core_v1, 'read_namespaced_service', return_value=mock_service):
            endpoints = manager._get_service_endpoints("test-service")

            assert len(endpoints) == 1
            assert "10.0.0.1:8080" in endpoints[0]

    def test_get_service_endpoints_not_found(self, manager):
        """Test handling missing service."""
        error = ApiException(status=404)
        with patch.object(manager.core_v1, 'read_namespaced_service', side_effect=error):
            endpoints = manager._get_service_endpoints("missing-service")

            assert endpoints == []


class TestConvenienceFunctions:
    """Test convenience functions."""

    @patch('resource_manager_mcp_server.get_manager')
    def test_list_mcp_servers_function(self, mock_get_manager):
        """Test list_mcp_servers convenience function."""
        from resource_manager_mcp_server import list_mcp_servers

        mock_manager = Mock()
        mock_manager.list_mcp_servers.return_value = [{'name': 'test'}]
        mock_get_manager.return_value = mock_manager

        result = list_mcp_servers()

        assert len(result) == 1
        assert result[0]['name'] == 'test'
        mock_manager.list_mcp_servers.assert_called_once()

    @patch('resource_manager_mcp_server.get_manager')
    def test_get_mcp_status_function(self, mock_get_manager):
        """Test get_mcp_status convenience function."""
        from resource_manager_mcp_server import get_mcp_status

        mock_manager = Mock()
        mock_manager.get_mcp_status.return_value = {'name': 'test', 'status': 'running'}
        mock_get_manager.return_value = mock_manager

        result = get_mcp_status("test-server")

        assert result['status'] == 'running'
        mock_manager.get_mcp_status.assert_called_once_with("test-server")

    @patch('resource_manager_mcp_server.get_manager')
    def test_start_mcp_function(self, mock_get_manager):
        """Test start_mcp convenience function."""
        from resource_manager_mcp_server import start_mcp

        mock_manager = Mock()
        mock_manager.start_mcp.return_value = {'name': 'test', 'status': 'running'}
        mock_get_manager.return_value = mock_manager

        result = start_mcp("test-server", wait_ready=True)

        assert result['status'] == 'running'
        mock_manager.start_mcp.assert_called_once_with("test-server", True, 300)

    @patch('resource_manager_mcp_server.get_manager')
    def test_stop_mcp_function(self, mock_get_manager):
        """Test stop_mcp convenience function."""
        from resource_manager_mcp_server import stop_mcp

        mock_manager = Mock()
        mock_manager.stop_mcp.return_value = {'name': 'test', 'status': 'stopped'}
        mock_get_manager.return_value = mock_manager

        result = stop_mcp("test-server", force=True)

        assert result['status'] == 'stopped'
        mock_manager.stop_mcp.assert_called_once_with("test-server", True)

    @patch('resource_manager_mcp_server.get_manager')
    def test_scale_mcp_function(self, mock_get_manager):
        """Test scale_mcp convenience function."""
        from resource_manager_mcp_server import scale_mcp

        mock_manager = Mock()
        mock_manager.scale_mcp.return_value = {'name': 'test', 'replicas': 5}
        mock_get_manager.return_value = mock_manager

        result = scale_mcp("test-server", 5, wait_ready=True)

        assert result['replicas'] == 5
        mock_manager.scale_mcp.assert_called_once_with("test-server", 5, True, 300)
