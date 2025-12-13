# K3s Pod Verification Summary

**Date:** 2025-12-13
**CI/CD Master:** Autonomous Verification Attempt
**Status:** NETWORK CONNECTIVITY ISSUE - VERIFICATION INCOMPLETE

## Quick Status

- **K3s VM (Proxmox VM 310):** RUNNING ✓
- **QEMU Guest Agent:** RUNNING ✓
- **K3s API Connectivity:** FAILED - Network Unreachable
- **Pod Verification:** INCOMPLETE
- **Dashboard Access:** FAILED - Network Unreachable

## What We Attempted

1. **Proxmox API QEMU Exec** - Guest agent exec commands timeout
2. **Direct SSH to K3s Master** - Connection timeout to 10.88.145.180
3. **kubectl via Kubeconfig** - API server unreachable at 10.88.145.180:6443
4. **Dashboard HTTP Access** - LoadBalancer IP 10.88.145.201 unreachable

## Root Cause

The K3s cluster is deployed on the 10.88.145.x subnet which is **not routable from the current network**. The verification machine does not have:
- VPN access to 10.88.145.x subnet
- SSH bastion/jump host configured
- Direct network route to K3s cluster

## Infrastructure Verified

Via Proxmox API, we confirmed:

```
VM ID:         310
VM Name:       k3s-master-vm
VM Status:     Running ✓
CPUs:          4 cores
Memory:        10.86 GB / 16 GB
Guest Agent:   Running ✓
Proxmox Host:  10.88.140.164 (reachable)
```

## Expected Deployment

The following should be running on K3s (unverified):

**Namespace:** cortex-system

**Pods (5 expected):**
1. coordinator-master
2. development-master
3. security-master
4. cicd-master
5. dashboard

**Services:**
- LoadBalancer IP: 10.88.145.201
- Dashboard: http://10.88.145.201

**Images:**
- ghcr.io/ry-ops/cortex:latest
- ghcr.io/ry-ops/cortex-dashboard:latest

## How to Verify Pods NOW

### Method 1: Proxmox Web Console (FASTEST)

1. Open https://10.88.140.164:8006
2. Login with Proxmox credentials
3. Navigate to: Datacenter > pve01 > 310 (k3s-master-vm)
4. Click "Console" button
5. Run these commands:

```bash
kubectl get pods -n cortex-system -o wide
kubectl get svc -n cortex-system
kubectl get nodes -o wide

# Check for issues:
kubectl describe pods -n cortex-system
kubectl logs -n cortex-system -l app=coordinator-master --tail=50
kubectl logs -n cortex-system -l app=dashboard --tail=50

# Test dashboard:
curl http://10.88.145.201
```

### Method 2: SSH via Proxmox Host

```bash
# SSH to Proxmox first
ssh root@10.88.140.164

# Then SSH to K3s master
ssh root@10.88.145.180

# Run verification
kubectl get pods -n cortex-system -o wide
```

### Method 3: Use Verification Script (Requires Network Access)

Once VPN/network access is established:

```bash
# Run automated verification
./scripts/verify-cortex-pods.sh

# This will:
# - Check all 5 pods are Running
# - Verify LoadBalancer IP assignment
# - Test dashboard accessibility
# - Check pod logs for errors
# - Generate detailed JSON report
```

## Files Created

| File | Purpose |
|------|---------|
| `/Users/ryandahlberg/Projects/cortex/scripts/verify-k3s-via-proxmox.sh` | Proxmox API verification (QEMU exec) |
| `/Users/ryandahlberg/Projects/cortex/scripts/verify-cortex-pods.sh` | Direct kubectl verification |
| `/Users/ryandahlberg/Projects/cortex/coordination/k3s-deployment-verification-report.md` | Full verification report with troubleshooting |
| `/Users/ryandahlberg/Projects/cortex/coordination/masters/cicd/handoffs/cicd-to-coord-k3s-verification-*.json` | Handoff to coordinator |
| `/Users/ryandahlberg/Projects/cortex/K3S-VERIFICATION-SUMMARY.md` | This summary |

## Expected Pod Output

When you verify, you should see:

