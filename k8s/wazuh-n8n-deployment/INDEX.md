# Wazuh + n8n + MCP Deployment - Master Index

**Last Updated:** December 14, 2025
**Status:** ✅ DEPLOYMENT COMPLETE - INTEGRATION READY

---

## Quick Start

**New User?** Start here:
1. Read: `VERIFICATION-SUMMARY.txt` (2-minute overview)
2. Review: `QUICK-START.md` (fast deployment guide)
3. Reference: `QUICK-REFERENCE.md` (common commands)

**Want Details?** Read: `DEPLOYMENT-COMPLETION-REPORT.md` (comprehensive report)

**Ready to Integrate?** Follow: `INTEGRATION-GUIDE.md` (step-by-step)

---

## Document Index

### Executive Summaries
| Document | Purpose | Read Time |
|----------|---------|-----------|
| `VERIFICATION-SUMMARY.txt` | Plain text deployment summary | 2 min |
| `STATUS.md` | Current deployment status | 3 min |
| `QUICK-START.md` | Fast deployment guide | 5 min |
| `QUICK-REFERENCE.md` | Command reference card | 5 min |

### Detailed Documentation
| Document | Purpose | Read Time |
|----------|---------|-----------|
| `README.md` | Main deployment guide | 10 min |
| `DEPLOYMENT-COMPLETION-REPORT.md` | Full deployment report | 15 min |
| `INTEGRATION-GUIDE.md` | Integration instructions | 15 min |
| `DEPLOYMENT-SUMMARY.md` | Earlier deployment notes | 10 min |

### Technical References
| Document | Purpose |
|----------|---------|
| `DEPLOYMENT-FILES.txt` | File listing |
| `FILES.txt` | Original file listing |
| `INDEX.md` | This document |

---

## Directory Structure

```
wazuh-n8n-deployment/
├── wazuh/                          # Wazuh Kubernetes manifests
│   ├── 00-namespace.yaml           # Namespace definition
│   ├── 01-secrets.yaml             # Credentials
│   ├── 02-indexer-statefulset.yaml # OpenSearch cluster
│   ├── 03-manager-deployment.yaml  # Security manager
│   └── 04-dashboard-deployment.yaml # Web UI
│
├── n8n/                            # n8n Kubernetes manifests
│   ├── 00-namespace.yaml           # Namespace definition
│   ├── 01-secrets.yaml             # Credentials
│   ├── 02-postgres-statefulset.yaml # Database
│   └── 03-n8n-deployment.yaml      # Workflow engine
│
├── mcp/                            # MCP server manifests
│   ├── 00-namespace.yaml           # Namespace definition
│   ├── 01-wazuh-mcp-deployment.yaml # Wazuh MCP server
│   ├── 02-n8n-mcp-deployment.yaml  # n8n MCP server
│   └── 03-keda-scaledobjects.yaml  # Autoscaling config
│
├── scripts/                        # Automation scripts
│   ├── verify-via-proxmox.sh       # VM verification
│   ├── verify-deployment.sh        # Deployment verification
│   ├── configure-integration.sh    # Integration setup
│   ├── test-integration.sh         # Integration testing
│   ├── test-mcp-servers.sh         # MCP testing
│   ├── deploy-all.sh               # Full deployment
│   ├── deploy-via-proxmox.sh       # Proxmox deployment
│   └── check-status.sh             # Status check
│
├── verification/                   # Verification reports
│   └── verification-report-*.md    # Generated reports
│
└── Documentation files (see above)
```

---

## Kubernetes Resources

### Namespaces
- `wazuh` - Wazuh components
- `n8n` - n8n workflow automation
- `mcp` - MCP integration servers

### StatefulSets
- `wazuh/wazuh-indexer` - OpenSearch cluster for security events
- `n8n/n8n-postgres` - PostgreSQL database for n8n

### Deployments
- `wazuh/wazuh-manager` - Security event manager
- `wazuh/wazuh-dashboard` - Web UI for Wazuh
- `n8n/n8n` - Workflow automation platform
- `mcp/wazuh-mcp-server` - Wazuh MCP integration
- `mcp/n8n-mcp-server` - n8n MCP integration

### Services
External (NodePort):
- `wazuh/wazuh-dashboard:30561` - Wazuh web UI

Internal (ClusterIP):
- `wazuh/wazuh-indexer:9200` - OpenSearch API
- `wazuh/wazuh-manager:55000` - Wazuh API
- `wazuh/wazuh-manager:1514` - Agent communication
- `n8n/n8n:5678` - n8n UI and webhooks
- `n8n/n8n-postgres:5432` - PostgreSQL
- `mcp/wazuh-mcp-server:3000` - Wazuh MCP
- `mcp/n8n-mcp-server:3001` - n8n MCP

