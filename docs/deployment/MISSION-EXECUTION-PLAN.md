# K3s Auto-Scaling Deployment - Mission Execution Plan

**Mission ID**: k3s-autoscaling-deployment-001
**Status**: READY FOR EXECUTION
**Created**: 2025-12-07
**Coordinator**: Cortex Coordinator Master

## Mission Overview

Deploy a production-ready, auto-scaling Cortex system on K3s Kubernetes cluster running on Proxmox infrastructure with complete observability, security hardening, and CI/CD automation.

## Success Criteria

1. ✅ K3s cluster running on Proxmox VMs (110, 111, 112)
2. ✅ Cortex masters deployed (1 replica each, stateful)
3. ✅ Cortex workers auto-scaling (0-50 replicas based on queue depth)
4. ✅ Prometheus collecting metrics with /metrics endpoint
5. ✅ Grafana dashboards showing real-time scaling
6. ✅ KEDA scaling workers based on task queue depth
7. ✅ Scale-to-zero working when idle
8. ✅ Complete documentation and runbooks
9. ✅ Security hardening implemented
10. ✅ One-command deployment working

## Deliverables Summary

| Category | Count | Status |
|----------|-------|--------|
| Scripts | 14 | Specified |
| K8s Manifests | 35 | Specified |
| Documentation | 14 | Specified |
| Code Changes | 3 | Specified |
| Dashboards | 3 | Specified |
| CI/CD Workflows | 3 | Specified |
| Coordination Files | 8 | Created |
| **TOTAL** | **80 files** | **Ready** |

## Master Allocation

| Master | Workload | Phases | Tasks | Confidence |
|--------|----------|--------|-------|------------|
| Development | 70% | 1,2,3,4,5 | 21 tasks | 0.94 |
| Security | 10% | 5 | 5 tasks | 0.98 |
| CI/CD | 10% | 5 | 4 tasks | 0.95 |
| Coordinator | 10% | All | Orchestration | 1.00 |

## Execution Phases

### Phase 1: Infrastructure Deployment ⏳

**Duration**: 1-2 hours
**Master**: Development
**Dependencies**: None
**Handoff**: `coord-to-dev-infra-phase1.json`

#### Tasks

1. **infra-001**: Create Proxmox VM creation and management scripts
   - `scripts/proxmox/create-vm.sh`
   - `scripts/proxmox/configure-network.sh`
   - `scripts/proxmox/cloud-init-template.yaml`

2. **infra-002**: Create K3s cluster installation automation
   - `scripts/k3s/install-control-plane.sh`
   - `scripts/k3s/join-worker.sh`
   - `scripts/k3s/verify-cluster.sh`

3. **infra-003**: Create orchestration script for VM deployment
   - `scripts/deploy/bootstrap-k3s-cluster.sh`

#### Validation

- [ ] 3 VMs created on Proxmox (110, 111, 112)
- [ ] K3s cluster running with 3 nodes Ready
- [ ] kubectl access configured from control plane
- [ ] All nodes show status Ready
- [ ] CoreDNS pods running

#### Estimated Token Usage

~15,000 tokens (script generation + testing)

---

### Phase 2: Monitoring & Metrics Implementation ⏳

**Duration**: 1-2 hours
**Master**: Development
**Dependencies**: Phase 1 complete
**Handoff**: `coord-to-dev-metrics-phase2.json`

#### Tasks

1. **metrics-001**: Implement Cortex /metrics endpoint with Prometheus exporter
   - `dashboard/server/metrics-exporter.js`
   - `lib/observability/prometheus-metrics.sh`
   - `docs/monitoring/metrics-schema.md`
   - **Metrics**: cortex_task_queue_depth, cortex_active_workers, cortex_master_health, etc.

2. **metrics-002**: Deploy Prometheus stack on K3s
   - `k8s/monitoring/prometheus-deployment.yaml`
   - `k8s/monitoring/prometheus-config.yaml`
   - `k8s/monitoring/prometheus-rbac.yaml`
   - `k8s/monitoring/servicemonitor-cortex.yaml`

