# k3s Migration Architecture

## Network Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VLAN 145 Network                            │
│                         10.88.145.0/24                              │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│      OLD CLUSTER (LXC)           │  │      NEW CLUSTER (VMs)           │
│                                  │  │                                  │
│  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │ k3s-master (CTID 300)      │  │  │  │ k3s-master-vm              │  │
│  │ IP: 10.88.145.170          │  │  │  │ IP: 10.88.145.180          │  │
│  │ Role: control-plane        │  │  │  │ Role: control-plane        │  │
│  └────────────────────────────┘  │  │  └────────────────────────────┘  │
│                                  │  │                                  │
│  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │ k3s-worker-1 (CTID 301)    │  │  │  │ k3s-worker-1-vm            │  │
│  │ IP: 10.88.145.171          │  │  │  │ IP: 10.88.145.181          │  │
│  │ Role: worker               │  │  │  │ Role: worker               │  │
│  └────────────────────────────┘  │  │  └────────────────────────────┘  │
│                                  │  │                                  │
│  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │ k3s-worker-2 (CTID 302)    │  │  │  │ k3s-worker-2-vm            │  │
│  │ IP: 10.88.145.172          │  │  │  │ IP: 10.88.145.182          │  │
│  │ Role: worker               │  │  │  │ Role: worker               │  │
│  └────────────────────────────┘  │  │  └────────────────────────────┘  │
│                                  │  │                                  │
│  MetalLB Pool:                   │  │  MetalLB Pool:                   │
│  10.88.145.200-210               │  │  10.88.145.200-210 (same range)  │
│                                  │  │                                  │
│  k3s version: v1.33.6+k3s1      │  │  k3s version: v1.33.6+k3s1      │
└──────────────────────────────────┘  └──────────────────────────────────┘
                │                                    │
                │                                    │
                └────────────┬───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  NFS Server     │
                    │  (CTID 303)     │
                    │  10.88.145.173  │
                    │                 │
                    │  /export/k3s    │ ← Old cluster data
                    │  /export/k3s-vm │ ← New cluster data
                    └─────────────────┘
```

## Component Architecture

### Current Cluster (LXC)
```
┌─────────────────────────────────────────────────────────────┐
│                    k3s-master (170)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Control Plane Components                 │   │
│  │  • kube-apiserver                                    │   │
│  │  • kube-scheduler                                    │   │
│  │  • kube-controller-manager                           │   │
│  │  • etcd (embedded)                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Flux Controllers                         │   │
│  │  • source-controller                                 │   │
│  │  • kustomize-controller                              │   │
│  │  • helm-controller                                   │   │
│  │  • notification-controller                           │   │
│  │  • image-reflector-controller                        │   │
│  │  • image-automation-controller                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│   k3s-worker-1 (171) │  │   k3s-worker-2 (172) │
│                      │  │                      │
│  • kubelet           │  │  • kubelet           │
│  • containerd        │  │  • containerd        │
│  • kube-proxy        │  │  • kube-proxy        │
│                      │  │                      │
│  Workloads:          │  │  Workloads:          │
│  • Traefik           │  │  • Monitoring        │
│  • MetalLB speaker   │  │  • MetalLB speaker   │
│  • App pods          │  │  • App pods          │
└──────────────────────┘  └──────────────────────┘
```

### New Cluster (VMs) - Same Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                 k3s-master-vm (180)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Same control plane as old cluster            │   │
│  │         Same Flux controllers                        │   │
│  │         Deployed fresh with same config              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ k3s-worker-1-vm (181)│  │ k3s-worker-2-vm (182)│
│                      │  │                      │
│  Same components     │  │  Same components     │
│  Same workloads      │  │  Same workloads      │
│  (deployed via Flux) │  │  (deployed via Flux) │
└──────────────────────┘  └──────────────────────┘
```

## Service Flow

### Before Migration
```
Internet
   │
   ▼
DNS A Records → 10.88.145.200 (Traefik on OLD cluster)
   │
   ▼
┌──────────────────────────┐
│    OLD k3s Cluster       │
│                          │
│  Traefik → Services      │
│    ↓                     │
│  Applications            │
│    ↓                     │
│  NFS Storage (173)       │
│  Longhorn Storage        │
└──────────────────────────┘
```

### After Migration
```
Internet
   │
   ▼
DNS A Records → 10.88.145.200 (Traefik on NEW cluster)
   │
   ▼
┌──────────────────────────┐
│    NEW k3s Cluster       │
│                          │
│  Traefik → Services      │
│    ↓                     │
│  Applications            │
│    ↓                     │
│  NFS Storage (173)       │  ← Same NFS server
│  Longhorn Storage        │  ← Migrated volumes
└──────────────────────────┘

┌──────────────────────────┐
│    OLD k3s Cluster       │  ← Kept running for 72h
│    (standby/rollback)    │
└──────────────────────────┘
```

