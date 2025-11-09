# Dashboard Fix Prompts - Detailed Implementation Guide
**Date**: November 9, 2025
**Status**: Tasks Cancelled - Manual Implementation Prompts
**Source**: Dashboard health review and MoE task creation

---

## Overview

This document contains detailed implementation prompts for fixing 7 dashboard issues identified during comprehensive health review. These tasks were created for MoE but cancelled for manual implementation instead.

**Original Task IDs**: task-1762553446 through task-1762553452

---

## 🔴 CRITICAL PRIORITY

### Task 1: Fix Dashboard Events Display on Admin Page

**Issue ID**: task-1762553446
**Priority**: CRITICAL
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

The dashboard admin page is not displaying events from `coordination/dashboard-events.jsonl` despite 19,802 events being present in the file. Additionally, the dashboard is crashing with JSON parsing errors when trying to read this file.

#### Symptoms

1. Admin page shows no events
2. Dashboard crashes with: `SyntaxError: Unexpected token '}', "}" is not valid JSON`
3. Error location: `dashboard/server/index.js:1077`
4. Event count in file: 19,802 lines

#### Root Cause

1. **Malformed JSON entries** in dashboard-events.jsonl
2. **Frontend parsing logic** cannot handle invalid JSON
3. **Error handling missing** for corrupt event lines
4. **Event rendering** component failing silently

#### Implementation Prompt

```markdown
Fix the dashboard events display and parsing issues:

**Backend (dashboard/server/index.js):**

1. Locate the event parsing code around line 1077
2. Add robust error handling for malformed JSON:
   ```javascript
   // Before: Direct JSON.parse() without error handling
   const events = eventLines.map(line => JSON.parse(line));

   // After: Safe parsing with error recovery
   const events = eventLines
     .map(line => {
       try {
         return JSON.parse(line);
       } catch (error) {
         console.warn('Skipping malformed event:', line.substring(0, 50));
         return null;
       }
     })
     .filter(event => event !== null);
   ```

3. Add validation for event structure:
   - Ensure required fields exist (id, timestamp, type)
   - Validate timestamp format
   - Sanitize event data before sending to frontend

4. Implement pagination for large event lists:
   - Default: Last 100 events
   - Support query params: ?limit=N&offset=M
   - Add timestamp filtering: ?since=ISO_DATE

**Frontend (dashboard/public/*.html or *.js):**

5. Locate the admin events display component
6. Add loading state and error boundaries
7. Implement event list rendering with:
   - Timestamp formatting
   - Event type badges with colors
   - Collapsible event details
   - Search/filter functionality

8. Add real-time updates via WebSocket
9. Handle empty states gracefully

**Data Cleanup (optional):**

10. Audit coordination/dashboard-events.jsonl:
    ```bash
    # Find malformed lines
    while IFS= read -r line; do
      echo "$line" | jq . >/dev/null 2>&1 || echo "Bad: $line"
    done < coordination/dashboard-events.jsonl
    ```

11. Consider rotating log file if too large (19K+ lines)

**Testing:**
- Test with empty event file
- Test with malformed JSON
- Test with 10K+ events
- Verify pagination works
- Check WebSocket reconnection
```

#### Files to Modify

- `dashboard/server/index.js` (lines around 1075-1080)
- `dashboard/public/index.html` or admin page template
- `dashboard/public/dashboard.js` or `dashboard-v2.js`

#### Acceptance Criteria

- [ ] Dashboard doesn't crash on malformed JSON
- [ ] Admin page displays last 100 events by default
- [ ] Events render with proper formatting
- [ ] Malformed lines are skipped with warnings
- [ ] Real-time events update via WebSocket
- [ ] Performance acceptable with 19K+ events

#### Data References

```bash
# Event file location
coordination/dashboard-events.jsonl

# Current size
wc -l coordination/dashboard-events.jsonl
# Output: 19802

# Recent events
tail -20 coordination/dashboard-events.jsonl | jq '.type'
```

---

### Task 2: Fix Git & Server Manager Status Indicators

**Issue ID**: task-1762553447
**Priority**: CRITICAL
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

Git & Server manager controls showing incorrect/missing status:
- No last PR date/time displayed
- No last repo sync timestamp
- Dashboard indicating "offline" (false positive)

#### Implementation Prompt

