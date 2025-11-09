# Consolidated Issues Report - Commit Relay System
**Date**: November 9, 2025
**Status**: Active Issues Requiring Resolution
**Last Updated**: 11:00 AM CST

---

## Executive Summary

This document consolidates all issues identified in the commit-relay system. The worker launcher architecture has been successfully fixed, enabling autonomous task execution. However, significant dashboard display issues remain that prevent proper system monitoring and management.

**System Status**: ✅ Core Functional | ⚠️ Dashboard Issues | 🔧 Monitoring Degraded

---

## 🟢 RESOLVED ISSUES (For Reference)

### Worker Launcher Architecture Gap
**Resolution Date**: 2025-11-09 08:42 AM
**Solution**: Implemented `claude-worker-launcher.sh` bridge between worker-daemon and Claude Code
**Result**: Workers now execute tasks autonomously with AI capabilities

### Worker Type Template Mismatch
**Resolution Date**: 2025-11-09 08:42 AM
**Solution**: Fixed worker_type values in development master to match actual template filenames
**Result**: Workers launch successfully and complete tasks

### Claude API 403 Error (Partial)
**Resolution Date**: 2025-11-09 08:25 AM
**Solution**: Reduced prompt size from 30KB to ~400 chars, Claude reads files using tools
**Result**: Workers launch without API errors

---

## 🔴 CRITICAL ISSUES - Dashboard Display Failures

### Issue 1: Dashboard Events Not Displaying
**Priority**: P0 - CRITICAL
**Impact**: Cannot monitor system activity despite 19,802 events logged

#### Implementation Prompt:
```
Fix the dashboard events display issue where 19,802 events in coordination/dashboard-events.jsonl are not showing on the admin page.

PROBLEM:
- File contains 19,802 event lines
- Dashboard crashes with: SyntaxError: Unexpected token '}' at dashboard/server/index.js:1077
- Admin page shows no events
- Some JSONL lines may be malformed

SOLUTION STEPS:
1. In dashboard/server/index.js around line 1077:
   - Add try-catch for JSON.parse() operations
   - Skip malformed lines with warning log
   - Filter out null results

2. Add event validation:
   - Check for required fields (id, timestamp, type)
   - Validate timestamp format
   - Sanitize event data

3. Implement pagination:
   - Default to last 100 events
   - Add query params: ?limit=N&offset=M
   - Support timestamp filtering: ?since=ISO_DATE

4. Fix frontend display:
   - Add loading states and error boundaries
   - Format timestamps properly
   - Add event type badges with colors
   - Make event details collapsible

5. Optional: Audit the JSONL file for malformed entries:
   while read line; do echo "$line" | jq . >/dev/null 2>&1 || echo "Bad: $line"; done < coordination/dashboard-events.jsonl

TEST: Admin page should display last 100 events with proper formatting
```

### Issue 2: Task Queue Display Missing Active Tasks
**Priority**: P0 - CRITICAL
**Impact**: 62 active tasks invisible (24 assigned + 38 worker_spawned)

#### Implementation Prompt:
```
Fix task queue display to show all 73 tasks including "assigned" and "worker_spawned" statuses.

PROBLEM:
- Dashboard shows 0 tasks in queue
- Actually have: 7 pending, 24 assigned, 38 worker_spawned, 2 completed, 2 failed
- Frontend only displays "pending" status tasks

SOLUTION:
1. Update dashboard task queue component to include:
   - "pending" → Show as "Waiting" (yellow badge)
   - "assigned" → Show as "Assigned" (blue badge)
   - "worker_spawned" → Show as "In Progress" (green badge)
   - "completed" → Show as "Done" (gray badge)
   - "failed" → Show as "Failed" (red badge)

2. Update API endpoint to return all task statuses:
   - Modify task filtering logic
   - Include counts for each status
   - Return summary statistics

3. Add task breakdown display:
   - Show total count prominently
   - Display status breakdown with colored badges
   - Add progress bar showing completion percentage

TEST: Dashboard should show all 73 tasks with proper status indicators
```

### Issue 3: Git & Server Manager Status Broken
**Priority**: P0 - CRITICAL
**Impact**: Cannot track repository synchronization health

#### Implementation Prompt:
```
Fix Git & Server manager status indicators on dashboard.

PROBLEMS:
- No last PR date/time displayed
- No last repo sync timestamp
- Dashboard showing "offline" when actually online

SOLUTION:
1. Fix git status API endpoint:
   - Read git operations from coordination/git-operations.jsonl
   - Parse for last PR creation, push, pull events
   - Return timestamps and status

2. Update status indicators:
   - Show last PR: date, PR number, title
   - Show last sync: timestamp, branch, commit hash
   - Fix online/offline detection logic

3. Add visual indicators:
   - Green dot for online/synced
   - Yellow dot for stale (>1 hour)
   - Red dot for offline/error

TEST: Dashboard should show accurate git status with proper timestamps
```

---

## 🟡 HIGH PRIORITY ISSUES - System Monitoring

