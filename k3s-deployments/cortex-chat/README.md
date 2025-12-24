# Cortex Chat - AI-Powered Infrastructure Interface

**Built:** December 24, 2025
**Deadline Met:** 8:36am CST (24 minutes early!)

## Overview

Cortex Chat is a mobile-first chat interface that provides natural language access to your entire k8s infrastructure. It combines a simplified backend, a new Cortex HTTP API, and a Claude iOS-style frontend to create a seamless ChatOps experience.

## Architecture

```
User (Browser/Mobile)
    ↓ HTTPS
Tailscale VPN (chat.ry-ops.dev)
    ↓
Nginx Proxy Manager
    ↓
K3s LoadBalancer (10.88.145.210)
    ↓
┌─────────────────────────────────────────────┐
│  Pod: cortex-chat (3 containers)            │
│  ├─ nginx-proxy (routes /api/* → backend)  │
│  ├─ frontend (static HTML on :3000)        │
│  └─ backend (Bun + Hono on :8080)          │
└─────────────────────────────────────────────┘
    ↓ (cortex_ask tool)
┌─────────────────────────────────────────────┐
│  Cortex HTTP API (cortex namespace)         │
│  - Node.js server with kubectl access       │
│  - ServiceAccount + ClusterRole RBAC        │
│  - Intelligently processes queries          │
└─────────────────────────────────────────────┘
    ↓ kubectl commands
K8s Cluster (7 nodes, 38 namespaces, 200+ pods)
```

## Components

### 1. Frontend (`frontend-redesign/`)
- **Technology:** Pure HTML/CSS/JavaScript (no build tools)
- **Size:** 36KB single file
- **Features:**
  - Claude iOS-style dark theme
  - Real-time SSE streaming
  - JWT authentication
  - Mobile-responsive PWA
  - R-Lightning company logo
  - "Cortex v2.0" branding

**Key Files:**
- `index.html` - Complete single-file application
- `Dockerfile` - Nginx alpine with cache-busting headers

### 2. Backend Simple (`backend-simple/`)
- **Technology:** Bun + Hono + TypeScript
- **Features:**
  - Single tool: `cortex_ask`
  - Routes all requests to Cortex HTTP API
  - JWT authentication
  - SSE streaming responses
  - Redis session storage

**Key Files:**
- `src/services/cortex-client.ts` - Cortex API client
- `src/tools/cortex-tool.ts` - Single tool definition
- `src/services/tool-executor.ts` - Simplified executor
- `src/routes/chat.ts` - Main chat endpoint
- `src/routes/auth.ts` - Authentication endpoints

**Why "Simple"?**
This backend doesn't reinvent the wheel - it delegates all kubectl/MCP functionality to the existing Cortex HTTP API instead of duplicating capabilities.

### 3. Cortex HTTP API (`cortex-api/`)
- **Technology:** Node.js + kubectl
- **Features:**
  - Intelligently processes natural language queries
  - Direct kubectl access via ServiceAccount
  - Handles cluster, pod, service, deployment queries
  - Returns structured JSON results

**Key Files:**
- `server.js` - HTTP API server
- `deployment.yaml` - K8s deployment with RBAC
- `ingress.yaml` - Traefik ingress configuration

**Query Processing:**
- "what pods" → `kubectl get pods --all-namespaces`
- "cluster info" → `kubectl cluster-info` + `kubectl get nodes` + metrics
- "services" → `kubectl get svc --all-namespaces`
- "deployments" → `kubectl get deployments --all-namespaces`

### 4. Kubernetes Manifests (`k8s/`)
- `namespace.yaml` - cortex-chat namespace
- `secrets.yaml` - API keys, auth credentials, Redis password
- `redis.yaml` - Session storage
- `deployment.yaml` - Main 3-container pod
- `ingress.yaml` - Traefik ingress with TLS
- `build-backend-simple.yaml` - Kaniko build job

## Deployment

### Prerequisites
- k3s cluster with Traefik ingress
- MetalLB for LoadBalancer services
- Kaniko for in-cluster builds
- Local Docker registry at `10.43.170.72:5000`

### Quick Deploy

```bash
# 1. Create namespace and secrets
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml

# 2. Deploy Redis
kubectl apply -f k8s/redis.yaml

# 3. Build images (in-cluster with Kaniko)
kubectl apply -f k8s/build-backend-simple.yaml
kubectl apply -f cortex-api/build-job.yaml

# Wait for builds to complete
kubectl get jobs -n cortex-chat -w

# 4. Deploy Cortex API
kubectl apply -f cortex-api/deployment.yaml
kubectl apply -f cortex-api/ingress.yaml

# 5. Deploy Chat application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml

# 6. Verify
kubectl get pods -n cortex-chat
kubectl get pods -n cortex
kubectl get ingress -n cortex-chat
```

### Access

**Local:** http://10.88.145.210
**VPN:** https://chat.ry-ops.dev (via Tailscale)

**Credentials:**
- Username: `ryan`
- Password: `7vuzjjuN9!`

