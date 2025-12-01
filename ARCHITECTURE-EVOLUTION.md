# Cortex Architecture Evolution Plan

**Date:** 2025-12-01
**Status:** Planning
**Goal:** Move from daemon-based to event-driven architecture with AI-powered observability

---

## Table of Contents

- [Current State](#current-state)
- [Vision](#vision)
- [Why This Change](#why-this-change)
- [Implementation Plan](#implementation-plan)
- [Technology Stack](#technology-stack)
- [Migration Strategy](#migration-strategy)
- [Timeline](#timeline)
- [Next Steps](#next-steps)

---

## Current State

### Daemon-Based Architecture

**Running Daemons:**
- `auto-learning-daemon.sh` (PID 25614, started Nov 28)
- `moe-learning-daemon.sh` (PID 16932, started Nov 22)
- `handoff-processor-daemon.sh` (PID 26052, started Nov 20)

**Available Daemon Scripts (18 total):**
```
scripts/daemons/
├── auto-fix-daemon.sh
├── auto-learning-daemon.sh
├── cleanup-daemon.sh
├── failure-pattern-daemon.sh
├── freshness-daemon.sh
├── heartbeat-monitor-daemon.sh
├── ingestion-daemon.sh
├── moe-learning-daemon.sh
├── observability-hub-daemon.sh
├── worker-restart-daemon.sh
├── workflow-daemon.sh
└── ...
```

**Problems with Current Approach:**
1. **Resource Inefficiency:** Daemons poll continuously (CPU/memory waste)
2. **State Management:** Complex daemon lifecycle management
3. **Debugging Difficulty:** Hard to trace issues across multiple long-running processes
4. **Scalability Issues:** Each daemon is a separate process, limited by system resources
5. **Recovery Complexity:** Daemon crashes require manual intervention or cron restart
6. **Observability Gaps:** Separate dashboard infrastructure needed (Grafana, Dependency-Track)

### Current Event Infrastructure (Good Foundation)

**Already Event-Based:**
- JSONL event logs (dashboard-events.jsonl, routing-decisions.jsonl)
- Worker lifecycle events (worker-pool.json updates)
- Task completion hooks
- Lineage tracking (medallion architecture)
- Governance event logs (access-log.jsonl)

**Key Insight:** We're already capturing events - just not using them efficiently!

---

## Vision

### Event-Driven Architecture

**Core Principle:** React to events instead of polling for changes

```
┌─────────────────────────────────────────────────────────────┐
│                     Event Producer                          │
│  (Worker completes, scan finishes, error occurs)            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  v
┌─────────────────────────────────────────────────────────────┐
│                  Event Dispatcher                           │
│  (Lightweight router - NOT a daemon)                        │
│  - Reads event from queue/file                              │
│  - Routes to appropriate handler                            │
│  - Exits when queue is empty                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├──> Write to JSONL log (persistence)
                  ├──> Trigger handler script (ephemeral)
                  └──> Update state (coordination/)

┌─────────────────────────────────────────────────────────────┐
│                   Event Handlers                            │
│  scripts/events/on-worker-complete.sh                       │
│  scripts/events/on-task-failure.sh                          │
│  scripts/events/on-security-alert.sh                        │
│  (Run once, then exit - no persistent processes)            │
└─────────────────────────────────────────────────────────────┘
```

### AI-Powered Observability (No Dashboards!)

**Principle:** Executable documentation > Static dashboards

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Logs (JSONL)                       │
│  coordination/events/worker-events.jsonl                    │
│  coordination/events/task-events.jsonl                      │
│  coordination/metrics/model-selection.jsonl                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  v
┌─────────────────────────────────────────────────────────────┐
│              Marimo Notebooks (Real-time)                   │
│  analysis/routing-optimization.py                           │
│  analysis/security-dashboard.py                             │
│  analysis/worker-performance.py                             │
│  - Reactive (auto-update when data changes)                 │
│  - Interactive queries                                      │
│  - AI-powered insights                                      │
│  - Run as web app or script                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│            Quarto Reports (Scheduled)                       │
│  reports/weekly-summary.qmd                                 │
│  reports/security-audit.qmd                                 │
│  - Auto-generated via GitHub Actions                        │
│  - Published to GitHub Pages                                │
│  - AI-generated insights and recommendations                │
│  - Emailable to stakeholders                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Change

### Event-Driven Benefits

| Aspect | Daemon-Based | Event-Driven |
|--------|-------------|--------------|
| **Resource Usage** | High (continuous polling) | Low (run on-demand) |
| **Latency** | Poll interval (seconds/minutes) | Immediate (milliseconds) |
| **Scalability** | Limited by process count | Horizontally scalable |
| **Debugging** | Complex (multiple processes) | Simple (trace event chain) |
| **Recovery** | Manual restart/cron | Automatic (re-process event) |
| **Cost** | Always running | Pay-per-event |

### AI Notebooks vs Traditional Dashboards

| Aspect | Traditional Dashboard | AI-Powered Notebooks |
|--------|----------------------|---------------------|
| **Flexibility** | Pre-configured widgets | Ask any question |
| **Insights** | Show metrics | Explain why and suggest fixes |
| **Cost** | $50-500/mo (Grafana Cloud, Datadog) | Free (Marimo, Quarto, GitHub Pages) |
| **Maintenance** | Separate infrastructure | Git-versioned code |
| **Collaboration** | Share links | Version control, code review |
| **AI Integration** | Manual analysis | Built-in Claude/GPT analysis |
| **Documentation** | Separate from code | Executable documentation |

---

## Implementation Plan

### Phase 1: Event Infrastructure (Week 1)

**Goal:** Build lightweight event system without breaking existing functionality

**Tasks:**
1. Create event schema and validation
2. Build event dispatcher (replaces daemon polling)
3. Implement event handlers for top 3 use cases:
   - Worker completion
   - Task failure
   - Security scan results
4. Set up event persistence (JSONL files)
5. Test event flow end-to-end

**Deliverables:**
```
scripts/events/
├── event-dispatcher.sh         # Main event router
├── event-schema.json          # Event structure definition
├── handlers/
│   ├── on-worker-complete.sh
│   ├── on-task-failure.sh
│   └── on-security-alert.sh
└── lib/
    ├── event-validator.sh
    └── event-logger.sh

coordination/events/
├── worker-events.jsonl
├── task-events.jsonl
└── security-events.jsonl
```

### Phase 2: Daemon Migration (Week 2)

**Goal:** Replace daemons with event handlers one-by-one

**Migration Order (by risk):**
1. ✅ **heartbeat-monitor** → worker-heartbeat events (low risk)
2. ✅ **cleanup-daemon** → task-completion events (low risk)
3. ✅ **failure-pattern-daemon** → task-failure events (medium risk)
4. ✅ **auto-fix-daemon** → failure-pattern events (medium risk)
5. ✅ **auto-learning-daemon** → worker-completion events (high risk - critical feature)
6. ✅ **moe-learning-daemon** → routing-decision events (high risk - core functionality)

**For each daemon:**
- [ ] Document current behavior
- [ ] Design event-driven replacement
- [ ] Implement event handler
- [ ] Test side-by-side with daemon
- [ ] Switch traffic to event handler
- [ ] Monitor for 24 hours
- [ ] Decommission daemon

### Phase 3: AI Notebooks Setup (Week 3)

**Goal:** Replace need for external dashboards with executable notebooks

**Tasks:**

#### 3A: Marimo (Real-time Analysis)
```bash
# Install
pip install marimo anthropic polars matplotlib

# Create notebooks
analysis/
├── routing-optimization.py    # MoE routing analysis
├── security-dashboard.py      # Security scan aggregation
├── worker-performance.py      # Token usage, latency, success rate
├── cost-tracking.py          # Daily/weekly cost trends
└── system-health.py          # Overall Cortex health
```

**Example Marimo Notebook:**
```python
import marimo as mo
import polars as pl
from anthropic import Anthropic

# Reactive data loading
routing_decisions = mo.state(
    pl.read_ndjson("coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl")
)

# AI analysis (auto-updates when data changes)
client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

@mo.cache
def analyze_routing():
    analysis = client.messages.create(
        model="claude-sonnet-4",
        messages=[{
            "role": "user",
            "content": f"""Analyze these routing decisions and identify:
            1. Patterns indicating suboptimal routing
            2. Masters with improving/declining confidence
            3. Recommendations for threshold tuning

            Data: {routing_decisions.value.to_dict()}"""
        }]
    )
    return analysis.content[0].text

insights = mo.ui.text_area(analyze_routing(), disabled=True)
mo.md(f"## 🤖 AI Insights\n\n{insights}")
```

#### 3B: Quarto (Scheduled Reports)
```bash
# Install
brew install quarto

# Create report templates
reports/
├── _quarto.yml               # Publishing config
├── weekly-summary.qmd        # Weekly Cortex health
├── security-audit.qmd        # Monthly security review
├── cost-report.qmd          # Token usage analysis
└── routing-performance.qmd   # MoE effectiveness
```

**Example Quarto Report:**
```yaml
---
title: "Cortex Weekly Summary"
format:
  html:
    code-fold: true
    toc: true
  pdf:
    toc: true
execute:
  echo: false
---

## Executive Summary

```{python}
import polars as pl
from anthropic import Anthropic

# Load week's events
events = pl.read_ndjson("coordination/events/task-events.jsonl").filter(
    pl.col("timestamp") > datetime.now() - timedelta(days=7)
)

# AI summary
client = Anthropic()
summary = client.messages.create(
    model="claude-sonnet-4",
    messages=[{
        "role": "user",
        "content": f"Summarize this week's Cortex activity in 3-5 bullet points: {events.to_dict()}"
    }]
)
```

{{< include _summary.md >}}

## Task Metrics

- Total tasks: `{python} len(events)`
- Success rate: `{python} events.filter(pl.col("status") == "completed").count() / len(events) * 100`%
- Avg completion time: `{python} events["duration"].mean()`s

## Top Issues

```{python}
failures = events.filter(pl.col("status") == "failed")
# AI analysis of failure patterns...
```
```

#### 3C: GitHub Actions Integration
```yaml
# .github/workflows/weekly-report.yml
name: Generate Weekly Report

on:
  schedule:
    - cron: '0 9 * * MON'  # Every Monday 9 AM
  workflow_dispatch:

jobs:
  generate-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Quarto
        uses: quarto-dev/quarto-actions/setup@v2

      - name: Render report
        run: quarto render reports/weekly-summary.qmd

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./reports/_site
```

### Phase 4: Optimization & Monitoring (Week 4)

**Tasks:**
- [ ] Tune event handler performance
- [ ] Add event replay capability (for debugging)
- [ ] Implement event archival (compress old JSONL)
- [ ] Create runbook for common scenarios
- [ ] Performance benchmarking (event-driven vs daemons)

---

## Technology Stack

### Event Infrastructure

**Option A: Filesystem-based (Simple)**
- **Event Queue:** JSONL files in `coordination/events/queue/`
- **Dispatcher:** `inotifywait` or `fswatch` triggers event-dispatcher.sh
- **Pros:** No external dependencies, git-friendly, simple
- **Cons:** Not suitable for high-frequency events (100+ per second)

**Option B: Redis Pub/Sub (Scalable)**
- **Event Queue:** Redis Streams or Pub/Sub
- **Dispatcher:** Redis consumer group
- **Pros:** High throughput, persistence, horizontal scaling
- **Cons:** Requires Redis server

**Option C: GitHub Webhooks (Cloud-native)**
- **Event Queue:** GitHub webhook events
- **Dispatcher:** GitHub Actions workflows
- **Pros:** Zero infrastructure, free, integrated with GitHub
- **Cons:** Limited to GitHub-triggered events

**Recommendation:** Start with **Option A** (filesystem), migrate to **Option B** (Redis) if throughput becomes an issue.

### AI Notebooks

**Marimo (Real-time Analysis)**
```bash
# Install
pip install marimo anthropic polars matplotlib plotly

# Run notebook as web app
marimo edit analysis/routing-optimization.py

# Run notebook as script (for CI/CD)
marimo run analysis/routing-optimization.py
```

**Quarto (Reports)**
```bash
# Install
brew install quarto

# Render single report
quarto render reports/weekly-summary.qmd

# Serve all reports locally
quarto preview reports/

# Publish to GitHub Pages
quarto publish gh-pages reports/
```

**Dependencies:**
```txt
# requirements.txt for analysis/
marimo>=0.9.0
anthropic>=0.39.0
polars>=1.13.0
matplotlib>=3.9.0
plotly>=5.24.0
pandas>=2.2.0
```

---

## Migration Strategy

### Parallel Operation (Low Risk)

**Approach:** Run daemons AND event handlers side-by-side, compare outputs

```bash
# Week 1: Event infrastructure
./scripts/events/event-dispatcher.sh &  # Start dispatcher

# Week 2: Run in parallel
./scripts/daemons/auto-learning-daemon.sh &  # Keep running
# Event handlers also running
# Monitor coordination/events/ vs daemon outputs

# Week 3: Validation
# Compare results, verify event-driven produces same outcomes

# Week 4: Cutover
pkill -f auto-learning-daemon.sh  # Stop daemon
# Event handlers now primary
```

### Rollback Plan

**If event-driven has issues:**
```bash
# Stop event dispatcher
pkill -f event-dispatcher.sh

# Restart daemons
./scripts/daemons/start-all-daemons.sh

# Investigate event logs
tail -f coordination/events/*.jsonl
```

**Rollback trigger criteria:**
- Event processing latency > 5 seconds
- Event loss (missing events in logs)
- Handler crashes > 3 per hour
- Functional regression (MoE routing accuracy drops)

---

## Timeline

### Week 1: Event Infrastructure
**Dec 2-6, 2025**
- [ ] Day 1: Design event schema
- [ ] Day 2: Build event-dispatcher.sh
- [ ] Day 3: Create first 3 event handlers
- [ ] Day 4: Test event flow end-to-end
- [ ] Day 5: Documentation & refinement

### Week 2: Daemon Migration
**Dec 9-13, 2025**
- [ ] Day 1: Migrate heartbeat-monitor
- [ ] Day 2: Migrate cleanup-daemon
- [ ] Day 3: Migrate failure-pattern-daemon
- [ ] Day 4: Migrate auto-fix-daemon
- [ ] Day 5: Testing & monitoring

### Week 3: AI Notebooks
**Dec 16-20, 2025**
- [ ] Day 1: Set up Marimo environment
- [ ] Day 2: Create routing-optimization notebook
- [ ] Day 3: Create security-dashboard notebook
- [ ] Day 4: Set up Quarto + first report
- [ ] Day 5: GitHub Actions integration

### Week 4: High-Risk Migrations
**Dec 23-27, 2025**
- [ ] Day 1: Migrate auto-learning-daemon (parallel)
- [ ] Day 2: Migrate moe-learning-daemon (parallel)
- [ ] Day 3: Validation & testing
- [ ] Day 4: Cutover to event-driven
- [ ] Day 5: Decommission daemons

---

## Success Metrics

### Performance
- [ ] Event processing latency < 1 second (p95)
- [ ] Zero event loss (all events logged)
- [ ] Resource usage reduced by 70%+ (vs daemons)
- [ ] System uptime maintained (99.9%+)

### Functionality
- [ ] MoE routing accuracy unchanged or improved
- [ ] Auto-learning continues without regression
- [ ] All daemon functionality preserved
- [ ] No increase in manual intervention

### Observability
- [ ] AI notebooks provide actionable insights
- [ ] Weekly reports auto-generated
- [ ] No need for external dashboards
- [ ] Faster debugging (event trace < 5 min)

---

## Next Steps

### Immediate (Today - Dec 1)
- [x] Create this planning document
- [ ] Review and refine plan
- [ ] Decide on event infrastructure approach (filesystem vs Redis)
- [ ] Set up development branch for event-driven work

### This Week (Dec 2-6)
- [ ] Implement Phase 1: Event Infrastructure
- [ ] Create event-dispatcher.sh
- [ ] Build first 3 event handlers
- [ ] Test with real Cortex events

### Questions to Answer
1. **Event Infrastructure:** Filesystem (simple) or Redis (scalable)?
2. **Migration Pace:** Aggressive (1 week) or conservative (4 weeks)?
3. **Notebook Priority:** Start with Marimo or Quarto first?
4. **Daemon Cutover:** Hard cutover or gradual switchover?

---

## Resources

### Documentation
- [Marimo Documentation](https://docs.marimo.io/)
- [Quarto Documentation](https://quarto.org/docs/guide/)
- [Redis Pub/Sub Guide](https://redis.io/docs/manual/pubsub/)
- [Event-Driven Architecture Patterns](https://martinfowler.com/articles/201701-event-driven.html)

### Reference Implementations
- `coordination/events/` - Existing event logs (JSONL)
- `scripts/lib/event-*.sh` - Event utility functions
- `scripts/templates/` - Worker and task templates

### Related Cortex Docs
- `docs/GOVERNANCE.md` - Access control patterns
- `docs/MEDALLION-ARCHITECTURE.md` - Data quality layers
- `docs/MoE-ROUTING.md` - Routing decision process

---

## Appendix: Event Schema

### Base Event Structure
```json
{
  "event_id": "evt_20251201_123456_abc123",
  "event_type": "worker.completed",
  "timestamp": "2025-12-01T12:34:56-06:00",
  "source": "worker-implementation-042",
  "correlation_id": "task-security-scan-001",
  "metadata": {
    "master": "security-master",
    "priority": "high"
  },
  "payload": {
    "worker_id": "worker-implementation-042",
    "task_id": "task-security-scan-001",
    "status": "completed",
    "duration_ms": 45230,
    "tokens_used": 12450
  }
}
```

### Event Types
- `worker.started`
- `worker.completed`
- `worker.failed`
- `worker.heartbeat`
- `task.created`
- `task.assigned`
- `task.completed`
- `task.failed`
- `security.scan_completed`
- `security.vulnerability_found`
- `routing.decision_made`
- `learning.pattern_detected`

---

**End of Document**

*This is a living document. Update as implementation progresses.*
