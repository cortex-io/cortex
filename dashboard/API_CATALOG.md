# Commit-Relay API Catalog

**Last Updated**: 2025-11-08
**Total Endpoints**: 30
**Base URL**: `http://localhost:3000`

---

## API Categories

### 1. MoE Intelligence (3 endpoints) ⭐ NEW

Mission-critical endpoints for Mixture of Experts routing and learning metrics.

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/moe/routing` | Get MoE routing decisions | Array of routing decisions (last 100) |
| GET | `/api/moe/pool` | Get worker pool state and metrics | Pool metrics with MoE analogy |
| GET | `/api/moe/learning` | Get learning system metrics | Learning metrics and insights |

**Documentation**: [MOE_API_DOCUMENTATION.md](./MOE_API_DOCUMENTATION.md)

---

### 2. Metrics & Health (3 endpoints)

| Method | Endpoint | Description | Params |
|--------|----------|-------------|--------|
| GET | `/api/health` | Health check endpoint | None |
| GET | `/api/metrics` | System metrics | `?period=current_run\|last_24h\|last_7d\|all_time` |
| GET | `/api/metrics/history` | Historical metrics data | `?range=24h` |

---

### 3. Workers & Tasks (5 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workers` | Get all active workers |
| GET | `/api/tasks` | Get all tasks |
| GET | `/api/execution-managers` | Get execution manager configurations |
| GET | `/api/streams` | Get workforce streams data |
| GET | `/api/coordination/raw` | Get raw coordination data for debugging |

---

### 4. Events & Logs (3 endpoints)

| Method | Endpoint | Description | Params |
|--------|----------|-------------|--------|
| GET | `/api/events` | Get system events log | `?limit=50` |
| GET | `/api/event-log/info` | Get event log file info | None |
| POST | `/api/event-log/purge` | Purge event log to archive | None |

---

### 5. Git Operations (2 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/git-operations` | Get git commit and push operations |
| GET | `/api/git-info` | Get last commit and sync information |

---

### 6. Daemon Status (6 endpoints) ⭐ UPDATED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/daemon/status` | Worker daemon status (PID, uptime) |
| GET | `/api/pm-daemon/status` | PM daemon status (PID, uptime) |
| GET | `/api/health-daemon/status` | Health monitor daemon status (NEW) |
| GET | `/api/metrics-daemon/status` | Metrics snapshot daemon status (NEW) |
| GET | `/api/dashboard-server/status` | Dashboard server status |
| GET | `/api/event-log/info` | Event log file information |

---

### 7. Health Alerts (5 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health-alerts` | Get all health alerts |
| POST | `/api/health-alerts/:id/resolve` | Resolve an alert |
| POST | `/api/health-alerts/:id/restart-worker` | Restart worker for alert |
| POST | `/api/health-alerts/:id/note` | Add note to alert |
| DELETE | `/api/health-alerts/:id` | Delete an alert |

---

### 8. Daemon Controls (6 endpoints) ⭐ UPDATED

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/api/daemon/control` | Start/stop worker daemon | `{ "action": "start\|stop" }` |
| POST | `/api/pm-daemon/control` | Start/stop PM daemon | `{ "action": "start\|stop" }` |
| POST | `/api/health-daemon/control` | Start/stop health monitor daemon (NEW) | `{ "action": "start\|stop" }` |
| POST | `/api/metrics-daemon/control` | Start/stop metrics snapshot daemon (NEW) | `{ "action": "start\|stop" }` |
| POST | `/api/dashboard-server/control` | Restart dashboard server | `{ "action": "restart" }` |

---

## Quick Reference

### Most Used Endpoints

```bash
# System health and metrics
curl http://localhost:3000/api/health
curl http://localhost:3000/api/metrics

# MoE Intelligence
curl http://localhost:3000/api/moe/routing | jq '.decisions | length'
curl http://localhost:3000/api/moe/pool | jq '.active_workers'
curl http://localhost:3000/api/moe/learning | jq '.metrics.success_rate'

# Workers and tasks
curl http://localhost:3000/api/workers
curl http://localhost:3000/api/tasks

# Events
curl http://localhost:3000/api/events?limit=10
```

### Testing All GET Endpoints

```bash
# Test all read-only endpoints
for endpoint in \
  /api/health \
  /api/metrics \
  /api/workers \
  /api/tasks \
  /api/events \
  /api/moe/routing \
  /api/moe/pool \
  /api/moe/learning \
  /api/daemon/status \
  /api/pm-daemon/status \
  /api/health-daemon/status \
  /api/metrics-daemon/status; do
  echo "Testing $endpoint..."
  curl -s "http://localhost:3000$endpoint" | jq 'keys' 2>/dev/null || echo "Failed"
done
```

---

## Version History

- **v5.0.1** (2025-11-08):
  - ✅ Added 3 MoE Intelligence endpoints
  - ✅ Added 2 new daemon status endpoints
  - ✅ Added 2 new daemon control endpoints
  - ✅ Total: 30 endpoints (was 22)

- **v5.0.0** (2025-11-07):
  - Initial Hybrid RAG+CAG implementation
  - 22 documented endpoints

---

## Documentation

- **API Explorer**: [API_EXPLORER_README.md](./API_EXPLORER_README.md)
- **MoE Intelligence**: [MOE_API_DOCUMENTATION.md](./MOE_API_DOCUMENTATION.md)
- **Implementation**: [dashboard/server/index.js](./server/index.js)

---

## Support

For issues or questions:
- Check endpoint implementation in `dashboard/server/index.js`
- Test endpoints using API Explorer: `http://localhost:3000/api-explorer`
- Review logs: `dashboard/server/logs/`
