# k3s VM Migration Scripts

Automated scripts to migrate k3s from LXC containers to VMs on Proxmox.

## Overview

These scripts automate the migration process outlined in `k3s-vm-migration-bootstrap-plan.md`.

## Scripts

| Script | Purpose | Run On | Dependencies |
|--------|---------|--------|--------------|
| `01-backup-cluster.sh` | Backup current LXC cluster | Proxmox host or SSH-capable machine | SSH access to Proxmox |
| `02-bootstrap-master.sh` | Install k3s master | New master VM (10.88.145.180) | curl, root access |
| `03-bootstrap-worker.sh` | Install k3s worker | New worker VMs (181, 182) | curl, root access, K3S_TOKEN env var |
| `04-install-metallb.sh` | Install and configure MetalLB | Master VM | kubectl, helm |
| `05-install-nfs-provisioner.sh` | Install NFS storage provisioner | Master VM | kubectl, helm, NFS client |
| `06-bootstrap-flux.sh` | Bootstrap Flux GitOps | Master VM | kubectl, internet access |
| `07-verify-migration.sh` | Verify cluster readiness | Master VM | kubectl |

## Prerequisites

### VMs Created
- 10.88.145.180 (master)
- 10.88.145.181 (worker-1)
- 10.88.145.182 (worker-2)

### VM Configuration
- Debian 12/13 or Ubuntu 22.04
- 4+ CPU cores, 8GB+ RAM
- 100GB+ disk space
- Static IP configured on VLAN 145
- Internet access for package downloads

### Access Requirements
- Root SSH access to Proxmox host (10.88.140.164)
- Root access to all new VMs
- Access to GitOps repository (for Flux)

## Quick Start

### 1. Backup Current Cluster

```bash
# On your local machine or jump host
cd k3s-vm-migration-scripts
chmod +x *.sh
./01-backup-cluster.sh
```

This creates `./backups/k3s-backup-YYYYMMDD-HHMMSS.tar.gz`

### 2. Bootstrap Master

```bash
# SSH to master VM
ssh root@10.88.145.180

# Copy script to master
scp 02-bootstrap-master.sh root@10.88.145.180:/root/

# Run bootstrap
./02-bootstrap-master.sh
```

Save the node token displayed at the end.

### 3. Bootstrap Workers

```bash
# SSH to worker-1
ssh root@10.88.145.181

# Copy script
scp 03-bootstrap-worker.sh root@10.88.145.181:/root/

# Set token and run
export K3S_TOKEN='<token-from-master>'
./03-bootstrap-worker.sh

# Repeat for worker-2 (10.88.145.182)
```

### 4. Install MetalLB

```bash
# On master VM
./04-install-metallb.sh
```

### 5. Install NFS Provisioner

```bash
# On master VM
./05-install-nfs-provisioner.sh
```

### 6. Bootstrap Flux

```bash
# On master VM
./06-bootstrap-flux.sh
```

Follow the interactive prompts to choose your bootstrap method.

### 7. Verify Migration

```bash
# On master VM
./07-verify-migration.sh
```

This runs comprehensive checks and provides a pass/fail report.

## Script Details

### 01-backup-cluster.sh

Backs up the current LXC-based k3s cluster configuration:
- Flux GitOps configuration
- MetalLB IP pools and L2 advertisements
- Storage classes and PVCs
- Application resources (ConfigMaps, Secrets, Services, Ingresses)
- Namespace definitions

**Output:** `./backups/k3s-backup-YYYYMMDD-HHMMSS.tar.gz`

### 02-bootstrap-master.sh

Installs k3s master on the new VM with:
- k3s v1.33.6+k3s1 (matching current version)
- Traefik disabled (will be installed via Flux/Helm)
- ServiceLB disabled (will use MetalLB)
- Custom cluster and service CIDRs
- TLS SANs for master IP

**Output:**
- Running k3s master
- Node token saved to `/root/k3s-node-token`
- kubectl configured in `~/.kube/config`

### 03-bootstrap-worker.sh

Joins worker nodes to the cluster. Requires `K3S_TOKEN` environment variable.

**Usage:**
```bash
export K3S_TOKEN='<token-from-master>'
./03-bootstrap-worker.sh
```

### 04-install-metallb.sh

