# K3s Cluster Deployment - Quick Start

## One-Command Deployment

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy/bootstrap-k3s-cluster.sh
```

**Duration**: 15-20 minutes

## What Gets Created

- 3 VMs on Proxmox (10.88.140.152-154)
- K3s cluster with 1 control plane + 2 workers
- MetalLB LoadBalancer (IPs: 10.88.140.155-158)
- Persistent storage with 4 PVCs
- Backup CronJob (daily at 2 AM)

## After Deployment

### Access Cluster

```bash
# Set kubeconfig
export KUBECONFIG=/tmp/k3s-kubeconfig.yaml

# Verify nodes
kubectl get nodes

# Check all resources
kubectl get all --all-namespaces
```

### SSH Access

```bash
# Control plane
ssh cortex@10.88.140.152

# Workers
ssh cortex@10.88.140.153
ssh cortex@10.88.140.154
```

## Quick Verification

```bash
# Run validation
./scripts/deploy/validate-deployment.sh

# Run cluster health check (from control plane)
ssh cortex@10.88.140.152
sudo /usr/local/bin/k3s-health-check.sh
```

## Test LoadBalancer

```bash
# Create test service
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --type=LoadBalancer --port=80

# Get external IP
kubectl get svc nginx

# Test (replace IP)
curl http://10.88.140.155

# Cleanup
kubectl delete svc nginx
kubectl delete deployment nginx
```

## Troubleshooting

### Check logs
```bash
# Bootstrap log
ls -lt /tmp/cortex-k3s-bootstrap-*.log | head -1

# K3s service logs
ssh cortex@10.88.140.152
sudo journalctl -u k3s -f
```

### Check state
```bash
cat /tmp/cortex-k3s-bootstrap-state.json | jq
```

## Documentation

- Full Guide: `/docs/deployment/k3s-cluster-deployment-guide.md`
- Execution Summary: `/docs/deployment/PHASE1-EXECUTION-SUMMARY.md`

## Support

All scripts in `/scripts/` have detailed logging and error messages.
Check the comprehensive deployment guide for detailed troubleshooting.
