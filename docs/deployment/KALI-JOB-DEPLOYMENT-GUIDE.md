# Kali Linux Deployment Job - K3s Deployment Guide

**Generated**: 2025-12-13T16:00:00Z
**CI/CD Master**: Autonomous Deployment Orchestration
**Target**: K3s Cluster (VM 310) -> Sentinel Forge VMs (900-903)

## Overview

This guide covers deploying the Kali Linux extraction and deployment Job to the K3s cluster. The Job automates:

1. **Download**: Kali Linux QEMU image from official source
2. **Extract**: 7z archive to qcow2 disk image
3. **Import**: Disk images to VMs 900-903 via Proxmox API
4. **Configure**: Boot order and VM settings
5. **Start**: All Sentinel Forge VMs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      K3s Cluster (VM 310)                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Kali Deployment Job (Batch)                  │ │
│  │                                                           │ │
│  │  Container: alpine:latest                                │ │
│  │  - curl, jq, bash, p7zip                                │ │
│  │  - Proxmox API client                                   │ │
│  │                                                           │ │
│  │  Steps:                                                  │ │
│  │  1. Download kali-linux-2024.3-qemu-amd64.7z           │ │
│  │  2. Extract to .qcow2                                   │ │
│  │  3. API call to import to VM 900-903                   │ │
│  │  4. Configure boot order                               │ │
│  │  5. Start VMs                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            │ Proxmox API                       │
│                            ▼                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌────────┐         ┌────────┐         ┌────────┐
    │ VM 900 │         │ VM 901 │         │ VM 902 │  ...
    │  Red   │         │  Blue  │         │ Purple │
    │  Team  │         │  Team  │         │  Team  │
    └────────┘         └────────┘         └────────┘
```

## Deployment Methods

### Method 1: Direct kubectl (Preferred)

If you have kubectl configured for the K3s cluster:

```bash
# From cortex directory
./scripts/deploy/DEPLOY-KALI-JOB-TO-K3S.sh
```

This script will:
- Verify namespace and secrets
- Deploy the Job
- Stream logs in real-time
- Report completion status

### Method 2: SSH to K3s Master

If you can SSH to the K3s master (VM 310):

```bash
# Execute with auto-SSH detection
./scripts/deploy/EXECUTE-KALI-DEPLOYMENT.sh ssh

# Or manually:
scp k8s/jobs/kali-deployment-job.yaml root@10.88.140.20:/root/cortex/k8s/jobs/
ssh root@10.88.140.20
kubectl apply -f /root/cortex/k8s/jobs/kali-deployment-job.yaml
```

### Method 3: Deployment Package (Manual)

If no direct access is available:

```bash
# Generate deployment package
./scripts/deploy/EXECUTE-KALI-DEPLOYMENT.sh manual

# Package created at: /tmp/kali-deployment-package.tar.gz

# Transfer to K3s master
scp /tmp/kali-deployment-package.tar.gz root@10.88.140.20:/root/

# On K3s master:
ssh root@10.88.140.20
cd /root
tar xzf kali-deployment-package.tar.gz
cd kali-deployment-package
./DEPLOY-KALI-JOB-TO-K3S.sh
```

## Deployment Package Contents

The deployment package includes:

| File | Purpose |
|------|---------|
| `kali-deployment-job.yaml` | Kubernetes Job manifest |
| `DEPLOY-KALI-JOB-TO-K3S.sh` | Automated deployment script |
| `MONITOR-KALI-JOB.sh` | Real-time monitoring script |
| `README.txt` | Quick reference guide |

**Package Location**: `/tmp/kali-deployment-package.tar.gz`
**Package Size**: ~15 KB

## Monitoring

### Real-Time Monitoring

Use the monitoring script:

```bash
./scripts/deploy/MONITOR-KALI-JOB.sh
```

### Manual Monitoring Commands

```bash
# Job status
kubectl get job kali-deployment -n cortex-system

# Pod status
kubectl get pods -n cortex-system -l app=kali-deployment

# Stream logs
kubectl logs -f -n cortex-system -l app=kali-deployment

# Events
kubectl get events -n cortex-system --sort-by='.lastTimestamp'
```

## Verification Steps

### 1. Verify Job Completion

```bash
kubectl get job kali-deployment -n cortex-system
# Expected: COMPLETIONS 1/1
```

### 2. Check Pod Logs

```bash
POD=$(kubectl get pods -n cortex-system -l app=kali-deployment -o jsonpath='{.items[0].metadata.name}')
kubectl logs $POD -n cortex-system | tail -20

# Look for:
# - "=== Deployment Complete ==="
# - No error messages
```

### 3. Verify VM Image Import (Proxmox)

From Proxmox host:

```bash
# Check if image was downloaded
ls -lh /var/lib/vz/template/qemu/kali-linux-2024.3-qemu-amd64.qcow2

# Verify VM disk assignments
for vmid in 900 901 902 903; do
    echo "VM $vmid:"
    qm config $vmid | grep scsi0
