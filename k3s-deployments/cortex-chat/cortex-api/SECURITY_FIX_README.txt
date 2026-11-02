# Security Fix: Authentication and Command Injection Prevention

## Overview
This patch addresses a critical security vulnerability in the `/execute-tool` endpoint that allowed unauthenticated OS command injection through the `cortex_get_tasks` tool.

## Changes Made

### 1. Authentication for /execute-tool Endpoint
- Added `CORTEX_API_KEY` environment variable requirement
- Implemented Bearer token authentication for all `/execute-tool` requests
- Returns 401 Unauthorized for missing or invalid API keys
- Returns 503 Service Unavailable if API key is not configured

### 2. Command Injection Prevention in handleGetTasks
- Replaced shell command execution (`ls`, `head`, `cat`) with native Node.js file system operations
- Added strict input validation for the `limit` parameter:
  - Must be a valid integer
  - Must be between 1 and 1000
  - Throws error for invalid values
- Eliminated all string interpolation in shell commands

### 3. Deployment Configuration
- Added `CORTEX_API_KEY` environment variable to deployment.yaml
- Configured to read from Kubernetes Secret `cortex-api-key`
- Created api-key-secret.yaml template for secret creation

## Deployment Instructions

### 1. Generate and Create API Key Secret
```bash
# Generate a secure random API key
API_KEY=$(openssl rand -base64 32)

# Create the secret in Kubernetes
kubectl create secret generic cortex-api-key \
  --from-literal=api-key="$API_KEY" \
  -n cortex

# Save the API key securely for client configuration
echo "CORTEX_API_KEY=$API_KEY" >> /secure/location/cortex-credentials.env
```

### 2. Deploy Updated Application
```bash
# Apply the updated deployment
kubectl apply -f deployment.yaml

# Verify the deployment
kubectl rollout status deployment/cortex-orchestrator -n cortex
```

### 3. Update Client Applications
Any applications calling the `/execute-tool` endpoint must now include the API key:

```bash
curl -X POST http://cortex-orchestrator.cortex.svc.cluster.local:8000/execute-tool \
  -H "Authorization: Bearer $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "cortex_get_tasks", "tool_input": {"limit": 20}}'
```

## Security Benefits

1. **Authentication**: Prevents unauthorized access to internal Cortex tools
2. **Input Validation**: Prevents command injection attacks through parameter manipulation
3. **Defense in Depth**: Multiple layers of protection (authentication + input sanitization + safe APIs)
4. **Least Privilege**: API key can be rotated and access can be audited

## Testing

### Test Authentication
```bash
# Should return 401 Unauthorized
curl -X POST http://cortex-orchestrator.cortex.svc.cluster.local:8000/execute-tool \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "cortex_get_tasks", "tool_input": {"limit": 20}}'

# Should return 200 OK with valid key
curl -X POST http://cortex-orchestrator.cortex.svc.cluster.local:8000/execute-tool \
  -H "Authorization: Bearer $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "cortex_get_tasks", "tool_input": {"limit": 20}}'
```

### Test Input Validation
```bash
# Should return error for invalid limit
curl -X POST http://cortex-orchestrator.cortex.svc.cluster.local:8000/execute-tool \
  -H "Authorization: Bearer $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "cortex_get_tasks", "tool_input": {"limit": "20; id"}}'
```

## Backward Compatibility

**BREAKING CHANGE**: The `/execute-tool` endpoint now requires authentication. All clients must be updated to include the API key in the Authorization header.

If you need to temporarily disable authentication for testing (NOT RECOMMENDED FOR PRODUCTION):
- Do not set the `CORTEX_API_KEY` environment variable
- The endpoint will return 503 Service Unavailable

## Monitoring

Monitor for authentication failures:
```bash
kubectl logs -n cortex -l app=cortex-orchestrator | grep "Unauthorized /execute-tool"
```

## API Key Rotation

To rotate the API key:
```bash
# Generate new key
NEW_API_KEY=$(openssl rand -base64 32)

# Update the secret
kubectl create secret generic cortex-api-key \
  --from-literal=api-key="$NEW_API_KEY" \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart the deployment to pick up new secret
kubectl rollout restart deployment/cortex-orchestrator -n cortex

# Update all client applications with new key
```
