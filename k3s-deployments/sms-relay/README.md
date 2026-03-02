# SMS Infrastructure Relay

SMS-based infrastructure monitoring and control system that integrates with MCP servers (UniFi, Proxmox, k3s, security tools) and Claude AI via Twilio.

## Overview

This service allows you to text a number to get real-time status updates and issue commands to your homelab infrastructure. It provides:

- Network status (UniFi)
- Proxmox cluster monitoring
- Kubernetes cluster status
- Security alerts and logs
- Claude AI for complex queries

## Architecture

```
User Phone → Twilio SMS → Webhook (FastAPI) → MCP Servers → Response → Twilio → User
```

Single-user system with phone number whitelist validation.

## Features

### Menu-Driven Interface

Text anything to start and receive:
```
1) Network  2) Proxmox  3) K8s  4) Security  5) Ask Claude
```

Each menu provides terse summaries (max ~300 chars) suitable for SMS.

### Navigation

- Always available: `home`, `h`, `menu` - Return to main menu
- `?` - Get help
- Letter shortcuts in each menu: `D` for Details, `A` for Alerts, etc.

### Example Flows

**Network Status (1):**
```
Network OK. 47 devices, 2 APs, 0 alerts.
D)etails  A)lerts  C)lients
```

**Proxmox Status (2):**
```
Proxmox OK. 3 nodes, 12 VMs, 8 LXC.
CPU: 23%  RAM: 64%  Storage: 71%
D)etails  V)Ms  N)odes
```

**Kubernetes Status (3):**
```
K8s OK. 47 pods, 0 pending, 0 failed.
D)etails  P)ods  S)ervices
```

**Security Status (4):**
```
Security OK. 0 critical, 2 warnings.
A)lerts  L)ogs  F)irewall
```

**Claude Mode (5):**
```
Claude mode. Ask anything about your infra.
'home' to exit.
```

## Quick Start

### Prerequisites

- Python 3.11+
- Twilio account with phone number
- Anthropic API key
- MCP servers running (UniFi, Proxmox, K8s, Security)

### Local Development with ngrok

1. Clone and setup:
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay
cp .env.example .env
# Edit .env with your credentials
```

2. Install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

3. Start the service:
```bash
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

4. In another terminal, start ngrok:
```bash
ngrok http 8000
```

5. Configure Twilio webhook:
   - Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`)
   - Go to Twilio Console → Phone Numbers → Your Number
   - Under "Messaging", set webhook to: `https://abc123.ngrok.io/sms`
   - Method: HTTP POST
   - Save

6. Test by texting your Twilio number!

### Docker Compose (Local)

```bash
# Edit .env file with credentials
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Kubernetes Deployment

1. Update configuration:
```bash
cd k8s
# Edit secret.yaml with your credentials
# Edit ingress.yaml with your domain
```

2. Deploy:
```bash
kubectl apply -k .
```

3. Verify deployment:
```bash
kubectl get pods -l app=sms-relay
kubectl logs -l app=sms-relay -f
```

4. Configure Twilio webhook to your ingress URL:
   - Example: `https://sms.yourdomain.com/sms`

## Configuration

### Environment Variables

See `.env.example` for all configuration options:

- **TWILIO_ACCOUNT_SID**: Your Twilio account SID
- **TWILIO_AUTH_TOKEN**: Your Twilio auth token
- **TWILIO_PHONE_NUMBER**: Your Twilio phone number (E.164 format)
- **ALLOWED_PHONE_NUMBER**: Your personal phone number (E.164 format)
- **ANTHROPIC_API_KEY**: Your Claude API key
- **MCP URLs**: Endpoints for each MCP server

### MCP Server Integration

The service expects MCP servers to respond to POST requests at `/mcp` with the standard MCP protocol:

```json
{
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {}
  }
}
```

Response format:
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{json_data}"
      }
    ]
  }
}
```

## Project Structure

```
sms-relay/
├── src/
│   ├── main.py              # FastAPI application & webhook handler
│   ├── config.py            # Configuration management
│   ├── state.py             # Conversation state machine
│   ├── sms.py               # Twilio client wrapper
│   ├── formatters.py        # SMS output formatters
│   ├── integrations/        # MCP client integrations
│   │   ├── unifi.py
│   │   ├── proxmox.py
│   │   ├── k8s.py
│   │   ├── security.py
│   │   └── claude.py
│   └── menus/               # Menu handlers
│       ├── home.py
│       ├── network.py
│       ├── proxmox.py
│       ├── k8s.py
│       └── security.py
├── k8s/                     # Kubernetes manifests
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## API Endpoints

- `POST /sms` - Twilio webhook endpoint
- `GET /health` - Health check endpoint
- `GET /` - Service info

## Troubleshooting

### No response from SMS

1. Check Twilio webhook configuration
2. Verify your phone number is in E.164 format (+1234567890)
3. Check application logs for errors
4. Ensure ALLOWED_PHONE_NUMBER matches exactly

### MCP Integration Issues

1. Verify MCP server URLs are reachable
2. Check MCP server logs for errors
3. Test MCP endpoints directly with curl:
```bash
curl -X POST http://unifi-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {"name": "get_network_status", "arguments": {}}
  }'
```

### Claude Mode Not Working

1. Verify ANTHROPIC_API_KEY is set correctly
2. Check API key permissions and credits
3. Review logs for API errors

## Development

### Running Tests

```bash
pytest tests/
```

### Code Style

```bash
black src/
ruff check src/
```

### Building Docker Image

```bash
docker build -t sms-relay:latest .
```

## Security Considerations

- Single-user system with phone number whitelist
- No authentication beyond phone number validation
- Run as non-root user in container
- Read-only root filesystem where possible
- Network policies in k8s recommended
- Use secrets for sensitive configuration

## License

MIT

## Support

For issues and questions, please create an issue in the repository.
