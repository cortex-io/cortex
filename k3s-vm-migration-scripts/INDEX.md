# k3s VM Migration - Complete Index

## Quick Navigation

| Need | Document | Location |
|------|----------|----------|
| **Get started fast** | QUICKSTART.md | Copy/paste commands to migrate |
| **Understand the plan** | k3s-vm-migration-bootstrap-plan.md | Full 9-phase strategy |
| **Track progress** | MIGRATION-CHECKLIST.md | Day-by-day checklist |
| **Learn about scripts** | README.md | Script documentation |
| **Understand architecture** | ARCHITECTURE.md | Visual diagrams |
| **See overview** | K3S-MIGRATION-SUMMARY.md | Executive summary |
| **This file** | INDEX.md | Navigation guide |

---

## Document Descriptions

### 1. QUICKSTART.md
**Purpose:** Get migrating ASAP  
**Length:** ~500 lines  
**Content:**
- TL;DR copy/paste migration commands
- 10-step process from start to finish
- Common issues and quick fixes
- Emergency rollback procedure
- Minimal reading, maximum action

**Start here if:** You want to migrate quickly and already understand k3s

### 2. k3s-vm-migration-bootstrap-plan.md
**Purpose:** Comprehensive migration guide  
**Length:** ~1,000 lines (15,000 words)  
**Content:**
- 9 detailed migration phases
- Complete command reference
- Rollback procedures
- Troubleshooting guide
- Success criteria
- Migration log template

**Start here if:** You want to understand every detail before starting

### 3. MIGRATION-CHECKLIST.md
**Purpose:** Track migration progress  
**Length:** ~400 lines  
**Content:**
- Day-by-day checklist items
- Checkbox tracking
- Notes sections
- Status tracking
- Decommission checklist

**Start here if:** You're actively migrating and need to track progress

### 4. README.md
**Purpose:** Script documentation  
**Length:** ~400 lines  
**Content:**
- Each script's purpose and usage
- Prerequisites
- Troubleshooting per script
- Safety notes
- Quick reference commands

**Start here if:** You want to understand what each script does

### 5. ARCHITECTURE.md
**Purpose:** Visual architecture guide  
**Length:** ~600 lines  
**Content:**
- Network topology diagrams
- Component architecture
- Service flow diagrams
- Storage architecture
- Migration data flow
- Resource allocation

**Start here if:** You're a visual learner or need to present to team

### 6. K3S-MIGRATION-SUMMARY.md
**Purpose:** Executive summary  
**Length:** ~500 lines  
**Content:**
- Package overview
- Current vs target cluster
- Migration timeline
- Quick start steps
- Success criteria
- Where to start guide

**Start here if:** You need a high-level overview or executive summary

### 7. INDEX.md (This File)
**Purpose:** Navigation and reference  
**Content:**
- Document index
- Script index
- Quick reference
- File locations

**Start here if:** You need to find a specific document or script

---

## Script Index

### Execution Scripts

| Script | Purpose | Run On | Time | Dependencies |
|--------|---------|--------|------|--------------|
| **01-backup-cluster.sh** | Backup LXC cluster | Proxmox host or jump host | 5 min | SSH to Proxmox |
| **02-bootstrap-master.sh** | Install k3s master | Master VM (180) | 10 min | curl, root |
| **03-bootstrap-worker.sh** | Join worker to cluster | Worker VMs (181, 182) | 5 min | K3S_TOKEN env var |
| **04-install-metallb.sh** | Install MetalLB | Master VM | 5 min | kubectl, helm |
| **05-install-nfs-provisioner.sh** | Install NFS storage | Master VM | 5 min | kubectl, helm, NFS |
| **06-bootstrap-flux.sh** | Bootstrap Flux GitOps | Master VM | 10 min | kubectl, Git creds |
| **07-verify-migration.sh** | Verify cluster health | Master VM | 5 min | kubectl |

### Script Execution Order

