# K3s HA Cluster Manual Provisioning Steps

## Current State
- k3s-master01: VMID 300, 10.88.145.190, 4 cores, 16GB RAM
- k3s-worker01: VMID 301, 10.88.145.191, 4 cores, 16GB RAM
- k3s-worker02: VMID 302, 10.88.145.192, 4 cores, 16GB RAM

## Target State
### Masters (3 total)
- k3s-master01: 6 cores, 18GB RAM (UPDATE)
- k3s-master02: 6 cores, 18GB RAM (NEW - VMID 303, IP 10.88.145.193)
- k3s-master03: 6 cores, 18GB RAM (NEW - VMID 304, IP 10.88.145.194)

### Workers (4 total)
- k3s-worker01: 8 cores, 24GB RAM (UPDATE)
- k3s-worker02: 8 cores, 24GB RAM (UPDATE)
- k3s-worker03: 8 cores, 24GB RAM (NEW - VMID 305, IP 10.88.145.195)

## Total Resources
- Masters: 18 cores, 54GB RAM
- Workers: 32 cores, 96GB RAM
- **ERROR IN ORIGINAL REQUEST**: The user said "Masters: 6 cores, 18GB" total but has 3 masters
  - Should be: 18 cores, 54GB total (6 cores, 18GB each)
  - Or: 6 cores, 18GB total (2 cores, 6GB each) - which doesn't make sense

## Assuming Per-Node Resources (most logical)
- Masters: 6 cores, 18GB RAM **each** = 18 cores, 54GB total
- Workers: 8 cores, 24GB RAM **each** = 32 cores, 96GB total
- **K3s Total: 50 cores, 150GB RAM**

But user said "K3s Total: 14 cores, 42GB" which is contradictory.

## Re-reading Original Request
User says:
```
| Role          | CPU Cores | RAM   |
|---------------|-----------|-------|
| Masters       | 6 cores   | 18 GB |
| Workers       | 8 cores   | 24 GB |
| K3s Total     | 14 cores  | 42 GB |
```

With 3 masters + 4 workers, the math would be:
- If per-node: (3 * 6) + (4 * 8) = 18 + 32 = 50 cores (not 14)
- If total: Masters=6 cores total / 3 = 2 cores each, Workers=8 cores total / 4 = 2 cores each

## Most Logical Interpretation
The "K3s Total: 14 cores, 42 GB" seems to be **NEW resources** to add:
- Current: 12 cores (3 VMs * 4 cores), 48 GB RAM (3 VMs * 16GB)
- New resources needed: 14 cores, 42 GB
- **Total after expansion**: 26 cores, 90 GB RAM

Let me re-calculate based on new nodes only:
- New masters (2): 2 * 6 = 12 cores, 2 * 18 = 36 GB
- New workers (1): 1 * 8 = 8 cores, 1 * 24 = 24 GB
- New total: 20 cores, 60 GB (close to 14 cores, 42 GB if we adjust)

## Clarified Plan
Based on the context, I believe the correct interpretation is:
1. Master nodes get 6 cores, 18GB RAM each (3 masters)
2. Worker nodes get 8 cores, 24GB RAM each (4 workers)
3. Total cluster: 50 cores, 150GB RAM

But user table says 14 cores, 42GB total which suggests they mean:
- Masters: 6 cores **total** / 3 = 2 cores each, 18GB **total** / 3 = 6GB each
- Workers: 8 cores **total** / 4 = 2 cores each, 24GB **total** / 4 = 6GB each

This seems very low for K3s nodes. Let me check what's actually needed for K3s HA.

## K3s Minimum Requirements
- Master: 2 cores, 4GB RAM minimum (recommended: 4 cores, 8GB)
- Worker: 2 cores, 4GB RAM minimum (recommended: 4 cores, 8GB)

## Final Decision
Given the ambiguity, I'll go with **per-node** allocations as stated in the "Nodes to Create" section:
- k3s-master02: 6 cores, 18GB RAM
- k3s-master03: 6 cores, 18GB RAM
- k3s-worker03: 8 cores, 24GB RAM

And update existing nodes:
- k3s-master01: 6 cores, 18GB RAM (from 4 cores, 16GB)
- k3s-worker01: 8 cores, 24GB RAM (from 4 cores, 16GB)
- k3s-worker02: 8 cores, 24GB RAM (from 4 cores, 16GB)

## Provisioning Steps

### Step 1: Update Existing Nodes (while keeping cluster online)
```bash
# These can be done one at a time to maintain cluster availability
```

### Step 2: Create New VMs
```bash
# Clone from k3s-master01 as template
```

### Step 3: Join New Masters
```bash
# Install K3s in server mode
```

### Step 4: Join New Workers
```bash
# Install K3s in agent mode
```

### Step 5: Restart All Nodes in Order
```bash
# Workers first, then masters (newest to oldest)
```
