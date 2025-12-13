# Cortex on K3s - Autonomous AI Orchestration

**Full-stack deployment of Cortex to Kubernetes with Wazuh integration, GitOps, and complete autonomy.**

## 🎯 Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                PROXMOX pve01 (10.88.140.164)                 │
│                                                               │
│  ┌────────────┐         ┌───────────────────────────┐       │
│  │ VM 201     │         │ K3S CLUSTER               │       │
│  │ Wazuh      │◀────────│ VMs 310-312 (VLAN 145)    │       │
│  │            │ monitor │                           │       │
│  │ Dashboard  │         │ ┌───────────────────────┐ │       │
│  │ Manager    │         │ │ CORTEX MASTERS        │ │       │
│  │ API        │◀────────│─│ - Coordinator         │ │       │
│  └────────────┘  alerts │ │ - Security ◀──────────┼─┼───┐   │
│                         │ │ - Development         │ │   │   │
│                         │ │ - CI/CD               │ │   │   │
│                         │ └───────────────────────┘ │   │   │
│                         │                           │   │   │
│                         │ Worker Jobs (ephemeral)   │   │   │
│                         │ NFS Storage (CT 105)      │   │   │
│                         └───────────────────────────┘   │   │
│                                  │                       │   │
│  ┌───────────────────────────────┼───────────────────┐  │   │
│  │ LXC CONTAINERS                │                   │  │   │
│  │ CT 103: n8n ──────────────────┼───────────────────┼──┘   │
│  │ CT 104: claude-code-agent     │                   │      │
│  │ CT 105: nfs-server ◀───────────┘                  │      │
│  └───────────────────────────────────────────────────┘      │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ GITHUB: ry-ops/cortex                              │     │
│  │ Cortex commits → Flux watches → Auto-deploys       │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

## 📦 What Gets Deployed

### Cortex Control Plane
- **Coordinator Master**: Task routing, MoE orchestration
- **Security Master**: Wazuh integration, vulnerability management
- **Development Master**: Code changes, feature implementation
- **CI/CD Master**: Build, test, deploy automation

### Infrastructure
- **NFS Storage**: Shared coordination layer (CT 105)
- **Wazuh Agents**: DaemonSet monitoring all K3s nodes
- **Dashboard**: Web UI + API endpoints
- **GitOps (Flux)**: Continuous deployment from GitHub

### Autonomous Capabilities
- ✅ Self-evaluation gates (confidence thresholds)
- ✅ RLHF feedback collection
- ✅ Proactive security scanning
- ✅ Autonomous remediation (Wazuh → Cortex → Fix → Deploy)
- ✅ Self-modification via GitOps

## 🚀 Quick Start

### Prerequisites

1. **Environment variables:**
   ```bash
   export ANTHROPIC_API_KEY="your-api-key"
   export GITHUB_TOKEN="your-github-token"
   ```

2. **K3s cluster access:**
   - K3s Master: 10.88.145.180
   - SSH access configured
   - kubectl installed locally

3. **NFS server ready:**
   - CT 105 on Proxmox host
   - NFS exports configured

### Deploy (Single Command)

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-to-k3s.sh
```

**This script will:**
1. Fetch kubeconfig from K3s master
2. Create all secrets
3. Configure NFS storage
4. Deploy 4 Cortex masters
5. Deploy Wazuh agents
6. Set up dashboard + ingress
7. Install Flux GitOps (if available)

### Validate Deployment

```bash
./scripts/validate-k3s-deployment.sh
```

**Checks:**
- ✓ Cluster connectivity
- ✓ All masters running
- ✓ NFS PVC bound
- ✓ Wazuh agents deployed
- ✓ Dashboard accessible
- ✓ GitOps active

## 📋 Components

### Manifests (k8s/cortex-k3s/)

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | Namespace, ServiceAccount, RBAC |
| `01-secrets.yaml` | API keys, credentials, config |
| `02-storage.yaml` | NFS StorageClass + PVC |
| `03-coordinator-master.yaml` | Coordinator Deployment + Service |
| `04-security-master.yaml` | Security Master + Wazuh webhook |
| `05-development-master.yaml` | Development Master + git workspace |
| `06-cicd-master.yaml` | CI/CD Master + build cache |
| `07-wazuh-integration.yaml` | Wazuh DaemonSet + API client |
| `08-worker-job-template.yaml` | Template for worker Jobs |
| `09-dashboard-ingress.yaml` | Dashboard + Ingress |
| `10-flux-gitops.yaml` | Flux GitRepository + Kustomization |

### Scripts

| Script | Purpose |
|--------|---------|
| `deploy-to-k3s.sh` | Full deployment automation |
| `validate-k3s-deployment.sh` | Post-deployment validation |

## 🔐 Secrets Management

Secrets are managed via Kubernetes Secrets, populated from environment variables:

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-..."
export GITHUB_TOKEN="ghp_..."

# Optional (defaults provided)
export K3S_USER="cortex"
export KUBECONFIG_PATH="$HOME/.kube/cortex-k3s-config"
```

