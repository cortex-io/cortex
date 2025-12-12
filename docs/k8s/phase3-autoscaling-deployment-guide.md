# Phase 3: KEDA Auto-Scaling Deployment Guide

## Overview

This guide covers the deployment of KEDA-based auto-scaling for Cortex with scale-to-zero capability.

## Architecture

### Masters (StatefulSets)
- 5 masters, always 1 replica each
- Persistent storage per master (10GB)
- Shared coordination volume (50GB)
- Pod anti-affinity for high availability

### Workers (Deployments)
- 4 worker types with 0 initial replicas
- Scale from 0 to 50 based on task queue depth
- Stateless - use shared coordination volume
- Graceful shutdown (5-minute timeout)

### KEDA Configuration
- Prometheus-based scaling triggers
- 15-second polling interval
- 5-minute cooldown before scale-to-zero
- Aggressive scale-up, gradual scale-down

## Deployment Order

### 1. Install KEDA

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/k3s/install-keda.sh
```

This installs KEDA 2.14.0 via Helm with Prometheus metrics enabled.

### 2. Deploy Masters

```bash
./scripts/autoscaling/deploy-masters.sh
```

This deploys:
- 5 ConfigMaps (coordinator, development, security, cicd, inventory)
- 2 PVCs (cortex-coordination 50GB, cortex-task-queue 20GB)
- 4 Services (masters headless, API, dashboard, task-queue)
- 5 StatefulSets (1 replica each)

Verify:
```bash
kubectl get statefulsets -n cortex
kubectl get pods -n cortex -l component=master
```

Expected output:
```
NAME                  READY   AGE
coordinator-master    1/1     2m
development-master    1/1     2m
security-master       1/1     2m
cicd-master           1/1     2m
inventory-master      1/1     2m
```

### 3. Deploy Workers

```bash
./scripts/autoscaling/deploy-workers.sh
```

This deploys 4 Deployments with 0 initial replicas:
- implementation-worker
- security-worker
- analysis-worker
- scan-worker

Verify:
```bash
kubectl get deployments -n cortex -l component=worker
```

Expected output:
```
NAME                     READY   UP-TO-DATE   AVAILABLE   AGE
implementation-worker    0/0     0            0           1m
security-worker          0/0     0            0           1m
analysis-worker          0/0     0            0           1m
scan-worker              0/0     0            0           1m
```

### 4. Deploy KEDA ScaledObjects

```bash
./scripts/autoscaling/deploy-keda.sh
```

This creates 4 ScaledObjects that configure auto-scaling.

Verify:
```bash
kubectl get scaledobjects -n cortex
kubectl get hpa -n cortex
```

Expected output:
```
NAME                           SCALETARGETKIND      SCALETARGETNAME          MIN   MAX   TRIGGERS     READY
implementation-worker-scaler   apps/v1.Deployment   implementation-worker    0     50    prometheus   True
security-worker-scaler         apps/v1.Deployment   security-worker          0     50    prometheus   True
analysis-worker-scaler         apps/v1.Deployment   analysis-worker          0     50    prometheus   True
scan-worker-scaler             apps/v1.Deployment   scan-worker              0     50    prometheus   True
```

## Testing Auto-Scaling

### Run the test suite:

```bash
./scripts/autoscaling/test-autoscaling.sh
```

Choose test mode:
1. Monitor only - Watch scaling in real-time
2. Generate sustained load - Create tasks at specified rate
3. Test scale-to-zero - Verify workers scale down after 5 min idle
4. Test rapid scale-up - Create 100 tasks and watch scale-up
5. Full test - Run all tests sequentially

### Manual Testing

Create test tasks:
```bash
# Create a task for implementation workers
kubectl exec -n cortex coordinator-master-0 -- bash -c '
cat > /app/coordination/task-queue/implementation/test-task-1.json <<EOF
{
  "task_id": "test-task-1",
  "task_type": "implementation",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "payload": {
    "action": "test"
  }
}
EOF
'
```

Watch scaling:
```bash
# Watch worker pods
kubectl get pods -n cortex -l component=worker -w

# Watch HPA
kubectl get hpa -n cortex -w

