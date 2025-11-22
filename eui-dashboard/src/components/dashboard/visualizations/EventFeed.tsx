import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiIcon,
} from '@elastic/eui'
import { useEvents } from '../../../hooks/useDashboardData'

interface EventFeedProps {
  start?: string
  end?: string
}

const EventFeed = ({ start = 'now-24h', end = 'now' }: EventFeedProps) => {
  const { data, loading, error } = useEvents(50)

  const events = useMemo(() => {
    if (!data?.events) return []

    // Filter events by time range
    const now = new Date()
    let startTime: Date

    // Parse relative time like "now-24h", "now-1h", etc.
    if (start.startsWith('now-')) {
      const match = start.match(/now-(\d+)([hdwmy])/)
      if (match) {
        const [, value, unit] = match
        const ms = {
          h: 60 * 60 * 1000,
          d: 24 * 60 * 60 * 1000,
          w: 7 * 24 * 60 * 60 * 1000,
          m: 30 * 24 * 60 * 60 * 1000,
          y: 365 * 24 * 60 * 60 * 1000,
        }[unit] || 24 * 60 * 60 * 1000
        startTime = new Date(now.getTime() - parseInt(value) * ms)
      } else {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      }
    } else {
      startTime = new Date(start)
    }

    // Filter events within time range
    const filtered = data.events.filter((event: any) => {
      if (!event.timestamp) return false
      const eventTime = new Date(event.timestamp)
      return eventTime >= startTime && eventTime <= now
    })

    return filtered.slice(0, 30)
  }, [data, start, end])

  const getEventIcon = (type: string) => {
    if (type.includes('worker')) return 'compute'
    if (type.includes('task')) return 'list'
    if (type.includes('coordinator')) return 'cluster'
    if (type.includes('validator') || type.includes('integration')) return 'checkInCircleFilled'
    if (type.includes('orchestrator')) return 'branch'
    if (type.includes('handoff')) return 'merge'
    if (type.includes('zombie') || type.includes('cleanup')) return 'trash'
    if (type.includes('error') || type.includes('fail') || type.includes('dead')) return 'alert'
    if (type.includes('complete') || type.includes('success')) return 'check'
    if (type.includes('start') || type.includes('spawn')) return 'play'
    if (type.includes('stop')) return 'stop'
    return 'dot'
  }

  const getEventColor = (type: string): 'primary' | 'success' | 'warning' | 'danger' | 'default' => {
    if (type.includes('error') || type.includes('fail') || type.includes('dead')) return 'danger'
    if (type.includes('complete') || type.includes('success') || type.includes('started')) return 'success'
    if (type.includes('warning') || type.includes('rate_limited') || type.includes('zombie')) return 'warning'
    if (type.includes('stopped')) return 'default'
    if (type.includes('start') || type.includes('spawn')) return 'primary'
    return 'default'
  }

  const formatEventType = (type: string): string => {
    // Convert snake_case to Title Case
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getEventDescription = (event: any): string => {
    const type = event.type || ''
    let eventData = event.data

    // Parse data if it's a JSON string
    if (typeof eventData === 'string' && eventData) {
      try {
        eventData = JSON.parse(eventData)
      } catch {
        // Keep as string if not valid JSON
      }
    }

    // Generate description based on event type
    if (type.includes('worker_presumed_dead')) {
      return `Worker ${eventData?.worker_id || 'unknown'} unresponsive for ${Math.round((eventData?.time_since_heartbeat_seconds || 0) / 60)} minutes`
    }
    if (type.includes('worker_failed')) {
      return `Worker ${eventData?.worker_id || 'unknown'} failed${eventData?.error ? `: ${eventData.error}` : ''}`
    }
    if (type.includes('worker_spawned') || type.includes('worker_started')) {
      return `Worker ${eventData?.worker_id || 'unknown'} started for task ${eventData?.task_id || 'unknown'}`
    }
    if (type.includes('coordinator_started')) {
      return `Coordinator daemon started (PID: ${eventData?.pid || 'unknown'})`
    }
    if (type.includes('coordinator_stopped')) {
      return `Coordinator daemon stopped (PID: ${eventData?.pid || 'unknown'})`
    }
    if (type.includes('integration_validator_started')) {
      return `Integration validator started (PID: ${eventData?.pid || 'unknown'})`
    }
    if (type.includes('integration_validator_stopped')) {
      return `Integration validator stopped (PID: ${eventData?.pid || 'unknown'})`
    }
    if (type.includes('orchestrator_started')) {
      return `Orchestrator started`
    }
    if (type.includes('orchestrator_stopped')) {
      return `Orchestrator stopped: ${eventData?.reason || 'shutdown'}`
    }
    if (type.includes('handoff_processor_started')) {
      return `Handoff processor started (PID: ${eventData?.pid || 'unknown'})`
    }
    if (type.includes('zombie_cleanup_rate_limited')) {
      return `Zombie cleanup rate limited - waiting before next cleanup`
    }
    if (type.includes('task_completed')) {
      return `Task ${eventData?.task_id || 'unknown'} completed successfully`
    }
    if (type.includes('task_failed')) {
      return `Task ${eventData?.task_id || 'unknown'} failed`
    }

    // Fallback to showing data content
    if (eventData?.message) return eventData.message
    if (eventData?.worker_id) return `Worker: ${eventData.worker_id}`
    if (eventData?.task_id) return `Task: ${eventData.task_id}`
    if (eventData?.pid) return `PID: ${eventData.pid}`
    if (typeof eventData === 'object' && eventData) {
      const keys = Object.keys(eventData)
      if (keys.length > 0) {
        return keys.slice(0, 2).map(k => `${k}: ${eventData[k]}`).join(', ')
      }
    }

    return 'System event'
  }

  if (loading) {
    return (
      <EuiPanel hasBorder style={{ height: 350 }}>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: '100%' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  if (error) {
    return (
      <EuiPanel hasBorder style={{ height: 350 }}>
        <EuiTitle size="s"><h3>Event Feed</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder style={{ height: 350, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: 'inherit',
        zIndex: 1,
        paddingBottom: 8,
        borderBottom: '1px solid #D3DAE6'
      }}>
        <EuiTitle size="s"><h3>Event Feed</h3></EuiTitle>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        {events.length === 0 ? (
          <EuiText color="subdued"><p>No events in selected time range</p></EuiText>
        ) : (
          events.map((event: any, index: number) => (
            <div
              key={`evt-${index}-${event.id || ''}-${event.timestamp || ''}`}
              style={{
                padding: '8px 0',
                borderBottom: index < events.length - 1 ? '1px solid #D3DAE6' : 'none'
              }}
            >
              <EuiFlexGroup alignItems="flexStart" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    type={getEventIcon(event.type || '')}
                    color={getEventColor(event.type || '')}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getEventColor(event.type || '')}>
                        {formatEventType(event.type || 'Event')}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {event.timestamp
                          ? new Date(event.timestamp).toLocaleTimeString()
                          : '-'}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="xs" />
                  <EuiText size="s">
                    {getEventDescription(event)}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>
          ))
        )}
      </div>
    </EuiPanel>
  )
}

export default EventFeed
