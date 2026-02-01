# k3s VM Migration Checklist

Use this checklist to track your migration progress.

Migration Date: ___________
Performed By: ___________

---

## Pre-Migration (Day 1)

### VM Preparation
- [ ] Create 3 VMs on Proxmox (180, 181, 182)
- [ ] Configure static IPs on VLAN 145
- [ ] Set hostnames (k3s-master-vm, k3s-worker-1-vm, k3s-worker-2-vm)
- [ ] Update /etc/hosts on all VMs
- [ ] Verify network connectivity between VMs
- [ ] Verify NFS server (10.88.145.173) is accessible from VMs
- [ ] Install prerequisites (nfs-common, open-iscsi)

**VM Details:**
- Master IP: 10.88.145.180 - Status: _____
- Worker 1 IP: 10.88.145.181 - Status: _____
- Worker 2 IP: 10.88.145.182 - Status: _____

### Backup Current Cluster
- [ ] Run `01-backup-cluster.sh`
- [ ] Verify backup archive exists
- [ ] Copy backup to safe location
- [ ] Test backup extraction: `tar -tzf k3s-backup-*.tar.gz`

**Backup Location:** _____________________

---

## Cluster Bootstrap (Day 2)

### Phase 2: k3s Installation
- [ ] Run `02-bootstrap-master.sh` on master VM (10.88.145.180)
- [ ] Save node token: _____________________
- [ ] Verify master node is Ready: `kubectl get nodes`
- [ ] Run `03-bootstrap-worker.sh` on worker-1 (10.88.145.181)
- [ ] Run `03-bootstrap-worker.sh` on worker-2 (10.88.145.182)
- [ ] Verify all 3 nodes are Ready: `kubectl get nodes`

**Master Node Token (save this):**
```
_____________________
```

### Phase 3: MetalLB
- [ ] Run `04-install-metallb.sh`
- [ ] Verify MetalLB pods are running: `kubectl get pods -n metallb-system`
- [ ] Verify IP pool exists: `kubectl get ipaddresspool -n metallb-system`
- [ ] Test LoadBalancer service gets IP

**MetalLB IP Pool:** 10.88.145.200-210

### Phase 4: NFS Storage
- [ ] Verify NFS server is accessible: `showmount -e 10.88.145.173`
- [ ] Create NFS export directory: `/export/k3s-vm` on NFS server
- [ ] Run `05-install-nfs-provisioner.sh`
- [ ] Verify provisioner pod is running: `kubectl get pods -n nfs-provisioner`
- [ ] Verify storage class exists: `kubectl get storageclass`
- [ ] Test PVC creation and binding

---

## Application Deployment (Day 3)

### Phase 5: Flux Bootstrap
- [ ] Prepare Git repository credentials
- [ ] Run `06-bootstrap-flux.sh`
- [ ] Verify Flux pods are running: `kubectl get pods -n flux-system`
- [ ] Verify GitRepository is connected: `flux get sources git`
- [ ] Monitor reconciliation: `flux logs -A --follow`

**Git Repository:** _____________________
**Branch:** _____________________
**Path:** _____________________

### Phase 6: Core Services
- [ ] Wait for Flux to deploy Traefik (or deploy manually)
- [ ] Verify Traefik is running: `kubectl get pods -n traefik`
- [ ] Verify Traefik LoadBalancer IP assigned
- [ ] Wait for kube-prometheus-stack deployment
- [ ] Verify monitoring pods are running: `kubectl get pods -n monitoring`
- [ ] Access Grafana: `kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80`

**Traefik LoadBalancer IP:** _____________________

### Phase 7: Data Migration
- [ ] Identify PVCs requiring data migration
- [ ] For NFS PVCs: Copy data from old to new NFS paths
  - [ ] Option A: Copy all data: `rsync -avP /export/k3s/ /export/k3s-vm/`
  - [ ] Option B: Migrate per-application as deployed
- [ ] For Longhorn: Install Longhorn and migrate volumes
- [ ] Verify data is accessible in applications

**Data Migration Notes:**
_____________________
_____________________

### Phase 8: Verification
- [ ] Run `07-verify-migration.sh`
- [ ] All checks pass (0 failures)
- [ ] Review service endpoints: `kubectl get svc -A`
- [ ] Review ingresses: `kubectl get ingress -A`
- [ ] Test application access using VM IPs directly
- [ ] Verify SSL certificates are valid
- [ ] Check Prometheus for alerts
- [ ] Review logs for errors

**Verification Results:**
- Passed: _____ / Total checks
- Failed: _____
- Issues: _____________________

---

## DNS Cutover (Day 4)

### Pre-Cutover (24 hours before)
- [ ] Lower DNS TTL to 300 seconds
- [ ] Document current DNS records and IPs
- [ ] Final verification of new cluster
- [ ] Team notification sent
- [ ] Rollback plan reviewed

