# Cortex Deployment via Proxmox

## Quick Start

This guide explains how to deploy Cortex to the K3s cluster running in Proxmox LXC containers.

## Architecture

- **Container 310**: K3s Master Node (10.88.145.180)
- **Container 311**: K3s Worker Node 1 (10.88.145.181)
- **Container 312**: K3s Worker Node 2 (10.88.145.182)

## Prerequisites

1. SSH access to Proxmox host (10.88.140.164)
2. K3s cluster running in containers 310-312
3. Anthropic API key

## Deployment Steps

### Option 1: Automated Deployment (Recommended)

Run the deployment script directly on the Proxmox host:

```bash
# SSH to Proxmox host
ssh root@10.88.140.164

# Set API key
export ANTHROPIC_API_KEY='your-anthropic-api-key'

# Download and run deployment script
curl -sL https://raw.githubusercontent.com/ry-ops/cortex-docker/docker-container/scripts/deploy-cortex-to-k3s.sh | bash
```

Or clone the repo first:

```bash
# SSH to Proxmox host
ssh root@10.88.140.164

# Clone repo
git clone https://github.com/ry-ops/cortex-docker.git
cd cortex-docker

# Set API key
export ANTHROPIC_API_KEY='your-anthropic-api-key'

# Run deployment
bash scripts/deploy-cortex-to-k3s.sh
```

### Option 2: Manual Deployment

#### Step 1: Verify Containers

```bash
# Check container status
pct status 310
pct status 311
pct status 312

# If stopped, start them
pct start 310
pct start 311
pct start 312
```

#### Step 2: Verify K3s Cluster

```bash
# Check nodes
pct exec 310 -- kubectl get nodes

# Should show all 3 nodes in Ready state
```

#### Step 3: Clone Repository

```bash
# Clone into K3s master
pct exec 310 -- git clone https://github.com/ry-ops/cortex-docker.git /tmp/cortex-docker

# Or update if already cloned
pct exec 310 -- bash -c "cd /tmp/cortex-docker && git pull"
```

#### Step 4: Create Secrets

```bash
# Create namespace
pct exec 310 -- kubectl create namespace cortex-system

# Create API key secret
pct exec 310 -- kubectl create secret generic anthropic-api-key \
    --from-literal=api-key='your-anthropic-api-key' \
    -n cortex-system
```

#### Step 5: Deploy Cortex Core

```bash
# Apply manifests
pct exec 310 -- bash -c "cd /tmp/cortex-docker && kubectl apply -k k8s/cortex-k3s/"

# Wait for pods
pct exec 310 -- kubectl wait --for=condition=ready pod \
    -l app.cortex.ai/component=master \
    -n cortex-system \
    --timeout=300s
```

#### Step 6: Deploy Monitoring

```bash
# Create namespace
pct exec 310 -- kubectl create namespace monitoring

# Deploy stack
pct exec 310 -- bash -c "cd /tmp/cortex-docker && kubectl apply -f k8s/monitoring/"
```

#### Step 7: Deploy MCP Servers (Optional)

If Helm is installed:

```bash
# Create namespace
pct exec 310 -- kubectl create namespace cortex-mcp

# Deploy via Helm
pct exec 310 -- bash -c "cd /tmp/cortex-docker && helm upgrade --install cortex-mcp ./helm/umbrella-chart -n cortex-mcp"
```

## Verification

### Check Pod Status

```bash
# Cortex system pods
pct exec 310 -- kubectl get pods -n cortex-system

# Monitoring pods
pct exec 310 -- kubectl get pods -n monitoring

# MCP server pods
pct exec 310 -- kubectl get pods -n cortex-mcp
```

### Expected Pods

**cortex-system namespace:**
- coordinator-master
- development-master
- security-master
- cicd-master
- inventory-master
- cleanup-master
- cortex-dashboard
- Various worker ScaledObjects (0 pods until tasks arrive)

**monitoring namespace:**
- prometheus
- grafana
- alertmanager

**cortex-mcp namespace:**
- 9 MCP server deployments (may scale to 0)

### Check Logs

```bash
# Coordinator master logs
pct exec 310 -- kubectl logs -f -n cortex-system deployment/coordinator-master

# Dashboard logs
pct exec 310 -- kubectl logs -f -n cortex-system deployment/cortex-dashboard
```

### Access Services

#### From Within Proxmox Host

```bash
# Dashboard
pct exec 310 -- kubectl port-forward -n cortex-system svc/cortex-dashboard 3001:3001

# Grafana
pct exec 310 -- kubectl port-forward -n monitoring svc/grafana 3000:3000
```

#### From External Machine

You'll need to set up port forwarding from the Proxmox host or configure LoadBalancer/Ingress.

## Troubleshooting

### Pods Not Starting

```bash
# Describe pod
pct exec 310 -- kubectl describe pod <pod-name> -n cortex-system

# Check events
pct exec 310 -- kubectl get events -n cortex-system --sort-by='.lastTimestamp'

# Check logs
pct exec 310 -- kubectl logs <pod-name> -n cortex-system
```

