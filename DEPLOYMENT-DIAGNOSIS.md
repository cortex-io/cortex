# Cortex K3s Deployment Diagnosis

**Date:** 2025-12-13
**Status:** QEMU Agent Working! Pod Diagnostics Complete

---

## SUCCESS: QEMU Guest Agent is Working! ✅

After enabling the agent feature (`agent=1`) in the VM configs, the QEMU guest agent API is **fully functional**!

**Test Results:**
```bash
$ whoami
root  # ✅ Success!

$ kubectl get pods -n cortex-system
# ✅ Returns full pod list!
```

**This means I can now:**
- ✅ Execute kubectl commands remotely via Proxmox API
- ✅ Check pod status automatically
- ✅ Retrieve pod logs
- ✅ Debug issues without manual console access

---

## Current Pod Status

### ✅ Working Pods (2/11)
- **cortex-dashboard** - 1/1 Running
  - Age: 3h9m
  - IP: 10.42.1.17
  - Node: k3s-worker-1-vm

- **cortex-resource-manager** - 1/1 Running
  - Age: 46m
  - IP: 10.42.2.20
  - Node: k3s-worker-2-vm

- **kali-deployment** - Completed
  - Job finished successfully
  - Age: 56m

### ❌ Crashing Pods - CrashLoopBackOff (3 pods)
All showing **39 restarts** with the same error:

**Error:**
```
Error: failed to create containerd task: OCI runtime create failed:
runc create failed: unable to start container process:
error during container init:
exec: "./coordination/masters/coordinator/run-coordinator.sh":
stat ./coordination/masters/coordinator/run-coordinator.sh:
no such file or directory
```

**Affected pods:**
- `coordinator-master-5f77d7f7bb-fdb8b`
- `security-master-66f89f4855-jmrj6`
- `cicd-master-9d54d8b84-8kts7`

### ❌ ImagePullBackOff (5 pods)
Old deployments still trying to pull images:
- `coordinator-master-777bf7fcdf-qztl6`
- `cicd-master-749489dc9-dvpjk`
- `development-master-c44b9d46-h29vt`
- `security-master-865cc7b58-gjpcq`

### ⏳ Pending (1 pod)
- `development-master-776cd7cf87-rb2gk` - No node assigned

---

## Root Cause Analysis

### Problem: Missing Entrypoint Scripts

**Deployment Configuration (k8s/cortex-complete-deployment.yaml):**
```yaml
command: ["./coordination/masters/coordinator/run-coordinator.sh"]
```

**Dockerfile Configuration:**
```dockerfile
WORKDIR /app
COPY --chown=cortex:cortex . .
CMD ["bash", "-c", "scripts/daemon-control.sh start && tail -f /dev/null"]
```

**Issue:**
The deployment is overriding the Dockerfile CMD with:
- `./coordination/masters/coordinator/run-coordinator.sh`
- `./coordination/masters/security/run-security.sh`
- `./coordination/masters/cicd/run-cicd.sh`
- `./coordination/masters/development/run-development.sh`

But these scripts **either don't exist** or **don't have execute permissions** in the container image.

### Evidence from Pod Events:
```
Normal   Pulled   45m (x21 over 158m)     kubelet  Successfully pulled image
Warning  Failed   39m (x33 over 179m)     kubelet  exec: "./coordination/masters/coordinator/run-coordinator.sh": stat ... no such file or directory
Warning  BackOff  4m59s (x793 over 179m)  kubelet  Back-off restarting failed container
```

**Timeline:**
- Images pulled successfully (image exists)
- Container fails immediately on startup (entrypoint missing)
- 793 restart attempts over 3 hours

---

## Solutions

### Option 1: Fix Deployment YAML (Recommended)

Update the deployment to use the default Dockerfile CMD:

```yaml
# Remove the command override, or use:
command: ["bash", "-c", "scripts/daemon-control.sh start && tail -f /dev/null"]
```

