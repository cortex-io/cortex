# K3s Auto-Scaling Deployment - Complete File Tree

**Mission**: k3s-autoscaling-deployment-001
**Created**: 2025-12-07
**Status**: In Progress

## Overview

This document provides a complete file tree of all deliverables for the Cortex K3s auto-scaling deployment mission. Files are organized by phase and master responsibility.

## Directory Structure

```
cortex/
├── scripts/
│   ├── proxmox/
│   │   ├── create-vm.sh                          # Create VMs via Proxmox API
│   │   ├── configure-network.sh                  # Network configuration for /27 subnet
│   │   └── cloud-init-template.yaml              # Cloud-init for VM initialization
│   │
│   ├── k3s/
│   │   ├── install-control-plane.sh              # Install K3s control plane on VM 110
│   │   ├── join-worker.sh                        # Join worker nodes to cluster
│   │   └── verify-cluster.sh                     # Verify K3s cluster health
│   │
│   ├── deploy/
│   │   ├── bootstrap-k3s-cluster.sh              # END-TO-END: One-command deployment
│   │   ├── deploy-cortex-k3s.sh                  # Deploy Cortex to existing K3s cluster
│   │   ├── create-secrets.sh                     # Create K8s secrets from env
│   │   ├── blue-green-deploy.sh                  # Blue/green deployment orchestration
│   │   ├── rollback.sh                           # Automated rollback script
│   │   ├── backup-coordination-state.sh          # Backup coordination PVC
│   │   ├── setup-grafana-datasource.sh           # Configure Grafana via API
│   │   ├── smoke-tests.sh                        # Basic health checks
│   │   └── test-autoscaling.sh                   # E2E auto-scaling validation
│   │
│   └── test/
│       ├── integration-tests.sh                  # Integration test suite
│       └── performance-tests.sh                  # Load and performance testing
│
├── k8s/
│   ├── namespace.yaml                            # cortex namespace (existing)
│   ├── configmap.yaml                            # Environment configuration (existing)
│   ├── service.yaml                              # Service definitions (existing)
│   ├── ingress.yaml                              # Ingress configuration (existing)
│   ├── serviceaccount.yaml                       # Service accounts (existing)
│   │
│   ├── masters/
│   │   ├── coordinator-statefulset.yaml          # Coordinator master (1 replica)
│   │   ├── development-statefulset.yaml          # Development master (1 replica)
│   │   ├── security-statefulset.yaml             # Security master (1 replica)
│   │   ├── cicd-statefulset.yaml                 # CI/CD master (1 replica)
│   │   └── inventory-statefulset.yaml            # Inventory master (1 replica)
│   │
│   ├── workers/
│   │   ├── implementation-worker-deployment.yaml # Implementation workers (0-50 replicas)
│   │   ├── security-worker-deployment.yaml       # Security workers (0-50 replicas)
│   │   ├── analysis-worker-deployment.yaml       # Analysis workers (0-50 replicas)
│   │   └── scan-worker-deployment.yaml           # Scan workers (0-50 replicas)
│   │
│   ├── keda/
│   │   ├── keda-install.sh                       # KEDA installation script (Helm)
│   │   ├── keda-config.yaml                      # KEDA operator configuration
│   │   ├── scaledobject-implementation.yaml      # ScaledObject for impl workers
│   │   ├── scaledobject-security.yaml            # ScaledObject for security workers
│   │   ├── scaledobject-analysis.yaml            # ScaledObject for analysis workers
│   │   └── scaledobject-scan.yaml                # ScaledObject for scan workers
│   │
│   ├── monitoring/
│   │   ├── prometheus-deployment.yaml            # Prometheus deployment
│   │   ├── prometheus-config.yaml                # Prometheus configuration
│   │   ├── prometheus-rbac.yaml                  # RBAC for Prometheus
│   │   ├── servicemonitor-cortex.yaml            # ServiceMonitor for Cortex
│   │   ├── grafana-deployment.yaml               # Grafana deployment
│   │   └── grafana-dashboards-configmap.yaml     # Dashboards as ConfigMap
│   │
│   ├── storage/
│   │   ├── coordination-pvc.yaml                 # Shared PVC for coordination (RWX)
│   │   ├── nfs-provisioner.yaml                  # NFS provisioner (if needed)
│   │   └── pvc.yaml                              # Other PVCs (existing)
│   │
│   ├── security/
│   │   ├── rbac.yaml                             # RBAC policies for masters/workers
│   │   ├── network-policies.yaml                 # Network segmentation
│   │   ├── pod-security-standards.yaml           # Pod Security Standards enforcement
│   │   └── sealed-secrets-setup.yaml             # Sealed Secrets (optional)
│   │
│   ├── deployment-strategies/
│   │   └── blue-green-service.yaml               # Blue/green service configuration
│   │
│   └── cronjobs/
│       └── backup-cronjob.yaml                   # Daily backup CronJob
│
├── dashboard/
│   └── server/
│       ├── metrics-exporter.js                   # NEW: Prometheus metrics exporter
│       └── index.js                              # Existing dashboard server (modified)
│
├── lib/
│   └── observability/
│       └── prometheus-metrics.sh                 # NEW: Bash metrics library
│
├── dashboards/
│   └── grafana/
│       ├── cortex-autoscaling.json               # Auto-scaling dashboard
│       ├── cortex-masters.json                   # Masters status dashboard
│       └── cortex-workers.json                   # Workers performance dashboard
│
├── docs/
│   ├── deployment/
│   │   ├── k3s-autoscaling-architecture.md       # THIS FILE: Architecture overview
│   │   ├── k3s-deployment-file-tree.md           # THIS FILE: Complete file tree
│   │   ├── k3s-autoscaling-deployment-guide.md   # Step-by-step deployment guide
│   │   ├── access-urls.md                        # Access URLs and credentials
│   │   └── scaling-behavior.md                   # Auto-scaling behavior details
│   │
│   ├── runbooks/
│   │   ├── troubleshooting-guide.md              # Troubleshooting procedures
│   │   ├── disaster-recovery.md                  # DR procedures
│   │   └── maintenance-procedures.md             # Routine maintenance
│   │
│   ├── monitoring/
│   │   ├── grafana-dashboards-guide.md           # Dashboard usage guide
│   │   ├── prometheus-queries.md                 # Useful PromQL queries
│   │   ├── alerting-setup.md                     # Alerting configuration
│   │   └── metrics-schema.md                     # Complete metrics documentation
│   │
│   └── security/
│       ├── secrets-management.md                 # Secrets management strategy
│       └── security-audit-checklist.md           # Security audit checklist
│
├── security/
│   └── reports/
│       └── cortex-docker-image-scan.md           # Container vulnerability scan
│
├── .github/
│   └── workflows/
│       ├── k8s-deploy.yml                        # Production deployment workflow
│       ├── k8s-staging.yml                       # Staging deployment workflow
│       └── integration-tests.yml                 # Automated testing workflow
│
└── coordination/
    ├── tasks/
    │   └── k3s-autoscaling-deployment-master.json    # Mission definition
    │
    └── masters/
        └── coordinator/
            └── handoffs/
                ├── coord-to-dev-infra-phase1.json         # Phase 1: Infrastructure
                ├── coord-to-dev-metrics-phase2.json       # Phase 2: Metrics
                ├── coord-to-dev-scaling-phase3.json       # Phase 3: Auto-scaling
                ├── coord-to-dev-deployment-phase4.json    # Phase 4: Deployment
                ├── coord-to-security-hardening-phase5.json # Phase 5: Security
                ├── coord-to-dev-documentation-phase5.json  # Phase 5: Docs
                └── coord-to-cicd-pipeline-phase5.json      # Phase 5: CI/CD
```

