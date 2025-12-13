# Cloudflare MCP Server Integration

## Overview

This document describes the integration of the **cloudflare-mcp-server** into the Cortex autonomous management system. The integration provides comprehensive monitoring, security scanning, and dashboard visualization for Cloudflare infrastructure management through the Model Context Protocol (MCP).

**Repository**: https://github.com/ry-ops/cloudflare-mcp-server
**Local Path**: `/Users/ryandahlberg/Projects/cloudflare-mcp-server`
**Integration Date**: 2025-12-13T08:19:00Z
**Status**: Active

## What is cloudflare-mcp-server?

The cloudflare-mcp-server is a Python-based MCP server that provides seamless integration with the Cloudflare API, enabling natural language management of:

- DNS zones and records
- Cloudflare CDN and cache operations
- Workers KV key-value storage
- Zone analytics and performance metrics
- Security and threat management

### Key Features

1. **Zone Management**
   - List all zones in Cloudflare account
   - Get detailed zone information
   - Filter zones by name and status

2. **DNS Management**
   - List, create, update, and delete DNS records
   - Support for all DNS record types (A, AAAA, CNAME, TXT, MX, etc.)
   - Cloudflare proxy configuration
   - TTL management

3. **Workers KV Storage**
   - List KV namespaces
   - CRUD operations on key-value pairs
   - TTL and metadata support
   - Prefix-based key filtering

4. **Cache Management**
   - Purge entire zone cache
   - Selective purging by files, tags, or hosts
   - Cache invalidation operations

5. **Analytics**
   - Zone analytics (requests, bandwidth, threats)
   - Performance metrics
   - Traffic analysis

### Technical Stack

- **Language**: Python 3.10+
- **Framework**: MCP (Model Context Protocol) 1.1.2+
- **Package Manager**: uv (ultra-fast Python package manager)
- **HTTP Client**: httpx 0.27.0+
- **A2A Protocol**: Enabled with agent card

## Architecture

### Agent-to-Agent (A2A) Protocol

The cloudflare-mcp-server implements the A2A protocol, enabling autonomous agent communication:

- **Agent Card**: `agent-card.json` defines capabilities and skills
- **5 Skill Categories**: zone_management, dns_management, kv_storage, cache_management, analytics
- **13 Operations**: Across all skill categories
- **Capabilities**: Streaming, tasks, async operations

### Integration Components

```
cortex/
├── coordination/
│   ├── monitoring/
│   │   └── cloudflare-mcp-server.json       # Monitoring configuration
│   └── tasks/
│       └── cloudflare-mcp-security-scan.json # Security scan task
├── scripts/
│   └── monitoring/
│       └── cloudflare-health-check.sh        # Health check script
├── eui-dashboard/
│   └── server/
│       └── index.js                          # Dashboard API endpoints
└── docs/
    └── integrations/
        └── cloudflare-mcp-server-integration.md  # This file
```

## Cortex Integration Features

### 1. Health Monitoring

**Configuration**: `/Users/ryandahlberg/Projects/cortex/coordination/monitoring/cloudflare-mcp-server.json`

**Health Checks**:
- Cloudflare API connectivity verification (every 5 minutes)
- API token validation
- Zone listing functionality tests
- MCP server installation verification
- Dependency availability checks

**Script**: `/Users/ryandahlberg/Projects/cortex/scripts/monitoring/cloudflare-health-check.sh`

**Logging**:
- Health check log: `logs/cloudflare-health-check.log`
- Alert log: `coordination/monitoring/alerts/cloudflare-mcp-server.log`

**Dashboard Events**: Posted to `coordination/dashboard-events.jsonl`

### 2. Metrics Collection

**Metrics Tracked**:

| Metric | Type | Description |
|--------|------|-------------|
| `cloudflare_api_requests_total` | Counter | Total API requests by operation and status |
| `cloudflare_api_request_duration_seconds` | Histogram | API request latency distribution |
| `cloudflare_dns_records_managed` | Gauge | Number of DNS records by zone and type |
| `cloudflare_cache_purge_operations` | Counter | Cache purge operations by type |
| `cloudflare_kv_operations_total` | Counter | KV storage operations |
| `cloudflare_zone_analytics_bandwidth_bytes` | Gauge | Zone bandwidth usage |
| `cloudflare_zone_analytics_requests` | Gauge | Zone request counts |
| `cloudflare_zone_analytics_threats` | Gauge | Threats blocked by zone |

