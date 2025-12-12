# Cortex K3s Auto-Scaling Architecture

**Mission**: Production-Ready Auto-Scaling Cortex on K3s/Proxmox
**Status**: In Progress
**Created**: 2025-12-07

## Overview

This document describes the complete architecture for deploying Cortex on a K3s Kubernetes cluster running on Proxmox VMs, with KEDA-based auto-scaling, Prometheus/Grafana monitoring, and full production hardening.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Proxmox Host (10.88.140.151)                        │
│                                                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │   VM 110             │  │   VM 111             │  │   VM 112         │  │
│  │   K3s Control Plane  │  │   K3s Worker 01      │  │   K3s Worker 02  │  │
│  │   10.88.140.152      │  │   10.88.140.153      │  │   10.88.140.154  │  │
│  │   4 CPU, 8GB RAM     │  │   4 CPU, 8GB RAM     │  │   4 CPU, 8GB RAM │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬─────────┘  │
│             │                         │                         │            │
│             └─────────────────────────┴─────────────────────────┘            │
│                                   K3s Cluster                                │
│                              Gateway: 10.88.140.144                          │
│                              Subnet: /27 (255.255.255.224)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ kubectl
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        K3s Cluster (cortex namespace)                        │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Monitoring Stack                             │    │
│  │  ┌────────────────┐          ┌─────────────────┐                   │    │
│  │  │  Prometheus    │◄─────────│   Grafana       │                   │    │
│  │  │  :9090         │  query   │   :3000         │                   │    │
│  │  │  Metrics DB    │          │   Dashboards    │                   │    │
│  │  └───────▲────────┘          └─────────────────┘                   │    │
│  │          │ scrape                                                   │    │
│  │          │ /metrics                                                 │    │
│  └──────────┼──────────────────────────────────────────────────────────┘    │
│             │                                                                │
│  ┌──────────┼──────────────────────────────────────────────────────────┐    │
│  │          │                KEDA Operator                             │    │
│  │          │            (Auto-Scaling Controller)                     │    │
│  │  ┌───────▼──────────┐                                               │    │
│  │  │   ScaledObjects  │                                               │    │
│  │  │   - impl worker  │  Queries Prometheus for                      │    │
│  │  │   - sec worker   │  cortex_task_queue_depth                     │    │
│  │  │   - analysis wkr │  → Scales workers 0-50                       │    │
│  │  │   - scan worker  │                                               │    │
│  │  └──────────────────┘                                               │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐    │
│  │                      Cortex Masters (StatefulSets)                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │ Coordinator  │  │ Development  │  │  Security    │              │    │
│  │  │   Master     │  │   Master     │  │   Master     │              │    │
│  │  │  (1 replica) │  │  (1 replica) │  │  (1 replica) │              │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │    │
│  │         │                 │                 │                       │    │
│  │         └─────────────────┼─────────────────┘                       │    │
│  │                           │                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐                                │    │
│  │  │   CI/CD      │  │  Inventory   │                                │    │
│  │  │   Master     │  │   Master     │                                │    │
│  │  │  (1 replica) │  │  (1 replica) │                                │    │
│  │  └──────────────┘  └──────────────┘                                │    │
│  └───────────────────────┬───────────────────────────────────────────────┘    │
│                          │ coordination files (shared PVC)                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              Cortex Workers (Deployments - Auto-Scaling)            │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │  Implementation Workers (0-50 replicas)                    │    │    │
│  │  │  [═══════════]  Scale based on queue depth                 │    │    │
│  │  │  Handles: feature development, bug fixes, refactoring      │    │    │
│  │  └────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │  Security Workers (0-50 replicas)                          │    │    │
│  │  │  [═══]  Scale based on security task queue                 │    │    │
│  │  │  Handles: vulnerability scanning, audits, CVE detection    │    │    │
│  │  └────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │  Analysis Workers (0-50 replicas)                          │    │    │
│  │  │  [═════]  Scale based on analysis queue                    │    │    │
│  │  │  Handles: code analysis, architecture review, optimization │    │    │
│  │  └────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │  Scan Workers (0-50 replicas)                              │    │    │
│  │  │  [══]  Scale based on scan queue                           │    │    │
│  │  │  Handles: dependency scanning, security posture checks     │    │    │
│  │  └────────────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐    │
│  │                    Shared Storage (RWX PVC)                          │    │
│  │  /app/coordination/                                                  │    │
│  │  ├── task-queue.json           ← Task assignments                   │    │
│  │  ├── worker-pool.json          ← Worker status                      │    │
│  │  ├── token-budget.json         ← Token tracking                     │    │
│  │  ├── masters/                  ← Master state                       │    │
│  │  │   ├── coordinator/                                               │    │
│  │  │   ├── development/                                               │    │
│  │  │   └── security/                                                  │    │
│  │  └── handoffs/                 ← Inter-master communication         │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Auto-Scaling Flow

