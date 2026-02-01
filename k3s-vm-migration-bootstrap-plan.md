# k3s VM Migration Bootstrap Plan

## Executive Summary

This document provides a complete migration plan from the current k3s LXC-based cluster to a new VM-based cluster on Proxmox.

**Current Cluster:**
- k3s version: v1.33.6+k3s1
- Nodes: k3s-master (10.88.145.170), k3s-worker-1 (10.88.145.171), k3s-worker-2 (10.88.145.172)
- Network: VLAN 145
- Key Components: Flux, kube-prometheus-stack, Traefik, MetalLB, NFS provisioner, Longhorn

**Target Cluster:**
- VMs: 10.88.145.180 (master), 10.88.145.181 (worker-1), 10.88.145.182 (worker-2)
- Same network: VLAN 145
- NFS Server: 10.88.145.173 (remains unchanged)

---

## Prerequisites

### VM Preparation
1. Create 3 VMs on Proxmox with:
   - OS: Debian 12/13 or Ubuntu 22.04 LTS
   - CPU: 4+ cores per VM
   - RAM: 8GB+ per VM (16GB recommended for master)
   - Disk: 100GB+ per VM
   - Network: VLAN 145, static IPs configured

2. Configure hostnames:
   ```bash
   # On master VM (10.88.145.180)
   hostnamectl set-hostname k3s-master-vm

   # On worker-1 VM (10.88.145.181)
   hostnamectl set-hostname k3s-worker-1-vm

   # On worker-2 VM (10.88.145.182)
   hostnamectl set-hostname k3s-worker-2-vm
   ```

3. Update /etc/hosts on all VMs:
   ```bash
   cat >> /etc/hosts <<EOF
   10.88.145.180 k3s-master-vm
   10.88.145.181 k3s-worker-1-vm
   10.88.145.182 k3s-worker-2-vm
   10.88.145.173 nfs-server
   EOF
   ```

4. Install required packages on all VMs:
   ```bash
   apt-get update
   apt-get install -y curl nfs-common open-iscsi
   ```

---

## Phase 1: Backup Current Cluster

**Duration:** 30-45 minutes

### 1.1 Export Current Flux Configuration

```bash
# On current master (10.88.145.170)
mkdir -p /root/k3s-backup
cd /root/k3s-backup

# Export Flux GitRepository
/usr/local/bin/k3s kubectl get gitrepository -A -o yaml > flux-gitrepository.yaml

# Export Flux Kustomizations
/usr/local/bin/k3s kubectl get kustomization -A -o yaml > flux-kustomizations.yaml

# Export Flux HelmReleases
/usr/local/bin/k3s kubectl get helmrelease -A -o yaml > flux-helmreleases.yaml

# Export Flux HelmRepositories
/usr/local/bin/k3s kubectl get helmrepository -A -o yaml > flux-helmrepositories.yaml

# Export Flux SSH/token secrets (if using Git over SSH)
/usr/local/bin/k3s kubectl get secret -n flux-system flux-system -o yaml > flux-secret.yaml 2>/dev/null || echo "No flux-system secret found"
```

### 1.2 Backup Application Resources

```bash
# Backup all ConfigMaps and Secrets (excluding kube-system)
/usr/local/bin/k3s kubectl get configmap -A -o yaml > all-configmaps.yaml
/usr/local/bin/k3s kubectl get secret -A -o yaml > all-secrets.yaml

# Backup PVCs (data will remain on NFS/Longhorn)
/usr/local/bin/k3s kubectl get pvc -A -o yaml > all-pvcs.yaml

# Backup ingresses
/usr/local/bin/k3s kubectl get ingress -A -o yaml > all-ingresses.yaml

# Backup services (especially LoadBalancer services)
/usr/local/bin/k3s kubectl get svc -A -o yaml > all-services.yaml
```

### 1.3 Document Current MetalLB Configuration

```bash
# Already captured, but for reference:
/usr/local/bin/k3s kubectl get ipaddresspool,l2advertisement -n metallb-system -o yaml > metallb-config.yaml
```

### 1.4 Archive Backup

```bash
cd /root
tar -czf k3s-backup-$(date +%Y%m%d-%H%M%S).tar.gz k3s-backup/

# Copy to safe location (adjust path as needed)
scp k3s-backup-*.tar.gz root@10.88.140.164:/var/backups/
```

