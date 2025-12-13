# Cortex K3s Deployment Guide

## Deployment Status: READY FOR MANUAL EXECUTION

This document provides complete instructions for deploying Cortex to the K3s cluster in CT 300.

---

## Cluster Information

- **K3s Master Node:** 10.88.145.180 (CT 300)
- **Worker Nodes:** 10.88.145.181, 10.88.145.182
- **Namespace:** cortex-system
- **Proxmox Host:** 10.88.140.164

---

## Deployment Components

The deployment will install:

1. **Coordinator Master** - Task orchestration and MoE routing
2. **Security Master** - Security monitoring and Wazuh integration
3. **Development Master** - Code management and GitHub integration
4. **CI/CD Master** - Pipeline automation and deployments
5. **Cortex Dashboard** - Real-time monitoring UI

---

## Deployment Options

### Option 1: One-Command Deployment (Recommended)

Access CT 300 console and run:

```bash
kubectl apply -f https://raw.githubusercontent.com/ry-ops/cortex/main/k8s/cortex-complete-deployment.yaml

# Create secrets
kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="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" \
  --from-literal=github-token="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" \
  --from-literal=github-user="ry-ops"
```

### Option 2: Using Deployment Script

1. Copy `deploy-cortex-complete.sh` to CT 300:
```bash
# On CT 300
curl -o deploy-cortex.sh https://raw.githubusercontent.com/ry-ops/cortex/main/deploy-cortex-complete.sh
chmod +x deploy-cortex.sh
./deploy-cortex.sh
```

### Option 3: Manual Manifest Application

Use the local manifest file:

```bash
# On CT 300
kubectl apply -f /path/to/cortex-complete-deployment.yaml

# Create secrets manually
kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="YOUR_KEY" \
  --from-literal=github-token="YOUR_TOKEN" \
  --from-literal=github-user="ry-ops"
```

### Option 4: Via Proxmox Console

1. Access Proxmox Web UI: https://10.88.140.164:8006
2. Navigate to CT 300
3. Open Console
4. Run one of the above deployment methods

---

## Deployment Verification

After deployment, verify all components:

```bash
# Check namespace
kubectl get namespace cortex-system

# Check pods (all should be Running)
kubectl get pods -n cortex-system -o wide

# Expected output:
# NAME                                 READY   STATUS    RESTARTS   AGE
# coordinator-master-xxxxxxxxx-xxxxx   1/1     Running   0          2m
# security-master-xxxxxxxxx-xxxxx      1/1     Running   0          2m
# development-master-xxxxxxxxx-xxxxx   1/1     Running   0          2m
# cicd-master-xxxxxxxxx-xxxxx          1/1     Running   0          2m
# cortex-dashboard-xxxxxxxxx-xxxxx     1/1     Running   0          2m

# Check services
kubectl get svc -n cortex-system

# Get dashboard URL
DASHBOARD_IP=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Dashboard: http://$DASHBOARD_IP"
```

---

## Resource Requirements

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| Coordinator Master | 1 core | 2 cores | 2Gi | 4Gi |
| Security Master | 1 core | 2 cores | 2Gi | 4Gi |
| Development Master | 2 cores | 4 cores | 4Gi | 8Gi |
| CI/CD Master | 1 core | 2 cores | 2Gi | 4Gi |
| Dashboard | 250m | 500m | 512Mi | 1Gi |
| **TOTAL** | **5.25 cores** | **10.5 cores** | **10.5Gi** | **21Gi** |

Ensure K3s cluster has sufficient resources.

---

## Network Access

After deployment, the following services will be available:

- **Dashboard:** http://<LoadBalancer-IP> or http://10.88.145.180:<NodePort>
- **Coordinator API:** http://coordinator-master.cortex-system.svc.cluster.local:8080
- **Security API:** http://security-master.cortex-system.svc.cluster.local:8080
- **Development API:** http://development-master.cortex-system.svc.cluster.local:8080
- **CI/CD API:** http://cicd-master.cortex-system.svc.cluster.local:8080

---

## Integration Points

### Wazuh Security Integration
- **Wazuh Manager:** https://10.88.140.202:55000
- **Dashboard:** https://10.88.140.202
- **Credentials:** admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay

### GitHub Integration
- **Repository:** https://github.com/ry-ops/cortex
- **Token:** Configured in cortex-credentials secret

