# k3s LXC to VM Migration - Complete Package

## Overview

Complete migration plan and automation scripts to migrate your k3s cluster from LXC containers to VMs on Proxmox.

## What's Included

### Documentation
1. **k3s-vm-migration-bootstrap-plan.md** (Main Plan)
   - Complete 9-phase migration strategy
   - Detailed technical instructions
   - Rollback procedures
   - Troubleshooting guide

2. **k3s-vm-migration-scripts/QUICKSTART.md** (Quick Reference)
   - TL;DR copy/paste commands
   - 10-step migration process
   - Common issues and fixes
   - Emergency procedures

3. **k3s-vm-migration-scripts/MIGRATION-CHECKLIST.md** (Progress Tracker)
   - Day-by-day checklist
   - Verification checkboxes
   - Notes sections
   - Success criteria

4. **k3s-vm-migration-scripts/README.md** (Scripts Documentation)
   - Script descriptions
   - Usage instructions
   - Troubleshooting per script
   - Safety notes

### Automation Scripts
Located in: `/Users/ryandahlberg/Projects/cortex/k3s-vm-migration-scripts/`

1. **01-backup-cluster.sh** - Backup current LXC cluster
2. **02-bootstrap-master.sh** - Install k3s master on new VM
3. **03-bootstrap-worker.sh** - Join workers to cluster
4. **04-install-metallb.sh** - Configure MetalLB load balancer
5. **05-install-nfs-provisioner.sh** - Set up NFS storage
6. **06-bootstrap-flux.sh** - Bootstrap Flux GitOps
7. **07-verify-migration.sh** - Comprehensive verification checks

All scripts are executable and ready to use.

---

## Current Cluster Configuration

**Discovered from your running cluster:**
- **k3s Version:** v1.33.6+k3s1
- **Nodes:** 3 (1 master, 2 workers)
- **Current IPs:** 10.88.145.170, 10.88.145.171, 10.88.145.172
- **Network:** VLAN 145
- **NFS Server:** 10.88.145.173

**Installed Components:**
- Flux (6 controllers running)
- MetalLB (IP pool: 10.88.145.200-210)
- Traefik (HelmRelease v34.5.0)
- kube-prometheus-stack (HelmRelease v72.9.1)
- NFS provisioner
- Longhorn storage

---

## Migration Strategy

### New Cluster Configuration
- **Target IPs:** 10.88.145.180, 10.88.145.181, 10.88.145.182
- **Same Network:** VLAN 145 (no network changes)
- **Same k3s Version:** v1.33.6+k3s1 (version-matched)
- **Same Components:** All will be deployed via Flux

### Key Advantages
1. **No network disruption** - Same VLAN, only IP changes
2. **Version matched** - Eliminates upgrade risks
3. **Automated** - Scripts handle most complexity
4. **Safe rollback** - Old cluster stays running
5. **Verified** - Comprehensive verification script

---

## Migration Timeline

| Day | Phase | Duration | Activities |
|-----|-------|----------|------------|
| 1 | Preparation | 2-3 hrs | VM creation, backup, verification |
| 2 | Cluster Setup | 3-4 hrs | k3s install, MetalLB, NFS, Flux |
| 3 | Applications | 4-6 hrs | Flux reconciliation, data migration |
| 4 | Cutover | 2-3 hrs | DNS update, monitoring |
| 5-7 | Monitoring | Ongoing | Stability verification |

**Total Active Migration Time:** ~12-16 hours over 4 days
**Total Timeline:** 7 days (including 72-hour stability period)

---

## Quick Start

### 1. Prerequisites
```bash
# Verify VMs are created and accessible
ping 10.88.145.180
ping 10.88.145.181
ping 10.88.145.182

# Verify NFS server is accessible
ssh root@10.88.145.173 'mkdir -p /export/k3s-vm'
```

