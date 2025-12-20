"""
Test suite for Resource Manager MCP Server lifecycle and basic functionality
"""

import pytest
from mcp.types import Tool


class TestServerLifecycle:
    """Test server initialization and lifecycle"""

    @pytest.mark.asyncio
    async def test_server_initialization(self, mcp_server_instance):
        """Test that the server initializes correctly"""
        assert mcp_server_instance is not None
        assert mcp_server_instance.name == "resource-manager-mcp-server"

    @pytest.mark.asyncio
    async def test_list_tools(self, mcp_server_instance):
        """Test that all tools are registered and available"""
        tools = await mcp_server_instance.list_tools()

        assert len(tools) > 0
        assert all(isinstance(tool, Tool) for tool in tools)

        # Verify expected tool names
        tool_names = [tool.name for tool in tools]

        # MCP Server Management Tools
        assert "list_mcp_servers" in tool_names
        assert "get_mcp_status" in tool_names
        assert "start_mcp" in tool_names
        assert "stop_mcp" in tool_names
        assert "scale_mcp" in tool_names

        # Worker Management Tools
        assert "list_workers" in tool_names
        assert "provision_workers" in tool_names
        assert "drain_worker" in tool_names
        assert "destroy_worker" in tool_names

        # Resource Management Tools
        assert "request_resources" in tool_names
        assert "release_resources" in tool_names
        assert "get_capacity" in tool_names

        # Monitoring Tools
        assert "health_check" in tool_names
        assert "get_metrics" in tool_names
        assert "get_cluster_status" in tool_names


class TestMCPServerManagement:
    """Test MCP server management tool stubs"""

    @pytest.mark.asyncio
    async def test_list_mcp_servers_stub(self, mcp_server_instance):
        """Test list_mcp_servers tool stub"""
        result = await mcp_server_instance.call_tool(
            "list_mcp_servers",
            {"namespace": "default"}
        )

        assert result is not None
        assert len(result) > 0
        # Stub should return a response (even if placeholder)
        assert "text" in result[0].model_dump()

    @pytest.mark.asyncio
    async def test_get_mcp_status_stub(self, mcp_server_instance):
        """Test get_mcp_status tool stub"""
        result = await mcp_server_instance.call_tool(
            "get_mcp_status",
            {"server_id": "test-server"}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_start_mcp_stub(self, mcp_server_instance, mock_mcp_server_config):
        """Test start_mcp tool stub"""
        result = await mcp_server_instance.call_tool(
            "start_mcp",
            mock_mcp_server_config
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_stop_mcp_stub(self, mcp_server_instance):
        """Test stop_mcp tool stub"""
        result = await mcp_server_instance.call_tool(
            "stop_mcp",
            {"server_id": "test-server", "force": False}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_scale_mcp_stub(self, mcp_server_instance):
        """Test scale_mcp tool stub"""
        result = await mcp_server_instance.call_tool(
            "scale_mcp",
            {"server_id": "test-server", "replicas": 3}
        )

        assert result is not None
        assert len(result) > 0


class TestWorkerManagement:
    """Test worker management tool stubs"""

    @pytest.mark.asyncio
    async def test_list_workers_stub(self, mcp_server_instance):
        """Test list_workers tool stub"""
        result = await mcp_server_instance.call_tool(
            "list_workers",
            {"namespace": "cortex"}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_provision_workers_stub(self, mcp_server_instance):
        """Test provision_workers tool stub"""
        result = await mcp_server_instance.call_tool(
            "provision_workers",
            {
                "worker_type": "feature-implementer",
                "count": 2,
                "namespace": "cortex"
            }
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_drain_worker_stub(self, mcp_server_instance):
        """Test drain_worker tool stub"""
        result = await mcp_server_instance.call_tool(
            "drain_worker",
            {"worker_id": "test-worker-001", "timeout_minutes": 30}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_destroy_worker_stub(self, mcp_server_instance):
        """Test destroy_worker tool stub"""
        result = await mcp_server_instance.call_tool(
            "destroy_worker",
            {"worker_id": "test-worker-001"}
        )

        assert result is not None
        assert len(result) > 0


class TestResourceManagement:
    """Test resource management tool stubs"""

    @pytest.mark.asyncio
    async def test_request_resources_stub(self, mcp_server_instance, mock_resource_request):
        """Test request_resources tool stub"""
        result = await mcp_server_instance.call_tool(
            "request_resources",
            mock_resource_request
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_release_resources_stub(self, mcp_server_instance):
        """Test release_resources tool stub"""
        result = await mcp_server_instance.call_tool(
            "release_resources",
            {"request_id": "req-001"}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_get_capacity_stub(self, mcp_server_instance):
        """Test get_capacity tool stub"""
        result = await mcp_server_instance.call_tool(
            "get_capacity",
            {}
        )

        assert result is not None
        assert len(result) > 0


class TestMonitoring:
    """Test monitoring and health tool stubs"""

    @pytest.mark.asyncio
    async def test_health_check_stub(self, mcp_server_instance):
        """Test health_check tool stub"""
        result = await mcp_server_instance.call_tool(
            "health_check",
            {"include_mcp_servers": True, "include_workers": True}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_get_metrics_stub(self, mcp_server_instance):
        """Test get_metrics tool stub"""
        result = await mcp_server_instance.call_tool(
            "get_metrics",
            {"metric_type": "all", "time_range_minutes": 60}
        )

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_get_cluster_status_stub(self, mcp_server_instance):
        """Test get_cluster_status tool stub"""
        result = await mcp_server_instance.call_tool(
            "get_cluster_status",
            {"detailed": True}
        )

        assert result is not None
        assert len(result) > 0


class TestErrorHandling:
    """Test error handling"""

    @pytest.mark.asyncio
    async def test_unknown_tool(self, mcp_server_instance):
        """Test handling of unknown tool calls"""
        result = await mcp_server_instance.call_tool(
            "unknown_tool",
            {}
        )

        assert result is not None
        assert len(result) > 0
        assert "Unknown tool" in result[0].text

    @pytest.mark.asyncio
    async def test_missing_required_parameter(self, mcp_server_instance):
        """Test handling of missing required parameters"""
        # This should trigger an error since server_id is required
        result = await mcp_server_instance.call_tool(
            "get_mcp_status",
            {}
        )

        assert result is not None
        # Should return error message
        assert len(result) > 0
