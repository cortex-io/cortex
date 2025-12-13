# Cloudflare MCP Server - Quick Reference

## Essential Commands

### Health Check
```bash
# Run health check
./scripts/monitoring/cloudflare-health-check.sh

# View logs
tail -f logs/cloudflare-health-check.log
tail -f coordination/monitoring/alerts/cloudflare-mcp-server.log
```

### Dashboard
```bash
# Start dashboard
cd eui-dashboard && npm start

# Access at: http://localhost:3004
```

### API Endpoints
```bash
# Status
curl http://localhost:3004/api/cloudflare/status

# Metrics
curl http://localhost:3004/api/cloudflare/metrics

# Health Checks
curl http://localhost:3004/api/cloudflare/health-checks

# Zones
curl http://localhost:3004/api/cloudflare/zones

# Analytics
curl http://localhost:3004/api/cloudflare/analytics?timeRange=24h
```

## Configuration

### Environment Variables
```bash
export CLOUDFLARE_API_TOKEN="your_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id"  # Optional
```

### Get Cloudflare Token
1. Visit: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Copy token securely

## Files

| File | Purpose |
|------|---------|
| `coordination/monitoring/cloudflare-mcp-server.json` | Monitoring config |
| `scripts/monitoring/cloudflare-health-check.sh` | Health check script |
| `coordination/tasks/cloudflare-mcp-security-scan.json` | Security scan config |
| `docs/integrations/cloudflare-mcp-server-integration.md` | Full documentation |

## Alerts

| Alert | Severity | Action |
|-------|----------|--------|
| `api_token_expired` | Critical | Regenerate token |
| `api_rate_limit` | Warning | Wait or reduce frequency |
| `high_error_rate` | Warning | Check API status |

## Repository
- **URL**: https://github.com/ry-ops/cloudflare-mcp-server
- **Local**: /Users/ryandahlberg/Projects/cloudflare-mcp-server

## Documentation
Full docs: `docs/integrations/cloudflare-mcp-server-integration.md`
