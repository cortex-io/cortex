# MoE Intelligence API Endpoints

## Overview

The MoE (Mixture of Experts) Intelligence API provides real-time insights into the commit-relay routing system, worker pool management, and learning metrics. These endpoints expose KPIs used by the dashboard to visualize system intelligence.

---

## Endpoints

### 1. GET /api/moe/routing

**Description**: Get MoE routing decisions from coordinator logs

**Response**: JSON object with array of routing decisions

**Response Schema**:
```json
{
  "decisions": [
    {
      "task_id": "string",
      "timestamp": "ISO8601 datetime",
      "routing_strategy": "mixture_of_experts",
      "decision": {
        "primary_expert": "development|security|inventory",
        "primary_confidence": "number (0-1)",
        "strategy": "single_expert|parallel_experts|single_expert_low_confidence",
        "parallel_experts": "array",
        "scores": {
          "development": "number (0-1)",
          "security": "number (0-1)",
          "inventory": "number (0-1)"
        }
      },
      "enriched_metadata": {
        "logged_by": "string",
        "logged_at": "ISO8601 datetime"
      }
    }
  ]
}
```

**Example Request**:
```bash
curl http://localhost:3000/api/moe/routing
```

**Example Response**:
```json
{
  "decisions": [
    {
      "task_id": "task-1762553431",
      "timestamp": "2025-11-08T08:29:07-0600",
      "routing_strategy": "mixture_of_experts",
      "decision": {
        "primary_expert": "development",
        "primary_confidence": 0.95,
        "strategy": "single_expert",
        "parallel_experts": [],
        "scores": {
          "development": 0.95,
          "security": 0,
          "inventory": 0
        }
      }
    }
  ]
}
```

**Usage**:
- Dashboard MoE Intelligence panel
- Routing confidence analysis
- Expert distribution metrics
- Routing strategy analytics

**Data Source**: `coordination/masters/coordinator/logs/routing-decisions.jsonl`

**Notes**:
- Returns last 100 routing decisions (most recent first)
- Supports multi-line JSON parsing via jq

---

### 2. GET /api/moe/pool

**Description**: Get MoE worker pool state and metrics

**Response**: JSON object with pool metrics and MoE analogy

**Response Schema**:
```json
{
  "active_workers": "number",
  "max_capacity": "number",
  "activation_rate": "number (percentage)",
  "target_workers": "number",
  "utilization": "number (percentage)",
  "moe_analogy": {
    "total_params": "string",
    "active_params": "string",
    "activation_percentage": "string"
  }
}
```

**Example Request**:
```bash
curl http://localhost:3000/api/moe/pool
```

**Example Response**:
```json
{
  "active_workers": 17,
  "max_capacity": 64,
  "activation_rate": 14,
  "target_workers": 8,
  "utilization": 26,
  "moe_analogy": {
    "total_params": "64 workers (like 7B params)",
    "active_params": "17 workers (like 1.85B params)",
    "activation_percentage": "14%"
  }
}
```

**Usage**:
- Worker pool utilization monitoring
- Sparse activation rate tracking
- MoE parameter analogy visualization

**Data Source**: `coordination/memory/working/pool-state.json`

**Notes**:
- Real-time pool metrics
- MoE analogy compares to neural network parameters

---

### 3. GET /api/moe/learning

**Description**: Get MoE learning system metrics and insights

**Response**: JSON object with learning metrics and insights

**Response Schema**:
```json
{
  "metrics": {
    "total_tasks": "number",
    "success_rate": "number (percentage)",
    "avg_time": "number (minutes)",
    "learned_keywords": "number",
    "experts": {
      "development": {
        "tasks": "number",
        "success_rate": "number (percentage)",
        "avg_time": "number (minutes)"
      },
      "security": { /* same structure */ },
      "inventory": { /* same structure */ }
    }
  },
  "insights": [
    {
      "id": "string",
      "message": "string",
      "timestamp": "ISO8601 datetime"
    }
  ]
}
```

**Example Request**:
```bash
curl http://localhost:3000/api/moe/learning
```

