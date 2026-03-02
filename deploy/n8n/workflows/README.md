# N8N Alert Handling Workflows

This directory contains N8N workflow JSON files for comprehensive alert handling, auto-remediation, reporting, and governance automation for the Cortex monitoring system.

## Workflows Overview

### 1. Alertmanager Webhook Handler
**File:** `alertmanager-webhook-handler.json`

**Purpose:** Main alert handling workflow that receives alerts from Alertmanager and routes them based on severity.

**Features:**
- Webhook trigger at `/webhook/alertmanager`
- Parses Alertmanager webhook payload
- Routes alerts by severity (critical, warning, info)
- Critical alerts: Immediate Slack and email notifications
- Warning alerts: Team channel notifications
- Info alerts: Logged to audit trail
- Deduplication logic to prevent alert spam
- Alert grouping by alertname and service

**Configuration Required:**
```bash
# Environment variables
SLACK_WEBHOOK_CRITICAL=https://hooks.slack.com/services/YOUR/CRITICAL/WEBHOOK
SLACK_WEBHOOK_TEAM=https://hooks.slack.com/services/YOUR/TEAM/WEBHOOK
ALERT_FROM_EMAIL=alerts@cortex.local
ONCALL_EMAIL=oncall@cortex.local
AUDIT_LOG_API=http://audit-service/api/v1/logs
```

**Webhook URL:** `http://<n8n-host>:5678/webhook/alertmanager`

---

### 2. Alert Escalation Workflow
**File:** `alert-escalation-workflow.json`

**Purpose:** Automatically escalates unacknowledged critical alerts through defined escalation levels.

**Features:**
- Runs every 5 minutes via cron trigger
- Checks for unacknowledged critical alerts (>15 minutes old)
- 5-level escalation ladder:
  1. Team (Slack)
  2. Senior Engineer (Slack + Email)
  3. On-Call (PagerDuty)
  4. Manager (PagerDuty + Phone)
  5. Director (PagerDuty + Phone + SMS)
- Tracks escalation history
- On-call rotation integration
- PagerDuty integration for critical escalations

**Configuration Required:**
```bash
# Environment variables
ALERTMANAGER_URL=http://alertmanager:9093
ESCALATION_DB_API=http://escalation-db/api/v1
ONCALL_API=http://oncall-service/api/v1
SLACK_WEBHOOK_ESCALATION=https://hooks.slack.com/services/YOUR/ESCALATION/WEBHOOK
PAGERDUTY_ROUTING_KEY=your-pagerduty-routing-key
```

**Escalation Logic:**
- Level 1: Team notification via Slack
- Level 2: Senior engineer notification (Slack + Email)
- Level 3+: PagerDuty incidents with increasing urgency

---

### 3. Auto-Remediation Workflow
**File:** `auto-remediation-workflow.json`

**Purpose:** Automatically attempts to remediate common Cortex infrastructure issues.

**Features:**
- Webhook trigger for alert-driven remediation
- **CortexPodCrashLooping:**
  - Collects crash logs
  - Analyzes logs for common issues (OOM, permissions, image pull errors)
  - Automatically restarts pods when safe
- **CortexHighMemoryUsage:**
  - Checks if HPA (Horizontal Pod Autoscaler) is configured
  - Creates HPA if not present
  - Scales replicas as fallback
- **CortexWorkerStuck:**
  - Identifies stuck worker pods
  - Force terminates unresponsive workers
- Logs all remediation attempts to audit trail
- Notifies on success/failure via Slack

**Configuration Required:**
```bash
# Environment variables
SLACK_WEBHOOK_REMEDIATION=https://hooks.slack.com/services/YOUR/REMEDIATION/WEBHOOK
AUDIT_LOG_API=http://audit-service/api/v1/logs

# Kubernetes access required (in-cluster or kubeconfig)
```

**Webhook URL:** `http://<n8n-host>:5678/webhook/auto-remediation`

**Supported Alert Types:**
- `CortexPodCrashLooping`
- `CortexHighMemoryUsage`
- `CortexWorkerStuck`

---

### 4. Daily Health Report
**File:** `daily-health-report.json`

**Purpose:** Generates comprehensive daily health reports with metrics, SLO compliance, and trends.

**Features:**
- Cron trigger: Daily at 8:00 AM
- Queries Prometheus for 24-hour metrics:
  - Request rate
  - Error rate
  - Latency (P95)
  - Uptime percentage
  - Tasks completed
  - Average task duration
- Calculates SLO compliance against targets:
  - Uptime: ≥99.9%
  - Error rate: ≤1.0%
  - Latency P95: ≤1.0s
- Generates professional HTML report
- Sends via email and Slack
- Includes trend analysis (increasing/decreasing/stable)
- Logs reports to audit trail

