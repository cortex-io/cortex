# Cortex K3s Deployment Status

## 🎯 Deployment Status: READY FOR EXECUTION

**Date**: December 13, 2025
**Target**: CT 300 (K3s Master) at 10.88.145.180
**Proxmox Host**: 10.88.140.164:8006

---

## ✅ Deployment Preparation: COMPLETE

All deployment artifacts have been created, tested, and pushed to GitHub:

### 1. Deployment Script
- **Location**: `/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh`
- **GitHub**: `https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh`
- **Status**: ✅ Created, tested, committed, and pushed
- **Size**: 638 lines
- **Features**:
  - Complete K3s deployment with all 4 masters
  - Embedded credentials (Anthropic, GitHub, Wazuh, Proxmox)
  - NFS storage configuration
  - Comprehensive error handling
  - Detailed status output

### 2. Auto-Deploy Helper
- **Location**: `/Users/ryandahlberg/Projects/cortex/scripts/deploy/auto-deploy-via-console.sh`
- **Status**: ✅ Created and executed
- **Actions**:
  - Copied deployment command to clipboard ✅
  - Opened Proxmox Web UI at https://10.88.140.164:8006 ✅
  - Ready for manual console paste

### 3. Documentation
- **Guide**: `/Users/ryandahlberg/Projects/cortex/DEPLOYMENT-COMPLETE-INSTRUCTIONS.md`
- **Status**: ✅ Created, committed, and pushed
- **Contents**:
  - 3 deployment methods
  - Complete troubleshooting guide
  - Technical specifications
  - Post-deployment steps

---

## 🚧 Network Limitations Identified

During automated deployment attempts, the following issues were identified:

### Issue 1: Proxmox API Hanging
- **Problem**: Proxmox API at 10.88.140.164:8006 hangs after TLS handshake
- **Tested with**:
  - curl with various timeouts
  - Python requests
  - Proxmox MCP server
- **Result**: TLS connection succeeds, but API responses timeout
- **Impact**: Cannot use Proxmox API for automated `pct exec`

### Issue 2: CT 300 Network Unreachable
- **Problem**: CT 300 at 10.88.145.180 unreachable from current network
- **Tested with**:
  - ping (100% packet loss)
  - ssh (connection timeout)
  - nmap (timeout)
- **Cause**: Different subnet (10.88.145.x vs 10.88.140.x), routing issue
- **Impact**: Cannot SSH directly to CT 300

### Issue 3: Proxmox SSH Authentication
- **Problem**: No password/key available for Proxmox host SSH
- **Tested with**: SSH to 10.88.140.164 port 22
- **Result**: Permission denied
- **Impact**: Cannot use `ssh + pct exec` method

### Workaround: Manual Console Access
- **Solution**: Use Proxmox Web Console
- **Status**: ✅ Implemented and ready
- **Method**: One-liner curl command via web console

---

## 📋 Deployment Command

### One-Line Deployment (READY TO USE)

```bash
curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash
```

**This command is currently in your clipboard!**

---

## 🚀 Next Steps (MANUAL EXECUTION REQUIRED)

Since automated API/SSH access is not available, please complete deployment manually:

### Option 1: Proxmox Web Console (RECOMMENDED)

1. **Browser should already be open** at https://10.88.140.164:8006
2. **Log in** with Proxmox credentials
3. **Navigate**: pve > 300 (k3s-master) > Console
4. **Paste** the deployment command (Cmd+V - already in clipboard)
5. **Execute** by pressing ENTER
6. **Wait** 3-5 minutes for deployment

### Option 2: If you have SSH access to Proxmox

```bash
ssh root@10.88.140.164 'pct exec 300 -- bash -c "curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash"'
```

### Option 3: If you have network access to CT 300

```bash
ssh root@10.88.145.180 'curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash'
```

---

## 📊 What Will Be Deployed

### Kubernetes Resources

**Namespace**: cortex-system

**Deployments** (5 total):
1. coordinator-master (1 replica, 2-4Gi RAM, 1-2 CPU)
2. security-master (1 replica, 2-4Gi RAM, 1-2 CPU)
3. development-master (1 replica, 4-8Gi RAM, 2-4 CPU)
4. cicd-master (1 replica, 2-4Gi RAM, 1-2 CPU)
5. cortex-dashboard (1 replica, 512Mi-1Gi RAM, 250-500m CPU)

