/**
 * Type definitions index for commit-relay EUI Dashboard
 * Re-exports all types from dashboard.types.ts and adds additional definitions
 */

// Re-export all dashboard types
export * from './dashboard.types'

// Additional Governance Types
export interface GovernanceConfig {
  taskSizeLimit: number
  contextWindowLimit: number
  maxWorkersPerTask: number
  budgetThreshold: number
  alertsEnabled: boolean
}

export interface GovernanceMetrics {
  compliance_score: number
  violations_count: number
  tasks_reviewed: number
  auto_corrections: number
  trending: 'up' | 'down' | 'stable'
}

export interface GovernanceTrend {
  timestamp: string
  compliance_score: number
  violations: number
}

// Agent Registry Types
export interface AgentRegistryEntry {
  id: string
  name: string
  type: 'master' | 'worker' | 'coordinator'
  version: string
  capabilities: string[]
  status: 'active' | 'inactive' | 'deprecated'
  registeredAt: string
  lastActivity?: string
}

// MoE Intelligence Types
export interface MoERoutingIntelligence {
  agentRouting: Record<string, {
    primary_expertise: string[]
    confidence_factors: Record<string, number>
    success_rate: number
  }>
  recommendations: string[]
}

export interface MoELearningState {
  total_tasks_monitored: number
  total_tasks_completed: number
  total_tasks_killed: number
  last_updated: string
}

// Health Alert Types
export interface HealthAlert {
  id: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  source: string
  timestamp: string
  resolved: boolean
  resolvedAt?: string
}

// Daemon Status Types
export interface DaemonStatus {
  name: string
  status: 'running' | 'stopped' | 'error'
  pid?: number
  uptime?: number
  memory?: number
  cpu?: number
  lastRestart?: string
}

// DDQD Testing Types
export interface DDQDTestResult {
  id: string
  testType: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  timestamp: string
  details?: Record<string, unknown>
}

export interface DDQDSchedule {
  enabled: boolean
  interval: number
  lastRun?: string
  nextRun?: string
  testTypes: string[]
}

// API Response Types
export interface ApiResponse<T> {
  data: T
  error?: string
  timestamp?: string
}

// Chart Data Types
export interface TimeSeriesDataPoint {
  timestamp: number | Date | string
  [key: string]: number | Date | string
}

export interface HistogramDataPoint {
  bin: string | number
  count: number
}

export interface TreemapDataPoint {
  category: string
  value: number
  children?: TreemapDataPoint[]
  color?: string
}

export interface BarChartDataPoint {
  category: string
  value: number
  [key: string]: string | number
}

// Theme Types
export type ThemeMode = 'light' | 'dark'

export interface TimeRangePreset {
  start: string
  end: string
  label: string
}

export interface RefreshInterval {
  value: number
  label: string
}

// Filter Context Types
export interface FilterContextType {
  filters: import('./dashboard.types').DashboardFilters
  setTimeRange: (start: string, end: string) => void
  setStatusFilter: (status: string[]) => void
  setMasterFilter: (masters: string[]) => void
  setSearch: (search: string) => void
  clearFilters: () => void
}

// Export/Share Types
export interface ExportOptions {
  format: 'csv' | 'json'
  includeTimestamp: boolean
  filename?: string
}

export interface ShareLinkOptions {
  includeFilters: boolean
  includeTimeRange: boolean
  expiresIn?: number // hours
}

// Component Props Types (common patterns)
export interface BaseChartProps {
  title: string
  loading?: boolean
  error?: string | null
  height?: number
  themeMode?: ThemeMode
  onElementClick?: (data: unknown) => void
}

export interface BasePanelProps {
  title: string
  loading?: boolean
  error?: string | null
  children?: React.ReactNode
}
