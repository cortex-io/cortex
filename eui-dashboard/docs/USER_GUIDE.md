# Commit-Relay Dashboard User Guide

## Table of Contents
1. [Dashboard Overview](#dashboard-overview)
2. [KPI Metrics Explained](#kpi-metrics-explained)
3. [Using Filters](#using-filters)
4. [Time Range Selection](#time-range-selection)
5. [Visualizations Guide](#visualizations-guide)
6. [Data Tables](#data-tables)
7. [Export Options](#export-options)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Troubleshooting](#troubleshooting)

---

## Dashboard Overview

The Commit-Relay Dashboard provides a comprehensive view of your automation system's performance. The dashboard follows Elastic's best practices for enterprise monitoring and is organized in a top-to-bottom visual hierarchy:

### Layout Structure

1. **Header Bar** - Navigation, time controls, and settings
2. **KPI Metrics Row** - Primary performance indicators
3. **Filter Bar** - Search and filtering controls
4. **Time Series Charts** - Trend visualizations
5. **Distribution Charts** - Treemap and histogram views
6. **Performance Charts** - Agent performance breakdown
7. **Integration Health** - External service status

### Navigation Tabs

- **Overview** - Main dashboard with all KPIs and charts
- **Executive** - Executive summary view
- **Workers** - Worker pool management
- **Tasks** - Task list and management
- **MoE Routing** - Mixture of Experts routing analytics
- **Analytics** - Detailed analytics and reporting

---

## KPI Metrics Explained

The top row displays five primary KPIs that provide at-a-glance system health:

### Active Agents

**What it shows**: Number of currently active agents in the system

**Color indicators**:
- **Blue (primary)**: Normal operation
- **Up arrow (green)**: More agents than previous period
- **Down arrow (red)**: Fewer agents than previous period

**Click action**: Opens agent details view

### Tasks Today

**What it shows**: Total number of tasks completed in the current day (UTC)

**How it's calculated**: Count of all tasks with status "completed" since midnight UTC

**Color indicators**:
- **Green (success)**: Normal operation
- **Trend arrows**: Comparison with previous day

**Click action**: Opens task list filtered to today

### Success Rate

**What it shows**: Percentage of tasks completed successfully

**How it's calculated**: 7-day rolling average of (completed tasks / total tasks) * 100

**Color indicators**:
- **Green**: >= 90% success rate
- **Yellow**: 70-89% success rate
- **Red**: < 70% success rate

**Click action**: Opens success rate breakdown

### Avg Duration

**What it shows**: Average time to complete a task

**How it's calculated**: Mean duration of all completed tasks in the selected time range

**Format**:
- Seconds: "45s"
- Minutes: "3m 20s"
- Hours: "1h 15m"

**Click action**: Opens duration analysis

### Integration Health

**What it shows**: Status of external integrations (GitHub, Slack)

**Status values**:
- **Healthy** (green): All integrations online
- **Degraded** (yellow): One or more integrations experiencing issues
- **Offline** (red): One or more integrations unreachable

**Click action**: Opens integration details with individual service status

---

## Using Filters

### Search Bar

Located below the KPI metrics, the search bar supports:

- **Free text search**: Type any text to search across agents, tasks, and logs
- **Field-based search**: Use `field:value` syntax
  - `agent:coordinator` - Filter by agent name
  - `status:completed` - Filter by status
  - `source:github` - Filter by task source

### Filter Buttons

**Status Filter**:
- Click the "Status" button to open the multi-select dropdown
- Available options: Active, Completed, Failed, Pending, Idle
- Multiple selections are supported
- Checkmark indicates selected filters

**Source Filter**:
- Click the "Source" button to open the multi-select dropdown
- Available options: GitHub, Slack, API, Manual
- Multiple selections are supported

### Clearing Filters

- Click "Clear filters" button to remove all active filters
- Or manually deselect individual filter options

### Filter Behavior

- Filters apply to ALL visualizations on the dashboard
- Time series charts filter by the selected criteria
- Tables show only matching rows
- Metrics update to reflect filtered data

---

## Time Range Selection

### Using the Date Picker

Located in the header (desktop) or navigation flyout (mobile):

1. Click the date picker to open
2. Select start and end times
3. Use quick select options for common ranges
4. Click "Apply" to update the dashboard

### Common Presets

- **Last 15 minutes**: Real-time monitoring
- **Last 1 hour**: Recent activity
- **Last 24 hours**: Daily overview (default)
- **Last 7 days**: Weekly trends
- **Last 30 days**: Monthly patterns

### Auto-Refresh

- Default refresh interval: 30 seconds
- Toggle auto-refresh with the refresh button
- Loading indicator shows when data is updating

### Custom Ranges

1. Click "Absolute" tab in the date picker
2. Select specific start date/time
3. Select specific end date/time
4. Click "Apply"

---

## Visualizations Guide

### Time Series Chart

**What it shows**: Agent task completion over time

**Features**:
- **Zoom**: Click and drag to zoom into a time range
- **Pan**: Use scroll wheel or pinch gesture
- **Tooltips**: Hover over data points for exact values
- **Legend**: Click series names to toggle visibility

**Series displayed**:
- Active Workers (blue line)
- Tasks In Progress (teal line)
- Completed Tasks (green line)

**Interactions**:
- Click-drag to zoom into a specific time period
- Double-click to reset zoom
- Hover for crosshair tooltips

### Treemap Chart

**What it shows**: Task distribution by source

**How to read it**:
- Box size = volume of tasks from that source
- Color = source category
- Labels show source name and count

**Click to drill down**: Click any section to filter the dashboard to that source

**Understanding proportions**:
- Larger boxes = more tasks
- Position has no significance

### Histogram Chart

**What it shows**: Distribution of MoE routing confidence scores

**How to read it**:
- X-axis: Confidence ranges (0-20%, 20-40%, etc.)
- Y-axis: Number of routing decisions in each range
- Taller bars = more decisions at that confidence level

**Interpreting results**:
- Peak at 80-100%: System is confident in most routing decisions
- Flat distribution: Routing decisions are more varied
- Peak at low end: May indicate need for better training data

**Click action**: Click bars to filter to tasks with that confidence range

### Bar Charts

**What it shows**: Agent performance breakdown by type

**Features**:
- Horizontal bars for long labels
- Sorted by value (highest to lowest)
- Limited to top 10 items

**Hover tooltips**: Show exact values and percentages

**Click action**: Click bars to filter dashboard to that agent type

---

## Data Tables

### Agent Table Features

**Columns**:
- Agent: Agent identifier (abbreviated)
- Type: Agent type (badge)
- Task: Task description
- Status: Current status (color-coded badge)
- Duration: Time taken
- Time: Relative time (e.g., "5 minutes ago")
- Source: Task source
- Actions: Context-specific actions

### Sorting

- Click column headers to sort
- Click again to reverse sort order
- Arrow indicator shows sort direction

### Searching

- Use the search box above the table
- Supports free text search across all columns
- Use field:value syntax for specific columns

### Pagination

- Default: 10 rows per page
- Options: 10, 25, 50 rows
- Navigate with Previous/Next buttons
- Jump to specific pages

### Row Actions

- **Retry** (failed tasks): Restart the task
- **Cancel** (active/pending tasks): Stop the task
- **Click row**: Open task details

### Exporting

- Click the export icon in the table header
- Downloads filtered/sorted data as CSV

---

## Export Options

### Export Formats

**CSV Export**:
- Exports table data in comma-separated format
- Includes all visible columns
- Respects current filters and sorting
- Compatible with Excel, Google Sheets

**JSON Export**:
- Exports complete dashboard data
- Includes all metrics and time series
- Useful for programmatic analysis
- Includes export timestamp

### How to Export

1. **Table data**: Click the export icon in any table header
2. **Full dashboard**: Click the export button in the header

### Share Links

Generate shareable links that preserve:
- Current time range
- Active filters
- Selected tab

To share: Click export button > Copy link

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `r` | Refresh dashboard data |
| `Shift + ?` | Show help modal |
| `Tab` | Navigate between elements |
| `Enter/Space` | Activate buttons |
| `Escape` | Close modals and flyouts |
| `Arrow keys` | Navigate within charts (when focused) |

### Accessibility

- All interactive elements are keyboard accessible
- Focus indicators are visible
- ARIA labels on all icons
- Logical tab order throughout

---

## Troubleshooting

### Common Issues

#### Dashboard shows "Error loading data"

**Causes**:
- API server not running
- Network connectivity issues
- Server timeout

**Solutions**:
1. Check if API server is running (`npm run start:api`)
2. Verify network connection
3. Click retry button or press `r` to refresh
4. Check browser console for detailed errors

#### Charts show "No data available"

**Causes**:
- Time range has no data
- Filters too restrictive
- API returning empty results

**Solutions**:
1. Expand time range (try "Last 7 days")
2. Clear all filters
3. Check if agents are running and producing data

#### Slow performance

**Causes**:
- Large time range with many data points
- Many concurrent visualizations
- Browser memory constraints

**Solutions**:
1. Reduce time range
2. Close unused browser tabs
3. Clear browser cache
4. Use smaller page sizes in tables

#### Integration shows "Offline"

**Causes**:
- GitHub/Slack API unavailable
- Rate limiting
- Invalid credentials

**Solutions**:
1. Check service status pages (status.github.com)
2. Verify API tokens are valid
3. Wait for rate limit reset
4. Check integration logs

#### Export not working

**Causes**:
- Browser blocking downloads
- File system permissions
- Empty data set

**Solutions**:
1. Check browser download settings
2. Try different browser
3. Ensure data exists before exporting

### Getting Help

1. **Check logs**: Browser console (F12) shows detailed errors
2. **API health**: Visit `/api/health` endpoint
3. **System status**: Check `coordination/health-alerts.json`

### Browser Requirements

- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance Tips

1. Use specific time ranges instead of "All time"
2. Apply filters to reduce data volume
3. Use pagination for large tables
4. Enable hardware acceleration in browser
5. Close unused tabs/applications

---

## Version Information

- Dashboard Version: 1.0.0
- Built with Elastic UI 96.0+
- Requires Node.js 18+
- API Server: commit-relay/api-server

---

For additional support, contact the commit-relay development team.
