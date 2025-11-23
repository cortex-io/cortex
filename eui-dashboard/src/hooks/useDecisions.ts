import { useState, useEffect, useCallback, useMemo } from 'react'

const API_BASE = '/api'

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

interface DecisionFilters {
  master?: string
  task_type?: string
  start_date?: string
  end_date?: string
  min_confidence?: number
  max_confidence?: number
  strategy?: string
  limit?: number
  offset?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

interface Decision {
  id: string
  task_id: string
  timestamp: string
  master: string
  confidence: number
  strategy: string
  reasoning: string
}

interface DecisionListResponse {
  decisions: Decision[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

interface DecisionDetail {
  id: string
  task_id: string
  timestamp: string
  routing_strategy: string
  selected_master: {
    name: string
    confidence: number
    strategy: string
  }
  reasoning: string
  alternatives: Array<{
    expert: string
    confidence: number
    difference: number
  }>
  matched_keywords: Array<{
    keyword: string
    category: string
  }>
  parallel_experts: string[]
  rule_used: string | null
  all_scores: Record<string, number>
  raw_decision: any
}

interface DecisionStats {
  summary: {
    total_decisions: number
    avg_confidence: number
    high_confidence_rate: number
  }
  by_master: Array<{
    name: string
    count: number
    avg_confidence: number
    high_confidence_rate: number
    high_confidence_count: number
  }>
  by_strategy: Array<{
    name: string
    count: number
  }>
  confidence_distribution: {
    low: number
    medium: number
    high: number
    very_high: number
  }
  recent_activity: {
    last_hour: number
    last_day: number
    last_week: number
  }
  generated_at: string
}

async function fetchApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const result = await response.json()
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return { data: result.data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

function buildQueryString(filters: DecisionFilters): string {
  const params = new URLSearchParams()

  if (filters.master) params.append('master', filters.master)
  if (filters.task_type) params.append('task_type', filters.task_type)
  if (filters.start_date) params.append('start_date', filters.start_date)
  if (filters.end_date) params.append('end_date', filters.end_date)
  if (filters.min_confidence !== undefined) params.append('min_confidence', String(filters.min_confidence))
  if (filters.max_confidence !== undefined) params.append('max_confidence', String(filters.max_confidence))
  if (filters.strategy) params.append('strategy', filters.strategy)
  if (filters.limit !== undefined) params.append('limit', String(filters.limit))
  if (filters.offset !== undefined) params.append('offset', String(filters.offset))
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)

  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Hook to fetch list of decisions with filtering
 */
export function useDecisions(filters: DecisionFilters = {}, refreshInterval?: number) {
  const [data, setData] = useState<DecisionListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(() => buildQueryString(filters), [
    filters.master,
    filters.task_type,
    filters.start_date,
    filters.end_date,
    filters.min_confidence,
    filters.max_confidence,
    filters.strategy,
    filters.limit,
    filters.offset,
    filters.sort_by,
    filters.sort_order,
  ])

  const fetchData = useCallback(async () => {
    const result = await fetchApi<DecisionListResponse>(`/decisions${queryString}`)
    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
    }
    setLoading(false)
  }, [queryString])

  useEffect(() => {
    setLoading(true)
    fetchData()

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, refreshInterval])

  return { data, loading, error, refetch: fetchData }
}

/**
 * Hook to fetch a single decision by ID
 */
export function useDecision(id: string) {
  const [data, setData] = useState<DecisionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }

    const result = await fetchApi<DecisionDetail>(`/decisions/${id}`)
    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

/**
 * Hook to fetch decision statistics
 */
export function useDecisionStats(refreshInterval: number = 30000) {
  const [data, setData] = useState<DecisionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const result = await fetchApi<DecisionStats>('/decisions/stats')
    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, refreshInterval])

  return { data, loading, error, refetch: fetchData }
}

// API functions for direct use
export const getDecisions = (filters: DecisionFilters = {}) =>
  fetchApi<DecisionListResponse>(`/decisions${buildQueryString(filters)}`)

export const getDecision = (id: string) =>
  fetchApi<DecisionDetail>(`/decisions/${id}`)

export const getDecisionStats = () =>
  fetchApi<DecisionStats>('/decisions/stats')