**Configuration Required:**
```bash
# Environment variables
PROMETHEUS_URL=http://prometheus:9090
REPORT_FROM_EMAIL=reports@cortex.local
REPORT_TO_EMAIL=team@cortex.local
SLACK_WEBHOOK_REPORTS=https://hooks.slack.com/services/YOUR/REPORTS/WEBHOOK
AUDIT_LOG_API=http://audit-service/api/v1/logs
```

**Report Contents:**
- Overall health status (Excellent/Good/Fair/Poor)
- SLO compliance score
- Key metrics dashboard
- SLO compliance table
- Trend analysis with percentage changes

---

### 5. Governance Audit Workflow
**File:** `governance-audit-workflow.json`

**Purpose:** Validates configuration changes and security events against governance policies.

**Features:**
- Webhook trigger for real-time governance validation
- Routes events by type:
  - Configuration changes
  - Security events
  - Compliance checks
  - Access control events
- Validates against governance policies:
  - Require approval for changes
  - Allowed users/roles
  - Change window enforcement
  - Documentation requirements
  - Prohibited resource types
  - Testing requirements
- Integrates with Wazuh SIEM for security events
- Alerts on policy violations via Slack
- Weekly compliance report (Sundays at midnight)
- Logs all events to audit trail
- Stores compliance reports

**Configuration Required:**
```bash
# Environment variables
GOVERNANCE_API=http://governance-service/api/v1
AUDIT_LOG_API=http://audit-service/api/v1/logs
SLACK_WEBHOOK_GOVERNANCE=https://hooks.slack.com/services/YOUR/GOVERNANCE/WEBHOOK
WAZUH_API=http://wazuh-manager:55000
WAZUH_API_TOKEN=your-wazuh-api-token
```

**Webhook URL:** `http://<n8n-host>:5678/webhook/governance-audit`

**Policy Validation Types:**
- `require_approval` - Changes must be approved
- `allowed_users` - User authorization checks
- `change_window` - Enforce change windows
- `require_documentation` - Documentation requirements
- `prohibited_resources` - Resource type restrictions
- `require_testing` - Test result requirements

**Weekly Report Includes:**
- Compliance rate percentage
- Total events analyzed
- Violation counts
- Top policy violations
- Trend assessment (excellent/good/needs_improvement/critical)

---

## Installation

### 1. Import Workflows to N8N

```bash
# Option A: Use N8N UI
# - Navigate to N8N > Workflows
# - Click "Import from File"
# - Select each JSON file

# Option B: Use N8N CLI (if available)
n8n import:workflow --input=alertmanager-webhook-handler.json
n8n import:workflow --input=alert-escalation-workflow.json
n8n import:workflow --input=auto-remediation-workflow.json
n8n import:workflow --input=daily-health-report.json
n8n import:workflow --input=governance-audit-workflow.json
```

### 2. Configure Environment Variables

Create a `.env` file or configure via N8N settings:

```bash
# Alertmanager
ALERTMANAGER_URL=http://alertmanager:9093

# Prometheus
PROMETHEUS_URL=http://prometheus:9090

# Slack Webhooks
SLACK_WEBHOOK_CRITICAL=https://hooks.slack.com/services/XXX
SLACK_WEBHOOK_TEAM=https://hooks.slack.com/services/XXX
SLACK_WEBHOOK_ESCALATION=https://hooks.slack.com/services/XXX
SLACK_WEBHOOK_REMEDIATION=https://hooks.slack.com/services/XXX
SLACK_WEBHOOK_REPORTS=https://hooks.slack.com/services/XXX
SLACK_WEBHOOK_GOVERNANCE=https://hooks.slack.com/services/XXX

# Email Configuration
ALERT_FROM_EMAIL=alerts@cortex.local
ONCALL_EMAIL=oncall@cortex.local
REPORT_FROM_EMAIL=reports@cortex.local
REPORT_TO_EMAIL=team@cortex.local

# API Endpoints
AUDIT_LOG_API=http://audit-service/api/v1/logs
ESCALATION_DB_API=http://escalation-db/api/v1
ONCALL_API=http://oncall-service/api/v1
GOVERNANCE_API=http://governance-service/api/v1

# PagerDuty
PAGERDUTY_ROUTING_KEY=your-pagerduty-integration-key

# Wazuh SIEM
WAZUH_API=http://wazuh-manager:55000
WAZUH_API_TOKEN=your-wazuh-api-token
```

### 3. Configure Alertmanager Integration

Update Alertmanager configuration to send webhooks to N8N:

```yaml
# alertmanager.yml
receivers:
  - name: 'n8n-webhook'
    webhook_configs:
      - url: 'http://n8n:5678/webhook/alertmanager'
        send_resolved: true
        http_config:
          follow_redirects: true

route:
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'n8n-webhook'
```