### Common Issues

#### ImagePullBackOff

Images may not be accessible. Check GitHub Container Registry access:

```bash
# Verify image exists
docker pull ghcr.io/ry-ops/cortex-docker:latest
```

#### Storage Issues

```bash
# Check PVC status
pct exec 310 -- kubectl get pvc -n cortex-system

# Check storage class
pct exec 310 -- kubectl get sc
```

#### Network Issues

```bash
# Test pod-to-pod communication
pct exec 310 -- kubectl run -it --rm debug --image=busybox --restart=Never -- ping cortex-dashboard.cortex-system

# Check DNS
pct exec 310 -- kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default
```

### KEDA Not Installed

If ScaledObjects are not working:

```bash
# Install KEDA
pct exec 310 -- kubectl apply -f https://github.com/kedacore/keda/releases/download/v2.12.0/keda-2.12.0.yaml
```

## Post-Deployment

### Monitor System

```bash
# Watch all pods
pct exec 310 -- watch kubectl get pods -A

# Check resource usage
pct exec 310 -- kubectl top nodes
pct exec 310 -- kubectl top pods -n cortex-system
```

### Test Workflow

Create a test task to verify the system:

```bash
# Create a test task file
pct exec 310 -- bash -c "cat > /tmp/test-task.json << 'EOF'
{
  \"task_id\": \"test-001\",
  \"type\": \"development\",
  \"description\": \"Test task to verify Cortex is working\",
  \"priority\": \"medium\"
}
EOF"

# Submit task (this would require Cortex API to be accessible)
# Verify masters pick it up in logs
pct exec 310 -- kubectl logs -f -n cortex-system deployment/coordinator-master
```

### Access Dashboard

The EUI dashboard provides:
- Real-time master status
- Active workers
- Task queue
- Token usage
- System health

Access it via port-forward or configure an Ingress.

## Updating Cortex

### Pull Latest Changes

```bash
# Update repo in container
pct exec 310 -- bash -c "cd /tmp/cortex-docker && git pull"

# Reapply manifests
pct exec 310 -- bash -c "cd /tmp/cortex-docker && kubectl apply -k k8s/cortex-k3s/"

# Rolling restart if needed
pct exec 310 -- kubectl rollout restart deployment -n cortex-system
```

### Monitor Rollout

```bash
# Watch rollout status
pct exec 310 -- kubectl rollout status deployment/coordinator-master -n cortex-system
```

## Backup and Recovery

### Backup Coordination State

```bash
# Backup PVC data
pct exec 310 -- kubectl exec -n cortex-system deployment/coordinator-master -- \
  tar czf /tmp/coordination-backup.tar.gz /app/coordination

# Copy out of container
pct exec 310 -- kubectl cp cortex-system/coordinator-master-xxx:/tmp/coordination-backup.tar.gz \
  /tmp/coordination-backup-$(date +%Y%m%d).tar.gz
```

### Restore

```bash
# Copy backup into container
pct exec 310 -- kubectl cp /tmp/coordination-backup-20251213.tar.gz \
  cortex-system/coordinator-master-xxx:/tmp/

# Restore
pct exec 310 -- kubectl exec -n cortex-system deployment/coordinator-master -- \
  tar xzf /tmp/coordination-backup-20251213.tar.gz -C /app/
```

## Performance Tuning

### Resource Limits

Edit deployments to adjust resource requests/limits:

```bash
pct exec 310 -- kubectl edit deployment coordinator-master -n cortex-system
```

### Scaling Workers

Workers scale automatically via KEDA based on task queue depth. Adjust thresholds:

```bash
pct exec 310 -- kubectl edit scaledobject implementation-worker-scaler -n cortex-system
```

## Security

### Rotate Secrets

```bash
# Create new API key secret
pct exec 310 -- kubectl create secret generic anthropic-api-key-new \
    --from-literal=api-key='new-key' \
    -n cortex-system

# Update deployments to use new secret
# Then delete old secret
pct exec 310 -- kubectl delete secret anthropic-api-key -n cortex-system
```

### Network Policies

Network policies are applied automatically. View them:

```bash
pct exec 310 -- kubectl get networkpolicies -n cortex-system
```

## Support

- **Documentation**: See `/docs` directory
- **Architecture**: See `CORTEX-PHASES-4-8-COMPLETE.md`
- **Issues**: https://github.com/ry-ops/cortex/issues

## Quick Reference

```bash
# All-in-one status check
pct exec 310 -- bash -c '
echo "=== Nodes ==="
kubectl get nodes
echo ""
echo "=== Cortex Pods ==="
kubectl get pods -n cortex-system
echo ""
echo "=== Monitoring Pods ==="
kubectl get pods -n monitoring
echo ""
echo "=== MCP Pods ==="
kubectl get pods -n cortex-mcp
echo ""
echo "=== ScaledObjects ==="
kubectl get scaledobjects -n cortex-system
'
```