```markdown
Fix the Git & Server manager status display and data fetching:

**Backend API Endpoints (dashboard/server/index.js):**

1. Add/fix GitHub API integration:
   ```javascript
   // Get last PR information
   app.get('/api/git/last-pr', authMiddleware, async (req, res) => {
     try {
       const { execSync } = require('child_process');

       // Use gh CLI to get last PR
       const output = execSync(
         'gh pr list --repo ry-ops/commit-relay --limit 1 --state all --json number,title,createdAt,mergedAt',
         { encoding: 'utf-8' }
       );

       const prs = JSON.parse(output);
       const lastPr = prs[0] || null;

       res.json({
         lastPr,
         timestamp: new Date().toISOString()
       });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

2. Add last repo sync endpoint:
   ```javascript
   // Get last git sync information
   app.get('/api/git/last-sync', authMiddleware, async (req, res) => {
     try {
       const { execSync } = require('child_process');
       const gitDir = process.env.COMMIT_RELAY_HOME || '/path/to/repo';

       // Get last fetch time from git
       const lastFetch = execSync(
         `cd ${gitDir} && git log -1 --format=%ct FETCH_HEAD`,
         { encoding: 'utf-8' }
       ).trim();

       // Get current branch
       const branch = execSync(
         `cd ${gitDir} && git branch --show-current`,
         { encoding: 'utf-8' }
       ).trim();

       // Get last commit
       const lastCommit = execSync(
         `cd ${gitDir} && git log -1 --format="%h - %s (%cr)"`,
         { encoding: 'utf-8' }
       ).trim();

       res.json({
         lastFetchTimestamp: parseInt(lastFetch) * 1000,
         branch,
         lastCommit,
         timestamp: new Date().toISOString()
       });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

3. Fix dashboard health check endpoint:
   ```javascript
   // Dashboard health endpoint
   app.get('/api/dashboard/health', (req, res) => {
     res.json({
       status: 'online',
       port: PORT,
       uptime: process.uptime(),
       timestamp: new Date().toISOString()
     });
   });
   ```

**Frontend Updates:**

4. Update Git & Server manager component to fetch data:
   ```javascript
   // Fetch and display last PR
   fetch('/api/git/last-pr')
     .then(r => r.json())
     .then(data => {
       document.getElementById('last-pr-date').textContent =
         data.lastPr ? formatDate(data.lastPr.mergedAt || data.lastPr.createdAt) : 'N/A';
       document.getElementById('last-pr-title').textContent =
         data.lastPr ? data.lastPr.title : 'No PRs found';
     });

   // Fetch and display last sync
   fetch('/api/git/last-sync')
     .then(r => r.json())
     .then(data => {
       document.getElementById('last-sync-date').textContent =
         formatDate(data.lastFetchTimestamp);
       document.getElementById('current-branch').textContent = data.branch;
     });

   // Check dashboard status
   fetch('/api/dashboard/health')
     .then(r => r.json())
     .then(data => {
       document.getElementById('dashboard-status').textContent = 'Online';
       document.getElementById('dashboard-status').className = 'status-online';
     })
     .catch(() => {
       document.getElementById('dashboard-status').textContent = 'Offline';
       document.getElementById('dashboard-status').className = 'status-offline';
     });
   ```

5. Add auto-refresh (every 60 seconds)
6. Add manual refresh button
7. Handle API errors gracefully

**Security:**

8. Ensure gh CLI is authenticated
9. Validate file paths to prevent directory traversal
10. Rate limit git API calls

**Testing:**
- Test with no PRs in repo
- Test with git not configured
- Test with gh CLI not installed
- Verify timestamps are correct timezone
- Check refresh functionality
```

#### Files to Modify

- `dashboard/server/index.js` (add new endpoints)
- `dashboard/public/index.html` (Git & Server manager section)
- `dashboard/public/dashboard.js` (API calls and rendering)

#### Acceptance Criteria

- [ ] Last PR date/time displays correctly
- [ ] Last repo sync timestamp shows
- [ ] Dashboard status shows "online" when running
- [ ] Timestamps are in local timezone
- [ ] Auto-refresh works every 60 seconds
- [ ] Manual refresh button functional
- [ ] Errors handled gracefully

---

## 🟡 HIGH PRIORITY

### Task 3: Fix Task Queue Display - 62 Active Tasks Not Showing

**Issue ID**: task-1762553448
**Priority**: HIGH
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

Task queue shows "0 tasks" but 62 tasks are actually active:
- 24 tasks in "assigned" status (not displayed)
- 38 tasks in "worker_spawned" status (not displayed)
- Only "pending" status tasks are shown

#### Current Data

```json
{
  "pending": 7,
  "assigned": 24,       // ← NOT DISPLAYED
  "worker_spawned": 38, // ← NOT DISPLAYED
  "completed": 2,
  "failed": 2,
  "cancelled": 7,
  "TOTAL": 80
}
```

#### Implementation Prompt

```markdown
Update the task queue display to show all active task statuses:

**Frontend Logic Update:**

1. Locate the task queue rendering code in dashboard/public/dashboard.js

2. Update the status filter to include all active statuses:
   ```javascript
   // Before: Only shows pending
   const activeTasks = tasks.filter(t => t.status === 'pending');

   // After: Show all active statuses
   const ACTIVE_STATUSES = ['pending', 'assigned', 'worker_spawned', 'in_progress'];
   const activeTasks = tasks.filter(t => ACTIVE_STATUSES.includes(t.status));
   ```

3. Add status-specific styling:
   ```javascript
   function getStatusBadge(status) {
     const badges = {
       'pending': '<span class="badge badge-yellow">Pending</span>',
       'assigned': '<span class="badge badge-blue">Assigned</span>',
       'worker_spawned': '<span class="badge badge-purple">Worker Spawned</span>',
       'in_progress': '<span class="badge badge-green">In Progress</span>',
       'completed': '<span class="badge badge-success">Completed</span>',
       'failed': '<span class="badge badge-danger">Failed</span>',
       'cancelled': '<span class="badge badge-gray">Cancelled</span>'
     };
     return badges[status] || '<span class="badge">Unknown</span>';
   }
   ```

4. Update the task queue card to show breakdown:
   ```javascript
   document.getElementById('task-queue-total').textContent = activeTasks.length;

   // Show breakdown by status
   const breakdown = {
     pending: activeTasks.filter(t => t.status === 'pending').length,
     assigned: activeTasks.filter(t => t.status === 'assigned').length,
     worker_spawned: activeTasks.filter(t => t.status === 'worker_spawned').length
   };

   document.getElementById('task-breakdown').innerHTML = `
     <div class="status-breakdown">
       <span>Pending: ${breakdown.pending}</span>
       <span>Assigned: ${breakdown.assigned}</span>
       <span>Workers: ${breakdown.worker_spawned}</span>
     </div>
   `;
   ```

5. Add task list table with all active tasks:
   ```javascript
   const taskListHtml = activeTasks.map(task => `
     <tr>
       <td>${task.id}</td>
       <td>${task.type}</td>
       <td>${getStatusBadge(task.status)}</td>
       <td>${task.priority}</td>
       <td>${formatDate(task.created_at)}</td>
       <td>${task.assigned_to || 'Unassigned'}</td>
     </tr>
   `).join('');

   document.getElementById('task-list-body').innerHTML = taskListHtml;
   ```

6. Add filtering controls:
   - Filter by status (all, pending, assigned, in progress)
   - Filter by priority (all, critical, high, medium, low)
   - Sort by date, priority, or status

**Backend API Update (if needed):**

7. Ensure /api/metrics or /api/tasks endpoint returns all statuses:
   ```javascript
   app.get('/api/tasks', authMiddleware, async (req, res) => {
     const taskQueue = await readJSON(FILES.taskQueue);

     const statusFilter = req.query.status || 'active'; // 'active', 'all', 'pending', etc.

     let tasks = taskQueue.tasks || [];

     if (statusFilter === 'active') {
       const activeStatuses = ['pending', 'assigned', 'worker_spawned', 'in_progress'];
       tasks = tasks.filter(t => activeStatuses.includes(t.status));
     } else if (statusFilter !== 'all') {
       tasks = tasks.filter(t => t.status === statusFilter);
     }

     res.json({
       tasks,
       count: tasks.length,
       breakdown: tasks.reduce((acc, task) => {
         acc[task.status] = (acc[task.status] || 0) + 1;
         return acc;
       }, {})
     });
   });
   ```

**CSS Styling:**

8. Add status badge colors:
   ```css
   .badge-yellow { background: #fbbf24; color: #78350f; }
   .badge-blue { background: #60a5fa; color: #1e3a8a; }
   .badge-purple { background: #a78bfa; color: #4c1d95; }
   .badge-green { background: #34d399; color: #064e3b; }
   .badge-success { background: #10b981; color: white; }
   .badge-danger { background: #ef4444; color: white; }
   .badge-gray { background: #9ca3af; color: #1f2937; }

   .status-breakdown {
     display: flex;
     gap: 1rem;
     margin-top: 0.5rem;
     font-size: 0.875rem;
   }
   ```

**Testing:**
- Test with no tasks
- Test with only pending tasks
- Test with mixed statuses
- Test filtering controls
- Test sorting functionality
- Verify counts match actual data
```

#### Files to Modify

- `dashboard/public/dashboard.js` or `dashboard-v2.js`
- `dashboard/public/index.html` (task queue section)
- `dashboard/server/index.js` (API endpoint if needed)
- `dashboard/public/styles.css` (status badges)

#### Acceptance Criteria

- [ ] All active tasks display (pending + assigned + worker_spawned)
- [ ] Status breakdown shows correct counts
- [ ] Task list table shows all tasks
- [ ] Status badges have distinct colors
- [ ] Filtering by status works
- [ ] Counts update in real-time
- [ ] Performance acceptable with 100+ tasks

---

### Task 4: Fix Activity Feed - Enable 24hr Event Reporting

**Issue ID**: task-1762553449
**Priority**: HIGH
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

Activity feed shows no items despite 19,802 events in dashboard-events.jsonl. Related to Task 1 (event parsing) but specifically for the activity feed component.

#### Implementation Prompt

```markdown
Fix the activity feed to display events from the last 24 hours:

**Backend API Endpoint:**

1. Create dedicated activity feed endpoint:
   ```javascript
   app.get('/api/activity/recent', authMiddleware, async (req, res) => {
     try {
       const hours = parseInt(req.query.hours) || 24;
       const limit = parseInt(req.query.limit) || 50;

       const eventFile = FILES.dashboardEvents;
       const content = await fs.readFile(eventFile, 'utf-8');
       const lines = content.trim().split('\n');

       // Parse events safely
       const events = lines
         .map(line => {
           try {
             return JSON.parse(line);
           } catch {
             return null;
           }
         })
         .filter(event => event !== null);

       // Filter by time window
       const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
       const recentEvents = events.filter(event => {
         const eventTime = new Date(event.timestamp).getTime();
         return eventTime > cutoffTime;
       });

       // Sort by timestamp descending
       recentEvents.sort((a, b) =>
         new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
       );

       // Return limited results
       res.json({
         events: recentEvents.slice(0, limit),
         total: recentEvents.length,
         hours,
         timestamp: new Date().toISOString()
       });
     } catch (error) {
       res.status(500).json({ error: sanitizeError(error) });
     }
   });
   ```

**Frontend Activity Feed:**

2. Create activity feed component:
   ```javascript
   async function loadActivityFeed() {
     try {
       const response = await fetch('/api/activity/recent?hours=24&limit=50');
       const data = await response.json();

       const feedContainer = document.getElementById('activity-feed');

       if (data.events.length === 0) {
         feedContainer.innerHTML = '<p class="text-muted">No recent activity</p>';
         return;
       }

       const feedHtml = data.events.map(event => {
         const icon = getEventIcon(event.type);
         const color = getEventColor(event.type);
         const relativeTime = formatRelativeTime(event.timestamp);

         return `
           <div class="activity-item">
             <div class="activity-icon ${color}">
               ${icon}
             </div>
             <div class="activity-content">
               <div class="activity-message">${formatEventMessage(event)}</div>
               <div class="activity-time">${relativeTime}</div>
             </div>
           </div>
         `;
       }).join('');

       feedContainer.innerHTML = feedHtml;

       // Update count badge
       document.getElementById('activity-count').textContent = data.total;
     } catch (error) {
       console.error('Failed to load activity feed:', error);
       document.getElementById('activity-feed').innerHTML =
         '<p class="text-danger">Failed to load activity</p>';
     }
   }
   ```

3. Add event type icons and colors:
   ```javascript
   function getEventIcon(type) {
     const icons = {
       'task_created': '📝',
       'task_assigned': '👤',
       'task_completed': '✅',
       'worker_started': '🚀',
       'worker_completed': '✨',
       'worker_failed': '❌',
       'alert_created': '⚠️',
       'alert_resolved': '✔️',
       'moe_pool_updated': '🔄',
       'default': '•'
     };
     return icons[type] || icons.default;
   }

   function getEventColor(type) {
     const colors = {
       'task_created': 'blue',
       'task_completed': 'green',
       'worker_failed': 'red',
       'alert_created': 'yellow',
       'default': 'gray'
     };
     return colors[type] || colors.default;
   }

   function formatEventMessage(event) {
     // Use event.message if available, otherwise format from data
     if (event.message) return event.message;

     // Format based on event type
     switch (event.type) {
       case 'task_created':
         return `Task created: ${event.data.task_id}`;
       case 'worker_started':
         return `Worker ${event.data.worker_id} started`;
       // Add more cases as needed
       default:
         return `Event: ${event.type}`;
     }
   }
   ```

4. Add time formatting:
   ```javascript
   function formatRelativeTime(timestamp) {
     const now = Date.now();
     const eventTime = new Date(timestamp).getTime();
     const diffMs = now - eventTime;

     const seconds = Math.floor(diffMs / 1000);
     const minutes = Math.floor(seconds / 60);
     const hours = Math.floor(minutes / 60);

     if (hours > 0) return `${hours}h ago`;
     if (minutes > 0) return `${minutes}m ago`;
     return `${seconds}s ago`;
   }
   ```

5. Add auto-refresh:
   ```javascript
   // Refresh feed every 30 seconds
   setInterval(loadActivityFeed, 30000);

   // Load on page load
   document.addEventListener('DOMContentLoaded', loadActivityFeed);
   ```

6. Add time window controls:
   ```html
   <div class="activity-controls">
     <button onclick="loadActivityFeed(1)">1h</button>
     <button onclick="loadActivityFeed(6)">6h</button>
     <button onclick="loadActivityFeed(24)" class="active">24h</button>
     <button onclick="loadActivityFeed(168)">7d</button>
   </div>
   ```

**CSS Styling:**

7. Add activity feed styles:
   ```css
   .activity-item {
     display: flex;
     gap: 0.75rem;
     padding: 0.75rem;
     border-bottom: 1px solid #e5e7eb;
   }

   .activity-icon {
     width: 2rem;
     height: 2rem;
     display: flex;
     align-items: center;
     justify-content: center;
     border-radius: 50%;
     font-size: 1rem;
   }

   .activity-icon.blue { background: #dbeafe; }
   .activity-icon.green { background: #d1fae5; }
   .activity-icon.red { background: #fee2e2; }
   .activity-icon.yellow { background: #fef3c7; }

   .activity-content {
     flex: 1;
   }

   .activity-message {
     font-size: 0.875rem;
     color: #1f2937;
   }

   .activity-time {
     font-size: 0.75rem;
     color: #6b7280;
     margin-top: 0.25rem;
   }
   ```

**Testing:**
- Test with no events
- Test with events older than 24h
- Test time window controls (1h, 6h, 24h, 7d)
- Test auto-refresh
- Test with malformed events (should skip)
- Verify performance with thousands of events
```

#### Files to Modify

- `dashboard/server/index.js` (new endpoint)
- `dashboard/public/index.html` (activity feed section)
- `dashboard/public/dashboard.js` (feed component)
- `dashboard/public/styles.css` (activity styling)

#### Acceptance Criteria

- [ ] Activity feed displays last 24 hours of events
- [ ] Events show icon, message, and relative time
- [ ] Time window controls work (1h, 6h, 24h, 7d)
- [ ] Feed auto-refreshes every 30 seconds
- [ ] Malformed events are skipped
- [ ] No events message when empty
- [ ] Performance acceptable with large event files

---

### Task 5: Fix Real-Time Events Disappearing After Refresh

**Issue ID**: task-1762553450
**Priority**: HIGH
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

Events disappear from dashboard after page refresh or after some time. The event buffer is not persisting properly, and WebSocket reconnection doesn't restore events.

#### Root Cause

- EVENT_BUFFER_SIZE in server/index.js is only 50 events
- Buffer is in-memory only (lost on page refresh)
- WebSocket reconnection doesn't send buffered events
- No persistence mechanism for recent events

#### Implementation Prompt

```markdown
Fix event persistence and WebSocket reconnection to prevent events from disappearing:

**Backend Event Buffer Enhancement:**

1. Locate EVENT_BUFFER_SIZE in dashboard/server/index.js (line 121):
   ```javascript
   // Increase buffer size
   const EVENT_BUFFER_SIZE = 500; // Increased from 50
   let eventBuffer = [];
   ```

2. Add event buffer persistence to file:
   ```javascript
   const EVENT_BUFFER_FILE = path.join(COORD_DIR, 'event-buffer.json');

   // Load buffer on startup
   async function loadEventBuffer() {
     try {
       if (fsSync.existsSync(EVENT_BUFFER_FILE)) {
         const content = await fs.readFile(EVENT_BUFFER_FILE, 'utf-8');
         eventBuffer = JSON.parse(content);
         console.log(`Loaded ${eventBuffer.length} events from buffer`);
       }
     } catch (error) {
       console.warn('Failed to load event buffer:', error.message);
       eventBuffer = [];
     }
   }

   // Save buffer periodically
   async function saveEventBuffer() {
     try {
       await fs.writeFile(
         EVENT_BUFFER_FILE,
         JSON.stringify(eventBuffer, null, 2),
         'utf-8'
       );
     } catch (error) {
       console.error('Failed to save event buffer:', error.message);
     }
   }

   // Auto-save every 30 seconds
   setInterval(saveEventBuffer, 30000);

   // Load on startup
   loadEventBuffer();
   ```

3. Enhance addToEventBuffer function:
   ```javascript
   function addToEventBuffer(event) {
     // Add timestamp if missing
     if (!event.timestamp) {
       event.timestamp = new Date().toISOString();
     }

     // Add to buffer
     eventBuffer.push(event);

     // Keep only last N events
     if (eventBuffer.length > EVENT_BUFFER_SIZE) {
       eventBuffer = eventBuffer.slice(-EVENT_BUFFER_SIZE);
     }

     // Async save (don't block)
     saveEventBuffer().catch(err =>
       console.error('Event buffer save failed:', err)
     );

     // Broadcast to all connected clients
     broadcastToClients(event);
   }
   ```

4. Fix WebSocket reconnection to send buffer:
   ```javascript
   wss.on('connection', (ws) => {
     console.log('WebSocket client connected');

     // Send event buffer to new client
     ws.send(JSON.stringify({
       type: 'buffer',
       events: eventBuffer,
       count: eventBuffer.length,
       timestamp: new Date().toISOString()
     }));

     ws.on('message', (message) => {
       // Handle ping/pong for keep-alive
       try {
         const msg = JSON.parse(message);
         if (msg.type === 'ping') {
           ws.send(JSON.stringify({ type: 'pong' }));
         }
       } catch (error) {
         console.warn('Invalid WebSocket message:', error.message);
       }
     });

     ws.on('close', () => {
       console.log('WebSocket client disconnected');
     });
   });
   ```

**Frontend WebSocket Enhancement:**

5. Update WebSocket client reconnection logic:
   ```javascript
   let ws = null;
   let reconnectAttempts = 0;
   const MAX_RECONNECT_ATTEMPTS = 10;
   const RECONNECT_DELAY = 3000;

   function connectWebSocket() {
     ws = new WebSocket(`ws://${window.location.host}`);

     ws.onopen = () => {
       console.log('WebSocket connected');
       reconnectAttempts = 0;

       // Send ping every 30s to keep connection alive
       setInterval(() => {
         if (ws.readyState === WebSocket.OPEN) {
           ws.send(JSON.stringify({ type: 'ping' }));
         }
       }, 30000);
     };

     ws.onmessage = (event) => {
       try {
         const data = JSON.parse(event.data);

         if (data.type === 'buffer') {
           // Received event buffer on reconnection
           console.log(`Received ${data.count} buffered events`);
           handleEventBuffer(data.events);
         } else if (data.type === 'pong') {
           // Keep-alive response
           console.debug('Received pong');
         } else {
           // Regular event
           handleNewEvent(data);
         }
       } catch (error) {
         console.error('Failed to parse WebSocket message:', error);
       }
     };

     ws.onerror = (error) => {
       console.error('WebSocket error:', error);
     };

     ws.onclose = () => {
       console.log('WebSocket disconnected');

       // Attempt reconnection
       if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
         reconnectAttempts++;
         console.log(`Reconnecting... (attempt ${reconnectAttempts})`);
         setTimeout(connectWebSocket, RECONNECT_DELAY);
       } else {
         console.error('Max reconnection attempts reached');
         showReconnectionError();
       }
     };
   }

   // Start connection
   connectWebSocket();
   ```

6. Add event buffer handling:
   ```javascript
   function handleEventBuffer(events) {
     // Clear current display
     const container = document.getElementById('event-stream');
     container.innerHTML = '';

     // Render buffered events
     events.forEach(event => {
       renderEvent(event);
     });

     // Update count
     document.getElementById('event-count').textContent = events.length;
   }

   function handleNewEvent(event) {
     // Add to display
     renderEvent(event);

     // Update count
     const count = parseInt(document.getElementById('event-count').textContent || '0');
     document.getElementById('event-count').textContent = count + 1;

     // Keep max 100 events displayed
     const container = document.getElementById('event-stream');
     while (container.children.length > 100) {
       container.removeChild(container.lastChild);
     }
   }
   ```

7. Add reconnection status indicator:
   ```javascript
   function showReconnectionError() {
     const banner = document.createElement('div');
     banner.className = 'reconnection-banner';
     banner.innerHTML = `
       <span>⚠️ Connection lost. Events may not be up to date.</span>
       <button onclick="location.reload()">Reload Page</button>
     `;
     document.body.prepend(banner);
   }
   ```

**CSS for Connection Status:**

8. Add styles for connection indicator:
   ```css
   .reconnection-banner {
     position: fixed;
     top: 0;
     left: 0;
     right: 0;
     background: #fbbf24;
     color: #78350f;
     padding: 0.75rem;
     text-align: center;
     z-index: 9999;
     display: flex;
     justify-content: center;
     align-items: center;
     gap: 1rem;
   }

   .reconnection-banner button {
     background: #78350f;
     color: white;
     border: none;
     padding: 0.5rem 1rem;
     border-radius: 0.25rem;
     cursor: pointer;
   }
   ```

**Testing:**
- Test page refresh (events should persist)
- Test WebSocket disconnect (should reconnect)
- Test with server restart (buffer should reload)
- Test with network interruption
- Test buffer size limit (500 events)
- Test keep-alive ping/pong
- Verify no memory leaks with long-running sessions
```

#### Files to Modify

- `dashboard/server/index.js` (buffer persistence, WebSocket)
- `dashboard/public/dashboard.js` (WebSocket reconnection)
- `dashboard/public/styles.css` (connection status)

#### Acceptance Criteria

- [ ] Events persist across page refresh
- [ ] WebSocket reconnects automatically
- [ ] Buffered events sent to new connections
- [ ] Buffer persisted to file every 30s
- [ ] Keep-alive ping/pong prevents timeout
- [ ] Connection status indicator shows
- [ ] No memory leaks with 500 event buffer
- [ ] Performance acceptable

---

## 🟢 MEDIUM PRIORITY

### Task 6: Create Visual Alert Logic for Offline Daemons

**Issue ID**: task-1762553451
**Priority**: MEDIUM
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

Dashboard needs prominent visual indicators when critical daemons are offline. Currently alerts exist in health-alerts.json but not displayed prominently on the UI.

#### Implementation Prompt

```markdown
Create visual health alerts for daemon status:

**Backend Health Alert Endpoint:**

1. Add endpoint to fetch active alerts:
   ```javascript
   app.get('/api/health/alerts', authMiddleware, async (req, res) => {
     try {
       const alertsFile = path.join(COORD_DIR, 'health-alerts.json');
       const data = await readJSON(alertsFile);

       const activeAlerts = (data.alerts || [])
         .filter(alert => alert.status === 'active')
         .sort((a, b) => {
           const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
           return severityOrder[a.severity] - severityOrder[b.severity];
         });

       res.json({
         alerts: activeAlerts,
         count: activeAlerts.length,
         bySeverity: activeAlerts.reduce((acc, alert) => {
           acc[alert.severity] = (acc[alert.severity] || 0) + 1;
           return acc;
         }, {})
       });
     } catch (error) {
       res.status(500).json({ error: sanitizeError(error) });
     }
   });
   ```

**Frontend Alert Banner:**

2. Create prominent alert banner at top of dashboard:
   ```javascript
   async function loadHealthAlerts() {
     try {
       const response = await fetch('/api/health/alerts');
       const data = await response.json();

       const alertContainer = document.getElementById('health-alerts-banner');

       if (data.count === 0) {
         alertContainer.style.display = 'none';
         return;
       }

       const criticalAlerts = data.alerts.filter(a => a.severity === 'critical');
       const highAlerts = data.alerts.filter(a => a.severity === 'high');

       const bannerHtml = `
         <div class="alert-banner ${criticalAlerts.length > 0 ? 'critical' : 'warning'}">
           <div class="alert-icon">
             ${criticalAlerts.length > 0 ? '🚨' : '⚠️'}
           </div>
           <div class="alert-content">
             <div class="alert-title">
               ${data.count} System Alert${data.count > 1 ? 's' : ''}
             </div>
             <div class="alert-messages">
               ${data.alerts.slice(0, 3).map(alert => `
                 <div class="alert-item">
                   <span class="severity-badge ${alert.severity}">${alert.severity}</span>
                   ${alert.message}
                 </div>
               `).join('')}
               ${data.count > 3 ? `<div class="alert-more">+${data.count - 3} more</div>` : ''}
             </div>
           </div>
           <button class="alert-dismiss" onclick="dismissAlerts()">✕</button>
         </div>
       `;

       alertContainer.innerHTML = bannerHtml;
       alertContainer.style.display = 'block';
     } catch (error) {
       console.error('Failed to load health alerts:', error);
     }
   }

   // Auto-refresh alerts every 60 seconds
   setInterval(loadHealthAlerts, 60000);
   loadHealthAlerts();
   ```

3. Create daemon status card grid:
   ```javascript
   async function loadDaemonStatus() {
     try {
       const response = await fetch('/api/daemons/status');
       const daemons = await response.json();

       const statusGrid = document.getElementById('daemon-status-grid');

       const daemonHtml = Object.entries(daemons).map(([name, status]) => {
         const isHealthy = status.running && !status.stale;
         const statusClass = isHealthy ? 'healthy' : 'unhealthy';
         const statusIcon = isHealthy ? '✅' : '❌';

         return `
           <div class="daemon-card ${statusClass}">
             <div class="daemon-header">
               <span class="daemon-icon">${statusIcon}</span>
               <span class="daemon-name">${formatDaemonName(name)}</span>
             </div>
             <div class="daemon-details">
               ${status.running ?
                 `<div class="detail">PID: ${status.pid}</div>
                  <div class="detail">Uptime: ${formatUptime(status.uptime)}</div>` :
                 `<div class="detail offline">Offline</div>`
               }
               ${status.stale ?
                 `<div class="detail warning">⚠️ Stale heartbeat</div>` : ''
               }
             </div>
           </div>
         `;
       }).join('');

       statusGrid.innerHTML = daemonHtml;
     } catch (error) {
       console.error('Failed to load daemon status:', error);
     }
   }
   ```

**CSS Styling:**

4. Add alert banner styles:
   ```css
   .alert-banner {
     display: flex;
     align-items: center;
     gap: 1rem;
     padding: 1rem 1.5rem;
     border-radius: 0.5rem;
     margin-bottom: 1.5rem;
     box-shadow: 0 4px 6px rgba(0,0,0,0.1);
   }

   .alert-banner.critical {
     background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
     border-left: 4px solid #dc2626;
   }

   .alert-banner.warning {
     background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
     border-left: 4px solid #f59e0b;
   }

   .alert-icon {
     font-size: 2rem;
     line-height: 1;
   }

   .alert-content {
     flex: 1;
   }

   .alert-title {
     font-weight: 600;
     font-size: 1.125rem;
     margin-bottom: 0.5rem;
   }

   .alert-item {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     font-size: 0.875rem;
     margin-bottom: 0.25rem;
   }

   .severity-badge {
     padding: 0.125rem 0.5rem;
     border-radius: 9999px;
     font-size: 0.75rem;
     font-weight: 600;
     text-transform: uppercase;
   }

   .severity-badge.critical {
     background: #dc2626;
     color: white;
   }

   .severity-badge.high {
     background: #f59e0b;
     color: white;
   }

   .severity-badge.medium {
     background: #3b82f6;
     color: white;
   }

   .daemon-status-grid {
     display: grid;
     grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
     gap: 1rem;
     margin-top: 1rem;
   }

   .daemon-card {
     padding: 1rem;
     border-radius: 0.5rem;
     border: 2px solid;
   }

   .daemon-card.healthy {
     background: #d1fae5;
     border-color: #10b981;
   }

   .daemon-card.unhealthy {
     background: #fee2e2;
     border-color: #ef4444;
   }

   .daemon-header {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     font-weight: 600;
     margin-bottom: 0.5rem;
   }

   .daemon-details {
     font-size: 0.875rem;
   }

   .detail.warning {
     color: #f59e0b;
     font-weight: 500;
   }

   .detail.offline {
     color: #ef4444;
     font-weight: 500;
   }
   ```

**Testing:**
- Test with no alerts (banner hidden)
- Test with critical alerts (red banner)
- Test with high/medium alerts (yellow banner)
- Test daemon status cards (healthy/unhealthy)
- Test auto-refresh (60s intervals)
- Test alert dismissal
- Verify responsive layout
```

#### Files to Modify

- `dashboard/server/index.js` (alert endpoint)
- `dashboard/public/index.html` (alert banner section)
- `dashboard/public/dashboard.js` (alert rendering)
- `dashboard/public/styles.css` (alert styling)

#### Acceptance Criteria

- [ ] Alert banner shows at top when alerts active
- [ ] Critical alerts show red banner
- [ ] High/medium alerts show yellow banner
- [ ] Daemon status cards show health status
- [ ] Color coding: green=healthy, red=offline
- [ ] Auto-refreshes every 60 seconds
- [ ] Dismissible but reappears on refresh if still active
- [ ] Responsive layout

---

### Task 7: Enhance MoE Intelligence Pages with Routing Visualizations

**Issue ID**: task-1762553452
**Priority**: MEDIUM
**Status**: Cancelled (awaiting manual implementation)

#### Problem Statement

MoE intelligence pages need data visualizations to show routing decisions, confidence scores, and expertise mapping. Currently the data exists but no visual representation.

#### Data Sources

- `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
- `coordination/memory/long-term/task-patterns.json`
- `coordination/masters/coordinator/logs/routing-decisions.jsonl`

#### Implementation Prompt

```markdown
Create MoE intelligence visualizations for routing decisions and expertise mapping:

**Backend API Endpoints:**

1. Add routing analytics endpoint:
   ```javascript
   app.get('/api/moe/routing-analytics', authMiddleware, async (req, res) => {
     try {
       const routingFile = path.join(
         COORD_DIR,
         'masters/coordinator/knowledge-base/routing-decisions.jsonl'
       );

       const content = await fs.readFile(routingFile, 'utf-8');
       const decisions = content.trim().split('\n')
         .map(line => {
           try {
             return JSON.parse(line);
           } catch {
             return null;
           }
         })
         .filter(d => d !== null);

       // Calculate analytics
       const analytics = {
         total: decisions.length,
         byMaster: decisions.reduce((acc, d) => {
           const master = d.assigned_to || 'unassigned';
           acc[master] = (acc[master] || 0) + 1;
           return acc;
         }, {}),
         byTaskType: decisions.reduce((acc, d) => {
           const type = d.task_type || 'unknown';
           acc[type] = (acc[type] || 0) + 1;
           return acc;
         }, {}),
         averageConfidence: decisions
           .filter(d => d.routing_confidence)
           .reduce((sum, d) => sum + parseFloat(d.routing_confidence), 0) / decisions.length,
         confidenceDistribution: {
           high: decisions.filter(d => parseFloat(d.routing_confidence) >= 0.8).length,
           medium: decisions.filter(d => parseFloat(d.routing_confidence) >= 0.5 && parseFloat(d.routing_confidence) < 0.8).length,
           low: decisions.filter(d => parseFloat(d.routing_confidence) < 0.5).length
         },
         recentDecisions: decisions.slice(-20).reverse()
       };

       res.json(analytics);
     } catch (error) {
       res.status(500).json({ error: sanitizeError(error) });
     }
   });
   ```

2. Add task patterns endpoint:
   ```javascript
   app.get('/api/moe/task-patterns', authMiddleware, async (req, res) => {
     try {
       const patternsFile = path.join(COORD_DIR, 'memory/long-term/task-patterns.json');
       const data = await readJSON(patternsFile);

       res.json(data);
     } catch (error) {
       res.status(500).json({ error: sanitizeError(error) });
     }
   });
   ```

**Frontend Visualizations:**

3. Create routing distribution chart (using Chart.js or similar):
   ```javascript
   async function renderRoutingAnalytics() {
     const response = await fetch('/api/moe/routing-analytics');
     const analytics = await response.json();

     // Master distribution pie chart
     const masterCtx = document.getElementById('master-distribution-chart').getContext('2d');
     new Chart(masterCtx, {
       type: 'pie',
       data: {
         labels: Object.keys(analytics.byMaster),
         datasets: [{
           data: Object.values(analytics.byMaster),
           backgroundColor: [
             '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'
           ]
         }]
       },
       options: {
         responsive: true,
         plugins: {
           title: {
             display: true,
             text: 'Task Distribution by Master'
           }
         }
       }
     });

     // Task type distribution
     const typeCtx = document.getElementById('task-type-chart').getContext('2d');
     new Chart(typeCtx, {
       type: 'bar',
       data: {
         labels: Object.keys(analytics.byTaskType),
         datasets: [{
           label: 'Tasks',
           data: Object.values(analytics.byTaskType),
           backgroundColor: '#3b82f6'
         }]
       },
       options: {
         responsive: true,
         plugins: {
           title: {
             display: true,
             text: 'Tasks by Type'
           }
         }
       }
     });

     // Confidence distribution
     const confCtx = document.getElementById('confidence-chart').getContext('2d');
     new Chart(confCtx, {
       type: 'doughnut',
       data: {
         labels: ['High (≥0.8)', 'Medium (0.5-0.8)', 'Low (<0.5)'],
         datasets: [{
           data: [
             analytics.confidenceDistribution.high,
             analytics.confidenceDistribution.medium,
             analytics.confidenceDistribution.low
           ],
           backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
         }]
       },
       options: {
         responsive: true,
         plugins: {
           title: {
             display: true,
             text: 'Routing Confidence Distribution'
           }
         }
       }
     });
   }
   ```

4. Create recent routing decisions table:
   ```javascript
   function renderRecentRoutingDecisions(decisions) {
     const tableHtml = decisions.map(decision => `
       <tr>
         <td>${decision.task_id}</td>
         <td>${decision.task_type}</td>
         <td>
           <span class="badge">${decision.assigned_to}</span>
         </td>
         <td>
           <div class="confidence-bar">
             <div class="confidence-fill" style="width: ${(decision.routing_confidence * 100).toFixed(0)}%">
               ${(decision.routing_confidence * 100).toFixed(0)}%
             </div>
           </div>
         </td>
         <td>${decision.routing_strategy || 'single_expert'}</td>
         <td>${formatDate(decision.assigned_at)}</td>
       </tr>
     `).join('');

     document.getElementById('routing-decisions-tbody').innerHTML = tableHtml;
   }
   ```

5. Create expertise heatmap:
   ```javascript
   async function renderExpertiseHeatmap() {
     const response = await fetch('/api/moe/task-patterns');
     const patterns = await response.json();

     const masters = ['security', 'development', 'inventory', 'cicd'];
     const taskTypes = ['security-scan', 'security-fix', 'development', 'catalog'];

     const heatmapHtml = `
       <table class="expertise-heatmap">
         <thead>
           <tr>
             <th></th>
             ${taskTypes.map(type => `<th>${type}</th>`).join('')}
           </tr>
         </thead>
         <tbody>
           ${masters.map(master => {
             return `
               <tr>
                 <th>${master}</th>
                 ${taskTypes.map(type => {
                   const pattern = patterns.patterns?.find(p =>
                     p.master === master && p.task_type === type
                   );
                   const successRate = pattern?.success_rate || 0;
                   const intensity = Math.floor(successRate / 20);
                   return `<td class="heat-cell intensity-${intensity}">${(successRate * 100).toFixed(0)}%</td>`;
                 }).join('')}
               </tr>
             `;
           }).join('')}
         </tbody>
       </table>
     `;

     document.getElementById('expertise-heatmap').innerHTML = heatmapHtml;
   }
   ```

**CSS Styling:**

6. Add visualization styles:
   ```css
   .moe-intelligence-grid {
     display: grid;
     grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
     gap: 1.5rem;
     margin-top: 1.5rem;
   }

   .chart-card {
     background: white;
     padding: 1.5rem;
     border-radius: 0.5rem;
     box-shadow: 0 1px 3px rgba(0,0,0,0.1);
   }

   .confidence-bar {
     background: #e5e7eb;
     border-radius: 0.25rem;
     overflow: hidden;
     height: 1.5rem;
   }

   .confidence-fill {
     background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%);
     height: 100%;
     display: flex;
     align-items: center;
     justify-content: center;
     color: white;
     font-size: 0.75rem;
     font-weight: 600;
     transition: width 0.3s ease;
   }

   .expertise-heatmap {
     width: 100%;
     border-collapse: collapse;
   }

   .heat-cell {
     text-align: center;
     padding: 1rem;
     font-weight: 600;
   }

   .heat-cell.intensity-0 { background: #fee2e2; color: #991b1b; }
   .heat-cell.intensity-1 { background: #fed7aa; color: #9a3412; }
   .heat-cell.intensity-2 { background: #fef3c7; color: #78350f; }
   .heat-cell.intensity-3 { background: #d1fae5; color: #065f46; }
   .heat-cell.intensity-4 { background: #a7f3d0; color: #064e3b; }
   .heat-cell.intensity-5 { background: #6ee7b7; color: #064e3b; }
   ```

**Testing:**
- Test with no routing data
- Test charts render correctly
- Test responsive layout
- Test with large datasets (100+ decisions)
- Verify color coding is meaningful
- Test heatmap calculations
- Check performance
```

#### Files to Modify

- `dashboard/server/index.js` (analytics endpoints)
- `dashboard/public/moe-views.html` (new intelligence page)
- `dashboard/public/dashboard.js` (chart rendering)
- `dashboard/public/styles.css` (visualization styles)
- Add Chart.js library dependency

#### Acceptance Criteria

- [ ] Master distribution pie chart renders
- [ ] Task type bar chart renders
- [ ] Confidence distribution doughnut chart
- [ ] Recent routing decisions table
- [ ] Expertise heatmap with color intensity
- [ ] Responsive grid layout
- [ ] Data updates on page load
- [ ] Performance acceptable with large datasets

---

## Implementation Notes

### Priority Order

1. **Task 1** (Dashboard events) - Fixes crashes and enables admin page
2. **Task 3** (Task queue) - Critical visibility issue (62 hidden tasks)
3. **Task 2** (Git manager) - Important for deployment tracking
4. **Task 4** (Activity feed) - Depends on Task 1
5. **Task 5** (Real-time events) - Improves UX significantly
6. **Task 6** (Visual alerts) - Nice to have for monitoring
7. **Task 7** (MoE visualizations) - Enhancement feature

### Dependencies

- Task 4 depends on Task 1 (both require event parsing fixes)
- Task 5 complements Task 4 (both about events)
- Task 6 requires health monitoring API
- Task 7 is standalone

### Estimated Effort

- Task 1: 2-3 hours (backend + frontend + testing)
- Task 2: 1-2 hours (API endpoints + frontend)
- Task 3: 1-2 hours (frontend logic update)
- Task 4: 2-3 hours (API + component + styling)
- Task 5: 2-3 hours (buffer persistence + WebSocket)
- Task 6: 2-3 hours (alerts API + visual components)
- Task 7: 3-4 hours (analytics + charts + styling)

**Total**: 13-20 hours

### Testing Checklist

- [ ] Test with empty/missing data files
- [ ] Test with malformed JSON
- [ ] Test with large datasets (1000+ items)
- [ ] Test WebSocket reconnection
- [ ] Test across browsers (Chrome, Firefox, Safari)
- [ ] Test responsive layouts (mobile, tablet, desktop)
- [ ] Test error handling and recovery
- [ ] Test performance under load
- [ ] Test with rate limiting active

---

**Document Created**: November 9, 2025, 10:10 AM CST
**Tasks Cancelled**: task-1762553446 through task-1762553452
**Status**: Ready for manual implementation
**Author**: Claude Code (Sonnet 4.5)