### 2. Run Migration
```bash
cd k3s-vm-migration-scripts

# Day 1: Backup
./01-backup-cluster.sh

# Day 2: Bootstrap (on respective VMs)
ssh root@10.88.145.180 './02-bootstrap-master.sh'
ssh root@10.88.145.181 "export K3S_TOKEN='...' && ./03-bootstrap-worker.sh"
ssh root@10.88.145.182 "export K3S_TOKEN='...' && ./03-bootstrap-worker.sh"

# Install core components (on master)
ssh root@10.88.145.180 './04-install-metallb.sh'
ssh root@10.88.145.180 './05-install-nfs-provisioner.sh'
ssh root@10.88.145.180 './06-bootstrap-flux.sh'

# Day 3: Verify
ssh root@10.88.145.180 './07-verify-migration.sh'

# Day 4: Cutover (when ready)
# Update DNS to point to new Traefik LoadBalancer IP
```

### 3. Detailed Instructions
- **If you want speed:** Read `k3s-vm-migration-scripts/QUICKSTART.md`
- **If you want details:** Read `k3s-vm-migration-bootstrap-plan.md`
- **If you want to track progress:** Use `k3s-vm-migration-scripts/MIGRATION-CHECKLIST.md`

---

## Safety Features

### Built-in Safety
1. **No destructive actions** - Old cluster remains untouched
2. **Verification at each step** - Scripts validate before proceeding
3. **Comprehensive checks** - 07-verify-migration.sh runs 10+ checks
4. **Version matching** - Same k3s version reduces risks
5. **Rollback ready** - DNS change is instant rollback point

### Rollback Procedure
```bash
# If anything goes wrong during or after cutover:
# 1. Revert DNS to old cluster IPs (5 minutes)
# 2. Old cluster continues serving traffic
# 3. Troubleshoot new cluster at leisure
# 4. Retry when ready
```

---

## What Gets Migrated

### Automatically via Scripts
- k3s cluster (master + workers)
- MetalLB configuration (same IP pool)
- NFS storage provisioner (same NFS server)
- Flux GitOps connection

### Via Flux Reconciliation
- Traefik ingress controller
- kube-prometheus-stack
- Other applications defined in GitOps repo

### Manual Steps Required
- Data migration (NFS files or Longhorn volumes)
- DNS updates (after verification)
- SSL certificates (if not automated)

---

## Key Files

### Main Documents
- `/Users/ryandahlberg/Projects/cortex/k3s-vm-migration-bootstrap-plan.md`
- `/Users/ryandahlberg/Projects/cortex/K3S-MIGRATION-SUMMARY.md` (this file)

### Scripts Directory
- `/Users/ryandahlberg/Projects/cortex/k3s-vm-migration-scripts/`

### Generated During Migration
- `./backups/k3s-backup-TIMESTAMP.tar.gz` (cluster backup)
- `/root/k3s-node-token` (on master VM)
- `~/.kube/config` (on master VM)

---

## Migration Phases (Detailed)

### Phase 1: Backup (Required)
- Exports all Flux configurations
- Saves MetalLB settings
- Captures storage configurations
- Archives application resources
- **Output:** Timestamped backup archive

### Phase 2: k3s Bootstrap (Required)
- Installs k3s v1.33.6+k3s1 on master
- Configures custom networking
- Joins 2 workers
- **Verification:** All nodes Ready

### Phase 3: MetalLB (Required)
- Installs MetalLB v0.14.9
- Configures IP pool (10.88.145.200-210)
- Sets up L2 advertisement
- **Verification:** LoadBalancer IPs assigned

### Phase 4: NFS Storage (Required)
- Installs NFS provisioner
- Connects to existing NFS server
- Creates nfs-client storage class
- **Verification:** PVC can be created

### Phase 5: Flux (Required)
- Bootstraps Flux GitOps
- Connects to existing Git repository
- Initiates reconciliation
- **Verification:** All Flux pods running

### Phase 6: Applications (Automated)
- Flux deploys Traefik
- Flux deploys kube-prometheus-stack
- Other apps deploy per GitOps repo
- **Verification:** All app pods running

### Phase 7: Data Migration (Manual/Semi-automated)
- Copy NFS data (if needed)
- Migrate Longhorn volumes (if used)
- Verify data integrity
- **Verification:** Applications access data

### Phase 8: DNS Cutover (Manual)
- Lower DNS TTL (24h before)
- Update A records
- Monitor traffic switch
- **Verification:** Users on new cluster

### Phase 9: Monitoring (3 days)
- Watch for errors
- Monitor performance
- Keep old cluster ready
- **Success:** 72h stable operation

---

## Expected Results

