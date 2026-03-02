"""
Pytest configuration and shared fixtures for resource-manager-mcp-server tests
"""

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_k8s_client():
    """Mock Kubernetes client for testing"""
    client = MagicMock()
    client.list_namespaced_deployment = AsyncMock(return_value=MagicMock(items=[]))
    client.list_namespaced_pod = AsyncMock(return_value=MagicMock(items=[]))
    client.create_namespaced_deployment = AsyncMock(return_value=MagicMock())
    client.delete_namespaced_deployment = AsyncMock(return_value=MagicMock())
    client.patch_namespaced_deployment_scale = AsyncMock(return_value=MagicMock())
    return client


@pytest.fixture
def mock_mcp_server_config():
    """Mock MCP server configuration"""
    return {
        "server_id": "test-mcp-server",
        "name": "Test MCP Server",
        "image": "test/mcp-server:latest",
        "replicas": 1,
        "resources": {
            "requests": {"cpu": "100m", "memory": "128Mi"},
            "limits": {"cpu": "500m", "memory": "512Mi"}
        }
    }


@pytest.fixture
def mock_worker_config():
    """Mock worker configuration"""
    return {
        "worker_id": "test-worker-001",
        "worker_type": "feature-implementer",
        "namespace": "cortex",
        "resources": {
            "requests": {"cpu": "500m", "memory": "1Gi"},
            "limits": {"cpu": "2", "memory": "4Gi"}
        }
    }


@pytest.fixture
def mock_resource_request():
    """Mock resource allocation request"""
    return {
        "request_id": "req-001",
        "cpu": "500m",
        "memory": "1Gi",
        "duration_minutes": 60
    }


@pytest.fixture
async def mcp_server_instance():
    """Fixture providing an MCP server instance for testing"""
    from resource_manager_mcp_server import app
    return app


@pytest.fixture
def sample_cluster_status():
    """Sample cluster status data for testing"""
    return {
        "cluster_health": "healthy",
        "total_nodes": 3,
        "ready_nodes": 3,
        "capacity": {
            "cpu": "12",
            "memory": "48Gi"
        },
        "allocatable": {
            "cpu": "11",
            "memory": "45Gi"
        },
        "allocated": {
            "cpu": "4",
            "memory": "16Gi"
        }
    }


@pytest.fixture
def sample_metrics():
    """Sample metrics data for testing"""
    return {
        "resource_utilization": {
            "cpu_usage_percent": 36.4,
            "memory_usage_percent": 35.6
        },
        "performance": {
            "avg_response_time_ms": 125,
            "requests_per_second": 45
        }
    }