```
Day 1:
  └─ 01-backup-cluster.sh

Day 2:
  ├─ 02-bootstrap-master.sh    (on 180)
  ├─ 03-bootstrap-worker.sh    (on 181, 182)
  ├─ 04-install-metallb.sh     (on 180)
  ├─ 05-install-nfs-provisioner.sh (on 180)
  └─ 06-bootstrap-flux.sh      (on 180)

Day 3:
  └─ 07-verify-migration.sh    (on 180)

Day 4:
  └─ Manual DNS update
```

---

## File Locations

### Main Directory
```
/Users/ryandahlberg/Projects/cortex/
├── k3s-vm-migration-bootstrap-plan.md    (Main plan)
├── K3S-MIGRATION-SUMMARY.md              (Summary)
└── k3s-vm-migration-scripts/             (Scripts dir)
```

### Scripts Directory
```
/Users/ryandahlberg/Projects/cortex/k3s-vm-migration-scripts/
├── 01-backup-cluster.sh                  (Executable)
├── 02-bootstrap-master.sh                (Executable)
├── 03-bootstrap-worker.sh                (Executable)
├── 04-install-metallb.sh                 (Executable)
├── 05-install-nfs-provisioner.sh         (Executable)
├── 06-bootstrap-flux.sh                  (Executable)
├── 07-verify-migration.sh                (Executable)
├── QUICKSTART.md                         (Quick guide)
├── MIGRATION-CHECKLIST.md                (Tracker)
├── README.md                             (Docs)
├── ARCHITECTURE.md                       (Diagrams)
└── INDEX.md                              (This file)
```

### Generated During Migration
```
./backups/
└── k3s-backup-YYYYMMDD-HHMMSS.tar.gz    (Created by 01-backup)

On Master VM (180):
├── /root/k3s-node-token                  (Created by 02-bootstrap)
└── ~/.kube/config                        (Created by 02-bootstrap)
```

---

## Quick Reference

### Current Cluster
- **Type:** LXC containers
- **Proxmox Host:** 10.88.140.164
- **LXC IDs:** 300 (master), 301 (worker-1), 302 (worker-2)
- **IPs:** 10.88.145.170, .171, .172
- **k3s Version:** v1.33.6+k3s1
- **Network:** VLAN 145

### Target Cluster
- **Type:** VMs
- **IPs:** 10.88.145.180, .181, .182
- **k3s Version:** v1.33.6+k3s1 (same)
- **Network:** VLAN 145 (same)

### Shared Resources
- **NFS Server:** 10.88.145.173 (CTID 303)
- **NFS Path (old):** /export/k3s
- **NFS Path (new):** /export/k3s-vm
- **MetalLB Pool:** 10.88.145.200-210 (same)

### Components
- Flux (6 controllers)
- Traefik (LoadBalancer)
- kube-prometheus-stack (Monitoring)
- MetalLB (Load balancing)
- NFS provisioner (Storage)
- Longhorn (Distributed storage)

---

## Migration Paths

### Path 1: Speed (Experienced Users)
```
1. Read: QUICKSTART.md (10 min)
2. Create VMs
3. Run scripts in order
4. Verify with 07-verify-migration.sh
5. Update DNS when ready
```

### Path 2: Thorough (Detailed Planning)
```
1. Read: k3s-vm-migration-bootstrap-plan.md (30 min)
2. Read: ARCHITECTURE.md (10 min)
3. Print: MIGRATION-CHECKLIST.md
4. Create VMs
5. Follow plan phase by phase
6. Check off items on checklist
7. Verify at each phase
```

### Path 3: Visual (Team Presentation)
```
1. Read: K3S-MIGRATION-SUMMARY.md (5 min)
2. Review: ARCHITECTURE.md (diagrams)
3. Present to team
4. Print: MIGRATION-CHECKLIST.md for tracking
5. Reference: README.md during execution
```

---

## Common Tasks

### Find Information About...