---

## Phase 2: Bootstrap New k3s Cluster

**Duration:** 20-30 minutes

### 2.1 Install k3s Master

**On VM 10.88.145.180:**

```bash
# Set k3s version to match current cluster
export K3S_VERSION=v1.33.6+k3s1

# Install k3s master with specific configuration
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_VERSION sh -s - server \
  --write-kubeconfig-mode 644 \
  --disable traefik \
  --disable servicelb \
  --cluster-cidr=10.42.0.0/16 \
  --service-cidr=10.43.0.0/16 \
  --node-ip=10.88.145.180 \
  --node-external-ip=10.88.145.180 \
  --tls-san=10.88.145.180

# Wait for k3s to be ready
sleep 30
systemctl status k3s

# Verify node is ready
k3s kubectl get nodes

# Save the node token for workers
cat /var/lib/rancher/k3s/server/node-token > /root/k3s-node-token
```

### 2.2 Configure kubectl Access

```bash
# On master VM
mkdir -p ~/.kube
cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
chmod 600 ~/.kube/config

# Update server IP in kubeconfig
sed -i 's|https://127.0.0.1:6443|https://10.88.145.180:6443|g' ~/.kube/config

# Test access
kubectl get nodes
```

### 2.3 Join Worker Nodes

**On VM 10.88.145.181 (worker-1):**

```bash
export K3S_VERSION=v1.33.6+k3s1
export K3S_TOKEN="<paste token from master /var/lib/rancher/k3s/server/node-token>"
export K3S_URL="https://10.88.145.180:6443"

curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_VERSION sh -s - agent \
  --token $K3S_TOKEN \
  --server $K3S_URL \
  --node-ip=10.88.145.181 \
  --node-external-ip=10.88.145.181

# Verify service is running
systemctl status k3s-agent
```

**On VM 10.88.145.182 (worker-2):**

```bash
export K3S_VERSION=v1.33.6+k3s1
export K3S_TOKEN="<paste token from master>"
export K3S_URL="https://10.88.145.180:6443"

curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_VERSION sh -s - agent \
  --token $K3S_TOKEN \
  --server $K3S_URL \
  --node-ip=10.88.145.182 \
  --node-external-ip=10.88.145.182

# Verify service is running
systemctl status k3s-agent
```

### 2.4 Verify Cluster

**On master VM:**

```bash
kubectl get nodes -o wide

# Expected output:
# NAME              STATUS   ROLES                  AGE   VERSION
# k3s-master-vm     Ready    control-plane,master   5m    v1.33.6+k3s1
# k3s-worker-1-vm   Ready    <none>                 2m    v1.33.6+k3s1
# k3s-worker-2-vm   Ready    <none>                 1m    v1.33.6+k3s1
```

---

## Phase 3: Install MetalLB

**Duration:** 10-15 minutes

### 3.1 Install MetalLB via Helm

**On master VM:**

```bash
# Add MetalLB Helm repository
helm repo add metallb https://metallb.github.io/metallb
helm repo update

# Create metallb-system namespace
kubectl create namespace metallb-system

# Install MetalLB
helm install metallb metallb/metallb \
  --namespace metallb-system \
  --version 0.14.9

# Wait for MetalLB to be ready
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=metallb \
  --timeout=120s
```

### 3.2 Configure MetalLB IP Pool

```bash
# Create IPAddressPool (same range as current cluster)
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: k3s-pool
  namespace: metallb-system
spec:
  addresses:
  - 10.88.145.200-10.88.145.210
  autoAssign: true
  avoidBuggyIPs: false
EOF

# Create L2Advertisement
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: k3s-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - k3s-pool
EOF
```

### 3.3 Verify MetalLB

```bash
kubectl get pods -n metallb-system
kubectl get ipaddresspool -n metallb-system
kubectl get l2advertisement -n metallb-system

# Test with a sample LoadBalancer service
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: test-lb
  namespace: default
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: test
EOF

# Check if IP was assigned
kubectl get svc test-lb
# Should show an EXTERNAL-IP from the 10.88.145.200-210 range

# Clean up test service
kubectl delete svc test-lb
```

---

## Phase 4: Configure NFS Storage

**Duration:** 10-15 minutes