## File Counts by Category

### Scripts (14 files)

| Category | Count | Purpose |
|----------|-------|---------|
| Proxmox | 3 | VM creation and network configuration |
| K3s | 3 | Cluster installation and verification |
| Deployment | 8 | Deployment orchestration and testing |

### Kubernetes Manifests (35 files)

| Category | Count | Purpose |
|----------|-------|---------|
| Masters | 5 | StatefulSets for Cortex masters |
| Workers | 4 | Deployments for auto-scaling workers |
| KEDA | 6 | KEDA operator and ScaledObjects |
| Monitoring | 6 | Prometheus and Grafana stack |
| Storage | 3 | PVCs for coordination and data |
| Security | 4 | RBAC, network policies, PSS |
| Other | 7 | Namespace, services, CronJobs, etc. |

### Documentation (14 files)

| Category | Count | Purpose |
|----------|-------|---------|
| Deployment | 5 | Guides and architecture docs |
| Runbooks | 3 | Operational procedures |
| Monitoring | 4 | Dashboard and metrics docs |
| Security | 2 | Security policies and audits |

### Code Modifications (3 files)

| File | Type | Changes |
|------|------|---------|
| dashboard/server/metrics-exporter.js | NEW | Prometheus metrics endpoint |
| dashboard/server/index.js | MODIFIED | Add metrics route |
| lib/observability/prometheus-metrics.sh | NEW | Bash metrics library |

