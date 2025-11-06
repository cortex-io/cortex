# Project Manager Dashboard Integration

Version: 1.0
Date: 2025-11-06
Status: Design Specification

---

## Overview

This document specifies how the Project Manager (PM) system integrates with the commit-relay dashboard to provide real-time visibility into worker health, progress, and interventions.

---

## 1. Data Sources

### 1.1 PM State File

**Location**: `coordination/pm-state.json`
**Update Frequency**: Every 2-3 minutes (PM loop interval)
**Format**: JSON

**Key Data**:
```json
{
  "pm_daemon": {
    "pm_id": "pm-001",
    "started_at": "2025-11-06T10:00:00Z",
    "last_loop": "2025-11-06T12:00:00Z",
    "loops_completed": 240
  },
  "monitored_workers": {
    "dev-worker-ABC123": {
      "health_state": "healthy",
      "progress_pct": 45,
      "last_checkin": "2025-11-06T11:55:00Z",
      "current_step": "Implementing feature"
    }
  },
  "metrics": {
    "total_workers_monitored": 16,
    "workers_by_state": {
      "healthy": 12,
      "late": 2,
      "stalled": 2
    },
    "success_rate_today": 72.7
  }
}
```

### 1.2 PM Activity Log

**Location**: `coordination/pm-activity.jsonl`
**Update Frequency**: Real-time (append-only)
**Format**: JSON Lines (one JSON object per line)

**Key Events**:
- `worker_registered` - New worker detected
- `checkin_received` - Worker checked in
- `missed_checkin` - Worker late (15+ min)
- `worker_stalled` - Worker stalled (20+ min)
- `timeout_warning` - Worker approaching time limit
- `worker_completed` - Worker finished successfully
- `worker_failed` - Worker failed
- `intervention_*` - PM took action

**Example Event**:
```jsonl
{"timestamp":"2025-11-06T12:00:00Z","pm_id":"pm-001","event":"checkin_received","worker_id":"dev-worker-ABC123","data":{"status":"in_progress","progress":45}}
```

### 1.3 Worker Specs with PM Data

**Location**: `coordination/worker-specs/active/{worker-id}.json`
**Enhancement**: No changes needed (PM reads these)

Dashboard can cross-reference worker specs with PM state to show:
- Worker progress from PM vs worker start time
- Time remaining until timeout
- Last check-in timestamp

---

## 2. Dashboard Components

### 2.1 PM Status Panel

**Location**: Main dashboard, top section
**Update Frequency**: Every 10 seconds

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Project Manager Status                        Last update: 2m ago │
├─────────────────────────────────────────────────────────────┤
│ Workers Monitored: 16                                       │
│ Success Rate (24h): 72.7% ↗                                 │
│                                                             │
│ Health Distribution:                                        │
│   ● Healthy: 12  ◐ Late: 2  ◯ Stalled: 2                   │
│                                                             │
│ Interventions Today: 5                                      │
│   - Warnings: 2                                             │
│   - Escalations: 2                                          │
│   - Kills: 1                                                │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
function renderPMStatus() {
    fetch('/api/pm-state')
        .then(res => res.json())
        .then(state => {
            document.getElementById('pm-workers-monitored').textContent =
                state.metrics.total_workers_monitored;

            document.getElementById('pm-success-rate').textContent =
                state.metrics.success_rate_today.toFixed(1) + '%';

            document.getElementById('pm-healthy').textContent =
                state.metrics.workers_by_state.healthy;

            document.getElementById('pm-late').textContent =
                state.metrics.workers_by_state.late;

            document.getElementById('pm-stalled').textContent =
                state.metrics.workers_by_state.stalled;

            // Color code success rate
            const rateEl = document.getElementById('pm-success-rate');
            if (state.metrics.success_rate_today >= 75) {
                rateEl.className = 'success';
            } else if (state.metrics.success_rate_today >= 50) {
                rateEl.className = 'warning';
            } else {
                rateEl.className = 'danger';
            }
        });
}

