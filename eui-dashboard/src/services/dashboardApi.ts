// Dashboard API Service
// Connects to commit-relay's existing API endpoints

const API_BASE = '/api'

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

async function fetchApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// Metrics endpoints
export const getMetrics = (period?: string) =>
  fetchApi<any>(`/metrics${period ? `?period=${period}` : ''}`)

export const getMetricsHistory = (range: string = '24h') =>
  fetchApi<any>(`/metrics/history?range=${range}`)

// Worker endpoints
export const getWorkers = () =>
  fetchApi<any>('/workers')

export const getWorkerPool = () =>
  fetchApi<any>('/workers')

// Task endpoints
export const getTasks = (status?: string) =>
  fetchApi<any>(`/tasks${status ? `?status=${status}` : ''}`)

// Event endpoints
export const getEvents = (limit: number = 50) =>
  fetchApi<any>(`/events?limit=${limit}`)

export const getActivityFeed = () =>
  fetchApi<any>('/activity-feed')

// MoE Intelligence
export const getMoEIntelligence = () =>
  fetchApi<any>('/moe-intelligence')

// MoE Learning
export const getMoELearning = () =>
  fetchApi<any>('/moe-learning')

// DDQD Testing
export const getDDQDTesting = () =>
  fetchApi<any>('/ddqd-testing')

// Health and Daemons
export const getHealth = () =>
  fetchApi<any>('/health')

export const getDaemonStatus = () =>
  fetchApi<any>('/daemons/all')

export const getHealthAlerts = () =>
  fetchApi<any>('/health-alerts')

// Governance
export const getGovernanceDashboard = () =>
  fetchApi<any>('/governance/dashboard')

export const getGovernanceMetrics = () =>
  fetchApi<any>('/governance/metrics')

export const getGovernanceTrends = () =>
  fetchApi<any>('/governance/trends')

// Execution Managers
export const getExecutionManagers = () =>
  fetchApi<any>('/execution-managers')

// Git Operations
export const getGitOperations = () =>
  fetchApi<any>('/git-operations')

export const getGitStatus = () =>
  fetchApi<any>('/git-status')

// Admin Control Operations

// Daemon Controls
export const controlDaemon = async (daemon: string, action: 'start' | 'stop' | 'restart'): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/${daemon}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const startDaemon = async (daemon: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/${daemon}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const stopDaemon = async (daemon: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/${daemon}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// Health Alert Actions
export const resolveAlert = async (alertId: string, note: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/health-alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_note: note })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const restartWorkerFromAlert = async (alertId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/health-alerts/${alertId}/restart-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const createRepairTask = async (alertId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/health-alerts/${alertId}/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const deleteAlert = async (alertId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/health-alerts/${alertId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// System Operations
export const purgeEventLog = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/event-log/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const clearRoutingDecisions = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/moe/clear-routing-decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const restartDashboardServer = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/dashboard-server/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restart' })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// DDQD Testing
export const runDDQDTest = async (config: {
  duration?: number
  maxWorkers?: number
  version?: string
  verbose?: boolean
}): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/ddqd/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration: config.duration || 300,
        maxWorkers: config.maxWorkers || 50,
        version: config.version || 'v5',
        verbose: config.verbose ?? true
      })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export const stopDDQDTest = async (testId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/ddqd/stop/${testId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// MoE Operations
export const activateMoELearning = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/moe/learning/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// Event Log Info
export const getEventLogInfo = () =>
  fetchApi<any>('/event-log/info')

// Terminal Settings
export const getTerminalSettings = () =>
  fetchApi<any>('/terminal-settings')

export const updateTerminalSettings = async (settings: {
  terminal_windows_enabled?: boolean
  headless_mode?: boolean
  auto_close_duration_minutes?: number
}): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/terminal-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// Git Info
export const getGitInfo = () =>
  fetchApi<any>('/git-info')
