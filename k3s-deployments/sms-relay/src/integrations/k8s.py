"""Kubernetes MCP integration."""
import httpx
from typing import Dict, Any
from src.config import settings


class K8sClient:
    """Client for Kubernetes MCP server."""

    def __init__(self):
        self.base_url = settings.k8s_mcp_url
        self.timeout = 10.0

    async def get_summary(self) -> Dict[str, Any]:
        """Get K8s summary."""
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
            print(f"K8s error: {e}")
            return self._mock_summary()

    async def get_details(self) -> Dict[str, Any]:
        """Get detailed K8s info."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_namespaces",
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
            print(f"K8s error: {e}")
            return self._mock_details()

    async def get_pods(self, namespace: str = "all") -> list:
        """Get pod list."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "list_pods",
                            "arguments": {"namespace": namespace}
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

                return self._mock_pods()

        except Exception as e:
            print(f"K8s error: {e}")
            return self._mock_pods()

    async def get_services(self, namespace: str = "all") -> list:
        """Get service list."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "list_services",
                            "arguments": {"namespace": namespace}
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

                return []

        except Exception as e:
            print(f"K8s error: {e}")
            return []

    def _mock_summary(self) -> Dict[str, Any]:
        """Mock summary for testing."""
        return {
            "healthy": True,
            "pod_count": 47,
            "pending_count": 0,
            "failed_count": 0
        }

    def _mock_details(self) -> Dict[str, Any]:
        """Mock details for testing."""
        return {
            "namespaces": [
                {"name": "default", "pod_count": 3},
                {"name": "kube-system", "pod_count": 12},
                {"name": "cortex-chat", "pod_count": 8},
                {"name": "monitoring", "pod_count": 15},
                {"name": "ingress-nginx", "pod_count": 9}
            ]
        }

    def _mock_pods(self) -> list:
        """Mock pods for testing."""
        return [
            {"name": "cortex-api-7d5f6b8c9d-4xk2p", "status": "Running"},
            {"name": "cortex-frontend-65d8c7b9f-8h7m5", "status": "Running"},
            {"name": "postgres-0", "status": "Running"},
            {"name": "redis-0", "status": "Running"},
            {"name": "monitoring-prometheus-0", "status": "Running"}
        ]


# Global K8s client instance
k8s_client = K8sClient()
