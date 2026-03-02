# YouTube Ingestion Service - Deployment Guide

## Quick Start

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion
./scripts/build-and-deploy.sh
```

## Prerequisites

### 1. Kubernetes Cluster
- k3s cluster running
- kubectl configured
- Namespace `cortex` exists

### 2. Redis Queue
- Redis deployed at `redis-queue.cortex.svc.cluster.local:6379`
- Can be shared with cortex-queue system

### 3. Anthropic API Key
- Valid Anthropic API key
- Stored in Kubernetes Secret

### 4. Local Docker Registry
- Registry running at `localhost:5000`
- Or use alternative registry

## Pre-Deployment Checklist

- [ ] k3s cluster is running
- [ ] kubectl is configured
- [ ] Redis is deployed and accessible
- [ ] Anthropic API key secret exists
- [ ] Docker is running
- [ ] Local registry is accessible

## Deployment Steps

### Step 1: Create Namespace

```bash
kubectl create namespace cortex --dry-run=client -o yaml | kubectl apply -f -
```

### Step 2: Create Anthropic API Key Secret

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_API_KEY_HERE \
  -n cortex
```

Verify:
```bash
kubectl get secret anthropic-api-key -n cortex
```

### Step 3: Build Docker Image

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion

docker build -t localhost:5000/youtube-ingestion:latest .
```

Expected output:
```
[+] Building 45.2s (12/12) FINISHED
 => [1/7] FROM docker.io/library/node:20-alpine
 => [2/7] WORKDIR /app
 => [3/7] RUN apk add --no-cache python3 py3-pip
 => [4/7] COPY package*.json ./
 => [5/7] RUN npm ci --only=production
 => [6/7] COPY src/ ./src/
 => [7/7] RUN mkdir -p /data/transcripts /data/knowledge /data/cache
 => exporting to image
 => => naming to localhost:5000/youtube-ingestion:latest
```

### Step 4: Push to Registry

```bash
docker push localhost:5000/youtube-ingestion:latest
```

Verify:
```bash
curl http://localhost:5000/v2/youtube-ingestion/tags/list
```

### Step 5: Deploy Kubernetes Resources

```bash
# Create PersistentVolumeClaim
kubectl apply -f k8s/pvc.yaml

# Wait for PVC to be bound
kubectl wait --for=condition=Bound pvc/youtube-data-pvc -n cortex --timeout=60s

# Create Service
kubectl apply -f k8s/service.yaml

# Create Deployment
kubectl apply -f k8s/deployment.yaml

# (Optional) Create Ingress
kubectl apply -f k8s/ingress.yaml
```

### Step 6: Verify Deployment

```bash
# Check pod status
kubectl get pods -n cortex -l app=youtube-ingestion

# Expected output:
# NAME                                READY   STATUS    RESTARTS   AGE
# youtube-ingestion-xxxxxxxxxx-xxxxx  1/1     Running   0          30s

# Check logs
kubectl logs -n cortex -l app=youtube-ingestion -f

# Expected output:
# [Redis] Connected successfully
# [KnowledgeStore] Initializing storage directories...
# [KnowledgeStore] Storage initialized
# [Server] YouTube Ingestion Service listening on port 8080
# [Server] Health check: http://localhost:8080/health
# [Server] Redis: Connected
```

### Step 7: Test the Service

```bash
# Port forward for local testing
kubectl port-forward -n cortex svc/youtube-ingestion 8080:8080 &

# Health check
curl http://localhost:8080/health

# Expected output:
# {
#   "status": "healthy",
#   "service": "youtube-ingestion",
#   "redis_connected": true
# }

# Test ingestion (replace with real video ID)
curl -X POST http://localhost:8080/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Check stats
curl http://localhost:8080/stats
```

## Post-Deployment Configuration

### 1. Update Cortex Chat Backend

Add YouTube service URL to cortex-chat environment:

```bash
kubectl set env deployment/cortex-api \
  YOUTUBE_SERVICE_URL=http://youtube-ingestion.cortex.svc.cluster.local:8080 \
  -n cortex