Installs MetalLB v0.14.9 via Helm and configures:
- IP pool: 10.88.145.200-210
- L2 advertisement mode
- Automatic IP assignment

### 05-install-nfs-provisioner.sh

Installs NFS Subdir External Provisioner via Helm:
- NFS server: 10.88.145.173
- NFS path: /export/k3s-vm
- Storage class: nfs-client
- Volume expansion enabled

### 06-bootstrap-flux.sh

Interactive script to bootstrap Flux. Supports:
1. GitHub (HTTPS with PAT)
2. GitLab (HTTPS with PAT)
3. Generic Git (SSH)
4. Restore from backup

### 07-verify-migration.sh

Comprehensive verification script that checks:
- Cluster nodes (count and readiness)
- Core system pods
- MetalLB installation and configuration
- NFS provisioner
- Flux installation
- Traefik deployment
- Monitoring stack
- LoadBalancer IP assignments
- Storage classes

**Exit Codes:**
- 0: All checks passed
- 1: One or more checks failed

## Troubleshooting

### Script fails to connect to VMs

```bash
# Verify VM is accessible
ping 10.88.145.180

# Verify SSH access
ssh root@10.88.145.180 "hostname"

# Check network configuration
ssh root@10.88.145.180 "ip addr show"
```

### k3s installation fails

```bash
# Check for conflicting processes
ssh root@10.88.145.180 "systemctl status k3s"

# Check logs
ssh root@10.88.145.180 "journalctl -u k3s -f"

# Clean up and retry
ssh root@10.88.145.180 "/usr/local/bin/k3s-uninstall.sh"
# Re-run bootstrap script
```

### Worker fails to join cluster

```bash
# Verify token is correct
cat /var/lib/rancher/k3s/server/node-token  # on master

# Verify master is accessible from worker
ssh root@10.88.145.181 "curl -k https://10.88.145.180:6443"

# Check worker logs
ssh root@10.88.145.181 "journalctl -u k3s-agent -f"

# Verify firewall rules allow 6443
```

### MetalLB not assigning IPs

```bash
# Check MetalLB controller logs
kubectl logs -n metallb-system -l app.kubernetes.io/component=controller

# Check speaker logs
kubectl logs -n metallb-system -l app.kubernetes.io/component=speaker

# Verify IP pool configuration
kubectl get ipaddresspool -n metallb-system -o yaml

# Check for IP conflicts
nmap -sn 10.88.145.200-210
```

### NFS provisioner not working

```bash
# Check NFS server accessibility
showmount -e 10.88.145.173

# Verify NFS path exists on server
ssh root@10.88.145.173 "ls -la /export/k3s-vm"

# Check provisioner logs
kubectl logs -n nfs-provisioner -l app=nfs-subdir-external-provisioner

# Test mount manually
mount -t nfs 10.88.145.173:/export/k3s-vm /mnt
```

### Flux not reconciling

```bash
# Check Flux status
flux get all -A

# Check for errors
flux logs -A --follow

# Force reconciliation
flux reconcile source git flux-system
flux reconcile kustomization flux-system

# Check Git repository accessibility
flux get sources git
```

## Manual Steps

Some tasks may require manual intervention:

### Update DNS Records

After verification, update DNS to point to new LoadBalancer IPs:

```bash
# Get new Traefik IP
kubectl get svc -n traefik traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Update DNS A records for your domain
```

### Migrate Data

For NFS-backed PVCs using different paths:

```bash
# On NFS server
ssh root@10.88.145.173

# Copy data from old to new path
rsync -avP /export/k3s/ /export/k3s-vm/
```

For Longhorn volumes, see the main migration plan document.

## Safety Notes

1. **Always run backup first** - The backup is your rollback point
2. **Test before cutover** - Use verification script before DNS changes
3. **Keep old cluster running** - Maintain old cluster for 72+ hours after cutover
4. **Monitor after cutover** - Watch logs and metrics closely
5. **Have rollback plan ready** - Know how to revert DNS quickly

## Support

For issues or questions:
1. Check the main migration plan: `../k3s-vm-migration-bootstrap-plan.md`
2. Review k3s documentation: https://docs.k3s.io/
3. Check Flux documentation: https://fluxcd.io/docs/

## License

These scripts are part of the Cortex automation system.
