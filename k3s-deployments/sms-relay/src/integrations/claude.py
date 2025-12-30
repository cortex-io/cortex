"""Claude integration for complex queries."""
import anthropic
from src.config import settings


class ClaudeClient:
    """Client for Claude AI queries."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-5-20250929"
        self.max_tokens = 300  # Keep responses short for SMS

    async def query(self, message: str, context: str = "") -> str:
        """Query Claude with infrastructure context."""
        try:
            system_prompt = """You are an infrastructure assistant. Provide concise answers (max 2-3 sentences) suitable for SMS.
Focus on actionable information. Be direct and technical."""

            if context:
                system_prompt += f"\n\nContext: {context}"

            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": message}
                ]
            )

            if response.content and len(response.content) > 0:
                return response.content[0].text

            return "Unable to process query."

        except Exception as e:
            print(f"Claude error: {e}")
            return f"Error: {str(e)[:50]}"


# Global Claude client instance
claude_client = ClaudeClient()
