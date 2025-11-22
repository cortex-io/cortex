/**
 * Export and sharing utilities for the EUI Dashboard
 */

import { DashboardFilters } from '../types'

// Export to CSV
export function exportToCSV(data: any[], filename: string = 'export'): void {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Get headers from first object
  const headers = Object.keys(data[0])

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header]
        // Handle values with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value ?? ''
      }).join(',')
    )
  ].join('\n')

  // Create and download file
  downloadFile(csvContent, `${filename}_${getTimestamp()}.csv`, 'text/csv')
}

// Export to JSON
export function exportToJSON(data: any, filename: string = 'export'): void {
  const jsonContent = JSON.stringify(data, null, 2)
  downloadFile(jsonContent, `${filename}_${getTimestamp()}.json`, 'application/json')
}

// Helper to trigger file download
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Generate timestamp for filenames
function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// Share link generation
export interface ShareLinkParams {
  filters?: DashboardFilters
  tab?: string
  includeTimeRange?: boolean
}

export function generateShareLink(params: ShareLinkParams): string {
  const baseUrl = window.location.origin + window.location.pathname
  const urlParams = new URLSearchParams()

  if (params.tab) {
    urlParams.set('tab', params.tab)
  }

  if (params.filters) {
    if (params.includeTimeRange !== false && params.filters.timeRange) {
      urlParams.set('start', params.filters.timeRange.start)
      urlParams.set('end', params.filters.timeRange.end)
    }

    if (params.filters.status && params.filters.status.length > 0) {
      urlParams.set('status', params.filters.status.join(','))
    }

    if (params.filters.masters && params.filters.masters.length > 0) {
      urlParams.set('masters', params.filters.masters.join(','))
    }

    if (params.filters.search) {
      urlParams.set('search', params.filters.search)
    }
  }

  const queryString = urlParams.toString()
  return queryString ? `${baseUrl}?${queryString}` : baseUrl
}

// Parse share link back to filters
export function parseShareLink(search: string): ShareLinkParams {
  const params = new URLSearchParams(search)

  const result: ShareLinkParams = {}

  const tab = params.get('tab')
  if (tab) {
    result.tab = tab
  }

  const filters: DashboardFilters = {
    timeRange: {
      start: params.get('start') || 'now-24h',
      end: params.get('end') || 'now'
    }
  }

  const status = params.get('status')
  if (status) {
    filters.status = status.split(',')
  }

  const masters = params.get('masters')
  if (masters) {
    filters.masters = masters.split(',')
  }

  const searchParam = params.get('search')
  if (searchParam) {
    filters.search = searchParam
  }

  result.filters = filters
  result.includeTimeRange = !!(params.get('start') || params.get('end'))

  return result
}

// Copy to clipboard utility
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return true
    } catch {
      document.body.removeChild(textArea)
      return false
    }
  }
}

// Export metrics data with formatting
export function exportMetricsData(metrics: any, format: 'csv' | 'json' = 'csv'): void {
  if (format === 'json') {
    exportToJSON(metrics, 'dashboard_metrics')
  } else {
    // Flatten metrics for CSV
    const flatMetrics = flattenObject(metrics)
    exportToCSV([flatMetrics], 'dashboard_metrics')
  }
}

// Export table data
export function exportTableData(
  data: any[],
  filename: string,
  format: 'csv' | 'json' = 'csv'
): void {
  if (format === 'json') {
    exportToJSON(data, filename)
  } else {
    exportToCSV(data, filename)
  }
}

// Helper to flatten nested objects for CSV export
function flattenObject(obj: any, prefix: string = ''): Record<string, any> {
  const result: Record<string, any> = {}

  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const newKey = prefix ? `${prefix}_${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey))
    } else if (Array.isArray(value)) {
      result[newKey] = value.join('; ')
    } else {
      result[newKey] = value
    }
  }

  return result
}
