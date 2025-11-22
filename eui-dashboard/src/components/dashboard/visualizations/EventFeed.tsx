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

const EventFeed = () => {
  const { data, loading, error } = useEvents(30)

  const events = useMemo(() => {
    if (!data?.events) return []
    return data.events.slice(0, 15)
  }, [data])

  const getEventIcon = (type: string) => {
    if (type.includes('worker')) return 'compute'
    if (type.includes('task')) return 'list'
    if (type.includes('error') || type.includes('fail')) return 'alert'
    if (type.includes('complete') || type.includes('success')) return 'check'
    if (type.includes('start') || type.includes('spawn')) return 'play'
    return 'dot'
  }

  const getEventColor = (type: string): 'primary' | 'success' | 'warning' | 'danger' | 'default' => {
    if (type.includes('error') || type.includes('fail')) return 'danger'
    if (type.includes('complete') || type.includes('success')) return 'success'
    if (type.includes('warning')) return 'warning'
    if (type.includes('start') || type.includes('spawn')) return 'primary'
    return 'default'
  }

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 300 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Event Feed</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder style={{ maxHeight: 500, overflow: 'auto' }}>
      <EuiTitle size="s"><h3>Event Feed</h3></EuiTitle>
      <EuiSpacer size="m" />

      {events.length === 0 ? (
        <EuiText color="subdued"><p>No recent events</p></EuiText>
      ) : (
        events.map((event: any, index: number) => (
          <div
            key={event.id || index}
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
                      {event.type || 'event'}
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
                  {event.message || event.data?.message || JSON.stringify(event.data || {}).substring(0, 100)}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
        ))
      )}
    </EuiPanel>
  )
}

export default EventFeed
