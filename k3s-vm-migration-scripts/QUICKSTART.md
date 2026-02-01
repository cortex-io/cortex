# k3s VM Migration - Quick Start Guide

This guide will get you migrating from LXC to VMs in the fastest way possible.

## Current State
- LXC Cluster: k3s-master (300), k3s-worker-1 (301), k3s-worker-2 (302)
- IPs: 10.88.145.170, 10.88.145.171, 10.88.145.172
- k3s version: v1.33.6+k3s1
- Components: Flux, Traefik, MetalLB, kube-prometheus-stack, NFS provisioner

## Target State
- VM Cluster: k3s-master-vm, k3s-worker-1-vm, k3s-worker-2-vm
- IPs: 10.88.145.180, 10.88.145.181, 10.88.145.182
- Same k3s version and components

---

## TL;DR - Copy/Paste Migration

### Step 1: Backup (5 minutes)
```bash
cd k3s-vm-migration-scripts
./01-backup-cluster.sh
# Backup saved to ./backups/
```

### Step 2: Bootstrap Master (10 minutes)
```bash
# SSH to master VM
ssh root@10.88.145.180

# Copy and run script
scp 02-bootstrap-master.sh root@10.88.145.180:/root/
ssh root@10.88.145.180 './02-bootstrap-master.sh'

# SAVE THE TOKEN DISPLAYED AT THE END!
```

### Step 3: Bootstrap Workers (10 minutes)
```bash
# Get token from master
TOKEN=$(ssh root@10.88.145.180 'cat /root/k3s-node-token')

# Worker 1
scp 03-bootstrap-worker.sh root@10.88.145.181:/root/
ssh root@10.88.145.181 "export K3S_TOKEN='$TOKEN' && ./03-bootstrap-worker.sh"

# Worker 2
scp 03-bootstrap-worker.sh root@10.88.145.182:/root/
ssh root@10.88.145.182 "export K3S_TOKEN='$TOKEN' && ./03-bootstrap-worker.sh"

# Verify
ssh root@10.88.145.180 'kubectl get nodes'
```

### Step 4: Install MetalLB (5 minutes)
```bash
ssh root@10.88.145.180 'cd /root && ./04-install-metallb.sh'
```

### Step 5: Install NFS Provisioner (5 minutes)
```bash
# First, create NFS export on NFS server
ssh root@10.88.145.173 'mkdir -p /export/k3s-vm && chmod 777 /export/k3s-vm'

# Then install provisioner
ssh root@10.88.145.180 'cd /root && ./05-install-nfs-provisioner.sh'
```

### Step 6: Bootstrap Flux (10 minutes)
```bash
# Interactive - have your Git credentials ready
ssh root@10.88.145.180 'cd /root && ./06-bootstrap-flux.sh'
```

### Step 7: Verify Everything (5 minutes)
```bash
ssh root@10.88.145.180 'cd /root && ./07-verify-migration.sh'
# Should show all checks PASSED
```

### Step 8: Wait for Applications (30-60 minutes)
```bash
# Monitor Flux reconciliation
ssh root@10.88.145.180 'flux logs -A --follow'

# Check pods
ssh root@10.88.145.180 'watch kubectl get pods -A'
```

### Step 9: Test Access
```bash
# Get Traefik LoadBalancer IP
TRAEFIK_IP=$(ssh root@10.88.145.180 "kubectl get svc -n traefik traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'")
echo "Traefik is at: $TRAEFIK_IP"

# Test access
curl http://$TRAEFIK_IP
```

### Step 10: Update DNS
```bash
# 24 hours before: Lower TTL to 300s
# When ready: Update A records to point to new Traefik IP
# Monitor for 72 hours before decommissioning old cluster
```

---

## Detailed Workflow

### Pre-Flight Checklist
- [ ] VMs created (180, 181, 182) with Debian/Ubuntu
- [ ] VMs have 8GB+ RAM, 4+ CPU, 100GB+ disk
- [ ] Static IPs configured on VLAN 145
- [ ] VMs can reach internet
- [ ] VMs can reach NFS server (10.88.145.173)
- [ ] You have Git repository credentials for Flux

### Migration Timeline

**Day 1 - Preparation (2-3 hours)**
1. Review plan and checklist
2. Create and configure VMs
3. Run backup script
4. Verify backup successful

**Day 2 - Cluster Setup (3-4 hours)**
1. Bootstrap master
2. Join workers
3. Install MetalLB
4. Install NFS provisioner
5. Bootstrap Flux
6. Initial verification

**Day 3 - Application Deployment (4-6 hours)**
1. Monitor Flux reconciliation
2. Verify applications are deploying
3. Migrate data if needed
4. Test functionality
5. Run verification script
6. Lower DNS TTL