**Current DNS TTL:** _____
**New DNS TTL:** 300 seconds
**TTL Changed At:** _____________________

### Cutover Window
- [ ] Verify all applications are running
- [ ] Verify all LoadBalancer IPs are assigned
- [ ] Get new LoadBalancer IPs: `kubectl get svc -A | grep LoadBalancer`
- [ ] Update DNS A records to point to new IPs
- [ ] Monitor DNS propagation: `dig yourdomain.com`
- [ ] Verify traffic is flowing to new cluster
- [ ] Check application logs for errors
- [ ] Monitor Prometheus for alerts

**DNS Update Time:** _____________________

**LoadBalancer IP Mapping:**
| Service | Old IP | New IP | Updated |
|---------|--------|--------|---------|
| Traefik | _____ | _____ | [ ] |
| _____ | _____ | _____ | [ ] |
| _____ | _____ | _____ | [ ] |

### Post-Cutover Monitoring (First 4 hours)
- [ ] Hour 1: Monitor logs and metrics
- [ ] Hour 2: Verify user access and functionality
- [ ] Hour 3: Check for errors and performance issues
- [ ] Hour 4: Confirm stability

**Issues Encountered:**
_____________________
_____________________

---

## Post-Migration (Days 5-7)

### Day 5
- [ ] 24-hour stability check
- [ ] Review monitoring dashboards
- [ ] Check for any degraded services
- [ ] Verify backups are running on new cluster
- [ ] Document any issues and resolutions

### Day 6
- [ ] 48-hour stability check
- [ ] Performance comparison (old vs new)
- [ ] User feedback collection
- [ ] Optimize resource allocations if needed

### Day 7 (72 hours post-cutover)
- [ ] Final stability verification
- [ ] Create final backup of old LXC cluster
- [ ] Document migration lessons learned
- [ ] Update infrastructure documentation
- [ ] Schedule old cluster decommission

**Old Cluster Status:**
- [ ] Keep running (still in monitoring period)
- [ ] Ready for decommission
- [ ] Decommissioned on: _____________________

---

## Rollback Plan

**If rollback is needed:**

### Immediate Actions (5-10 minutes)
- [ ] Revert DNS records to old cluster IPs
- [ ] Verify old cluster is healthy: `ssh root@10.88.145.170 '/usr/local/bin/k3s kubectl get nodes'`
- [ ] Monitor old cluster for errors
- [ ] Notify team of rollback

**Rollback Triggered:** [ ] Yes [ ] No
**Rollback Time:** _____________________
**Rollback Reason:** _____________________

### Post-Rollback
- [ ] Document what went wrong
- [ ] Plan fixes for issues encountered
- [ ] Schedule retry migration
- [ ] Keep new cluster running for troubleshooting

---

## Success Criteria

Migration is considered successful when:
- [ ] All 3 nodes are Ready and healthy
- [ ] All core services are running (Flux, Traefik, MetalLB, monitoring)
- [ ] All applications are accessible via new cluster
- [ ] Data has been migrated successfully
- [ ] No errors in logs or monitoring
- [ ] DNS cutover completed
- [ ] 72 hours of stable operation

**Migration Status:** [ ] Success [ ] Partial [ ] Failed

**Final Notes:**
_____________________
_____________________
_____________________

---

## Decommission Old Cluster

**IMPORTANT: Only proceed after 72+ hours of successful operation**

### Pre-Decommission
- [ ] Verify new cluster has been stable for 72+ hours
- [ ] Verify all data has been migrated
- [ ] Create final backup of old cluster
- [ ] Copy backup to permanent storage
- [ ] Document old cluster configuration

**Final Backup:** _____________________
**Backup Location:** _____________________

### Decommission Steps
- [ ] Stop k3s on all old LXC containers:
  - [ ] k3s-master (300): `pct stop 300`
  - [ ] k3s-worker-1 (301): `pct stop 301`
  - [ ] k3s-worker-2 (302): `pct stop 302`
- [ ] Wait 24 hours in stopped state
- [ ] Verify no issues with new cluster
- [ ] Delete LXC containers (optional):
  - [ ] `pct destroy 300`
  - [ ] `pct destroy 301`
  - [ ] `pct destroy 302`

**Decommissioned On:** _____________________
**Performed By:** _____________________

---

## Contact Information

**Team Members:**
- Lead: _____________________
- Backup: _____________________

**Emergency Contacts:**
- On-call: _____________________

**Important Links:**
- GitOps Repo: _____________________
- Monitoring: _____________________
- Documentation: _____________________

---

**Checklist Version:** 1.0
**Last Updated:** 2025-12-12
