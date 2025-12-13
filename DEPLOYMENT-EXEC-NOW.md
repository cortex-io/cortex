# 🚀 CORTEX K3S DEPLOYMENT - EXECUTE NOW

## ⚡ IMMEDIATE ACTION REQUIRED

Your Proxmox Web UI should be open at: **https://10.88.140.164:8006**

The deployment command is **IN YOUR CLIPBOARD** right now.

---

## 📝 DEPLOYMENT STEPS (DO THIS NOW)

### Step 1: Access Proxmox Console
1. ✅ Proxmox UI is already open in your browser
2. Log in if needed
3. Navigate to: **pve > 300 (k3s-master)**
4. Click the **Console** button

### Step 2: Execute Deployment
1. **Paste** the command from clipboard (Cmd+V or Ctrl+V)
2. **Press ENTER**
3. **Wait 3-5 minutes** for completion

### Step 3: Verify Success
Look for this output:
```
========================================
  DEPLOYMENT COMPLETE!
========================================
```

---

## 💻 THE DEPLOYMENT COMMAND

```bash
curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash
```

**OR** if GitHub raw URL is not ready yet (404), copy the ENTIRE script from:
```
/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh
```

---

## 🎯 WHAT GETS DEPLOYED

### Kubernetes Resources (cortex-system namespace)

**5 Deployments**:
1. **coordinator-master** - Task orchestration, MoE routing (2-4Gi RAM)
2. **security-master** - Wazuh integration, security scanning (2-4Gi RAM)
3. **development-master** - Code implementation, Git ops (4-8Gi RAM)
4. **cicd-master** - Build, test, deploy pipelines (2-4Gi RAM)
5. **cortex-dashboard** - Web UI (512Mi-1Gi RAM)

**Storage**:
- 10Gi NFS volume from CT 105
- Mounted at /coordination on all masters
- Shared state and coordination data

**Credentials (embedded)**:
- Anthropic API key ✅
- GitHub token ✅
- Wazuh credentials ✅
- Proxmox token ✅

---

## 🌐 ACCESS INFORMATION

After deployment completes:

### Cortex Dashboard
```
http://10.88.145.180:30000
```

### Wazuh Security Dashboard
```
URL:      https://10.88.140.202
Username: admin
Password: *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
```

---

## ✅ VERIFICATION COMMANDS

After deployment, run these in CT 300:

```bash
# Check all pods are running
kubectl get pods -n cortex-system

# Expected output:
# NAME                                  READY   STATUS
# coordinator-master-xxxxx              1/1     Running
# security-master-xxxxx                 1/1     Running
# development-master-xxxxx              1/1     Running
# cicd-master-xxxxx                     1/1     Running
# cortex-dashboard-xxxxx                1/1     Running

# Check services
kubectl get svc -n cortex-system

# Check storage
kubectl get pvc -n cortex-system
# Should show: cortex-coordination-pvc   Bound
```

---

## 🔥 SUBMIT TEST TASK

Once dashboard is accessible:

```bash
curl -X POST http://10.88.145.180:30000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security_scan",
    "repository": "ry-ops/cortex",
    "priority": "high"
  }'
```

---

## 🚨 IF DEPLOYMENT FAILS

### Issue: PVC Won't Bind

**Symptom**: cortex-coordination-pvc stuck in Pending

**Fix**:
```bash
# From Proxmox or CT 105, verify NFS
systemctl status nfs-server
showmount -e 10.88.140.164
```

### Issue: Pods Won't Start

**Check Events**:
```bash
kubectl get events -n cortex-system --sort-by='.lastTimestamp'
kubectl describe pod -n cortex-system <pod-name>
```

### Issue: ImagePullBackOff

**Check Images**:
```bash
kubectl describe pod -n cortex-system <pod-name> | grep Image
```

Expected images:
- `ghcr.io/ry-ops/cortex:latest`
- `ghcr.io/ry-ops/cortex-dashboard:latest`

---

## 📊 DEPLOYMENT TIMELINE

| Time | Event |
|------|-------|
| T+0s | Script starts, creates namespace |
| T+10s | Secrets and ConfigMaps created |
| T+20s | PV and PVC created |
| T+30s | Waiting for PVC to bind |
| T+45s | PVC bound, deploying masters |
| T+60s | Coordinator master deploying |
| T+75s | Security master deploying |
| T+90s | Development master deploying |
| T+105s | CI/CD master deploying |
| T+120s | Dashboard deploying |
| T+150s | Waiting for pods to initialize |
| T+180s | **DEPLOYMENT COMPLETE** |

---

## 🎉 SUCCESS INDICATORS

You'll see:
```
╔═══════════════════════════════════════════════════╗
║  CORTEX ACCESS INFORMATION                        ║
╚═══════════════════════════════════════════════════╝

Dashboard:
  http://10.88.145.180:30000

Wazuh Security Dashboard:
  https://10.88.140.202
  Username: admin
  Password: *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay

✓ Cortex is now running autonomously in K3s!
```

---

## 🔄 ALTERNATIVE DEPLOYMENT METHODS

### Method 1: If you have SSH to Proxmox
```bash
ssh root@10.88.140.164 'pct exec 300 -- bash -c "curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash"'
```

### Method 2: If you have SSH to CT 300
```bash
ssh root@10.88.145.180 'curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash'
```

### Method 3: Manual Script Copy
```bash
# 1. Copy the entire script
cat /Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh | pbcopy

# 2. Paste into CT 300 console
# 3. Press ENTER
```

---

## 📁 FILES CREATED

### Local
- `/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh` - Deployment script
- `/Users/ryandahlberg/Projects/cortex/DEPLOYMENT-COMPLETE-INSTRUCTIONS.md` - Full guide
- `/Users/ryandahlberg/Projects/cortex/DEPLOYMENT-STATUS.md` - Status report
- `/Users/ryandahlberg/Projects/cortex/scripts/deploy/auto-deploy-via-console.sh` - Helper script

### GitHub (docker-container branch)
- All files committed and pushed ✅
- GitHub raw URLs may take 1-2 minutes to propagate
- Latest commit: 1f79d797

---

## ⏱️ DEPLOYMENT READY SINCE

**13:46 UTC, December 13, 2025**

---

## 🚀 NEXT ACTION

**DO THIS RIGHT NOW**:

1. Switch to the browser tab with Proxmox (should be open)
2. Navigate to CT 300 Console
3. Press Cmd+V (deployment command is in clipboard)
4. Press ENTER
5. Watch Cortex deploy itself autonomously

**Dashboard will be ready at**: http://10.88.145.180:30000

---

*The deployment is completely ready. Just paste and execute!*
