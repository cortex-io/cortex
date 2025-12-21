# K3s Cluster Diagnostic Report
**Date**: 2025-12-20T21:26:00Z
**Status**: CLUSTER DOWN - CRITICAL

## Node Mapping Discovery

### Reachable Nodes:
| IP | Hostname | Expected Role | Actual Status |
|---|---|---|---|
| 10.88.145.190 | k3s-master02 | Master 01 (Larry-1) | **WRONG NODE** - K3s service failing (etcd cluster issue) |
| 10.88.145.191 | k3s-worker01 | Worker 01 (Darryl-1) | Reachable |
| 10.88.145.192 | k3s-worker02 | Master 02 (Larry-2) | **WRONG NODE** - No K3s service installed |
| 10.88.145.193 | k3s-master03 | Master 03 (Larry-3) | Reachable - status unknown |
| 10.88.145.194 | k3s-worker03 | Worker 03 (Darryl-3) | Reachable |
| 10.88.145.195 | k3s-worker04 | Worker 04 (Darryl-4) | Reachable |

### Unreachable Nodes:
| IP | Expected Node | Status |
|---|---|---|
| 10.88.145.196 | Master 03 (Larry-3) | SSH timeout - VM down or network issue |
| 10.88.145.197 | Worker 02 (Darryl-2) | SSH timeout - VM down or network issue |
| 10.88.145.198 | ? | SSH timeout |

### Missing:
- **k3s-master01**: Not found at expected IP (.190) - CRITICAL!

## Critical Issues Identified

### 1. IP Address Mismapping (CRITICAL)
The IP addresses do not match the expected node assignments:
- 10.88.145.190 has k3s-master02 instead of k3s-master01
- 10.88.145.192 has k3s-worker02 instead of k3s-master02
- k3s-master01 is missing entirely

### 2. K3s Service Failures

**10.88.145.190 (k3s-master02)**:
- Status: `activating (start)` since 21:18:56 UTC (stuck for 6+ minutes)
- Error: `failed to find remote peer in cluster`
- Error: `Failed to test etcd connection: failed to get etcd status: rpc error: code = Unavailable desc = connection error: desc = "transport: authentication handshake failed: context deadline exceeded"`
- Root Cause: etcd cluster quorum lost - trying to find peer with same member-id (fa32861dca4e5286)
- API Server: Returns HTTP 503 "runtime core not ready"

**10.88.145.192 (k3s-worker02)**:
- Status: K3s service not installed
- Error: `Unit k3s.service could not be found`
- This is a WORKER node at a MASTER IP address

### 3. Unreachable VMs
- 10.88.145.196: SSH timeout (expected to be master03)
- 10.88.145.197: SSH timeout (expected to be worker02)

## Impact Assessment

### Dashboard Services Status: UNKNOWN
Cannot check because:
- K3s API server is unavailable (HTTP 503)
- kubectl commands fail with "ServiceUnavailable"
- No cluster access available

Expected services that are likely down:
- Grafana
- Prometheus
- Traefik
- Portainer
- All other K3s workloads

### Root Cause Analysis

**Primary Issue**: IP address reassignments (possibly from earlier conversation) resulted in:
1. Master nodes at wrong IPs
2. Worker nodes at master IPs
3. etcd cluster cannot form quorum (needs 2/3 masters, only have 1 partially working)
4. k3s-master01 completely missing

**Secondary Issue**: etcd cluster state corruption
- master02 is looking for peers but can't find them
- Embedded etcd cannot form quorum
- API server won't start without etcd quorum

## Recommended Recovery Steps

### Option 1: Fix IP Addresses (Recommended if VMs are intact)
1. Locate k3s-master01 VM in Proxmox
2. Verify all 7 VMs are running in Proxmox
3. Correct the IP addresses to match:
   - 10.88.145.190 → k3s-master01
   - 10.88.145.192 → k3s-master02
   - 10.88.145.196 → k3s-master03
   - 10.88.145.191 → k3s-worker01
   - 10.88.145.193 → k3s-worker02
   - 10.88.145.194 → k3s-worker03
   - 10.88.145.195 → k3s-worker04
4. Restart K3s services on all master nodes
5. Check etcd cluster health

### Option 2: etcd Cluster Reset (If IP fix doesn't work)
1. Fix IPs first (as above)
2. Stop K3s on all masters
3. Reset etcd cluster:
   ```bash
   rm -rf /var/lib/rancher/k3s/server/db/
   ```
4. Rejoin masters to cluster
5. Workers should reconnect automatically

### Option 3: Full Cluster Rebuild (Last resort)
If VMs are corrupted or missing:
1. Verify VM status in Proxmox
2. Restore from snapshots if available
3. Or rebuild cluster from scratch

## Next Steps

**IMMEDIATE**:
1. Check Proxmox to see actual VM status and IP assignments
2. Locate missing k3s-master01
3. Verify which VMs are powered on

**THEN**:
Choose recovery path based on findings.
