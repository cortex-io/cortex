# Sandfly Security MCP Server

Complete MCP (Model Context Protocol) integration for Sandfly Security agentless Linux security platform.

## Overview

This implementation provides comprehensive MCP tools for interacting with Sandfly Security, enabling:
- **Agentless Security Scanning**: Scan Linux hosts without installing agents
- **Threat Detection**: Detect rootkits, malware, and suspicious activity
- **Forensic Data Collection**: Collect processes, users, services, network listeners
- **K3s Cluster Security**: Automated scanning of Kubernetes nodes
- **Security Findings Management**: Query and analyze security alerts

## Architecture

### Components

1. **Sandfly Client** (`src/clients/sandfly.js`)
   - Full REST API wrapper for Sandfly Security API v5.5.0+
   - JWT bearer token authentication with auto-refresh
   - Comprehensive coverage of all API endpoints
   - K3s-specific convenience methods

2. **MCP Tools** (`src/tools/index.js`)
   - `cortex_query` - Query infrastructure including Sandfly
   - `sandfly_scan_hosts` - Initiate security scans
   - `sandfly_get_findings` - Retrieve security alerts
   - `sandfly_manage_hosts` - Add/remove/update monitored hosts
   - `sandfly_forensics` - Collect forensic data from hosts

3. **Integration** (`src/index.js`)
   - Sandfly included in Tier 1 infrastructure queries
   - Health checks and status monitoring
   - Seamless integration with Cortex ecosystem

## Configuration

### Environment Variables

```bash
# Sandfly Server URL (default: http://sandfly-server:8080)
export SANDFLY_URL="https://sandfly.yourdomain.com"

# Authentication (choose one method)
# Option 1: Username/Password (recommended for initial setup)
export SANDFLY_USERNAME="admin"
export SANDFLY_PASSWORD="your-password"

# Option 2: API Token (recommended for production)
export SANDFLY_API_TOKEN="your-jwt-token"
```

### Kubernetes Deployment

When deploying in K3s, use secrets for credentials:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sandfly-mcp-credentials
  namespace: cortex-system
type: Opaque
stringData:
  SANDFLY_URL: "http://sandfly-server:8080"
  SANDFLY_USERNAME: "admin"
  SANDFLY_PASSWORD: "your-password"