## MetalLB Configuration

### IP Address Pool (Same on both clusters)
```
┌─────────────────────────────────────────────────────┐
│           MetalLB IP Address Pool                   │
│                                                     │
│  Pool Name: k3s-pool                               │
│  Range: 10.88.145.200 - 10.88.145.210              │
│  Mode: L2 Advertisement                            │
│  Auto-assign: true                                 │
│                                                     │
│  Available IPs: 11 addresses                       │
│  ┌────┬────┬────┬────┬────┬────┬────┬────┬────┐   │
│  │.200│.201│.202│.203│.204│.205│.206│.207│.208│   │
│  └────┴────┴────┴────┴────┴────┴────┴────┴────┘   │
│  ┌────┬────┐                                       │
│  │.209│.210│                                       │
│  └────┴────┘                                       │
└─────────────────────────────────────────────────────┘
```

### Service IP Assignment Example
```
Old Cluster:                    New Cluster:
┌──────────────────────┐        ┌──────────────────────┐
│ Traefik: .200        │   →    │ Traefik: .201        │
│ Monitoring: .201     │   →    │ Monitoring: .202     │
│ App1: .202           │   →    │ App1: .203           │
└──────────────────────┘        └──────────────────────┘
                                 (IPs may differ)
```

Note: MetalLB will assign IPs from the same pool but assignments may differ. Update DNS to new IPs.

## Storage Architecture

### NFS Storage
```
┌──────────────────────────────────────────────────────────┐
│              NFS Server (10.88.145.173)                  │
│                                                          │
│  /export/                                               │
│    ├── k3s/                 ← Old cluster data          │
│    │   ├── namespace1/                                  │
│    │   ├── namespace2/                                  │
│    │   └── ...                                          │
│    │                                                    │
│    └── k3s-vm/              ← New cluster data          │
│        ├── namespace1/      (migrated or fresh)         │
│        ├── namespace2/                                  │
│        └── ...                                          │
│                                                          │
│  NFS Exports:                                           │
│  • /export/k3s     → Old cluster (read-only after)     │
│  • /export/k3s-vm  → New cluster (read-write)          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────┐           ┌──────────────────────┐
│  OLD Cluster         │           │  NEW Cluster         │
│                      │           │                      │
│  NFS Provisioner     │           │  NFS Provisioner     │
│  → /export/k3s       │           │  → /export/k3s-vm    │
│                      │           │                      │
│  PVCs mount to:      │           │  PVCs mount to:      │
│  /export/k3s/...     │           │  /export/k3s-vm/...  │
└──────────────────────┘           └──────────────────────┘
```

### Longhorn Storage (if used)
```
Old Cluster:                      New Cluster:
┌─────────────────────┐          ┌─────────────────────┐
│ Longhorn Volumes    │          │ Longhorn Volumes    │
│ • app1-pvc-123      │   ─┐     │ • app1-pvc-456      │
│ • app2-pvc-456      │    │     │ • app2-pvc-789      │
│ • db-pvc-789        │    │     │ • db-pvc-012        │
└─────────────────────┘    │     └─────────────────────┘
                           │
                     Data migration
                     via rsync or
                     migration pods
```

## Flux GitOps Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Git Repository                            │
│                                                              │
│  clusters/                                                   │
│    ├── k3s/              ← Old cluster config               │
│    └── k3s-vm/           ← New cluster config (new path)    │
│                                                              │
│  apps/                                                       │
│    ├── traefik/                                             │
│    ├── monitoring/                                          │
│    └── ...                                                  │
└──────────────────────────────────────────────────────────────┘
                │                          │
                │                          │
        ┌───────▼───────┐          ┌───────▼───────┐
        │  OLD Cluster  │          │  NEW Cluster  │
        │  Flux         │          │  Flux         │
        │  watching:    │          │  watching:    │
        │  clusters/k3s │          │  clusters/    │
        │               │          │  k3s-vm       │
        └───────────────┘          └───────────────┘
                │                          │
                ▼                          ▼
        Deploys to OLD            Deploys to NEW
```

## Migration Data Flow

```
Phase 1: Backup
┌─────────────┐     extract config      ┌──────────────┐
│ OLD Cluster │ ───────────────────────> │ Backup Files │
└─────────────┘                          └──────────────┘

Phase 2-5: Bootstrap NEW Cluster
┌──────────────┐      install k3s       ┌─────────────┐
│ Scripts      │ ───────────────────────>│ NEW Cluster │
└──────────────┘                         └─────────────┘
       │                                        │
       │          install components            │
       │        (MetalLB, NFS, Flux)           │
       └───────────────────────────────────────┘