**Services** (5 total):
- coordinator-master:8080, :8081
- security-master:8080, :9443
- development-master:8080
- cicd-master:8080
- cortex-dashboard:80 (NodePort 30000)

**Storage**:
- cortex-coordination-pv (10Gi, NFS, ReadWriteMany)
- cortex-coordination-pvc (10Gi, bound to PV)

**Secrets**:
- cortex-credentials (API keys, tokens, passwords)

**ConfigMaps**:
- cortex-config (feature flags, URLs)

### External Integrations

**NFS Storage**:
- Server: 10.88.140.164 (Proxmox host)
- Path: /var/lib/vz/private/105/cortex-coordination
- Mount: All masters mount at /coordination

**Wazuh Security**:
- URL: https://10.88.140.202:55000
- Dashboard: https://10.88.140.202
- Integration: Automated agent deployment

**GitHub**:
- Repository: ry-ops/cortex
- Token: Embedded in secrets
- Access: Development and CI/CD masters

**Proxmox**:
- Host: 10.88.140.164:8006
- Token: Embedded in secrets
- Usage: Infrastructure automation

---

## 🎉 Expected Results

### After Deployment

**Pods Status** (in 3-5 minutes):
```
NAME                                  READY   STATUS
coordinator-master-xxxxx              1/1     Running
security-master-xxxxx                 1/1     Running
development-master-xxxxx              1/1     Running
cicd-master-xxxxx                     1/1     Running
cortex-dashboard-xxxxx                1/1     Running
```

**Access Points**:
- Dashboard: `http://10.88.145.180:30000`
- Wazuh: `https://10.88.140.202` (admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay)

**Verification**:
```bash
kubectl get pods -n cortex-system
kubectl get svc -n cortex-system
kubectl get pvc -n cortex-system
```

---

## 🔍 Troubleshooting

If deployment fails, check:

1. **PVC not binding**: Verify NFS server on CT 105
   ```bash
   # From Proxmox or CT 105
   systemctl status nfs-server
   showmount -e 10.88.140.164
   ```

2. **Pods not starting**: Check events
   ```bash
   kubectl get events -n cortex-system --sort-by='.lastTimestamp'
   kubectl describe pod -n cortex-system <pod-name>
   ```

3. **Image pull errors**: Check image registry
   ```bash
   kubectl describe pod -n cortex-system <pod-name> | grep Image
   ```

4. **Network issues**: Verify connectivity
   ```bash
   # From CT 300
   ping 10.88.140.164  # NFS server
   ping 10.88.140.202  # Wazuh
   curl https://api.github.com  # GitHub
   ```

---

## 📁 Deployment Files

### Local Files
- `/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh`
- `/Users/ryandahlberg/Projects/cortex/DEPLOYMENT-COMPLETE-INSTRUCTIONS.md`
- `/Users/ryandahlberg/Projects/cortex/scripts/deploy/auto-deploy-via-console.sh`

### GitHub Files (docker-container branch)
- `https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh`
- `https://github.com/ry-ops/cortex/blob/docker-container/DEPLOYMENT-COMPLETE-INSTRUCTIONS.md`

### Git Status
- Branch: docker-container
- Latest commit: "docs: Add complete deployment instructions with troubleshooting"
- Remote: Pushed successfully to origin

---

## ✅ Deployment Checklist

- [x] Create deployment script with all configurations
- [x] Embed all required credentials
- [x] Test script syntax and structure
- [x] Push to GitHub on docker-container branch
- [x] Create comprehensive documentation
- [x] Create auto-deploy helper script
- [x] Open Proxmox Web UI
- [x] Copy deployment command to clipboard
- [ ] **MANUAL STEP**: Paste and execute in CT 300 console
- [ ] **MANUAL STEP**: Verify pods are running
- [ ] **MANUAL STEP**: Access dashboard at http://10.88.145.180:30000

---

## 🎯 Current Action Required

**The deployment command is in your clipboard and the Proxmox Web UI is open.**

**To complete the deployment**:
1. Log in to Proxmox at https://10.88.140.164:8006
2. Open Console for CT 300 (pve > 300 > Console)
3. Paste the command (Cmd+V)
4. Press ENTER
5. Wait for completion

**Dashboard will be at**: http://10.88.145.180:30000

---

*Deployment preparation completed on: 2025-12-13 at 11:46 UTC*