```
1. Task Added to Queue
   │
   ▼
2. Metrics Exporter Updates
   cortex_task_queue_depth{type="implementation"}
   │
   ▼
3. Prometheus Scrapes Metric
   (every 15 seconds)
   │
   ▼
4. KEDA Queries Prometheus
   "cortex_task_queue_depth{type=\"implementation\"}"
   │
   ▼
5. KEDA Evaluates Threshold
   If queue_depth > 0:
     Desired Replicas = min(queue_depth, max_replicas)
   │
   ▼
6. KEDA Updates HPA
   (Horizontal Pod Autoscaler)
   │
   ▼
7. K8s Schedules New Worker Pods
   (Scale up to handle tasks)
   │
   ▼
8. Workers Process Tasks
   │
   ▼
9. Queue Depth Decreases
   │
   ▼
10. After Cooldown Period (5 min)
    KEDA Scales Down to 0
```

## Data Flow

```
User Request
    │
    ▼
┌─────────────────┐
│ Cortex API      │
│ (NodePort 30001)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Coordinator Master     │
│  - Routes via MoE       │
│  - Creates handoff      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Task Queue             │
│  (task-queue.json)      │
│  - Status: pending      │
└────────┬────────────────┘
         │ (triggers queue depth metric)
         ▼
┌─────────────────────────┐
│  KEDA ScaledObject      │
│  - Detects queue > 0    │
│  - Scales workers       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Worker Pod Spawned     │
│  - Picks up task        │
│  - Executes work        │
│  - Updates status       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Task Completed         │
│  - Result in handoff    │
│  - Worker terminates    │
└─────────────────────────┘
```

## Network Topology

```
External Access (via NodePort)
    │
    ├── Grafana:      10.88.140.152:30002
    ├── Prometheus:   10.88.140.152:30003
    └── Cortex:       10.88.140.152:30001

Cluster Internal (ClusterIP)
    │
    ├── cortex-masters:3000       (metrics endpoint)
    ├── prometheus:9090           (query API)
    ├── grafana:3000              (internal)
    └── keda-metrics-server:443   (HPA metrics)

Pod Network (Flannel CNI)
    │
    ├── Masters:      10.42.0.0/16
    ├── Workers:      10.42.0.0/16
    └── Monitoring:   10.42.0.0/16

Service Network
    └── Services:     10.43.0.0/16

Network Policies
    │
    ├── Default Deny All Ingress
    ├── Allow Masters ↔ Masters
    ├── Allow Workers → Masters (read coordination)
    ├── Allow Prometheus → All (scrape /metrics)
    ├── Allow Grafana → Prometheus
    └── Allow External → NodePort Services
```

## Component Specifications

### Proxmox VMs

| VM ID | Hostname | IP | vCPU | RAM | Disk | Role |
|-------|----------|-----|------|-----|------|------|
| 110 | cortex-k3s-control | 10.88.140.152/27 | 4 | 8GB | 40GB | Control Plane |
| 111 | cortex-k3s-worker-01 | 10.88.140.153/27 | 4 | 8GB | 40GB | Worker Node |
| 112 | cortex-k3s-worker-02 | 10.88.140.154/27 | 4 | 8GB | 40GB | Worker Node |