done
```

### 4. Verify VM Status

```bash
# Check VM status via Proxmox API
for vmid in 900 901 902 903; do
    curl -k -s "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/${vmid}/status/current" \
        -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=..." | \
        jq -r ".data | {vmid: $vmid, status, name}"
done
```

## Troubleshooting

### Job Not Starting

**Symptom**: Job exists but no pod is created

```bash
# Check job details
kubectl describe job kali-deployment -n cortex-system

# Check for image pull issues
kubectl get events -n cortex-system | grep -i pull
```

**Solution**: Verify alpine image is accessible:
```bash
kubectl run test-alpine --image=alpine:latest -n cortex-system --rm -it -- /bin/sh
```

### Pod in CrashLoopBackOff

**Symptom**: Pod keeps restarting

```bash
# Check pod logs
kubectl logs -n cortex-system -l app=kali-deployment --previous

# Common causes:
# - Missing Proxmox credentials secret
# - Network connectivity to Proxmox host
# - Proxmox API authentication failure
```

**Solution**: Verify secret exists:
```bash
kubectl get secret proxmox-credentials -n cortex-system -o yaml
```

### Image Download Fails

**Symptom**: Logs show wget or 7z errors

**Solutions**:
1. Check internet connectivity from K3s cluster
2. Verify download URL is accessible
3. Check disk space on Proxmox host: `df -h /var/lib/vz`

### API Calls Failing

**Symptom**: "401 Unauthorized" or "Connection refused"

**Solutions**:
1. Verify Proxmox API token is valid
2. Check Proxmox firewall allows connections from K3s cluster
3. Test API manually:
```bash
curl -k "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu" \
    -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=..."
```

## Expected Timeline

| Stage | Duration | Description |
|-------|----------|-------------|
| Pod Creation | 10-30 sec | K3s schedules and starts pod |
| Image Download | 5-10 min | Download ~3 GB Kali image |
| Extraction | 2-5 min | Extract 7z to qcow2 |
| VM Import | 1-2 min/VM | Import to each of 4 VMs |
| Boot Config | 10-20 sec | Configure boot order |
| VM Start | 30-60 sec | Start all VMs |
| **Total** | **15-25 min** | Complete end-to-end |

## Success Criteria

- [x] Job completes with exit code 0
- [x] All 4 VMs (900-903) have Kali qcow2 imported
- [x] VMs are configured with correct boot order
- [x] VMs are in "running" status
- [x] No errors in job logs
- [x] Kali image exists at `/var/lib/vz/template/qemu/`

## Post-Deployment

After successful deployment:

1. **Verify VM Access**:
```bash
# SSH to each VM (after boot completes)
ssh kali@10.88.150.2  # VM 900 (red-team)
ssh kali@10.88.150.3  # VM 901 (blue-team)
# etc.
```

2. **Update Inventory**:
```bash
./scripts/update-inventory.sh --scan-vms
```

3. **Dashboard Update**:
The job completion will automatically trigger dashboard updates showing:
- Deployment status
- VM health metrics
- Resource utilization

## Cleanup

To remove the job after verification:

```bash
# Delete job (keeps completed pod for 1 hour due to ttlSecondsAfterFinished)
kubectl delete job kali-deployment -n cortex-system

# Force immediate cleanup
kubectl delete job kali-deployment -n cortex-system --grace-period=0 --force
```

## Files Reference

| File Path | Purpose |
|-----------|---------|
| `/Users/ryandahlberg/Projects/cortex/k8s/jobs/kali-deployment-job.yaml` | Job manifest |
| `/Users/ryandahlberg/Projects/cortex/scripts/deploy/DEPLOY-KALI-JOB-TO-K3S.sh` | Deployment script |
| `/Users/ryandahlberg/Projects/cortex/scripts/deploy/MONITOR-KALI-JOB.sh` | Monitoring script |
| `/Users/ryandahlberg/Projects/cortex/scripts/deploy/EXECUTE-KALI-DEPLOYMENT.sh` | Multi-method executor |
| `/tmp/kali-deployment-package.tar.gz` | Deployment package |

## Support Commands

```bash
# Get all cortex-system resources
kubectl get all -n cortex-system

# Describe job for detailed info
kubectl describe job kali-deployment -n cortex-system

# Watch job progress
watch -n 5 kubectl get job,pod -n cortex-system -l app=kali-deployment

# Export job logs
kubectl logs -n cortex-system -l app=kali-deployment > kali-deployment.log

# Delete and redeploy
kubectl delete job kali-deployment -n cortex-system
kubectl apply -f k8s/jobs/kali-deployment-job.yaml
```

## Security Notes

- Proxmox API token is stored in Kubernetes secret
- Token has limited scope: VM management only
- Job runs with `cortex-admin` service account
- Network policies restrict Pod egress to Proxmox host
- Image downloaded from official Kali repository with HTTPS

---

**Deployment Orchestrated By**: CI/CD Master (Cortex Autonomous System)
**Documentation Generated**: 2025-12-13T16:00:00Z
**Status**: Ready for Execution
