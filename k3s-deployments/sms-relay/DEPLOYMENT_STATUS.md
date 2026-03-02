# SMS Relay - ConfigMap Deployment Status

**Deployment Date**: December 28, 2025
**Status**: DEPLOYED AND RUNNING
**Approach**: ConfigMap-based (no custom Docker image required)

## Deployment Summary

Successfully deployed the SMS Infrastructure Relay service using Kubernetes ConfigMaps to mount source code into a standard Python container. This eliminates the need for building and managing custom Docker images.

## Architecture Details

### Container Strategy
- **Base Image**: `python:3.11-slim` (official Python image)
- **Init Container**: Installs dependencies from requirements.txt into shared volume
- **Main Container**: Runs FastAPI app with mounted source code from ConfigMaps

### Resource Breakdown

**ConfigMaps Created** (4 total):
1. `sms-relay-requirements` - Python dependencies specification
2. `sms-relay-src` - Main application code (6 files)
3. `sms-relay-integrations` - MCP integration clients (6 files)
4. `sms-relay-menus` - Menu handlers (6 files)

**Secrets**:
- `sms-relay-secrets` - Twilio credentials, Claude API key
- `sms-relay-config` - MCP endpoint URLs

**Services**:
- `sms-relay` (ClusterIP) - Internal service on port 80 → 8000

**Deployment**:
- 1 replica running
- Init container: 78s to install dependencies
- Main container: Running and healthy

## Verification Results

### Health Check
```bash
$ kubectl run test-curl --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s http://sms-relay.default.svc.cluster.local/health

{"status":"ok","service":"sms-relay"}
```

### Service Info
```bash
$ kubectl run test-curl --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s http://sms-relay.default.svc.cluster.local/

{
  "service":"SMS Infrastructure Relay",
  "version":"1.0.0",
  "endpoints":{
    "webhook":"/sms",
    "health":"/health"
  }
}
```

### Pod Status
```
NAME                        READY   STATUS    RESTARTS   AGE
sms-relay-ddb9d65c9-h8sxw   1/1     Running   0          3m
```

## Manifest Files Created

Located in `/Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay/k8s/`:

### ConfigMaps
- `configmap-requirements.yaml` (308 bytes) - Dependencies
- `configmap-src.yaml` (15KB) - Main source files
- `configmap-integrations.yaml` (25KB) - Integration clients
- `configmap-menus.yaml` (7.8KB) - Menu handlers

### Deployment
- `deployment-configmap.yaml` (5.1KB) - Main deployment with init container
- `service.yaml` (238 bytes) - ClusterIP service
- `ingress.yaml` (592 bytes) - NGINX ingress with TLS (placeholder domain)

### Secrets
- `secret-prod.yaml` (767 bytes) - Production credentials

### Documentation
- `README.md` - Complete deployment and update instructions
- `DEPLOYMENT_STATUS.md` - This file

## Deployment Commands Used

```bash
# 1. Apply secrets and config
kubectl apply -f k8s/secret-prod.yaml

# 2. Generate and apply ConfigMaps
cd /Users/ryandahlberg/Projects/cortex/k8s-deployments/sms-relay

kubectl create configmap sms-relay-src \
  --from-file=src/__init__.py \
  --from-file=src/main.py \
  --from-file=src/config.py \
  --from-file=src/sms.py \
  --from-file=src/state.py \
  --from-file=src/formatters.py \
  --dry-run=client -o yaml > k8s/configmap-src.yaml

kubectl create configmap sms-relay-integrations \
  --from-file=src/integrations/__init__.py \
  --from-file=src/integrations/claude.py \
  --from-file=src/integrations/unifi.py \
  --from-file=src/integrations/proxmox.py \
  --from-file=src/integrations/k8s.py \
  --from-file=src/integrations/security.py \
  --dry-run=client -o yaml > k8s/configmap-integrations.yaml

kubectl create configmap sms-relay-menus \
  --from-file=src/menus/__init__.py \
  --from-file=src/menus/home.py \
  --from-file=src/menus/network.py \
  --from-file=src/menus/proxmox.py \
  --from-file=src/menus/k8s.py \
  --from-file=src/menus/security.py \
  --dry-run=client -o yaml > k8s/configmap-menus.yaml

kubectl apply -f k8s/configmap-requirements.yaml
kubectl apply -f k8s/configmap-src.yaml
kubectl apply -f k8s/configmap-integrations.yaml
kubectl apply -f k8s/configmap-menus.yaml

# 3. Deploy application
kubectl apply -f k8s/deployment-configmap.yaml
kubectl apply -f k8s/service.yaml
```