### Option 2: Add Run Scripts to Repository

Create the missing scripts in the repository:
- `coordination/masters/coordinator/run-coordinator.sh`
- `coordination/masters/security/run-security.sh`
- `coordination/masters/cicd/run-cicd.sh`
- `coordination/masters/development/run-development.sh`

Then rebuild the container image.

### Option 3: Update Dockerfile Entrypoint

Change the Dockerfile to use a single entrypoint script that can handle different master types via environment variables.

---

## Recommended Fix

**Step 1: Clean up old/duplicate deployments**
```bash
kubectl delete deployment coordinator-master-777bf7fcdf -n cortex-system
kubectl delete deployment cicd-master-749489dc9 -n cortex-system
kubectl delete deployment development-master-c44b9d46 -n cortex-system
kubectl delete deployment security-master-865cc7b58 -n cortex-system
```

**Step 2: Check if run scripts exist locally**
```bash
ls -la coordination/masters/coordinator/run-coordinator.sh
ls -la coordination/masters/security/run-security.sh
ls -la coordination/masters/cicd/run-cicd.sh
ls -la coordination/masters/development/run-development.sh
```

**Step 3a: If scripts exist - Rebuild images**
```bash
git add coordination/masters/*/run-*.sh
git commit -m "Add master run scripts to container"
git push
# Wait for GitHub Actions to rebuild images
```

**Step 3b: If scripts don't exist - Use daemon-control.sh**

Update deployment YAML to use the working entrypoint:
```yaml
containers:
- name: coordinator
  image: ghcr.io/ry-ops/cortex:latest
  command: ["bash", "-c"]
  args: ["scripts/daemon-control.sh start && tail -f /dev/null"]
  # Or just remove the command entirely to use Dockerfile CMD
```

---

## Network Status

### Infrastructure ✅
- K3s Cluster: VMs 310-312 (VLAN 145) - Running
- Traefik: 10.88.140.164:80 - Working
- QEMU Guest Agent: All 3 VMs responding

### Kali Sentinel Forge ✅
- VLAN 150: Created on switch
- vmbr2 Bridge: Configured (10.88.150.1/29, no gateway)
- All 4 VMs: Running
  - VM 900: red-kali-server (10.88.150.2)
  - VM 901: blue-kali-server (10.88.150.3)
  - VM 902: purple-kali-server (10.88.150.4)
  - VM 903: green-kali-server (10.88.150.5)

### Services ✅
**Existing (Working):**
- Grafana: HTTP 302
- Prometheus: HTTP 302
- Traefik Dashboard: HTTP 200

**New Cortex (Failing):**
- dashboard.cortex.local: HTTP 502 (dashboard pod IS running though!)
- coordinator.cortex.local: HTTP 503 (no healthy pods)
- security.cortex.local: HTTP 503 (no healthy pods)

---

## Next Steps

1. **Investigate:** Check if run scripts exist in repo
2. **Decision:** Fix deployment YAML vs rebuild container
3. **Deploy:** Apply fix to K3s
4. **Verify:** Watch pods recover
5. **Test:** Confirm services return HTTP 200

---

##Commands for Quick Fix

```bash
# Via Proxmox QEMU Agent API:

# 1. Check current deployments
kubectl get deployments -n cortex-system

# 2. Delete crashing pods to force restart with new config
kubectl delete pod coordinator-master-5f77d7f7bb-fdb8b -n cortex-system
kubectl delete pod security-master-66f89f4855-jmrj6 -n cortex-system
kubectl delete pod cicd-master-9d54d8b84-8kts7 -n cortex-system

# 3. Scale down old deployments
kubectl scale deployment coordinator-master-777bf7fcdf --replicas=0 -n cortex-system
# (repeat for other old deployments)

# 4. Watch pods recover
watch kubectl get pods -n cortex-system
```

---

**Diagnosis Complete:** Root cause identified, QEMU agent working, ready for fix implementation.
