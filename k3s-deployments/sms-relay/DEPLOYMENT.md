# Deployment Guide

Step-by-step guide for deploying SMS Infrastructure Relay to production.

## Prerequisites

- k3s cluster running
- kubectl configured
- Docker registry access (or use local registry)
- Twilio account with phone number
- Anthropic API key
- Domain name (for ingress)
- cert-manager installed (for SSL)

## Step 1: Build and Push Docker Image

### Option A: GitHub Container Registry

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay

# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build image
docker build -t ghcr.io/USERNAME/sms-relay:latest .

# Push image
docker push ghcr.io/USERNAME/sms-relay:latest
```

### Option B: Local k3s Registry

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay

# Build for local registry
docker build -t localhost:5000/sms-relay:latest .

# Push to local registry
docker push localhost:5000/sms-relay:latest
```

Update `k8s/deployment.yaml` to use `localhost:5000/sms-relay:latest`

## Step 2: Configure Secrets

### Create Kubernetes Secret

```bash
cd k8s

# Copy template
cp secret.yaml secret-prod.yaml

# Edit with your actual credentials
vim secret-prod.yaml
```

Update these values in `secret-prod.yaml`:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER (E.164 format: +1234567890)
- ALLOWED_PHONE_NUMBER (your personal number in E.164 format)
- ANTHROPIC_API_KEY

**IMPORTANT:** Never commit `secret-prod.yaml` to git!

```bash
# Add to .gitignore
echo "k8s/secret-prod.yaml" >> .gitignore
```

### Verify MCP Endpoints

Edit `k8s/secret.yaml` ConfigMap section to verify MCP endpoints:
```yaml
data:
  UNIFI_MCP_URL: "http://unifi-mcp:3000"
  PROXMOX_MCP_URL: "http://proxmox-mcp:3000"
  K8S_MCP_URL: "http://k8s-mcp:3000"
  SECURITY_MCP_URL: "http://security-mcp:3000"
```

Adjust these if your MCP servers are in different namespaces:
```yaml
  UNIFI_MCP_URL: "http://unifi-mcp.mcp-servers.svc.cluster.local:3000"
```

## Step 3: Configure Ingress

Edit `k8s/ingress.yaml`:

```yaml
spec:
  tls:
  - hosts:
    - sms.yourdomain.com  # Change this
    secretName: sms-relay-tls
  rules:
  - host: sms.yourdomain.com  # Change this
```

### DNS Configuration

Add an A record for your domain:
```
sms.yourdomain.com  →  [Your k3s ingress IP]
```

To find your ingress IP:
```bash
kubectl get svc -n ingress-nginx
```

## Step 4: Deploy to Kubernetes

### Deploy with kubectl

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/sms-relay

# Apply all manifests
kubectl apply -f k8s/secret-prod.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### Or deploy with kustomize

```bash
kubectl apply -k k8s/
```

## Step 5: Verify Deployment

### Check Pod Status

```bash
kubectl get pods -l app=sms-relay

# Expected output:
# NAME                         READY   STATUS    RESTARTS   AGE
# sms-relay-xxxxxxxxxx-xxxxx   1/1     Running   0          30s
```

### Check Logs

```bash
kubectl logs -f deployment/sms-relay

# Should see:
# SMS Relay service starting...
```

### Check Service

```bash
kubectl get svc sms-relay

# Should show ClusterIP
```

### Check Ingress

```bash
kubectl get ingress sms-relay

# Should show your domain
```

### Test Health Endpoint

```bash
curl https://sms.yourdomain.com/health

# Expected:
# {"status":"ok","service":"sms-relay"}
```

## Step 6: Configure Twilio Webhook

1. Go to Twilio Console: https://console.twilio.com/
2. Navigate to: Phone Numbers → Manage → Active Numbers
3. Click your phone number
4. Scroll to "Messaging Configuration"
5. Under "A MESSAGE COMES IN":
   - Webhook: `https://sms.yourdomain.com/sms`
   - HTTP POST
6. Click Save

## Step 7: Test End-to-End

Send a text message to your Twilio number:

**Message:** `hello`

**Expected Response:**
```
Welcome to Infrastructure Monitor!

1) Network  2) Proxmox  3) K8s  4) Security  5) Ask Claude

? for help
```

Test each menu option to verify:
- Network integration works
- Proxmox integration works
- K8s integration works
- Security integration works
- Claude mode works

## Step 8: Monitor Production

### Watch Logs

```bash
kubectl logs -f deployment/sms-relay
```

### Check Metrics

```bash
# Pod resource usage
kubectl top pod -l app=sms-relay

# Check restarts
kubectl get pods -l app=sms-relay
```

### Twilio Monitoring

Monitor in Twilio Console:
- Message logs: https://console.twilio.com/monitor/logs/messages
- Error logs: https://console.twilio.com/monitor/logs/errors
- Debugger: https://console.twilio.com/debugger

