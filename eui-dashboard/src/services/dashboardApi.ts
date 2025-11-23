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

// Log Streaming
export const getAvailableLogs = () =>
  fetchApi<any>('/logs/available')

export const getLogTail = (source: string, lines: number = 100) =>
  fetchApi<any>(`/logs/tail?source=${encodeURIComponent(source)}&lines=${lines}`)

// Optimizer endpoints
export const getOptimizerSchedulerStats = () =>
  fetchApi<any>('/optimizer/scheduler/stats')

export const getOptimizerSchedulerBalance = () =>
  fetchApi<any>('/optimizer/scheduler/balance')

export const getOptimizerTokenStats = () =>
  fetchApi<any>('/optimizer/tokens/stats')

export const getOptimizerTokenForecast = () =>
  fetchApi<any>('/optimizer/tokens/forecast')

export const getOptimizerPoolStats = () =>
  fetchApi<any>('/optimizer/pool/stats')

export const getOptimizerProfileStats = () =>
  fetchApi<any>('/optimizer/profile/stats')

export const getOptimizerBottlenecks = () =>
  fetchApi<any>('/optimizer/profile/bottlenecks')

export const getOptimizerRecommendations = () =>
  fetchApi<any>('/optimizer/profile/recommendations')

// User Management
export const getUsers = () =>
  fetchApi<any>('/users')

export const getUser = (id: string) =>
  fetchApi<any>(`/users/${id}`)

export const createUser = async (userData: any): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
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

export const updateUser = async (id: string, userData: any): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
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

export const deleteUser = async (id: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/users/${id}`, {
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

export const getUserStats = () =>
  fetchApi<any>('/users/stats')

// Agentstudio
export const getAgentstudioAgents = () =>
  fetchApi<any>('/agentstudio/agents')

export const getAgentstudioAgent = (id: string) =>
  fetchApi<any>(`/agentstudio/agents/${id}`)

export const getAgentstudioRegistrySummary = () =>
  fetchApi<any>('/agentstudio/registry/summary')

export const getAgentstudioTemplates = () =>
  fetchApi<any>('/agentstudio/templates')

// Advanced MoE
export const getMoEAccuracy = () =>
  fetchApi<any>('/moe/accuracy')

export const getMoEConfidenceDistribution = () =>
  fetchApi<any>('/moe/confidence-distribution')

export const getMoEPoolUtilization = () =>
  fetchApi<any>('/moe/pool-utilization')

// DDQD History and Scheduling
export const getDDQDHistory = () =>
  fetchApi<any>('/ddqd/history')

export const getDDQDSchedule = () =>
  fetchApi<any>('/ddqd/schedule')

export const scheduleDDQDTest = async (config: any): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/ddqd/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
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

// Streams
export const getStreams = () =>
  fetchApi<any>('/streams')

// Coordination Raw
export const getCoordinationRaw = () =>
  fetchApi<any>('/coordination/raw')

// Dashboard Analytics
export const getDashboardAnalyticsSummary = () =>
  fetchApi<any>('/dashboard/analytics/summary')

export const getDashboardAnalyticsTrends = () =>
  fetchApi<any>('/dashboard/analytics/trends')

// LLM Cost Analytics
export const getLLMCostsSummary = (start?: string, end?: string) => {
  const params = new URLSearchParams()
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  const query = params.toString()
  return fetchApi<any>(`/llm-costs/summary${query ? `?${query}` : ''}`)
}

export const getLLMCostsTrend = (start?: string, end?: string) => {
  const params = new URLSearchParams()
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  const query = params.toString()
  return fetchApi<any>(`/llm-costs/trend${query ? `?${query}` : ''}`)
}

export const getLLMCostsBreakdown = (start?: string, end?: string, master?: string, model?: string) => {
  const params = new URLSearchParams()
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  if (master) params.append('master', master)
  if (model) params.append('model', model)
  const query = params.toString()
  return fetchApi<any>(`/llm-costs/breakdown${query ? `?${query}` : ''}`)
}

export const getLLMCostsBudget = () =>
  fetchApi<any>('/llm-costs/budget')

// Workflow endpoints
export const getWorkflows = () =>
  fetchApi<any>('/v1/workflows')

export const getWorkflow = (name: string) =>
  fetchApi<any>(`/v1/workflows/${encodeURIComponent(name)}`)

export const getWorkflowExecution = (id: string) =>
  fetchApi<any>(`/v1/workflows/executions/${id}`)

export const getWorkflowExecutions = (workflowName?: string, limit: number = 50) => {
  const params = new URLSearchParams()
  if (workflowName) params.append('workflow', workflowName)
  params.append('limit', limit.toString())
  const query = params.toString()
  return fetchApi<any>(`/v1/workflows/executions${query ? `?${query}` : ''}`)
}

export const triggerWorkflow = async (
  workflowName: string,
  context?: Record<string, any>
): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/v1/workflows/${encodeURIComponent(workflowName)}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context })
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

export const cancelWorkflowExecution = async (executionId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/v1/workflows/executions/${executionId}/cancel`, {
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
