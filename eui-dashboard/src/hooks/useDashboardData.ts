import { useState, useEffect, useCallback } from 'react'
import * as api from '../services/dashboardApi'

export function useDashboardData<T>(
  fetcher: () => Promise<api.ApiResponse<T>>,
  refreshInterval?: number
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const result = await fetcher()
    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
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

export function useMetrics(refreshInterval = 30000) {
  return useDashboardData(() => api.getMetrics(), refreshInterval)
}

export function useMetricsHistory(range = '24h') {
  return useDashboardData(() => api.getMetricsHistory(range), 60000)
}

export function useWorkers(refreshInterval = 10000) {
  return useDashboardData(() => api.getWorkers(), refreshInterval)
}

export function useTasks(status?: string, refreshInterval = 10000) {
  return useDashboardData(() => api.getTasks(status), refreshInterval)
}

export function useEvents(limit = 50, refreshInterval = 5000) {
  return useDashboardData(() => api.getEvents(limit), refreshInterval)
}

export function useMoEIntelligence(refreshInterval = 30000) {
  return useDashboardData(() => api.getMoEIntelligence(), refreshInterval)
}

export function useMoELearning(refreshInterval = 30000) {
  return useDashboardData(() => api.getMoELearning(), refreshInterval)
}

export function useDDQDTesting(refreshInterval = 30000) {
  return useDashboardData(() => api.getDDQDTesting(), refreshInterval)
}

export function useHealthAlerts(refreshInterval = 15000) {
  return useDashboardData(() => api.getHealthAlerts(), refreshInterval)
}

export function useDaemonStatus(refreshInterval = 10000) {
  return useDashboardData(() => api.getDaemonStatus(), refreshInterval)
}

export function useGovernanceDashboard(refreshInterval = 30000) {
  return useDashboardData(() => api.getGovernanceDashboard(), refreshInterval)
}

export function useGovernanceMetrics(refreshInterval = 30000) {
  return useDashboardData(() => api.getGovernanceMetrics(), refreshInterval)
}

export function useGovernanceTrends(refreshInterval = 60000) {
  return useDashboardData(() => api.getGovernanceTrends(), refreshInterval)
}
