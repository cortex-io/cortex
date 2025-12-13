# Cortex Resource Manager - Quick Start

Deploy cortex-resource-manager to K3s in 3 steps.

## Prerequisites
- K3s cluster: 10.88.145.180:6443
- SSH access to K3s node

## Deployment (5 minutes)

### Step 1: Transfer Package
```bash
scp /tmp/cortex-resource-manager-deployment.tar.gz root@10.88.145.180:/tmp/
```

### Step 2: Deploy
```bash
ssh root@10.88.145.180
cd /tmp && tar -xzf cortex-resource-manager-deployment.tar.gz
cd cortex-resource-manager-deployment && ./deploy.sh
```

### Step 3: Verify
```bash
kubectl get pods -n cortex-system -l app=cortex-resource-manager
kubectl run test-health --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://cortex-resource-manager.cortex-system.svc.cluster.local:8080/health
```

## What You Get

- **Service**: cortex-resource-manager.cortex-system.svc.cluster.local:8080
- **16 API Tools**:
  - 5 resource allocation tools (request/release/list/capacity)
  - 5 MCP server lifecycle tools (start/stop/scale/status)
  - 6 worker management tools (provision/drain/destroy/list)

## Testing

```bash
./scripts/testing/test-resource-manager.sh
```
Runs 15 automated tests.

## Documentation

Full guide: `/Users/ryandahlberg/Projects/cortex/docs/deployment/CORTEX-RESOURCE-MANAGER-DEPLOYMENT.md`

## Summary

Complete summary: `/Users/ryandahlberg/Projects/cortex/CORTEX-RESOURCE-MANAGER-DEPLOYMENT-SUMMARY.md`

---

**Deployment Package**: `/tmp/cortex-resource-manager-deployment.tar.gz`
**Manifests**: `/Users/ryandahlberg/Projects/cortex/k8s/services/resource-manager/`
**Scripts**: `/Users/ryandahlberg/Projects/cortex/scripts/deploy/`
