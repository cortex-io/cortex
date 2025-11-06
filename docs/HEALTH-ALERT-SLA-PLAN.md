# Health Alert SLA System - Planning Document

**Created:** 2025-11-06
**Status:** Phase 1 (Simple) Implemented, Phase 2-3 Planned
**Purpose:** Automated health alert remediation with SLA tracking and escalation

---

## Overview

This document outlines the design for an SLA-aware health alert remediation system that automatically investigates and attempts to fix system health issues, with proper time limits and escalation paths.

---

## Current Implementation (Phase 1 - Simple)

### Components Built

1. **Basic Health Alert Structure** (`coordination/health-alerts.json`)
   - Alert types: low_success_rate, high_failure_rate, high_error_rate, high_active_workers
   - Status states: active, investigating, resolved, needs_review, escalated
   - SLA time limits per priority level

2. **Simple Incident Reporting** (`coordination/health-incidents/`)
   - Log file for unresolved alerts
   - Basic investigation notes
   - Timestamp and worker tracking

3. **Manual SLA Monitoring**
   - Workers have time_limit_minutes in their specs
   - System relies on worker daemon to enforce timeouts

### Current Workflow

```
Health Alert Detected
    ↓
Dashboard shows alert
    ↓
User manually triggers remediation OR automated spawn
    ↓
Worker investigates (60 min limit)
    ↓
Outcome:
  • Resolved → Alert cleared
  • Timeout → Incident logged, alert marked needs_review
```

### Limitations

- No automated monitoring daemon
- No automatic worker spawning
- Manual SLA enforcement
- Basic incident reporting
- No automatic escalation

---

## Future Enhancements (Phase 2)

### Automated Health Alert Monitor Daemon

**File:** `scripts/health-alert-monitor.sh`

**Features:**
- Continuously monitors `health-alerts.json`
- Auto-spawns workers for new alerts
- Tracks worker start times
- Enforces SLA timeouts
- Updates alert status automatically

**Pseudocode:**
```bash
while true; do
    # Check for new active alerts
    for alert in health-alerts.json; do
        if alert.status == "active" && !has_worker; then
            spawn_remediation_worker(alert)
            alert.status = "investigating"
        fi

        if alert.status == "investigating"; then
            check_sla_timeout(alert)
            if exceeded; then
                log_incident(alert)
                alert.status = "needs_review"
            fi
        fi
    done

    sleep 60
done
```

### Enhanced SLA Configuration

**File:** `coordination/health-alert-sla-config.json`

```json
{
    "sla_times": {
        "critical": 15,
        "high": 30,
        "medium": 60,
        "low": 120
    },
    "escalation_rules": {
        "auto_escalate_after": 2,
        "notify_on": ["escalated", "repeated_failure"],
        "max_retry_attempts": 3
    }
}
```

### SLA Tracker Module

**File:** `scripts/modules/sla-tracker.sh`

**Functions:**
- `track_worker_time(worker_id, alert_id)`
- `check_sla_status(alert_id)`
- `enforce_timeout(worker_id)`
- `calculate_time_remaining(alert_id)`

### Incident Report Structure

**File:** `coordination/health-incidents/YYYY-MM-DD-alert-{id}.json`

```json
{
    "incident_id": "inc-2025-11-06-001",
    "alert_id": "alert-789",
    "alert_type": "low_success_rate",
    "severity": "high",
    "worker_id": "dev-worker-ABC",
    "outcome": "sla_exceeded",
    "time_spent_minutes": 60,
    "investigation_summary": "Worker analyzed success rate patterns...",
    "findings": [
        "Identified failing workers: worker-X, worker-Y",
        "Common error: timeout in API calls",
        "Possible causes: network issues, rate limiting"
    ],
    "actions_taken": [
        "Reviewed worker logs",
        "Checked API endpoint health",
        "Analyzed error patterns"
    ],
    "blockers": [
        "Requires API rate limit increase",
        "Need access to external service logs",
        "Architecture change needed for retry logic"
    ],
    "recommendations": [
        "Implement exponential backoff",
        "Add circuit breaker pattern",
        "Increase timeout thresholds"
    ],
    "requires_human_review": true,
    "escalated_at": "2025-11-06T11:00:00Z",
    "created_at": "2025-11-06T10:00:00Z"
}
```

---

## Future Enhancements (Phase 3)

### Alert State Machine

```
┌─────────┐
│ active  │ ← New alert detected
└────┬────┘
     ↓ Worker spawned
┌──────────────┐
│investigating │ ← Worker analyzing
└──────┬───────┘
       ↓
   ┌───┴────┐
   │        │
   ↓        ↓
┌─────────┐  ┌──────────────┐
│resolved │  │needs_review  │ ← SLA exceeded
└─────────┘  └──────┬───────┘
                    ↓ Retry or manual
             ┌───────────┐
             │escalated  │ ← Failed after retries
             └───────────┘
```