```

### 2. Enable Auto-Detection

Update cortex-chat to use MessageInterceptor (see INTEGRATION_GUIDE.md)

### 3. Configure Monitoring

Add service to monitoring stack:

```yaml
# prometheus-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: youtube-ingestion
  namespace: cortex
spec:
  selector:
    matchLabels:
      app: youtube-ingestion
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

## Automated Deployment Script

The `scripts/build-and-deploy.sh` script automates all steps:

```bash
#!/bin/bash
set -e

cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion

echo "=== YouTube Ingestion Service - Build and Deploy ==="

# Build and push image
docker build -t localhost:5000/youtube-ingestion:latest .
docker push localhost:5000/youtube-ingestion:latest

# Create namespace
kubectl create namespace cortex --dry-run=client -o yaml | kubectl apply -f -

# Apply resources
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for deployment
kubectl rollout status deployment/youtube-ingestion -n cortex --timeout=300s

echo "=== Deployment Complete ==="
kubectl get pods -n cortex -l app=youtube-ingestion
```

## Troubleshooting

### Pod Not Starting

**Symptom:** Pod stuck in `Pending` or `CrashLoopBackOff`

**Diagnosis:**
```bash
kubectl describe pod -n cortex -l app=youtube-ingestion
kubectl logs -n cortex -l app=youtube-ingestion
```

**Common Issues:**

1. **Missing Secret:**
   ```
   Error: secret "anthropic-api-key" not found
   ```

   **Solution:**
   ```bash
   kubectl create secret generic anthropic-api-key \
     --from-literal=api-key=YOUR_KEY \
     -n cortex
   ```

2. **PVC Not Bound:**
   ```
   Warning: FailedMount: Unable to attach or mount volumes
   ```

   **Solution:**
   ```bash
   kubectl get pvc -n cortex
   # Check storage class and provisioner
   kubectl get storageclass
   ```

3. **Image Pull Error:**
   ```
   Failed to pull image "localhost:5000/youtube-ingestion:latest"
   ```

   **Solution:**
   ```bash
   # Verify registry is accessible
   curl http://localhost:5000/v2/_catalog

   # Re-push image
   docker push localhost:5000/youtube-ingestion:latest
   ```

### Redis Connection Failed

**Symptom:** Logs show `[Redis] Connection error`

**Diagnosis:**
```bash
# Check Redis pod
kubectl get pods -n cortex | grep redis

# Check Redis service
kubectl get svc -n cortex | grep redis

# Test connection
kubectl run -it --rm debug --image=redis:alpine --restart=Never -n cortex -- \
  redis-cli -h redis-queue.cortex.svc.cluster.local ping
```

**Solution:**
- If Redis not deployed, deploy it first
- If DNS issue, check CoreDNS logs
- Service will fallback to filesystem-only mode if Redis unavailable

### Transcript Extraction Fails

**Symptom:** Ingestion fails with "Failed to extract transcript"

**Diagnosis:**
```bash
# Check logs
kubectl logs -n cortex -l app=youtube-ingestion | grep TranscriptExtractor
```

**Common Causes:**
1. Video has no captions
2. Video is private or deleted
3. Network connectivity issues
4. YouTube rate limiting

**Solution:**
- Verify video URL is accessible
- Check if video has captions enabled
- Try different video
- Implement rate limiting

### High Memory Usage

**Symptom:** Pod OOMKilled or high memory usage

**Diagnosis:**
```bash
kubectl top pod -n cortex -l app=youtube-ingestion
```

**Solution:**
Increase memory limits in `k8s/deployment.yaml`:
```yaml
resources:
  limits:
    memory: "2Gi"  # Increase from 1Gi
```

## Scaling

### Horizontal Scaling

Currently single-instance design. For future horizontal scaling:

1. **Add Queue-Based Processing:**
   - Use Redis queue for job distribution
   - Multiple worker instances
   - Shared storage (NFS or S3)

