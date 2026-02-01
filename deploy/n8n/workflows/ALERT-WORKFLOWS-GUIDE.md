# Cortex Alert Handling Workflows Guide

This guide covers the four core N8N workflows for Cortex alert handling and incident management.

## Workflows Overview

### 1. alertmanager-webhook-receiver.json
**Purpose**: Receives and processes webhooks from Alertmanager

**Webhook URL**: `/webhook/alertmanager`

**Features**:
- Parses Alertmanager webhook payload (alerts array)
- Extracts alert metadata: name, severity, labels, annotations
- Routes alerts by severity: critical/warning/info
- Handles both firing and resolved states
- Retry logic: 3 attempts with 1s backoff
- Triggers auto-remediation for critical alerts

**Flow**:
```
Webhook → Parse Payload → Route by Severity → Forward to Notification Router
                                            ↓
                                    Check Alert State → Trigger Remediation
```

---

### 2. alert-notification-router.json
**Purpose**: Routes alerts to appropriate notification channels based on severity

**Webhook URL**: `/webhook/alert-notification-router`

**Routing Logic**:
- **Critical Alerts**:
  - Slack notification (formatted blocks with action buttons)
  - Email notification (via SMTP)
  - Audit trail logging

- **Warning Alerts**:
  - Slack notification only
  - Audit trail logging

- **Info Alerts**:
  - Audit trail logging only

**Message Formatting**:
- Rich Slack blocks with alert details
- Contextual information (cluster, namespace, pod, instance)
- Action buttons (Acknowledge, View Details)
- Email with formatted alert details

---

### 3. auto-remediation-workflows.json
**Purpose**: Automatically remediates specific alert types

**Webhook URL**: `/webhook/auto-remediation`

**Supported Remediations**:

1. **CortexPodCrashLooping**
   - Action: Delete crashing pod (forces restart)
   - Safety: Approval gate (bypassed in dry-run)
   - Command: `kubectl delete pod <pod> -n <namespace>`

2. **CortexHighMemoryUsage**
   - Action: Create/update Horizontal Pod Autoscaler
   - Configuration: min=2, max=10, cpu-percent=70
   - Command: `kubectl autoscale deployment <deployment> -n <namespace>`

3. **CortexTokenBudgetLow**
   - Action: Pause non-critical workers
   - Notification: Slack alert to ops team
   - API Call: `POST /api/workers/pause-non-critical`

**Safety Features**:
- **Dry-Run Mode**: Set `AUTO_REMEDIATION_DRY_RUN=true` to test without execution
- **Approval Gate**: Manual approval for destructive actions (can be configured)
- **Per-Alert Control**: Disable via annotation `auto_remediation: "false"`
- **Audit Logging**: All actions logged to audit trail

---

### 4. incident-tracker.json
**Purpose**: Tracks alert lifecycle and generates incident management data

**Webhook URL**: `/webhook/incident-tracker`

**Features**:

**Incident Creation** (Firing Alerts):
- Creates incident record with unique ID
- Tracks firing timestamp
- Aggregates related alerts into single incident
- Stores incident data (webhook/database/file)

**Incident Resolution** (Resolved Alerts):
- Updates incident status to resolved
- Calculates MTTR (Mean Time To Resolution)
- Logs resolution metrics
- Updates incident database

**Weekly Summary Report**:
- **Schedule**: Every Monday at 9 AM
- **Metrics**:
  - Total incidents (last 7 days)
  - Critical vs warning breakdown
  - Active vs resolved count
  - Resolution rate percentage
  - Average MTTR (formatted as human-readable)
  - Top 5 recurring incidents
- **Delivery**: Slack notification + JSON file export

---

## Configuration Requirements

### Environment Variables

Set these in N8N environment or workflow settings:

```bash
# Slack Integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email Notifications
ALERT_FROM_EMAIL=alerts@cortex.local
ALERT_TO_EMAIL=oncall@cortex.local

# Auto-Remediation
AUTO_REMEDIATION_DRY_RUN=false  # Set to true to test without execution
```