## Resource Limits

### Init Container (install-deps)
- Request: 128Mi memory, 100m CPU
- Limit: 256Mi memory, 500m CPU

### Main Container (sms-relay)
- Request: 128Mi memory, 100m CPU
- Limit: 256Mi memory, 500m CPU

## Features

### Health Checks
- **Liveness Probe**: HTTP GET /health every 30s (initial delay: 30s)
- **Readiness Probe**: HTTP GET /health every 10s (initial delay: 10s)

### Volume Mounts
- `/deps` - Shared emptyDir with pip-installed packages
- `/app/src/` - Individual ConfigMap mounts for each Python file
- `/app/src/integrations/` - Integration module files
- `/app/src/menus/` - Menu handler files

### Environment Variables
- `PYTHONPATH=/deps:/app` - Enables Python to find packages and code
- All Twilio, Claude, and MCP config loaded from secrets/configmaps

## Next Steps

### Required for Production

1. **Update Ingress Domain**
   - Edit `k8s/ingress.yaml`
   - Replace `sms.yourdomain.com` with actual domain
   - Apply: `kubectl apply -f k8s/ingress.yaml`

2. **Configure Twilio Webhook**
   - Point Twilio webhook to: `https://your-domain.com/sms`
   - Verify phone number whitelisting

3. **Verify MCP Endpoints**
   - Ensure MCP servers are running:
     - unifi-mcp:3000
     - proxmox-mcp:3000
     - k8s-mcp:3000
     - security-mcp:3000

### Optional Improvements

1. **Create Custom Image** (if frequent restarts become an issue)
   - Pre-install dependencies in Docker image
   - Reduces init container time from 78s to ~5s

2. **Horizontal Pod Autoscaling**
   - Add HPA based on CPU/memory metrics
   - Currently single replica is sufficient

3. **Monitoring**
   - Add Prometheus metrics endpoint
   - Configure alerts for health check failures

## Advantages of ConfigMap Approach

1. **No Docker Build Required** - Use standard Python image
2. **Fast Updates** - Change code, update ConfigMap, restart pod
3. **Easy Development** - Test locally, deploy same code
4. **No Registry Management** - No need to push/pull custom images
5. **Transparent** - Source code visible in ConfigMaps

## Disadvantages to Consider

1. **Slow Startup** - Init container downloads ~200MB of dependencies each time
2. **ConfigMap Size Limits** - Total source code must be < 1MB (currently ~48KB)
3. **No Compiled Optimizations** - Code interpreted on each run
4. **Dependency Caching** - Dependencies re-downloaded on every pod restart

## Monitoring Commands

```bash
# Check pod status
kubectl get pods -n default -l app=sms-relay

# View logs
kubectl logs -n default -l app=sms-relay -c sms-relay -f

# Test health endpoint
kubectl run test-curl --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s http://sms-relay.default.svc.cluster.local/health

# Check resource usage
kubectl top pod -n default -l app=sms-relay

# View events
kubectl get events -n default --field-selector involvedObject.kind=Pod
```

## Troubleshooting

### Pod Not Starting
1. Check init container logs: `kubectl logs -n default <pod-name> -c install-deps`
2. Verify ConfigMaps exist: `kubectl get configmaps -n default | grep sms-relay`
3. Check secrets: `kubectl get secret sms-relay-secrets -n default`

### Application Errors
1. View main container logs: `kubectl logs -n default <pod-name> -c sms-relay`
2. Check environment variables: `kubectl exec -n default <pod-name> -- env | grep -E 'TWILIO|ANTHROPIC|MCP'`
3. Verify file mounts: `kubectl exec -n default <pod-name> -- ls -la /app/src/`

### Updating Code
1. Edit source files locally
2. Regenerate affected ConfigMap (see README.md)
3. Apply updated ConfigMap
4. Restart deployment: `kubectl rollout restart deployment/sms-relay -n default`

## Success Metrics

- Deployment: SUCCESS
- Pod Status: Running (1/1 ready)
- Health Check: Passing
- Service Endpoints: Accessible internally
- Total Deployment Time: ~90 seconds (including dependency installation)

---

**Status**: Production-ready for internal use. Requires ingress configuration for external access.
