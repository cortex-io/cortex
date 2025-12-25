# Cortex Operations Guide

## Quick Start

### Health Check
```bash
./scripts/preflight-check.sh
```

### Access Points
- **Chat App**: https://chat.ry-ops.dev
- **Chat IP** (direct): http://10.88.145.210
- **Cortex API**: https://cortex-api.ry-ops.dev
- **UniFi MCP**: https://unifi-mcp.ry-ops.dev/health
- **Wazuh MCP**: https://wazuh-mcp.ry-ops.dev/health
- **Proxmox MCP**: https://proxmox-mcp.ry-ops.dev/health

## Common Tasks

### After Cluster Restart
1. Wait for all nodes to be Ready (5-10 min)
2. Apply MCP service aliases: `kubectl apply -f k8s/mcp-service-aliases.yaml`
3. Run preflight check: `./scripts/preflight-check.sh`
4. If failures, check: `docs/PREFLIGHT-PLAYBOOK.md`

### Restart All Services
```bash
kubectl rollout restart deployment -n cortex-system --all
kubectl rollout restart deployment -n cortex cortex-orchestrator
kubectl rollout restart deployment -n cortex-chat cortex-chat cortex-chat-proxy
```

### View Logs
```bash
# MCP servers
kubectl logs -n cortex-system deployment/unifi-mcp-server --tail=50
kubectl logs -n cortex-system deployment/wazuh-mcp-server --tail=50
kubectl logs -n cortex-system deployment/proxmox-mcp-server --tail=50

# Cortex orchestrator
kubectl logs -n cortex deployment/cortex-orchestrator --tail=50

# Chat app
kubectl logs -n cortex-chat deployment/cortex-chat --tail=50
kubectl logs -n cortex-chat deployment/cortex-chat-proxy --tail=50
```

### Watch Pod Status
```bash
watch -n 2 'kubectl get pods -n cortex-system && echo && kubectl get pods -n cortex && echo && kubectl get pods -n cortex-chat'
```

## Troubleshooting

See detailed troubleshooting in:
- `docs/PREFLIGHT-PLAYBOOK.md` - Complete operational playbook
- `docs/MCP-SERVER-SETUP.md` - MCP server configuration
- `docs/CORTEX-CHAT-INTEGRATION.md` - Chat app integration

## Architecture

```
User → Tailscale/VPN
  ↓
Traefik (10.88.145.200)
  ↓
┌─────────────────────────────────────┐
│ Cortex Chat (cortex-chat namespace) │
│   - Frontend (Next.js)               │
│   - Nginx Proxy                      │
│   - Simple Proxy → Cortex            │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Cortex Orchestrator (cortex ns)     │
│   - Intelligent routing              │
│   - Claude API integration           │
│   - Tool execution                   │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ MCP Servers (cortex-system ns)      │
│   - UniFi MCP      :3000            │
│   - Wazuh MCP      :8080            │
│   - Proxmox MCP    :3000            │
│   - Cloudflare MCP :3000            │
└─────────────────────────────────────┘
```

## Key Files

- `k8s/mcp-service-aliases.yaml` - MCP service aliases (REQUIRED after restarts)
- `scripts/preflight-check.sh` - Health check script
- `docs/PREFLIGHT-PLAYBOOK.md` - Detailed operational guide

## Recent Changes (2025-12-24)

- ✅ Upgraded all k3s nodes from 2 to 6 CPU cores via Proxmox API
- ✅ Fixed MCP server HTTP wrappers (UniFi, Wazuh, Proxmox)
- ✅ Created MCP service aliases for backward compatibility
- ✅ Fixed Traefik ingress routing for all MCP servers
- ✅ Created comprehensive pre-flight playbook
- ✅ All MCP servers now accessible via Traefik externally
- ✅ Cortex orchestrator can reach all MCP servers via cluster DNS

## Known Issues

1. **Docker Registry** - May get stuck on volume attachment after node restarts
   - Fix: Delete stuck volumeattachment, restart pod

2. **MCP Health Checks** - Test pods sometimes fail DNS resolution
   - MCP servers ARE healthy (logs show 200 responses)
   - Issue is with ephemeral test pods, not the MCP servers

3. **Tailscale Access** - 10.88.145.0/24 subnet must be advertised
   - Configure Tailscale subnet routing on exit node
   - Or use direct IP access: http://10.88.145.210

## Support

For issues or questions:
1. Run `./scripts/preflight-check.sh` to identify problems
2. Check `docs/PREFLIGHT-PLAYBOOK.md` for solutions
3. Review logs for specific components
4. Check recent git commits for configuration changes