### Dashboard Integration

**New UI Components:**

1. **SLA Countdown Timers**
   ```html
   <div class="alert-card">
       <span class="sla-timer" :class="{
           'text-green-600': timeRemaining > 50%,
           'text-yellow-600': timeRemaining > 25%,
           'text-red-600': timeRemaining <= 25%
       }">
           <i data-lucide="clock"></i>
           {{minutesLeft}}m remaining
       </span>
   </div>
   ```

2. **Needs Review Section**
   ```html
   <div x-show="healthAlerts.filter(a => a.status === 'needs_review').length > 0">
       <h3>Alerts Requiring Manual Review</h3>
       <!-- List of escalated alerts with incident reports -->
   </div>
   ```

3. **Incident Report Viewer**
   - View full investigation details
   - See recommendations
   - Link to related logs/workers
   - Quick actions: Retry, Dismiss, Escalate

### Notification System

**File:** `scripts/modules/alert-notifier.sh`

**Features:**
- Send notifications on escalation
- Webhook integration
- Slack/Discord/Email options
- Configurable notification rules

### Analytics & Reporting

**File:** `coordination/health-alert-analytics.json`

**Metrics:**
- Alert resolution rates
- Average time to resolve
- Most common alert types
- Worker success rates by alert type
- SLA compliance percentage

---

## Implementation Prompts

### For You (User)

#### Prompt 1: Review Health Alert Configuration
```
Review the health alert SLA configuration and adjust time limits based on actual system needs:
- coordination/health-alerts.json
- Are 15/30/60/120 minute SLAs appropriate?
- Should certain alert types have different SLAs?
- What priority levels make sense for your workflow?
```

#### Prompt 2: Define Escalation Strategy
```
Define what should happen when alerts can't be auto-resolved:
- Who should be notified?
- What channels (email, Slack, webhook)?
- Should system auto-retry failed fixes?
- How many retry attempts before human escalation?
```

#### Prompt 3: Incident Report Format
```
Review the incident report structure:
- coordination/health-incidents/
- Is the current format useful?
- What additional fields needed?
- How should these be reviewed/triaged?
```

### For Me (AI Assistant)

#### Prompt 1: Build Health Alert Monitor Daemon
```
Implement the automated health alert monitoring daemon:
- Create scripts/health-alert-monitor.sh
- Auto-spawn workers for new alerts
- Track SLA timers
- Enforce timeouts
- Update alert statuses
- Log incidents for exceeded SLAs
```

#### Prompt 2: Enhanced Incident Reporting
```
Enhance the incident reporting system:
- Structured JSON format
- Auto-generate investigation summaries
- Extract worker findings/recommendations
- Link to related logs and data
- Create searchable incident database
```

#### Prompt 3: Dashboard SLA Integration
```
Add SLA tracking to dashboard:
- Show countdown timers on alert cards
- Color-code based on time remaining
- Add "Needs Review" section
- Create incident report viewer
- Show alert resolution analytics
```

---

## Technical Considerations

### Performance

