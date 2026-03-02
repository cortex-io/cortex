"""UniFi MCP integration."""
import httpx
from typing import Dict, Any
from src.config import settings


class UniFiClient:
    """Client for UniFi MCP server."""

    def __init__(self):
        self.base_url = settings.unifi_mcp_url
        self.timeout = 10.0

    async def get_summary(self) -> Dict[str, Any]:
        """Get network summary."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_network_status",
                            "arguments": {}
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()

                # Parse MCP response
                result = data.get("result", {})
                content = result.get("content", [])

                if content and len(content) > 0:
                    text = content[0].get("text", "{}")
                    import json
                    return json.loads(text)

                return self._mock_summary()

        except Exception as e:
            print(f"UniFi error: {e}")
            return self._mock_summary()

    async def get_details(self) -> Dict[str, Any]:
        """Get detailed network info."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_network_details",
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
            print(f"UniFi error: {e}")
            return self._mock_details()

    async def get_alerts(self) -> list:
        """Get network alerts."""
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

                return []

        except Exception as e:
            print(f"UniFi error: {e}")
            return []

    async def get_clients(self) -> list:
        """Get connected clients."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": "get_clients",
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

                return []

        except Exception as e:
            print(f"UniFi error: {e}")
            return []

    def _mock_summary(self) -> Dict[str, Any]:
        """Mock summary for testing."""
        return {
            "healthy": True,
            "device_count": 47,
            "ap_count": 2,
            "alert_count": 0
        }

    def _mock_details(self) -> Dict[str, Any]:
        """Mock details for testing."""
        return {
            "uptime": "14d 3h 22m",
            "bandwidth": {
                "wan_rx": "125 Mbps",
                "wan_tx": "45 Mbps",
                "lan_rx": "1.2 Gbps",
                "lan_tx": "890 Mbps"
            }
        }


# Global UniFi client instance
unifi_client = UniFiClient()