## Updating the Deployment

### Update Image

```bash
# Build new image with version tag
docker build -t ghcr.io/USERNAME/sms-relay:v1.1.0 .
docker push ghcr.io/USERNAME/sms-relay:v1.1.0

# Update deployment
kubectl set image deployment/sms-relay sms-relay=ghcr.io/USERNAME/sms-relay:v1.1.0

# Watch rollout
kubectl rollout status deployment/sms-relay
```

### Update Configuration

```bash
# Edit secret or configmap
kubectl edit secret sms-relay-secrets
kubectl edit configmap sms-relay-config

# Restart deployment to pick up changes
kubectl rollout restart deployment/sms-relay
```

## Rollback

If something goes wrong:

```bash
# Rollback to previous version
kubectl rollout undo deployment/sms-relay

# Check rollout history
kubectl rollout history deployment/sms-relay

# Rollback to specific revision
kubectl rollout undo deployment/sms-relay --to-revision=2
```

## Scaling

The service is designed for single-user, but you can scale for redundancy:

```bash
# Scale to 2 replicas
kubectl scale deployment/sms-relay --replicas=2

# Or edit deployment
kubectl edit deployment/sms-relay
# Change spec.replicas to 2
```

Note: State is in-memory, so multiple replicas means inconsistent state. Consider adding Redis for shared state if scaling.

## Troubleshooting Production Issues

### Pod Not Starting

```bash
# Check events
kubectl describe pod -l app=sms-relay

# Check logs
kubectl logs deployment/sms-relay

# Common issues:
# - Image pull errors: Check registry credentials
# - Secret not found: Verify secret name
# - CrashLoopBackOff: Check environment variables
```

### No SMS Response

```bash
# Check ingress
kubectl get ingress sms-relay
curl https://sms.yourdomain.com/health

# Check Twilio webhook URL
# Verify SSL certificate is valid
kubectl describe certificate sms-relay-tls

# Check logs for webhook requests
kubectl logs -f deployment/sms-relay | grep "SMS from"
```

### MCP Integration Failures

```bash
# Test MCP server connectivity from pod
kubectl exec -it deployment/sms-relay -- sh
curl http://unifi-mcp:3000/health

# Check MCP server logs
kubectl logs deployment/unifi-mcp
```

## Security Hardening

### Network Policies

Create network policy to restrict traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sms-relay-network-policy
spec:
  podSelector:
    matchLabels:
      app: sms-relay
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: unifi-mcp
    - podSelector:
        matchLabels:
          app: proxmox-mcp
    - podSelector:
        matchLabels:
          app: k8s-mcp
    - podSelector:
        matchLabels:
          app: security-mcp
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # For Claude API
```

### Resource Limits

Already configured in deployment:
- Memory: 128Mi request, 512Mi limit
- CPU: 100m request, 500m limit

Adjust based on usage:
```bash
kubectl edit deployment/sms-relay
```

### Pod Security Standards

Add pod security labels to namespace:
```bash
kubectl label namespace default pod-security.kubernetes.io/enforce=restricted
```

## Backup and Disaster Recovery

### Backup Configuration

```bash
# Export all resources
kubectl get secret sms-relay-secrets -o yaml > backup/secret.yaml
kubectl get configmap sms-relay-config -o yaml > backup/configmap.yaml
kubectl get deployment sms-relay -o yaml > backup/deployment.yaml
kubectl get service sms-relay -o yaml > backup/service.yaml
kubectl get ingress sms-relay -o yaml > backup/ingress.yaml
```

### Restore from Backup

```bash
kubectl apply -f backup/
```

## Monitoring and Alerts

### Prometheus Metrics (Future Enhancement)

Add Prometheus endpoint to application and create ServiceMonitor:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sms-relay
spec:
  selector:
    matchLabels:
      app: sms-relay
  endpoints:
  - port: http
    path: /metrics
```

### Alert Examples

```yaml
# Pod down alert
alert: SMSRelayDown
expr: up{job="sms-relay"} == 0
for: 5m

# High error rate
alert: SMSRelayHighErrors
expr: rate(http_requests_total{job="sms-relay",status="500"}[5m]) > 0.1
```

## Production Checklist

Before going live:

- [ ] Docker image built and pushed
- [ ] Secrets configured with production values
- [ ] Ingress configured with correct domain
- [ ] DNS A record created
- [ ] SSL certificate issued (check cert-manager)
- [ ] All pods running and healthy
- [ ] Health endpoint responding
- [ ] Twilio webhook configured
- [ ] End-to-end test successful
- [ ] All MCP integrations working
- [ ] Claude mode tested
- [ ] Monitoring configured
- [ ] Backups created
- [ ] Team notified of new service

## Support

For production issues:
1. Check logs: `kubectl logs -f deployment/sms-relay`
2. Check Twilio debugger
3. Verify MCP server health
4. Review recent changes
5. Create incident report if needed
