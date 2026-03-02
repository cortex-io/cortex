# SMS Infrastructure Relay - Quick Reference

## SMS Commands

### Main Menu
```
1 or network    → Network status
2 or proxmox    → Proxmox status
3 or k8s        → Kubernetes status
4 or security   → Security status
5 or claude     → Claude AI mode
```

### Navigation
```
home, h, menu   → Return to main menu
?               → Help
```

### Network Menu (1)
```
d, details      → Network details
a, alerts       → Network alerts
c, clients      → Connected clients
```

### Proxmox Menu (2)
```
d, details      → Node details
v, vms          → Virtual machines
n, nodes        → Node list
```

### K8s Menu (3)
```
d, details      → Namespace details
p, pods         → Pod list
s, services     → Service list
```

### Security Menu (4)
```
a, alerts       → Security alerts
l, logs         → Recent logs
f, firewall     → Firewall status
```

### Claude Mode (5)
```
[any question]  → Ask Claude
home            → Exit Claude mode
```

## Development Commands

```bash
# Setup
./scripts/setup-dev.sh          # Initial setup
source venv/bin/activate        # Activate venv

# Run locally
make dev                        # Start dev server
ngrok http 8000                 # Expose with ngrok

# Test
./scripts/test-webhook.sh       # Test webhook
make test                       # Run tests
make lint                       # Run linters

# Docker
make docker-build               # Build image
make docker-run                 # Run container
make docker-logs                # View logs

# Kubernetes
make k8s-deploy                 # Deploy to k8s
make k8s-logs                   # View logs
make k8s-status                 # Check status
make k8s-delete                 # Remove deployment
```

## Configuration Files

```
.env                    # Local environment (copy from .env.example)
k8s/secret.yaml         # Kubernetes secrets
k8s/ingress.yaml        # Domain configuration
docker-compose.yml      # Docker setup
```

## Environment Variables

```bash
# Required - Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ALLOWED_PHONE_NUMBER=+1234567890

# Required - Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# Optional - MCP Servers (defaults provided)
UNIFI_MCP_URL=http://unifi-mcp:3000
PROXMOX_MCP_URL=http://proxmox-mcp:3000
K8S_MCP_URL=http://k8s-mcp:3000
SECURITY_MCP_URL=http://security-mcp:3000
```

## Twilio Webhook Setup

1. Go to: https://console.twilio.com/
2. Navigate to: Phone Numbers → Active Numbers
3. Click your number
4. Under "Messaging Configuration":
   - Webhook: `https://sms.yourdomain.com/sms`
   - Method: HTTP POST
5. Save

## Kubernetes Quick Deploy

```bash
cd k8s
# Edit secret.yaml with credentials
# Edit ingress.yaml with domain
kubectl apply -k .
kubectl get pods -l app=sms-relay
kubectl logs -f deployment/sms-relay
```

## Troubleshooting

### No SMS Response
```bash
# Check logs
kubectl logs -f deployment/sms-relay

# Test health
curl https://sms.yourdomain.com/health

# Check Twilio
# https://console.twilio.com/monitor/logs/errors
```

### MCP Issues
```bash
# Test MCP server
curl -X POST http://unifi-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"get_network_status","arguments":{}}}'

# Check connectivity
kubectl exec -it deployment/sms-relay -- sh
curl http://unifi-mcp:3000/health
```

### Claude Issues
```bash
# Verify API key in secret
kubectl get secret sms-relay-secrets -o yaml

# Check logs for API errors
kubectl logs -f deployment/sms-relay | grep -i claude
```

## Testing Flow

1. **Local with ngrok:**
   ```bash
   make dev                    # Terminal 1
   ngrok http 8000             # Terminal 2
   # Configure Twilio webhook
   # Send test SMS
   ```

2. **Docker:**
   ```bash
   make docker-run
   ngrok http 8000
   # Configure Twilio webhook
   # Send test SMS
   ```

3. **Kubernetes:**
   ```bash
   make k8s-deploy
   # Configure Twilio webhook to ingress
   # Send test SMS
   ```

## API Endpoints

```
POST /sms       # Twilio webhook
GET  /health    # Health check
GET  /          # Service info
```

## File Locations

```
Application:        /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay
Source:             src/
Kubernetes:         k8s/
Scripts:            scripts/
Documentation:      *.md files
```

## Important Phone Number Format

Always use E.164 format:
```
✓ Correct:   +1234567890
✗ Wrong:     (123) 456-7890
✗ Wrong:     1234567890
✗ Wrong:     +1 (123) 456-7890
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| SMS not received | Check Twilio webhook URL, verify phone number format |
| 500 error | Check logs for exceptions, verify environment variables |
| Timeout | Increase MCP client timeout, check MCP server health |
| Unauthorized | Verify ALLOWED_PHONE_NUMBER matches sender |
| No MCP data | Check MCP server URLs, test connectivity |
| Claude error | Verify API key, check credits, review rate limits |

## Monitoring Checklist

- [ ] Pod is running
- [ ] Health endpoint responds
- [ ] Logs are clean (no errors)
- [ ] Twilio webhook configured
- [ ] SMS response received
- [ ] All menus work
- [ ] MCP integrations return data
- [ ] Claude mode works

## Production Checklist

- [ ] Secrets configured
- [ ] Ingress domain set
- [ ] DNS record created
- [ ] SSL certificate issued
- [ ] Twilio webhook set to production URL
- [ ] End-to-end test passed
- [ ] Monitoring configured
- [ ] Backup created

## Support Resources

- Main README: `README.md`
- Deployment Guide: `DEPLOYMENT.md`
- Testing Guide: `TESTING.md`
- Project Summary: `PROJECT_SUMMARY.md`
- Twilio Docs: https://www.twilio.com/docs
- Claude Docs: https://docs.anthropic.com

## Quick Links

- Twilio Console: https://console.twilio.com/
- Twilio Debugger: https://console.twilio.com/debugger
- Anthropic Console: https://console.anthropic.com/
- ngrok Dashboard: https://dashboard.ngrok.com/

---

**Version:** 1.0.0
**Last Updated:** 2025-12-28
**Project:** Cortex Infrastructure
