# Phase 8: Quick Start Guide

Quick reference for using Phase 8 advanced features.

## Self-Healing

### Deploy
```bash
kubectl apply -f k8s/self-healing/operator-deployment.yaml
```

### Monitor
```bash
# View logs
kubectl logs -n cortex -l component=self-healing -f

# Check anomaly history
kubectl exec -n cortex deployment/cortex-self-healing-operator -- \
  tail -20 /app/coordination/self-healing-history.jsonl

# Check remediation history
kubectl exec -n cortex deployment/cortex-self-healing-operator -- \
  tail -20 /app/coordination/remediation-history.jsonl
```

### Test
```bash
# Trigger anomaly (simulate high worker failure rate)
kubectl scale deployment cortex-worker --replicas=0 -n cortex

# Watch self-healing remediate
kubectl logs -n cortex -l component=self-healing -f
# Expected: Logs show anomaly detected → playbook loaded → remediation applied
```

---

## Multi-Region

### Configure
```bash
# Edit multi-region config
vi coordination/multi-region-config.json

# Set up failover region
kubectl config use-context cloud  # Switch to failover cluster
kubectl apply -f k8s/  # Deploy Cortex to failover region
```

### Initialize
```javascript
import FailoverController from './lib/multi-region/failover-controller.js'

const controller = new FailoverController()
await controller.initialize()

console.log(`Active region: ${controller.regionManager.activeRegion}`)
```

### Test Failover
```bash
# Simulate primary region failure
kubectl --context=default delete deployment cortex-coordinator-master -n cortex

# Monitor failover
tail -f coordination/failover-events.jsonl

# Expected output:
# {"event_type":"region_failover","from_region":"primary","to_region":"failover",...}
```

### Manual Failover
```javascript
// Force failover to specific region
await controller.manualFailover('failover')

// Validate readiness
const readiness = await controller.validateFailoverReadiness()
console.log(`Ready: ${readiness.ready}`)
console.log(`Checks: ${readiness.checks.length} passed`)
```

---

## Natural Language Interface

### Use via MCP
```javascript
import { naturalLanguageTool } from './mcp-server/tools/natural-language.js'

// Dry run (parse and plan only)
const result = await naturalLanguageTool.handler({
  request: 'Build me a k8s cluster with 3 nodes and monitoring',
  dry_run: true
})

console.log(result.summary)
// Outputs:
// ============================================================
// Infrastructure Request: Build me a k8s cluster with 3 nodes...
// Status: Dry run complete - no tasks executed
// Progress: 0% (0/4 tasks)
// ...

// Execute for real
const liveResult = await naturalLanguageTool.handler({
  request: 'Deploy a monitoring stack with Prometheus and Grafana',
  dry_run: false
})

console.log(`Tasks submitted: ${liveResult.decomposition.tasks}`)
console.log(`Tracking URL: ${liveResult.tracking_url}`)
```

### Get Examples
```javascript
import { nlExamplesTool } from './mcp-server/tools/natural-language.js'

const examples = await nlExamplesTool.handler()

examples.examples.forEach(ex => {
  console.log(`Request: "${ex.request}"`)
  console.log(`Intent: ${ex.intent}`)
  console.log(`Usage: ${ex.usage}`)
  console.log()
})
```

### Supported Requests
```
"Build me a k8s cluster with 3 nodes"
"Deploy a monitoring stack with Prometheus and Grafana"
"Set up a PostgreSQL database with 100GB storage and backups"
"Create a CI/CD pipeline for my application"
"Scale my deployment to 5 replicas"
"Harden my cluster security with RBAC and network policies"
```

---

## Cost Optimization

### Deploy
```bash
kubectl apply -f k8s/cost-optimization/cronjob.yaml
```

### Run Manual Analysis
```bash
# Create one-time job
kubectl create job --from=cronjob/cortex-cost-optimizer \
  cortex-cost-optimizer-manual-$(date +%s) -n cortex

# View results
kubectl logs -n cortex job/cortex-cost-optimizer-manual-<timestamp>
```

### View Recommendations
```bash
# Get latest report
LATEST_REPORT=$(ls -t coordination/cost-optimization-reports/report-*.json | head -1)

# Summary
cat $LATEST_REPORT | jq '.summary'

# Recommendations by type
cat $LATEST_REPORT | jq '.classified.scale_down.recommendations[] | {deployment, current_value, recommended_value, savings: .estimated_savings_percent}'

# Auto-apply candidates
cat $LATEST_REPORT | jq '.auto_apply_candidates[] | {deployment, type, impact}'
```