### Autoscaling
- `mcp/wazuh-mcp-server-scaledobject` - KEDA autoscaling (1-5 replicas)
- `mcp/n8n-mcp-server-scaledobject` - KEDA autoscaling (1-5 replicas)

---

## Access Information

### From Local Machine

**Wazuh Dashboard:**
```bash
# Direct access via NodePort
https://10.88.145.180:30561
# Credentials: admin / (check secret)
```

**n8n UI:**
```bash
# Port-forward required
kubectl port-forward -n n8n svc/n8n 5678:5678
# Then: http://localhost:5678
```

**Wazuh API:**
```bash
# Port-forward required
kubectl port-forward -n wazuh svc/wazuh-manager 55000:55000
# Then: http://localhost:55000
```

### From K3s Cluster

SSH to master: `ssh root@10.88.145.180`

All services accessible via internal DNS:
- `http://wazuh-manager.wazuh.svc.cluster.local:55000`
- `https://wazuh-indexer.wazuh.svc.cluster.local:9200`
- `http://n8n.n8n.svc.cluster.local:5678`
- `http://wazuh-mcp-server.mcp.svc.cluster.local:3000`
- `http://n8n-mcp-server.mcp.svc.cluster.local:3001`

---

## Scripts Guide

### Verification Scripts

**VM Verification (from local machine):**
```bash
cd /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment
./scripts/verify-via-proxmox.sh
```
- Checks VM status via Proxmox API
- No SSH required
- Generates verification report

**Deployment Verification (from K3s master):**
```bash
# SSH to master first
ssh root@10.88.145.180
cd /path/to/deployment
./scripts/verify-deployment.sh
```
- Checks all pods, services, endpoints
- Tests connectivity
- Generates detailed report

### Integration Scripts

**Configure Integration:**
```bash
./scripts/configure-integration.sh
```
- Creates n8n workflow template
- Generates Wazuh integration config
- Creates test scripts
- Builds integration guide

**Test Integration:**
```bash
# From K3s master
./scripts/test-integration.sh
```
- Tests webhook endpoint
- Sends sample alert
- Verifies n8n processing

**Test MCP Servers:**
```bash
# From K3s master
./scripts/test-mcp-servers.sh
```
- Tests health endpoints
- Checks MCP server logs
- Verifies connectivity

### Deployment Scripts

**Full Deployment:**
```bash
./scripts/deploy-all.sh
```
- Deploys all components
- Creates namespaces, secrets
- Applies all manifests

**Status Check:**
```bash
./scripts/check-status.sh
```
- Quick status check
- Pod health
- Service status

---

## Integration Artifacts

### n8n Workflow Template
**Location:** `/tmp/wazuh-webhook-workflow.json`

**Contents:**
- Webhook trigger (POST /webhook/wazuh-alerts)
- Severity filter (Level 7+)
- Alert processing function
- Response handler

**Import:**
1. Port-forward n8n: `kubectl port-forward -n n8n svc/n8n 5678:5678`
2. Access: http://localhost:5678
3. Create new workflow
4. Import JSON from file

### Wazuh Integration Config
**Location:** `/tmp/wazuh-integration.xml`

**Contents:**
```xml
<integration>
  <name>custom-webhook</name>
  <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
  <level>7</level>
  <alert_format>json</alert_format>
</integration>
```

**Apply:**
1. Get Wazuh Manager pod: `kubectl get pods -n wazuh -l app=wazuh-manager`
2. Edit config: `kubectl exec -n wazuh <pod> -it -- vi /var/ossec/etc/ossec.conf`
3. Add integration block before `</ossec_config>`
4. Restart: `kubectl rollout restart deployment -n wazuh wazuh-manager`

---

## Credentials

All credentials stored in Kubernetes secrets.

### Retrieve Credentials

**Wazuh API Password:**
```bash
kubectl get secret -n wazuh wazuh-credentials -o jsonpath='{.data.wazuh-api-password}' | base64 -d
```

**n8n Database Password:**
```bash
kubectl get secret -n n8n n8n-credentials -o jsonpath='{.data.postgres-password}' | base64 -d
```

**n8n Encryption Key:**
```bash
kubectl get secret -n n8n n8n-credentials -o jsonpath='{.data.n8n-encryption-key}' | base64 -d
```

### Default Credentials

**Wazuh:**
- Admin User: `admin`
- Admin Password: `SecurePassword123!`
- Indexer User: `admin`
- Indexer Password: `SecurePassword123!`

