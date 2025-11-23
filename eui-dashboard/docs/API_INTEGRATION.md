# API Integration Guide

This guide explains how to connect the EUI Dashboard to data sources and configure API endpoints.

## Table of Contents
1. [Overview](#overview)
2. [Expected API Endpoints](#expected-api-endpoints)
3. [Data Format Requirements](#data-format-requirements)
4. [Connecting to Real Data Sources](#connecting-to-real-data-sources)
5. [Mock Data for Development](#mock-data-for-development)
6. [Error Handling](#error-handling)
7. [Authentication](#authentication)
8. [Rate Limiting](#rate-limiting)

---

## Overview

The EUI Dashboard fetches data from a REST API server. By default, it expects the API to be available at the same origin (e.g., `http://localhost:5001`).

### Architecture

```
[Dashboard UI] ---> [API Server] ---> [Data Sources]
                                       - Coordination files
                                       - GitHub API
                                       - Slack API
                                       - Database (if configured)
```

### Default Configuration

- Base URL: Same origin as dashboard
- Endpoints prefix: `/api/`
- Response format: JSON
- Auto-refresh: 30 seconds

---

## Expected API Endpoints

### GET /api/health

Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-22T14:30:00Z",
  "services": {
    "api": "online",
    "coordination": "online",
    "github": "online",
    "slack": "online"
  }
}
```

### GET /api/metrics

Current system metrics for KPI display.

**Response**:
```json
{
  "workers": {
    "active": 5,
    "previousActive": 3,
    "completed": 42,
    "previousCompleted": 38,
    "successRate": 95.2,
    "previousSuccessRate": 93.1,
    "avgDuration": 1500,
    "previousAvgDuration": 1800
  },
  "tasks": {
    "total": 100,
    "inProgress": 8,
    "pending": 12,
    "completed": 75,
    "failed": 5
  },
  "integrations": {
    "github": {
      "status": "online",
      "latency": 45,
      "requests": 1234
    },
    "slack": {
      "status": "online",
      "latency": 32,
      "messages": 567
    }
  },
  "timestamp": "2025-11-22T14:30:00Z"
}
```

### GET /api/metrics/history

Historical metrics for time series charts.

**Query Parameters**:
- `range`: Time range (e.g., `1h`, `24h`, `7d`, `30d`)
- `start`: Start timestamp (ISO 8601)
- `end`: End timestamp (ISO 8601)
- `interval`: Data point interval (e.g., `1m`, `5m`, `1h`)

**Response**:
```json
{
  "snapshots": [
    {
      "timestamp": "2025-11-22T14:00:00Z",
      "workers": {
        "active": 4,
        "completed": 35
      },
      "tasks": {
        "inProgress": 6,
        "completed": 30
      }
    },
    {
      "timestamp": "2025-11-22T14:05:00Z",
      "workers": {
        "active": 5,
        "completed": 38
      },
      "tasks": {
        "inProgress": 8,
        "completed": 32
      }
    }
  ],
  "range": "24h",
  "interval": "5m",
  "totalPoints": 288
}
```

### GET /api/tasks

Task list with filtering and pagination.

**Query Parameters**:
- `page`: Page number (default: 0)
- `pageSize`: Items per page (default: 10)
- `sortField`: Field to sort by
- `sortDirection`: `asc` or `desc`
- `status`: Filter by status (comma-separated)
- `source`: Filter by source (comma-separated)
- `agent`: Filter by agent
- `search`: Full-text search

**Response**:
```json
{
  "tasks": [
    {
      "id": "task-001",
      "agent": "coordinator-master-abc123",
      "agentType": "coordinator",
      "task": "Process GitHub webhook",
      "status": "completed",
      "duration": 1500,
      "timestamp": "2025-11-22T14:25:00Z",
      "source": "github",
      "metadata": {
        "repo": "commit-relay",
        "event": "push"
      }
    }
  ],
  "total": 100,
  "page": 0,
  "pageSize": 10
}
```

### GET /api/agents

Agent list and status.

**Response**:
```json
{
  "agents": [
    {
      "id": "coordinator-master-abc123",
      "type": "coordinator",
      "status": "active",
      "uptime": 3600000,
      "tasksCompleted": 42,
      "successRate": 95.2,
      "lastActivity": "2025-11-22T14:28:00Z"
    }
  ],
  "total": 5
}
```

### GET /api/events

Event stream for recent activity.

**Query Parameters**:
- `limit`: Number of events (default: 50)
- `types`: Event types to include (comma-separated)

**Response**:
```json
{
  "events": [
    {
      "id": "evt-001",
      "type": "task_completed",
      "timestamp": "2025-11-22T14:28:00Z",
      "agent": "coordinator-master",
      "message": "Task completed successfully",
      "metadata": {
        "taskId": "task-001",
        "duration": 1500
      }
    }
  ]
}
```

### GET /api/routing/confidence

MoE routing confidence distribution.

**Response**:
```json
{
  "distribution": [
    { "bin": "0-20", "count": 5 },
    { "bin": "20-40", "count": 12 },
    { "bin": "40-60", "count": 28 },
    { "bin": "60-80", "count": 45 },
    { "bin": "80-100", "count": 65 }
  ],
  "average": 68.5,
  "median": 72.0,
  "total": 155
}
```

### POST /api/tasks/:id/retry

Retry a failed task.

**Response**:
```json
{
  "success": true,
  "taskId": "task-001",
  "newTaskId": "task-002",
  "message": "Task queued for retry"
}
```

### POST /api/tasks/:id/cancel

Cancel an active or pending task.

**Response**:
```json
{
  "success": true,
  "taskId": "task-001",
  "message": "Task cancelled"
}
```

---

## Data Format Requirements

### Timestamps

All timestamps should be ISO 8601 format:
```
2025-11-22T14:30:00Z
2025-11-22T14:30:00+00:00
2025-11-22T14:30:00.000Z
```

### Status Values

Valid status values for tasks:
- `active` - Currently being processed
- `completed` - Successfully finished
- `failed` - Ended with error
- `pending` - Waiting to be processed
- `idle` - Agent is idle

Valid status values for integrations:
- `online` - Fully operational
- `offline` - Not reachable
- `degraded` - Partial functionality

### Numbers

- Counts: Integers
- Percentages: Floats (0-100)
- Durations: Milliseconds (integers)
- Latencies: Milliseconds (integers)

### IDs

- Task IDs: String, unique
- Agent IDs: String, format `{type}-{role}-{uuid}`
- Event IDs: String, format `evt-{uuid}`

---

## Connecting to Real Data Sources

### Step 1: Configure API Base URL

Create or modify `/src/config/api.ts`:

```typescript
export const API_CONFIG = {
  baseUrl: process.env.VITE_API_URL || '',
  endpoints: {
    health: '/api/health',
    metrics: '/api/metrics',
    metricsHistory: '/api/metrics/history',
    tasks: '/api/tasks',
    agents: '/api/agents',
    events: '/api/events',
    routingConfidence: '/api/routing/confidence',
  },
  refreshInterval: 30000, // 30 seconds
}
```

### Step 2: Update Environment Variables

Create `.env.local`:

```env
VITE_API_URL=http://localhost:3001
```

### Step 3: Implement API Client

Create `/src/services/api.ts`:

```typescript
import { API_CONFIG } from '../config/api'

class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_CONFIG.baseUrl
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  }
}

export const apiClient = new ApiClient()
```

### Step 4: Create Data Hooks

Create `/src/hooks/useMetrics.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../services/api'
import { API_CONFIG } from '../config/api'

interface MetricsData {
  workers: {
    active: number
    completed: number
    successRate: number
    avgDuration: number
  }
}

export function useMetrics() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true)
      const metrics = await apiClient.get<MetricsData>(API_CONFIG.endpoints.metrics)
      setData(metrics)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, API_CONFIG.refreshInterval)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  return { data, loading, error, refresh: fetchMetrics }
}
```

### Step 5: Use in Components

```typescript
import { useMetrics } from '../hooks/useMetrics'

function DashboardLayout() {
  const { data, loading, error, refresh } = useMetrics()

  return (
    <MetricsRow
      data={data}
      loading={loading}
      error={error}
      onRefresh={refresh}
    />
  )
}
```

---

## Mock Data for Development

### Using Mock Service Worker (MSW)

Install MSW:
```bash
npm install msw --save-dev
```

Create `/src/mocks/handlers.ts`:

```typescript
import { rest } from 'msw'

export const handlers = [
  rest.get('/api/metrics', (req, res, ctx) => {
    return res(
      ctx.json({
        workers: {
          active: 5,
          previousActive: 3,
          completed: 42,
          previousCompleted: 38,
          successRate: 95.2,
          previousSuccessRate: 93.1,
          avgDuration: 1500,
          previousAvgDuration: 1800,
        },
        timestamp: new Date().toISOString(),
      })
    )
  }),

  rest.get('/api/metrics/history', (req, res, ctx) => {
    const snapshots = []
    const now = Date.now()

    for (let i = 24; i >= 0; i--) {
      snapshots.push({
        timestamp: new Date(now - i * 3600000).toISOString(),
        workers: {
          active: Math.floor(Math.random() * 10),
          completed: Math.floor(Math.random() * 50),
        },
        tasks: {
          inProgress: Math.floor(Math.random() * 20),
          completed: Math.floor(Math.random() * 100),
        },
      })
    }

    return res(ctx.json({ snapshots }))
  }),

  rest.get('/api/tasks', (req, res, ctx) => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i}`,
      agent: `agent-${Math.floor(Math.random() * 5)}`,
      agentType: ['coordinator', 'development', 'security'][Math.floor(Math.random() * 3)],
      task: `Sample task ${i}`,
      status: ['active', 'completed', 'failed', 'pending'][Math.floor(Math.random() * 4)],
      duration: Math.floor(Math.random() * 5000),
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      source: ['github', 'slack', 'api'][Math.floor(Math.random() * 3)],
    }))

    return res(ctx.json({ tasks, total: 100, page: 0, pageSize: 10 }))
  }),
]
```

Create `/src/mocks/browser.ts`:

```typescript
import { setupWorker } from 'msw'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
```

Initialize in `/src/main.tsx`:

```typescript
if (import.meta.env.DEV) {
  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
  })
}
```

### Using Static Mock Data

For simpler scenarios, use static JSON files:

```typescript
// src/mocks/data/metrics.json
{
  "workers": {
    "active": 5,
    "completed": 42,
    "successRate": 95.2,
    "avgDuration": 1500
  }
}
```

Load in development:

```typescript
const fetchMetrics = async () => {
  if (import.meta.env.DEV && !import.meta.env.VITE_USE_REAL_API) {
    const data = await import('../mocks/data/metrics.json')
    return data.default
  }

  return apiClient.get('/api/metrics')
}
```

---

## Error Handling

### API Error Responses

The API should return consistent error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task not found",
    "details": {
      "taskId": "task-999"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Dashboard Error Handling

```typescript
const fetchData = async () => {
  try {
    const data = await apiClient.get('/api/metrics')
    setData(data)
    setError(null)
  } catch (err) {
    if (err.message.includes('401')) {
      // Handle authentication error
      redirectToLogin()
    } else if (err.message.includes('429')) {
      // Handle rate limiting
      setError('Too many requests. Please wait and try again.')
    } else {
      setError(err.message || 'An error occurred')
    }
  }
}
```

---

## Authentication

### Bearer Token Authentication

If your API requires authentication:

```typescript
class ApiClient {
  private token: string | null = null

  setToken(token: string) {
    this.token = token
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
    })

    if (response.status === 401) {
      // Token expired or invalid
      this.token = null
      throw new Error('Authentication required')
    }

    return response.json()
  }
}
```

### Session-Based Authentication

For cookie-based sessions, include credentials:

```typescript
const response = await fetch(url, {
  method: 'GET',
  credentials: 'include', // Include cookies
  headers: {
    'Content-Type': 'application/json',
  },
})
```

---

## Rate Limiting

### Handling Rate Limits

```typescript
class ApiClient {
  private retryAfter: number = 0

  async get<T>(endpoint: string): Promise<T> {
    if (Date.now() < this.retryAfter) {
      throw new Error(`Rate limited. Try again in ${Math.ceil((this.retryAfter - Date.now()) / 1000)}s`)
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`)

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      this.retryAfter = Date.now() + (parseInt(retryAfter || '60') * 1000)
      throw new Error('Rate limited')
    }

    return response.json()
  }
}
```

### Exponential Backoff

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (err.message.includes('Rate limited') || err.message.includes('429')) {
        const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw err
      }
    }
  }

  throw lastError!
}
```