### Proxmox Integration
- **Host:** 10.88.140.164
- **API Token:** Configured in cortex-credentials secret

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n cortex-system

# Check logs
kubectl logs <pod-name> -n cortex-system

# Common issues:
# 1. Insufficient resources - scale down other workloads
# 2. Image pull failures - check ghcr.io access
# 3. Secret not found - ensure cortex-credentials exists
```

### Dashboard Not Accessible

```bash
# Check service type
kubectl get svc cortex-dashboard -n cortex-system

# If LoadBalancer pending, use NodePort:
kubectl patch svc cortex-dashboard -n cortex-system -p '{"spec":{"type":"NodePort"}}'

# Get NodePort
kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.spec.ports[0].nodePort}'

# Access via: http://10.88.145.180:<nodePort>
```

### Masters Not Communicating

```bash
# Check internal DNS
kubectl run -it --rm debug --image=busybox --restart=Never -n cortex-system -- nslookup coordinator-master

# Check service endpoints
kubectl get endpoints -n cortex-system

# Verify network policies
kubectl get networkpolicies -n cortex-system
```

---

## Post-Deployment Tasks

1. **Verify Dashboard Access**
   - Open dashboard URL
   - Confirm real-time metrics display
   - Check WebSocket connectivity

2. **Submit Test Task**
   ```bash
   curl -X POST http://<dashboard-url>/api/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "task_id": "test-001",
       "description": "Health check task",
       "priority": "low"
     }'
   ```

3. **Monitor Wazuh Integration**
   - Access Wazuh dashboard
   - Verify Cortex agents appear
   - Check security events

4. **GitHub Repository Sync**
   - Verify masters can access GitHub
   - Check for initial sync logs
   - Confirm webhook configuration

---

## Scaling and High Availability

For production deployments:

```bash
# Scale masters
kubectl scale deployment coordinator-master --replicas=3 -n cortex-system
kubectl scale deployment security-master --replicas=2 -n cortex-system

# Add pod anti-affinity for HA
kubectl patch deployment coordinator-master -n cortex-system --patch '
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: coordinator-master
            topologyKey: kubernetes.io/hostname
'
```

---

## Backup and Disaster Recovery

### Backup Coordination Data
```bash
# Export all cortex resources
kubectl get all -n cortex-system -o yaml > cortex-backup.yaml

# Backup secrets
kubectl get secret cortex-credentials -n cortex-system -o yaml > secrets-backup.yaml
```

### Restore Procedure
```bash
# Apply backup
kubectl apply -f cortex-backup.yaml
kubectl apply -f secrets-backup.yaml
```

---

## Uninstallation

To remove Cortex completely:

```bash
# Delete namespace (removes all resources)
kubectl delete namespace cortex-system

# Remove cluster resources
kubectl delete clusterrole cortex-self-manager
kubectl delete clusterrolebinding cortex-self-manager-binding
```

---

## Support and Documentation

- **Repository:** https://github.com/ry-ops/cortex
- **Issues:** https://github.com/ry-ops/cortex/issues
- **Documentation:** /docs in repository

---

## Security Considerations

1. **Credentials**: All sensitive credentials are stored in Kubernetes secrets
2. **RBAC**: Limited permissions via cortex-self-manager ClusterRole
3. **Network**: Services are cluster-internal except dashboard LoadBalancer
4. **Secrets Rotation**: Rotate credentials every 90 days
5. **Image Security**: Images are scanned and signed

---

## Deployment Checklist

- [ ] K3s cluster is running and accessible
- [ ] kubectl is configured on CT 300
- [ ] Cluster has sufficient resources (10.5Gi RAM, 5.25 CPU)
- [ ] Credentials are valid (Anthropic API, GitHub token)
- [ ] Wazuh is accessible at 10.88.140.202
- [ ] Proxmox API token is valid
- [ ] Deployment script/manifest is ready
- [ ] Execute deployment command
- [ ] Verify all 5 pods are Running
- [ ] Access dashboard and confirm functionality
- [ ] Submit test task and monitor execution
- [ ] Verify Wazuh integration
- [ ] Check GitHub webhook configuration

---

Generated by CI/CD Master - Cortex Autonomous Platform
Deployment Package Version: 1.0.0
Last Updated: 2025-12-13