### Dashboards (3 files)

| Dashboard | Purpose |
|-----------|---------|
| cortex-autoscaling.json | Real-time scaling visualization |
| cortex-masters.json | Master health and MoE routing |
| cortex-workers.json | Worker performance and task metrics |

### CI/CD Workflows (3 files)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| k8s-deploy.yml | Push to main | Production deployment |
| k8s-staging.yml | Pull request | Staging environment |
| integration-tests.yml | PR creation | Automated testing |

### Coordination Files (8 files)

| File | Purpose |
|------|---------|
| k3s-autoscaling-deployment-master.json | Mission definition |
| coord-to-dev-infra-phase1.json | Infrastructure handoff |
| coord-to-dev-metrics-phase2.json | Metrics implementation handoff |
| coord-to-dev-scaling-phase3.json | Auto-scaling handoff |
| coord-to-dev-deployment-phase4.json | Deployment handoff |
| coord-to-security-hardening-phase5.json | Security hardening handoff |
| coord-to-dev-documentation-phase5.json | Documentation handoff |
| coord-to-cicd-pipeline-phase5.json | CI/CD pipeline handoff |

## Total Deliverables

| Category | Count |
|----------|-------|
| Scripts | 14 |
| K8s Manifests | 35 |
| Documentation | 14 |
| Code Changes | 3 |
| Dashboards | 3 |
| CI/CD Workflows | 3 |
| Coordination Files | 8 |
| **TOTAL** | **80 files** |

## Execution Phases

### Phase 1: Infrastructure (3 files + 3 scripts)

**Owner**: development-master
**Status**: Pending

Files:
- `scripts/proxmox/create-vm.sh`
- `scripts/proxmox/configure-network.sh`
- `scripts/proxmox/cloud-init-template.yaml`
- `scripts/k3s/install-control-plane.sh`
- `scripts/k3s/join-worker.sh`
- `scripts/k3s/verify-cluster.sh`

### Phase 2: Monitoring (10 files)

**Owner**: development-master
**Status**: Pending
**Dependencies**: Phase 1

Files:
- `dashboard/server/metrics-exporter.js`
- `lib/observability/prometheus-metrics.sh`
- `docs/monitoring/metrics-schema.md`
- `k8s/monitoring/prometheus-deployment.yaml`
- `k8s/monitoring/prometheus-config.yaml`
- `k8s/monitoring/prometheus-rbac.yaml`
- `k8s/monitoring/servicemonitor-cortex.yaml`
- `k8s/monitoring/grafana-deployment.yaml`
- `k8s/monitoring/grafana-dashboards-configmap.yaml`
- `dashboards/grafana/*.json` (3 files)

### Phase 3: Auto-Scaling (16 files)

**Owner**: development-master
**Status**: Pending
**Dependencies**: Phase 2

Files:
- `k8s/keda/keda-install.sh`
- `k8s/keda/keda-config.yaml`
- `k8s/keda/scaledobject-*.yaml` (4 files)
- `k8s/workers/*-worker-deployment.yaml` (4 files)
- `k8s/masters/*-statefulset.yaml` (5 files)
- `k8s/storage/coordination-pvc.yaml`
- `k8s/storage/nfs-provisioner.yaml`
- `docs/deployment/storage-options.md`

### Phase 4: Deployment (5 files)

**Owner**: development-master
**Status**: Pending
**Dependencies**: Phase 3

Files:
- `scripts/deploy/deploy-cortex-k3s.sh`
- `scripts/deploy/create-secrets.sh`
- `scripts/deploy/test-autoscaling.sh`
- `scripts/deploy/smoke-tests.sh`
- `scripts/deploy/setup-grafana-datasource.sh`
- `docs/deployment/access-urls.md`

### Phase 5: Security, Docs, CI/CD (22 files)

**Owners**: security-master, development-master, cicd-master
**Status**: Pending
**Dependencies**: Phase 4
**Parallel Execution**: Yes

Security (6 files):
- `k8s/security/rbac.yaml`
- `k8s/security/network-policies.yaml`
- `k8s/security/pod-security-standards.yaml`
- `k8s/security/sealed-secrets-setup.yaml`
- `security/reports/cortex-docker-image-scan.md`
- `docs/security/*.md` (2 files)

