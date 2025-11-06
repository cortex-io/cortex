# Commit-Relay Dashboard Master Template

**Version:** 2.0
**Last Updated:** 2025-11-06
**Purpose:** Master reference for dashboard architecture, patterns, and troubleshooting

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [File Structure](#file-structure)
4. [Design System](#design-system)
5. [Navigation Structure](#navigation-structure)
6. [View Templates](#view-templates)
7. [Data Flow & API](#data-flow--api)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  index.html  │  │ dashboard-   │  │   Tailwind   │      │
│  │  (Alpine.js) │  │   v2.js      │  │     CSS      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                  Express Server (Node.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  REST APIs   │  │  WebSocket   │  │ File System  │      │
│  │  Endpoints   │  │   Server     │  │   Readers    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕ File I/O
┌─────────────────────────────────────────────────────────────┐
│              Coordination File System                        │
│  • task-queue.json          • worker-specs/*.json           │
│  • dashboard-events.jsonl   • masters/*/knowledge-base/     │
│  • health-alerts.json       • handoffs/*.json               │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Event-Driven Updates**: Real-time data via WebSocket + polling fallback
2. **Reactive UI**: Alpine.js for declarative reactive components
3. **Dark Mode First**: All components support light/dark themes
4. **Simple Templates**: Avoid complex nested Alpine.js templates
5. **Graceful Degradation**: Empty states for all data-driven views

---

## Technology Stack

### Frontend

- **Alpine.js 3.x**: Lightweight reactive framework
  - Uses `x-data`, `x-show`, `x-for`, `x-if`, `x-text`
  - Avoids nested templates that cause rendering issues

- **Tailwind CSS 3.x**: Utility-first CSS framework
  - Custom color palette (primary: blue)
  - Dark mode via `dark:` prefix
  - Custom gradients for master agent badges

- **Lucide Icons**: Modern icon library
  - Loaded via CDN
  - Icons initialized with `lucide.createIcons()`

- **Mermaid.js**: Diagram rendering
  - Configured with transparent backgrounds
  - Manual initialization after content loads

### Backend

- **Express.js**: Web server framework
- **WebSocket (ws)**: Real-time communication
- **Node.js 24.x**: Runtime environment

### Data Format

- **JSON**: Configuration and task data
- **JSONL**: Event logs and knowledge bases

---

## File Structure

```
dashboard/
├── public/
│   ├── index.html              # Main SPA (2000+ lines)
│   ├── dashboard-v2.js         # Alpine.js state & logic
│   └── favicon.ico
├── server/
│   └── index.js                # Express server + WebSocket
├── node_modules/               # Dependencies
├── package.json                # Project configuration
├── package-lock.json
└── DASHBOARD_MASTER_TEMPLATE.md  # This file
```

---

## Design System

### Color Palette

```css
/* Primary Colors */
--primary-50:  rgb(239, 246, 255)
--primary-600: rgb(37, 99, 235)
--primary-700: rgb(29, 78, 216)

/* Semantic Colors */
--success:  green-600  /* Completed, healthy */
--info:     blue-600   /* Running, active */
--warning:  yellow-600 /* Pending, alerts */
--error:    red-600    /* Failed, critical */
```

### Dark Mode Strategy

```html
<!-- Always use dual classes for dark mode -->
<div class="bg-white dark:bg-gray-800">
<p class="text-gray-900 dark:text-white">
<div class="border-gray-200 dark:border-gray-700">
```

**Key Dark Mode Colors:**
- Backgrounds: `dark:bg-gray-800`, `dark:bg-gray-700`
- Text: `dark:text-white`, `dark:text-gray-300`
- Borders: `dark:border-gray-700`, `dark:border-gray-600`
- Cards: `dark:bg-gray-700` for readability

### Typography

```html
<!-- Headers -->
<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
<h3 class="text-lg font-semibold text-gray-900 dark:text-white">

<!-- Body Text -->
<p class="text-sm text-gray-600 dark:text-gray-400">
<p class="text-xs text-gray-500 dark:text-gray-500">
```

### Component Patterns

#### Card Component
```html
<div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Title</h3>
    <p class="text-sm text-gray-600 dark:text-gray-400">Content</p>
</div>
```

#### Status Badge
```html
<span class="px-2 py-1 text-xs font-medium rounded-full" :class="{
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400': status === 'completed',
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400': status === 'running',
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400': status === 'failed',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400': status === 'pending'
}" x-text="status"></span>
```

#### Empty State
```html
<div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-12">
    <div class="text-center">
        <div class="text-6xl mb-4">📥</div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Data</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Message here</p>
    </div>
</div>
```

---

## Navigation Structure

### Sidebar Navigation

```
Dashboard
  ├── Overview (overview)
  ├── Workforce (workers)
  └── Tasks (tasks)

Integrations
  └── API Explorer (api-explorer)

Logs
  ├── Activity (events)
  └── About (about)
```

### View ID Mapping

```javascript
{
    'overview': 'Dashboard',
    'workers': 'Workforce Stream',
    'tasks': 'Task Queue',
    'events': 'Activity Logs',
    'api-explorer': 'API Explorer',
    'metrics': 'Analytics',
    'about': 'About Commit-Relay'
}
```

### Adding a New View

1. Add navigation button in sidebar (around line 160):
```html
<button @click="switchView('new-view')" class="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors" :class="currentView === 'new-view' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'">
    <i data-lucide="icon-name" class="w-5 h-5"></i>
    <span :class="currentView === 'new-view' ? 'font-medium' : ''">New View</span>
</button>
```

2. Add title mapping in header (around line 199):
```javascript
'new-view': 'New View Title',
```

3. Add view content section (around line 870+):
```html
<div x-show="currentView === 'new-view'" x-transition>
    <!-- View content here -->
</div>
```

---

## View Templates

### Overview Page

**Purpose:** Main dashboard with health alerts and key metrics

**Key Features:**
- Health Alerts (dismissable, color-coded)
- 4 Metric Cards (tasks, workers, events, success rate)
- Recent Activity Feed
- Quick Actions

**Data Sources:**
- `/api/metrics`
- `/api/health-alerts`
- `events` array

### Workforce Stream

**Purpose:** Real-time worker and master activity feed

**Key Features:**
- Event-based feed (not workers table)
- Filters events containing 'worker' or 'master'
- Color-coded event icons
- Empty state when no events

**Data Source:**
```javascript
events.filter(e => e.type?.includes('worker') || e.type?.includes('master'))
```

**IMPORTANT:** Uses `events` array, NOT `workers` array (which was causing issues)

**Template Pattern:**
```html
<template x-for="(event, index) in events.filter(e => e.type?.includes('worker') || e.type?.includes('master')).slice(0, 50)" :key="'event-' + index">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <!-- Event icon -->
        <!-- Event details -->
        <!-- Timestamp -->
    </div>
</template>
```

### Task Queue

**Purpose:** Display all tasks with filtering and sorting

**Key Features:**
- Table view with status badges
- Git commit links
- Priority indicators
- Uses index-based keys (due to duplicate task IDs)

**CRITICAL:** Always use `(task, index)` with `:key="'task-' + index"` because task-queue.json has duplicate IDs

### Activity Logs

**Purpose:** System-wide event log with filtering

**Key Features:**
- Full event stream
- Type filtering
- Timestamp sorting
- JSON data display

### API Explorer

**Purpose:** Future API testing interface

**Current State:** Placeholder with feature preview cards

**Planned Features:**
- REST API Testing
- WebSocket Monitor
- API Documentation
- Request History
- Code Generation
- Environment Manager

### About Page

**Purpose:** System architecture and feature documentation

**Key Features:**
- System Architecture Mermaid diagram
- 4 Feature cards (Task Orchestration, Real-time Sync, Worker Pools, Health Monitoring)
- Mermaid configuration with transparent backgrounds

**Mermaid Config:**
```javascript
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    themeVariables: {
        background: 'transparent',
        mainBkg: 'transparent',
        secondBkg: 'transparent',
        tertiaryBkg: 'transparent'
    }
});
```

---

## Data Flow & API

### REST API Endpoints

```javascript
GET /api/metrics          // System metrics and statistics
GET /api/tasks            // Task queue data
GET /api/workers          // Worker pool data (not currently used in UI)
GET /api/events           // Event log data
GET /api/health-alerts    // System health alerts
POST /api/health-alerts/dismiss/:id  // Dismiss an alert
```

### WebSocket Events

```javascript
// Client receives:
{
    type: 'metrics_update' | 'event' | 'health_alert',
    data: { ... }
}

// Updates trigger reactive state changes in Alpine.js
```

### Data Refresh Strategy

1. **Initial Load**: Fetch all data via REST APIs
2. **WebSocket Updates**: Real-time updates pushed from server
3. **Polling Fallback**: 30-second interval if WebSocket disconnected
4. **Manual Refresh**: User-triggered via refresh button

### State Management (dashboard-v2.js)

```javascript
{
    // View State
    currentView: 'overview',

    // Connection State
    wsConnected: false,
    lastUpdate: '',

    // Data Arrays
    metrics: {},
    tasks: [],
    workers: [],
    events: [],
    healthAlerts: [],

    // Loading States
    loadingStates: {
        metrics: false,
        tasks: false,
        workers: false,
        events: false
    },

    // Methods
    switchView(view),
    fetchMetrics(),
    fetchTasks(),
    fetchEvents(),
    dismissAlert(id)
}
```

---

## Common Patterns

### Alpine.js Best Practices

#### ✅ DO: Use Simple Templates
```html
<template x-for="item in items" :key="item.id">
    <div x-text="item.name"></div>
</template>
```

#### ❌ DON'T: Nest Templates
```html
<!-- This causes "undefined is not an object" errors -->
<template x-for="item in items">
    <template x-if="item.visible">
        <div>Bad</div>
    </template>
</template>
```

#### ✅ DO: Use Index Keys for Duplicate IDs
```html
<template x-for="(task, index) in tasks" :key="'task-' + index">
```

#### ✅ DO: Use x-show for Empty States
```html
<div x-show="items.length === 0">No items</div>
<template x-for="item in items" :key="item.id">
    <div>{{ item }}</div>
</template>
```

### Handling Real-Time Updates

```javascript
// In dashboard-v2.js
this.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch(message.type) {
        case 'metrics_update':
            this.metrics = message.data;
            break;
        case 'event':
            this.events.unshift(message.data);
            break;
        case 'health_alert':
            this.healthAlerts.unshift(message.data);
            break;
    }

    this.lastUpdate = new Date().toLocaleTimeString();
};
```

### Error Handling Pattern

```javascript
async fetchData() {
    try {
        this.loadingStates.data = true;
        const res = await fetch('/api/data');
        const data = await res.json();
        this.data = data;
    } catch (error) {
        console.error('Error fetching data:', error);
        // UI continues to work with stale data
    } finally {
        this.loadingStates.data = false;
    }
}
```

---

## Troubleshooting Guide

### Issue: Alpine.js "undefined is not an object" Error

**Cause:** Nested templates or invalid template structures

**Solution:**
1. Remove nested `<tbody>` or `<template>` elements
2. Use `x-show` instead of nested `x-if`
3. Ensure unique `:key` attributes
4. Avoid `x-for` directly on `x-if` template root

**Example Fix:**
```html
<!-- Before (broken) -->
<tbody>
    <template x-for="item in items">
        <template x-if="item.visible">
            <tr>...</tr>
        </template>
    </template>
</tbody>

<!-- After (fixed) -->
<tbody>
    <template x-for="item in items" :key="item.id">
        <tr x-show="item.visible">...</tr>
    </template>
</tbody>
```

### Issue: Workers/Data Not Displaying

**Cause:** Using wrong data source (e.g., `workers` array instead of `events`)

**Solution:**
- Workforce Stream should use `events` array, not `workers`
- Filter events: `events.filter(e => e.type?.includes('worker'))`
- Verify API endpoint returns data: `curl http://localhost:3000/api/events`

### Issue: Dark Mode Text Not Readable

**Cause:** Missing `dark:` classes or wrong background colors

**Solution:**
- Use `dark:bg-gray-700` for card backgrounds (not gray-900)
- Always pair text colors: `text-gray-900 dark:text-white`
- Test in both light and dark modes

### Issue: Mermaid Diagram Not Visible in Dark Mode

**Cause:** Opaque backgrounds or incorrect theme

**Solution:**
1. Add CSS for transparent backgrounds:
```css
.mermaid svg {
    background-color: transparent !important;
}
```

2. Initialize with transparent theme:
```javascript
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    themeVariables: {
        background: 'transparent',
        mainBkg: 'transparent'
    }
});
```

3. Use lighter container background: `dark:bg-gray-600`

### Issue: WebSocket Connection Failing

**Symptoms:** Data not updating, "Disconnected" status

**Debug Steps:**
1. Check server is running: `lsof -i :3000`
2. Check WebSocket in browser console: `ws`
3. Verify WebSocket URL matches server
4. Check for CORS issues

**Solution:**
- Server must broadcast events to all connected clients
- Use polling fallback if WebSocket unavailable

### Issue: Health Alerts Not Dismissing

**Cause:** Missing API endpoint or incorrect alert ID

**Solution:**
1. Verify endpoint exists: `POST /api/health-alerts/dismiss/:id`
2. Check alert has valid `id` property
3. Ensure server updates `health-alerts.json`

---

## Future Enhancements

### Planned Features

1. **API Explorer** (High Priority)
   - Interactive REST API tester
   - WebSocket message monitor
   - Request/response history
   - Code generation

2. **Advanced Filtering**
   - Filter tasks by status, priority, type
   - Filter events by time range, type
   - Search functionality across all views

3. **Performance Metrics**
   - Worker performance charts
   - Task completion trends
   - Token usage analytics
   - Success rate over time

4. **Notification System**
   - Browser notifications for critical alerts
   - Sound alerts for failures
   - Email/webhook integrations

5. **User Preferences**
   - Customizable dashboard layout
   - Saved filters and views
   - Export data to CSV/JSON

### Extension Points

#### Adding New Health Alert Types

1. Update alert detection logic in server
2. Add alert type to `health-alerts.json`
3. UI automatically handles new alert types

#### Adding New Metric Cards

```html
<div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
    <div class="flex items-center justify-between mb-4">
        <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
            <i data-lucide="icon-name" class="w-6 h-6 text-purple-600 dark:text-purple-400"></i>
        </div>
        <span class="text-2xl font-bold text-gray-900 dark:text-white" x-text="metrics.newMetric || 0"></span>
    </div>
    <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">New Metric</h3>
</div>
```

#### Creating Custom Views

Follow the "Adding a New View" section in Navigation Structure.

---

## Development Workflow

### Local Development

```bash
# Start server
cd dashboard
npm start

# Server runs on http://localhost:3000
# WebSocket on ws://localhost:3000
```

### Making Changes

1. Edit `public/index.html` for UI changes
2. Edit `public/dashboard-v2.js` for logic changes
3. Edit `server/index.js` for API changes
4. Refresh browser to see changes (no build step required)

### Testing Dark Mode

```javascript
// Toggle in browser console
document.documentElement.classList.toggle('dark')
```

### Debugging Alpine.js

```javascript
// Access Alpine state in console
Alpine.store('dashboard')

// Or via element
$el.__x.$data
```

---

## Deployment Notes

### Production Checklist

- [ ] Remove console.log statements
- [ ] Minify CSS/JS (if implementing build step)
- [ ] Set appropriate CORS headers
- [ ] Use environment variables for configuration
- [ ] Implement proper error logging
- [ ] Add rate limiting to API endpoints
- [ ] Enable HTTPS for WebSocket (wss://)
- [ ] Set up monitoring/alerting

### Port Configuration

Default: `3000`

To change:
```javascript
// server/index.js
const PORT = process.env.PORT || 3000;
```

---

## Maintenance Guidelines

### Regular Tasks

1. **Weekly**: Review health alerts and address recurring issues
2. **Monthly**: Clean up old events in `dashboard-events.jsonl`
3. **Quarterly**: Review and update this template document

### Code Quality Standards

- Use consistent indentation (4 spaces)
- Always add `dark:` classes with light mode classes
- Comment complex Alpine.js logic
- Keep view templates under 200 lines
- Extract repeated patterns into reusable components

### Documentation Updates

When making significant changes:
1. Update this template document
2. Document new patterns in "Common Patterns"
3. Add troubleshooting entries if issues found
4. Update version number and date at top

---

## Quick Reference

### Color Classes
```
Backgrounds: bg-white, dark:bg-gray-800, dark:bg-gray-700
Text: text-gray-900, dark:text-white, dark:text-gray-300
Borders: border-gray-200, dark:border-gray-700
```

### Icon Names (Lucide)
```
overview: home
workers: cpu
tasks: list
events: scroll-text
api-explorer: code
metrics: bar-chart
about: info
```

### API Response Formats

**Metrics:**
```json
{
    "tasks": { "total": 10, "pending": 3, "completed": 7 },
    "workers": { "active": 5, "total": 8 },
    "events": { "total": 150 },
    "performance": { "success_rate": 0.85 }
}
```

**Events:**
```json
[
    {
        "id": "evt-123",
        "timestamp": "2025-11-06T10:00:00Z",
        "type": "worker_spawned",
        "data": {
            "worker_id": "dev-worker-ABC",
            "task_id": "task-456",
            "master": "development"
        }
    }
]
```

**Health Alerts:**
```json
[
    {
        "id": "alert-789",
        "severity": "warning",
        "type": "low_success_rate",
        "message": "Success rate below threshold",
        "metric_value": 0.65,
        "threshold": 0.75,
        "timestamp": "2025-11-06T10:00:00Z"
    }
]
```

---

## Support & Contacts

**Template Created By:** Commit-Relay Development Team
**Last Reviewed:** 2025-11-06
**Next Review Date:** 2026-02-06

For questions or issues with this template, refer to:
- Project README.md
- GitHub Issues
- Development team documentation

---

**END OF MASTER TEMPLATE**
