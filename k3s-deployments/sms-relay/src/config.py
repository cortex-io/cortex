"""Configuration management for SMS relay service."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Twilio Configuration
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_phone_number: str
    allowed_phone_number: str  # E.164 format

    # MCP Server Endpoints
    unifi_mcp_url: str = "http://unifi-mcp:3000"
    proxmox_mcp_url: str = "http://proxmox-mcp:3000"
    k8s_mcp_url: str = "http://k8s-mcp:3000"
    security_mcp_url: str = "http://security-mcp:3000"

    # Claude API
    anthropic_api_key: str

    # Application
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
