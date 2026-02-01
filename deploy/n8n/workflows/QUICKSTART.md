# N8N Alert Workflows - Quick Start Guide

Get your N8N alert handling workflows up and running in 15 minutes.

## Prerequisites

- N8N instance running (Docker, Kubernetes, or standalone)
- Prometheus and Alertmanager deployed
- Kubernetes cluster access (for auto-remediation)
- Slack workspace with webhook permissions

## Quick Setup (5 Steps)

### Step 1: Import Workflows (2 minutes)

**Option A: Manual Import (Recommended)**
1. Open N8N UI: http://your-n8n:5678
2. Go to: Workflows > ⋮ > Import from File
3. Import each JSON file:
   - `alertmanager-webhook-handler.json`
   - `alert-escalation-workflow.json`
   - `auto-remediation-workflow.json`
   - `daily-health-report.json`
   - `governance-audit-workflow.json`

**Option B: Automated Import**
```bash
# Set your N8N details
export N8N_HOST=localhost
export N8N_PORT=5678
export N8N_API_KEY=your-api-key  # Optional

# Run import script
./import-workflows.sh
```

### Step 2: Configure Environment Variables (5 minutes)

Copy and customize the configuration template:

```bash
# Copy template
cp config-template.env .env

# Edit with your values
nano .env
```

**Minimum Required Configuration:**
```bash
# Essential settings
PROMETHEUS_URL=http://prometheus:9090
ALERTMANAGER_URL=http://alertmanager:9093
SLACK_WEBHOOK_CRITICAL=https://hooks.slack.com/services/YOUR/WEBHOOK/HERE
ALERT_FROM_EMAIL=alerts@your-domain.com
ONCALL_EMAIL=oncall@your-domain.com
```

**Load into N8N:**
1. N8N UI > Settings > Environments
2. Paste environment variables
3. Save

### Step 3: Configure Alertmanager (3 minutes)

Add N8N webhook receiver to `alertmanager.yml`:

```yaml
receivers:
  - name: 'n8n-alerts'
    webhook_configs:
      - url: 'http://n8n:5678/webhook/alertmanager'
        send_resolved: true

route:
  receiver: 'n8n-alerts'
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
```

Reload Alertmanager:
```bash
# Kubernetes
kubectl rollout restart deployment/alertmanager -n monitoring

# Docker
docker restart alertmanager

# Send SIGHUP
kill -HUP $(pidof alertmanager)
```

### Step 4: Activate Workflows (2 minutes)

For each workflow in N8N:
1. Open workflow
2. Click **Active** toggle (top-right)
3. Verify "Workflow activated" message

Verify webhooks are registered:
```bash
# Should show webhook endpoints
curl http://n8n:5678/webhook-test/
```

### Step 5: Test the System (3 minutes)

**Test Alertmanager Integration:**
```bash
curl -X POST http://n8n:5678/webhook/alertmanager \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {
        "alertname": "TestAlert",
        "severity": "critical",
        "service": "test",
        "instance": "test-1",
        "namespace": "cortex"
      },
      "annotations": {
        "summary": "Test alert",
        "description": "Testing N8N integration"
      },
      "status": "firing"
    }]
  }'
```

**Expected Results:**
- Slack notification in critical channel
- Email to on-call address
- Execution visible in N8N > Executions

**Test Auto-Remediation:**
```bash
curl -X POST http://n8n:5678/webhook/auto-remediation \
  -H "Content-Type: application/json" \
  -d '{
    "alert": {
      "alertname": "CortexPodCrashLooping",
      "labels": {
        "severity": "critical",
        "service": "cortex-worker",
        "namespace": "cortex",
        "pod": "cortex-worker-test"
      }
    }
  }'
```

## Verification Checklist

- [ ] All 5 workflows imported successfully
- [ ] Environment variables configured
- [ ] Alertmanager pointing to N8N webhook
- [ ] All workflows activated
- [ ] Test alert received in Slack
- [ ] Test alert sent to email
- [ ] Execution logs visible in N8N

## Common Issues

### Issue: Webhook returns 404
**Solution:** Ensure workflow is activated and saved.

### Issue: No Slack notifications
**Solution:**
1. Verify SLACK_WEBHOOK_* URLs are correct
2. Test webhook directly:
```bash
curl -X POST $SLACK_WEBHOOK_CRITICAL \
  -H "Content-Type: application/json" \
  -d '{"text":"Test from N8N"}'
```

### Issue: Kubernetes commands fail in auto-remediation
**Solution:**
1. Verify N8N has kubeconfig access
2. Check RBAC permissions:
```bash
kubectl auth can-i get pods --namespace=cortex --as=system:serviceaccount:n8n:n8n
```

### Issue: Prometheus queries return no data
**Solution:**
1. Verify PROMETHEUS_URL is correct
2. Test Prometheus access:
```bash
curl "$PROMETHEUS_URL/api/v1/query?query=up"
```