### Configure
```bash
# Edit config
kubectl edit configmap cost-optimizer-config -n cortex

# Key settings:
# - autoApply: true/false (enable auto-apply)
# - autoApplyThreshold: 0.1 (10% max impact)
# - createPRForHighImpact: true/false (create PRs)
# - dryRun: true/false (test mode)
```

### Monitor Savings
```bash
# View optimization history
tail -f coordination/cost-optimization-history.jsonl

# Track savings over time
cat coordination/cost-optimization-history.jsonl | \
  jq -s 'map(.results.auto_applied | length) | add'
# Output: Total optimizations applied
```

---

## Monitoring & Dashboards

### Prometheus Queries

```promql
# Self-healing anomaly rate
rate(cortex_self_healing_anomalies_total[5m])

# Self-healing success rate
rate(cortex_self_healing_remediations_total{status="success"}[5m]) /
rate(cortex_self_healing_remediations_total[5m])

# Multi-region replication lag
cortex_replication_lag_seconds

# Cost optimization potential savings
cortex_cost_optimization_potential_savings_percent
```

### Grafana Dashboards

```bash
# Import dashboards
kubectl apply -f k8s/monitoring/grafana-dashboards-configmap.yaml

# Access Grafana
kubectl port-forward -n monitoring svc/grafana 3000:3000

# Visit http://localhost:3000
# Default credentials: admin / admin
```

### Alerts

```yaml
# Add to Prometheus alerts.yml
- alert: SelfHealingFailures
  expr: rate(cortex_self_healing_failures_total[5m]) > 0.1
  annotations:
    summary: High self-healing failure rate

- alert: ReplicationLagHigh
  expr: cortex_replication_lag_seconds > 300
  annotations:
    summary: Replication lag > 5 minutes

- alert: CostSavingsOpportunity
  expr: cortex_cost_optimization_potential_savings > 20
  annotations:
    summary: High cost optimization opportunity
```

---

## Troubleshooting

### Self-Healing Not Working

```bash
# Check operator status
kubectl get deployment cortex-self-healing-operator -n cortex

# View logs
kubectl logs -n cortex -l component=self-healing --tail=100

# Common issues:
# 1. Prometheus not accessible
kubectl exec -n cortex deployment/cortex-self-healing-operator -- \
  curl -s http://prometheus.monitoring:9090/api/v1/query?query=up

# 2. RBAC permissions
kubectl auth can-i update deployments --as=system:serviceaccount:cortex:cortex-self-healing

# 3. Playbooks not loaded
kubectl exec -n cortex deployment/cortex-self-healing-operator -- \
  ls -la /app/lib/self-healing/playbooks/
```

### Multi-Region Failover Issues

```bash
# Check region health
node -e "
import('./lib/multi-region/region-manager.js').then(async ({ default: RegionManager }) => {
  const manager = new RegionManager();
  await manager.initialize();
  console.log(JSON.stringify(manager.getStatus(), null, 2));
});
"

# Check replication lag
cat coordination/replication-history.jsonl | tail -10

# Common issues:
# 1. Kubernetes context not configured
kubectl config get-contexts

# 2. Network connectivity
kubectl --context=failover cluster-info

# 3. Credentials expired
kubectl --context=failover get nodes
```

### Natural Language Parsing Errors

```bash
# Test intent parser
node -e "
import('./lib/nl-interface/intent-parser.js').then(async ({ default: IntentParser }) => {
  const parser = new IntentParser();
  const result = await parser.parseIntent('Build me a k8s cluster');
  console.log(JSON.stringify(result, null, 2));
});
"

# Common issues:
# 1. Unsupported request pattern
# → Check examples: cortex_nl_examples tool

# 2. Missing parameters
# → Be more specific: "Build k8s cluster with 3 nodes, 8GB RAM each"

# 3. Task decomposition failure
# → Check task templates in lib/nl-interface/task-decomposer.js
```

### Cost Optimizer No Recommendations

```bash
# Check Prometheus data
kubectl exec -n cortex deployment/cortex-cost-optimizer -- \
  node -e "
  import axios from 'axios';
  const res = await axios.get('http://prometheus.monitoring:9090/api/v1/query', {
    params: { query: 'container_cpu_usage_seconds_total' }
  });
  console.log(res.data.data.result.length + ' metrics found');
  "

# Common issues:
# 1. Insufficient metrics (< 24h data)
# → Wait for more data to accumulate

# 2. All deployments already optimized
# → Deployments running at 40-70% utilization (optimal)

# 3. Prometheus scraping issues
kubectl get servicemonitor -n monitoring
```