### K3s Configuration

- **Version**: Latest stable (v1.28+)
- **CNI**: Flannel (default)
- **Ingress**: Disabled (using NodePort)
- **Storage**: local-path provisioner + NFS (for RWX)
- **Load Balancer**: ServiceLB (Klipper)

### Cortex Masters

| Master | Replicas | CPU Request | Memory Request | CPU Limit | Memory Limit |
|--------|----------|-------------|----------------|-----------|--------------|
| Coordinator | 1 | 500m | 1Gi | 2000m | 4Gi |
| Development | 1 | 500m | 1Gi | 2000m | 4Gi |
| Security | 1 | 500m | 1Gi | 2000m | 4Gi |
| CI/CD | 1 | 500m | 1Gi | 2000m | 4Gi |
| Inventory | 1 | 500m | 1Gi | 2000m | 4Gi |

### Cortex Workers (Auto-Scaling)

| Worker Type | Min Replicas | Max Replicas | CPU Request | Memory Request | CPU Limit | Memory Limit |
|-------------|--------------|--------------|-------------|----------------|-----------|--------------|
| Implementation | 0 | 50 | 250m | 512Mi | 1000m | 2Gi |
| Security | 0 | 50 | 250m | 512Mi | 1000m | 2Gi |
| Analysis | 0 | 50 | 250m | 512Mi | 1000m | 2Gi |
| Scan | 0 | 50 | 250m | 512Mi | 1000m | 2Gi |

### Monitoring Stack

| Component | CPU Request | Memory Request | Storage |
|-----------|-------------|----------------|---------|
| Prometheus | 500m | 2Gi | 20Gi PVC |
| Grafana | 100m | 256Mi | 5Gi PVC |
| KEDA Operator | 100m | 128Mi | - |
| KEDA Metrics Server | 100m | 128Mi | - |

## Scaling Behavior

### Scale-Up Policy

- **Trigger**: `cortex_task_queue_depth > 0`
- **Rate**: 100% increase every 15 seconds
- **Example**: 0 → 1 → 2 → 4 → 8 → 16 → 32 → 50 (max)
- **Time to Max**: ~2 minutes

### Scale-Down Policy

- **Trigger**: `cortex_task_queue_depth == 0`
- **Stabilization Window**: 300 seconds (5 minutes)
- **Rate**: 50% decrease every 60 seconds
- **Example**: 50 → 25 → 12 → 6 → 3 → 1 → 0
- **Time to Zero**: ~8 minutes after queue empty

### Cost Optimization

- **Idle State**: 0 workers (only 5 masters running)
- **Peak Load**: Up to 200 workers (50 per type)
- **Cost Savings**: ~95% reduction in compute when idle

## Metrics Schema

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `cortex_task_queue_depth` | Gauge | type | Current task queue depth |
| `cortex_active_workers` | Gauge | type, status | Active workers by type |
| `cortex_master_health` | Gauge | master | Master health (1=healthy) |
| `cortex_task_duration_seconds` | Histogram | type, status | Task completion time |
| `cortex_moe_routing_confidence` | Gauge | from_master, to_master | MoE confidence score |
| `cortex_worker_spawn_rate` | Counter | type | Total worker spawns |
| `cortex_task_success_rate` | Gauge | type | Success rate (0-1) |

## Security Configuration

### Pod Security Standards

- **Level**: Restricted
- **No privileged containers**
- **Non-root user (UID 1000)**
- **Read-only root filesystem**
- **Dropped capabilities: ALL**

### RBAC

- **Masters**: Read/write coordination ConfigMaps/Secrets
- **Workers**: Read-only coordination ConfigMaps
- **Prometheus**: List/watch pods, services, endpoints
- **Principle**: Least privilege

