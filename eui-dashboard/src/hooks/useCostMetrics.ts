/**
 * LLM Cost Metrics Hook
 * Provides data fetching for cost analytics dashboard
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../services/dashboardApi'

export interface CostSummaryData {
  total_cost: number
  total_tokens: { input: number; output: number }
  task_count: number
  avg_cost_per_task: number
  avg_tokens_per_task: number
  by_master: Array<{
    name: string
    cost: number
    tokens: { input: number; output: number }
    tasks: number
  }>
  by_model: Array<{
    name: string
    cost: number
    tokens: { input: number; output: number }
    tasks: number
  }>
  by_day: Array<{
    date: string
    cost: number
    tokens: { input: number; output: number }
    tasks: number
  }>
}

export interface CostTrendData {
  trend: Array<{
    timestamp: number
    date: string
    cost: number
    tokens: number
    tasks: number
    cumulative_cost: number
    cumulative_tokens: number
  }>
  summary: {
    total_cost: number
    total_tokens: number
    total_days: number
    avg_daily_cost: number
  }
}

export interface CostBreakdownData {
  by_master: Array<{
    name: string
    cost: number
    percentage: number
    tokens: { input: number; output: number }
    tasks: number
    avg_cost_per_task: number
  }>
  by_model: Array<{
    name: string
    cost: number
    percentage: number
    tokens: { input: number; output: number }
    tasks: number
    pricing: { input: number; output: number }
  }>
}

export interface BudgetData {
  budget: {
    monthly_limit: number
    daily_limit: number
    alert_threshold_warning: number
    alert_threshold_critical: number
  }
  current: {
    monthly: {
      spent: number
      remaining: number
      percentage: number
      projected: number
    }
    daily: {
      spent: number
      remaining: number
      percentage: number
    }
  }
  alerts: Array<{
    level: 'warning' | 'critical'
    type: string
    message: string
    percentage: number
    spent: number
    limit: number
  }>
  period: {
    month: string
    month_start: string
    month_end: string
    days_remaining: number
  }
}

function useApiData<T>(
  fetcher: () => Promise<api.ApiResponse<{ data: T }>>,
  refreshInterval?: number
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const result = await fetcher()
    if (result.error) {
      setError(result.error)
      setData(null)
    } else if (result.data?.data) {
      setData(result.data.data)
      setError(null)
    } else {
      setData(null)
      setError('Invalid response format')
    }
    setLoading(false)
  }, [fetcher])

  useEffect(() => {
    fetchData()

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, refreshInterval])

  return { data, loading, error, refetch: fetchData }
}

export function useCostSummary(
  start?: string,
  end?: string,
  refreshInterval = 60000
) {
  const fetcher = useCallback(
    () => api.getLLMCostsSummary(start, end),
    [start, end]
  )
  return useApiData<CostSummaryData>(fetcher, refreshInterval)
}

export function useCostTrend(
  start?: string,
  end?: string,
  refreshInterval = 60000
) {
  const fetcher = useCallback(
    () => api.getLLMCostsTrend(start, end),
    [start, end]
  )
  return useApiData<CostTrendData>(fetcher, refreshInterval)
}

export function useCostBreakdown(
  start?: string,
  end?: string,
  master?: string,
  model?: string,
  refreshInterval = 60000
) {
  const fetcher = useCallback(
    () => api.getLLMCostsBreakdown(start, end, master, model),
    [start, end, master, model]
  )
  return useApiData<CostBreakdownData>(fetcher, refreshInterval)
}

export function useBudgetStatus(refreshInterval = 30000) {
  const fetcher = useCallback(() => api.getLLMCostsBudget(), [])
  return useApiData<BudgetData>(fetcher, refreshInterval)
}

/**
 * Combined hook for all cost metrics
 */
export function useCostMetrics(
  dateRange?: { start?: string; end?: string },
  refreshInterval = 60000
) {
  const summary = useCostSummary(
    dateRange?.start,
    dateRange?.end,
    refreshInterval
  )
  const trend = useCostTrend(
    dateRange?.start,
    dateRange?.end,
    refreshInterval
  )
  const breakdown = useCostBreakdown(
    dateRange?.start,
    dateRange?.end,
    undefined,
    undefined,
    refreshInterval
  )
  const budget = useBudgetStatus(refreshInterval)

  const loading = summary.loading || trend.loading || breakdown.loading || budget.loading
  const error = summary.error || trend.error || breakdown.error || budget.error

  const refetchAll = useCallback(() => {
    summary.refetch()
    trend.refetch()
    breakdown.refetch()
    budget.refetch()
  }, [summary, trend, breakdown, budget])

  return {
    summary: summary.data,
    trend: trend.data,
    breakdown: breakdown.data,
    budget: budget.data,
    loading,
    error,
    refetch: refetchAll
  }
}

export default useCostMetrics