```

## API Coverage

### Authentication
- ✅ Login with username/password
- ✅ JWT token refresh
- ✅ Automatic token expiry handling
- ✅ Logout and token revocation

### Host Management
- ✅ List all monitored hosts
- ✅ Get specific host details
- ✅ Add new host to monitoring
- ✅ Update host configuration
- ✅ Delete host from monitoring
- ✅ Get host rollup statistics
- ✅ Retry inactive hosts
- ✅ Bulk tag hosts

### Scanning Operations
- ✅ Initiate standard scans
- ✅ Initiate ad-hoc scans
- ✅ Get scan schedules
- ✅ View scan error logs
- ✅ K3s cluster scanning (custom)

### Results & Findings
- ✅ Query security findings
- ✅ Get findings for specific host
- ✅ Create forensic timelines
- ✅ Delete results by host
- ✅ Manage result profiles
- ✅ K3s security summary (custom)

### Forensic Data Collection
- ✅ Get running processes
- ✅ Get user accounts
- ✅ Get system services
- ✅ Get network listeners
- ✅ Get kernel modules
- ✅ Get scheduled tasks (cron, systemd timers)

### Credentials Management
- ✅ List stored credentials
- ✅ Add new SSH credentials
- ✅ Update credentials
- ✅ Delete credentials

### Notifications & Alerts
- ✅ List notification configurations
- ✅ Create notifications
- ✅ Test notifications
- ✅ Pause/unpause notifications

### Configuration
- ✅ Get server configuration
- ✅ Update server settings
- ✅ Manage threat feeds
- ✅ Manage whitelist rules
- ✅ Manage SSH zones

### Reports
- ✅ Get host snapshots
- ✅ Get scan performance metrics

### System Status
- ✅ Get current user info
- ✅ Get system status
- ✅ Get license information
- ✅ Health check

## MCP Tools Usage

### 1. Scan Hosts

**Scan all K3s nodes:**
```json
{
  "name": "sandfly_scan_hosts",
  "arguments": {
    "scan_k3s": true,
    "scan_type": "comprehensive"
  }
}
```

**Scan specific hosts:**
```json
{
  "name": "sandfly_scan_hosts",
  "arguments": {
    "hosts": ["host-id-1", "host-id-2"],
    "scan_type": "quick"
  }
}
```

### 2. Get Security Findings

**Get all critical findings:**
```json
{
  "name": "sandfly_get_findings",
  "arguments": {
    "severity": "critical",
    "limit": 50
  }
}
```

**Get findings for specific host:**
```json
{
  "name": "sandfly_get_findings",
  "arguments": {
    "host_id": "host-123"
  }
}
```

### 3. Manage Hosts

**Add new host:**
```json
{
  "name": "sandfly_manage_hosts",
  "arguments": {
    "action": "add",
    "host_data": {
      "hostname": "k3s-worker-01",
      "ip": "10.88.145.10",
      "port": 22,
      "tags": ["k3s", "worker"],
      "credential_id": "cred-123"
    }
  }
}
```

**List all hosts:**
```json
{
  "name": "sandfly_manage_hosts",
  "arguments": {
    "action": "list"
  }
}
```

### 4. Collect Forensics

**Get all forensic data from host:**
```json
{
  "name": "sandfly_forensics",
  "arguments": {
    "host_id": "host-123",
    "data_type": "all"
  }
}
```

**Get specific data type:**
```json
{
  "name": "sandfly_forensics",
  "arguments": {
    "host_id": "host-123",
    "data_type": "processes"
  }
}
```

## Custom K3s Methods

### Scan K3s Nodes

Automatically scans all hosts tagged with "k3s":

```javascript
const result = await sandfly.scanK3sNodes();
// Returns: { scan_id, nodes_scanned, nodes: [...] }
```

### Get K3s Security Summary

Aggregates security findings across all K3s nodes:

```javascript
const summary = await sandfly.getK3sSecuritySummary();
// Returns: { total_nodes, findings: { critical, high, medium, total }, nodes: [...] }
```

## Integration with Cortex Ecosystem

### With Security Master

Sandfly findings automatically feed into the Security Master for:
- Automated vulnerability remediation
- Security posture tracking
- Compliance monitoring
- Incident response workflows

### With Worker Swarms

Security findings can trigger worker swarms for:
- Mass security fixes across fleet
- Automated patching
- Configuration remediation
- Forensic data collection at scale

### With Infrastructure Monitoring

Sandfly integrates with:
- **K8s**: Monitor container host security
- **Proxmox**: Scan VM infrastructure
- **UniFi**: Correlate network and host security
- **Grafana**: Visualize security metrics

## Error Handling

The client includes comprehensive error handling:

```javascript
try {
  const findings = await sandfly.getFindings();
} catch (error) {
  if (error.message.includes('401')) {
    // Authentication failed - token expired
    await sandfly.login();
  } else if (error.message.includes('404')) {
    // Resource not found
  } else {
    // Other errors
  }
}
```

## Authentication Flow

1. **Initial Authentication**:
   ```javascript
   await sandfly.login(); // Gets JWT token
   ```

2. **Automatic Token Refresh**:
   ```javascript
   // Token auto-refreshes 5 minutes before expiry
   await sandfly.ensureAuth(); // Called automatically
   ```

3. **Logout**:
   ```javascript
   await sandfly.logout(); // Revokes token
   ```

## Health Checks

```javascript
const health = await sandfly.healthCheck();
// Returns:
// {
//   healthy: true,
//   version: "5.5.0",
//   authenticated: true
// }
```

## API Request Format

All requests use the following structure:

```javascript
await sandfly.request('/api/v1/endpoint', {
  method: 'POST',      // GET, POST, PUT, DELETE, PATCH
  body: { ... },       // Request payload
  noAuth: false        // Skip authentication (for login)
});
```

## Deployment Checklist

- [ ] Deploy Sandfly server in K3s (see `docs/SANDFLY-K3S-DEPLOYMENT.md`)
- [ ] Create credentials secret
- [ ] Configure SANDFLY_URL environment variable
- [ ] Test authentication with `healthCheck()`
- [ ] Add K3s nodes to monitoring with "k3s" tag
- [ ] Run initial scan with `scanK3sNodes()`
- [ ] Configure notification endpoints
- [ ] Set up scan schedules
- [ ] Integrate with Cortex Security Master
- [ ] Configure alerting rules
- [ ] Set up Grafana dashboards

## Performance Considerations

### Token Management
- Tokens valid for 60 minutes
- Auto-refresh at 55 minutes
- Minimal authentication overhead

### Scanning
- Quick scans: ~30 seconds per host
- Comprehensive scans: ~2-5 minutes per host
- Parallel scanning supported

### API Rate Limits
- No documented rate limits
- Recommend max 100 concurrent requests
- Batch operations available for efficiency

## Security Best Practices

1. **Credentials**: Always use Kubernetes secrets, never hardcode
2. **TLS**: Use HTTPS for Sandfly server in production
3. **RBAC**: Limit API access via service accounts
4. **Network Policies**: Restrict scanning node egress
5. **Audit Logging**: Enable comprehensive audit trails
6. **Token Rotation**: Implement regular credential rotation

## Troubleshooting

### "Authentication failed"
- Check SANDFLY_USERNAME and SANDFLY_PASSWORD
- Verify Sandfly server is accessible
- Check token hasn't been revoked

### "Connection refused"
- Verify SANDFLY_URL is correct
- Check Sandfly server is running
- Verify network connectivity

### "No K3s nodes found"
- Ensure hosts are tagged with "k3s"
- Use `sandfly_manage_hosts` to add nodes
- Verify SSH credentials are configured

### "Scan timeout"
- Increase scan timeout in Sandfly config
- Check target host SSH connectivity
- Verify credentials are correct

## API Documentation

Full API documentation available at:
- https://docs.sandflysecurity.com/reference/api-landing-page
- https://api.sandflysecurity.com/

## License

This MCP integration follows Cortex licensing.
Sandfly Security is a commercial product requiring separate licensing.

## Support

For Sandfly-specific issues:
- https://sandflysecurity.com/support
- https://github.com/sandflysecurity/sandfly-setup

For MCP integration issues:
- See main Cortex documentation
- Check `docs/SANDFLY-K3S-DEPLOYMENT.md`