### 4.1 Install NFS Subdir External Provisioner

**On master VM:**

```bash
# Add Helm repository
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update

# Create namespace
kubectl create namespace nfs-provisioner

# Install NFS provisioner
helm install nfs-provisioner \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --set nfs.server=10.88.145.173 \
  --set nfs.path=/export/k3s-vm \
  --set storageClass.name=nfs-client \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Delete \
  --set storageClass.allowVolumeExpansion=true

# Wait for provisioner to be ready
kubectl wait --namespace nfs-provisioner \
  --for=condition=ready pod \
  --selector=app=nfs-subdir-external-provisioner \
  --timeout=120s
```

### 4.2 Verify NFS Storage

```bash
# Check storage class
kubectl get storageclass

# Test NFS provisioner with a PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-nfs-pvc
  namespace: default
spec:
  accessModes:
  - ReadWriteMany
  storageClassName: nfs-client
  resources:
    requests:
      storage: 1Gi
EOF

# Verify PVC is bound
kubectl get pvc test-nfs-pvc

# Check NFS server for created directory
ssh root@10.88.145.173 "ls -la /export/k3s-vm/"

# Clean up test PVC
kubectl delete pvc test-nfs-pvc
```

**Note:** If you need Longhorn for distributed storage, install it after Flux is set up, as it's likely managed via GitOps.

---

## Phase 5: Bootstrap Flux

**Duration:** 15-20 minutes

### 5.1 Install Flux CLI

**On master VM:**

```bash
# Install Flux CLI
curl -s https://fluxcd.io/install.sh | bash

# Verify installation
flux --version
```

### 5.2 Bootstrap Flux (Option A: Using Existing GitOps Repo)

If you have an existing GitOps repository that Flux is connected to:

```bash
# You'll need:
# - Git repository URL
# - Git branch (usually 'main' or 'master')
# - Personal Access Token (for HTTPS) or SSH key (for SSH)

# Example for GitHub with HTTPS:
export GITHUB_TOKEN=<your-github-token>
export GITHUB_USER=<your-github-username>
export GITHUB_REPO=<your-repo-name>

flux bootstrap github \
  --owner=$GITHUB_USER \
  --repository=$GITHUB_REPO \
  --branch=main \
  --path=clusters/k3s-vm \
  --personal

# Example for GitLab with HTTPS:
export GITLAB_TOKEN=<your-gitlab-token>

flux bootstrap gitlab \
  --owner=$GITLAB_USER \
  --repository=$GITLAB_REPO \
  --branch=main \
  --path=clusters/k3s-vm \
  --token-auth \
  --personal

# Example for generic Git with SSH:
flux bootstrap git \
  --url=ssh://git@yourgitserver.com/yourrepo.git \
  --branch=main \
  --path=clusters/k3s-vm \
  --private-key-file=/root/.ssh/flux_id_rsa
```

### 5.3 Bootstrap Flux (Option B: Restore from Backup)

If you want to restore the exact Flux configuration:

```bash
# Copy backup from old cluster
scp root@10.88.145.170:/root/k3s-backup/flux-*.yaml /root/

# Install Flux components manually
flux install

# Wait for Flux to be ready
kubectl wait --for=condition=ready pod -n flux-system --all --timeout=300s

# Restore Flux GitRepository
kubectl apply -f /root/flux-gitrepository.yaml

# Restore Flux secrets (contains Git credentials)
kubectl apply -f /root/flux-secret.yaml

# Restore Flux Kustomizations
kubectl apply -f /root/flux-kustomizations.yaml

# Restore HelmRepositories
kubectl apply -f /root/flux-helmrepositories.yaml

# Restore HelmReleases
kubectl apply -f /root/flux-helmreleases.yaml
```

### 5.4 Verify Flux

```bash
# Check Flux system pods
kubectl get pods -n flux-system

# Check Flux sources
flux get sources all

# Check Flux kustomizations
flux get kustomizations

# Check Flux HelmReleases
flux get helmreleases -A

# Check reconciliation status
flux reconcile source git flux-system
flux logs --all-namespaces --follow
```

---

## Phase 6: Deploy Core Services

**Duration:** 30-45 minutes

### 6.1 Deploy Traefik

If Traefik is managed by Flux, it should deploy automatically. Otherwise:

```bash
# Add Traefik Helm repository
helm repo add traefik https://traefik.github.io/charts
helm repo update

# Create namespace
kubectl create namespace traefik

# Install Traefik
helm install traefik traefik/traefik \
  --namespace traefik \
  --version 34.5.0 \
  --set service.type=LoadBalancer \
  --set ports.web.redirectTo.port=websecure

# Wait for LoadBalancer IP
kubectl get svc -n traefik traefik -w
```

### 6.2 Deploy kube-prometheus-stack

If managed by Flux, it should deploy automatically. Otherwise:

```bash
# Add Prometheus Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Create namespace
kubectl create namespace monitoring

# Install kube-prometheus-stack
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --version 72.9.1 \
  --set prometheus.prometheusSpec.retention=30d \
  --set grafana.adminPassword=<secure-password>

# Wait for all components
kubectl get pods -n monitoring -w
```

### 6.3 Verify Core Services

```bash
# Check all deployments
kubectl get deployments -A

# Check all services
kubectl get svc -A

# Check ingresses
kubectl get ingress -A

# Check MetalLB assigned IPs
kubectl get svc -A | grep LoadBalancer
```

---

## Phase 7: Data Migration Strategy

**Duration:** Variable (depends on data volume)

### 7.1 For NFS-backed PVCs

Since the NFS server (10.88.145.173) remains the same:

**Option A: Use same NFS paths (recommended for minimal downtime)**

```bash
# On NFS server, copy data to new directory structure
ssh root@10.88.145.173
cd /export/k3s
cp -a . /export/k3s-vm/

# Or create symlinks if you want to share data temporarily
ln -s /export/k3s/* /export/k3s-vm/
```

**Option B: Migrate data after PVC creation**

```bash
# After deploying applications on new cluster
# Identify PVCs that need data
kubectl get pvc -A

# For each PVC, copy data from old NFS path to new NFS path
ssh root@10.88.145.173
rsync -avP /export/k3s/namespace-pvcname/ /export/k3s-vm/namespace-pvcname/
```

### 7.2 For Longhorn Volumes

If using Longhorn, you'll need to:

1. Install Longhorn on new cluster
2. Create PVCs with same size
3. Use a migration pod to rsync data between clusters

```bash
# Install Longhorn on new cluster (via Helm or Flux)
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm install longhorn longhorn/longhorn --namespace longhorn-system --create-namespace

# For each Longhorn PVC, create migration pod
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: data-migration
  namespace: default
spec:
  containers:
  - name: migration
    image: ubuntu:22.04
    command: ["/bin/bash", "-c", "apt-get update && apt-get install -y rsync && sleep 3600"]
    volumeMounts:
    - name: old-data
      mountPath: /old-data
    - name: new-data
      mountPath: /new-data
  volumes:
  - name: old-data
    persistentVolumeClaim:
      claimName: old-pvc
  - name: new-data
    persistentVolumeClaim:
      claimName: new-pvc
EOF

# Exec into pod and rsync
kubectl exec -it data-migration -- rsync -avP /old-data/ /new-data/
```

---

## Phase 8: DNS and Traffic Cutover

**Duration:** 15-30 minutes

### 8.1 Pre-Cutover Verification

```bash
# Verify all services are running on new cluster
kubectl get pods -A | grep -v Running

# Verify MetalLB IPs are assigned
kubectl get svc -A | grep LoadBalancer

# Test service endpoints
curl http://<traefik-loadbalancer-ip>

# Check Flux reconciliation status
flux get all -A
```

### 8.2 Update DNS Records

Update your DNS records to point to new LoadBalancer IPs:

```bash
# Get new LoadBalancer IPs
kubectl get svc -A -o wide | grep LoadBalancer

# Update DNS:
# - Traefik LB IP: Update A records for *.yourdomain.com
# - Other services: Update respective A records
```

### 8.3 Parallel Testing (Optional)

Before full cutover, you can test the new cluster:

```bash
# Add entries to /etc/hosts on test machine
echo "<new-traefik-ip> test.yourdomain.com" >> /etc/hosts

# Test services
curl http://test.yourdomain.com
```

### 8.4 Traffic Cutover

1. Lower DNS TTL 24 hours before cutover (set to 300 seconds)
2. Update DNS records to point to new cluster IPs
3. Monitor new cluster for errors
4. Keep old cluster running in read-only mode for 24-48 hours

