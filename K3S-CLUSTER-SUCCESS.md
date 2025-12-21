# K3s HA Cluster - Successfully Deployed! 🎉

**Date**: 2025-12-20
**Status**: ✅ OPERATIONAL
**Version**: K3s v1.33.6+k3s1

## Cluster Overview

### 7-Node High Availability Configuration

**Master Nodes (Larry) - 3 nodes with embedded etcd:**
| Node | IP | Hostname | Status | Roles |
|---|---|---|---|---|
| VM 300 | 10.88.145.190 | k3s-master01 | ✅ Ready | control-plane, etcd, master |
| VM 303 | 10.88.145.193 | k3s-master02 | ✅ Ready | control-plane, etcd, master |
| VM 306 | 10.88.145.196 | k3s-master03 | ✅ Ready | control-plane, etcd, master |

**Worker Nodes (Darryl) - 4 nodes:**
| Node | IP | Hostname | Status | Roles |
|---|---|---|---|---|
| VM 301 | 10.88.145.191 | k3s-worker01 | ✅ Ready | worker |
| VM 302 | 10.88.145.192 | k3s-worker02 | ✅ Ready | worker |
| VM 304 | 10.88.145.194 | k3s-worker03 | ✅ Ready | worker |
| VM 305 | 10.88.145.195 | k3s-worker04 | ✅ Ready | worker |

## Deployment Details

### K3s Configuration
- **Cluster Init**: Embedded etcd HA cluster (3-node quorum)
- **Traefik**: Disabled (will install separately)
- **ServiceLB**: Disabled (will use MetalLB)
- **Node Taints**: Masters tainted with `CriticalAddonsOnly=true:NoExecute`
- **Kubeconfig Mode**: 644 (allows non-root kubectl access)

### System Pods Running
```
NAMESPACE     NAME                                      READY   STATUS
kube-system   coredns-6d668d687-dvc4w                   1/1     Running
kube-system   local-path-provisioner-869c44bfbd-tfhtz   1/1     Running
kube-system   metrics-server-7bfffcd44-jcq8g            1/1     Running
```

### Remote Access Configured
- **Kubeconfig**: ~/.kube/config (backup created)
- **API Server**: https://10.88.145.190:6443
- **kubectl**: Working from desktop ✅

## Verification Commands

```bash
# View all nodes
kubectl get nodes -o wide

# View all pods
kubectl get pods --all-namespaces

# Check etcd cluster health
kubectl -n kube-system exec -it $(kubectl -n kube-system get pod -l component=etcd -o name | head -1) -- sh -c "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/var/lib/rancher/k3s/server/tls/etcd/server-ca.crt --cert=/var/lib/rancher/k3s/server/tls/etcd/server-client.crt --key=/var/lib/rancher/k3s/server/tls/etcd/server-client.key member list"

# View cluster info
kubectl cluster-info
```

## What Happened

### Issues Encountered & Resolved

1. **Duplicate Hostnames**
   - Problem: Nodes .193 and .196 both had hostname "k3s-master03"
   - Solution: Fixed hostnames to match correct mapping (master01, master02, master03)
   - Lesson: Always verify hostnames before joining nodes to cluster

2. **Node 306 (master03) DNS Issue**
   - Problem: VM .196 was unreachable via SSH
   - Solution: User fixed DNS issue via Proxmox console
   - Result: All 7 nodes now reachable

3. **Hostname Change Mid-Install**
   - Problem: Changing hostname on running K3s node broke the cluster
   - Solution: Uninstalled all K3s, fixed hostnames first, then reinstalled
   - Lesson: Set hostnames correctly BEFORE installing K3s

### Deployment Timeline

1. ✅ Cleaned all 7 nodes (uninstalled existing K3s)
2. ✅ Fixed hostnames on all nodes
3. ✅ Installed K3s on master01 (bootstrap node)
4. ✅ Joined master02 and master03 to cluster
5. ✅ Joined all 4 worker nodes
6. ✅ Configured remote kubectl access
7. ✅ Verified cluster health

## Next Steps

Now that the cluster is running, you can proceed with:

### Phase 1: Core Infrastructure
1. **MetalLB** (LoadBalancer for bare metal)
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.9/config/manifests/metallb-native.yaml
   # Then configure IP pool
   ```

2. **Traefik** (Ingress Controller)
   ```bash
   helm repo add traefik https://traefik.github.io/charts
   helm install traefik traefik/traefik -n kube-system
   ```

3. **Cert-Manager** (SSL Certificates)
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.3/cert-manager.yaml
   ```

### Phase 2: Dashboard Services
1. **Prometheus Stack** (includes Grafana)
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
   ```

2. **Portainer**
   ```bash
   helm repo add portainer https://portainer.github.io/k8s/
   helm install portainer portainer/portainer -n portainer --create-namespace
   ```

### Phase 3: Cortex Resources
- Deploy cortex-resource-manager
- Deploy N8N workflows
- Deploy monitoring dashboards
- Deploy MCP servers (Proxmox, Wazuh, UniFi, etc.)

## Quick Reference

**Master Node Token** (for adding more nodes):
```
K10b341b362d0131307af8937de747ccca52480ecbb517b83ccdcee06c643839ec9::server:b67efbd29831199b241adedd56709ea6
```

**Join Additional Masters:**
```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://10.88.145.190:6443 \
  --token <NODE_TOKEN> \
  --disable traefik \
  --disable servicelb \
  --write-kubeconfig-mode 644 \
  --tls-san <THIS_NODE_IP> \
  --node-taint CriticalAddonsOnly=true:NoExecute
```

**Join Additional Workers:**
```bash
curl -sfL https://get.k3s.io | sh -s - agent \
  --server https://10.88.145.190:6443 \
  --token <NODE_TOKEN>
```

## Success Metrics

✅ All 7 nodes STATUS=Ready
✅ 3-master HA etcd quorum established
✅ All core system pods running
✅ Remote kubectl access working
✅ Cluster API responding on all master nodes
✅ Workers able to schedule pods

---

**The K3s HA cluster is now ready for dashboard services installation!** 🚀
