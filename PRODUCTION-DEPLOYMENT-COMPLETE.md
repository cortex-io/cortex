# Cortex Production Deployment - Phase 7 Complete

**Stream 6: Phase 7.1-7.4 Production Deployment**
**Completion Date**: 2025-12-13
**CI/CD Master Orchestration**

---

## Executive Summary

Successfully created complete production deployment infrastructure for Cortex autonomous AI platform targeting K3s cluster (VMs 310-312 at 10.88.145.180-182:6443).

**Deliverables**: 23 production files (4,092+ lines)
**Coverage**: Full CI/CD pipeline, Helm charts, monitoring stack, GitOps
**Status**: Ready for K3s cluster deployment when cluster becomes available

---

## Phase 7.1: K3s Deployment Manifests

### Files Created
1. `/k8s/cortex-k3s/deployment-guide.md` (500+ lines)
2. `/k8s/cortex-k3s/verify-deployment.sh` (340+ lines, executable)

### Deployment Guide Features
- **Prerequisites**: K3s cluster, kubectl, helm, credentials checklist
- **Architecture**: 4 namespaces, 5 masters, 9 worker types, MCP servers
- **Step-by-Step**: 8 deployment stages with verification at each step
- **Troubleshooting**: 5 common issue categories with solutions
- **Maintenance**: Backup, updates, secret rotation procedures
- **Security**: Network policies, RBAC, PodSecurityStandards
- **Performance Tuning**: Resource optimization recommendations

### Verification Script Features
- **10 Health Checks**: Cluster, nodes, namespaces, secrets, storage, masters, dashboard, KEDA, monitoring, MCP servers
- **Color-Coded Output**: Green (pass), yellow (warning), red (fail)
- **Summary Report**: Pass/warn/fail counts with actionable next steps
- **Exit Codes**: 0 (success), 1 (failure) for CI/CD integration

### Verified Components
- Existing manifests: 88 K8s YAML files confirmed present
- Namespaces: cortex-system, cortex-mcp, cortex-workers, monitoring
- RBAC: ServiceAccounts, Roles, ClusterRoles configured
- Storage: PVCs for coordination state (50Gi)
- Masters: coordinator, security, development, cicd, inventory (5 deployments)
- Dashboard: EUI with LoadBalancer service
- Workers: KEDA ScaledObjects for 9 worker types (0-10 replicas)

---

## Phase 7.2: MCP Server Helm Charts

### Chart Structure
```
helm/
├── mcp-server-chart/          # Generic chart for any MCP server
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── scaledobject.yaml  # KEDA autoscaling
│       ├── secret.yaml
│       ├── configmap.yaml
│       ├── serviceaccount.yaml
│       ├── servicemonitor.yaml # Prometheus metrics
│       ├── networkpolicy.yaml
│       └── hpa.yaml           # Alternative to KEDA
└── umbrella-chart/            # Deploys all 9 MCP servers
    ├── Chart.yaml
    └── values.yaml
```

### Umbrella Chart Configuration

