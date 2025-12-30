# UniFi MCP JSON-RPC Quick Reference

## Service Endpoint

**URL**: `http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/`
**Protocol**: MCP JSON-RPC 2.0
**Port**: 3000

## Basic Usage

### List Available Tools

```bash
curl -X POST http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### Call a Tool

```bash
curl -X POST http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_device_health",
      "arguments": {}
    }
  }'
```

## Common Tools

### Network Status
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_system_status",
    "arguments": {}
  }
}
```

### Device Health
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_device_health",
    "arguments": {}
  }
}
```

### Active Clients
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_active_clients",
    "arguments": {}
  }
}
```

### Client Activity
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_client_activity",
    "arguments": {}
  }
}
```

### Quick Status
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_quick_status",
    "arguments": {}
  }
}
```

## Response Format

### Success Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ],
    "structuredContent": {},
    "isError": false
  }
}
```

### Error Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found: invalid/method"
  }
}
```

## Error Codes

| Code | Meaning | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Missing/invalid jsonrpc field |
| -32601 | Method not found | Unsupported MCP method |
| -32602 | Invalid params | Missing required parameters |
| -32603 | Internal error | Server-side error |
| -32000 | Request timeout | No response within 60s |

## Testing

Run the test script to verify all functionality:

```bash
kubectl exec -it deployment/unifi-mcp-server -n cortex-system -- \
  bash /app/test-mcp-jsonrpc.sh
```

Or test from local machine (with port-forward):

```bash
kubectl port-forward -n cortex-system svc/unifi-mcp-server 3000:3000 &
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Kubernetes Management

### Check Status
```bash
kubectl get deployment unifi-mcp-server -n cortex-system
kubectl get pods -n cortex-system -l app=unifi-mcp-server
kubectl get svc unifi-mcp-server -n cortex-system
```

### View Logs
```bash
kubectl logs -n cortex-system -l app=unifi-mcp-server --tail=100 -f
```

### Restart
```bash
kubectl rollout restart deployment/unifi-mcp-server -n cortex-system
```

### Update ConfigMap
```bash
kubectl create configmap mcp-http-wrapper -n cortex-system \
  --from-file=mcp-http-wrapper.py=./mcp-http-wrapper-updated.py \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/unifi-mcp-server -n cortex-system
```

## Integration Example (JavaScript/TypeScript)

```typescript
interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

async function callUniFiTool(toolName: string, args: any = {}): Promise<any> {
  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  const response = await fetch(
    'http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  );

  const data: MCPResponse = await response.json();

  if (data.error) {
    throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
  }

  return data.result;
}

// Usage
const deviceHealth = await callUniFiTool('get_device_health', {});
const activeClients = await callUniFiTool('list_active_clients', {});
```

## Files

- **Implementation**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/mcp-http-wrapper-updated.py`
- **Documentation**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/MCP_JSONRPC_IMPLEMENTATION.md`
- **Summary**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/IMPLEMENTATION_SUMMARY.md`
- **Test Script**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/test-mcp-jsonrpc.sh`
- **This Guide**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/QUICK_REFERENCE.md`
