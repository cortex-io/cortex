# Wazuh + n8n + MCP Deployment Verification Report

**Generated:** 2025-12-14 13:44:18 UTC
**K3s Cluster:** VMs 310, 311, 312
**Proxmox Host:** 10.88.140.164
**Deployment Location:** /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment

---

## Deployment Architecture

```
VM 310 (10.88.145.180)  - K3s Master
VM 311 (10.88.145.181) - K3s Worker 1 (Wazuh Manager)
VM 312 (10.88.145.182) - K3s Worker 2 (n8n)
```

## VM Status
### VM 310
- **Status:** running
- **Uptime:** 48 hours
- **CPU:**  - **CPU:** 
- **Memory:** 88.7%
- **Health:** ✅ Running

### VM 311
- **Status:** running
- **Uptime:** 48 hours
- **CPU:**  - **CPU:** 
- **Memory:** 91.6%
- **Health:** ✅ Running

### VM 312
- **Status:** running
- **Uptime:** 48 hours
- **CPU:**  - **CPU:** 
- **Memory:** 82.8%
- **Health:** ✅ Running

## Kubernetes Cluster Status

**Note:** Direct kubectl access not available via Proxmox API.
This is expected if QEMU guest agent is not installed/configured.

### Manual Verification Required

To verify the deployment, SSH into the K3s master VM and run:

```bash
# SSH to K3s master
ssh root@10.88.145.180

# Check all pods
kubectl get pods -A | grep -E 'wazuh|n8n|mcp'

# Check StatefulSets
kubectl get statefulset -n wazuh wazuh-indexer
kubectl get statefulset -n n8n n8n-postgres

# Check services
kubectl get svc -n wazuh
kubectl get svc -n n8n
kubectl get svc -n mcp

# Test connectivity
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health
```

## Deployed Resources

### Wazuh Components
- **wazuh-indexer** (StatefulSet, 1 replica) - OpenSearch cluster
- **wazuh-manager** (Deployment) - Security events manager
- **wazuh-dashboard** (Deployment) - Web UI
- **Services:** wazuh-indexer:9200, wazuh-manager:55000, wazuh-dashboard:5601

### n8n Components
- **n8n-postgres** (StatefulSet, 1 replica) - PostgreSQL database
- **n8n** (Deployment) - Workflow automation
- **Services:** n8n-postgres:5432, n8n:5678

### MCP Components
- **wazuh-mcp-server** (Deployment) - Wazuh MCP integration
- **n8n-mcp-server** (Deployment) - n8n MCP integration
- **Services:** wazuh-mcp-server:3000, n8n-mcp-server:3001
- **KEDA ScaledObjects:** Auto-scaling based on metrics

## Access Information

### External Access (NodePort)
- **Wazuh Dashboard:** https://10.88.145.180:30561
  - Default credentials: admin / admin (check wazuh-credentials secret)

### Internal Access (ClusterIP)
- **n8n UI:** http://n8n.n8n.svc.cluster.local:5678
  - Webhook URL: http://n8n.n8n.svc.cluster.local:5678/webhook/
- **Wazuh API:** http://wazuh-manager.wazuh.svc.cluster.local:55000
- **Wazuh Indexer:** https://wazuh-indexer.wazuh.svc.cluster.local:9200
- **Wazuh MCP:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000
- **n8n MCP:** http://n8n-mcp-server.mcp.svc.cluster.local:3001

### Port Forwarding (for external access to internal services)
```bash
# Access n8n from local machine
kubectl port-forward -n n8n svc/n8n 5678:5678
# Then open: http://localhost:5678

# Access Wazuh API
kubectl port-forward -n wazuh svc/wazuh-manager 55000:55000
```

## Integration Checklist

### Pre-Integration Verification

Run these commands on the K3s master (10.88.145.180):

```bash
# 1. Check all pods are running
kubectl get pods -n wazuh
kubectl get pods -n n8n
kubectl get pods -n mcp

# 2. Verify StatefulSets are ready
kubectl get statefulset -n wazuh wazuh-indexer
kubectl get statefulset -n n8n n8n-postgres

# 3. Check service endpoints
kubectl get endpoints -n wazuh
kubectl get endpoints -n n8n
kubectl get endpoints -n mcp

# 4. Test MCP server health
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health

kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n-mcp-server.mcp.svc.cluster.local:3001/health

# 5. Test n8n health
kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
  curl http://n8n.n8n.svc.cluster.local:5678/healthz
```

### Integration Steps

- [ ] **Step 1:** Verify all pods are running
- [ ] **Step 2:** Access n8n UI and create webhook workflow
- [ ] **Step 3:** Configure Wazuh integration to send alerts to n8n webhook
- [ ] **Step 4:** Test webhook with sample alert
- [ ] **Step 5:** Verify MCP servers can query Wazuh and n8n
- [ ] **Step 6:** Generate real Wazuh alert and verify end-to-end flow

Detailed integration instructions: `INTEGRATION-GUIDE.md`

## Next Steps

1. **Verify Deployment:**
   - SSH to K3s master: `ssh root@10.88.145.180`
   - Run verification commands from checklist above

2. **Configure Integration:**
   - Follow steps in `INTEGRATION-GUIDE.md`
   - Create n8n webhook workflow
   - Configure Wazuh integration

3. **Test Integration:**
   - Run: `./scripts/test-integration.sh`
   - Run: `./scripts/test-mcp-servers.sh`

4. **Monitor and Validate:**
   - Check Wazuh Dashboard for alerts
   - Check n8n executions for webhook activity
   - Verify MCP server logs

---

**Report Generated:** Sun Dec 14 07:44:24 CST 2025
**Verification Method:** Proxmox API