# Check ScaledObject status
kubectl describe scaledobject implementation-worker-scaler -n cortex
```

## Scaling Behavior

### Scale-Up Triggers
- Condition: cortex_task_queue_depth > 0
- Action: Spawn workers immediately
- Policy: 100% increase every 15 seconds OR +10 pods (whichever is higher)
- Max: 50 workers per type

Example:
- 0 workers → 10 tasks → 10 workers (in 15s)
- 10 workers → 20 more tasks → 20 workers (in 15s)
- 20 workers → 30 more tasks → 40 workers (in 15s)

### Scale-Down Triggers
- Condition: cortex_task_queue_depth == 0 for 5 minutes
- Action: Reduce workers gradually
- Policy: 50% decrease every 60 seconds OR -5 pods (whichever is lower)
- Min: 0 workers (scale-to-zero)

Example:
- 40 workers → 0 tasks for 5 min → stabilization period ends
- 40 workers → 20 workers (after 60s)
- 20 workers → 10 workers (after 60s)
- 10 workers → 5 workers (after 60s)
- 5 workers → 0 workers (after 60s)

## Storage Configuration

### ReadWriteMany Challenge

K3s default storage (local-path) is ReadWriteOnce. For true ReadWriteMany:

**Option 1: HostPath (POC/Single-Node)**
```yaml
# Already configured in cortex-coordination-pvc.yaml
# All pods run on same node
# Simple but not HA
```

**Option 2: NFS (Multi-Node)**
```bash
# Deploy NFS provisioner
kubectl apply -f k8s/storage/nfs-provisioner.yaml

# Update PVCs to use nfs-client storage class
```

**Option 3: Longhorn (Production)**
```bash
# Install Longhorn
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/master/deploy/longhorn.yaml

# Update PVCs to use longhorn storage class
```

## Troubleshooting

### Workers not scaling

Check Prometheus metrics:
```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090

# Query: cortex_task_queue_depth
```

Check KEDA operator logs:
```bash
kubectl logs -n keda -l app=keda-operator
```

Check ScaledObject status:
```bash
kubectl describe scaledobject implementation-worker-scaler -n cortex
```

### Masters not starting

Check pod logs:
```bash
kubectl logs -n cortex coordinator-master-0
kubectl describe pod -n cortex coordinator-master-0
```

Check PVC binding:
```bash
kubectl get pvc -n cortex
```

### Workers stuck terminating

Check termination grace period (300s):
```bash
kubectl get pod -n cortex <worker-pod> -o yaml | grep terminationGracePeriodSeconds
```

Force delete if necessary:
```bash
kubectl delete pod -n cortex <worker-pod> --force --grace-period=0
```

## Monitoring

### View all components:
```bash
kubectl get all -n cortex
```

### Check resource usage:
```bash
kubectl top pods -n cortex
kubectl top nodes
```

### View events:
```bash
kubectl get events -n cortex --sort-by='.lastTimestamp'
```

### Access dashboards:

Cortex API:
```bash
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[0].address}')
curl http://${NODE_IP}:30001/health
```

Cortex Dashboard:
```bash
open http://${NODE_IP}:30030
```

## Files Created

### Kubernetes Manifests
- `k8s/masters/` - 5 StatefulSet manifests
- `k8s/workers/` - 4 Deployment manifests
- `k8s/autoscaling/` - 4 ScaledObject manifests
- `k8s/config/` - 5 ConfigMap manifests
- `k8s/storage/` - PVC and NFS provisioner manifests
- `k8s/services/` - 4 Service manifests

### Cortex Code
- `index.js` - Entry point with mode detection
- `lib/masters/master-mode.js` - Master execution logic
- `lib/workers/worker-mode.js` - Worker execution logic

### Scripts
- `scripts/k3s/install-keda.sh` - KEDA installation
- `scripts/autoscaling/deploy-masters.sh` - Deploy masters
- `scripts/autoscaling/deploy-workers.sh` - Deploy workers
- `scripts/autoscaling/deploy-keda.sh` - Deploy KEDA config
- `scripts/autoscaling/test-autoscaling.sh` - Test scaling

## Next Steps

1. Deploy Phase 4: Dashboard Integration
2. Configure Prometheus metrics for better scaling triggers
3. Implement task queue API for workers
4. Add observability (Grafana dashboards)
5. Production hardening (resource limits, network policies)

## Success Criteria

- [x] KEDA operator running
- [x] 5 masters deployed (1 replica each, StatefulSets)
- [x] 4 worker types deployed (0 initial replicas, Deployments)
- [x] 4 ScaledObjects configured
- [x] Workers scale from 0→1 when tasks appear
- [x] Workers scale to 0 after 5 min idle
- [x] Test shows scaling from 0→50 under load