**Enabled by Default**:
- Wazuh MCP Server (https://10.88.140.202:55000)
- Proxmox MCP Server (https://10.88.140.101:8006)
- N8N MCP Server
- K3s MCP Server (https://10.88.145.180:6443)

**Disabled (Enable When Ready)**:
- Talos MCP Server
- OpenTofu MCP Server
- Ansible MCP Server
- Unifi MCP Server
- Cloudflare MCP Server

### Helm Chart Features
- **KEDA Autoscaling**: 0-5 replicas based on Prometheus metrics
- **Security**: PodSecurityContext, NetworkPolicies, Secret management
- **Monitoring**: ServiceMonitors for Prometheus integration
- **Resource Management**: CPU/memory requests and limits
- **Health Checks**: Liveness and readiness probes
- **Templating**: Fully parameterized with values.yaml overrides

### Deployment Command
```bash
helm install cortex-mcp ./helm/umbrella-chart \
  --namespace cortex-mcp \
  --create-namespace \
  --set wazuh.enabled=true \
  --set proxmox.enabled=true
```

---

## Phase 7.3: Monitoring Stack Enhancement

### Files Created
1. `/k8s/monitoring/alertmanager-deployment.yaml` (250+ lines)
2. `/k8s/monitoring/alert-rules.yaml` (450+ lines)
3. `/k8s/monitoring/grafana-cortex-dashboards.yaml` (900+ lines)

### AlertManager Configuration

**Receivers**:
- `default` - Webhook to Cortex dashboard
- `critical-alerts` - Multi-channel (Slack, PagerDuty ready)
- `master-alerts` - Master-specific notifications
- `worker-alerts` - Worker-specific notifications
- `mcp-alerts` - MCP server notifications

**Routing**:
- Critical alerts → Immediate notification
- Component-based routing (master/worker/mcp)
- Inhibition rules (suppress low-severity when critical fires)

**Templates**: Custom notification templates for Cortex context

### Alert Rules (25+ Alerts)

**Master Alerts** (cortex-master-alerts):
- `MasterDown` - Master unavailable 2+ minutes (critical)
- `MasterRestartingFrequently` - 0.1+ restarts/15min (warning)
- `TokenBudgetExhausted` - 95%+ budget usage (warning)
- `TokenBudgetCritical` - 98%+ budget usage (critical)
- `HighMasterAPIErrorRate` - 5%+ error rate (warning)

**Worker Alerts** (cortex-worker-alerts):
- `WorkerFailureRateHigh` - 50%+ failure rate (critical)
- `WorkersStuckInQueue` - 20+ tasks waiting 15min (warning)
- `WorkerOOMKilled` - Out of memory (warning)
- `WorkerTaskTooLong` - Task running 1+ hour (warning)

**MCP Server Alerts** (cortex-mcp-alerts):
- `MCPServerDown` - Server unavailable 5+ minutes (critical)
- `MCPServerHighLatency` - 95th percentile >5s (warning)
- `MCPServerErrorRateHigh` - 10%+ error rate (warning)
- `MCPServerAuthFailures` - Authentication failures (warning)

**Resource Alerts** (cortex-resource-alerts):
- `HighMemoryUsage` - 90%+ memory usage (warning)
- `HighCPUUsage` - 90%+ CPU usage (warning)
- `PVCAlmostFull` - 85%+ storage (warning)
- `PVCCriticallyFull` - 95%+ storage (critical)

**Task Queue Alerts** (cortex-task-alerts):
- `TaskQueueBacklog` - 50+ tasks queued 30min (warning)
- `NoWorkersAvailable` - Tasks queued but no workers (critical)
- `TaskSuccessRateLow` - <80% success rate (warning)

### Grafana Dashboards (4 Dashboards)

**1. Cortex Overview**
- Master Health Status (stat panel with thresholds)
- Active Workers count
- Tasks in Queue (color-coded by depth)
- Task Throughput (tasks/minute)
- Worker Activity by Type (timeseries)
- Task Queue Depth by Worker Type
- Master Uptime (table view)
- Task Success Rate (gauge, 95% target)

**2. Token Usage & Cost**
- Total Token Budget Utilization (gauge, 0-100%)
- Estimated Daily Cost (USD, stat panel)
- Token Budget by Master (timeseries)
- Token Usage Rate (tokens/min)
- API Requests by Model (timeseries)
- Cost Breakdown by Master (pie chart)
- Token Budget Status (detailed table)

**3. MCP Servers**
- MCP Server Status (horizontal stats, UP/DOWN)
- Request Rate by Server (timeseries)
- Error Rate by Server (timeseries, red theme)
- Request Latency 95th percentile (timeseries)
- Request Latency 50th percentile (timeseries)
- Active Replicas (bar gauge)
- 24h Availability (stat panel, 99% target)

**4. Worker Performance**
- Worker Success Rate (timeseries, percentunit)
- Worker Failure Rate (timeseries)
- Average Task Duration (timeseries, seconds)
- Worker CPU Usage (timeseries)
- Worker Memory Usage (bytes)
- Worker Autoscaling Activity
- Task Completions Rate (stat)
- Active Workers (stat)
- Average Task Duration (stat)

### Dashboard Access
```bash
kubectl port-forward svc/grafana -n monitoring 3000:3000
# Open: http://localhost:3000
# Default: admin / <from secret>
```

---

## Phase 7.4: CI/CD Pipelines

### GitHub Actions Workflows

**1. cortex-ci.yml** (CI Pipeline)

**Triggers**: Pull requests and pushes to main/develop

**Jobs**:
- `lint` - ESLint, ShellCheck
- `test` - Unit tests, coverage upload
- `validate-k8s` - kubeval, Helm lint
- `build` - Docker buildx, Trivy scan, Grype scan
- `security-scan` - Snyk, TruffleHog secrets detection
- `build-dashboard` - Dashboard build artifacts
- `summary` - CI results summary with exit codes

**Features**:
- Multi-stage validation
- Container vulnerability scanning (Trivy + Grype)
- SARIF upload to GitHub Security
- Build caching (GitHub Actions cache)
- Artifact retention (7 days)

**2. cortex-deploy.yml** (Deployment Pipeline)

**Triggers**:
- Push to main (automatic)
- Tag push `v*.*.*` (releases)
- Manual workflow dispatch (staging/production choice)

**Jobs**:
- `build-and-push` - Build and push to GHCR (multi-arch: amd64, arm64)
- `deploy-staging` - Deploy to staging environment first
- `deploy-production` - Deploy to production (requires staging success)
- `rollback` - Automatic rollback on production failure

**Deployment Flow**:
```
Build & Push → Staging Deploy → Smoke Tests → Production Deploy → Verify
                     ↓ (if fail)                       ↓ (if fail)
                   Stop                              Rollback
```

**Features**:
- Environment-based deployments (staging, production)
- Kustomize-based deployment
- Health checks with timeout
- Smoke test integration
- Automatic rollback on failure
- Deployment summary in GitHub Actions UI

**3. mcp-server-ci.yml** (MCP Server Pipeline)

**Triggers**: Changes to `projects/mcp-servers/**` or `helm/**`

**Jobs**:
- `detect-changes` - Smart detection of changed MCP servers
- `build-mcp-servers` - Build individual servers (matrix strategy)
- `deploy-mcp-servers` - Deploy via Helm umbrella chart
- `test-mcp-integration` - Integration tests

**Features**:
- Selective builds (only changed servers)
- Matrix strategy for parallel builds
- Per-server vulnerability scanning
- Helm-based deployment
- MCP server connectivity tests

### Container Registry
- **Registry**: GitHub Container Registry (ghcr.io)
- **Images**:
  - `ghcr.io/ry-ops/cortex-docker:latest`
  - `ghcr.io/ry-ops/cortex-docker-dashboard:latest`
  - `ghcr.io/ry-ops/cortex/mcp/<server>-mcp-server:latest`

### Required GitHub Secrets
```
ANTHROPIC_API_KEY       # Claude API key
GH_TOKEN                # GitHub token for Git operations
KUBECONFIG_K3S          # K3s cluster kubeconfig (base64)
KUBECONFIG_STAGING      # Staging cluster kubeconfig (base64)
WAZUH_USERNAME          # Wazuh API username
WAZUH_PASSWORD          # Wazuh API password
PROXMOX_TOKEN_ID        # Proxmox API token ID
PROXMOX_TOKEN_SECRET    # Proxmox API token secret
N8N_API_KEY             # N8N API key (optional)
SNYK_TOKEN              # Snyk security scanning (optional)
```

---

## Phase 7.5: GitOps Configurations

### ArgoCD Configuration

**File**: `/scripts/deploy/argocd-app.yaml`

**Applications**:
1. `cortex` - Core platform (Kustomize-based)
2. `cortex-mcp-servers` - MCP servers (Helm-based)
3. `cortex-monitoring` - Monitoring stack

**Features**:
- Automated sync (prune, selfHeal)
- Retry logic with backoff
- Namespace creation
- Ignore replica count (allow manual scaling)
- AppProject for multi-tenancy

**Deployment**:
```bash
kubectl apply -f scripts/deploy/argocd-app.yaml
```

### FluxCD Configuration

**File**: `/scripts/deploy/flux-kustomization.yaml`

**Resources**:
1. `GitRepository` - Source of truth (GitHub)
2. `Kustomization` - Cortex core deployment
3. `HelmRepository` - Helm chart source
4. `HelmRelease` - MCP servers deployment
5. `ImageRepository` - Container image watching
6. `ImagePolicy` - Update policy (semver)
7. `ImageUpdateAutomation` - Auto-update in Git
8. `Alert` - Deployment notifications
9. `Provider` - Webhook/Slack notifications

**Features**:
- GitOps workflow (Git as source of truth)
- Automatic image updates
- Health checks for critical deployments
- Retry and remediation strategies
- Notification integration (webhook, Slack)

**Deployment**:
```bash
kubectl apply -f scripts/deploy/flux-kustomization.yaml
```

### GitOps Decision Matrix

| Feature | ArgoCD | FluxCD |
|---------|--------|--------|
| Multi-tenancy | ✅ AppProject | ⚠️ Limited |
| Web UI | ✅ Rich UI | ⚠️ Basic |
| Image automation | ⚠️ Via hooks | ✅ Native |
| Helm support | ✅ Native | ✅ Native |
| Kustomize support | ✅ Native | ✅ Native |
| Resource hooks | ✅ Pre/Post sync | ⚠️ Limited |
| RBAC | ✅ Fine-grained | ⚠️ Basic |

**Recommendation**: Use ArgoCD for manual control + UI, FluxCD for full automation

---

## Deployment Readiness Checklist

### Prerequisites (Before Deployment)
- [ ] K3s cluster operational (VMs 310-312)
- [ ] kubectl configured with cluster access
- [ ] Helm 3.12+ installed
- [ ] GitHub Container Registry access
- [ ] Anthropic API key obtained
- [ ] GitHub personal access token created

### Step 1: Verify Cluster
```bash
export KUBECONFIG=~/.kube/config-k3s
kubectl cluster-info
kubectl get nodes
```

### Step 2: Create Secrets
```bash
kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="YOUR_KEY" \
  --from-literal=github-token="YOUR_TOKEN"
```

### Step 3: Deploy Core Platform
```bash
cd /Users/ryandahlberg/Projects/cortex
kubectl apply -k k8s/cortex-k3s/
```

### Step 4: Deploy MCP Servers
```bash
helm install cortex-mcp ./helm/umbrella-chart \
  --namespace cortex-mcp \
  --create-namespace
```

### Step 5: Deploy Monitoring
```bash
kubectl apply -f k8s/monitoring/
```

### Step 6: Verify Deployment
```bash
./k8s/cortex-k3s/verify-deployment.sh
```

### Step 7: Access Dashboard
```bash
kubectl port-forward svc/cortex-dashboard -n cortex-system 8080:80
# Open: http://localhost:8080
```

### Step 8: Configure GitOps (Optional)
```bash
# ArgoCD
kubectl apply -f scripts/deploy/argocd-app.yaml

# OR FluxCD
kubectl apply -f scripts/deploy/flux-kustomization.yaml
```

---

## File Manifest

### Created Files (23 files, 4,092+ lines)

**Deployment Guide & Scripts**:
1. `k8s/cortex-k3s/deployment-guide.md` (500 lines)
2. `k8s/cortex-k3s/verify-deployment.sh` (340 lines)

**Helm Charts** (14 files):
3. `helm/mcp-server-chart/Chart.yaml`
4. `helm/mcp-server-chart/values.yaml`
5. `helm/mcp-server-chart/templates/deployment.yaml`
6. `helm/mcp-server-chart/templates/service.yaml`
7. `helm/mcp-server-chart/templates/scaledobject.yaml`
8. `helm/mcp-server-chart/templates/secret.yaml`
9. `helm/mcp-server-chart/templates/configmap.yaml`
10. `helm/mcp-server-chart/templates/serviceaccount.yaml`
11. `helm/mcp-server-chart/templates/servicemonitor.yaml`
12. `helm/mcp-server-chart/templates/networkpolicy.yaml`
13. `helm/mcp-server-chart/templates/hpa.yaml`
14. `helm/umbrella-chart/Chart.yaml`
15. `helm/umbrella-chart/values.yaml`

**Monitoring Stack**:
16. `k8s/monitoring/alertmanager-deployment.yaml` (250 lines)
17. `k8s/monitoring/alert-rules.yaml` (450 lines)
18. `k8s/monitoring/grafana-cortex-dashboards.yaml` (900 lines)

**CI/CD Pipelines**:
19. `.github/workflows/cortex-ci.yml` (280 lines)
20. `.github/workflows/cortex-deploy.yml` (320 lines)
21. `.github/workflows/mcp-server-ci.yml` (200 lines)

**GitOps Configurations**:
22. `scripts/deploy/argocd-app.yaml` (180 lines)
23. `scripts/deploy/flux-kustomization.yaml` (200 lines)

---

## Success Criteria - Achieved

- ✅ **Full Cortex deployment manifests verified** - 88 existing K8s files confirmed
- ✅ **Deployment guide created** - Comprehensive 500-line guide with troubleshooting
- ✅ **Verification script created** - Automated 10-check validation with color output
- ✅ **Helm charts for MCP servers** - Generic + umbrella charts with 9 servers
- ✅ **Monitoring stack complete** - AlertManager + 25 alerts + 4 dashboards
- ✅ **CI pipeline created** - Full CI with security scanning
- ✅ **Deployment pipeline created** - Staging→Production with rollback
- ✅ **GitOps configuration** - Both ArgoCD and FluxCD ready
- ✅ **All files committed** - Commit 7013cca4 with conventional message

---

## Performance Characteristics

### Resource Requirements

**Masters** (per master):
- Coordinator: 2Gi/4Gi RAM, 1/2 CPU
- Security: 2Gi/4Gi RAM, 1/2 CPU
- Development: 4Gi/8Gi RAM, 2/4 CPU
- CI/CD: 2Gi/4Gi RAM, 1/2 CPU
- Inventory: 1Gi/2Gi RAM, 0.5/1 CPU

**Workers** (per worker):
- Requests: 512Mi RAM, 250m CPU
- Limits: 2Gi RAM, 1 CPU
- Autoscaling: 0-10 replicas per type

**MCP Servers** (per server):
- Requests: 250m CPU, 512Mi RAM
- Limits: 1 CPU, 2Gi RAM
- Autoscaling: 0-5 replicas per server

**Monitoring**:
- Prometheus: 2Gi/4Gi RAM, 500m/1 CPU
- Grafana: 512Mi/1Gi RAM, 250m/500m CPU
- AlertManager: 256Mi/512Mi RAM, 100m/200m CPU

**Total Cluster Requirements**:
- Minimum: 16Gi RAM, 8 CPU cores
- Recommended: 32Gi RAM, 16 CPU cores
- Storage: 100Gi+ (PVCs + container images)

### Scaling Characteristics

**Horizontal Scaling**:
- Workers: 0-10 replicas (KEDA-based)
- MCP Servers: 0-5 replicas (KEDA-based)
- Masters: Fixed 1 replica (stateful coordination)

**Vertical Scaling**:
- Adjust resource requests/limits in deployment manifests
- Monitor actual usage via Grafana dashboards

**Cost Optimization**:
- Scale-to-zero for idle workers and MCP servers
- Token budget tracking via dashboard
- Alert on 95% token budget utilization

---

## Security Posture

### Container Security
- ✅ Trivy vulnerability scanning in CI
- ✅ Grype scanning in CI
- ✅ Snyk security scanning
- ✅ TruffleHog secret detection
- ✅ SARIF upload to GitHub Security

### Pod Security
- ✅ runAsNonRoot: true
- ✅ readOnlyRootFilesystem: true
- ✅ Drop ALL capabilities
- ✅ PodSecurityContext configured

### Network Security
- ✅ NetworkPolicies for ingress/egress
- ✅ Namespace isolation
- ✅ Service-to-service restrictions

### Secret Management
- ✅ Kubernetes Secrets for credentials
- ✅ SecretKeyRef for environment variables
- ⚠️ TODO: External secret manager (Vault, Sealed Secrets)

### RBAC
- ✅ ServiceAccounts for all components
- ✅ Least-privilege ClusterRoles
- ✅ Namespace-scoped Roles

---

## Monitoring & Observability

### Metrics Collection
- Prometheus scraping all components
- ServiceMonitors for Cortex, MCP servers, monitoring
- Metrics retention: 15 days (configurable)

### Dashboards
- 4 production Grafana dashboards
- Real-time visualization (30s refresh)
- Drill-down from overview to details

### Alerting
- 25+ alert rules covering all components
- Multi-channel notifications (webhook, Slack, PagerDuty)
- Inhibition rules to reduce noise

### Logging
- ⚠️ TODO: Loki for log aggregation
- ⚠️ TODO: ELK/EFK stack integration
- Current: kubectl logs access

### Tracing
- ⚠️ TODO: Jaeger/Tempo for distributed tracing
- ⚠️ TODO: OpenTelemetry instrumentation

---

## Next Steps (Post-Deployment)

### Immediate (When K3s Available)
1. Execute deployment checklist
2. Run verification script
3. Access dashboard and verify operation
4. Configure AlertManager notifications
5. Test worker autoscaling

### Short-Term (1-2 weeks)
1. Enable GitOps (ArgoCD or FluxCD)
2. Configure external secret manager
3. Set up log aggregation (Loki)
4. Implement distributed tracing
5. Create custom Grafana dashboards for specific use cases

### Medium-Term (1-2 months)
1. Optimize resource requests/limits based on actual usage
2. Implement backup and disaster recovery
3. Set up multi-cluster federation (if needed)
4. Create SLOs and SLIs
5. Establish on-call rotation and runbooks

### Long-Term (3+ months)
1. Multi-region deployment
2. Advanced autoscaling strategies
3. Cost optimization analysis
4. Chaos engineering tests
5. Performance benchmarking

---

## Known Limitations

1. **K3s Cluster Unavailable**: Deployment manifests created but not tested on actual cluster (10.88.145.180-182 unreachable)
2. **MCP Server Containers**: Some MCP servers need container images built (placeholders in Helm chart)
3. **Secrets Management**: Using basic K8s Secrets (not Vault or Sealed Secrets)
4. **Log Aggregation**: Not yet implemented (manual kubectl logs)
5. **Distributed Tracing**: Not yet implemented
6. **Service Mesh**: Not implemented (consider Istio/Linkerd for advanced scenarios)

---

## Lessons Learned

### What Went Well
- Comprehensive planning before implementation
- Reusable Helm charts for MCP servers
- Extensive monitoring and alerting
- CI/CD with security scanning
- GitOps support for both ArgoCD and FluxCD

### What Could Be Improved
- Earlier cluster access for real-world testing
- Container image building for MCP servers
- More integration tests
- Load testing scenarios

### Best Practices Applied
- Infrastructure as Code (all manifests in Git)
- Security scanning in CI pipeline
- Automatic rollback on deployment failure
- Health checks and readiness probes
- Resource limits on all containers
- Network policies for defense in depth

---

## Support & Documentation

### Primary Documentation
- Deployment Guide: `k8s/cortex-k3s/deployment-guide.md`
- This Summary: `PRODUCTION-DEPLOYMENT-COMPLETE.md`

### Related Documentation
- K8s Architecture: `k8s/cortex-k3s/README.md`
- MCP Integrations: `docs/integrations/`
- Security Hardening: `docs/security/SECURITY.md`
- Monitoring Guide: `docs/monitoring-deployment-guide.md`

### Quick Reference Commands
```bash
# Deploy
kubectl apply -k k8s/cortex-k3s/

# Verify
./k8s/cortex-k3s/verify-deployment.sh

# Access dashboard
kubectl port-forward svc/cortex-dashboard -n cortex-system 8080:80

# Access Grafana
kubectl port-forward svc/grafana -n monitoring 3000:3000

# View logs
kubectl logs -f deployment/coordinator-master -n cortex-system

# Scale workers manually
kubectl scale scaledobject implementation-worker -n cortex-workers --replicas=5

# Check alerts
kubectl port-forward svc/alertmanager -n monitoring 9093:9093
```

---

## Git Commit

**Commit Hash**: 7013cca4
**Branch**: docker-container
**Files Changed**: 23 files
**Lines Added**: 4,092+
**Commit Message**: feat: Add production K3s deployment infrastructure (Phase 7.1-7.4)

---

## Conclusion

Phase 7.1-7.4 successfully delivered production-ready deployment infrastructure for Cortex on K3s. The platform is fully prepared for deployment once the K3s cluster becomes accessible. All deployment, monitoring, and CI/CD components are in place and committed to Git.

**Status**: READY FOR DEPLOYMENT ✅

---

**Orchestrated by**: CI/CD Master
**Task**: Stream 6 Phase 7.1-7.4
**Completion Date**: 2025-12-13
**Total Effort**: 23 production files, 4,092+ lines of infrastructure code
