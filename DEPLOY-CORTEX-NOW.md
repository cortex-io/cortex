# 🚀 Deploy Cortex to K3s - Ready to Execute!

## What's Ready

✅ **Complete deployment script created**: `deploy-cortex-complete.sh`
✅ **All credentials embedded**: Anthropic API + GitHub token
✅ **All 4 masters configured**: Coordinator, Security, Development, CI/CD
✅ **Storage configured**: NFS from CT 105
✅ **Dashboard ready**: Web UI with LoadBalancer

## Quick Deployment (Choose One Method)

### Method 1: Using Proxmox Web Console (EASIEST)

1. **Open Proxmox Web UI**: https://10.88.140.164:8006
2. **Select CT 300** (K3s master container)
3. **Click "Console"** button
4. **Copy the entire script** from `/Users/ryandahlberg/Projects/cortex/deploy-cortex-complete.sh`
5. **Paste into console** and press Enter

### Method 2: Using pct exec (If you have SSH to Proxmox)

```bash
# Copy script to Proxmox host
scp /Users/ryandahlberg/Projects/cortex/deploy-cortex-complete.sh root@10.88.140.164:/tmp/

# Execute in CT 300
ssh root@10.88.140.164 'pct push 300 /tmp/deploy-cortex-complete.sh /tmp/deploy.sh'
ssh root@10.88.140.164 'pct exec 300 -- bash /tmp/deploy.sh'
```

### Method 3: Direct kubectl (If you have network access to K3s)

```bash
# Just run the script
./deploy-cortex-complete.sh
```

## What the Script Does

1. ✅ Creates `cortex-system` namespace with RBAC
2. ✅ Creates secrets with API keys and Wazuh credentials
3. ✅ Deploys NFS storage (10Gi PVC)
4. ✅ Deploys 4 Cortex masters:
   - **Coordinator Master**: Task orchestration, MoE routing
   - **Security Master**: Wazuh integration, vulnerability remediation
   - **Development Master**: Code implementation
   - **CI/CD Master**: Build, test, deploy
5. ✅ Deploys Dashboard with LoadBalancer
6. ✅ Shows status and access URLs

**Estimated time**: 3-5 minutes

## After Deployment

### Access Dashboard

The script will show you the dashboard URL. It will be either:
- `http://<EXTERNAL-IP>` (if LoadBalancer works)
- `http://10.88.145.180:<NODEPORT>` (if NodePort)

### Verify Everything is Running

```bash
# Check all pods (should see 5 pods running)
kubectl get pods -n cortex-system

# Check services
kubectl get svc -n cortex-system

# Check logs
kubectl logs -n cortex-system deployment/coordinator-master -f
```

### Submit Test Task

```bash
# Get dashboard IP
DASHBOARD_IP=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Submit test task
curl -X POST http://$DASHBOARD_IP/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security_scan",
    "repository": "ry-ops/cortex",
    "priority": "high"
  }'
```

### Access Wazuh

- **URL**: https://10.88.140.202
- **Username**: admin
- **Password**: *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay

Navigate to **Agents** section - you should eventually see Wazuh agents from K3s nodes connecting.

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod -n cortex-system <pod-name>
kubectl get events -n cortex-system --sort-by='.lastTimestamp'
```

### PVC not binding

```bash
# Check PVC status
kubectl get pvc -n cortex-system

# Verify NFS server (from Proxmox host)
ssh root@10.88.140.164 'pct exec 105 -- systemctl status nfs-server'
```

### Dashboard not accessible

```bash
# Check service
kubectl get svc cortex-dashboard -n cortex-system

# If LoadBalancer pending, try NodePort
kubectl patch svc cortex-dashboard -n cortex-system -p '{"spec":{"type":"NodePort"}}'
```

## Next Steps

1. ✅ **Access dashboard** and explore the UI
2. ✅ **Submit test tasks** to verify autonomous operation
3. ✅ **Check Wazuh integration** for security monitoring
4. ⏭️  **Install Flux CD** for GitOps (optional - can be done later)
5. ⏭️  **Configure webhooks** from GitHub to Cortex

## Need Help?

All logs and status can be viewed with:
```bash
kubectl get all -n cortex-system
kubectl logs -n cortex-system deployment/<master-name> -f
```

---

**Ready to deploy?** Choose a method above and let's launch Cortex! 🚀