```
NAME                               READY   STATUS    RESTARTS   AGE
coordinator-master-xxxxx           1/1     Running   0          30m
development-master-xxxxx           1/1     Running   0          30m
security-master-xxxxx              1/1     Running   0          30m
cicd-master-xxxxx                  1/1     Running   0          30m
dashboard-xxxxx                    1/1     Running   0          30m
```

If any pods show different status:
- **Pending:** Check node resources, pod events
- **ImagePullBackOff:** Verify images exist in ghcr.io/ry-ops
- **CrashLoopBackOff:** Check pod logs with `kubectl logs <pod-name> -n cortex-system`
- **Error:** Check pod description with `kubectl describe pod <pod-name> -n cortex-system`

## Troubleshooting Common Issues

### ImagePullBackOff
```bash
# Verify images are public in GitHub Container Registry
# https://github.com/ry-ops?tab=packages

# Check image pull secrets
kubectl get secrets -n cortex-system

# Describe pod to see exact error
kubectl describe pod <pod-name> -n cortex-system
```

### CrashLoopBackOff
```bash
# Check logs for startup errors
kubectl logs <pod-name> -n cortex-system --tail=100

# Common causes:
# - Missing environment variables
# - Incorrect ConfigMap/Secret mounts
# - Application startup failures
```

### LoadBalancer IP Not Assigned
```bash
# Check MetalLB or LoadBalancer controller status
kubectl get pods -n metallb-system
kubectl get svc -n cortex-system

# Verify IP pool configuration
kubectl get ipaddresspool -n metallb-system
```

## Next Steps

### Immediate
1. **Verify pods via Proxmox console** (use Method 1 above)
2. **Test dashboard** at http://10.88.145.201
3. **Check pod logs** for any startup errors

### Network Setup
1. **Establish VPN** to 10.88.145.x subnet
2. **Configure SSH bastion** for remote access
3. **Set up static route** to K3s network

### Monitoring
1. **Deploy Prometheus/Grafana** on K3s for pod monitoring
2. **Create GitHub Actions workflow** for automated pod verification
3. **Set up alerts** for pod failures

### CI/CD Improvements
1. **Pre-deployment network checks** in CI/CD pipeline
2. **Automated rollback** on deployment verification failure
3. **Multi-environment testing** (staging before production)
4. **Health check integration** in deployment workflows

## Commands Reference

```bash
# Quick pod status
kubectl get pods -n cortex-system

# Detailed pod info
kubectl get pods -n cortex-system -o wide

# Check services
kubectl get svc -n cortex-system

# Pod logs
kubectl logs -n cortex-system -l app=<pod-name> --tail=50

# Describe pod (events, status)
kubectl describe pod <pod-name> -n cortex-system

# All events in namespace
kubectl get events -n cortex-system --sort-by='.lastTimestamp'

# Dashboard test
curl http://10.88.145.201

# Restart pod (if needed)
kubectl rollout restart deployment/<deployment-name> -n cortex-system
```

## Verification Checklist

Once you have network access, verify:

- [ ] All 5 pods show "Running" status
- [ ] All pods show "1/1" in READY column
- [ ] LoadBalancer IP assigned to dashboard service (10.88.145.201)
- [ ] Dashboard accessible at http://10.88.145.201
- [ ] No errors in pod logs
- [ ] All services have ClusterIP or LoadBalancer IP
- [ ] Nodes show "Ready" status
- [ ] No ImagePullBackOff or CrashLoopBackOff errors

## Contact Info

**Deployed To:**
- Proxmox Host: 10.88.140.164:8006
- K3s Master: 10.88.145.180 (VM 310)
- Dashboard: http://10.88.145.201

**Deployment Files:**
- Kubernetes Manifests: `/Users/ryandahlberg/Projects/cortex/k8s/`
- Docker Images: ghcr.io/ry-ops/cortex:latest, ghcr.io/ry-ops/cortex-dashboard:latest

**CI/CD Master Notes:**
This verification was performed autonomously by the Cortex CI/CD Master. Network connectivity prevented automated verification. Manual verification via Proxmox console recommended.

---

**Status:** Awaiting network access for pod verification
**Action Required:** Use Proxmox console to verify pods manually
**Automated Verification:** Run `./scripts/verify-cortex-pods.sh` once network access is available
