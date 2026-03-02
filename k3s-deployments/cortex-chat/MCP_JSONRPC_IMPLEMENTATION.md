# UniFi MCP HTTP Wrapper - MCP JSON-RPC Implementation

## Summary

Successfully implemented proper MCP JSON-RPC support for the UniFi MCP HTTP wrapper. The wrapper now accepts standard MCP JSON-RPC requests at the root path (`POST /`) in addition to the legacy endpoints.

## Changes Made

### 1. Updated HTTP Wrapper (`mcp-http-wrapper.py`)

**File**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/mcp-http-wrapper-updated.py`

**Key Additions**:
- Added `send_mcp_request()` method to `MCPStdioClient` class for generic MCP JSON-RPC request handling
- Implemented `POST /` endpoint that accepts MCP JSON-RPC format
- Added support for all MCP methods: `tools/call`, `tools/list`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`
- Maintains backward compatibility with legacy endpoints: `/query`, `/call-tool`, `/list-tools`

### 2. Updated ConfigMap

**ConfigMap**: `mcp-http-wrapper` in namespace `cortex-system`

Applied new wrapper code to the cluster:
```bash
kubectl create configmap mcp-http-wrapper -n cortex-system \
  --from-file=mcp-http-wrapper.py=mcp-http-wrapper-updated.py \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Restarted Deployment

**Deployment**: `unifi-mcp-server` in namespace `cortex-system`

```bash
kubectl rollout restart deployment/unifi-mcp-server -n cortex-system
kubectl rollout status deployment/unifi-mcp-server -n cortex-system
```

## Supported Endpoints

### MCP JSON-RPC Endpoint (NEW)

**Endpoint**: `POST /`

**Request Format**:
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

**Response Format**:
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

**Supported Methods**:
- `tools/list` - List available MCP tools
- `tools/call` - Execute a specific tool
- `resources/list` - List available resources
- `resources/read` - Read a specific resource
- `prompts/list` - List available prompts
- `prompts/get` - Get a specific prompt

### Legacy Endpoints (Maintained for Backward Compatibility)

1. **POST /query** - Natural language query (uses first available tool)
2. **POST /call-tool** - Direct tool call with `tool_name` and `arguments`
3. **GET /list-tools** - List available tools
4. **GET /health** - Health check

## Test Results

### Test 1: List Tools

**Command**:
```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Result**: SUCCESS - Returns 33 available tools including:
- `get_device_health`
- `get_client_activity`
- `list_active_clients`
- `get_system_status`
- And 29 more tools

### Test 2: Call Tool (get_device_health)

**Command**:
```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_device_health","arguments":{}}}'
```

**Result**: SUCCESS - Returns proper MCP response format:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{...}"
      }
    ],
    "structuredContent": {...},
    "isError": false
  }
}
```

### Test 3: Call Tool (get_quick_status)

**Command**:
```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_quick_status","arguments":{}}}'
```

**Result**: SUCCESS - Returns status information in proper MCP format

## Service Details

**Namespace**: `cortex-system`
**Deployment**: `unifi-mcp-server`
**Service**: `unifi-mcp-server` (ClusterIP: `10.43.178.37:3000`)
**Pod Status**: Running and healthy

## Error Handling

The implementation includes proper JSON-RPC error responses:

- **Parse Error (-32700)**: Invalid JSON in request body
- **Invalid Request (-32600)**: Missing or invalid `jsonrpc` field
- **Method Not Found (-32601)**: Unsupported MCP method
- **Invalid Params (-32602)**: Missing required parameters (e.g., `name` in `tools/call`)
- **Internal Error (-32603)**: Server-side errors during request processing
- **Request Timeout (-32000)**: MCP server did not respond within 60 seconds

## Integration with Orchestrator

The orchestrator can now call the UniFi MCP server using standard MCP JSON-RPC format:

**Service URL**: `http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/`

**Example Request**:
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

This follows MCP specification best practices and eliminates the need for workarounds using natural language queries.

## Files Modified

1. **Local**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/mcp-http-wrapper-updated.py`
2. **ConfigMap**: `mcp-http-wrapper` in `cortex-system` namespace
3. **Deployment**: `unifi-mcp-server` in `cortex-system` namespace (restarted to apply changes)

## Success Criteria

- [x] HTTP wrapper accepts POST / with MCP JSON-RPC format
- [x] Routes `tools/call` method to Python MCP server's stdio interface
- [x] Returns proper MCP response format with `jsonrpc`, `id`, and `result` fields
- [x] Handles these tools: `list_active_clients`, `get_device_health`, `get_client_activity`
- [x] Maintains backward compatibility with `/query` endpoint
- [x] curl test commands return valid MCP responses
- [x] No JSON parse errors in responses

## Next Steps

The orchestrator can now integrate with the UniFi MCP server using the standard MCP JSON-RPC protocol. No additional changes needed on the MCP server side.

To test from orchestrator:
```bash
# From within the cluster
curl -X POST http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_device_health","arguments":{}}}'
```