2. **Modify Deployment:**
   ```yaml
   spec:
     replicas: 3  # Increase from 1
   ```

3. **Update PVC:**
   ```yaml
   accessModes:
   - ReadWriteMany  # Change from ReadWriteOnce
   ```

### Vertical Scaling

Increase resources for high-volume processing:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

## Backup and Recovery

### Backup Knowledge Base

```bash
# Create backup job
kubectl create job youtube-backup-$(date +%Y%m%d) \
  --from=cronjob/youtube-backup \
  -n cortex

# Manual backup
kubectl exec -n cortex deployment/youtube-ingestion -- \
  tar czf /data/backup-$(date +%Y%m%d).tar.gz \
  /data/knowledge /data/transcripts
```

### Restore from Backup

```bash
# Copy backup to pod
kubectl cp backup.tar.gz cortex/youtube-ingestion-pod:/data/

# Extract
kubectl exec -n cortex deployment/youtube-ingestion -- \
  tar xzf /data/backup.tar.gz -C /data
```

## Monitoring

### Health Checks

```bash
# Liveness probe
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/health

# Readiness probe
kubectl get pod -n cortex -l app=youtube-ingestion -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}'
```

### Metrics

```bash
# Get stats
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/stats

# Monitor logs
kubectl logs -n cortex -l app=youtube-ingestion -f --tail=100

# Resource usage
kubectl top pod -n cortex -l app=youtube-ingestion
```

### Alerts (Future)

Recommended alerts:
- Pod not ready for >5 minutes
- High memory usage (>80%)
- Error rate >5%
- Redis connection failures

## Maintenance

### Update Service

```bash
# Rebuild image
docker build -t localhost:5000/youtube-ingestion:latest .
docker push localhost:5000/youtube-ingestion:latest

# Rolling update
kubectl rollout restart deployment/youtube-ingestion -n cortex

# Monitor rollout
kubectl rollout status deployment/youtube-ingestion -n cortex
```

### Clean Old Knowledge

```bash
# Manual cleanup (example)
kubectl exec -n cortex deployment/youtube-ingestion -- \
  find /data/knowledge -name "*.json" -mtime +90 -delete
```

### Database Maintenance

```bash
# Redis key cleanup
kubectl exec -n cortex deployment/redis-queue -- \
  redis-cli --scan --pattern "youtube:*" | \
  xargs redis-cli DEL
```

## Uninstall

```bash
# Delete all resources
kubectl delete deployment youtube-ingestion -n cortex
kubectl delete service youtube-ingestion -n cortex
kubectl delete pvc youtube-data-pvc -n cortex
kubectl delete ingress youtube-ingestion -n cortex

# Delete secret (if not used elsewhere)
kubectl delete secret anthropic-api-key -n cortex

# Delete Docker image
docker rmi localhost:5000/youtube-ingestion:latest
```

## Security Considerations

### API Key Security
- Store in Kubernetes Secret
- Use RBAC to restrict access
- Rotate regularly

### Network Policies
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: youtube-ingestion-netpol
  namespace: cortex
spec:
  podSelector:
    matchLabels:
      app: youtube-ingestion
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: cortex-api
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: redis-queue
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # Allow HTTPS for YouTube/Anthropic APIs
```

### Resource Quotas
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: youtube-quota
  namespace: cortex
spec:
  hard:
    requests.cpu: "2"
    requests.memory: "2Gi"
    limits.cpu: "4"
    limits.memory: "4Gi"
    persistentvolumeclaims: "1"
```

## Support

For issues or questions:
1. Check logs: `kubectl logs -n cortex -l app=youtube-ingestion`
2. Review [ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. See [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)
4. Check [README.md](README.md) for API reference

## Changelog

### v1.0.0 (2025-12-28)
- Initial release
- URL detection and transcript extraction
- Claude-based classification
- Redis + filesystem storage
- Self-improvement agent
- Meta-review capabilities
- RESTful HTTP API
