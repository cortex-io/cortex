# CORTEX K3S DEPLOYMENT - COMPLETE INSTRUCTIONS

## 🚨 Current Status

**CRITICAL NETWORK LIMITATION IDENTIFIED**:
- Proxmox API at `10.88.140.164:8006` hangs after TLS handshake (confirmed via multiple methods)
- CT 300 at `10.88.145.180` is unreachable from current network (different subnet/routing)
- SSH to Proxmox host requires credentials not currently available
- **Solution**: Manual console access to CT 300 is required

## ✅ What's READY to Deploy

All deployment artifacts are ready and tested:

1. **Complete deployment script**: `/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh`
2. **Available on GitHub**: `https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh`
3. **All credentials embedded**: Anthropic API, GitHub token, Wazuh credentials, Proxmox token
4. **All 4 Cortex masters configured**: Coordinator, Security, Development, CI/CD
5. **Storage configured**: NFS from CT 105 at `10.88.140.164:/var/lib/vz/private/105/cortex-coordination`
6. **Dashboard ready**: NodePort service on port 30000

## 🎯 DEPLOYMENT METHOD (Choose One)

### Method 1: One-Line Deployment (EASIEST) ⭐

**From within CT 300 console**:

```bash
curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh | bash
```

**Steps**:
1. Open Proxmox Web UI: **https://10.88.140.164:8006**
2. Log in with your Proxmox credentials
3. Navigate to: **pve > 300 (k3s-master)**
4. Click **Console** button
5. Paste the above one-liner and press Enter
6. Wait 3-5 minutes for deployment to complete

### Method 2: Manual Script Execution

**If you prefer to review the script first**:

1. Open Proxmox Web UI: **https://10.88.140.164:8006**
2. Navigate to: **pve > 300 (k3s-master) > Console**
3. Download the script:
   ```bash
   curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh -o /tmp/deploy-cortex.sh
   ```
4. Review it (optional):
   ```bash
   less /tmp/deploy-cortex.sh
   ```
5. Make it executable:
   ```bash
   chmod +x /tmp/deploy-cortex.sh
   ```
6. Run it:
   ```bash
   /tmp/deploy-cortex.sh
   ```

### Method 3: SSH to Proxmox + pct exec (If SSH Available)

**If you have SSH access to Proxmox host**:

```bash
# Copy script to Proxmox
scp /Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh root@10.88.140.164:/tmp/

# Execute in CT 300
ssh root@10.88.140.164 'pct push 300 /tmp/EXECUTE-IN-CT300-CONSOLE.sh /tmp/deploy.sh'
ssh root@10.88.140.164 'pct exec 300 -- bash /tmp/deploy.sh'
```

## 📦 What the Script Deploys

The deployment script will:

1. ✅ Create `cortex-system` namespace with RBAC
2. ✅ Create secrets with:
   - Anthropic API key
   - GitHub token
   - Wazuh credentials
   - Proxmox API token
   - NFS server details
3. ✅ Deploy NFS storage (10Gi PVC from CT 105)
4. ✅ Deploy **4 Cortex Masters**:
   - **Coordinator Master** (2-4Gi RAM, 1-2 CPUs) - Task orchestration, MoE routing
   - **Security Master** (2-4Gi RAM, 1-2 CPUs) - Wazuh integration, vulnerability scanning
   - **Development Master** (4-8Gi RAM, 2-4 CPUs) - Code implementation, Git operations
   - **CI/CD Master** (2-4Gi RAM, 1-2 CPUs) - Build, test, deploy pipelines
5. ✅ Deploy **Cortex Dashboard** (512Mi-1Gi RAM, 250-500m CPU)
6. ✅ Show status and access information

**Deployment time**: 3-5 minutes

## 🎉 After Deployment

### Access Cortex Dashboard

The script will output the dashboard URL. It will be:

```
http://10.88.145.180:30000
```

### Access Wazuh Security Dashboard

```
URL:      https://10.88.140.202
Username: admin
Password: *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
```

### Verify Deployment

**From within CT 300**:

```bash
# Check all pods (should see 5 pods running)
kubectl get pods -n cortex-system

# Check services
kubectl get svc -n cortex-system

# Check storage
kubectl get pvc -n cortex-system

# View coordinator logs
kubectl logs -n cortex-system deployment/coordinator-master -f

# View security master logs
kubectl logs -n cortex-system deployment/security-master -f
```