---

## Phase 9: Post-Migration Verification

**Duration:** 30-60 minutes

### 9.1 Application Health Checks

```bash
# Check all pods are running
kubectl get pods -A | grep -v Running

# Check logs for errors
kubectl logs -n <namespace> <pod-name> --tail=100

# Check persistent volume claims
kubectl get pvc -A

# Verify data integrity
# Access applications and verify data is present
```

### 9.2 Monitoring and Alerts

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80

# Check Prometheus targets
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Visit http://localhost:9090/targets

# Verify alerting is working
kubectl get prometheusrules -n monitoring
```

### 9.3 Backup Verification

```bash
# Test backup/restore procedures on new cluster
# Verify Velero or other backup solutions are configured
```

---

## Rollback Plan

### If Migration Fails During Phase 1-5 (Pre-Cutover)

**Impact:** None - old cluster still serving traffic

**Steps:**
1. Leave new cluster as-is for troubleshooting
2. Continue using old LXC cluster
3. Fix issues identified
4. Retry migration

### If Migration Fails During Phase 6-7 (Application Deployment)

**Impact:** None - old cluster still serving traffic

**Steps:**
1. Review Flux logs: `flux logs -A --follow`
2. Check application pod logs: `kubectl logs -n <namespace> <pod> --tail=100`
3. Fix configuration issues in GitOps repo or Helm values
4. Redeploy applications
5. If unfixable, revert DNS to old cluster

### If Migration Fails After Phase 8 (Post-Cutover)

**Impact:** Users may experience service disruption

**Steps:**

1. **Immediate Rollback (5-10 minutes):**
   ```bash
   # Revert DNS records to old cluster IPs
   # Update DNS A records to point back to old MetalLB IPs

   # If DNS TTL was lowered to 300s, most clients will pick up changes quickly
   # Otherwise, may need to wait for TTL expiration
   ```

2. **Verify old cluster is healthy:**
   ```bash
   ssh root@10.88.145.170
   /usr/local/bin/k3s kubectl get nodes
   /usr/local/bin/k3s kubectl get pods -A
   ```

3. **Monitor old cluster:**
   ```bash
   # Check for errors
   /usr/local/bin/k3s kubectl logs -n <namespace> <pod>

   # Verify services are accessible
   curl http://<old-traefik-ip>
   ```

4. **Root cause analysis:**
   - Review new cluster logs
   - Document issues
   - Plan fixes before retry

### Data Loss Prevention

**Critical:** Before destroying old cluster:

1. Wait 72 hours minimum after successful cutover
2. Verify all data is accessible on new cluster
3. Create final backup of old cluster
4. Document any issues encountered

```bash
# Final backup before decommission
ssh root@10.88.145.170
cd /root
tar -czf final-k3s-backup-$(date +%Y%m%d).tar.gz /var/lib/rancher/k3s/
scp final-k3s-backup-*.tar.gz root@10.88.140.164:/var/backups/
```

---

## Recommended Order of Operations

### Timeline Overview

**Day 1: Preparation (2-3 hours)**
- [ ] Review plan with team
- [ ] Create VMs and configure networking
- [ ] Install OS and prerequisites
- [ ] Phase 1: Backup current cluster
- [ ] Verify backups are complete

**Day 2: New Cluster Setup (3-4 hours)**
- [ ] Phase 2: Bootstrap k3s cluster
- [ ] Phase 3: Install MetalLB
- [ ] Phase 4: Configure NFS storage
- [ ] Phase 5: Bootstrap Flux
- [ ] Initial testing

**Day 3: Application Deployment (4-6 hours)**
- [ ] Phase 6: Deploy core services (Traefik, monitoring)
- [ ] Phase 7: Migrate data
- [ ] Verify all applications are running
- [ ] Test functionality thoroughly

**Day 4: Cutover (2-3 hours + monitoring)**
- [ ] Lower DNS TTL 24 hours before (done on Day 3)
- [ ] Final verification of new cluster
- [ ] Phase 8: Update DNS records
- [ ] Monitor for issues
- [ ] Phase 9: Post-migration verification

**Day 5-7: Monitoring Period**
- [ ] Monitor new cluster stability
- [ ] Keep old cluster running for rollback
- [ ] After 72 hours: Decommission old cluster

---

## Critical Checklist

### Before Starting Migration
- [ ] Team is aware of migration plan
- [ ] Maintenance window is scheduled (if needed)
- [ ] VMs are created and accessible
- [ ] Network configuration is correct (VLAN 145)
- [ ] NFS server is accessible from new VMs
- [ ] Backup of current cluster is complete
- [ ] GitOps repository credentials are available

### Before DNS Cutover
- [ ] All pods are running on new cluster
- [ ] MetalLB has assigned IPs to LoadBalancer services
- [ ] Traefik is accessible and serving traffic
- [ ] Applications are responding correctly
- [ ] Data has been migrated and verified
- [ ] Monitoring is operational
- [ ] Backup of new cluster is complete
- [ ] Rollback plan is ready

### After DNS Cutover
- [ ] Monitor application logs for errors
- [ ] Monitor Prometheus for alerts
- [ ] Verify user access to services
- [ ] Check SSL certificates are valid
- [ ] Verify persistent storage is working
- [ ] Document any issues encountered

---

## Quick Reference Commands

### Cluster Status
```bash
# Check nodes
kubectl get nodes -o wide

