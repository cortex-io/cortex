"""Security MCP integration."""
import httpx
from typing import Dict, Any
from src.config import settings


class SecurityClient:
    """Client for Security MCP server."""

    def __init__(self):
        self.base_url = settings.security_mcp_url
        self.timeout = 10.0

    async def get_summary(self) -> Dict[str, Any]:
        """Get security summary."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_security_status",
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
            print(f"Security error: {e}")
            return self._mock_summary()

    async def get_alerts(self) -> list:
        """Get security alerts."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_alerts",
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

                return self._mock_alerts()

        except Exception as e:
            print(f"Security error: {e}")
            return self._mock_alerts()

    async def get_logs(self) -> list:
        """Get recent security logs."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_recent_logs",
                            "arguments": {"limit": 10}
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
            print(f"Security error: {e}")
            return []

    async def get_firewall_status(self) -> Dict[str, Any]:
        """Get firewall status."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_firewall_status",
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

                return {"status": "active", "rules": 42}

        except Exception as e:
            print(f"Security error: {e}")
            return {"status": "unknown", "rules": 0}

    def _mock_summary(self) -> Dict[str, Any]:
        """Mock summary for testing."""
        return {
            "healthy": True,
            "critical_count": 0,
            "warning_count": 2
        }

    def _mock_alerts(self) -> list:
        """Mock alerts for testing."""
        return [
            {"severity": "warning", "message": "High CPU on k3s-master"},
            {"severity": "warning", "message": "Disk usage 85% on pve2"}
        ]


# Global Security client instance
security_client = SecurityClient()