### N8N Credentials

Configure these credentials in N8N:

1. **SMTP Account** (for email notifications)
   - Type: SMTP
   - Name: "SMTP Account (Configure)"
   - Settings: Your SMTP server details

2. **Kubernetes Cluster SSH** (for kubectl execution)
   - Type: SSH
   - Name: "Kubernetes Cluster SSH"
   - Settings: SSH access to cluster with kubectl configured
   - Alternative: Run N8N inside Kubernetes with kubectl in container

### Alertmanager Configuration

The Alertmanager is already configured in `prometheus-values.yaml`:

```yaml
alertmanager:
  config:
    receivers:
      - name: 'n8n-webhook'
        webhook_configs:
          - url: 'http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager'
            send_resolved: true
```

---

## Storage Backend Options

The workflows use HTTP webhook placeholders for storage. Replace with your preferred backend:

### Option 1: PostgreSQL
```sql
CREATE TABLE incidents (
  incident_id VARCHAR(64) PRIMARY KEY,
  fingerprint VARCHAR(64),
  alert_name VARCHAR(255),
  severity VARCHAR(20),
  cluster VARCHAR(100),
  namespace VARCHAR(100),
  status VARCHAR(20),
  fired_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,
  mttr_seconds INTEGER,
  summary TEXT,
  description TEXT,
  labels JSONB,
  annotations JSONB,
  related_alerts JSONB,
  alert_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity);
CREATE INDEX idx_incidents_fired_at ON incidents(fired_at);
```

### Option 2: File System
- Use N8N Files node
- Path: `/cortex/data/incidents/`
- Format: One JSON file per incident

### Option 3: External Systems
- PagerDuty, Opsgenie, or Jira Service Desk

---

## Testing

### Test Webhook Receiver
```bash
curl -X POST http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {
        "alertname": "CortexPodCrashLooping",
        "severity": "critical",
        "namespace": "cortex",
        "pod": "cortex-worker-123"
      },
      "annotations": {
        "summary": "Pod crash looping test",
        "description": "Test alert"
      },
      "status": "firing",
      "startsAt": "2025-12-12T00:00:00Z",
      "fingerprint": "abc123def456"
    }]
  }'
```

### Test Auto-Remediation (Dry-Run)
```bash
export AUTO_REMEDIATION_DRY_RUN=true

curl -X POST http://n8n.cortex.svc.cluster.local:5678/webhook/auto-remediation \
  -H "Content-Type: application/json" \
  -d '{
    "alert": {
      "alertName": "CortexPodCrashLooping",
      "namespace": "cortex",
      "pod": "test-pod",
      "severity": "critical",
      "status": "firing"
    }
  }'
```

---

## Architecture Diagram

```
┌─────────────────┐
│  Alertmanager   │
└────────┬────────┘
         │ POST /webhook/alertmanager
         ▼
┌─────────────────────────────────────┐
│  alertmanager-webhook-receiver.json │
│  • Parse payload                    │
│  • Route by severity                │
│  • Forward to downstream            │
└────────┬────────────────────────────┘
         │
         ├─────────────────────────┬──────────────────────┐
         ▼                         ▼                      ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐
│ alert-notification- │  │ auto-remediation-    │  │ incident-       │
│ router.json         │  │ workflows.json       │  │ tracker.json    │
│                     │  │                      │  │                 │
│ • Format messages   │  │ • Pod restart        │  │ • Create        │
│ • Send to Slack     │  │ • HPA scaling        │  │   incident      │
│ • Send email        │  │ • Pause workers      │  │ • Track MTTR    │
│ • Log to audit      │  │ • Log actions        │  │ • Weekly report │
└─────────────────────┘  └──────────────────────┘  └─────────────────┘
```

---

## Import Instructions

1. Open N8N instance
2. Click "Import from File"
3. Select each JSON file
4. Configure credentials (SMTP, SSH)
5. Set environment variables
6. Activate workflows

---

**Last Updated**: 2025-12-12
**Version**: 1.0
