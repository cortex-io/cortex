/**
 * Unit tests for formatting utilities
 * Tests all formatting functions in src/components/common/formatters.ts
 */

import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatPercentage,
  formatNumber,
  formatCompactNumber,
  formatBytes,
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  getStatusColor,
  formatTrend,
  truncateText,
  capitalize,
  formatAgentId,
} from '../components/common/formatters'

describe('formatDuration', () => {
  it('formats milliseconds correctly', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(100)).toBe('100ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds correctly', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(59999)).toBe('60.0s')
  })

  it('formats minutes correctly', () => {
    expect(formatDuration(60000)).toBe('1.0m')
    expect(formatDuration(90000)).toBe('1.5m')
    expect(formatDuration(3599999)).toBe('60.0m')
  })

  it('formats hours correctly', () => {
    expect(formatDuration(3600000)).toBe('1.0h')
    expect(formatDuration(5400000)).toBe('1.5h')
    expect(formatDuration(7200000)).toBe('2.0h')
  })

  it('handles negative values', () => {
    expect(formatDuration(-100)).toBe('0ms')
  })
})

describe('formatPercentage', () => {
  it('formats with default decimals', () => {
    expect(formatPercentage(50)).toBe('50.0%')
    expect(formatPercentage(99.9)).toBe('99.9%')
    expect(formatPercentage(0)).toBe('0.0%')
  })

  it('formats with custom decimals', () => {
    expect(formatPercentage(50.555, 2)).toBe('50.56%')
    expect(formatPercentage(33.3333, 0)).toBe('33%')
  })
})

describe('formatNumber', () => {
  it('formats numbers with locale separators', () => {
    expect(formatNumber(1000)).toContain('1')
    expect(formatNumber(1000000)).toContain('1')
  })

  it('handles edge cases', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-1000)).toContain('1')
  })
})

describe('formatCompactNumber', () => {
  it('formats small numbers as-is', () => {
    expect(formatCompactNumber(0)).toBe('0')
    expect(formatCompactNumber(100)).toBe('100')
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCompactNumber(1000)).toBe('1.0K')
    expect(formatCompactNumber(1500)).toBe('1.5K')
    expect(formatCompactNumber(999999)).toBe('1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatCompactNumber(1000000)).toBe('1.0M')
    expect(formatCompactNumber(2500000)).toBe('2.5M')
  })
})

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(100)).toBe('100.0 B')
    expect(formatBytes(1023)).toBe('1023.0 B')
  })

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })

  it('formats terabytes correctly', () => {
    expect(formatBytes(1099511627776)).toBe('1.0 TB')
  })
})

describe('formatDate functions', () => {
  const testDate = new Date('2025-01-15T10:30:00Z')

  it('formatDateTime returns localized string', () => {
    const result = formatDateTime(testDate)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('formatDate returns date string', () => {
    const result = formatDate(testDate)
    expect(typeof result).toBe('string')
  })

  it('formatTime returns time string', () => {
    const result = formatTime(testDate)
    expect(typeof result).toBe('string')
  })

  it('handles string input', () => {
    const result = formatDateTime('2025-01-15T10:30:00Z')
    expect(typeof result).toBe('string')
  })

  it('handles timestamp input', () => {
    const result = formatDateTime(1705314600000)
    expect(typeof result).toBe('string')
  })
})

describe('formatRelativeTime', () => {
  it('returns "just now" for recent times', () => {
    const now = new Date()
    const result = formatRelativeTime(now)
    expect(result).toBe('just now')
  })

  it('returns minutes for times within an hour', () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
    const result = formatRelativeTime(thirtyMinutesAgo)
    expect(result).toBe('30m ago')
  })

  it('returns hours for times within a day', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const result = formatRelativeTime(twoHoursAgo)
    expect(result).toBe('2h ago')
  })

  it('returns days for older times', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const result = formatRelativeTime(threeDaysAgo)
    expect(result).toBe('3d ago')
  })
})

describe('getStatusColor', () => {
  it('returns success for positive statuses', () => {
    expect(getStatusColor('active')).toBe('success')
    expect(getStatusColor('running')).toBe('success')
    expect(getStatusColor('healthy')).toBe('success')
    expect(getStatusColor('completed')).toBe('success')
    expect(getStatusColor('success')).toBe('success')
    expect(getStatusColor('online')).toBe('success')
  })

  it('returns warning for pending statuses', () => {
    expect(getStatusColor('pending')).toBe('warning')
    expect(getStatusColor('queued')).toBe('warning')
    expect(getStatusColor('waiting')).toBe('warning')
    expect(getStatusColor('degraded')).toBe('warning')
    expect(getStatusColor('warning')).toBe('warning')
  })

  it('returns danger for error statuses', () => {
    expect(getStatusColor('failed')).toBe('danger')
    expect(getStatusColor('error')).toBe('danger')
    expect(getStatusColor('offline')).toBe('danger')
    expect(getStatusColor('unhealthy')).toBe('danger')
    expect(getStatusColor('critical')).toBe('danger')
  })

  it('returns default for neutral statuses', () => {
    expect(getStatusColor('idle')).toBe('default')
    expect(getStatusColor('paused')).toBe('default')
    expect(getStatusColor('stopped')).toBe('default')
  })

  it('returns primary for unknown statuses', () => {
    expect(getStatusColor('unknown')).toBe('primary')
    expect(getStatusColor('custom')).toBe('primary')
  })

  it('is case insensitive', () => {
    expect(getStatusColor('ACTIVE')).toBe('success')
    expect(getStatusColor('Pending')).toBe('warning')
    expect(getStatusColor('ERROR')).toBe('danger')
  })
})

describe('formatTrend', () => {
  it('returns N/A when previous is zero', () => {
    const result = formatTrend(100, 0)
    expect(result.value).toBe('N/A')
    expect(result.direction).toBe('flat')
    expect(result.color).toBe('subdued')
  })

  it('returns flat for minimal change', () => {
    const result = formatTrend(100, 100)
    expect(result.value).toBe('0%')
    expect(result.direction).toBe('flat')
    expect(result.color).toBe('subdued')
  })

  it('returns up for positive change', () => {
    const result = formatTrend(110, 100)
    expect(result.value).toBe('+10.0%')
    expect(result.direction).toBe('up')
    expect(result.color).toBe('success')
  })

  it('returns down for negative change', () => {
    const result = formatTrend(90, 100)
    expect(result.value).toBe('-10.0%')
    expect(result.direction).toBe('down')
    expect(result.color).toBe('danger')
  })

  it('calculates percentage correctly', () => {
    const result = formatTrend(150, 100)
    expect(result.value).toBe('+50.0%')
  })
})

describe('truncateText', () => {
  it('returns original text if shorter than max', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('returns original text if equal to max', () => {
    expect(truncateText('hello', 5)).toBe('hello')
  })

  it('truncates with ellipsis if longer than max', () => {
    expect(truncateText('hello world', 5)).toBe('hello...')
  })
})

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('lowercases rest of string', () => {
    expect(capitalize('HELLO')).toBe('Hello')
    expect(capitalize('hELLO')).toBe('Hello')
  })

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  it('handles empty string', () => {
    expect(capitalize('')).toBe('')
  })
})

describe('formatAgentId', () => {
  it('returns short IDs as-is', () => {
    expect(formatAgentId('abc')).toBe('abc')
    expect(formatAgentId('12345678')).toBe('12345678')
  })

  it('truncates long IDs with ellipsis', () => {
    expect(formatAgentId('abcdefghijk')).toBe('abcd...hijk')
    expect(formatAgentId('123456789012')).toBe('1234...9012')
  })
})
