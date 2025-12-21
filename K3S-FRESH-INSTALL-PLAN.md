# K3s HA Cluster Fresh Installation Plan
**Date**: 2025-12-20
**Status**: Ready to Execute

## Cluster Overview

### Current State
✓ All 6 reachable nodes completely cleaned
- K3s binaries removed
- Data directories removed (/var/lib/rancher, /etc/rancher, /var/lib/kubelet)
- No K3s processes running

### Node Inventory (6 Reachable Nodes)
**Master Nodes (Larry):**
| IP | Hostname | VMID | Status |
|---|---|---|---|
| 10.88.145.190 | k3s-master02 | ? | ✓ Clean & Ready |
| 10.88.145.193 | k3s-master03 | ? | ✓ Clean & Ready |

**Worker Nodes (Darryl):**
| IP | Hostname | VMID | Status |
|---|---|---|---|
| 10.88.145.191 | k3s-worker01 | ? | ✓ Clean & Ready |
| 10.88.145.192 | k3s-worker02 | ? | ✓ Clean & Ready |
| 10.88.145.194 | k3s-worker03 | ? | ✓ Clean & Ready |
| 10.88.145.195 | k3s-worker04 | ? | ✓ Clean & Ready |

**Missing/Unreachable:**
| IP | Expected | Status |
|---|---|---|
| 10.88.145.196 | k3s-master03? | ⚠ SSH Timeout - VM may be powered off |

### Issue: Missing Third Master
- For HA, we need 3 master nodes (etcd quorum requires odd number, minimum 3)
- Currently only have 2 reachable masters: .190 and .193
- Node .196 is unreachable

**Options:**
1. Power on/fix the .196 VM (recommended for true HA)
2. Proceed with 2-master setup (non-HA, but functional)
3. Use one of the worker nodes as a third master

## Installation Plan

### Prerequisites
- [ ] Decide on 2-master or 3-master setup
- [ ] If 3-master: Verify .196 VM status in Proxmox or designate a worker as master

### Phase 1: Install First Master (Bootstrap Node)
**Node**: 10.88.145.190 (k3s-master02)

```bash
# Install K3s with embedded etcd and disable default services
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --disable traefik \
  --disable servicelb \
  --write-kubeconfig-mode 644 \
  --tls-san 10.88.145.190 \
  --node-taint CriticalAddonsOnly=true:NoExecute
```

**What this does:**
- `--cluster-init`: Initialize embedded etcd HA cluster
- `--disable traefik`: We'll install it separately later
- `--disable servicelb`: We'll use MetalLB instead
- `--write-kubeconfig-mode 644`: Allow non-root kubectl access
- `--tls-san`: Add IP to API server certificate
- `--node-taint`: Prevent workloads from running on masters

**After installation:**
- Get the node token: `sudo cat /var/lib/rancher/k3s/server/node-token`
- Verify: `sudo kubectl get nodes`

### Phase 2: Join Additional Master Nodes
**Nodes**: 10.88.145.193 (and 10.88.145.196 if available)

```bash
# On each additional master node
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://10.88.145.190:6443 \
  --token <NODE_TOKEN_FROM_FIRST_MASTER> \
  --disable traefik \
  --disable servicelb \
  --write-kubeconfig-mode 644 \
  --tls-san <THIS_NODE_IP> \
  --node-taint CriticalAddonsOnly=true:NoExecute
```

**Verify after each join:**
```bash
sudo kubectl get nodes
sudo kubectl get pods -n kube-system
```

### Phase 3: Join Worker Nodes
**Nodes**: 10.88.145.191, .192, .194, .195

```bash
# On each worker node
curl -sfL https://get.k3s.io | sh -s - agent \
  --server https://10.88.145.190:6443 \
  --token <NODE_TOKEN_FROM_FIRST_MASTER>
```

**Verify after all workers join:**
```bash
sudo kubectl get nodes -o wide
```

Expected output: All nodes should show STATUS=Ready

### Phase 4: Setup Kubeconfig for Remote Access
**On first master node:**
```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

**On desktop (this machine):**
```bash
# Copy kubeconfig and update server IP
mkdir -p ~/.kube
# Replace 127.0.0.1 with 10.88.145.190 in the config
```

### Phase 5: Install Core Infrastructure
Once cluster is healthy, install:

1. **MetalLB** (LoadBalancer)
   - Configure with IP pool from your network range

2. **Traefik** (Ingress Controller)
   - Install via Helm with custom values

3. **Cert-Manager** (SSL Certificates)
   - For automatic TLS certificates

4. **Longhorn** (Distributed Storage - Optional)
   - For persistent volumes

### Phase 6: Install Dashboard Services
1. **Prometheus Stack** (Monitoring)
   - Includes Grafana, AlertManager

2. **Portainer** (Container Management UI)

## Execution Steps

I'm ready to execute this plan. Before I proceed, please confirm:

1. **Master node count**: Should I proceed with 2 masters (non-HA) or wait/fix the third master at .196?
2. **Installation approach**:
   - **Option A**: I execute all commands via SSH (fully automated)
   - **Option B**: I provide you with commands and you execute manually
   - **Option C**: Mixed - I do infrastructure, you do dashboards

## Post-Installation Verification Checklist
- [ ] All nodes showing STATUS=Ready
- [ ] etcd cluster healthy (if 3+ masters)
- [ ] CoreDNS pods running
- [ ] Can create test deployment
- [ ] LoadBalancer service gets external IP
- [ ] Ingress routing works
- [ ] Persistent volumes can be created

## Questions?
Let me know how you'd like to proceed and I'll execute the plan!
