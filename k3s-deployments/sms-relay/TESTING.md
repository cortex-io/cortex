# Testing Guide

This guide covers testing the SMS Infrastructure Relay service locally and in production.

## Local Testing with ngrok

### Setup

1. Start the application:
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay
source venv/bin/activate
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

2. In another terminal, start ngrok:
```bash
ngrok http 8000
```

3. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`)

4. Configure Twilio:
   - Go to: https://console.twilio.com/
   - Navigate to: Phone Numbers → Manage → Active Numbers
   - Click your phone number
   - Scroll to "Messaging Configuration"
   - Under "A MESSAGE COMES IN":
     - Set webhook to: `https://abc123.ngrok.io/sms`
     - Method: HTTP POST
   - Click Save

### Test Cases

#### Test 1: Initial Contact
**Action:** Send any text to your Twilio number
**Expected Response:**
```
Welcome to Infrastructure Monitor!

1) Network  2) Proxmox  3) K8s  4) Security  5) Ask Claude

? for help
```

#### Test 2: Network Menu
**Action:** Reply `1` or `network`
**Expected Response:**
```
Network OK. 47 devices, 2 APs, 0 alerts.
D)etails  A)lerts  C)lients
```

#### Test 3: Network Details
**Action:** Reply `d` or `details`
**Expected Response:**
```
Uptime: 14d 3h 22m
WAN: 125 Mbps↓ 45 Mbps↑
LAN: 1.2 Gbps↓ 890 Mbps↑
```

#### Test 4: Return to Home
**Action:** Reply `home` or `h`
**Expected Response:** Main menu

#### Test 5: Proxmox Menu
**Action:** From main menu, reply `2`
**Expected Response:**
```
Proxmox OK. 3 nodes, 12 VMs, 8 LXC.
CPU: 23%  RAM: 64%  Storage: 71%
D)etails  V)Ms  N)odes
```

#### Test 6: K8s Menu
**Action:** From main menu, reply `3`
**Expected Response:**
```
K8s OK. 47 pods, 0 pending, 0 failed.
D)etails  P)ods  S)ervices
```

#### Test 7: Security Menu
**Action:** From main menu, reply `4`
**Expected Response:**
```
Security OK. 0 critical, 2 warnings.
A)lerts  L)ogs  F)irewall
```

#### Test 8: Claude Mode
**Action:** From main menu, reply `5`
**Expected Response:**
```
Claude mode. Ask anything about your infra.
'home' to exit.
```

**Follow-up Action:** Ask "What's my network status?"
**Expected:** Conversational response about infrastructure

**Exit Action:** Reply `home`
**Expected:** Return to main menu

#### Test 9: Help Command
**Action:** Reply `?` from any menu
**Expected Response:** Help text with available commands

#### Test 10: Invalid Input
**Action:** Reply with gibberish
**Expected Response:** Error message or "Unknown option" with guidance

### Monitoring Logs

While testing, monitor the application logs:
```bash
# Terminal 1: Application logs
# (Watch the uvicorn output)

# Terminal 2: ngrok requests
# (Shows HTTP requests in ngrok terminal)
```

## Testing with Docker

### Build and Run

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay

# Build image
docker build -t sms-relay:test .

# Run container
docker run -p 8000:8000 \
  --env-file .env \
  sms-relay:test

# In another terminal, start ngrok
ngrok http 8000
```

### Test with curl

Test the webhook endpoint directly:
```bash
curl -X POST http://localhost:8000/sms \
  -d "From=%2B1234567890" \
  -d "Body=hello"
```

Note: Replace `%2B1234567890` with your URL-encoded phone number.

## Testing in Kubernetes

### Deploy to Test Environment

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay

# Create test namespace
kubectl create namespace sms-relay-test

# Deploy with kustomize
kubectl apply -k k8s/ -n sms-relay-test

# Check status
kubectl get pods -n sms-relay-test
kubectl logs -f deployment/sms-relay -n sms-relay-test
```

### Port Forward for Testing

```bash
kubectl port-forward -n sms-relay-test service/sms-relay 8000:80

# In another terminal
ngrok http 8000
```

### Cleanup Test Environment

