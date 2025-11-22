/**
 * Formatting utilities following Elastic best practices
 * Consistent value formatting across dashboard
 */

// Duration formatting
export const formatDuration = (ms: number): string => {
  if (ms < 0) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

// Percentage formatting
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`
}

// Number formatting with locale
export const formatNumber = (value: number): string => {
  return value.toLocaleString()
}

// Compact number formatting (1K, 1M, etc.)
export const formatCompactNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

// Bytes formatting (1 KB, 1 MB, etc.)
export const formatBytes = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

// Date/time formatting
export const formatDateTime = (date: Date | string | number): string => {
  const d = new Date(date)
  return d.toLocaleString()
}

export const formatTime = (date: Date | string | number): string => {
  const d = new Date(date)
  return d.toLocaleTimeString()
}

export const formatDate = (date: Date | string | number): string => {
  const d = new Date(date)
  return d.toLocaleDateString()
}

// Relative time formatting
export const formatRelativeTime = (date: Date | string | number): string => {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

// Status color mapping
export const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'default' | 'primary' => {
  const statusLower = status.toLowerCase()
  if (['active', 'running', 'healthy', 'completed', 'success', 'online'].includes(statusLower)) {
    return 'success'
  }
  if (['pending', 'queued', 'waiting', 'degraded', 'warning'].includes(statusLower)) {
    return 'warning'
  }
  if (['failed', 'error', 'offline', 'unhealthy', 'critical'].includes(statusLower)) {
    return 'danger'
  }
  if (['idle', 'paused', 'stopped'].includes(statusLower)) {
    return 'default'
  }
  return 'primary'
}

// Trend indicator
export const formatTrend = (current: number, previous: number): { value: string; direction: 'up' | 'down' | 'flat'; color: string } => {
  if (previous === 0) {
    return { value: 'N/A', direction: 'flat', color: 'subdued' }
  }

  const change = ((current - previous) / previous) * 100

  if (Math.abs(change) < 0.1) {
    return { value: '0%', direction: 'flat', color: 'subdued' }
  }

  return {
    value: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
    direction: change > 0 ? 'up' : 'down',
    color: change > 0 ? 'success' : 'danger',
  }
}

// Truncate text with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return `${text.substring(0, maxLength)}...`
}

// Capitalize first letter
export const capitalize = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

// Format agent/worker ID for display
export const formatAgentId = (id: string): string => {
  if (id.length <= 8) return id
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`
}