**Secrets stored:**
- Anthropic API key
- GitHub token
- Wazuh credentials
- Proxmox API token
- NFS mount info

## 🔄 GitOps Workflow

### Autonomous Self-Management

1. **Cortex detects issue** (via Wazuh alert or proactive scan)
2. **Security Master analyzes** and creates remediation task
3. **Development Master implements** fix
4. **CI/CD Master:**
   - Updates `k8s/cortex-k3s/*.yaml`
   - Commits to GitHub: `git push origin docker-container`
5. **Flux detects change** → applies to cluster
6. **Coordinator validates** deployment
7. **RLHF records** success/failure

### Manual Changes

```bash
# Edit a manifest
vim k8s/cortex-k3s/03-coordinator-master.yaml

# Commit and push
git add k8s/cortex-k3s/03-coordinator-master.yaml
git commit -m "feat: Increase coordinator replicas to 2"
git push

# Flux auto-deploys within 1 minute
kubectl get pods -n cortex-system -w
```

## 🔗 Access Points

### Dashboard
```bash
# Get LoadBalancer IP
kubectl get svc cortex-dashboard -n cortex-system
# Access at: http://<EXTERNAL-IP>
```

### APIs
- **Coordinator**: `http://<EXTERNAL-IP>/api/coordinator`
- **Security**: `http://<EXTERNAL-IP>/api/security`
- **Development**: `http://<EXTERNAL-IP>/api/development`
- **CI/CD**: `http://<EXTERNAL-IP>/api/cicd`

### Wazuh
- **Dashboard**: https://10.88.140.202
- **Credentials**: admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay

## 📊 Monitoring

### Logs
```bash
# Coordinator logs
kubectl logs -n cortex-system deployment/coordinator-master -f

# Security Master logs
kubectl logs -n cortex-system deployment/security-master -f

# All Cortex logs
kubectl logs -n cortex-system -l app.kubernetes.io/name=cortex -f --tail=100
```

### Status
```bash
# All Cortex components
kubectl get all -n cortex-system

# Worker Jobs (active)
kubectl get jobs -n cortex-system

# Wazuh agents
kubectl get pods -n cortex-system -l app=wazuh-agent
```

### Flux GitOps
```bash
# Flux status
flux get sources git
flux get kustomizations

# Force reconciliation
flux reconcile source git cortex-repo
```

## 🐛 Troubleshooting

### Masters not starting
```bash
# Check pod events
kubectl describe pod -n cortex-system <pod-name>

# Check NFS mount
kubectl get pvc -n cortex-system
```

### NFS issues
```bash
# Test NFS from K3s node
ssh cortex@10.88.145.180
showmount -e 10.88.140.164
```

### Wazuh agents not connecting
```bash
# Check agent logs
kubectl logs -n cortex-system daemonset/wazuh-agent

# Verify Wazuh manager reachable
kubectl exec -n cortex-system <wazuh-agent-pod> -- curl -k https://10.88.140.202:55000
```

### Flux not syncing
```bash
# Check Flux logs
kubectl logs -n flux-system deployment/source-controller
kubectl logs -n flux-system deployment/kustomize-controller

# Verify GitHub access
kubectl get secret -n flux-system github-credentials -o yaml
```

## 🔧 Configuration

### Scaling Masters

Edit replicas in deployment manifests:

```yaml
# k8s/cortex-k3s/03-coordinator-master.yaml
spec:
  replicas: 2  # Increase for HA
```

### Adjusting Resources

```yaml
resources:
  requests:
    cpu: 500m      # Minimum guaranteed
    memory: 1Gi
  limits:
    cpu: 2000m     # Maximum allowed
    memory: 4Gi
```

### Confidence Thresholds

Edit ConfigMap:

```yaml
# k8s/cortex-k3s/01-secrets.yaml
data:
  high-confidence-threshold: "0.80"
  auto-deploy-threshold: "0.90"
```

## 🎓 Next Steps

1. **Submit test task:**
   ```bash
   # Via dashboard or API
   curl -X POST http://<dashboard-ip>/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"type":"security_scan","repository":"ry-ops/cortex"}'
   ```

2. **Trigger Wazuh alert:**
   - Generate test alert in Wazuh
   - Watch Security Master create task
   - Observe autonomous remediation

3. **Test GitOps:**
   - Make change to manifest
   - Push to GitHub
   - Watch Flux auto-deploy

4. **Monitor autonomy:**
   - Check proactive scan results
   - Review RLHF feedback
   - Validate self-evaluation decisions

## 📚 References

- [Cortex Architecture](../../docs/master-worker-architecture.md)
- [RLHF System](../../CORTEX-EVOLUTION-COMPLETE.md)
- [Flux Documentation](https://fluxcd.io/docs/)
- [K3s Documentation](https://docs.k3s.io/)
- [Wazuh Documentation](https://documentation.wazuh.com/)

---

**Status**: Production Ready
**Deployment**: Automated
**Autonomy**: Full
**Monitoring**: Wazuh + K8s Metrics
**GitOps**: Flux CD

Generated by Cortex CI/CD Master