### Issue 4: Activity Feed Empty
**Priority**: P1 - HIGH
**Impact**: No 24-hour activity reporting despite 19,802 events

#### Implementation Prompt:
```
Fix activity feed to display last 24 hours of events from dashboard-events.jsonl.

SOLUTION:
1. Filter events by timestamp (last 24 hours)
2. Group events by type and hour
3. Create activity timeline display
4. Add event type filters
5. Show event counts and trends

TEST: Activity feed shows 24-hour event history with filtering
```

### Issue 5: Real-Time Events Disappearing
**Priority**: P1 - HIGH
**Impact**: Live events vanish after page refresh

#### Implementation Prompt:
```
Fix real-time event persistence issue where events disappear after refresh.

PROBLEM:
- EVENT_BUFFER_SIZE set to 50 in dashboard/server/index.js:121
- Buffer not persisting on WebSocket reconnection
- Events lost on page refresh

SOLUTION:
1. Increase EVENT_BUFFER_SIZE to 500
2. Persist buffer to memory/file between connections
3. Restore buffer on WebSocket reconnect
4. Add client-side event caching
5. Implement proper WebSocket reconnection logic

TEST: Events persist across page refreshes and reconnections
```

---

## 🟢 MEDIUM PRIORITY ISSUES - Enhancements

### Issue 6: Visual Alerts for Offline Daemons
**Priority**: P2 - MEDIUM
**Impact**: No visual indication of daemon health issues

#### Implementation Prompt:
```
Add color-coded daemon health indicators using coordination/health-alerts.json data.

SOLUTION:
1. Read health alerts from JSON file
2. Create status badge component:
   - Green = healthy (no alerts)
   - Yellow = warning (medium severity)
   - Red = critical (high severity)
3. Add tooltip with alert details
4. Update every 30 seconds
5. Flash animation for new alerts

TEST: Daemon status shows colored badges matching health alerts
```

### Issue 7: MoE Intelligence Visualizations
**Priority**: P2 - MEDIUM
**Impact**: Cannot see routing decisions and patterns

#### Implementation Prompt:
```
Create MoE intelligence page visualizations for routing decisions.

DATA SOURCES:
- coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl
- coordination/memory/long-term/task-patterns.json

SOLUTION:
1. Parse routing decision history
2. Create visualizations:
   - Sankey diagram for task routing flow
   - Confidence score distribution chart
   - Success rate by master/worker type
   - Task pattern heat map
3. Add time range selector
4. Include decision reasoning display

TEST: MoE page shows routing patterns and decision confidence
```

---

## 🔵 SYSTEM HEALTH CHECKS

### Current Daemon Status
```bash
# Check running daemons
ps aux | grep -E "worker-daemon|health-monitor|orchestrator|metrics-snapshot"

# Verify health alerts
cat coordination/health-alerts.json | jq '.alerts'

# Check worker pool
cat coordination/worker-pool.json | jq '.active_workers | length'

# Verify task queue
cat coordination/task-queue.json | jq '.tasks | group_by(.status) | map({status: .[0].status, count: length})'
```

### PM Daemon Alert
**Status**: ⚠️ STALE - Needs restart
**Action**: `./scripts/start-pm-daemon.sh`

---

## Implementation Priority Order

1. **Fix dashboard events display** (P0) - Required for any monitoring
2. **Fix task queue display** (P0) - Need to see active work
3. **Fix git status indicators** (P0) - Track repository health
4. **Fix activity feed** (P1) - Historical analysis
5. **Fix real-time events** (P1) - Live monitoring
6. **Add daemon health badges** (P2) - Visual alerts
7. **Add MoE visualizations** (P2) - Intelligence insights

---

## Testing Checklist

After implementing fixes, verify:

- [ ] Dashboard loads without errors
- [ ] Events display with proper formatting
- [ ] All 73 tasks visible with status badges
- [ ] Git status shows accurate timestamps
- [ ] Activity feed shows 24-hour history
- [ ] Real-time events persist across refresh
- [ ] Daemon health badges display correctly
- [ ] MoE visualizations render properly

---

## Monitoring Commands

```bash
# Watch for new events
tail -f coordination/dashboard-events.jsonl | jq '.'

# Monitor worker activity
watch -n 5 'cat coordination/worker-pool.json | jq ".active_workers | length"'

# Track task progress
watch -n 10 'cat coordination/task-queue.json | jq ".tasks | group_by(.status) | map({status: .[0].status, count: length})"'

# Check daemon health
tail -f agents/logs/system/health-monitor.log
```

---

## Success Metrics

Dashboard is fully functional when:
- ✅ All events display without errors
- ✅ Task counts match actual queue state
- ✅ Git status shows real-time information
- ✅ Activity feed populated with 24hr data
- ✅ Real-time updates work reliably
- ✅ Visual health indicators active
- ✅ MoE intelligence visible

---

**Report Generated**: 2025-11-09 11:00 AM CST
**Next Review**: After implementing P0 issues
**Contact**: Monitor via dashboard once fixed