- Health monitor daemon: Run every 60 seconds (not too aggressive)
- SLA checks: Only for investigating alerts (reduce overhead)
- Incident logging: Async writes (don't block monitoring)

### Scalability

- Support multiple concurrent alert investigations
- Worker pool limits prevent resource exhaustion
- Queue alerts if too many active at once

### Reliability

- Health monitor daemon should be managed by systemd/launchd
- Automatic restart on failure
- Graceful handling of missing files
- Idempotent operations (safe to re-run)

### Security

- Incident reports may contain sensitive data
- Restrict access to health-incidents directory
- Don't log credentials or secrets
- Sanitize error messages

---

## Configuration Files

### Current Files
```
coordination/
├── health-alerts.json              # Active alerts (simple format)
└── health-incidents/               # Incident logs (simple text)
    └── YYYY-MM-DD.log
```

### Future Structure
```
coordination/
├── health-alerts.json              # Active alerts with SLA tracking
├── health-alert-sla-config.json   # SLA time limits and rules
├── health-incidents/               # Structured incident reports
│   ├── 2025-11-06-inc-001.json
│   ├── 2025-11-06-inc-002.json
│   └── index.json                  # Incident metadata
└── health-analytics.json           # Alert resolution metrics
```

---

## Testing Strategy

### Manual Testing
1. Create test alert with short SLA (5 min)
2. Spawn worker to investigate
3. Wait for SLA timeout
4. Verify incident logged
5. Check alert status updated to needs_review

### Automated Testing
```bash
# Test script: scripts/test-health-alert-sla.sh
TEST_DURATION=5 ./scripts/health-alert-monitor.sh &
./scripts/create-test-alert.sh --type low_success_rate --priority high
sleep 360  # Wait for SLA to exceed
check_incident_created()
check_alert_status_updated()
```

### Integration Testing
- Verify dashboard displays SLA timers
- Test alert dismissal workflow
- Verify incident reports accessible
- Test worker spawn/timeout cycle

---

## Migration Path

### Phase 1 → Phase 2
1. Create health-alert-sla-config.json
2. Implement health-alert-monitor.sh daemon
3. Add SLA tracking to alert structure
4. Enhance incident report format
5. No breaking changes to existing alerts

### Phase 2 → Phase 3
1. Add dashboard SLA components
2. Implement notification system
3. Build analytics module
4. Migrate existing incidents to new format
5. Backward compatible with Phase 2

---

## Success Metrics

### Phase 1 (Current)
- ✅ Alerts logged and visible
- ✅ Workers can be spawned for alerts
- ✅ Basic incident logging exists

### Phase 2 (Automated)
- [ ] 95% of alerts auto-investigated within SLA
- [ ] All exceeded SLAs logged as incidents
- [ ] Zero manual intervention for alert spawning

### Phase 3 (Full Featured)
- [ ] Real-time SLA tracking in dashboard
- [ ] Incident reports automatically generated
- [ ] Alert resolution rate > 70%
- [ ] Average time to resolution < 30 minutes

---

## Questions to Answer

1. **Alert Detection**: How are health alerts initially detected?
   - Manual creation?
   - Automatic threshold monitoring?
   - Scheduled health checks?

2. **Worker Selection**: Which worker type should handle which alert type?
   - Development worker for code issues?
   - Security worker for security alerts?
   - Specialized health-worker type?

3. **Retry Logic**: Should failed remediations be automatically retried?
   - How many attempts?
   - With what delay?
   - Same worker or new worker?

4. **Notification Preferences**: Who/what should be notified on escalation?
   - Just log to file?
   - Send webhook?
   - Create task for human review?

5. **Alert Lifecycle**: How long should resolved/escalated alerts be kept?
   - Auto-archive after X days?
   - Keep indefinitely?
   - Move to separate archive?

---

## Resources & References

### Related Systems
- Worker daemon: `scripts/worker-daemon.sh`
- Task queue: `coordination/task-queue.json`
- Master agents: `coordination/masters/*/`

### Similar Patterns
- Task SLA tracking (could be adapted)
- Worker timeout enforcement (already exists)
- Event logging (dashboard-events.jsonl)

### External References
- SLA best practices: https://sre.google/sre-book/service-level-objectives/
- Incident management: https://www.pagerduty.com/resources/learn/incident-response-process/

---

## Next Steps

### Immediate (Do Today)
1. ✅ Create this planning document
2. ✅ Implement simple health-alerts.json structure
3. ✅ Create basic incident logging
4. [ ] Test manual alert → worker → incident flow

### Short Term (This Week)
1. [ ] Implement health-alert-monitor daemon
2. [ ] Add SLA configuration file
3. [ ] Enhance incident report structure
4. [ ] Add basic dashboard integration

### Long Term (This Month)
1. [ ] Full dashboard SLA tracking UI
2. [ ] Notification system
3. [ ] Analytics and reporting
4. [ ] Automated testing suite

---

## Appendix: Code Snippets

### Alert Creation Helper
```bash
# scripts/create-health-alert.sh
#!/bin/bash
ALERT_ID="alert-$(date +%s)"
ALERT_TYPE="${1:-low_success_rate}"
SEVERITY="${2:-high}"

jq --arg id "$ALERT_ID" \
   --arg type "$ALERT_TYPE" \
   --arg sev "$SEVERITY" \
   '.alerts += [{
       id: $id,
       type: $type,
       severity: $sev,
       status: "active",
       created_at: (now | todate)
   }]' coordination/health-alerts.json > /tmp/alerts.json

mv /tmp/alerts.json coordination/health-alerts.json
echo "Created alert: $ALERT_ID"
```

### Simple SLA Check
```bash
# Check if worker exceeded SLA
check_sla() {
    local worker_id=$1
    local started=$(jq -r ".execution.started_at" "coordination/worker-specs/active/${worker_id}.json")
    local limit=$(jq -r ".resources.time_limit_minutes" "coordination/worker-specs/active/${worker_id}.json")

    local started_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$started" +%s)
    local now_ts=$(date +%s)
    local elapsed=$(( (now_ts - started_ts) / 60 ))

    if [ $elapsed -gt $limit ]; then
        echo "SLA exceeded: ${elapsed}m / ${limit}m"
        return 1
    fi
    return 0
}
```

---

**END OF PLANNING DOCUMENT**
