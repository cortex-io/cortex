# SMS Relay Kubernetes Deployment (ConfigMap Approach)

This deployment uses ConfigMaps to mount source code into a standard `python:3.11-slim` container, avoiding the need for custom Docker images.

## Architecture

- **Base Image**: `python:3.11-slim`
- **Init Container**: Installs Python dependencies into a shared volume
- **Main Container**: Runs the FastAPI application with mounted source code

## Files

### ConfigMaps
- `configmap-requirements.yaml` - Python dependencies (requirements.txt)
- `configmap-src.yaml` - Main source files (__init__.py, main.py, config.py, sms.py, state.py, formatters.py)
- `configmap-integrations.yaml` - MCP integration clients (claude.py, unifi.py, proxmox.py, k8s.py, security.py)
- `configmap-menus.yaml` - Menu handlers (home.py, network.py, proxmox.py, k8s.py, security.py)

### Deployment & Services
- `deployment-configmap.yaml` - Main deployment manifest with init container and volume mounts
- `service.yaml` - ClusterIP service exposing port 80
- `ingress.yaml` - NGINX ingress with TLS (placeholder domain)

### Secrets
- `secret-prod.yaml` - Production credentials (Twilio, Claude API, MCP endpoints)

## Deployment Steps

1. **Apply secrets and config**:
   ```bash
   kubectl apply -f k8s/secret-prod.yaml
   ```

2. **Apply ConfigMaps**:
   ```bash
   kubectl apply -f k8s/configmap-requirements.yaml
   kubectl apply -f k8s/configmap-src.yaml
   kubectl apply -f k8s/configmap-integrations.yaml
   kubectl apply -f k8s/configmap-menus.yaml
   ```

3. **Deploy application**:
   ```bash
   kubectl apply -f k8s/deployment-configmap.yaml
   kubectl apply -f k8s/service.yaml
   ```

4. **Optional - Deploy ingress** (update domain first):
   ```bash
   # Edit ingress.yaml to replace sms.yourdomain.com with actual domain
   kubectl apply -f k8s/ingress.yaml
   ```

## Verification

Check deployment status:
```bash
kubectl get pods -n default -l app=sms-relay
kubectl get svc sms-relay -n default
kubectl logs -n default -l app=sms-relay -c sms-relay
```

Test health endpoint:
```bash
kubectl run test-curl --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s http://sms-relay.default.svc.cluster.local/health
```

Expected response:
```json
{"status":"ok","service":"sms-relay"}
```

## Update Source Code

To update the application code without rebuilding Docker images:

1. **Update local source files**
2. **Regenerate ConfigMaps**:
   ```bash
   cd /path/to/sms-relay

   # Regenerate src ConfigMap
   kubectl create configmap sms-relay-src \
     --from-file=src/__init__.py \
     --from-file=src/main.py \
     --from-file=src/config.py \
     --from-file=src/sms.py \
     --from-file=src/state.py \
     --from-file=src/formatters.py \
     --dry-run=client -o yaml > k8s/configmap-src.yaml

   # Regenerate integrations ConfigMap
   kubectl create configmap sms-relay-integrations \
     --from-file=src/integrations/__init__.py \
     --from-file=src/integrations/claude.py \
     --from-file=src/integrations/unifi.py \
     --from-file=src/integrations/proxmox.py \
     --from-file=src/integrations/k8s.py \
     --from-file=src/integrations/security.py \
     --dry-run=client -o yaml > k8s/configmap-integrations.yaml

   # Regenerate menus ConfigMap
   kubectl create configmap sms-relay-menus \
     --from-file=src/menus/__init__.py \
     --from-file=src/menus/home.py \
     --from-file=src/menus/network.py \
     --from-file=src/menus/proxmox.py \
     --from-file=src/menus/k8s.py \
     --from-file=src/menus/security.py \
     --dry-run=client -o yaml > k8s/configmap-menus.yaml
   ```

3. **Apply updated ConfigMaps**:
   ```bash
   kubectl apply -f k8s/configmap-src.yaml
   kubectl apply -f k8s/configmap-integrations.yaml
   kubectl apply -f k8s/configmap-menus.yaml
   ```

4. **Restart deployment**:
   ```bash
   kubectl rollout restart deployment/sms-relay -n default
   ```

## Resources

The deployment uses conservative resource limits:
- **Init Container**: 128Mi memory, 100m CPU (limit: 256Mi, 500m CPU)
- **Main Container**: 128Mi memory, 100m CPU (limit: 256Mi, 500m CPU)

## Health Checks

- **Liveness Probe**: HTTP GET /health every 30s (starts after 30s)
- **Readiness Probe**: HTTP GET /health every 10s (starts after 10s)

## Environment Variables

Loaded from:
- `sms-relay-secrets` (Secret): Twilio credentials, Claude API key, allowed phone number
- `sms-relay-config` (ConfigMap): MCP server endpoints

Additional:
- `PYTHONPATH=/deps:/app` - Ensures Python can find installed packages and source code

## Volume Mounts

- `/deps` - emptyDir volume shared between init and main containers (contains pip-installed packages)
- `/app/src/` - Individual file mounts from ConfigMaps for source code
- `/app/src/integrations/` - Individual file mounts for integration modules
- `/app/src/menus/` - Individual file mounts for menu modules

## Security Context

- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: false` (Python needs write access for bytecode cache)
- Drops all Linux capabilities

## Notes

- This approach eliminates the need for building and pushing Docker images
- Updates require regenerating ConfigMaps and restarting the deployment
- The init container downloads and installs dependencies on every pod start
- For production with frequent restarts, consider creating a custom image with pre-installed dependencies
