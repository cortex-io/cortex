/**
 * Time Range hook for managing dashboard time controls
 * Integrates with EuiSuperDatePicker
 */

import { useState, useCallback } from 'react'
import { OnTimeChangeProps, OnRefreshProps } from '@elastic/eui'

interface UseTimeRangeOptions {
  defaultStart?: string
  defaultEnd?: string
  defaultRefreshInterval?: number
  onTimeChange?: (start: string, end: string) => void
}

interface UseTimeRangeReturn {
  start: string
  end: string
  isPaused: boolean
  refreshInterval: number
  isLoading: boolean
  setStart: (start: string) => void
  setEnd: (end: string) => void
  setIsPaused: (paused: boolean) => void
  setRefreshInterval: (interval: number) => void
  setIsLoading: (loading: boolean) => void
  onTimeChange: (props: OnTimeChangeProps) => void
  onRefresh: (props: OnRefreshProps) => void
  onRefreshChange: (props: { isPaused: boolean; refreshInterval: number }) => void
}

export const useTimeRange = (options: UseTimeRangeOptions = {}): UseTimeRangeReturn => {
  const {
    defaultStart = 'now-24h',
    defaultEnd = 'now',
    defaultRefreshInterval = 30000,
    onTimeChange: onTimeChangeCallback,
  } = options

  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [isPaused, setIsPaused] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(defaultRefreshInterval)
  const [isLoading, setIsLoading] = useState(false)

  const onTimeChange = useCallback(
    ({ start, end }: OnTimeChangeProps) => {
      setStart(start)
      setEnd(end)
      onTimeChangeCallback?.(start, end)
    },
    [onTimeChangeCallback]
  )

  const onRefresh = useCallback(
    ({ start, end }: OnRefreshProps) => {
      setStart(start)
      setEnd(end)
      onTimeChangeCallback?.(start, end)
    },
    [onTimeChangeCallback]
  )

  const onRefreshChange = useCallback(
    ({ isPaused, refreshInterval }: { isPaused: boolean; refreshInterval: number }) => {
      setIsPaused(isPaused)
      setRefreshInterval(refreshInterval)
    },
    []
  )

  return {
    start,
    end,
    isPaused,
    refreshInterval,
    isLoading,
    setStart,
    setEnd,
    setIsPaused,
    setRefreshInterval,
    setIsLoading,
    onTimeChange,
    onRefresh,
    onRefreshChange,
  }
}

export default useTimeRange