**Collection Interval**: 60 seconds
**Storage**: `coordination/monitoring/metrics/cloudflare-*.json`

### 3. Security Scanning

**Configuration**: `/Users/ryandahlberg/Projects/cortex/coordination/tasks/cloudflare-mcp-security-scan.json`

**Scan Types**:

1. **Dependency Scanning**
   - Tools: safety, pip-audit
   - Packages: mcp, httpx, pytest, pytest-asyncio, ruff
   - Threshold: Medium severity

2. **Static Code Analysis**
   - Tools: bandit, ruff
   - Paths: `src/cloudflare_mcp_server`
   - Focus: Security vulnerabilities, code quality

3. **Secrets Detection**
   - Tools: trufflehog, detect-secrets
   - Checks: API keys, tokens, passwords, private keys

4. **Configuration Audit**
   - API token storage validation
   - Environment variable patterns
   - Permission scope verification

5. **API Security**
   - TLS certificate verification
   - Timeout configurations
   - Rate limiting implementation
   - Error handling review

6. **Supply Chain Security**
   - Dependency pinning validation
   - Package integrity checks
   - License compliance

**Compliance Frameworks**: OWASP, CIS, NIST

**Schedule**: Daily at 02:00 UTC, plus on code changes

**Reports**: `security/reports/cloudflare-mcp-server/`

### 4. Dashboard Integration

**API Endpoints**:

| Endpoint | Description |
|----------|-------------|
| `/api/cloudflare/status` | Service status and health |
| `/api/cloudflare/metrics` | DNS, CDN, API, and KV metrics |
| `/api/cloudflare/health-checks` | Recent health check results |
| `/api/cloudflare/zones` | Managed zones information |
| `/api/cloudflare/analytics` | Time-series analytics data |

**Dashboard Widgets**:
- Service status indicator
- DNS records count by type
- CDN bandwidth and requests
- Cache hit ratio
- Threats blocked
- API performance metrics
- KV storage operations

### 5. Alerting

**Alert Channels**:
- Dashboard notifications
- Log files
- Dashboard events stream

**Alert Rules**:

| Rule | Condition | Severity |
|------|-----------|----------|
| `api_token_expired` | HTTP 401 from API | Critical |
| `api_rate_limit` | HTTP 429 from API | Warning |
| `high_error_rate` | Error rate > 10% | Warning |
| `api_connectivity_issue` | Unexpected status codes | Warning |

## Configuration

### Environment Variables

Required for cloudflare-mcp-server operation:

```bash
export CLOUDFLARE_API_TOKEN="your_api_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"  # Optional, required for KV ops
```

**API Token Requirements**:

Minimum Permissions:
- Zone - Zone - Read
- Zone - DNS - Edit

Recommended Permissions:
- Zone - Zone - Read
- Zone - DNS - Edit
- Account - Workers KV Storage - Edit
- Zone - Cache Purge - Purge
- Zone - Analytics - Read

### Getting Cloudflare Credentials

1. **Create API Token**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use "Edit zone DNS" template or create custom token
   - Copy and securely store the token

2. **Get Account ID**:
   - Go to Cloudflare dashboard
   - Select any website
   - Find Account ID in the Overview page sidebar

### Health Check Configuration

The health check runs automatically and can be manually triggered:

```bash
/Users/ryandahlberg/Projects/cortex/scripts/monitoring/cloudflare-health-check.sh
```

**Checks Performed**:
1. API token configuration validation
2. API token validity verification (HTTP 200 expected)
3. MCP server directory and installation check
4. Python and uv dependency verification
5. Zone listing functional test
6. Metrics collection

## Usage

### Running Health Checks

```bash
# Manual health check
cd /Users/ryandahlberg/Projects/cortex
./scripts/monitoring/cloudflare-health-check.sh

# View health check logs
tail -f logs/cloudflare-health-check.log

# View alerts
tail -f coordination/monitoring/alerts/cloudflare-mcp-server.log
```

### Viewing Dashboard Metrics

