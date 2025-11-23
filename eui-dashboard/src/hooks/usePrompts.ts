import { useState, useEffect, useCallback, useMemo } from 'react'

const API_BASE = '/api'

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

interface PromptVersion {
  version: string
  file_path: string
  created_at: string
  active: boolean
  changelog: string
}

interface PromptMetrics {
  total_uses: number
  avg_confidence: number
  accuracy: number
  avg_latency_ms: number
  last_used: string
}

export interface PromptSummary {
  id: string
  name: string
  description: string
  category: string
  current_version: string | null
  version_count: number
  metrics: PromptMetrics
  tags: string[]
}

export interface PromptDetail {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  current_version: string | null
  version_count: number
  metrics: PromptMetrics
  content: string | null
  active_version: PromptVersion | null
}

export interface PromptCategory {
  id: string
  name: string
  color: string
}

interface PromptsListResponse {
  prompts: PromptSummary[]
  categories: PromptCategory[]
  total: number
}

interface VersionsResponse {
  prompt_id: string
  prompt_name: string
  versions: PromptVersion[]
  total: number
}

interface TimeSeriesDataPoint {
  timestamp: string
  uses: number
  avg_confidence: string
  avg_latency_ms: number
}

interface VersionMetric {
  version: string
  active: boolean
  created_at: string
  uses: number
  accuracy: string
}

interface Recommendation {
  type: 'success' | 'info' | 'warning' | 'danger'
  message: string
}

export interface PromptMetricsDetail {
  prompt_id: string
  prompt_name: string
  summary: PromptMetrics
  time_series: TimeSeriesDataPoint[]
  by_version: VersionMetric[]
  recommendations: Recommendation[]
}

interface PromptFilters {
  category?: string
  tag?: string
  search?: string
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options)
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

function buildQueryString(filters: PromptFilters): string {
  const params = new URLSearchParams()

  if (filters.category) params.append('category', filters.category)
  if (filters.tag) params.append('tag', filters.tag)
  if (filters.search) params.append('search', filters.search)

  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Hook to fetch list of prompts with filtering
 */
export function usePrompts(filters: PromptFilters = {}, refreshInterval?: number) {
  const [data, setData] = useState<PromptsListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(() => buildQueryString(filters), [
    filters.category,
    filters.tag,
    filters.search,
  ])

  const fetchData = useCallback(async () => {
    const result = await fetchApi<PromptsListResponse>(`/v1/prompts${queryString}`)
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
 * Hook to fetch a single prompt by ID
 */
export function usePrompt(id: string) {
  const [data, setData] = useState<PromptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }

    const result = await fetchApi<PromptDetail>(`/v1/prompts/${id}`)
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
 * Hook to fetch version history for a prompt
 */
export function usePromptVersions(id: string) {
  const [data, setData] = useState<VersionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }

    const result = await fetchApi<VersionsResponse>(`/v1/prompts/${id}/versions`)
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
 * Hook to fetch performance metrics for a prompt
 */
export function usePromptMetrics(id: string) {
  const [data, setData] = useState<PromptMetricsDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }

    const result = await fetchApi<PromptMetricsDetail>(`/v1/prompts/${id}/metrics`)
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
 * Function to activate a specific prompt version
 */
export async function activatePromptVersion(promptId: string, version: string): Promise<ApiResponse<any>> {
  return fetchApi(`/v1/prompts/${promptId}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version })
  })
}

// Direct API functions for use outside hooks
export const getPrompts = (filters: PromptFilters = {}) =>
  fetchApi<PromptsListResponse>(`/v1/prompts${buildQueryString(filters)}`)

export const getPrompt = (id: string) =>
  fetchApi<PromptDetail>(`/v1/prompts/${id}`)

export const getPromptVersions = (id: string) =>
  fetchApi<VersionsResponse>(`/v1/prompts/${id}/versions`)

export const getPromptMetrics = (id: string) =>
  fetchApi<PromptMetricsDetail>(`/v1/prompts/${id}/metrics`)
