# N8N Alert Workflows - File Index

## Overview
Complete N8N workflow automation suite for Cortex monitoring, alerting, auto-remediation, reporting, and governance.

**Location:** `/Users/ryandahlberg/Projects/cortex/deploy/n8n/workflows/`

---

## Core Workflow Files (N8N Import)

### 1. alertmanager-webhook-handler.json (14KB)
**Purpose:** Main alert handling and routing workflow

**Trigger:** Webhook `/webhook/alertmanager`

**Features:**
- Parses Alertmanager webhook payloads
- Routes by severity (critical/warning/info)
- Deduplication logic
- Alert grouping
- Multi-channel notifications (Slack, Email)

**Nodes:** 14 nodes
- Webhook Trigger
- Parse Payload
- Route Critical/Warning
- Notify (Slack/Email)
- Deduplication
- Group Alerts
- Audit Logging

**Integration:** Alertmanager → N8N → Slack/Email/Audit

---

### 2. alert-escalation-workflow.json (16KB)
**Purpose:** Automated alert escalation management

**Trigger:** Cron (every 5 minutes)

**Features:**
- 5-level escalation ladder
- 15-minute acknowledgment window
- On-call rotation integration
- PagerDuty incident creation
- Escalation history tracking

**Nodes:** 15 nodes
- Schedule Trigger
- Get Active Alerts
- Filter Unacknowledged
- Determine Escalation Level
- Get On-Call Rotation
- Trigger PagerDuty
- Record History

**Escalation Ladder:**
1. Team (Slack)
2. Senior Engineer (Slack + Email)
3. On-Call (PagerDuty)
4. Manager (PagerDuty + Phone)
5. Director (PagerDuty + Phone + SMS)

**Integration:** Alertmanager → N8N → PagerDuty/Slack/Email

---

### 3. auto-remediation-workflow.json (22KB)
**Purpose:** Automatic infrastructure remediation

**Trigger:** Webhook `/webhook/auto-remediation`

**Features:**
- Pod crash loop recovery
- Memory pressure handling
- Stuck worker termination
- Kubernetes integration
- Success/failure notifications

**Nodes:** 24 nodes
- Webhook Trigger
- Route by Alert Type
- Collect Logs
- Analyze Issues
- Remediation Actions (3 types)
- Notify Results

**Remediation Strategies:**
1. **CortexPodCrashLooping:** Analyze logs → Restart pod
2. **CortexHighMemoryUsage:** Check HPA → Scale/Create HPA
3. **CortexWorkerStuck:** Identify stuck pod → Force terminate

**Integration:** Alert → N8N → Kubernetes → Slack

---

### 4. daily-health-report.json (22KB)
**Purpose:** Daily system health reporting

**Trigger:** Cron (daily at 8:00 AM)

**Features:**
- Prometheus metric queries (6 metrics)
- SLO compliance calculation
- HTML report generation
- Trend analysis
- Email and Slack delivery

**Nodes:** 17 nodes
- Cron Trigger
- Query Metrics (6 queries)
- Process Metrics
- Calculate SLO
- Generate HTML
- Send Email/Slack

**Metrics Tracked:**
- Request rate
- Error rate
- Latency (P95)
- Uptime
- Tasks completed
- Average task duration

**SLO Targets:**
- Uptime: ≥99.9%
- Error rate: ≤1.0%
- Latency P95: ≤1.0s

**Integration:** Prometheus → N8N → Email/Slack

---

### 5. governance-audit-workflow.json (25KB)
**Purpose:** Configuration change validation and governance

**Trigger:** 
- Webhook `/webhook/governance-audit`
- Cron (weekly Sunday 00:00)

**Features:**
- Policy validation (6 types)
- Security event logging
- Wazuh SIEM integration
- Weekly compliance reports
- Violation alerting

**Nodes:** 22 nodes
- Webhook Trigger
- Route by Event Type
- Load Policies
- Validate Rules
- Wazuh Integration
- Generate Reports

**Policy Types:**
- require_approval
- allowed_users
- change_window
- require_documentation
- prohibited_resources
- require_testing

**Integration:** Config System → N8N → Wazuh/Slack/Audit

---

## Documentation Files

### 6. README.md (13KB)
**Comprehensive documentation covering:**
- Workflow descriptions
- Installation guide
- Configuration instructions
- Testing procedures
- Troubleshooting
- Architecture diagrams
- Customization guide
- Maintenance procedures

**Sections:**
- Workflows Overview (5 workflows)
- Installation (3 methods)
- Configuration (6 categories)
- Testing (sample commands)
- Monitoring
- Customization
- Support

---

### 7. QUICKSTART.md (8KB)
**15-minute quick start guide**

**5 Steps:**
1. Import Workflows (2 min)
2. Configure Environment (5 min)
3. Configure Alertmanager (3 min)
4. Activate Workflows (2 min)
5. Test System (3 min)

**Includes:**
- Common issues
- Verification checklist
- Test commands
- Next steps

---