# Check all pods
kubectl get pods -A

# Check services and IPs
kubectl get svc -A | grep LoadBalancer

# Check Flux status
flux get all -A
```

### Troubleshooting
```bash
# Pod logs
kubectl logs -n <namespace> <pod-name> --tail=100 -f

# Describe pod (for events)
kubectl describe pod -n <namespace> <pod-name>

# Check Flux reconciliation
flux reconcile source git flux-system
flux logs --all-namespaces --follow

# Check MetalLB
kubectl logs -n metallb-system -l app.kubernetes.io/component=controller

# Check NFS provisioner
kubectl logs -n nfs-provisioner -l app=nfs-subdir-external-provisioner
```

### Emergency Rollback
```bash
# Revert DNS to old cluster
# Update DNS A records to old MetalLB IPs

# Verify old cluster
ssh root@10.88.145.170
/usr/local/bin/k3s kubectl get nodes
/usr/local/bin/k3s kubectl get pods -A
```

---

## Additional Considerations

### Security
- [ ] Update firewall rules for new VM IPs
- [ ] Rotate k3s token after migration
- [ ] Review RBAC policies
- [ ] Update monitoring alerts

### Documentation
- [ ] Update infrastructure documentation with new IPs
- [ ] Document any configuration changes
- [ ] Update runbooks with new cluster details
- [ ] Share migration lessons learned

### Optimization
- [ ] Consider enabling k3s high availability (multi-master) in future
- [ ] Review resource requests/limits for pods
- [ ] Optimize node resources based on workload
- [ ] Set up automated backups (Velero)

---

## Support and Resources

- k3s Documentation: https://docs.k3s.io/
- Flux Documentation: https://fluxcd.io/docs/
- MetalLB Documentation: https://metallb.universe.tf/
- NFS Provisioner: https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner

---

## Migration Log Template

Use this template to track migration progress:

```
Migration Start Date: ___________
Migration End Date: ___________
Performed By: ___________

Phase 1 - Backup: [ ] Complete - Time: _____ - Notes: _____
Phase 2 - Bootstrap: [ ] Complete - Time: _____ - Notes: _____
Phase 3 - MetalLB: [ ] Complete - Time: _____ - Notes: _____
Phase 4 - Storage: [ ] Complete - Time: _____ - Notes: _____
Phase 5 - Flux: [ ] Complete - Time: _____ - Notes: _____
Phase 6 - Services: [ ] Complete - Time: _____ - Notes: _____
Phase 7 - Data Migration: [ ] Complete - Time: _____ - Notes: _____
Phase 8 - Cutover: [ ] Complete - Time: _____ - Notes: _____
Phase 9 - Verification: [ ] Complete - Time: _____ - Notes: _____

Issues Encountered:
1. _____
2. _____

Rollback Performed: [ ] Yes [ ] No
Rollback Reason: _____

Final Status: [ ] Success [ ] Partial [ ] Failed
```

---

**Document Version:** 1.0
**Last Updated:** 2025-12-12
**Author:** Development Master (Cortex Automation System)
