# Commit-Relay Dashboard

Real-time metrics and monitoring dashboard for the commit-relay master-worker system.

## Features

- **Real-time Updates**: WebSocket connection for live metrics
- **Worker Monitoring**: Track active, completed, and failed workers
- **Token Budget**: Visualize token usage across masters and workers
- **Task Queue**: Monitor task progress and status
- **Master Agents**: View individual master agent statistics
- **Auto-refresh**: Dashboard updates automatically when coordination files change

## Quick Start

### Installation

```bash
cd dashboard
npm install
```

### Start Dashboard

```bash
npm start
```

The dashboard will be available at **http://localhost:3000**

### Development Mode

For auto-reload during development:

```bash
npm run dev
```

## Usage

### Automatic Prompt

When you use commit-relay tools (e.g., `spawn-worker.sh`), you'll automatically be prompted to open the dashboard.

### Manual Control

```bash
# Start dashboard
./scripts/dashboard-prompt.sh start

# Stop dashboard
./scripts/dashboard-prompt.sh stop

# Check status
./scripts/dashboard-prompt.sh status

# Open in browser
./scripts/dashboard-prompt.sh open
```

### Skip Dashboard Prompt

To skip the automatic dashboard prompt:

```bash
SKIP_DASHBOARD_PROMPT=1 ./scripts/spawn-worker.sh [options]
```

## Dashboard Components

### Overview Stats
- **Active Workers**: Currently running workers
- **Success Rate**: Percentage of successfully completed workers
- **Tasks In Progress**: Currently executing tasks
- **Token Budget Used**: Percentage of daily budget consumed

### Token Budget Chart
Doughnut chart showing:
- Master agents usage (Coordinator, Security, Development)
- Workers allocated tokens
- Available budget
- Emergency reserve

### Worker Status Chart
Pie chart showing:
- Active workers (orange)
- Completed workers (green)
- Failed workers (red)

### Master Agents
Individual cards for each master showing:
- Allocated token budget
- Tokens used
- Worker pool budget
- Usage progress bar

### Task Queue
Overview of task status:
- Pending tasks
- In-progress tasks
- Completed tasks
- Recent task list with details

## API Endpoints

The dashboard server provides REST API endpoints:

### Health Check
```
GET /api/health
```
Returns server health status

### Metrics
```
GET /api/metrics
```
Returns calculated system metrics

### Raw Coordination Data
```
GET /api/coordination/raw
```
Returns raw coordination files data (for debugging)

### Workers
```
GET /api/workers
```
Returns worker pool information

### Tasks
```
GET /api/tasks
```
Returns task queue information

## WebSocket Events

### Connection
```javascript
ws://localhost:3000
```

### Message Types

**Initial Data**:
```json
{
  "type": "initial",
  "data": { /* metrics */ }
}
```

**Real-time Updates**:
```json
{
  "type": "update",
  "data": { /* metrics */ },
  "timestamp": "2025-11-01T20:00:00Z"
}
```

## Configuration

### Port

Change the dashboard port via environment variable:

```bash
DASHBOARD_PORT=8080 npm start
```

### Coordination Files

The dashboard reads from:
- `coordination/worker-pool.json`
- `coordination/token-budget.json`
- `coordination/task-queue.json`
- `coordination/handoffs.json`
- `coordination/status.json`

## File Structure

```
dashboard/
├── package.json           # Dependencies
├── server/
│   └── index.js          # Backend server (Express + WebSocket)
├── public/
│   ├── index.html        # Dashboard UI
│   ├── styles.css        # Styling
│   └── dashboard.js      # Frontend logic
└── README.md             # This file
```

## Architecture

### Backend (server/index.js)
- **Express server**: Serves static files and API endpoints
- **WebSocket server**: Real-time updates via ws library
- **File watcher**: Monitors coordination files with chokidar
- **Data aggregation**: Calculates metrics from coordination files

### Frontend (public/)
- **HTML/CSS**: Responsive UI with dark theme
- **Chart.js**: Data visualization (doughnut and pie charts)
- **WebSocket client**: Real-time connection to backend
- **Polling fallback**: HTTP polling if WebSocket disconnected

## Metrics Calculation

### Workers
- **Active**: From `worker-pool.json` active_workers array
- **Completed**: From completed_workers array
- **Failed**: From failed_workers array
- **Success Rate**: (completed / total) * 100

### Tokens
- **Total Budget**: 200k daily (from token-budget.json)
- **Masters Used**: Sum of all master.used
- **Workers Allocated**: From worker_pool.allocated_to_workers
- **Available**: total - used - allocated
- **Usage %**: (used / total) * 100

### Tasks
- **Pending**: tasks with status === 'pending'
- **In Progress**: tasks with status === 'in-progress'
- **Completed**: tasks with status === 'completed'

## Troubleshooting

### Dashboard won't start

Check logs:
```bash
cat /tmp/commit-relay-dashboard.log
```

### Port already in use

Change port:
```bash
DASHBOARD_PORT=8080 npm start
```

### WebSocket connection fails

- Check firewall settings
- Ensure server is running
- Dashboard falls back to HTTP polling

### Metrics not updating

- Verify coordination files exist
- Check file permissions
- Ensure git commits are happening (file watcher triggers on changes)

## Development

### Dependencies

- **express**: Web server
- **ws**: WebSocket server
- **chokidar**: File watching
- **cors**: CORS middleware
- **chart.js**: Data visualization
- **nodemon**: Dev server with auto-reload

### Adding New Metrics

1. Update `calculateMetrics()` in `server/index.js`
2. Add corresponding UI elements in `public/index.html`
3. Update `updateDashboard()` in `public/dashboard.js`

## Performance

- **WebSocket**: Near-instant updates (<100ms)
- **File watching**: Debounced (500ms stability threshold)
- **HTTP fallback**: 5-second polling interval
- **Memory usage**: ~50MB typical
- **CPU usage**: <1% idle, <5% during updates

## Security

- **Local only**: Binds to localhost by default
- **No authentication**: Designed for local development use
- **Read-only**: Dashboard doesn't modify coordination files
- **CORS enabled**: Allows local development tools

## Future Enhancements

- Historical metrics tracking
- Worker timeline visualization
- Master agent activity logs
- Custom alerts and notifications
- Multi-repository view
- Export metrics to CSV/JSON
- Dark/light theme toggle
- Mobile responsive improvements

## License

MIT - Same as commit-relay project

---

**Built for commit-relay v2.0 Master-Worker Architecture**