### After Phase 2 (k3s Bootstrap)
```
$ kubectl get nodes
NAME              STATUS   ROLES                  AGE   VERSION
k3s-master-vm     Ready    control-plane,master   5m    v1.33.6+k3s1
k3s-worker-1-vm   Ready    <none>                 2m    v1.33.6+k3s1
k3s-worker-2-vm   Ready    <none>                 1m    v1.33.6+k3s1
```

### After Phase 3 (MetalLB)
```
$ kubectl get ipaddresspool -n metallb-system
NAME       AUTO ASSIGN   AVOID BUGGY IPS   ADDRESSES
k3s-pool   true          false             ["10.88.145.200-10.88.145.210"]
```

### After Phase 4 (NFS)
```
$ kubectl get storageclass
NAME                   PROVISIONER                     RECLAIMPOLICY   VOLUMEBINDINGMODE
local-path (default)   rancher.io/local-path           Delete          WaitForFirstConsumer
nfs-client             cluster.local/nfs-provisioner   Delete          Immediate
```

### After Phase 5 (Flux)
```
$ flux get all
NAME                    READY   MESSAGE
gitrepository/flux-system   True    Fetched revision: main/abc123
kustomization/flux-system   True    Applied revision: main/abc123
```

### After Phase 6 (Applications)
```
$ kubectl get svc -A | grep LoadBalancer
traefik      traefik   LoadBalancer   10.43.x.x   10.88.145.200   80:xxx/TCP,443:xxx/TCP
```

### After Verification
```
$ ./07-verify-migration.sh
========================================
SUMMARY
========================================
Passed: 15
Failed: 0

All checks passed! Cluster is ready for migration.
```

---

## Troubleshooting Resources

### Log Locations
- **k3s master:** `journalctl -u k3s -f`
- **k3s worker:** `journalctl -u k3s-agent -f`
- **Flux:** `flux logs -A --follow`
- **Application pods:** `kubectl logs <pod> -n <namespace>`

### Common Verification Commands
```bash
# Cluster health
kubectl get nodes
kubectl get pods -A

# Flux status
flux get all -A
flux get sources all

# Services and IPs
kubectl get svc -A
kubectl get ingress -A

# Storage
kubectl get storageclass
kubectl get pvc -A
```

### Getting Help
1. Check script output for errors
2. Run verification script: `./07-verify-migration.sh`
3. Review logs with commands above
4. Consult troubleshooting sections in docs
5. Review Flux reconciliation status

---

## Success Criteria

Migration is complete and successful when:
- [ ] All 3 nodes are Ready
- [ ] All system pods are Running
- [ ] MetalLB has assigned LoadBalancer IPs
- [ ] NFS storage class exists and works
- [ ] Flux is reconciling successfully
- [ ] All applications are accessible
- [ ] Data has been migrated
- [ ] DNS points to new cluster
- [ ] No errors in logs
- [ ] 72 hours of stable operation
- [ ] Old cluster can be decommissioned

---

## Next Steps

1. **Read the Quick Start:** `k3s-vm-migration-scripts/QUICKSTART.md`
2. **Review the Full Plan:** `k3s-vm-migration-bootstrap-plan.md`
3. **Print the Checklist:** `k3s-vm-migration-scripts/MIGRATION-CHECKLIST.md`
4. **Prepare VMs:** Create 3 VMs with proper specs
5. **Run Backup:** `./01-backup-cluster.sh`
6. **Begin Migration:** Follow scripts in order

---

## Support

**Documentation:**
- Main Plan: `k3s-vm-migration-bootstrap-plan.md`
- Quick Start: `k3s-vm-migration-scripts/QUICKSTART.md`
- Checklist: `k3s-vm-migration-scripts/MIGRATION-CHECKLIST.md`
- Scripts Docs: `k3s-vm-migration-scripts/README.md`

**External Resources:**
- k3s Docs: https://docs.k3s.io/
- Flux Docs: https://fluxcd.io/docs/
- MetalLB Docs: https://metallb.universe.tf/

---

**Package Created:** 2025-12-12
**Package Version:** 1.0
**Created By:** Development Master (Cortex Automation System)
**Cluster Analyzed:** k3s v1.33.6+k3s1 on VLAN 145