Phase 6: Flux Deploys Applications
┌──────────────┐      reconcile         ┌─────────────┐
│ Git Repo     │ <─────────────────────> │ NEW Cluster │
└──────────────┘      (via Flux)         └─────────────┘
                                                │
                                                ▼
                                    Applications deployed

Phase 7: Data Migration
┌─────────────┐      copy data         ┌─────────────┐
│ OLD Storage │ ───────────────────────>│ NEW Storage │
│ (NFS/       │      (rsync/cp)        │ (NFS/       │
│ Longhorn)   │                        │ Longhorn)   │
└─────────────┘                        └─────────────┘

Phase 8: Traffic Cutover
┌─────────────┐                        ┌─────────────┐
│ DNS         │      update A records  │ NEW Cluster │
│ Records     │ ───────────────────────>│ LoadBalancer│
└─────────────┘                        └─────────────┘
       │
       │ (old DNS)
       ▼
┌─────────────┐
│ OLD Cluster │ ← Standby for rollback
│ (standby)   │
└─────────────┘
```

## High-Level Migration Flow

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  Day 1: PREPARATION                                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ Create   │ -> │ Configure│ -> │ Backup   │                │
│  │ VMs      │    │ Network  │    │ Cluster  │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Day 2: CLUSTER BOOTSTRAP                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ Install  │ -> │ Join     │ -> │ Install  │                │
│  │ Master   │    │ Workers  │    │ Services │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│       │               │                │                      │
│       ▼               ▼                ▼                      │
│  k3s master     k3s workers    MetalLB, NFS, Flux            │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Day 3: APPLICATION DEPLOYMENT                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ Flux     │ -> │ Migrate  │ -> │ Verify   │                │
│  │ Deploys  │    │ Data     │    │ All OK   │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│       │               │                │                      │
│       ▼               ▼                ▼                      │
│  Apps running   Data copied    Tests passing                 │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Day 4: CUTOVER                                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ Lower    │ -> │ Update   │ -> │ Monitor  │                │
│  │ DNS TTL  │    │ DNS      │    │ Traffic  │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│  (24h before)         │                │                      │
│                       ▼                ▼                      │
│                 Point to new    Users on new cluster          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Days 5-7: MONITORING                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ Watch    │ -> │ 72 hours │ -> │ Decom    │                │
│  │ Metrics  │    │ Stable   │    │ Old      │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│                                        │                      │
│                                        ▼                      │
│                              Migration complete!              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Rollback Architecture

### Normal Flow (Migration Successful)
```
Users → DNS → NEW Cluster (180-182) → Applications
                    ↓
              NFS Server (173)

OLD Cluster (170-172) → Standby (kept running)
```

### Rollback Flow (If Issues Occur)
```
Users → DNS → OLD Cluster (170-172) → Applications
         ↑              ↓
    Update DNS    NFS Server (173)
    (5 min)

NEW Cluster (180-182) → Debug (kept running for analysis)
```

## Resource Allocation

### Per-VM Recommended Resources
```
Master VM (180):            Workers (181, 182):
┌─────────────────┐        ┌─────────────────┐
│ CPU: 4+ cores   │        │ CPU: 4+ cores   │
│ RAM: 16GB       │        │ RAM: 8GB+       │
│ Disk: 100GB+    │        │ Disk: 100GB+    │
│ Network: 1Gbps  │        │ Network: 1Gbps  │
└─────────────────┘        └─────────────────┘

Total Cluster:
- CPU: 12+ cores
- RAM: 32GB+
- Disk: 300GB+
```

## Network Ports

```
Between Nodes:
┌────────────────────────────────────────┐
│ 6443/tcp  - Kubernetes API             │
│ 10250/tcp - Kubelet API                │
│ 8472/udp  - Flannel VXLAN              │
│ 51820/udp - Flannel Wireguard (if used)│
│ 51821/udp - Flannel Wireguard (if used)│
└────────────────────────────────────────┘

To NFS Server:
┌────────────────────────────────────────┐
│ 2049/tcp  - NFS                        │
│ 111/tcp   - RPC                        │
└────────────────────────────────────────┘

External Access:
┌────────────────────────────────────────┐
│ 80/tcp    - HTTP (via MetalLB)         │
│ 443/tcp   - HTTPS (via MetalLB)        │
│ 6443/tcp  - Kubernetes API (if exposed)│
└────────────────────────────────────────┘
```

---

This architecture maintains the same logical structure as your current cluster while providing the benefits of VMs over LXC containers (better isolation, snapshots, migration capabilities, etc.).