**Day 4 - Cutover (2-3 hours + monitoring)**
1. Final verification
2. Update DNS records
3. Monitor new cluster
4. Verify user access

**Days 5-7 - Monitoring**
1. Watch for issues
2. Keep old cluster running
3. After 72 hours: Decommission old cluster

---

## Common Issues

### "Cannot connect to cluster"
```bash
# On master, verify k3s is running
systemctl status k3s

# Check kubeconfig
cat ~/.kube/config

# Verify node IP
kubectl get nodes -o wide
```

### "Worker won't join"
```bash
# Verify token
cat /var/lib/rancher/k3s/server/node-token  # on master

# Test connectivity
curl -k https://10.88.145.180:6443  # from worker

# Check logs
journalctl -u k3s-agent -f  # on worker
```

### "MetalLB not assigning IPs"
```bash
# Check controller
kubectl logs -n metallb-system -l app.kubernetes.io/component=controller

# Check IP pool
kubectl get ipaddresspool -n metallb-system -o yaml

# Verify no IP conflicts
nmap -sn 10.88.145.200-210
```

### "NFS provisioner failing"
```bash
# Test NFS from master
showmount -e 10.88.145.173

# Try manual mount
mount -t nfs 10.88.145.173:/export/k3s-vm /mnt

# Check provisioner logs
kubectl logs -n nfs-provisioner -l app=nfs-subdir-external-provisioner
```

### "Flux not reconciling"
```bash
# Check Flux status
flux get all -A

# View logs
flux logs -A --follow

# Force reconciliation
flux reconcile source git flux-system
```

---

## Emergency Rollback

If something goes wrong:

```bash
# 1. Revert DNS to old cluster IPs immediately
#    Update A records back to old Traefik IP

# 2. Verify old cluster is healthy
ssh root@10.88.140.164 'pct exec 300 -- /usr/local/bin/k3s kubectl get nodes'

# 3. Monitor old cluster
ssh root@10.88.140.164 'pct exec 300 -- /usr/local/bin/k3s kubectl get pods -A'

# 4. Document what went wrong

# 5. Keep new cluster running for troubleshooting
```

---

## Verification Commands

```bash
# All in one verification
ssh root@10.88.145.180 << 'EOF'
  echo "=== Nodes ==="
  kubectl get nodes
  echo ""
  echo "=== Pods ==="
  kubectl get pods -A | grep -v Running
  echo ""
  echo "=== Services ==="
  kubectl get svc -A | grep LoadBalancer
  echo ""
  echo "=== Flux ==="
  flux get all -A
EOF
```

---

## Post-Migration Cleanup (After 72 hours)

```bash
# Stop old LXC containers
ssh root@10.88.140.164 << 'EOF'
  pct stop 300  # k3s-master
  pct stop 301  # k3s-worker-1
  pct stop 302  # k3s-worker-2
EOF

# Wait 24 hours, verify no issues

# Destroy old containers (optional)
ssh root@10.88.140.164 << 'EOF'
  pct destroy 300
  pct destroy 301
  pct destroy 302
EOF
```

---

## Data Migration

### For NFS-backed PVCs

**Option 1: Copy all data at once**
```bash
ssh root@10.88.145.173 << 'EOF'
  cd /export
  cp -a k3s/. k3s-vm/
  # OR for large datasets
  rsync -avP k3s/ k3s-vm/
EOF
```

**Option 2: Migrate per-application**
```bash
# After each app deploys on new cluster
# Copy just that app's data
ssh root@10.88.145.173
rsync -avP /export/k3s/namespace-pvcname/ /export/k3s-vm/namespace-pvcname/
```

### For Longhorn volumes

See main migration plan for Longhorn migration strategy.

---

## Getting Help

1. **Check logs**: `kubectl logs <pod> -n <namespace>`
2. **Describe resources**: `kubectl describe pod <pod> -n <namespace>`
3. **Flux status**: `flux get all -A`
4. **Flux logs**: `flux logs -A --follow`
5. **Verification script**: `./07-verify-migration.sh`

---

## Success Indicators

Your migration is successful when:
- All nodes show "Ready"
- All pods are "Running"
- All LoadBalancer services have IPs
- Flux shows all reconciled
- Applications are accessible
- No errors in logs
- 72 hours of stable operation

---

**Document Version:** 1.0
**Last Updated:** 2025-12-12

For detailed information, see:
- Full plan: `k3s-vm-migration-bootstrap-plan.md`
- Checklist: `MIGRATION-CHECKLIST.md`
- Scripts: `*.sh`
