import { useState, useCallback, createContext, useContext } from 'react'
import { DashboardFilters } from '../types/dashboard.types'

const defaultFilters: DashboardFilters = {
  timeRange: {
    start: 'now-24h',
    end: 'now'
  },
  status: [],
  masters: [],
  workers: [],
  search: ''
}

interface FilterContextType {
  filters: DashboardFilters
  setTimeRange: (start: string, end: string) => void
  setStatusFilter: (status: string[]) => void
  setMasterFilter: (masters: string[]) => void
  setSearch: (search: string) => void
  clearFilters: () => void
}

export const FilterContext = createContext<FilterContextType | null>(null)

export function useFilters() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters)

  const setTimeRange = useCallback((start: string, end: string) => {
    setFilters(prev => ({
      ...prev,
      timeRange: { start, end }
    }))
  }, [])

  const setStatusFilter = useCallback((status: string[]) => {
    setFilters(prev => ({ ...prev, status }))
  }, [])

  const setMasterFilter = useCallback((masters: string[]) => {
    setFilters(prev => ({ ...prev, masters }))
  }, [])

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters)
  }, [])

  return {
    filters,
    setTimeRange,
    setStatusFilter,
    setMasterFilter,
    setSearch,
    clearFilters
  }
}

export function useFilterContext() {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error('useFilterContext must be used within FilterProvider')
  }
  return context
}