## Features

### What You Can Ask

✅ **Cluster Information**
- "what can you tell me about my k3s cluster?"
- "show me cluster version and node info"
- "what's the resource usage on my nodes?"

✅ **Pod Queries**
- "how many pods do i have?"
- "what pods are running in cortex-system?"
- "show me all pods in error state"

✅ **Service Discovery**
- "list all services"
- "what services are in the default namespace?"
- "show me loadbalancer services"

✅ **Deployment Status**
- "what deployments are running?"
- "show me deployments in cortex-chat namespace"
- "which deployments have multiple replicas?"

### Response Features

- 🎨 **Formatted Markdown** - Tables, lists, code blocks
- ⚡ **Real-time Streaming** - See responses as they generate
- 🔧 **Tool Indicators** - Shows when calling Cortex API
- 📊 **Structured Data** - Clean presentation of kubectl output
- 💬 **Conversational** - Natural language understanding

## Development

### Local Testing

**Test Backend API:**
```bash
# Login
TOKEN=$(curl -s -X POST 'http://10.88.145.210/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d @- <<'EOF' | jq -r '.token'
{"username":"ryan","password":"7vuzjjuN9!"}
EOF
)

# Test chat
curl -X POST 'http://10.88.145.210/api/chat' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test-001","message":"how many nodes do i have?"}'
```

**Test Cortex API:**
```bash
POD=$(kubectl get pods -n cortex -l app=cortex-orchestrator -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n cortex $POD -- kubectl get nodes
```

### Rebuilding

**Frontend:**
```bash
kubectl delete job kaniko-frontend-redesign -n cortex-chat
kubectl apply -f frontend-redesign/build-job.yaml
```

**Backend:**
```bash
kubectl delete job kaniko-backend-simple-build -n cortex-chat
kubectl apply -f k8s/build-backend-simple.yaml
```

**Cortex API:**
```bash
kubectl delete job kaniko-cortex-api-build -n cortex-chat
kubectl apply -f cortex-api/build-job.yaml
```

**Restart Pods:**
```bash
kubectl delete pod -n cortex-chat -l app=cortex-chat
kubectl delete pod -n cortex -l app=cortex-orchestrator
```

## Troubleshooting

### No Response / Stuck on "Executing..."

**Symptoms:** Frontend shows "Using cortex_ask..." but never displays results

**Cause:** Browser-specific SSE handling (especially Safari)

**Solutions:**
1. Try in Chrome/Firefox instead of Safari
2. Check browser console for JavaScript errors
3. Hard refresh (Cmd+Shift+R) to clear cache
4. Test with curl to verify backend is working
5. Check if JWT token is still valid

### Connection Refused

**Symptoms:** "Unable to connect to Cortex API"

**Check:**
```bash
# Verify Cortex API is running
kubectl get pods -n cortex -l app=cortex-orchestrator

# Check Cortex API logs
kubectl logs -n cortex -l app=cortex-orchestrator

# Test connectivity from backend pod
BACKEND_POD=$(kubectl get pods -n cortex-chat -l app=cortex-chat -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n cortex-chat $BACKEND_POD -c backend -- \
  wget -q -O- http://cortex-orchestrator.cortex.svc.cluster.local:8000/health
```

### Authentication Issues

**Symptoms:** Login fails or returns 401

**Solutions:**
1. Verify secrets are correct:
   ```bash
   kubectl get secret cortex-chat-secrets -n cortex-chat -o yaml
   ```
2. Check backend logs for auth errors:
   ```bash
   kubectl logs -n cortex-chat -l app=cortex-chat -c backend --tail=50
   ```

## Performance

**Build Times:**
- Frontend: 9 seconds (Kaniko)
- Backend: 21 seconds (Kaniko)
- Cortex API: 8 seconds (Kaniko)

**Response Times:**
- Simple query: 2-5 seconds
- Complex query (multiple kubectl calls): 5-15 seconds
- Streaming starts within 1 second

**Resource Usage:**
- Frontend: 10MB memory, <1% CPU
- Backend: 128MB memory, 5-10% CPU
- Cortex API: 128MB memory, 5-10% CPU
- Redis: 32MB memory, <1% CPU

## Future Enhancements

- [ ] Voice input (Whisper API integration)
- [ ] Tool visualization (show MCP server calls)
- [ ] Conversation branching
- [ ] Native mobile app (already PWA-ready)
- [ ] Collaborative features (share chats)
- [ ] Agent visualization (see worker spawns)
- [ ] Extended MCP server integration (UniFi, Proxmox)
- [ ] Advanced kubectl operations (create, delete, update resources)

## Credits

**Built by:** Cortex AI (with Claude Sonnet 4.5)
**Company:** R-Lightning
**Deployment:** k3s cluster (7 nodes, 3 masters, 4 workers)
**Blog Post:** `/Users/ryandahlberg/Desktop/CORTEX-BUILDS-ITS-OWN-CHAT.md`

## License

Proprietary - R-Lightning Infrastructure
