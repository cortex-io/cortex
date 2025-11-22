/**
 * Unit tests for useTimeRange hook
 * Tests time range management functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimeRange } from '../hooks/useTimeRange'

describe('useTimeRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('uses default values when no options provided', () => {
      const { result } = renderHook(() => useTimeRange())

      expect(result.current.start).toBe('now-24h')
      expect(result.current.end).toBe('now')
      expect(result.current.isPaused).toBe(false)
      expect(result.current.refreshInterval).toBe(30000)
      expect(result.current.isLoading).toBe(false)
    })

    it('uses custom default values when provided', () => {
      const { result } = renderHook(() =>
        useTimeRange({
          defaultStart: 'now-1h',
          defaultEnd: 'now-5m',
          defaultRefreshInterval: 60000,
        })
      )

      expect(result.current.start).toBe('now-1h')
      expect(result.current.end).toBe('now-5m')
      expect(result.current.refreshInterval).toBe(60000)
    })
  })

  describe('state setters', () => {
    it('setStart updates start time', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.setStart('now-7d')
      })

      expect(result.current.start).toBe('now-7d')
    })

    it('setEnd updates end time', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.setEnd('now-1h')
      })

      expect(result.current.end).toBe('now-1h')
    })

    it('setIsPaused updates pause state', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.setIsPaused(true)
      })

      expect(result.current.isPaused).toBe(true)

      act(() => {
        result.current.setIsPaused(false)
      })

      expect(result.current.isPaused).toBe(false)
    })

    it('setRefreshInterval updates interval', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.setRefreshInterval(10000)
      })

      expect(result.current.refreshInterval).toBe(10000)
    })

    it('setIsLoading updates loading state', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.setIsLoading(true)
      })

      expect(result.current.isLoading).toBe(true)

      act(() => {
        result.current.setIsLoading(false)
      })

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('onTimeChange handler', () => {
    it('updates start and end times', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.onTimeChange({
          start: 'now-30d',
          end: 'now',
          isInvalid: false,
          isQuickSelection: false,
        })
      })

      expect(result.current.start).toBe('now-30d')
      expect(result.current.end).toBe('now')
    })

    it('calls onTimeChange callback when provided', () => {
      const onTimeChangeCallback = vi.fn()
      const { result } = renderHook(() =>
        useTimeRange({ onTimeChange: onTimeChangeCallback })
      )

      act(() => {
        result.current.onTimeChange({
          start: 'now-7d',
          end: 'now',
          isInvalid: false,
          isQuickSelection: false,
        })
      })

      expect(onTimeChangeCallback).toHaveBeenCalledWith('now-7d', 'now')
    })
  })

  describe('onRefresh handler', () => {
    it('updates start and end times on refresh', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.onRefresh({
          start: 'now-15m',
          end: 'now',
        })
      })

      expect(result.current.start).toBe('now-15m')
      expect(result.current.end).toBe('now')
    })

    it('calls onTimeChange callback on refresh', () => {
      const onTimeChangeCallback = vi.fn()
      const { result } = renderHook(() =>
        useTimeRange({ onTimeChange: onTimeChangeCallback })
      )

      act(() => {
        result.current.onRefresh({
          start: 'now-1h',
          end: 'now',
        })
      })

      expect(onTimeChangeCallback).toHaveBeenCalledWith('now-1h', 'now')
    })
  })

  describe('onRefreshChange handler', () => {
    it('updates pause state and refresh interval', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.onRefreshChange({
          isPaused: true,
          refreshInterval: 5000,
        })
      })

      expect(result.current.isPaused).toBe(true)
      expect(result.current.refreshInterval).toBe(5000)
    })

    it('can toggle auto-refresh off', () => {
      const { result } = renderHook(() => useTimeRange())

      act(() => {
        result.current.onRefreshChange({
          isPaused: true,
          refreshInterval: 0,
        })
      })

      expect(result.current.isPaused).toBe(true)
      expect(result.current.refreshInterval).toBe(0)
    })

    it('can enable auto-refresh', () => {
      const { result } = renderHook(() => useTimeRange())

      // First pause it
      act(() => {
        result.current.onRefreshChange({
          isPaused: true,
          refreshInterval: 30000,
        })
      })

      // Then enable it
      act(() => {
        result.current.onRefreshChange({
          isPaused: false,
          refreshInterval: 30000,
        })
      })

      expect(result.current.isPaused).toBe(false)
      expect(result.current.refreshInterval).toBe(30000)
    })
  })

  describe('memoization', () => {
    it('maintains stable function references', () => {
      const { result, rerender } = renderHook(() => useTimeRange())

      const firstRender = {
        onTimeChange: result.current.onTimeChange,
        onRefresh: result.current.onRefresh,
        onRefreshChange: result.current.onRefreshChange,
      }

      rerender()

      expect(result.current.onTimeChange).toBe(firstRender.onTimeChange)
      expect(result.current.onRefresh).toBe(firstRender.onRefresh)
      expect(result.current.onRefreshChange).toBe(firstRender.onRefreshChange)
    })
  })
})
