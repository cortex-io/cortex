# Cortex K3s Deployment - Quick Reference

**One-command deployment of fully autonomous Cortex to K3s cluster**

## 🚀 Deploy Now

```bash
# 1. Set credentials
export ANTHROPIC_API_KEY="your-key"
export GITHUB_TOKEN="your-token"

# 2. Deploy
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-to-k3s.sh

# 3. Validate
./scripts/validate-k3s-deployment.sh
```

## 📍 Infrastructure

| Component | Location | Purpose |
|-----------|----------|---------|
| **K3s Master** | 10.88.145.180 (VM 310) | Control plane |
| **K3s Worker 1** | 10.88.145.181 (VM 311) | Workload execution |
| **K3s Worker 2** | 10.88.145.182 (VM 312) | Workload execution |
| **Wazuh** | 10.88.140.202 (VM 201) | Security monitoring |
| **NFS Server** | 10.88.140.164 (CT 105) | Shared storage |
| **Gateway** | 10.88.140.1 | Network gateway |

## 🎯 What Gets Deployed

### Control Plane (K8s Deployments)
- ✅ **coordinator-master** - Task orchestration, MoE routing
- ✅ **security-master** - Wazuh integration, CVE remediation
- ✅ **development-master** - Code implementation, feature development
- ✅ **cicd-master** - Build, test, deploy automation

### Infrastructure
- ✅ **NFS PVC** - 10Gi shared coordination layer
- ✅ **Wazuh DaemonSet** - Agents on all K3s nodes
- ✅ **Dashboard** - Web UI + REST APIs
- ✅ **Flux GitOps** - Auto-deploy from GitHub

### Autonomous Features
- ✅ **Self-Evaluation** - Confidence-based decision gates
- ✅ **RLHF Feedback** - "How did I do?" learning
- ✅ **Proactive Scanning** - Daily security + dependency audits
- ✅ **Autonomous Remediation** - Wazuh alert → Fix → Deploy
- ✅ **Self-Modification** - Cortex updates own K8s manifests

## 🔐 Secrets Required

Set these environment variables before deploying:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."      # Claude API
export GITHUB_TOKEN="ghp_..."              # GitHub access
```

**Pre-configured (already in secrets.yaml):**
- Wazuh: admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
- Proxmox: root@pam!n8n token
- NFS: CT 105 path

## 📊 Access Points

### After Deployment
```bash
# Get dashboard IP
kubectl get svc cortex-dashboard -n cortex-system

# Dashboard
open http://<EXTERNAL-IP>

# Wazuh
open https://10.88.140.202
```

### API Endpoints
- `http://<IP>/api/coordinator` - Task submission
- `http://<IP>/api/security` - Security operations
- `http://<IP>/api/development` - Development tasks
- `http://<IP>/api/cicd` - CI/CD operations

## 🔄 Autonomous Loop

```
Wazuh Alert → Security Master → Analyze → Self-Eval Gate →
  Development Master → Implement Fix → CI/CD Master →
    Update Manifest → Git Push → Flux Deploys →
      Validate → RLHF Feedback → Learn
```

## 📝 Quick Commands

```bash
# View all Cortex components
kubectl get all -n cortex-system

# Watch pods
kubectl get pods -n cortex-system -w

# Logs (live)
kubectl logs -n cortex-system deployment/coordinator-master -f

# Submit task (via API)
curl -X POST http://<dashboard-ip>/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"security_scan","priority":"high"}'

# Flux status
flux get sources git
flux reconcile source git cortex-repo
```

## 🐛 Common Issues

**Problem**: NFS PVC stuck in Pending
```bash
# Check NFS server
ssh root@10.88.140.164 "pct exec 105 -- systemctl status nfs-server"
```

**Problem**: Masters not starting
```bash
# Check events
kubectl describe pod -n cortex-system <pod-name>
```

**Problem**: Wazuh agents not connecting
```bash
# Test connectivity
kubectl exec -n cortex-system <wazuh-agent-pod> -- curl -k https://10.88.140.202:55000
```

**Problem**: Flux not syncing
```bash
# Force reconciliation
flux reconcile source git cortex-repo
flux reconcile kustomization cortex-system
```

## 📁 File Structure

```
k8s/cortex-k3s/
├── README.md                       # Full documentation
├── kustomization.yaml              # Kustomize config
├── 00-namespace.yaml               # Namespace + RBAC
├── 01-secrets.yaml                 # Credentials
├── 02-storage.yaml                 # NFS StorageClass + PVC
├── 03-coordinator-master.yaml      # Coordinator Deployment
├── 04-security-master.yaml         # Security Deployment
├── 05-development-master.yaml      # Development Deployment
├── 06-cicd-master.yaml             # CI/CD Deployment
├── 07-wazuh-integration.yaml       # Wazuh DaemonSet
├── 08-worker-job-template.yaml     # Worker Job template
├── 09-dashboard-ingress.yaml       # Dashboard + Ingress
└── 10-flux-gitops.yaml             # Flux config

scripts/
├── deploy-to-k3s.sh                # Automated deployment
└── validate-k3s-deployment.sh      # Post-deployment validation
```

## 🎓 Next Steps

1. ✅ Deploy with `./scripts/deploy-to-k3s.sh`
2. ✅ Validate with `./scripts/validate-k3s-deployment.sh`
3. ✅ Access dashboard at LoadBalancer IP
4. ✅ Submit test task via API or UI
5. ✅ Check Wazuh for agent connections
6. ✅ Watch Flux auto-deploy a change

## 📚 Full Documentation

- **Detailed Guide**: [k8s/cortex-k3s/README.md](k8s/cortex-k3s/README.md)
- **Architecture**: [docs/master-worker-architecture.md](docs/master-worker-architecture.md)
- **RLHF System**: [CORTEX-EVOLUTION-COMPLETE.md](CORTEX-EVOLUTION-COMPLETE.md)

---

**Status**: Ready to Deploy
**Autonomy**: Full
**Monitoring**: Wazuh + K8s
**GitOps**: Flux CD