setInterval(renderPMStatus, 10000); // Update every 10 seconds
```

---

### 2.2 Enhanced Worker Status Table

**Location**: Worker pool section
**Update Frequency**: Every 10 seconds

**Enhanced Columns**:

| Worker ID | Type | Task | Progress | Health | Last Check-In | Status | Actions |
|-----------|------|------|----------|--------|---------------|--------|---------|
| dev-worker-ABC123 | feature-implementer | task-456 | 45% ● | 🟢 Healthy | 2m ago | Running | Kill |
| dev-worker-XYZ789 | test-runner | task-789 | 30% ◐ | 🟡 Late | 18m ago | Running | Kill |
| sec-worker-AAA111 | scan-worker | task-111 | 15% ◯ | 🔴 Stalled | 25m ago | Running | Kill |

**New Fields**:
1. **Progress**: Visual progress bar with percentage
2. **Health**: Color-coded health indicator
3. **Last Check-In**: Relative time since last check-in

**Implementation**:
```javascript
function renderWorkerRow(worker, pmData) {
    const pmWorker = pmData?.monitored_workers?.[worker.worker_id];

    const progress = pmWorker?.progress_pct || 0;
    const healthState = pmWorker?.health_state || 'unknown';
    const lastCheckin = pmWorker?.last_checkin;

    // Health badge
    const healthBadge = {
        'healthy': '<span class="badge badge-success">🟢 Healthy</span>',
        'late': '<span class="badge badge-warning">🟡 Late</span>',
        'stalled': '<span class="badge badge-danger">🔴 Stalled</span>',
        'unknown': '<span class="badge badge-secondary">⚪ Unknown</span>'
    }[healthState];

    // Progress bar
    const progressBar = `
        <div class="progress">
            <div class="progress-bar" style="width: ${progress}%">${progress}%</div>
        </div>
    `;

    // Last check-in (relative time)
    const checkinTime = lastCheckin
        ? timeAgo(new Date(lastCheckin))
        : 'Never';

    return `
        <tr class="worker-row ${healthState}">
            <td>${worker.worker_id}</td>
            <td>${worker.worker_type}</td>
            <td>${worker.task_id}</td>
            <td>${progressBar}</td>
            <td>${healthBadge}</td>
            <td>${checkinTime}</td>
            <td>${worker.status}</td>
            <td><button onclick="killWorker('${worker.worker_id}')">Kill</button></td>
        </tr>
    `;
}

// Helper: Convert timestamp to relative time
function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}
```

---

### 2.3 PM Activity Feed

**Location**: Bottom section or sidebar
**Update Frequency**: Real-time (WebSocket or polling every 5 seconds)
**Display**: Last 20 events, auto-scroll on new events

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ PM Activity Feed                              [Clear] [Pause] │
├─────────────────────────────────────────────────────────────┤
│ 🟢 12:05:30  dev-worker-ABC123  Check-in received (45%)     │
│ 🟡 12:03:15  dev-worker-XYZ789  Missed check-in (18 min)    │
│ 🔴 12:01:00  sec-worker-AAA111  Worker stalled (25 min)     │
│ ⚡ 12:00:45  sec-worker-AAA111  Escalated to security-master│
│ 🟢 11:58:20  dev-worker-BBB222  Worker completed             │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

**Event Icons**:
- 🟢 Green: Positive events (check-in, completion)
- 🟡 Yellow: Warning events (late, timeout warning)
- 🔴 Red: Error events (stalled, failed)
- ⚡ Purple: Action events (intervention, escalation)
- ⚪ Gray: Info events (registered, loop completed)

**Implementation**:
```javascript
let lastProcessedEvent = 0;

function pollPMActivity() {
    fetch(`/api/pm-activity?since=${lastProcessedEvent}`)
        .then(res => res.json())
        .then(events => {
            events.forEach(event => {
                addActivityEvent(event);
                lastProcessedEvent = Math.max(lastProcessedEvent, event.id || 0);
            });
        });
}

function addActivityEvent(event) {
    const icon = getEventIcon(event.event);
    const color = getEventColor(event.event);
    const message = formatEventMessage(event);

    const eventHtml = `
        <div class="pm-event ${color}">
            <span class="icon">${icon}</span>
            <span class="time">${formatTime(event.timestamp)}</span>
            <span class="worker">${event.worker_id || 'PM'}</span>
            <span class="message">${message}</span>
        </div>
    `;

    const feed = document.getElementById('pm-activity-feed');
    feed.insertAdjacentHTML('afterbegin', eventHtml);

    // Keep only last 20 events
    while (feed.children.length > 20) {
        feed.removeChild(feed.lastChild);
    }
}

function getEventIcon(eventType) {
    const icons = {
        'checkin_received': '🟢',
        'missed_checkin': '🟡',
        'worker_stalled': '🔴',
        'worker_completed': '🟢',
        'worker_failed': '🔴',
        'timeout_warning': '🟡',
        'intervention_warning_sent': '⚡',
        'intervention_escalated_to_master': '⚡',
        'intervention_worker_killed': '🔴',
        'worker_registered': '⚪',
        'pm_loop_completed': '⚪'
    };
    return icons[eventType] || '⚪';
}