```bash
kubectl delete namespace sms-relay-test
```

## Testing MCP Integrations

### Mock Mode

By default, if MCP servers are unreachable, the integrations return mock data. This is useful for testing the SMS interface without live infrastructure.

### Testing with Live MCP Servers

1. Ensure MCP servers are running and reachable
2. Update `.env` with correct MCP URLs
3. Test each menu option to verify real data

### Manual MCP Testing

Test MCP servers directly:

```bash
# UniFi
curl -X POST http://unifi-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_network_status",
      "arguments": {}
    }
  }'

# Proxmox
curl -X POST http://proxmox-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_cluster_status",
      "arguments": {}
    }
  }'

# K8s
curl -X POST http://k8s-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_cluster_status",
      "arguments": {}
    }
  }'

# Security
curl -X POST http://security-mcp:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_security_status",
      "arguments": {}
    }
  }'
```

## Testing Claude Integration

### Test Claude Mode

1. Enter Claude mode (option 5)
2. Ask various questions:
   - "What's my network status?"
   - "How many VMs are running?"
   - "Show me k8s pods"
   - "Are there any security alerts?"

### Monitor Claude API Usage

Check Claude API usage in Anthropic Console:
- https://console.anthropic.com/

## Load Testing

### Simple Load Test

```bash
# Send multiple requests
for i in {1..10}; do
  curl -X POST http://localhost:8000/sms \
    -d "From=%2B1234567890" \
    -d "Body=home" &
done
wait
```

## Troubleshooting Tests

### No SMS Response

1. Check Twilio webhook configuration
2. Verify ngrok is still running (URLs expire)
3. Check phone number format (E.164: +1234567890)
4. Review application logs for errors
5. Check Twilio error logs in console

### Webhook Errors

1. Check ngrok inspection UI: http://127.0.0.1:4040
2. Verify webhook URL is HTTPS (not HTTP)
3. Check for SSL/TLS issues
4. Review Twilio debugger: https://www.twilio.com/console/debugger

### MCP Integration Failures

1. Verify MCP server URLs are correct
2. Check network connectivity to MCP servers
3. Review MCP server logs
4. Test MCP endpoints with curl
5. Check for timeout issues

### Claude API Issues

1. Verify API key is correct
2. Check API credits/quota
3. Review rate limits
4. Check for API errors in logs

## Production Testing

### Health Check

```bash
curl https://sms.yourdomain.com/health
```

Expected response:
```json
{"status": "ok", "service": "sms-relay"}
```

### End-to-End Test

1. Send test SMS to production number
2. Verify response received
3. Test each menu option
4. Verify data is current (not mock)

### Monitoring

Check these metrics in production:

- Response time (should be < 5 seconds)
- Error rate (should be near 0%)
- MCP server connectivity
- Claude API response times

## Test Checklist

Before deploying to production:

- [ ] All menu options work
- [ ] Navigation (home, help) works
- [ ] MCP integrations return real data
- [ ] Claude mode works
- [ ] Phone number whitelist works
- [ ] Unauthorized numbers are blocked
- [ ] Error messages are clear
- [ ] Response times are acceptable
- [ ] Health check endpoint works
- [ ] Logs are clean (no errors)
- [ ] SSL/TLS certificate valid
- [ ] Twilio webhook configured correctly

## Automated Testing

### Unit Tests (Future)

```bash
pytest tests/test_formatters.py
pytest tests/test_state.py
pytest tests/test_menus.py
```

### Integration Tests (Future)

```bash
pytest tests/integration/test_mcp_clients.py
pytest tests/integration/test_webhook.py
```

## Useful Commands

```bash
# View Twilio request inspector
# https://www.twilio.com/console/phone-numbers/incoming

# View ngrok requests
# http://127.0.0.1:4040

# Watch application logs
tail -f logs/sms-relay.log

# Watch k8s logs
kubectl logs -f deployment/sms-relay -n default

# Check Twilio account
twilio api:core:accounts:fetch
```

## Next Steps

After successful testing:

1. Update documentation with any findings
2. Deploy to production
3. Monitor for 24-48 hours
4. Gather user feedback
5. Iterate on improvements