**Scripts:**
- Overview → README.md
- Usage → QUICKSTART.md
- Details → k3s-vm-migration-bootstrap-plan.md (each phase)

**Architecture:**
- Network diagram → ARCHITECTURE.md
- Component layout → ARCHITECTURE.md
- Data flow → ARCHITECTURE.md

**Timeline:**
- Quick estimate → K3S-MIGRATION-SUMMARY.md
- Detailed phases → k3s-vm-migration-bootstrap-plan.md
- Day-by-day → MIGRATION-CHECKLIST.md

**Troubleshooting:**
- Quick fixes → QUICKSTART.md
- Detailed guide → k3s-vm-migration-bootstrap-plan.md
- Per-script → README.md

**Rollback:**
- Quick procedure → QUICKSTART.md
- Detailed plan → k3s-vm-migration-bootstrap-plan.md
- Checklist → MIGRATION-CHECKLIST.md

---

## Document Stats

| Document | Lines | Words | Purpose |
|----------|-------|-------|---------|
| k3s-vm-migration-bootstrap-plan.md | ~1000 | ~15,000 | Main guide |
| QUICKSTART.md | ~500 | ~3,500 | Fast track |
| MIGRATION-CHECKLIST.md | ~400 | ~2,500 | Progress tracking |
| README.md | ~400 | ~3,000 | Script docs |
| ARCHITECTURE.md | ~600 | ~4,000 | Visual guide |
| K3S-MIGRATION-SUMMARY.md | ~500 | ~3,500 | Overview |
| INDEX.md | ~350 | ~2,000 | Navigation |
| **Total** | **~3,750** | **~33,500** | Complete package |

---

## Getting Started

### First Time User
1. Read **K3S-MIGRATION-SUMMARY.md** for overview (5 min)
2. Choose your path:
   - Fast → **QUICKSTART.md**
   - Thorough → **k3s-vm-migration-bootstrap-plan.md**
   - Visual → **ARCHITECTURE.md**
3. Print **MIGRATION-CHECKLIST.md** for tracking
4. Reference **README.md** during execution

### Returning User
1. Open **MIGRATION-CHECKLIST.md** to see progress
2. Reference **QUICKSTART.md** for commands
3. Check **README.md** if script issues arise
4. Use **k3s-vm-migration-bootstrap-plan.md** for detailed steps

### Team Lead / Manager
1. Read **K3S-MIGRATION-SUMMARY.md** (executive view)
2. Review **ARCHITECTURE.md** (present to team)
3. Understand timeline in **k3s-vm-migration-bootstrap-plan.md**
4. Assign team to use **MIGRATION-CHECKLIST.md**

---

## Support and Resources

### Included Documentation
- Complete migration plan
- Automated scripts
- Verification tools
- Troubleshooting guides
- Visual diagrams
- Progress checklists

### External Resources
- k3s Documentation: https://docs.k3s.io/
- Flux Documentation: https://fluxcd.io/docs/
- MetalLB Documentation: https://metallb.universe.tf/
- Helm Documentation: https://helm.sh/docs/

### Migration Support
- Comprehensive error handling in scripts
- Verification at each phase
- Rollback procedures documented
- Common issues with solutions
- Success criteria clearly defined

---

## Version Information

- **Package Version:** 1.0
- **Created:** 2025-12-12
- **Created By:** Development Master (Cortex Automation System)
- **Source Cluster:** k3s v1.33.6+k3s1
- **Target Cluster:** k3s v1.33.6+k3s1
- **Network:** VLAN 145

---

## Next Steps

1. Choose your learning path above
2. Review appropriate documents
3. Prepare VMs for migration
4. Run backup script
5. Begin migration following chosen path

**Ready to migrate? Start with K3S-MIGRATION-SUMMARY.md or QUICKSTART.md**

---

*All files are located in: /Users/ryandahlberg/Projects/cortex/k3s-vm-migration-scripts/*
