# N8N Alert Workflows Architecture

## System Overview

This document describes the architecture of the Cortex N8N alert handling system.

## Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Cortex Talos Cluster                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐     │
│  │  Prometheus  │───────>│ Alertmanager │───────>│     N8N      │     │
│  │   (Metrics)  │        │   (Alerts)   │        │ (Workflows)  │     │
│  └──────────────┘        └──────────────┘        └──────┬───────┘     │
│         │                                                │              │
│         │ Scrapes                                        │              │
│         ▼                                                │              │
│  ┌──────────────┐                                       │              │
│  │ Cortex Pods  │                                       │              │
│  │   Workers    │◄──────────────────────────────────────┘              │
│  │   Masters    │        Auto-remediation (kubectl)                    │
│  └──────────────┘                                                      │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Webhooks
                                   ▼
                    ┌──────────────────────────────┐
                    │    External Integrations      │
                    ├──────────────────────────────┤
                    │  • Slack (notifications)     │
                    │  • Email (SMTP)              │
                    │  • PagerDuty (optional)      │
                    │  • Incident DB (storage)     │
                    └──────────────────────────────┘
```

## Workflow Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ALERTMANAGER WEBHOOK RECEIVER                     │
│  Entry point: /webhook/alertmanager                                 │
│  • Receives alerts from Alertmanager                                │
│  • Parses alert payload (name, severity, labels, annotations)       │
│  • Routes by severity: critical/warning/info                        │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ├───────────────────┬────────────────────┬────────────────────┐
         ▼                   ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│   CRITICAL     │  │    WARNING     │  │      INFO      │  │  RESOLVED      │
│   Severity     │  │    Severity    │  │    Severity    │  │    State       │
└────────┬───────┘  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘
         │                   │                    │                    │
         └───────────────────┴────────────────────┴────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   NOTIFICATION   │      │  AUTO-REMEDIATION│      │ INCIDENT TRACKER │
│     ROUTER       │      │    WORKFLOWS     │      │                  │
├──────────────────┤      ├──────────────────┤      ├──────────────────┤
│ Path:            │      │ Path:            │      │ Path:            │
│ /alert-          │      │ /auto-           │      │ /incident-       │
│ notification-    │      │ remediation      │      │ tracker          │
│ router           │      │                  │      │                  │
├──────────────────┤      ├──────────────────┤      ├──────────────────┤
│ Actions:         │      │ Actions:         │      │ Actions:         │
│                  │      │                  │      │                  │
│ Critical:        │      │ Pod Crash:       │      │ Firing:          │
│  • Slack         │      │  • Delete pod    │      │  • Create inc    │
│  • Email         │      │  • Force restart │      │  • Track time    │
│  • Audit log     │      │                  │      │                  │
│                  │      │ High Memory:     │      │ Resolved:        │
│ Warning:         │      │  • Create HPA    │      │  • Calc MTTR     │
│  • Slack         │      │  • Auto-scale    │      │  • Update status │
│  • Audit log     │      │                  │      │                  │
│                  │      │ Token Low:       │      │ Weekly:          │
│ Info:            │      │  • Pause workers │      │  • Summary       │
│  • Audit log     │      │  • Notify ops    │      │  • Slack report  │
│                  │      │                  │      │  • Save to file  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
         │                         │                         │
         └─────────────────────────┴─────────────────────────┘
                                   │
                                   ▼
                          ┌────────────────┐
                          │  AUDIT TRAIL   │
                          │  (All actions  │
                          │   logged)      │
                          └────────────────┘
```

## Data Flow

### 1. Alert Firing Flow

```
1. Prometheus detects metric threshold breach
   ↓
2. Alert rule triggers
   ↓
3. Alertmanager receives alert
   ↓
4. Alertmanager sends webhook to N8N
   POST /webhook/alertmanager
   {
     "alerts": [{
       "status": "firing",
       "labels": {"alertname": "...", "severity": "..."},
       "annotations": {"summary": "...", "description": "..."}
     }]
   }
   ↓
5. N8N Webhook Receiver parses alert
   ↓
6. Routes to 3 parallel workflows:
   a) Notification Router → Slack/Email
   b) Auto-Remediation → kubectl/API calls
   c) Incident Tracker → Create incident
```

### 2. Alert Resolution Flow

```
1. Prometheus detects metric returns to normal
   ↓
2. Alertmanager marks alert as resolved
   ↓
3. Alertmanager sends webhook to N8N
   POST /webhook/alertmanager
   {
     "alerts": [{
       "status": "resolved",
       "labels": {...},
       "endsAt": "2025-12-12T00:30:00Z"
     }]
   }
   ↓
4. N8N Webhook Receiver parses resolved alert
   ↓
5. Routes to Incident Tracker
   ↓
6. Incident Tracker:
   - Calculates MTTR (endsAt - startsAt)
   - Updates incident status to "resolved"
   - Stores metrics
```

## Node Breakdown by Workflow

### Alertmanager Webhook Receiver (12 nodes)

1. Webhook Trigger - Entry point
2. Parse Alertmanager Payload - Extract alerts
3. Route by Severity - Switch node (3 outputs)
4. Forward Critical Alert - HTTP Request with retry
5. Forward Warning Alert - HTTP Request with retry
6. Log Info Alert - HTTP Request
7. Check Alert State - Code node
8. Check If Firing? - If node
9. Trigger Auto-Remediation - HTTP Request
10. Webhook Response - Respond to webhook
11-12. Sticky Notes - Documentation

### Alert Notification Router (15 nodes)

