const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3004'

class DashboardAPI {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`)
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }
    return response.json()
  }

  async post(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }
    return response.json()
  }

  // Worker Pool
  getWorkers() {
    return this.get('/api/workers')
  }

  // Token Budget
  getTokenBudget() {
    return this.get('/api/token-budget')
  }

  // Tasks
  getTasks() {
    return this.get('/api/tasks')
  }

  // Metrics
  getMetrics() {
    return this.get('/api/metrics')
  }

  // Health
  getHealth() {
    return this.get('/api/health')
  }

  // Logs (SSE)
  streamLogs(callback) {
    const eventSource = new EventSource(`${API_BASE}/api/logs/stream`)
    eventSource.onmessage = (event) => {
      callback(JSON.parse(event.data))
    }
    return eventSource
  }

  // MoE Analytics
  getMoEAccuracy() {
    return this.get('/api/moe/accuracy')
  }

  getMoEConfidenceDistribution() {
    return this.get('/api/moe/confidence-distribution')
  }

  getMoEPoolUtilization() {
    return this.get('/api/moe/pool-utilization')
  }

  // Optimizer
  getOptimizerStats() {
    return this.get('/api/optimizer/scheduler/stats')
  }

  getTokenForecast() {
    return this.get('/api/optimizer/tokens/forecast')
  }

  // Execution Managers
  getExecutionManagers() {
    return this.get('/api/execution-managers')
  }

  // Users (for demo)
  getUsers() {
    return this.get('/api/users')
  }

  createUser(user) {
    return this.post('/api/users', user)
  }

  // DDQD
  scheduleDDQD(config) {
    return this.post('/api/ddqd/schedule', config)
  }

  getDDQDHistory() {
    return this.get('/api/ddqd/history')
  }
}

export default new DashboardAPI()