## Next Steps

### Advanced Configuration

1. **Set up PagerDuty Integration**
   - Get routing key from PagerDuty
   - Set `PAGERDUTY_ROUTING_KEY` in environment
   - Edit escalation workflow for your escalation ladder

2. **Configure Governance Policies**
   - Deploy governance API service
   - Define policies in governance-service
   - Test with sample config change

3. **Customize SLO Targets**
   - Edit `daily-health-report.json`
   - Adjust SLO thresholds in "Process Metrics" node
   - Update `SLO_*_TARGET` environment variables

4. **Add Custom Prometheus Alerts**
   - Import `prometheus-alert-rules.yaml` into Prometheus
   - Customize alert thresholds
   - Add new alert types to auto-remediation

### Monitoring N8N Workflows

**View Execution History:**
```
N8N UI > Executions
```

**Check Workflow Performance:**
```
N8N UI > Workflow > Executions > Filter by status
```

**Monitor N8N Metrics (if Prometheus exporter enabled):**
```promql
# Workflow execution count
n8n_workflow_executions_total

# Failed executions
n8n_workflow_executions_failed_total

# Execution duration
n8n_workflow_execution_duration_seconds
```

## Production Recommendations

### High Availability

1. **Run Multiple N8N Instances**
   ```yaml
   # Kubernetes Deployment
   replicas: 3
   ```

2. **Use External Database**
   ```bash
   DB_TYPE=postgresdb
   DB_POSTGRESDB_HOST=postgres.default.svc.cluster.local
   ```

3. **Enable Redis Queue Mode**
   ```bash
   EXECUTIONS_MODE=queue
   QUEUE_BULL_REDIS_HOST=redis.default.svc.cluster.local
   ```

### Security

1. **Enable Webhook Authentication**
   ```bash
   WEBHOOK_SIGNATURE_VERIFICATION=true
   WEBHOOK_SECRET=your-secret-key
   ```

2. **Use API Key Authentication**
   ```bash
   N8N_API_KEY_AUTH=true
   ```

3. **Enable TLS/SSL**
   ```bash
   N8N_PROTOCOL=https
   N8N_SSL_CERT=/path/to/cert.pem
   N8N_SSL_KEY=/path/to/key.pem
   ```

### Performance Tuning

1. **Increase Concurrent Executions**
   ```bash
   N8N_MAX_CONCURRENT_EXECUTIONS=20
   ```

2. **Adjust Timeout Settings**
   ```bash
   EXECUTIONS_TIMEOUT=300  # 5 minutes
   EXECUTIONS_TIMEOUT_MAX=3600  # 1 hour
   ```

3. **Configure Execution Data Retention**
   ```bash
   EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
   EXECUTIONS_DATA_SAVE_ON_ERROR=all
   EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
   ```

## Support Resources

- **N8N Documentation:** https://docs.n8n.io
- **Prometheus Alerting:** https://prometheus.io/docs/alerting/
- **Workflow README:** See `README.md` for detailed documentation
- **Example Alerts:** See `prometheus-alert-rules.yaml`

## Troubleshooting Commands

```bash
# Check N8N health
curl http://n8n:5678/healthz

# View N8N logs (Docker)
docker logs -f n8n

# View N8N logs (Kubernetes)
kubectl logs -f deployment/n8n -n n8n

# Test Prometheus connectivity
curl "$PROMETHEUS_URL/api/v1/query?query=up"

# Test Alertmanager connectivity
curl "$ALERTMANAGER_URL/api/v2/status"

# Verify webhook endpoints
curl http://n8n:5678/webhook-test/

# Check environment variables in N8N
# N8N UI > Settings > Environments
```

## Quick Reference

### Webhook URLs
```
Alertmanager:     http://n8n:5678/webhook/alertmanager
Auto-Remediation: http://n8n:5678/webhook/auto-remediation
Governance:       http://n8n:5678/webhook/governance-audit
```

### Critical Environment Variables
```bash
PROMETHEUS_URL              # Prometheus endpoint
ALERTMANAGER_URL           # Alertmanager endpoint
SLACK_WEBHOOK_CRITICAL     # Critical alerts Slack webhook
ALERT_FROM_EMAIL           # Alert sender email
ONCALL_EMAIL              # On-call recipient email
```

### Workflow Activation Status
```
✓ Alertmanager Handler    - Active
✓ Escalation              - Active (cron: */5 * * * *)
✓ Auto-Remediation        - Active
✓ Daily Health Report     - Active (cron: 0 8 * * *)
✓ Governance Audit        - Active
```

---

**You're all set!** Your N8N alert handling workflows are now ready to automate your Cortex monitoring and operations.

For detailed documentation, see [README.md](README.md).