Documentation (9 files):
- `docs/deployment/k3s-autoscaling-deployment-guide.md`
- `docs/deployment/k3s-autoscaling-architecture.md`
- `docs/deployment/scaling-behavior.md`
- `docs/runbooks/troubleshooting-guide.md`
- `docs/runbooks/disaster-recovery.md`
- `docs/runbooks/maintenance-procedures.md`
- `docs/monitoring/grafana-dashboards-guide.md`
- `docs/monitoring/prometheus-queries.md`
- `docs/monitoring/alerting-setup.md`

CI/CD (7 files):
- `.github/workflows/k8s-deploy.yml`
- `.github/workflows/k8s-staging.yml`
- `.github/workflows/integration-tests.yml`
- `scripts/deploy/blue-green-deploy.sh`
- `scripts/deploy/rollback.sh`
- `scripts/deploy/backup-coordination-state.sh`
- `k8s/cronjobs/backup-cronjob.yaml`

## Deployment Command Sequence

### Quick Start (One Command)

```bash
# Set environment variables
export PROXMOX_TOKEN_VALUE="b8cc165f-0153-43bb-a48a-5d7459587ca7"
export ANTHROPIC_API_KEY="your-api-key"

# Run bootstrap
./scripts/deploy/bootstrap-k3s-cluster.sh
```

### Step-by-Step Execution

```bash
# Phase 1: Infrastructure
./scripts/proxmox/create-vm.sh --vm-id 110 --hostname cortex-k3s-control --ip 10.88.140.152
./scripts/proxmox/create-vm.sh --vm-id 111 --hostname cortex-k3s-worker-01 --ip 10.88.140.153
./scripts/proxmox/create-vm.sh --vm-id 112 --hostname cortex-k3s-worker-02 --ip 10.88.140.154
./scripts/k3s/install-control-plane.sh --vm-ip 10.88.140.152
./scripts/k3s/join-worker.sh --worker-ip 10.88.140.153 --control-plane-ip 10.88.140.152
./scripts/k3s/join-worker.sh --worker-ip 10.88.140.154 --control-plane-ip 10.88.140.152
./scripts/k3s/verify-cluster.sh

# Phase 2: Monitoring
kubectl apply -f k8s/monitoring/

# Phase 3: Auto-Scaling
./k8s/keda/keda-install.sh
kubectl apply -f k8s/storage/coordination-pvc.yaml
kubectl apply -f k8s/masters/
kubectl apply -f k8s/workers/
kubectl apply -f k8s/keda/scaledobject-*.yaml

# Phase 4: Deployment
./scripts/deploy/create-secrets.sh
./scripts/deploy/deploy-cortex-k3s.sh
./scripts/deploy/smoke-tests.sh
./scripts/deploy/test-autoscaling.sh

# Phase 5: Security & CI/CD
kubectl apply -f k8s/security/
kubectl apply -f k8s/cronjobs/backup-cronjob.yaml
```

## Validation Checklist

### Infrastructure
- [ ] 3 VMs created on Proxmox (110, 111, 112)
- [ ] K3s cluster running with 3 nodes Ready
- [ ] kubectl access configured

### Monitoring
- [ ] Prometheus scraping Cortex metrics
- [ ] Grafana dashboards showing data
- [ ] All metrics endpoints responding

### Auto-Scaling
- [ ] KEDA operator installed and healthy
- [ ] ScaledObjects created for all worker types
- [ ] Workers scale from 0 to N based on queue depth
- [ ] Workers scale back to 0 after cooldown

### Security
- [ ] RBAC policies applied
- [ ] Network policies enforced
- [ ] Pod Security Standards active
- [ ] No critical CVEs in container scan

### CI/CD
- [ ] GitHub Actions workflows configured
- [ ] Automated deployment tested
- [ ] Rollback procedure verified
- [ ] Backup CronJob running

## Next Steps

1. Execute Phase 1 via development-master handoff
2. Execute Phase 2 via development-master handoff
3. Execute Phase 3 via development-master handoff
4. Execute Phase 4 via development-master handoff
5. Execute Phase 5 in parallel via security-master, development-master, cicd-master
6. Validate complete deployment
7. Generate final mission report

## References

- Mission Definition: `coordination/tasks/k3s-autoscaling-deployment-master.json`
- Handoff Files: `coordination/masters/coordinator/handoffs/coord-to-*-phase*.json`
- Architecture: `docs/deployment/k3s-autoscaling-architecture.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-12-07
**Total Files**: 80
**Status**: Ready for Execution