The dashboard automatically displays Cloudflare metrics:

```bash
# Start the dashboard server (if not running)
cd /Users/ryandahlberg/Projects/cortex/eui-dashboard
npm start

# Access dashboard at http://localhost:3004
# Cloudflare widgets will display on the main dashboard
```

### Accessing API Endpoints

```bash
# Service status
curl http://localhost:3004/api/cloudflare/status

# Metrics
curl http://localhost:3004/api/cloudflare/metrics

# Health checks
curl http://localhost:3004/api/cloudflare/health-checks

# Zones
curl http://localhost:3004/api/cloudflare/zones

# Analytics
curl http://localhost:3004/api/cloudflare/analytics?timeRange=24h
```

### Running Security Scans

Security scans are configured to run automatically daily. Manual execution:

```bash
# Security scan task is defined in:
cat coordination/tasks/cloudflare-mcp-security-scan.json

# Execute security scan (via Cortex security master)
# This would typically be triggered by the security master agent
```

## Security Considerations

### API Token Security

- Store tokens in environment variables only
- Never commit tokens to version control
- Use scoped tokens with minimum required permissions
- Rotate tokens regularly (recommended: every 90 days)
- Monitor token usage in Cloudflare dashboard

### Network Security

- TLS certificate verification is enforced
- API timeouts are configured (30 seconds default)
- Rate limiting is respected
- Error messages do not leak sensitive data

### Access Control

- API tokens grant full access to permitted resources
- Separate tokens for different environments recommended
- Use read-only tokens where possible
- Audit token usage regularly

### Secrets Management

- Secrets detection runs daily
- Environment variables validated on startup
- No hardcoded credentials in codebase
- `.env` files excluded from version control

## Monitoring and Observability

### Health Monitoring

Health checks run every 5 minutes (300 seconds) and verify:

1. API connectivity to Cloudflare
2. Token validity and permissions
3. MCP server availability
4. Dependency health
5. Functional operations (zone listing)

### Metrics Collection

Metrics are collected every 60 seconds and include:

- API request counts and latency
- DNS record counts by zone and type
- CDN bandwidth and request metrics
- Cache operations
- KV storage operations
- Zone analytics (bandwidth, requests, threats)

### Log Aggregation

All logs are centralized:

- Health checks: `logs/cloudflare-health-check.log`
- Alerts: `coordination/monitoring/alerts/cloudflare-mcp-server.log`
- Dashboard events: `coordination/dashboard-events.jsonl`
- Metrics: `coordination/monitoring/metrics/cloudflare-*.json`

### Dashboard Visualization

Real-time visualization includes:

- Service health status
- DNS record distribution
- CDN traffic patterns
- API performance metrics
- Security alerts and threats
- KV storage usage

## Troubleshooting

### Common Issues

1. **API Token Invalid**
   - **Symptom**: HTTP 401 errors in health check logs
   - **Solution**: Verify token in Cloudflare dashboard, regenerate if needed
   - **Alert**: `api_token_expired` triggered

2. **Rate Limit Exceeded**
   - **Symptom**: HTTP 429 errors
   - **Solution**: Reduce health check frequency or wait for rate limit reset
   - **Alert**: `api_rate_limit` triggered

3. **MCP Server Not Found**
   - **Symptom**: Health check fails with directory not found
   - **Solution**: Verify local clone at `/Users/ryandahlberg/Projects/cloudflare-mcp-server`
   - **Fix**: Re-clone repository or update path in configuration

4. **Dependency Issues**
   - **Symptom**: Python or uv not found warnings
   - **Solution**: Install Python 3.10+ and uv package manager
   - **Install uv**: `curl -LsSf https://astral.sh/uv/install.sh | sh`

5. **High Error Rate**
   - **Symptom**: `high_error_rate` alert triggered
   - **Solution**: Check Cloudflare API status, verify token permissions
   - **Debug**: Review API request logs for error patterns

### Debug Commands

```bash
# Check MCP server installation
ls -la /Users/ryandahlberg/Projects/cloudflare-mcp-server

# Verify Python dependencies
cd /Users/ryandahlberg/Projects/cloudflare-mcp-server
uv pip list

# Test API token manually
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"

# View recent health checks
tail -n 50 /Users/ryandahlberg/Projects/cortex/logs/cloudflare-health-check.log

# Check dashboard server logs
cd /Users/ryandahlberg/Projects/cortex/eui-dashboard
npm start  # Check console output
```

