# Phase 2: Kubernetes Deployment - Complete

Task: mon-001-k8s
Contractor: talos-contractor
Status: Manifests Ready (Deployment Pending - Cluster Not Accessible)

## Summary

Phase 2 deliverables are complete. All Kubernetes manifests and deployment scripts have been created for the kube-prometheus-stack monitoring solution.

## Deliverables Created

1. **namespace.yaml** - Monitoring namespace
2. **prometheus-values.yaml** - Complete Helm values configuration
3. **ingress.yaml** - Ingress resources for external access
4. **storage-class.yaml** - Storage configuration for persistent volumes
5. **deploy-monitoring.sh** - Automated deployment script with verification

All files located at: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/`

## Current Status

**Cluster Accessibility:** NOT ACCESSIBLE
- kubeconfig is empty (~/.kube/config)
- kubectl cannot connect to cluster
- Deployment cannot proceed until cluster is configured

**Manifests Status:** READY
- All Kubernetes manifests created
- Helm values configured
- Deployment script ready
- Storage configuration needs node name updates

## Deployment When Ready

Once the Talos cluster is accessible:

```bash
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring

# 1. Update node names in storage-class.yaml
kubectl get nodes  # Get actual node names
vi storage-class.yaml  # Update "talos-node-1" references

# 2. Deploy monitoring stack
./deploy-monitoring.sh deploy

# 3. Verify deployment
./deploy-monitoring.sh verify

# 4. Get access information
./deploy-monitoring.sh info
```

## Key Configuration

### Prometheus
- Retention: 30 days / 50GB
- Storage: 50Gi PV
- Scrape interval: 30s
- Custom Cortex alerts configured

### Grafana
- Admin password: cortex-admin-changeme (CHANGE THIS!)
- Storage: 10Gi PV
- Datasource: Prometheus (pre-configured)

### Alertmanager
- Webhook: http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager
- Retention: 120 hours
- Storage: 10Gi PV
- Routes: critical and warning alerts to n8n

## Service Endpoints

### Internal (Cluster)
- Prometheus: http://prometheus-prometheus.monitoring.svc.cluster.local:9090
- Grafana: http://prometheus-grafana.monitoring.svc.cluster.local:80
- Alertmanager: http://prometheus-alertmanager.monitoring.svc.cluster.local:9093

### External (Ingress)
- Prometheus: http://prometheus.cortex.local
- Grafana: http://grafana.cortex.local
- Alertmanager: http://alertmanager.cortex.local

### Port Forwarding
```bash
kubectl port-forward -n monitoring svc/prometheus-prometheus 9090:9090
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
kubectl port-forward -n monitoring svc/prometheus-alertmanager 9093:9093
```

## Custom Alert Rules

Configured in prometheus-values.yaml:

1. **CortexWorkflowFailed** - Triggers when n8n workflow fails
2. **CortexHighMemoryUsage** - Memory > 85% for 10 minutes
3. **CortexHighCPUUsage** - CPU > 80% for 10 minutes
4. **CortexPodCrashLooping** - Pod restart detection

## N8N Integration Ready

Alertmanager is pre-configured with webhook to n8n:

**Webhook URL:** http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager

Alert routing configured:
- Critical and warning alerts → n8n webhook
- Watchdog alerts → null (silenced)
- Resolved alerts → sent to webhook

## Handoff to Phase 3

Complete handoff document created at:
`/Users/ryandahlberg/Projects/cortex/coordination/workflows/active/mon-001-k8s-handoff.json`

Contains:
- All service endpoints and URLs
- Webhook configuration details
- Alert rules and routing
- Storage configuration
- Deployment commands
- Verification steps
- Tasks for n8n-contractor
- Security considerations

## Next Steps (n8n-contractor - Phase 3)

1. Create webhook endpoint at /webhook/alertmanager
2. Implement alert routing logic by severity
3. Configure notification channels (email, Slack, Discord)
4. Test webhook receives alerts from Alertmanager
5. Create Prometheus datasource in n8n
6. Build alert aggregation workflow
7. Set up alert resolution tracking
8. Document alert handling procedures

## Blockers

**CRITICAL:**
- Kubernetes cluster not accessible (empty kubeconfig)
- Cannot deploy until cluster is configured

**NON-CRITICAL:**
- Node names in storage-class.yaml need updating (placeholder values)
- Grafana admin password should be changed before production use

## Files Reference

```
/Users/ryandahlberg/Projects/cortex/deploy/monitoring/
├── namespace.yaml                    # Monitoring namespace
├── prometheus-values.yaml            # Helm values (main config)
├── ingress.yaml                      # External access
├── storage-class.yaml                # Persistent storage
├── deploy-monitoring.sh              # Deployment script
└── PHASE2-DEPLOYMENT.md              # This file
```

## Verification Commands

After deployment:

```bash
# Check all pods running
kubectl get pods -n monitoring

# Check services
kubectl get svc -n monitoring

# Check ingress
kubectl get ingress -n monitoring

# Check persistent volumes
kubectl get pvc -n monitoring

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-prometheus 9090:9090
# Visit: http://localhost:9090/targets

# Check Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Visit: http://localhost:3000
# Login: admin / cortex-admin-changeme

# Check Alertmanager
kubectl port-forward -n monitoring svc/prometheus-alertmanager 9093:9093
# Visit: http://localhost:9093
```

## Success Criteria

Phase 2 Complete:
- ✓ All manifests created
- ✓ Deployment script ready
- ✓ Handoff documentation complete
- ✓ N8N webhook configured in Alertmanager
- ✓ Custom alert rules defined

Deployment Success (When Cluster Available):
- ☐ All pods in monitoring namespace running
- ☐ Prometheus scraping targets successfully
- ☐ Grafana accessible with Prometheus datasource
- ☐ Alertmanager routing alerts
- ☐ Ingress resources accessible
- ☐ PVCs bound to PVs

## Resources

- Helm Chart: kube-prometheus-stack v56.0.0
- Deployment Guide: README.md in this directory
- Handoff Document: `/Users/ryandahlberg/Projects/cortex/coordination/workflows/active/mon-001-k8s-handoff.json`

---

**Phase 2 Status:** COMPLETE (Manifests Ready)
**Next Phase:** Phase 3 - N8N Workflow Integration
**Next Contractor:** n8n-contractor
**Task ID:** mon-001-n8n