function formatEventMessage(event) {
    const templates = {
        'checkin_received': `Check-in received (${event.data.progress}%)`,
        'missed_checkin': `Missed check-in (${event.data.minutes_since_checkin} min)`,
        'worker_stalled': `Worker stalled (${event.data.minutes_since_checkin} min)`,
        'worker_completed': 'Worker completed',
        'worker_failed': `Worker failed: ${event.data.reason || 'unknown'}`,
        'timeout_warning': `Timeout warning: ${event.data.level} (${event.data.time_used_pct}%)`,
        'intervention_escalated_to_master': `Escalated to ${event.data.master}`
    };
    return templates[event.event] || event.event;
}

// Start polling every 5 seconds
setInterval(pollPMActivity, 5000);
```

---

### 2.4 Worker Detail Modal (Enhanced)

**Trigger**: Click worker row
**Content**: Show detailed PM data for worker

**Additional PM Data**:
```
┌─────────────────────────────────────────────────────────────┐
│ Worker: dev-worker-ABC123                          [Close X] │
├─────────────────────────────────────────────────────────────┤
│ Progress: 45% ██████████░░░░░░░░░░                         │
│ Health: 🟢 Healthy                                           │
│ Last Check-In: 2 minutes ago                                │
│                                                             │
│ Current Step: Implementing authentication logic             │
│ Next Step: Writing unit tests                               │
│ Time Remaining: ~20 minutes                                 │
│                                                             │
│ Check-In History (last 10):                                 │
│   12:05 - 45% - Implementing auth                           │
│   12:00 - 40% - Planning tests                              │
│   11:55 - 30% - Implementation                              │
│   ...                                                        │
│                                                             │
│ Warnings: None                                              │
│ Interventions: None                                         │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
function showWorkerDetail(workerId) {
    Promise.all([
        fetch(`/api/worker-specs/${workerId}`).then(r => r.json()),
        fetch('/api/pm-state').then(r => r.json()),
        fetch(`/api/pm-activity?worker=${workerId}`).then(r => r.json())
    ]).then(([workerSpec, pmState, pmActivity]) => {
        const pmWorker = pmState.monitored_workers[workerId];

        const modal = document.getElementById('worker-detail-modal');
        modal.innerHTML = `
            <h3>Worker: ${workerId}</h3>
            <div class="progress-section">
                <label>Progress:</label>
                <div class="progress-bar" style="width: ${pmWorker.progress_pct}%">
                    ${pmWorker.progress_pct}%
                </div>
            </div>
            <div class="health-section">
                <label>Health:</label>
                ${getHealthBadge(pmWorker.health_state)}
            </div>
            <div class="checkin-section">
                <label>Last Check-In:</label>
                ${timeAgo(new Date(pmWorker.last_checkin))}
            </div>
            <div class="activity-section">
                <h4>Recent Activity</h4>
                <ul>
                    ${pmActivity.map(e => `
                        <li>${formatTime(e.timestamp)} - ${formatEventMessage(e)}</li>
                    `).join('')}
                </ul>
            </div>
        `;

        modal.style.display = 'block';
    });
}
```

---

## 3. API Endpoints (Optional)

If dashboard server wants to provide REST API instead of direct file reads:

### 3.1 GET /api/pm-state

**Response**:
```json
{
  "pm_daemon": {...},
  "monitored_workers": {...},
  "metrics": {...}
}
```

**Implementation** (Node.js):
```javascript
app.get('/api/pm-state', (req, res) => {
    const pmState = JSON.parse(
        fs.readFileSync('coordination/pm-state.json', 'utf8')
    );
    res.json(pmState);
});
```

### 3.2 GET /api/pm-activity

**Query Params**:
- `since`: Unix timestamp (return events after this time)
- `worker`: Worker ID (filter by worker)
- `limit`: Max events to return (default 100)

**Response**:
```json
[
  {"timestamp": "...", "event": "...", "worker_id": "...", "data": {}},
  ...
]
```

**Implementation**:
```javascript
app.get('/api/pm-activity', (req, res) => {
    const lines = fs.readFileSync('coordination/pm-activity.jsonl', 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

    let filtered = lines;

    if (req.query.since) {
        const since = new Date(parseInt(req.query.since) * 1000);
        filtered = filtered.filter(e => new Date(e.timestamp) > since);
    }

    if (req.query.worker) {
        filtered = filtered.filter(e => e.worker_id === req.query.worker);
    }

    const limit = parseInt(req.query.limit) || 100;
    res.json(filtered.slice(-limit));
});
```

---

## 4. Visual Design

### 4.1 Color Scheme

**Health States**:
- 🟢 Healthy: `#28a745` (green)
- 🟡 Late: `#ffc107` (yellow)
- 🔴 Stalled: `#dc3545` (red)
- ⚪ Unknown: `#6c757d` (gray)

**Success Rate**:
- ≥ 75%: Green
- 50-74%: Yellow
- < 50%: Red

**Events**:
- Positive: Green
- Warning: Yellow
- Error: Red
- Action: Purple (`#6f42c1`)
- Info: Gray

### 4.2 CSS Classes

```css
/* PM Status Panel */
.pm-status-panel {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 20px;
    background: #f8f9fa;
}

.pm-metric {
    display: inline-block;
    margin-right: 30px;
}

.pm-metric-value {
    font-size: 24px;
    font-weight: bold;
}

.pm-metric-label {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
}

/* Health Badges */
.badge-health-healthy {
    background: #28a745;
    color: white;
}

.badge-health-late {
    background: #ffc107;
    color: black;
}

.badge-health-stalled {
    background: #dc3545;
    color: white;
}

/* Progress Bars */
.worker-progress {
    width: 100px;
    height: 20px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
}

.worker-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #20c997);
    transition: width 0.3s ease;
}

/* PM Activity Feed */
.pm-activity-feed {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    background: white;
}

.pm-event {
    padding: 8px;
    margin-bottom: 4px;
    border-left: 3px solid transparent;
    display: flex;
    gap: 8px;
    align-items: center;
}

.pm-event.success { border-left-color: #28a745; }
.pm-event.warning { border-left-color: #ffc107; }
.pm-event.danger { border-left-color: #dc3545; }
.pm-event.action { border-left-color: #6f42c1; }

.pm-event .time {
    font-size: 11px;
    color: #666;
    width: 60px;
}

.pm-event .worker {
    font-family: monospace;
    font-size: 12px;
    width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pm-event .message {
    flex: 1;
    font-size: 13px;
}
```

---

## 5. Implementation Timeline

### Day 13 Morning: PM Status Panel (3 hours)

1. Read pm-state.json in dashboard server
2. Create PM status component
3. Display metrics (workers monitored, success rate, health distribution)
4. Update every 10 seconds
5. Test with live PM daemon

### Day 13 Afternoon: Enhanced Worker Table (4 hours)

1. Cross-reference worker specs with PM state
2. Add progress column with visual bars
3. Add health column with color-coded badges
4. Add last check-in column with relative time
5. Update worker row styling based on health state
6. Test with multiple workers

### Day 14 Morning: PM Activity Feed (3 hours)

1. Parse pm-activity.jsonl in dashboard server
2. Create activity feed component
3. Display last 20 events with icons and colors
4. Auto-refresh every 5 seconds
5. Add pause/clear controls
6. Test with live PM events

### Day 14 Afternoon: Polish & Testing (3 hours)

1. Worker detail modal enhancements
2. CSS styling and animations
3. Responsive layout adjustments
4. Cross-browser testing
5. Performance optimization
6. Documentation

---

## 6. Testing Checklist

- [ ] PM status panel displays correct metrics
- [ ] Success rate color-coded correctly (green/yellow/red)
- [ ] Worker health badges show correct states
- [ ] Progress bars update in real-time
- [ ] Last check-in shows relative time ("2m ago")
- [ ] Activity feed shows recent events
- [ ] Event icons and colors correct
- [ ] Activity feed auto-scrolls on new events
- [ ] Worker detail modal shows PM data
- [ ] Dashboard performance acceptable (< 100ms refresh)
- [ ] No errors in browser console
- [ ] Works in Chrome, Firefox, Safari

---

## 7. Future Enhancements

### Phase 4 (Optional)

1. **PM Health Indicator**: Show if PM daemon is running/stopped
2. **Historical Charts**: Worker success rate over time (24h, 7d, 30d)
3. **Intervention Analytics**: Most common intervention types
4. **Worker Performance**: Average completion time by worker type
5. **Real-time WebSocket**: Push updates instead of polling
6. **PM Control Panel**: Start/stop PM daemon from dashboard
7. **Manual Interventions**: Send warnings, kill workers from UI
8. **Alert Rules**: Configure custom alert thresholds

---

**Document Status**: Design Complete, Ready for Implementation
**Implementation Owner**: Dashboard team (Day 13-14)
**Dependencies**: PM daemon running, pm-state.json and pm-activity.jsonl being generated