3. **metrics-003**: Deploy Grafana with pre-configured dashboards
   - `k8s/monitoring/grafana-deployment.yaml`
   - `k8s/monitoring/grafana-dashboards-configmap.yaml`
   - `dashboards/grafana/cortex-autoscaling.json`
   - `dashboards/grafana/cortex-masters.json`
   - `dashboards/grafana/cortex-workers.json`

#### Validation

- [ ] Cortex /metrics endpoint responding (curl http://cortex:3000/metrics)
- [ ] All custom metrics present in output
- [ ] Prometheus scraping Cortex targets successfully
- [ ] Prometheus UI shows cortex targets as UP
- [ ] Grafana accessible at http://10.88.140.152:30002
- [ ] Dashboards load without errors
- [ ] Graphs display real data from Prometheus

#### Estimated Token Usage

~25,000 tokens (metrics implementation + K8s manifests + dashboards)

---

### Phase 3: Auto-Scaling Configuration ⏳

**Duration**: 1-2 hours
**Master**: Development
**Dependencies**: Phase 2 complete
**Handoff**: `coord-to-dev-scaling-phase3.json`

#### Tasks

1. **scaling-001**: Install and configure KEDA operator
   - `k8s/keda/keda-install.sh`
   - `k8s/keda/keda-config.yaml`

2. **scaling-002**: Create worker deployment manifests
   - `k8s/workers/implementation-worker-deployment.yaml`
   - `k8s/workers/security-worker-deployment.yaml`
   - `k8s/workers/analysis-worker-deployment.yaml`
   - `k8s/workers/scan-worker-deployment.yaml`

3. **scaling-003**: Create KEDA ScaledObjects for queue-based scaling
   - `k8s/keda/scaledobject-implementation.yaml`
   - `k8s/keda/scaledobject-security.yaml`
   - `k8s/keda/scaledobject-analysis.yaml`
   - `k8s/keda/scaledobject-scan.yaml`

4. **scaling-004**: Create master StatefulSet manifests
   - `k8s/masters/coordinator-statefulset.yaml`
   - `k8s/masters/development-statefulset.yaml`
   - `k8s/masters/security-statefulset.yaml`
   - `k8s/masters/cicd-statefulset.yaml`
   - `k8s/masters/inventory-statefulset.yaml`

5. **scaling-005**: Create shared PVC for coordination files
   - `k8s/storage/coordination-pvc.yaml`
   - `k8s/storage/nfs-provisioner.yaml`
   - `docs/deployment/storage-options.md`

#### Validation

- [ ] KEDA operator running in keda namespace
- [ ] KEDA metrics server healthy
- [ ] Worker deployments created with 0 replicas
- [ ] ScaledObjects created and showing READY status
- [ ] Master StatefulSets created with 1/1 ready
- [ ] Shared coordination PVC bound and mounted
- [ ] kubectl get scaledobjects shows all 4 workers
- [ ] kubectl get hpa shows KEDA-managed HPAs

#### Estimated Token Usage

~30,000 tokens (K8s manifests + KEDA configuration + storage setup)

---

### Phase 4: Cortex Deployment & Validation ⏳

**Duration**: 1 hour
**Master**: Development
**Dependencies**: Phase 3 complete
**Handoff**: `coord-to-dev-deployment-phase4.json`

#### Tasks

1. **deploy-001**: Create deployment orchestration script
   - `scripts/deploy/deploy-cortex-k3s.sh`
   - `scripts/deploy/create-secrets.sh`

2. **deploy-002**: Implement auto-scaling validation tests
   - `scripts/deploy/test-autoscaling.sh`
   - `scripts/deploy/smoke-tests.sh`

3. **deploy-003**: Create monitoring and observability integration
   - `scripts/deploy/setup-grafana-datasource.sh`
   - `docs/deployment/access-urls.md`

#### Validation

- [ ] All master pods Running (1/1 ready)
- [ ] Worker deployments at 0/0 (scaled to zero)
- [ ] Prometheus targets show all cortex pods as UP
- [ ] Grafana dashboards load with real data
- [ ] Auto-scaling test completes successfully
  - [ ] Add task to queue
  - [ ] Workers scale up from 0 to N
  - [ ] Task completed
  - [ ] Workers scale down to 0 after cooldown
- [ ] Smoke tests pass (exit code 0)
- [ ] Metrics show correct values in Prometheus

#### Estimated Token Usage

~20,000 tokens (deployment scripts + testing + validation)

---

### Phase 5: Security, Documentation, CI/CD (PARALLEL) ⏳

**Duration**: 2 hours
**Masters**: Security, Development, CI/CD (parallel execution)
**Dependencies**: Phase 4 complete
**Handoffs**: 3 parallel handoffs

#### Track 1: Security Hardening (security-master)

**Handoff**: `coord-to-security-hardening-phase5.json`

1. **security-001**: Implement Kubernetes RBAC policies
   - `k8s/security/rbac.yaml`
   - `k8s/security/pod-security-standards.yaml`

2. **security-002**: Implement network policies
   - `k8s/security/network-policies.yaml`

3. **security-003**: Container image security scanning
   - `security/reports/cortex-docker-image-scan.md`

4. **security-004**: Secrets management audit
   - `docs/security/secrets-management.md`
   - `k8s/security/sealed-secrets-setup.yaml`

5. **security-005**: Create security audit checklist
   - `docs/security/security-audit-checklist.md`

**Validation**:
- [ ] RBAC policies applied and tested
- [ ] Network policies block unauthorized traffic
- [ ] Pod security standards enforced
- [ ] Container scan shows no critical CVEs
- [ ] Secrets encrypted or Sealed Secrets used

**Estimated Tokens**: ~15,000

#### Track 2: Documentation (development-master)

**Handoff**: `coord-to-dev-documentation-phase5.json`

1. **docs-001**: Create deployment guide and architecture documentation
   - `docs/deployment/k3s-autoscaling-deployment-guide.md`
   - `docs/deployment/k3s-autoscaling-architecture.md` ✅ (already created)
   - `docs/deployment/scaling-behavior.md`

2. **docs-002**: Create operational runbooks
   - `docs/runbooks/troubleshooting-guide.md`
   - `docs/runbooks/disaster-recovery.md`
   - `docs/runbooks/maintenance-procedures.md`

3. **docs-003**: Create monitoring and alerting documentation
   - `docs/monitoring/grafana-dashboards-guide.md`
   - `docs/monitoring/prometheus-queries.md`
   - `docs/monitoring/alerting-setup.md`

**Validation**:
- [ ] Deployment guide tested by following steps exactly
- [ ] Architecture diagram accurate
- [ ] Troubleshooting guide covers common issues
- [ ] Runbooks reference correct commands
- [ ] Monitoring docs include working PromQL queries

**Estimated Tokens**: ~20,000

#### Track 3: CI/CD Pipeline (cicd-master)

**Handoff**: `coord-to-cicd-pipeline-phase5.json`

1. **cicd-001**: Create GitHub Actions workflow for K8s deployment
   - `.github/workflows/k8s-deploy.yml`
   - `.github/workflows/k8s-staging.yml`

2. **cicd-002**: Implement blue/green deployment strategy
   - `scripts/deploy/blue-green-deploy.sh`
   - `k8s/deployment-strategies/blue-green-service.yaml`

3. **cicd-003**: Create automated testing pipeline
   - `scripts/test/integration-tests.sh`
   - `scripts/test/performance-tests.sh`
   - `.github/workflows/integration-tests.yml`

4. **cicd-004**: Create rollback and disaster recovery automation
   - `scripts/deploy/rollback.sh`
   - `scripts/deploy/backup-coordination-state.sh`
   - `k8s/cronjobs/backup-cronjob.yaml`

**Validation**:
- [ ] GitHub Actions workflow successfully deploys to K3s
- [ ] Smoke tests run automatically after deployment
- [ ] Rollback script successfully reverts to previous version
- [ ] Blue/green deployment switches without downtime
- [ ] Integration tests pass in CI
- [ ] Backup CronJob runs successfully

**Estimated Tokens**: ~25,000

---

## Token Budget Management

| Phase | Estimated Tokens | Cumulative | % of Budget |
|-------|------------------|------------|-------------|
| Phase 1 | 15,000 | 15,000 | 7.5% |
| Phase 2 | 25,000 | 40,000 | 20% |
| Phase 3 | 30,000 | 70,000 | 35% |
| Phase 4 | 20,000 | 90,000 | 45% |
| Phase 5 | 60,000 | 150,000 | 75% |
| **Total Estimated** | **150,000** | - | **75%** |
| **Buffer** | **50,000** | - | **25%** |
| **Total Budget** | **200,000** | - | **100%** |

## Execution Commands

### 1. Initialize Mission

```bash
# Coordinator Master picks up mission
cd /Users/ryandahlberg/Projects/cortex
cat coordination/tasks/k3s-autoscaling-deployment-master.json

# Review handoff files
ls -la coordination/masters/coordinator/handoffs/
```

### 2. Phase 1: Infrastructure

```bash
# Development Master picks up Phase 1 handoff
cat coordination/masters/coordinator/handoffs/coord-to-dev-infra-phase1.json

# Execute infrastructure tasks
# (Development master creates scripts and deploys VMs)
```

### 3. Phase 2: Monitoring

```bash
# Development Master picks up Phase 2 handoff
cat coordination/masters/coordinator/handoffs/coord-to-dev-metrics-phase2.json

# Execute monitoring tasks
# (Development master implements metrics and deploys Prometheus/Grafana)
```

### 4. Phase 3: Auto-Scaling

```bash
# Development Master picks up Phase 3 handoff
cat coordination/masters/coordinator/handoffs/coord-to-dev-scaling-phase3.json

# Execute auto-scaling tasks
# (Development master creates K8s manifests and KEDA configuration)
```

### 5. Phase 4: Deployment

```bash
# Development Master picks up Phase 4 handoff
cat coordination/masters/coordinator/handoffs/coord-to-dev-deployment-phase4.json

# Execute deployment tasks
# (Development master deploys Cortex and runs validation)
```

### 6. Phase 5: Parallel Execution

```bash
# Security Master picks up security handoff
cat coordination/masters/coordinator/handoffs/coord-to-security-hardening-phase5.json

# Development Master picks up docs handoff
cat coordination/masters/coordinator/handoffs/coord-to-dev-documentation-phase5.json

# CI/CD Master picks up pipeline handoff
cat coordination/masters/coordinator/handoffs/coord-to-cicd-pipeline-phase5.json

# All three execute in parallel
```

## Quick Start (One Command)

```bash
# Set required environment variables
export PROXMOX_TOKEN_VALUE="b8cc165f-0153-43bb-a48a-5d7459587ca7"
export ANTHROPIC_API_KEY="your-claude-api-key"

# Execute complete deployment
./scripts/deploy/bootstrap-k3s-cluster.sh

# This script will:
# 1. Create Proxmox VMs (110, 111, 112)
# 2. Install K3s cluster
# 3. Deploy Prometheus/Grafana
# 4. Deploy KEDA
# 5. Deploy Cortex masters and workers
# 6. Configure auto-scaling
# 7. Run validation tests
# 8. Print access URLs

# Expected duration: 30-45 minutes
```

## Access URLs (Post-Deployment)

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://10.88.140.152:30002 | admin / (from secret) |
| Prometheus | http://10.88.140.152:30003 | - |
| Cortex Dashboard | http://10.88.140.152:30001 | - |
| K3s API | https://10.88.140.152:6443 | (kubeconfig) |

## Monitoring Progress

```bash
# Check overall mission status
cat coordination/tasks/k3s-autoscaling-deployment-master.json | jq '.execution_phases'

# Check handoff status
ls -l coordination/masters/coordinator/handoffs/ | grep "k3s"

# Check pod status
kubectl get pods -n cortex --watch

# Check KEDA scaling
kubectl get scaledobjects -n cortex
kubectl get hpa -n cortex

# Check metrics
curl http://10.88.140.152:30001/metrics | grep cortex_

# View Grafana dashboards
open http://10.88.140.152:30002
```

## Rollback Procedures

### Full Rollback

```bash
# Delete all Cortex resources
kubectl delete namespace cortex

# Destroy VMs
./scripts/proxmox/destroy-vm.sh --vm-id 110
./scripts/proxmox/destroy-vm.sh --vm-id 111
./scripts/proxmox/destroy-vm.sh --vm-id 112
```

### Partial Rollback

```bash
# Rollback deployment
./scripts/deploy/rollback.sh --revision previous

# Restore coordination state
./scripts/deploy/restore-coordination-state.sh --backup latest
```

## Success Metrics

### Performance Targets

- **Time to Scale Up**: < 30 seconds (0 to 10 workers)
- **Time to Scale Down**: 5-8 minutes (10 to 0 workers)
- **Task Throughput**: 50-200 tasks/minute
- **Master Response Time**: < 100ms
- **Worker Spawn Time**: 10-20 seconds

### Cost Optimization

- **Idle State**: 0 workers (only 5 masters = ~2.5 CPU, ~5GB RAM)
- **Peak Load**: 200 workers (50 per type = ~50 CPU, ~100GB RAM)
- **Cost Savings**: ~95% reduction when idle

## Mission Completion Checklist

- [ ] Phase 1: Infrastructure deployed and validated
- [ ] Phase 2: Monitoring stack operational
- [ ] Phase 3: Auto-scaling configured and tested
- [ ] Phase 4: Cortex deployed and validated
- [ ] Phase 5: Security hardening complete
- [ ] Phase 5: Documentation complete
- [ ] Phase 5: CI/CD pipeline operational
- [ ] All 80 deliverables created
- [ ] All validation tests passing
- [ ] Performance benchmarks met
- [ ] Security audit passing
- [ ] One-command deployment working
- [ ] Final mission report generated

## Next Steps After Completion

1. **Load Testing**: Run extended load tests to validate scaling behavior
2. **Security Audit**: External security review
3. **Performance Tuning**: Optimize based on real-world usage
4. **Documentation Review**: User acceptance testing of docs
5. **Production Hardening**: Add AlertManager, backup automation
6. **Monitoring Enhancement**: Custom alerts and runbooks
7. **Cost Analysis**: Track actual costs vs. projections
8. **Team Training**: Train team on new architecture

## References

- **Mission Definition**: `coordination/tasks/k3s-autoscaling-deployment-master.json`
- **Architecture Diagram**: `docs/deployment/k3s-autoscaling-architecture.md`
- **File Tree**: `docs/deployment/k3s-deployment-file-tree.md`
- **Routing Decisions**: `coordination/masters/coordinator/knowledge-base/routing-decisions-k3s-mission.jsonl`
- **Handoff Files**: `coordination/masters/coordinator/handoffs/coord-to-*-phase*.json` (7 files)

---

**Mission Status**: READY FOR EXECUTION
**Coordinator**: Cortex Coordinator Master
**Estimated Duration**: 4-6 hours
**Estimated Token Usage**: 150,000 / 200,000 (75%)
**Total Deliverables**: 80 files
**Masters Involved**: 4 (Coordinator, Development, Security, CI/CD)

**Execute with**: `./scripts/deploy/bootstrap-k3s-cluster.sh`
