# Cortex MCP Server - Quick Start Guide

## 1. Verify Installation

```bash
cd /Users/ryandahlberg/Projects/cortex/cortex-mcp-server
./verify-structure.sh
```

Expected output: "ALL CHECKS PASSED"

## 2. Install Dependencies

```bash
npm install
```

## 3. Start the Server

### Option A: Development Mode
```bash
npm run dev
```

### Option B: Production Mode
```bash
npm start
```

The server will start:
- **MCP Protocol**: stdio (JSON-RPC 2.0)
- **Status Server**: http://localhost:8080

## 4. Test the Server

### Test 1: Health Check
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 5.123,
  "requests": 0
}
```

### Test 2: Status Check
```bash
curl http://localhost:8080/status
```

### Test 3: Routing Stats
```bash
curl http://localhost:8080/routing
```

Expected response:
```json
{
  "total_routes": 11,
  "tiers": {
    "1": 4,
    "2": 1,
    "3": 1,
    "4": 1,
    "5": 1,
    "6": 2
  },
  "routes_by_tier": { ... }
}
```

## 5. Test MCP Protocol

Create a test file `test-mcp.json`:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

Run:
```bash
cat test-mcp.json | npm start
```

Expected: List of 8 tools (cortex_query, cortex_manage_infrastructure, etc.)

## 6. Example Usage: Query Infrastructure

Create `query-test.json`:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "cortex_query",
    "arguments": {
      "query": "Show all pods in cortex-system namespace",
      "target": "auto"
    }
  }
}
```

Run:
```bash
cat query-test.json | npm start
```

## 7. Example Usage: Spawn Workers

Create `spawn-test.json`:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "cortex_spawn_workers",
    "arguments": {
      "count": 5,
      "worker_type": "implementation",
      "swarm_type": "test-swarm",
      "master": "development",
      "priority": "normal"
    }
  }
}
```

Run:
```bash
cat spawn-test.json | npm start
```

## 8. Example Usage: Get System Status

Create `status-test.json`:
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "cortex_get_status",
    "arguments": {
      "scope": "all",
      "details": true
    }
  }
}
```

Run:
```bash
cat status-test.json | npm start
```

## 9. Docker Deployment

### Build Image
```bash
npm run docker:build
```

### Run Container
```bash
npm run docker:run
```

### Or use docker-compose
```bash
docker-compose up -d
```

### Check logs
```bash
docker logs cortex-mcp-server -f
```

## 10. Kubernetes Deployment

### Deploy to cluster
```bash
kubectl apply -f k8s/cortex-mcp-server.yaml
```

### Check deployment
```bash
kubectl get pods -n cortex-system -l app=cortex-mcp-server
```

### View logs
```bash
kubectl logs -n cortex-system -l app=cortex-mcp-server -f
```

### Port forward for testing
```bash
kubectl port-forward -n cortex-system svc/cortex-mcp-server 3000:3000 8080:8080
```

### Test health check
```bash
curl http://localhost:8080/health
```

## 11. Integration with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/Users/ryandahlberg/Projects/cortex/cortex-mcp-server/src/index.js"],
      "env": {
        "CORTEX_HOME": "/Users/ryandahlberg/Projects/cortex",
        "STATUS_PORT": "8080"
      }
    }
  }
}
```

Restart Claude Desktop and you'll see the Cortex tools available!

## 12. Available Tools in Claude

Once integrated, you can use these tools in Claude:

### Tier 1: Query Infrastructure
```
"Show all UniFi access points"
"List all Proxmox VMs"
"Get Wazuh security alerts"
"Show k8s pods in cortex-system"
```

### Tier 2: Manage Infrastructure
```
"Scale the cortex-mcp-server deployment to 5 replicas"
"Create a new VM on Proxmox with 4GB RAM"
```

### Tier 3: Spawn Workers
```
"Spawn 10 implementation workers for feature development"
"Create 100 security scan workers"
```

### Tier 4: Coordinate Masters
```
"Route this task to the appropriate master: implement OAuth2 authentication"
"Show me all available master agents"
```

### Tier 5: Build Projects
```
"Build 50 REST API microservices with Node.js and PostgreSQL"
```

### Tier 6: Monitor & Control
```
"Show me the current system status"
"Get worker pool statistics"
"Pause all worker operations"
```

## 13. Troubleshooting

### Server won't start
```bash
# Check Node.js version (must be >= 18)
node --version

# Check for port conflicts
lsof -i :8080

# Check environment variables
echo $CORTEX_HOME
```

### Health check fails
```bash
# Check server is running
ps aux | grep "node.*index.js"

# Check logs
tail -f /tmp/cortex-mcp-server.log
```

### MCP protocol errors
```bash
# Validate JSON syntax
cat test-mcp.json | jq .

# Check MCP protocol version
grep "protocolVersion" src/index.js
```

### Worker spawn failures
```bash
# Check spawn script exists
ls -la /Users/ryandahlberg/Projects/cortex/scripts/spawn-worker.sh

# Check worker pool file
cat /Users/ryandahlberg/Projects/cortex/coordination/worker-pool.json | jq .
```

## 14. Performance Tips

### For high throughput
- Increase HPA max replicas in `k8s/cortex-mcp-server.yaml`
- Adjust resource limits (CPU/memory)
- Use ReadWriteMany PVC for shared coordination data

### For worker spawning at scale
- Adjust concurrency in `src/worker-pool/spawner.js`
- Monitor worker pool capacity
- Use batch processing for 1000+ workers

## 15. Next Steps

1. **Add monitoring**: Integrate Prometheus metrics
2. **Add tests**: Unit and integration tests
3. **Enhance security**: Add authentication/authorization
4. **Optimize performance**: Caching, connection pooling
5. **Add resources**: Implement MCP resources for read-only data access

## Support

For issues, check:
- `/Users/ryandahlberg/Projects/cortex/cortex-mcp-server/README.md`
- `/Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/CORTEX-MCP-INTEGRATION-COMPLETE.md`

---

**You're all set!** The Cortex MCP Server is ready to expose the entire Cortex construction company to AI agents.

Happy building!
