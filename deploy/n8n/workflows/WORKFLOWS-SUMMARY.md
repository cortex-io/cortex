# Cortex Alert Workflows - Quick Reference

## Files Created

1. **alertmanager-webhook-receiver.json** (13 KB)
   - Entry point for all Alertmanager webhooks
   - Parses and routes alerts by severity
   - Triggers downstream workflows

2. **alert-notification-router.json** (18 KB)
   - Multi-channel notification delivery
   - Critical: Slack + Email + Audit
   - Warning: Slack + Audit
   - Info: Audit only

3. **auto-remediation-workflows.json** (18 KB)
   - Automated incident response
   - Pod restart, HPA scaling, worker management
   - Dry-run mode and approval gates

4. **incident-tracker.json** (20 KB)
   - Incident lifecycle management
   - MTTR calculation
   - Weekly summary reports

5. **ALERT-WORKFLOWS-GUIDE.md** (Documentation)

## Webhook Endpoints

| Workflow | URL Path | Method | Purpose |
|----------|----------|--------|---------|
| Webhook Receiver | `/webhook/alertmanager` | POST | Receive Alertmanager alerts |
| Notification Router | `/webhook/alert-notification-router` | POST | Process routed alerts |
| Auto-Remediation | `/webhook/auto-remediation` | POST | Execute remediation actions |
| Incident Tracker | `/webhook/incident-tracker` | POST | Track incident lifecycle |

## Alert Flow

```
Alertmanager
    ↓
alertmanager-webhook-receiver.json
    ├→ alert-notification-router.json (Slack/Email)
    ├→ auto-remediation-workflows.json (kubectl actions)
    └→ incident-tracker.json (MTTR tracking)
```

## Configuration Checklist

- [ ] Import all 4 workflow JSON files to N8N
- [ ] Set `SLACK_WEBHOOK_URL` environment variable
- [ ] Set `ALERT_FROM_EMAIL` and `ALERT_TO_EMAIL`
- [ ] Configure SMTP credentials in N8N
- [ ] Configure SSH/kubectl access for auto-remediation
- [ ] Set `AUTO_REMEDIATION_DRY_RUN=true` for testing
- [ ] Verify Alertmanager webhook URL points to N8N
- [ ] Activate all workflows in N8N
- [ ] Test with sample alert payload

## Quick Test

```bash
# Test complete flow
curl -X POST http://n8n.cortex.svc.cluster.local:5678/webhook/alertmanager \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {"alertname": "CortexHighMemoryUsage", "severity": "critical", "cluster": "cortex-talos"},
      "annotations": {"summary": "Memory usage high"},
      "status": "firing",
      "startsAt": "2025-12-12T00:00:00Z",
      "fingerprint": "test123"
    }]
  }'
```

## Key Features

### Safety
- Dry-run mode for testing
- Approval gates for destructive actions
- Per-alert enable/disable controls
- Complete audit logging

### Auto-Remediation
- **CortexPodCrashLooping** → Delete pod
- **CortexHighMemoryUsage** → Create HPA
- **CortexTokenBudgetLow** → Pause workers

### Incident Management
- Automatic incident creation
- MTTR calculation
- Alert aggregation
- Weekly summary reports (Monday 9 AM)

### Notifications
- Rich Slack formatting
- Email alerts for critical
- Audit trail for all severities

## Total Lines of Code

~5,100 lines of N8N workflow JSON across all files

## Next Steps

1. Import workflows to N8N
2. Configure credentials and environment variables
3. Test with dry-run mode enabled
4. Review and customize notification formatting
5. Set up storage backend (PostgreSQL/files/external)
6. Deploy to production cluster
7. Monitor execution logs

## Support Files

- **ALERT-WORKFLOWS-GUIDE.md** - Complete documentation
- **prometheus-values.yaml** - Alertmanager configuration reference
- **alertmanager-n8n-config.yaml** - N8N integration config

---
Created: 2025-12-12
Version: 1.0