1. Webhook Input - Entry point
2. Extract Alert Data - Code node
3. Switch by Severity - Switch node (3 outputs)
4. Format Critical Message - Code node (Slack + Email)
5. Format Warning Message - Code node (Slack)
6. Format Info Log - Code node
7. Send to Slack (Critical) - HTTP Request
8. Send Email (Critical) - Email Send node
9. Log to Audit Trail (Critical) - HTTP Request
10. Send to Slack (Warning) - HTTP Request
11. Log to Audit Trail (Warning) - HTTP Request
12. Log to Audit Trail (Info) - HTTP Request
13. Webhook Response - Respond to webhook
14-15. Sticky Notes - Documentation

### Auto-Remediation Workflows (19 nodes)

1. Webhook Trigger - Entry point
2. Extract Alert & Check Config - Code node
3. Is Remediation Enabled? - If node
4. Route by Alert Type - Switch node (3 outputs)
5. Prepare Pod Delete - Code node
6. Approval Gate - If node
7. Execute kubectl - Execute Command node
8. Prepare HPA Scaling - Code node
9. Execute HPA Command - Execute Command node
10. Prepare Token Budget Remediation - Code node
11. Send Token Budget Notification - HTTP Request
12. Pause Non-Critical Workers - Execute Command node
13. Log Remediation Action - HTTP Request
14. Webhook Response - Respond to webhook
15. Response (Disabled) - Respond to webhook
16. Log Dry-Run - Code node
17. Capture Execution Result - Code node
18-19. Sticky Notes - Documentation

### Incident Tracker (18 nodes)

1. Webhook Trigger - Entry point
2. Extract Alert Data - Code node
3. Is Critical? - If node
4. Is Firing? - If node
5. Check Alert Aggregation - Code node
6. Create Incident Record - Code node
7. Resolve Incident & Calculate MTTR - Code node
8. Store Incident - HTTP Request with retry
9. Update Incident - HTTP Request with retry
10. Webhook Response - Respond to webhook
11. Response (Skipped) - Respond to webhook
12. Weekly Schedule - Schedule Trigger (Monday 9 AM)
13. Fetch Weekly Incidents - HTTP Request
14. Generate Weekly Summary - Code node
15. Send Weekly Summary - HTTP Request (Slack)
16. Save Summary to File - Files node
17-18. Sticky Notes - Documentation

## Security Considerations

### 1. Webhook Authentication
Currently: No authentication (internal cluster network)
Recommended: Add API key validation in webhook trigger

### 2. Credential Management
- SMTP credentials: Stored in N8N encrypted credentials
- SSH keys: Stored in N8N encrypted credentials
- Slack webhook URLs: Environment variables (not in code)

### 3. RBAC for kubectl
- Auto-remediation requires cluster access
- Use service account with minimal permissions:
  - pods: get, list, delete (specific namespace)
  - deployments: get, list, patch (for HPA)
  - horizontalpodautoscalers: get, create, patch

### 4. Audit Trail
- All actions logged with timestamps
- Include actor (system), action, target, result
- Immutable log storage recommended

## Performance Considerations

### Alertmanager → N8N
- Webhook timeout: 10s default
- Retry: 3 attempts with backoff
- Response required: 200 OK within 10s

### N8N Workflow Execution
- Parallel execution for independent paths
- Async HTTP requests for notifications
- Non-blocking webhook response

### Resource Usage
- Each workflow execution: ~50-200ms
- Memory per execution: ~10-50 MB
- Concurrent executions: Limited by N8N config

## Scalability

### Horizontal Scaling
- N8N can run multiple replicas
- Webhook load balancing via Kubernetes Service
- Shared workflow definitions (no state in workflows)

### Vertical Scaling
- Increase N8N pod resources for higher throughput
- Tune queue workers for parallel execution

### Database Scaling
- Use PostgreSQL for N8N state and execution history
- Use external database for incident storage (high volume)

## Monitoring

### N8N Metrics
- Workflow execution count
- Execution duration
- Error rate
- Queue depth

### Custom Metrics
- Alerts processed per minute
- Remediation success rate
- MTTR average
- Incident creation rate

### Logging
- N8N execution logs (stdout)
- Audit trail (external storage)
- Error logs (for failed executions)

## Disaster Recovery

### N8N State Backup
- Workflow definitions: Git repository
- Execution history: Database backup
- Credentials: Encrypted backup

### Failover Strategy
- Run N8N as StatefulSet with replicas
- Use persistent volume for execution queue
- External database for state persistence

## Integration Points

### Prometheus
- Scrapes: Cortex pods, Kubernetes resources
- Alert Rules: Defined in PrometheusRule CRDs
- Storage: 30 days retention, 50GB volume

### Alertmanager
- Webhook URL: `http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager`
- Grouping: By alertname, cluster, service
- Repeat interval: 12 hours

### Kubernetes
- kubectl execution: Via SSH or in-cluster service account
- Auto-remediation targets: Pods, Deployments, HPAs
- Namespace scope: Cortex namespace (or cluster-wide)

### Slack
- Webhook URL: Environment variable
- Formatting: Slack Block Kit
- Channel: Configurable (default: alerts)

### Email
- SMTP server: Configurable credentials
- From address: alerts@cortex.local
- To address: oncall@cortex.local

## Future Enhancements

1. Machine Learning
   - Anomaly detection for alert patterns
   - Predictive remediation
   - Auto-tuning of thresholds

2. Advanced Incident Management
   - Integration with PagerDuty/Opsgenie
   - On-call rotation integration
   - SLA tracking and enforcement

3. Expanded Auto-Remediation
   - Database failover
   - Network partition handling
   - Resource quota adjustments

4. Dashboard Integration
   - Real-time alert visualization
   - Incident timeline
   - MTTR trends and SLA metrics

---
Created: 2025-12-12
Version: 1.0
