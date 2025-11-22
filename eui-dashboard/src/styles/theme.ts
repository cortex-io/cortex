/**
 * Theme configuration following Elastic best practices
 * Uses EUI color palette exclusively for consistency
 */

import { EuiThemeComputed } from '@elastic/eui'

// Semantic colors for dashboard status indicators
export const statusColors = {
  success: '#00BFB3',
  warning: '#FEC514',
  danger: '#BD271E',
  primary: '#006BB4',
  accent: '#DD0A73',
  subdued: '#98A2B3',
} as const

// EUI chart color palette (euiColorVis0-9)
export const chartColors = [
  '#54B399', // vis0 - green
  '#6092C0', // vis1 - blue
  '#D36086', // vis2 - pink
  '#9170B8', // vis3 - purple
  '#CA8EAE', // vis4 - light pink
  '#D6BF57', // vis5 - yellow
  '#B9A888', // vis6 - tan
  '#DA8B45', // vis7 - orange
  '#AA6556', // vis8 - brown
  '#E7664C', // vis9 - coral
] as const

// Responsive breakpoints (matching EUI)
export const breakpoints = {
  xs: 0,
  s: 575,
  m: 768,
  l: 992,
  xl: 1200,
} as const

// Dashboard-specific spacing
export const dashboardSpacing = {
  panelGutter: 'l',
  sectionGutter: 'xl',
  cardPadding: 'm',
} as const

// Time range presets for SuperDatePicker
export const timeRangePresets = [
  { start: 'now-15m', end: 'now', label: 'Last 15 minutes' },
  { start: 'now-1h', end: 'now', label: 'Last 1 hour' },
  { start: 'now-24h', end: 'now', label: 'Last 24 hours' },
  { start: 'now-7d', end: 'now', label: 'Last 7 days' },
  { start: 'now-30d', end: 'now', label: 'Last 30 days' },
] as const

// Auto-refresh intervals (in milliseconds)
export const refreshIntervals = [
  { value: 0, label: 'Off' },
  { value: 5000, label: '5 seconds' },
  { value: 10000, label: '10 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
  { value: 300000, label: '5 minutes' },
] as const

// Get theme-aware chart settings
export const getChartTheme = (_euiTheme: EuiThemeComputed, colorMode: 'light' | 'dark') => ({
  background: {
    color: colorMode === 'dark' ? '#1D1E24' : '#FFFFFF',
  },
  chartMargins: {
    left: 0,
    right: 0,
    top: 10,
    bottom: 0,
  },
  lineSeriesStyle: {
    line: {
      strokeWidth: 2,
    },
    point: {
      visible: false,
    },
  },
  areaSeriesStyle: {
    area: {
      opacity: 0.3,
    },
    line: {
      strokeWidth: 2,
    },
  },
  barSeriesStyle: {
    rect: {
      opacity: 0.8,
    },
    rectBorder: {
      visible: false,
    },
  },
  axes: {
    axisLine: {
      stroke: colorMode === 'dark' ? '#343741' : '#D3DAE6',
    },
    tickLine: {
      stroke: colorMode === 'dark' ? '#343741' : '#D3DAE6',
      size: 5,
    },
    tickLabel: {
      fill: colorMode === 'dark' ? '#98A2B3' : '#69707D',
      fontSize: 10,
    },
    axisTitle: {
      fill: colorMode === 'dark' ? '#DFE5EF' : '#343741',
      fontSize: 11,
    },
    gridLine: {
      horizontal: {
        stroke: colorMode === 'dark' ? '#343741' : '#EEF1F5',
      },
      vertical: {
        stroke: colorMode === 'dark' ? '#343741' : '#EEF1F5',
      },
    },
  },
})