### 4. Activate Workflows

In N8N UI:
1. Open each workflow
2. Click "Active" toggle in top-right
3. Verify webhook URLs are registered
4. Test with sample data

---

## Testing

### Test Alertmanager Webhook Handler

```bash
curl -X POST http://n8n:5678/webhook/alertmanager \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {
        "alertname": "TestAlert",
        "severity": "critical",
        "service": "cortex-api",
        "instance": "cortex-api-0",
        "namespace": "cortex"
      },
      "annotations": {
        "summary": "Test alert for webhook handler",
        "description": "This is a test alert"
      },
      "status": "firing",
      "startsAt": "2025-12-11T00:00:00Z",
      "fingerprint": "test-fingerprint-123"
    }]
  }'
```

### Test Auto-Remediation

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
        "pod": "cortex-worker-abc123"
      },
      "annotations": {
        "summary": "Pod is crash looping",
        "description": "Pod has restarted 10 times in 5 minutes"
      }
    }
  }'
```

### Test Governance Audit

```bash
curl -X POST http://n8n:5678/webhook/governance-audit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "config_change",
    "source": "kubernetes",
    "user": "admin@cortex.local",
    "resource": {
      "type": "deployment",
      "name": "cortex-api",
      "namespace": "cortex"
    },
    "changes": [
      {
        "field": "replicas",
        "old_value": "3",
        "new_value": "5"
      }
    ],
    "metadata": {
      "approvedBy": "manager@cortex.local",
      "documentation": "Scaling for increased load"
    },
    "severity": "info"
  }'
```

---

## Monitoring Workflow Execution

### View Execution Logs
1. N8N UI > Executions
2. Filter by workflow name
3. Click on execution to view details

### Common Issues

**Webhook not triggering:**
- Verify workflow is active
- Check webhook URL is correct
- Ensure N8N is reachable from Alertmanager

**Authentication errors:**
- Verify API credentials in N8N settings
- Check environment variables are set
- Test API endpoints directly

**Kubernetes commands failing:**
- Ensure N8N has proper RBAC permissions
- Verify kubeconfig is mounted (if running externally)
- Check namespace access

---

## Architecture

```
Alertmanager → [Webhook Handler] → Route by Severity
                                   ├── Critical → Slack + Email + PagerDuty
                                   ├── Warning → Slack Team Channel
                                   └── Info → Audit Log

[Escalation Workflow] → Check Unacknowledged → Escalation Ladder → PagerDuty

Alert → [Auto-Remediation] → Analyze → Remediate → Notify

[Daily Report] → Prometheus → Calculate SLO → Generate HTML → Email + Slack

Config Change → [Governance] → Validate Policies → Audit Log → Alert on Violation
                                                             └── Wazuh SIEM
```

---

## Customization

### Adding New Alert Types to Auto-Remediation

Edit `auto-remediation-workflow.json`:

1. Add new case to "Route by Alert Type" switch node
2. Create remediation logic nodes
3. Connect to merge and evaluation nodes

### Modifying Escalation Ladder

Edit `alert-escalation-workflow.json`:

Update the `escalationLadder` array in "Determine Escalation Level" node:

```javascript
const escalationLadder = [
  { level: 1, target: 'team', method: 'slack' },
  { level: 2, target: 'senior_engineer', method: 'slack,email' },
  { level: 3, target: 'on_call', method: 'pagerduty' },
  { level: 4, target: 'manager', method: 'pagerduty,phone' },
  { level: 5, target: 'director', method: 'pagerduty,phone,sms' },
  { level: 6, target: 'vp', method: 'pagerduty,phone,sms,executive_alert' } // New level
];
```

### Adding New Governance Policies

Edit `governance-audit-workflow.json`:

Add new rule type in "Validate Against Policies" node switch statement:

```javascript
case 'require_security_scan':
  if (!event.metadata?.securityScanPassed) {
    result.status = 'violation';
    result.message = 'Deployment requires security scan';
  }
  break;
```

---

## Maintenance

### Regular Tasks

1. **Review escalation history weekly** - Check for patterns in escalations
2. **Audit remediation success rates** - Improve auto-remediation logic
3. **Update SLO targets quarterly** - Adjust based on business needs
4. **Review governance policies monthly** - Ensure policies remain relevant

### Performance Optimization

- Enable workflow execution data retention limits
- Archive old execution logs
- Optimize Prometheus query ranges for large datasets
- Use webhook deduplication for high-volume alerts

---

## Support

For issues or questions:
- Check N8N execution logs for errors
- Review Prometheus metrics for workflow performance
- Consult Cortex documentation for integration details
- Test webhooks with curl commands for debugging

---

## License

Part of the Cortex Automation System.
