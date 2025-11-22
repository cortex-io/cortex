/**
 * Unit tests for useResponsive hook
 * Tests responsive breakpoint detection and utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResponsive } from '../hooks/useResponsive'

// Mock window.innerWidth
const mockWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

describe('useResponsive', () => {
  const originalInnerWidth = window.innerWidth

  afterEach(() => {
    // Restore original window width
    mockWindowWidth(originalInnerWidth)
  })

  describe('breakpoint detection', () => {
    it('detects xs breakpoint (< 575px)', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('xs')
      expect(result.current.isMobile).toBe(true)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isDesktop).toBe(false)
      expect(result.current.isLargeDesktop).toBe(false)
    })

    it('detects s breakpoint (575-767px)', () => {
      mockWindowWidth(600)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('s')
      expect(result.current.isMobile).toBe(true)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isDesktop).toBe(false)
    })

    it('detects m breakpoint (768-991px)', () => {
      mockWindowWidth(800)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('m')
      expect(result.current.isMobile).toBe(false)
      expect(result.current.isTablet).toBe(true)
      expect(result.current.isDesktop).toBe(false)
    })

    it('detects l breakpoint (992-1199px)', () => {
      mockWindowWidth(1024)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('l')
      expect(result.current.isMobile).toBe(false)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isDesktop).toBe(true)
      expect(result.current.isLargeDesktop).toBe(false)
    })

    it('detects xl breakpoint (>= 1200px)', () => {
      mockWindowWidth(1920)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('xl')
      expect(result.current.isMobile).toBe(false)
      expect(result.current.isTablet).toBe(false)
      expect(result.current.isDesktop).toBe(true)
      expect(result.current.isLargeDesktop).toBe(true)
    })
  })

  describe('window resize handling', () => {
    it('updates breakpoint on resize', () => {
      mockWindowWidth(1920)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.currentBreakpoint).toBe('xl')

      // Simulate resize to mobile
      act(() => {
        mockWindowWidth(375)
        window.dispatchEvent(new Event('resize'))
      })

      expect(result.current.currentBreakpoint).toBe('xs')
      expect(result.current.isMobile).toBe(true)
    })

    it('cleans up resize listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      mockWindowWidth(1024)
      const { unmount } = renderHook(() => useResponsive())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      removeEventListenerSpy.mockRestore()
    })
  })

  describe('getColumns utility', () => {
    it('returns correct columns for current breakpoint', () => {
      mockWindowWidth(1920)
      const { result } = renderHook(() => useResponsive())

      const columns = result.current.getColumns({
        xs: 1,
        s: 2,
        m: 3,
        l: 4,
        xl: 6,
      })

      expect(columns).toBe(6)
    })

    it('falls back to m when breakpoint not specified', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      const columns = result.current.getColumns({
        m: 3,
        l: 4,
      })

      expect(columns).toBe(3)
    })

    it('returns default 2 when no config matches', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      const columns = result.current.getColumns({})

      expect(columns).toBe(2)
    })

    it('returns xs value on mobile', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      const columns = result.current.getColumns({
        xs: 1,
        s: 2,
        m: 3,
      })

      expect(columns).toBe(1)
    })
  })

  describe('getFlexDirection utility', () => {
    it('returns column on mobile when stackOnMobile is true', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.getFlexDirection(true)).toBe('column')
    })

    it('returns row on mobile when stackOnMobile is false', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.getFlexDirection(false)).toBe('row')
    })

    it('returns row on desktop regardless of stackOnMobile', () => {
      mockWindowWidth(1024)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.getFlexDirection(true)).toBe('row')
      expect(result.current.getFlexDirection(false)).toBe('row')
    })

    it('defaults to stacking on mobile', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.getFlexDirection()).toBe('column')
    })

    it('returns column on small screens (s breakpoint)', () => {
      mockWindowWidth(600)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.getFlexDirection(true)).toBe('column')
    })
  })

  describe('matches utility', () => {
    it('returns true when width matches or exceeds breakpoint', () => {
      mockWindowWidth(1024)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.matches('xs')).toBe(true)
      expect(result.current.matches('s')).toBe(true)
      expect(result.current.matches('m')).toBe(true)
      expect(result.current.matches('l')).toBe(true)
      expect(result.current.matches('xl')).toBe(false)
    })

    it('returns false when width is below breakpoint', () => {
      mockWindowWidth(375)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.matches('xs')).toBe(true)
      expect(result.current.matches('s')).toBe(false)
      expect(result.current.matches('m')).toBe(false)
      expect(result.current.matches('l')).toBe(false)
      expect(result.current.matches('xl')).toBe(false)
    })
  })

  describe('windowWidth property', () => {
    it('returns current window width', () => {
      mockWindowWidth(1366)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.windowWidth).toBe(1366)
    })

    it('updates windowWidth on resize', () => {
      mockWindowWidth(1920)
      const { result } = renderHook(() => useResponsive())

      expect(result.current.windowWidth).toBe(1920)

      act(() => {
        mockWindowWidth(768)
        window.dispatchEvent(new Event('resize'))
      })

      expect(result.current.windowWidth).toBe(768)
    })
  })
})
