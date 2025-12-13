# Wazuh MCP Server - Container Deployment Guide

Deploy the Wazuh MCP server as a standalone container in Proxmox infrastructure.

## Overview

The Wazuh MCP server provides a Model Context Protocol interface to your Wazuh SIEM, allowing Cortex AI and other components to:
- Query security alerts and events
- Monitor all Proxmox infrastructure agents
- Analyze vulnerabilities and threats
- Manage Wazuh agents remotely
- Coordinate security exercises

## Architecture

```
┌─────────────────────────────────────────────┐
│  Proxmox Infrastructure                     │
│                                             │
│  ┌──────────────┐      ┌─────────────────┐ │
│  │  Container   │      │   Wazuh SIEM    │ │
│  │  (Docker)    │      │  10.88.140.202  │ │
│  │              │      │                 │ │
│  │  Wazuh MCP   │─────→│  REST API       │ │
│  │  Server      │ HTTPS│  :55000         │ │
│  │  :3000       │      └─────────────────┘ │
│  └──────┬───────┘                          │
│         │ HTTP/SSE                          │
│         ↓                                   │
│  ┌──────────────────────────────────────┐  │
│  │  Cortex Components                   │  │
│  │  - Masters (Security, Development)   │  │
│  │  - Workers                           │  │
│  │  - Dashboard                         │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Deployment Options

### Option 1: Deploy to Existing Docker Host

If you have a VM running Docker (e.g., VM 310 K3s master):

```bash
# SSH to Docker host
ssh user@10.88.145.180

# Clone repo
git clone https://github.com/ry-ops/cortex.git
cd cortex/lib/mcp-servers

# Start the container
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f wazuh-mcp-server
```

### Option 2: Create New LXC Container

Create a dedicated LXC container for the MCP server:

**Container Specs:**
- **CT ID:** 104 (or next available)
- **OS:** Ubuntu 22.04
- **CPU:** 2 cores
- **RAM:** 2 GB
- **Disk:** 8 GB
- **Network:** VLAN 145 (same as K3s cluster)
- **IP:** 10.88.145.184/24 (or next available)

**Setup Steps:**

```bash
# Create container via Proxmox API
curl -k -X POST \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/lxc" \
  -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33" \
  -d "vmid=104" \
  -d "ostemplate=local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst" \
  -d "hostname=wazuh-mcp" \
  -d "cores=2" \
  -d "memory=2048" \
  -d "rootfs=local-lvm:8" \
  -d "net0=name=eth0,bridge=vmbr0,tag=145,ip=10.88.145.184/24,gw=10.88.145.1" \
  -d "start=1"

# SSH into container
ssh root@10.88.145.184

# Install Docker
apt update
apt install -y docker.io docker-compose git
systemctl enable docker
systemctl start docker

# Deploy MCP server
git clone https://github.com/ry-ops/cortex.git
cd cortex/lib/mcp-servers
docker-compose up -d
```

### Option 3: Deploy to K3s Cluster

Deploy as a Kubernetes Deployment alongside other Cortex components:

```bash
# Create namespace
kubectl create namespace cortex-mcp

# Create secret for Wazuh credentials
kubectl create secret generic wazuh-credentials \
  --from-literal=WAZUH_API_USER=admin \
  --from-literal=WAZUH_API_PASSWORD='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
  -n cortex-mcp

# Apply deployment
kubectl apply -f k8s/mcp-servers/wazuh-mcp-deployment.yaml

# Check status
kubectl get pods -n cortex-mcp
kubectl logs -f deployment/wazuh-mcp-server -n cortex-mcp
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WAZUH_API_URL` | Wazuh server URL | `https://10.88.140.202` |
| `WAZUH_API_USER` | Wazuh API username | `admin` |
| `WAZUH_API_PASSWORD` | Wazuh API password | (required) |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment | `production` |

### Network Configuration

**Required Connectivity:**
- **Outbound HTTPS (443/55000)** to Wazuh server at 10.88.140.202
- **Inbound HTTP (3000)** from Cortex components

**Firewall Rules:**
```bash
# Allow outbound to Wazuh
iptables -A OUTPUT -p tcp -d 10.88.140.202 --dport 443 -j ACCEPT
iptables -A OUTPUT -p tcp -d 10.88.140.202 --dport 55000 -j ACCEPT

# Allow inbound from Cortex network
iptables -A INPUT -p tcp -s 10.88.145.0/24 --dport 3000 -j ACCEPT
```

## Building the Container Image

### Local Build

```bash
cd /Users/ryandahlberg/Projects/cortex/lib/mcp-servers

# Build image
docker build -t ghcr.io/ry-ops/cortex/wazuh-mcp-server:latest .

# Test locally
docker run -p 3000:3000 \
  -e WAZUH_API_URL=https://10.88.140.202 \
  -e WAZUH_API_USER=admin \
  -e WAZUH_API_PASSWORD='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
  ghcr.io/ry-ops/cortex/wazuh-mcp-server:latest

# Test health endpoint
curl http://localhost:3000/health
```

### GitHub Actions Build

The container image is automatically built and pushed to GitHub Container Registry when changes are pushed:

```yaml
# .github/workflows/build-mcp-servers.yml
name: Build MCP Server Images

on:
  push:
    branches: [main, docker-container]
    paths:
      - 'lib/mcp-servers/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Wazuh MCP Server
        uses: docker/build-push-action@v5
        with:
          context: lib/mcp-servers
          push: true
          tags: |
            ghcr.io/ry-ops/cortex/wazuh-mcp-server:latest
            ghcr.io/ry-ops/cortex/wazuh-mcp-server:${{ github.sha }}
```

## Testing the Deployment

### 1. Health Check

```bash
curl http://10.88.145.184:3000/health

# Expected output:
{
  "status": "healthy",
  "service": "wazuh-mcp-server",
  "wazuh_url": "https://10.88.140.202"
}
```

### 2. Test Wazuh Connection

```bash
# Test MCP endpoint (requires MCP client)
curl -X POST http://10.88.145.184:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'

# Should return list of available tools
```

### 3. Query Wazuh Agents

```bash
# Using the MCP protocol
curl -X POST http://10.88.145.184:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_agents",
      "arguments": {}
    },
    "id": 2
  }'
```

## Integration with Cortex

### Security Master Integration

Update Security Master configuration to use the MCP server:

```json
// coordination/masters/security/config.json
{
  "mcp_servers": {
    "wazuh": {
      "url": "http://10.88.145.184:3000/mcp",
      "transport": "sse",
      "enabled": true
    }
  }
}
```

### Dashboard Integration

The EUI Dashboard can display Wazuh metrics from the MCP server:

```javascript
// eui-dashboard/server/routes/security.js
const wazuhMCP = 'http://10.88.145.184:3000/mcp';

app.get('/api/security/alerts', async (req, res) => {
  const response = await fetch(wazuhMCP, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_alerts',
        arguments: { limit: 50 }
      },
      id: Date.now()
    })
  });
  const data = await response.json();
  res.json(data.result);
});
```

## Monitoring and Logs

### View Logs

```bash
# Docker Compose deployment
docker-compose logs -f wazuh-mcp-server

# Kubernetes deployment
kubectl logs -f deployment/wazuh-mcp-server -n cortex-mcp

# Container logs
docker logs -f wazuh-mcp-server
```

### Prometheus Metrics

The container exposes health metrics at `/health`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'wazuh-mcp'
    static_configs:
      - targets: ['10.88.145.184:3000']
    metrics_path: /health
    scrape_interval: 30s
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs wazuh-mcp-server

# Verify environment variables
docker-compose config

# Test Wazuh connection manually
curl -k -u admin:'*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
  https://10.88.140.202/security/user/authenticate
```

### Authentication Failures

```bash
# Verify Wazuh credentials
curl -k -u admin:'*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
  https://10.88.140.202/security/user/authenticate

# Should return JWT token

# Check MCP server can reach Wazuh
docker exec wazuh-mcp-server curl -k https://10.88.140.202
```

### No Data Returned

```bash
# Verify Wazuh has agents
curl -k -u admin:'*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
  https://10.88.140.202/agents

# Check MCP server logs for errors
docker-compose logs wazuh-mcp-server | grep -i error
```

## Security Considerations

**Credentials Management:**
- Wazuh password stored in environment variable (consider using secrets management)
- Container runs as non-root user (UID 1001)
- HTTPS used for all Wazuh API communication

**Network Security:**
- MCP server accessible only from Cortex network (10.88.145.0/24)
- Outbound connections only to Wazuh server
- No public internet exposure

**Recommended Improvements:**
- Use Kubernetes Secrets for credentials
- Implement API key authentication for MCP endpoint
- Add rate limiting to prevent abuse
- Enable TLS for MCP HTTP endpoint

## Backup and Recovery

### Backup Configuration

```bash
# Backup docker-compose.yml and .env
cp docker-compose.yml docker-compose.yml.backup
cp .env .env.backup

# Backup as part of Proxmox backup
# LXC containers are included in Proxmox Backup Server
```

### Recovery

```bash
# Restore from backup
docker-compose down
docker-compose up -d

# Or rebuild from source
git pull
docker-compose up -d --build
```

## Updates and Maintenance

### Update Container Image

```bash
# Pull latest image
docker-compose pull wazuh-mcp-server

# Restart with new image
docker-compose up -d --force-recreate wazuh-mcp-server

# Verify update
docker-compose logs wazuh-mcp-server | head -20
```

### Rotate Credentials

```bash
# Update credentials in Wazuh first
# Then update docker-compose.yml or environment variables

# Restart container
docker-compose restart wazuh-mcp-server
```

## Performance Tuning

**Resource Limits:**
```yaml
# docker-compose.yml
services:
  wazuh-mcp-server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

**Connection Pooling:**
- MCP server maintains single Wazuh API connection
- JWT token cached to reduce authentication overhead
- Automatic token refresh on expiration

## Related Documentation

- [Wazuh MCP Server Documentation](/Users/ryandahlberg/Projects/cortex/docs/mcp-servers/WAZUH-MCP-SERVER.md)
- [Sentinel Forge K3s Deployment](/Users/ryandahlberg/Projects/cortex/SENTINEL-FORGE-K3S-DEPLOYMENT.md)
- [Wazuh API Documentation](https://documentation.wazuh.com/current/user-manual/api/index.html)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)

---

**Deployment Status:** Ready for Production
**Container Registry:** ghcr.io/ry-ops/cortex/wazuh-mcp-server:latest
**Last Updated:** 2025-12-13
**Maintained By:** Cortex AI Team
