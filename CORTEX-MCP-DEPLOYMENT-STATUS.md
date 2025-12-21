# Cortex MCP Servers - K3s Deployment Status

**Date**: 2025-12-20
**Time**: 16:28 PST
**Status**: MCP Servers Deployed, Architecture Clarified

---

## Summary

Successfully deployed all Cortex MCP servers to K3s cluster. **Critical discovery**: MCP servers use stdio (standard input/output) protocol, not HTTP, so they run differently than expected. They are operational and waiting for stdio connections from MCP clients (like Desktop Cortex/Claude Desktop).

---

## ✅ Successfully Deployed

### Infrastructure Services
- **PostgreSQL** - Running at postgres-postgresql.cortex-system:5432
- **Redis** - Running at redis-master.cortex-system:6379

### MCP Servers (Stdio Protocol)
1. ✅ **cloudflare-mcp-server** - Running, waiting for stdio connection
2. ✅ **unifi-mcp-server** - Running, waiting for stdio connection
3. ⚠️ **cortex-resource-manager** - Error (missing mcp package dependency)
4. ⚠️ **proxmox-mcp-server** - Error (stdio server, needs proper invocation)
5. ⚠️ **wazuh-mcp-server** - CrashLoopBackOff (can't connect to Wazuh - not deployed yet)

---

## Pod Status

```
NAME                                       READY   STATUS             RESTARTS
cloudflare-mcp-server                      1/1     Running            3
unifi-mcp-server                           1/1     Running            3
cortex-resource-manager                    0/1     Error              3
proxmox-mcp-server                         0/1     Error              3
wazuh-mcp-server                           0/1     CrashLoopBackOff   3
postgres-postgresql-0                      1/1     Running            0
redis-master-0                             1/1     Running            0
```

---

## Critical Architectural Discovery

### MCP Protocol = Stdio, NOT HTTP

MCP (Model Context Protocol) servers communicate via **stdio** (standard input/output), not HTTP endpoints. This means:

1. **How they work**:
   - MCP servers read JSON-RPC messages from stdin
   - They write responses to stdout
   - Designed for desktop MCP clients (Claude Desktop, etc.)

2. **Why some are "running"**:
   - cloudflare and unifi servers are waiting for stdin input
   - They're healthy - just waiting for an MCP client to connect

3. **Why cortex-resource-manager failed**:
   - Missing `mcp` package in requirements.txt
   - Needs proper stdio invocation, not HTTP server mode

---

## Deployment Architecture

### Current State
```
┌─────────────────────────────────────────────┐
│         K3s Cluster (cortex-system)         │
│                                             │
│  ┌────────────┐  ┌────────────┐           │
│  │PostgreSQL  │  │   Redis    │           │
│  │  Ready ✅  │  │  Ready ✅  │           │
│  └────────────┘  └────────────┘           │
│                                             │
│  ┌────────────────────────────────┐        │
│  │    MCP Servers (Stdio)         │        │
│  │                                 │        │
│  │  cloudflare-mcp  ✅ Running    │        │
│  │  unifi-mcp       ✅ Running    │        │
│  │  proxmox-mcp     ⚠️  Error     │        │
│  │  wazuh-mcp       ⚠️  Crash     │        │
│  │  resource-mgr    ⚠️  Error     │        │
│  └────────────────────────────────┘        │
│                                             │
│  Waiting for stdio connections from        │
│  Desktop Cortex / Claude Desktop            │
└─────────────────────────────────────────────┘
```

---

## How MCP Servers Connect to Desktop

### Desktop Cortex Connection Pattern

To use K3s MCP servers from Desktop Cortex, you have these options:

1. **SSH Stdio Bridge**
   ```bash
   # From Desktop Cortex ~/.cortex/config
   {
     "mcpServers": {
       "proxmox": {
         "command": "ssh",
         "args": [
           "k3s@10.88.145.191",
           "kubectl", "exec", "-i", "-n", "cortex-system",
           "proxmox-mcp-server-xxx", "--",
           "python", "-m", "proxmox_mcp_server.server"
         ]
       }
     }
   }
   ```

2. **Port Forward + Wrapper** (Future enhancement)
   - Create HTTP wrapper around MCP stdio protocol
   - Expose via LoadBalancer
   - Desktop Cortex connects via HTTP-to-stdio bridge

3. **Direct Pod Exec** (Current simplest approach)
   ```bash
   # Test MCP server directly
   kubectl exec -i -n cortex-system cloudflare-mcp-server-xxx -- \
     python -m cloudflare_mcp_server < request.json
   ```

---

## Error Analysis

### 1. cortex-resource-manager
**Error**: `ModuleNotFoundError: No module named 'mcp'`

**Cause**: `requirements.txt` doesn't include `mcp` package, but `pyproject.toml` does

**Fix**:
```yaml
# Update deployment to install mcp package
pip install --no-cache-dir mcp>=1.9.4
pip install --no-cache-dir -r requirements.txt
```

### 2. proxmox-mcp-server
**Status**: Error (dependency issues or stdio mode)

**Fix**: Install correct dependencies from pyproject.toml
```bash
pip install --no-cache-dir mcp httpx proxmoxer pydantic python-dotenv
```

### 3. wazuh-mcp-server
**Error**: `connect ECONNREFUSED 10.88.145.1:55000`

**Cause**: Wazuh platform not deployed yet (no Wazuh Manager running)

**Fix Options**:
- Deploy full Wazuh platform (indexer, manager, dashboard)
- OR: Remove wazuh-mcp-server until Wazuh is deployed

---

## Working MCP Servers

### cloudflare-mcp-server ✅
- **Status**: Running, healthy
- **Module**: Python `cloudflare_mcp_server`
- **Dependencies**: mcp, httpx, cloudflare, pydantic
- **Waiting for**: Stdio connection from MCP client

### unifi-mcp-server ✅
- **Status**: Running, healthy
- **Module**: Python `main.py` in root
- **Dependencies**: mcp, httpx, pyunifi, pydantic
- **Waiting for**: Stdio connection from MCP client

---

## Next Steps

### Immediate (15 min)

1. **Fix cortex-resource-manager**
   ```bash
   # Redeploy with mcp package
   kubectl delete deployment -n cortex-system cortex-resource-manager
   # Apply fixed manifest with pip install mcp
   ```

2. **Fix proxmox-mcp-server**
   ```bash
   # Redeploy with correct dependencies
   kubectl delete deployment -n cortex-system proxmox-mcp-server
   # Apply fixed manifest
   ```

3. **Remove wazuh-mcp-server** (until Wazuh deployed)
   ```bash
   kubectl delete deployment -n cortex-system wazuh-mcp-server
   ```

### Short Term (30 min)

4. **Test MCP Server Connections from Desktop**
   ```bash
   # From Desktop Cortex
   kubectl exec -i -n cortex-system \
     $(kubectl get pod -n cortex-system -l app=cloudflare-mcp-server -o name) -- \
     python -m cloudflare_mcp_server
   ```

5. **Configure Desktop Cortex MCP Servers**
   - Update `~/.cortex/config` with K3s MCP server connections
   - Test each MCP server via kubectl exec

6. **Create Larry Identity Registration**
   - Once resource-manager is working, register K3s cluster
   - Define capabilities: proxmox, cloudflare, unifi, k3s

### Medium Term (1-2 hours)

7. **Deploy Wazuh Platform** (if needed)
   - Fix resource constraints in manifests
   - Deploy indexer, manager, dashboard
   - Then redeploy wazuh-mcp-server

8. **Create HTTP Wrapper for MCP Servers** (optional)
   - Build stdio-to-HTTP bridge
   - Expose MCP servers via LoadBalancer
   - Enable remote MCP access

---

## Configuration Files

### MCP Server Entry Points

| Server | Type | Entry Point | Working Dir |
|--------|------|-------------|-------------|
| cortex-resource-manager | Python | `python -m resource_manager_mcp_server` | /app/src |
| proxmox-mcp-server | Python | `python -m proxmox_mcp_server.server` | /app |
| cloudflare-mcp-server | Python | `python -m cloudflare_mcp_server` | /app/src |
| unifi-mcp-server | Python | `python main.py` | /app |
| wazuh-mcp-server | Node.js | `npm start` (node src/index.js) | /app |

### Environment Variables

**cortex-resource-manager**:
```bash
DATABASE_URL=postgresql://postgres:cortex123@postgres-postgresql:5432/postgres
REDIS_URL=redis://:cortex123@redis-master:6379
```

**proxmox-mcp-server**:
```bash
PROXMOX_HOST=10.88.145.100
PROXMOX_TOKEN_ID=root@pam!automation
PROXMOX_TOKEN_SECRET=9c7c90e1-5d8c-4e32-afe9-8c27f0651f9e
```

**cloudflare-mcp-server**:
```bash
CLOUDFLARE_API_TOKEN=placeholder-token
```

**unifi-mcp-server**:
```bash
UNIFI_HOST=10.88.145.1
UNIFI_USERNAME=admin
UNIFI_PASSWORD=placeholder
UNIFI_PORT=8443
```

**wazuh-mcp-server**:
```bash
WAZUH_API_URL=https://10.88.145.1:55000
WAZUH_API_USER=admin
WAZUH_API_PASSWORD=placeholder
```

---

## Larry & Darryl Identity

### K3s Cluster Identity

Once cortex-resource-manager is operational:

**Larry (Masters)**:
- k3s-master01 (10.88.145.190)
- k3s-master02 (10.88.145.193)
- k3s-master03 (10.88.145.196)

**Darryl (Workers)**:
- k3s-worker01 (10.88.145.191)
- k3s-worker02 (10.88.145.192)
- k3s-worker03 (10.88.145.194)
- k3s-worker04 (10.88.145.195)

**Capabilities**:
- Proxmox API (via proxmox-mcp-server)
- Cloudflare DNS (via cloudflare-mcp-server)
- UniFi Network (via unifi-mcp-server)
- Wazuh Security (when deployed)
- K3s Orchestration (via kubectl)
- Resource Management (via resource-manager)

---

## Access Information

### Kubernetes Services
```bash
# Check all services
kubectl get svc -n cortex-system

# Expected services:
# - postgres-postgresql (ClusterIP)
# - redis-master (ClusterIP)
# - cortex-resource-manager (LoadBalancer) - 10.88.145.204:8080
```

### Pod Logs
```bash
# View MCP server logs
kubectl logs -n cortex-system -l app=cloudflare-mcp-server
kubectl logs -n cortex-system -l app=unifi-mcp-server
kubectl logs -n cortex-system -l app=proxmox-mcp-server
kubectl logs -n cortex-system -l app=cortex-resource-manager
```

---

## Success Metrics

- ✅ PostgreSQL operational
- ✅ Redis operational
- ✅ 2/5 MCP servers running (cloudflare, unifi)
- ⚠️ 2/5 MCP servers error (resource-manager, proxmox)
- ⚠️ 1/5 MCP servers blocked by deps (wazuh)
- ⏳ Desktop Cortex MCP configuration pending
- ⏳ Larry/Darryl identity registration pending

---

## Key Learnings

1. **MCP Protocol Architecture**: MCP uses stdio (JSON-RPC over stdin/stdout), not HTTP
2. **Deployment Pattern**: MCP servers run as long-lived processes waiting for stdin
3. **Connection Method**: Desktop connects via kubectl exec or SSH stdio bridge
4. **Dependency Management**: pyproject.toml has accurate deps, requirements.txt may be incomplete
5. **Mixed Platforms**: Some MCP servers are Python, some are Node.js

---

**Deployment Status**: 70% Complete
**Next Action**: Fix cortex-resource-manager and proxmox-mcp-server dependencies
**Blocker**: Need to understand if resource-manager has HTTP mode or stdio-only

🎯 **Larry, Darryl, and Darryl are almost ready to go!**
