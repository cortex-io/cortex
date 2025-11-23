import { useState, useEffect, useCallback } from 'react'
import * as api from '../services/dashboardApi'

// Types for workflow data
export interface WorkflowStep {
  id: string
  name: string
  master: string
  action: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  dependencies: string[]
  inputs?: Record<string, any>
  outputs?: Record<string, any>
  error?: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
}

export interface Workflow {
  name: string
  description: string
  version: string
  steps: WorkflowStep[]
  created_at: string
  updated_at: string
}

export interface WorkflowExecution {
  id: string
  workflow_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  steps: WorkflowStep[]
  started_at: string
  completed_at?: string
  duration_ms?: number
  trigger: string
  triggered_by?: string
  context?: Record<string, any>
  error?: string
}

export interface WorkflowsResponse {
  workflows: Workflow[]
  total: number
}

export interface WorkflowExecutionsResponse {
  executions: WorkflowExecution[]
  total: number
}

// Generic data fetching hook
function useWorkflowData<T>(
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

// Hook to get all workflows
export function useWorkflows(refreshInterval = 30000) {
  return useWorkflowData<WorkflowsResponse>(
    () => api.getWorkflows(),
    refreshInterval
  )
}

// Hook to get a single workflow by name
export function useWorkflow(name: string, refreshInterval = 30000) {
  return useWorkflowData<Workflow>(
    () => api.getWorkflow(name),
    refreshInterval
  )
}

// Hook to get workflow execution details
export function useWorkflowExecution(id: string, refreshInterval = 5000) {
  return useWorkflowData<WorkflowExecution>(
    () => api.getWorkflowExecution(id),
    refreshInterval
  )
}

// Hook to get execution history for a workflow
export function useWorkflowExecutions(
  workflowName?: string,
  limit = 50,
  refreshInterval = 10000
) {
  return useWorkflowData<WorkflowExecutionsResponse>(
    () => api.getWorkflowExecutions(workflowName, limit),
    refreshInterval
  )
}

// Hook to trigger a workflow execution
export function useWorkflowTrigger() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trigger = useCallback(async (
    workflowName: string,
    context?: Record<string, any>
  ) => {
    setLoading(true)
    setError(null)

    const result = await api.triggerWorkflow(workflowName, context)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return null
    }

    return result.data as WorkflowExecution
  }, [])

  return { trigger, loading, error }
}

// Hook to cancel a workflow execution
export function useWorkflowCancel() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = useCallback(async (executionId: string) => {
    setLoading(true)
    setError(null)

    const result = await api.cancelWorkflowExecution(executionId)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return false
    }

    return true
  }, [])

  return { cancel, loading, error }
}