### 8. SUMMARY.md (6KB)
**Project summary and statistics**

**Content:**
- File breakdown
- Workflow statistics
- Integration points
- Performance metrics
- Production readiness
- Deployment estimates

**Key Stats:**
- 10 files, 4,356 lines
- 92 workflow nodes total
- 25 alert types supported
- 47 environment variables

---

## Configuration Files

### 9. config-template.env (10KB)
**Environment variable template**

**Categories:**
- Alertmanager/Prometheus URLs
- Slack webhooks (6 channels)
- Email configuration
- API endpoints (4 services)
- PagerDuty/Opsgenie
- Wazuh SIEM
- SLO targets
- Feature flags

**Variables:**
- Required: 12
- Optional: 35
- Total: 47

**Usage:**
```bash
cp config-template.env .env
# Edit values
# Load into N8N: Settings > Environments
```

---

### 10. prometheus-alert-rules.yaml (13KB)
**Prometheus alert rule definitions**

**Alert Groups:**
- cortex_pod_alerts (2 rules)
- cortex_resource_alerts (2 rules)
- cortex_worker_alerts (3 rules)
- cortex_api_alerts (3 rules)
- cortex_storage_alerts (2 rules)
- cortex_database_alerts (2 rules)
- cortex_master_alerts (2 rules)
- cortex_coordination_alerts (2 rules)
- cortex_slo_alerts (3 rules)
- cortex_security_alerts (2 rules)
- cortex_dashboard_alerts (2 rules)
- cortex_governance_alerts (2 rules)

**Total: 25+ alert rules**

**Usage:**
```yaml
# Import into Prometheus
prometheus:
  additionalPrometheusRules:
    - name: cortex-alerts
      rules:
        - alert: CortexPodCrashLooping
          expr: ...
```

---

## Scripts

### 11. import-workflows.sh (5KB)
**Automated workflow import script**

**Features:**
- N8N API integration
- Manual import instructions
- Health check validation
- Import summary

**Usage:**
```bash
# Set environment
export N8N_HOST=localhost
export N8N_PORT=5678
export N8N_API_KEY=your-key

# Run import
./import-workflows.sh
```

**Permissions:** Executable (chmod +x)

---

## File Organization

```
deploy/n8n/workflows/
├── Core Workflows (5 files, 99KB)
│   ├── alertmanager-webhook-handler.json
│   ├── alert-escalation-workflow.json
│   ├── auto-remediation-workflow.json
│   ├── daily-health-report.json
│   └── governance-audit-workflow.json
│
├── Documentation (3 files, 27KB)
│   ├── README.md
│   ├── QUICKSTART.md
│   └── SUMMARY.md
│
├── Configuration (2 files, 23KB)
│   ├── config-template.env
│   └── prometheus-alert-rules.yaml
│
├── Scripts (1 file, 5KB)
│   └── import-workflows.sh
│
└── Index (1 file, this file)
    └── INDEX.md
```

---

## Quick Reference

### Import Order
1. alertmanager-webhook-handler.json
2. alert-escalation-workflow.json
3. auto-remediation-workflow.json
4. daily-health-report.json
5. governance-audit-workflow.json

### Webhook Endpoints
```
http://n8n:5678/webhook/alertmanager
http://n8n:5678/webhook/auto-remediation
http://n8n:5678/webhook/governance-audit
```

### Cron Schedules
```
Escalation:        */5 * * * *  (every 5 minutes)
Health Report:     0 8 * * *    (daily 8 AM)
Compliance Scan:   0 0 * * 0    (weekly Sunday midnight)
```

### Critical Environment Variables
```
PROMETHEUS_URL
ALERTMANAGER_URL
SLACK_WEBHOOK_CRITICAL
ALERT_FROM_EMAIL
ONCALL_EMAIL
```

---

## Integration Map

```
┌─────────────────┐
│  Alertmanager   │
└────────┬────────┘
         │ webhook
         ▼
┌─────────────────┐
│  N8N Workflows  │◄────── Cron Triggers
└────────┬────────┘
         │
    ┌────┴────┬────────┬───────────┬──────────┐
    ▼         ▼        ▼           ▼          ▼
┌──────┐  ┌──────┐  ┌────┐  ┌──────────┐  ┌──────┐
│Slack │  │Email │  │K8s │  │PagerDuty │  │Wazuh │
└──────┘  └──────┘  └────┘  └──────────┘  └──────┘
```

---

## Getting Started

1. **Read:** QUICKSTART.md
2. **Configure:** config-template.env
3. **Import:** Use import-workflows.sh or N8N UI
4. **Test:** Follow README.md testing section
5. **Monitor:** Check N8N executions

---

## Support

- **Full Documentation:** README.md
- **Quick Setup:** QUICKSTART.md
- **Project Stats:** SUMMARY.md
- **Alert Rules:** prometheus-alert-rules.yaml

---

**Last Updated:** 2025-12-11
**Version:** 1.0.0
**Status:** Production Ready
