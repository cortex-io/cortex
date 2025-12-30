"""Cortex orchestrator integration for complex queries."""
import httpx
import json
from datetime import datetime
from src.config import settings


class CortexClient:
    """Client for Cortex orchestrator queries."""

    def __init__(self):
        # Cortex orchestrator URL (same as chat backend uses)
        self.base_url = "http://cortex-orchestrator.cortex.svc.cluster.local:8000"
        self.timeout = 120.0  # 2 minute timeout for SMS queries
        self.max_response_length = 600  # Keep responses short for SMS (2 messages worth)

    async def query(self, message: str) -> str:
        """
        Query Cortex orchestrator with user message.
        Returns a concise response suitable for SMS.
        """
        try:
            # Build task payload (same structure as chat backend)
            task_payload = {
                "id": f"sms-{int(datetime.now().timestamp())}",
                "type": "user_query",
                "priority": 5,
                "payload": {
                    "query": f"[SMS MODE - Keep response under 600 chars] {message}"
                },
                "metadata": {
                    "source": "sms-relay",
                    "personality": "standard"
                }
            }

            print(f"[CortexClient] Sending query to Cortex: {message}")

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/tasks",
                    json=task_payload,
                    headers={"Content-Type": "application/json"}
                )

                if response.status_code != 200:
                    print(f"[CortexClient] Error: HTTP {response.status_code}")
                    return f"Cortex error: HTTP {response.status_code}"

                # Parse SSE stream response
                response_text = response.text

                # Extract the final result from SSE stream
                # SSE format: "data: {json}\n\n"
                lines = response_text.strip().split('\n')
                cortex_result = None

                for line in lines:
                    if line.startswith('data: '):
                        try:
                            data = json.loads(line[6:])  # Skip "data: " prefix
                            if data.get('status') in ['completed', 'success']:
                                cortex_result = data
                        except json.JSONDecodeError:
                            continue

                if not cortex_result:
                    print(f"[CortexClient] No valid result in SSE stream")
                    return "No response from Cortex"

                # Extract answer from result
                result_data = cortex_result.get('result', {})
                answer = result_data.get('answer') or result_data.get('output') or str(result_data)

                print(f"[CortexClient] Got response ({len(answer)} chars)")

                # Truncate if too long for SMS
                if len(answer) > self.max_response_length:
                    answer = answer[:self.max_response_length - 20] + "\n\n[Truncated]"

                return answer

        except httpx.TimeoutException:
            print(f"[CortexClient] Timeout after {self.timeout}s")
            return "Query timeout. Try a simpler question."

        except Exception as e:
            print(f"[CortexClient] Error: {e}")
            return f"Error: {str(e)[:100]}"


# Global Cortex client instance
cortex_client = CortexClient()