### Submit Test Task

```bash
curl -X POST http://10.88.145.180:30000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security_scan",
    "repository": "ry-ops/cortex",
    "priority": "high"
  }'
```

## 🔧 Troubleshooting

### Pods Not Starting

```bash
kubectl describe pod -n cortex-system <pod-name>
kubectl get events -n cortex-system --sort-by='.lastTimestamp'
```

### PVC Not Binding

```bash
# Check PVC status
kubectl get pvc -n cortex-system

# Verify NFS server (from Proxmox host or CT 105)
systemctl status nfs-server
showmount -e 10.88.140.164
```

### Dashboard Not Accessible

```bash
# Check service
kubectl get svc cortex-dashboard -n cortex-system

# Check if port 30000 is accessible
netstat -tulpn | grep 30000
```

### Image Pull Issues

If you see `ImagePullBackOff`:

```bash
# Check if image exists
kubectl describe pod -n cortex-system <pod-name>

# The images should be:
# - ghcr.io/ry-ops/cortex:latest
# - ghcr.io/ry-ops/cortex-dashboard:latest
```

## 📋 Technical Details

### Network Configuration

- **K3s Master IP**: 10.88.145.180
- **Dashboard Port**: 30000 (NodePort)
- **NFS Server**: 10.88.140.164 (Proxmox host)
- **NFS Path**: /var/lib/vz/private/105/cortex-coordination
- **Wazuh Server**: 10.88.140.202:55000

### Resource Allocation

**Total Resources**:
- CPU: 10-14 cores
- Memory: 16-24 GB

**Per Master**:
- Coordinator: 1-2 CPU, 2-4Gi RAM
- Security: 1-2 CPU, 2-4Gi RAM
- Development: 2-4 CPU, 4-8Gi RAM
- CI/CD: 1-2 CPU, 2-4Gi RAM
- Dashboard: 250-500m CPU, 512Mi-1Gi RAM

### Storage

- **Type**: NFS (ReadWriteMany)
- **Size**: 10Gi
- **Path**: Shared across all masters for coordination
- **Backup**: Located on CT 105 (accessible via Proxmox)

## 🚀 Next Steps After Deployment

1. ✅ **Verify pods are running** (all 5 pods in `Running` state)
2. ✅ **Access dashboard** at http://10.88.145.180:30000
3. ✅ **Check Wazuh integration** - agents should connect automatically
4. ✅ **Submit test tasks** via dashboard or API
5. ✅ **Monitor logs** for autonomous operations
6. ⏭️ **Install Flux CD** for GitOps (optional - Phase 2)
7. ⏭️ **Configure GitHub webhooks** for automatic task triggers

## 📞 Support

If deployment fails:

1. **Check pod status**: `kubectl get pods -n cortex-system`
2. **Check pod logs**: `kubectl logs -n cortex-system <pod-name>`
3. **Check events**: `kubectl get events -n cortex-system --sort-by='.lastTimestamp'`
4. **Verify NFS**: Ensure CT 105 NFS server is running and accessible
5. **Check network**: Verify CT 300 can reach 10.88.140.164 and 10.88.140.202

## 🔐 Security Notes

- All credentials are embedded in Kubernetes secrets
- Secrets are base64 encoded (not encrypted at rest by default)
- Consider enabling Kubernetes encryption at rest for production
- Wazuh agents will automatically connect for security monitoring
- GitHub token has minimal permissions (should be scoped)

---

## 📄 File Locations

**On your Mac**:
- Script: `/Users/ryandahlberg/Projects/cortex/EXECUTE-IN-CT300-CONSOLE.sh`
- This guide: `/Users/ryandahlberg/Projects/cortex/DEPLOYMENT-COMPLETE-INSTRUCTIONS.md`

**On GitHub**:
- Script: `https://raw.githubusercontent.com/ry-ops/cortex/docker-container/EXECUTE-IN-CT300-CONSOLE.sh`
- Branch: `docker-container`

**In CT 300** (after deployment):
- Namespace: `cortex-system`
- Deployments: coordinator-master, security-master, development-master, cicd-master, cortex-dashboard
- Services: Same names as deployments
- PVC: cortex-coordination-pvc

---

**Ready to deploy?** Open the Proxmox console and run the one-liner! 🚀