## Performance Optimization

### Rate Limiting

Cloudflare API rate limits:
- 1,200 requests per 5 minutes per token
- Health checks configured to stay well within limits
- Monitoring interval: 5 minutes
- Functional test interval: 10 minutes

### Caching

- Health check results cached for dashboard display
- Metrics aggregated before storage
- API responses cached where appropriate

### Resource Usage

- Health check script: ~50MB memory, <1s execution
- Metrics collection: Minimal overhead
- Dashboard queries: Optimized with file-based caching

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review health check logs
   - Check alert patterns
   - Verify metrics collection

2. **Monthly**
   - Review security scan reports
   - Update dependencies if needed
   - Audit API token usage

3. **Quarterly**
   - Rotate API tokens
   - Review integration configuration
   - Update documentation

### Updates and Upgrades

Cloudflare MCP server updates:

```bash
cd /Users/ryandahlberg/Projects/cloudflare-mcp-server
git pull origin main
uv pip install -e .
```

Cortex integration updates:
- Configuration changes pushed via git
- Dashboard updates deployed automatically
- Health check scripts versioned in cortex repo

## Integration Files Reference

| File | Purpose | Location |
|------|---------|----------|
| Monitoring Config | Health checks and metrics | `coordination/monitoring/cloudflare-mcp-server.json` |
| Health Check Script | Automated health verification | `scripts/monitoring/cloudflare-health-check.sh` |
| Security Task | Security scan configuration | `coordination/tasks/cloudflare-mcp-security-scan.json` |
| Dashboard API | Dashboard endpoints | `eui-dashboard/server/index.js` |
| Repository Inventory | Integration metadata | `coordination/repository-inventory.json` |
| Documentation | This file | `docs/integrations/cloudflare-mcp-server-integration.md` |

## A2A Protocol Integration

### Agent Card

Location: `/Users/ryandahlberg/Projects/cloudflare-mcp-server/agent-card.json`

The agent card enables autonomous agent discovery and communication:

```json
{
  "name": "Cloudflare MCP Agent",
  "protocol": "A2A",
  "capabilities": {
    "streaming": true,
    "tasks": true,
    "async": true,
    "batch_operations": false
  }
}
```

### Skills Available

1. **zone_management** - 2 operations
2. **dns_management** - 4 operations
3. **kv_storage** - 5 operations
4. **cache_management** - 1 operation
5. **analytics** - 1 operation

Total: 13 operations available for agent-to-agent communication

### Example A2A Workflow

```json
{
  "workflow": "deploy-and-invalidate-cache",
  "steps": [
    {
      "agent": "deployment-agent",
      "action": "deploy_assets"
    },
    {
      "agent": "cloudflare-mcp-agent",
      "skill": "cache_management",
      "operation": "purge_cache",
      "parameters": {
        "zone_id": "abc123",
        "files": ["https://example.com/app.js"]
      }
    }
  ]
}
```

## Future Enhancements

Planned improvements:

1. **Enhanced Metrics**
   - Real-time zone analytics integration
   - Cache hit/miss ratio tracking
   - DNS query performance metrics

2. **Advanced Security**
   - Automated token rotation
   - Anomaly detection in API usage
   - Threat intelligence integration

3. **Automation**
   - Auto-remediation for common issues
   - Intelligent cache purging based on deployments
   - DNS record validation and cleanup

4. **Dashboard Features**
   - Interactive zone management
   - Visual DNS record editor
   - Real-time analytics charts

## Support and Resources

- **Cloudflare MCP Server**: https://github.com/ry-ops/cloudflare-mcp-server
- **Cloudflare API Docs**: https://developers.cloudflare.com/api/
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Cortex Documentation**: `/Users/ryandahlberg/Projects/cortex/docs/`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-13 | Initial integration with Cortex |

## License

The cloudflare-mcp-server is licensed under the MIT License. See the repository LICENSE file for details.

---

**Last Updated**: 2025-12-13T08:19:00Z
**Integration Status**: Active
**Maintained By**: Cortex Development Master
