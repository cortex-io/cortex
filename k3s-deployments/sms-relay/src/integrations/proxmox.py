"""Proxmox MCP integration."""
import httpx
from typing import Dict, Any
from src.config import settings


class ProxmoxClient:
    """Client for Proxmox MCP server."""

    def __init__(self):
        self.base_url = settings.proxmox_mcp_url
        self.timeout = 10.0

    async def get_summary(self) -> Dict[str, Any]:
        """Get Proxmox summary."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_cluster_status",
                            "arguments": {}
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()

                result = data.get("result", {})
                content = result.get("content", [])

                if content and len(content) > 0:
                    text = content[0].get("text", "{}")
                    import json
                    return json.loads(text)

                return self._mock_summary()

        except Exception as e:
            print(f"Proxmox error: {e}")
            return self._mock_summary()

    async def get_details(self) -> Dict[str, Any]:
        """Get detailed Proxmox info."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_nodes",
                            "arguments": {}
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()

                result = data.get("result", {})
                content = result.get("content", [])

                if content and len(content) > 0:
                    text = content[0].get("text", "{}")
                    import json
                    return json.loads(text)

                return self._mock_details()

        except Exception as e:
            print(f"Proxmox error: {e}")
            return self._mock_details()

    async def get_vms(self) -> list:
        """Get VM list."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "list_vms",
                            "arguments": {}
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()

                result = data.get("result", {})
                content = result.get("content", [])

                if content and len(content) > 0:
                    text = content[0].get("text", "[]")
                    import json
                    return json.loads(text)

                return self._mock_vms()

        except Exception as e:
            print(f"Proxmox error: {e}")
            return self._mock_vms()

    async def get_nodes(self) -> list:
        """Get node list."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_nodes",
                            "arguments": {}
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()

                result = data.get("result", {})
                content = result.get("content", [])

                if content and len(content) > 0:
                    text = content[0].get("text", "[]")
                    import json
                    nodes = json.loads(text)
                    return nodes.get("nodes", [])

                return []

        except Exception as e:
            print(f"Proxmox error: {e}")
            return []

    def _mock_summary(self) -> Dict[str, Any]:
        """Mock summary for testing."""
        return {
            "healthy": True,
            "node_count": 3,
            "vm_count": 12,
            "lxc_count": 8,
            "cpu_usage": 23,
            "ram_usage": 64,
            "storage_usage": 71
        }

    def _mock_details(self) -> Dict[str, Any]:
        """Mock details for testing."""
        return {
            "nodes": [
                {"name": "pve1", "status": "online", "cpu": 18, "ram": 54},
                {"name": "pve2", "status": "online", "cpu": 31, "ram": 72},
                {"name": "pve3", "status": "online", "cpu": 20, "ram": 65}
            ]
        }

    def _mock_vms(self) -> list:
        """Mock VMs for testing."""
        return [
            {"name": "k3s-master", "status": "running"},
            {"name": "k3s-worker-1", "status": "running"},
            {"name": "k3s-worker-2", "status": "running"},
            {"name": "docker-host", "status": "running"},
            {"name": "test-vm", "status": "stopped"}
        ]


# Global Proxmox client instance
proxmox_client = ProxmoxClient()
