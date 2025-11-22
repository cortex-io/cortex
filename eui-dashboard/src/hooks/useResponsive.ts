/**
 * Responsive breakpoint hook for dashboard layouts
 * Following EUI responsive patterns
 */

import { useState, useEffect } from 'react'
import { breakpoints } from '../styles/theme'

export type BreakpointKey = 'xs' | 's' | 'm' | 'l' | 'xl'

export const useResponsive = () => {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getCurrentBreakpoint = (): BreakpointKey => {
    if (windowWidth >= breakpoints.xl) return 'xl'
    if (windowWidth >= breakpoints.l) return 'l'
    if (windowWidth >= breakpoints.m) return 'm'
    if (windowWidth >= breakpoints.s) return 's'
    return 'xs'
  }

  const currentBreakpoint = getCurrentBreakpoint()

  return {
    windowWidth,
    currentBreakpoint,
    isMobile: currentBreakpoint === 'xs' || currentBreakpoint === 's',
    isTablet: currentBreakpoint === 'm',
    isDesktop: currentBreakpoint === 'l' || currentBreakpoint === 'xl',
    isLargeDesktop: currentBreakpoint === 'xl',

    // Get number of columns for grid layouts
    getColumns: (config: { xs?: number; s?: number; m?: number; l?: number; xl?: number }) => {
      return config[currentBreakpoint] ?? config.m ?? 2
    },

    // Get flex direction based on screen size
    getFlexDirection: (stackOnMobile: boolean = true): 'row' | 'column' => {
      if (stackOnMobile && (currentBreakpoint === 'xs' || currentBreakpoint === 's')) {
        return 'column'
      }
      return 'row'
    },

    // Check if current width matches a breakpoint
    matches: (breakpoint: BreakpointKey): boolean => {
      return windowWidth >= breakpoints[breakpoint]
    },
  }
}

export default useResponsive