### Network Policies

- **Default**: Deny all ingress
- **Masters**: Can communicate with each other
- **Workers**: Can read from masters
- **Prometheus**: Can scrape all pods
- **External**: Only via NodePort services

## Deployment Process

### Prerequisites

1. Proxmox host accessible at 10.88.140.151
2. Proxmox API token configured
3. SSH access to Proxmox host
4. kubectl installed locally

### One-Command Deployment

```bash
./scripts/deploy/bootstrap-k3s-cluster.sh
```

This script:
1. Creates 3 VMs on Proxmox (110, 111, 112)
2. Installs K3s control plane and workers
3. Deploys Cortex masters and workers
4. Deploys monitoring stack
5. Configures KEDA auto-scaling
6. Runs validation tests
7. Prints access URLs

### Manual Step-by-Step

See: [k3s-autoscaling-deployment-guide.md](k3s-autoscaling-deployment-guide.md)

## Monitoring & Observability

### Grafana Dashboards

1. **Auto-Scaling Dashboard**
   - Queue depth trends
   - Worker scaling activity
   - Resource utilization
   - KEDA scaler metrics

2. **Masters Dashboard**
   - Master health status
   - MoE routing decisions
   - Handoff activity
   - Coordination file updates

3. **Workers Dashboard**
   - Task completion rates
   - Duration distributions
   - Success rates by type
   - Failed task analysis

### Access URLs

- **Grafana**: http://10.88.140.152:30002 (admin/[password])
- **Prometheus**: http://10.88.140.152:30003
- **Cortex Dashboard**: http://10.88.140.152:30001

## Disaster Recovery

### Backup Strategy

- **Coordination PVC**: Daily snapshots via CronJob
- **Prometheus Data**: Retained for 30 days
- **Grafana Dashboards**: Version controlled in Git
- **K8s Manifests**: Git repository

### Recovery Procedures

1. **Node Failure**: K3s will reschedule pods to healthy nodes
2. **PVC Loss**: Restore from latest snapshot
3. **Cluster Rebuild**: Re-run bootstrap script with existing PVC
4. **Data Corruption**: Rollback to previous backup

### RTO/RPO

- **RTO** (Recovery Time Objective): < 30 minutes
- **RPO** (Recovery Point Objective): < 24 hours

## Performance Benchmarks

### Expected Performance

- **Task Throughput**: 50-200 tasks/minute (depends on complexity)
- **Time to Scale Up**: < 30 seconds (0 to 10 workers)
- **Time to Scale Down**: 5-8 minutes (10 to 0 workers)
- **Master Response Time**: < 100ms for routing decisions
- **Worker Spawn Time**: 10-20 seconds per pod

### Load Testing Results

*To be added after deployment and testing*

## Future Enhancements

### Short Term

- [ ] Add AlertManager for notifications
- [ ] Implement Longhorn for distributed storage
- [ ] Add K8s Dashboard for cluster management
- [ ] Enable TLS for all external endpoints

### Medium Term

- [ ] Multi-cluster federation
- [ ] GitOps with ArgoCD
- [ ] Advanced canary deployments
- [ ] Service mesh (Istio/Linkerd)

### Long Term

- [ ] Multi-region deployment
- [ ] Disaster recovery automation
- [ ] ML-based auto-tuning
- [ ] Cost optimization engine

## References

- [K3s Documentation](https://docs.k3s.io/)
- [KEDA Documentation](https://keda.sh/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

## Support

For issues or questions:
1. Check troubleshooting guide: [troubleshooting-guide.md](../runbooks/troubleshooting-guide.md)
2. Review KEDA logs: `kubectl logs -n keda deployment/keda-operator`
3. Check Prometheus targets: http://10.88.140.152:30003/targets
4. View Cortex logs: `kubectl logs -n cortex -l app=cortex-master`

---

**Document Version**: 1.0
**Last Updated**: 2025-12-07
**Owner**: Cortex Coordinator Master