**Example Response**:
```json
{
  "metrics": {
    "total_tasks": 15,
    "success_rate": 100,
    "avg_time": 12.5,
    "learned_keywords": 47,
    "experts": {
      "development": {
        "tasks": 12,
        "success_rate": 100,
        "avg_time": 10.2
      },
      "security": {
        "tasks": 3,
        "success_rate": 100,
        "avg_time": 18.5
      },
      "inventory": {
        "tasks": 0,
        "success_rate": 0,
        "avg_time": 0
      }
    }
  },
  "insights": [
    {
      "id": "insight-1",
      "message": "System has learned 47 keywords from 15 tasks",
      "timestamp": "2025-11-08T09:30:00Z"
    }
  ]
}
```

**Usage**:
- Learning system performance tracking
- Expert-specific success rates
- Keyword learning progress
- System insights and recommendations

**Data Sources**:
- `coordination/memory/long-term/success-metrics.json`
- `coordination/memory/long-term/task-patterns.json`

**Notes**:
- Tracks system learning over time
- Per-expert performance breakdown

---

## Integration

### Dashboard Integration

All three MoE endpoints are integrated into the commit-relay dashboard:

**Location**: `dashboard/public/dashboard-v2.js`

**Fetch Function**: `fetchMoEData()` (line 2656)

**Called During**: Initial page load via `fetchInitialData()` (line 568)

**Data Bindings**:
- `moeRoutingDecisions` → MoE Intelligence panel
- `moePoolMetrics` → Worker pool state panel
- `moeLearningMetrics` → Learning metrics panel

### Client Code Examples

**Python**:
```python
import requests

# Fetch MoE routing decisions
response = requests.get('http://localhost:3000/api/moe/routing')
decisions = response.json()['decisions']

# Fetch pool metrics
response = requests.get('http://localhost:3000/api/moe/pool')
pool = response.json()
print(f"Active workers: {pool['active_workers']}/{pool['max_capacity']}")

# Fetch learning metrics
response = requests.get('http://localhost:3000/api/moe/learning')
metrics = response.json()['metrics']
print(f"Success rate: {metrics['success_rate']}%")
```

**JavaScript**:
```javascript
// Fetch all MoE data
const routing = await fetch('/api/moe/routing').then(r => r.json());
const pool = await fetch('/api/moe/pool').then(r => r.json());
const learning = await fetch('/api/moe/learning').then(r => r.json());

console.log(`Routing decisions: ${routing.decisions.length}`);
console.log(`Active workers: ${pool.active_workers}`);
console.log(`Learned keywords: ${learning.metrics.learned_keywords}`);
```

**cURL**:
```bash
# Test all MoE endpoints
curl http://localhost:3000/api/moe/routing | jq '.decisions | length'
curl http://localhost:3000/api/moe/pool | jq '.active_workers'
curl http://localhost:3000/api/moe/learning | jq '.metrics.success_rate'
```

---

## Error Handling

All endpoints return standard error responses:

**Success**: `200 OK` with JSON data

**Error**: `500 Internal Server Error` with error details
```json
{
  "error": "Failed to fetch [routing decisions|pool state|learning metrics]",
  "details": "Error message"
}
```

**File Not Found**: Returns empty/default data
- `/api/moe/routing`: `{ "decisions": [] }`
- `/api/moe/pool`: Default pool metrics with zeros
- `/api/moe/learning`: Default metrics structure

---

## Performance

- **Response Time**: < 50ms (typical)
- **Data Volume**:
  - Routing: ~50KB for 100 decisions
  - Pool: ~500 bytes
  - Learning: ~1KB
- **Caching**: File-based, reads from coordination files
- **Rate Limiting**: None (local API)

---

## Version History

- **v5.0.1** (2025-11-08): Added MoE Intelligence endpoints
- **v5.0.0** (2025-11-07): Initial Hybrid RAG+CAG implementation

---

## Related Documentation

- [API Explorer Documentation](./API_EXPLORER_README.md)
- [Dashboard Documentation](../docs/dashboard-critical-investigation.md)
- [MoE Architecture](../docs/moe-architecture.md)