---

## Testing API Integration

### Unit Tests

```typescript
import { apiClient } from './api'

describe('ApiClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('fetches metrics successfully', async () => {
    const mockData = { workers: { active: 5 } }
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await apiClient.get('/api/metrics')
    expect(result).toEqual(mockData)
  })

  it('handles errors', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(apiClient.get('/api/metrics')).rejects.toThrow('API error: 500')
  })
})
```

### Integration Tests

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { server } from './mocks/server'
import { rest } from 'msw'
import Dashboard from './Dashboard'

describe('Dashboard API Integration', () => {
  it('displays metrics from API', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument() // Active agents
      expect(screen.getByText('Active Agents')).toBeInTheDocument()
    })
  })

  it('shows error state on API failure', async () => {
    server.use(
      rest.get('/api/metrics', (req, res, ctx) => {
        return res(ctx.status(500))
      })
    )

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
```

---

## Deployment Configuration

### Production Environment

```env
VITE_API_URL=https://api.your-domain.com
```

### Docker Compose

```yaml
services:
  dashboard:
    build: ./eui-dashboard
    ports:
      - "3000:80"
    environment:
      - VITE_API_URL=http://api:3001

  api:
    build: ./api-server
    ports:
      - "3001:3001"
    volumes:
      - ./coordination:/app/coordination
```

### Nginx Proxy

```nginx
server {
    listen 80;
    server_name dashboard.example.com;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api-server:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

For more information, see the [API Server documentation](../../api-server/README.md).