---

## Performance Tuning

### Self-Healing

```yaml
# Increase check frequency (default: 60s)
env:
  - name: CHECK_INTERVAL
    value: "30"  # 30 seconds

# Reduce anomaly threshold (default: 2.0x baseline)
env:
  - name: ANOMALY_THRESHOLD
    value: "1.5"  # 1.5x baseline
```

### Multi-Region

```json
// Reduce replication interval (default: 60s)
{
  "replication": {
    "coordination_state": {
      "interval_seconds": 30
    }
  }
}

// Increase failover sensitivity (default: 3 failures)
{
  "failover": {
    "health_check_failures": 2
  }
}
```

### Cost Optimization

```json
// More aggressive auto-apply (default: 10%)
{
  "autoApplyThreshold": 0.2  // 20% max impact
}

// Change analysis window (default: 24h)
// Edit lib/cost-optimization/resource-analyzer.js:
this.analysisWindow = '48h'  // 2-day average
```

---

## Integration Examples

### Self-Healing + Slack Notifications

```javascript
// Add to lib/self-healing/remediation-engine.js
async createSlackNotification(remediation) {
  await axios.post(process.env.SLACK_WEBHOOK_URL, {
    text: `🚨 Self-Healing: ${remediation.playbook_id}`,
    attachments: [{
      color: remediation.success ? 'good' : 'danger',
      fields: [
        { title: 'Anomaly', value: remediation.anomaly.metric },
        { title: 'Success', value: remediation.success.toString() }
      ]
    }]
  })
}
```

### Multi-Region + PagerDuty

```javascript
// Add to lib/multi-region/region-manager.js
async sendFailoverNotification(fromRegion, toRegion) {
  await axios.post('https://events.pagerduty.com/v2/enqueue', {
    routing_key: process.env.PAGERDUTY_ROUTING_KEY,
    event_action: 'trigger',
    payload: {
      summary: `Region failover: ${fromRegion} → ${toRegion}`,
      severity: 'critical',
      source: 'cortex-multi-region'
    }
  })
}
```

### Cost Optimization + Jira

```javascript
// Add to lib/cost-optimization/recommendation-engine.js
async createJiraTicket(recommendations) {
  await axios.post(`https://your-domain.atlassian.net/rest/api/3/issue`, {
    fields: {
      project: { key: 'OPS' },
      summary: `Cost Optimization: ${recommendations.length} recommendations`,
      description: this.generateJiraDescription(recommendations),
      issuetype: { name: 'Task' }
    }
  }, {
    auth: {
      username: process.env.JIRA_EMAIL,
      password: process.env.JIRA_API_TOKEN
    }
  })
}
```

---

## Best Practices

### Self-Healing
1. Start with dry-run mode to validate playbooks
2. Monitor remediation history for patterns
3. Create custom playbooks for domain-specific issues
4. Set up alerts for remediation failures

### Multi-Region
1. Test failover regularly (monthly drills)
2. Monitor replication lag closely
3. Keep failover region warm (minimal workload)
4. Document failback procedures

### Natural Language
1. Be specific in requests (numbers, sizes, versions)
2. Use dry-run first to validate decomposition
3. Review execution plan before running
4. Monitor progress for long-running workflows

### Cost Optimization
1. Start with auto-apply disabled (review recommendations)
2. Gradually increase auto-apply threshold
3. Create PRs for high-impact changes
4. Track savings over time with dashboards

---

## Next Steps

1. **Deploy Features**:
   ```bash
   kubectl apply -f k8s/self-healing/
   kubectl apply -f k8s/cost-optimization/
   ```

2. **Initialize Multi-Region**:
   ```bash
   node lib/multi-region/failover-controller.js
   ```

3. **Test Natural Language**:
   ```javascript
   await cortex_nl_request({ request: "Deploy monitoring", dry_run: true })
   ```

4. **Monitor & Optimize**:
   - Check Grafana dashboards
   - Review cost optimization reports
   - Validate self-healing playbooks

---

**For detailed documentation, see**: `/Users/ryandahlberg/Projects/cortex/docs/PHASE-8-ADVANCED-FEATURES.md`

**Support**: Create GitHub issue or contact DevOps team