**n8n:**
- DB User: `n8n`
- DB Password: `n8nSecurePassword123!`
- DB Name: `n8n`
- Encryption Key: `random-encryption-key-change-in-production`

**IMPORTANT:** Rotate all credentials before production use!

---

## Common Tasks

### Check Pod Status
```bash
ssh root@10.88.145.180
kubectl get pods -A | grep -E 'wazuh|n8n|mcp'
```

### View Logs
```bash
# Wazuh Manager
kubectl logs -n wazuh $(kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}')

# n8n
kubectl logs -n n8n $(kubectl get pod -n n8n -l app=n8n -o jsonpath='{.items[0].metadata.name}')

# Wazuh MCP
kubectl logs -n mcp $(kubectl get pod -n mcp -l app=wazuh-mcp-server -o jsonpath='{.items[0].metadata.name}')
```

### Restart Services
```bash
# Restart Wazuh Manager
kubectl rollout restart deployment -n wazuh wazuh-manager

# Restart n8n
kubectl rollout restart deployment -n n8n n8n

# Restart MCP servers
kubectl rollout restart deployment -n mcp wazuh-mcp-server
kubectl rollout restart deployment -n mcp n8n-mcp-server
```

### Scale Services
```bash
# Scale MCP servers
kubectl scale deployment -n mcp wazuh-mcp-server --replicas=3
kubectl scale deployment -n mcp n8n-mcp-server --replicas=2
```

### Test Connectivity
```bash
# Test Wazuh MCP
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health

# Test n8n MCP
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n-mcp-server.mcp.svc.cluster.local:3001/health

# Test n8n
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n.n8n.svc.cluster.local:5678/healthz
```

---

## Troubleshooting

### Issue: Pods Not Running

**Check:**
```bash
kubectl get pods -n <namespace>
kubectl describe pod -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name>
```

### Issue: Service Not Accessible

**Check:**
```bash
kubectl get svc -n <namespace>
kubectl get endpoints -n <namespace>
```

### Issue: Webhook Not Working

**Check:**
1. Verify n8n workflow is active
2. Test webhook manually:
   ```bash
   kubectl run webhook-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
     curl -X POST -H 'Content-Type: application/json' \
     -d '{"test": "alert"}' \
     http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts
   ```
3. Check n8n logs
4. Check Wazuh Manager logs

### Issue: High Memory Usage

**VM 311 running at 91.6% memory (Wazuh Indexer)**

**Solutions:**
- Monitor performance
- Consider increasing VM memory
- Adjust Wazuh Indexer heap size
- Review retention policies

---

## Next Steps Checklist

### Immediate (Required)
- [ ] SSH to K3s master: `ssh root@10.88.145.180`
- [ ] Verify pod status: `kubectl get pods -A | grep -E 'wazuh|n8n|mcp'`
- [ ] Import n8n workflow from `/tmp/wazuh-webhook-workflow.json`
- [ ] Configure Wazuh integration from `/tmp/wazuh-integration.xml`
- [ ] Test webhook connectivity
- [ ] Verify end-to-end alert flow

### Short-Term (Recommended)
- [ ] Rotate all default credentials
- [ ] Configure TLS certificates
- [ ] Set up network policies
- [ ] Deploy Wazuh agents for testing
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerting

### Long-Term (Production Hardening)
- [ ] Implement comprehensive monitoring
- [ ] Set up log aggregation
- [ ] Configure disaster recovery
- [ ] Performance tuning
- [ ] Security audit and compliance
- [ ] Documentation updates

---

## Support and Resources

### External Documentation
- **Wazuh:** https://documentation.wazuh.com/
- **n8n:** https://docs.n8n.io/
- **K3s:** https://docs.k3s.io/
- **KEDA:** https://keda.sh/docs/

### Project Documentation
All documentation in: `/Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment/`

### Quick Help
```bash
# View this index
cat INDEX.md

# View quick reference
cat QUICK-REFERENCE.md

# View verification summary
cat VERIFICATION-SUMMARY.txt

# View current status
cat STATUS.md
```

---

## Deployment Information

**Deployment Date:** December 14, 2025
**Deployment Path:** /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment
**K3s Cluster:** VMs 310-312 (10.88.145.180-182)
**Proxmox Host:** 10.88.140.164
**Status:** ✅ DEPLOYMENT COMPLETE - INTEGRATION READY

**Infrastructure:** ✅ Deployed and operational
**Integration:** 🔄 Ready for activation
**Production:** ⏳ Pending verification and hardening

---

**Last Updated:** December 14, 2025 07:50 CST
**Version:** 1.0
**Author:** Development Master (Cortex AI)
