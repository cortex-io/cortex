import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiHealth,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui'
import { useDaemonStatus } from '../../../hooks/useDashboardData'

const DaemonStatusPanel = () => {
  const { data, loading, error } = useDaemonStatus()

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 200 }}>
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
        <EuiTitle size="s"><h3>Daemon Status</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  const daemons = data?.daemons || {}

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s"><h3>Daemon Status</h3></EuiTitle>
      <EuiSpacer size="m" />

      <EuiFlexGroup direction="column" gutterSize="s">
        {Object.entries(daemons).map(([name, daemon]: [string, any]) => (
          <EuiFlexItem key={name}>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiHealth
                      color={
                        daemon.status === 'running' ? 'success' :
                        daemon.status === 'error' ? 'danger' : 'subdued'
                      }
                    >
                      {name}
                    </EuiHealth>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  {daemon.pid && (
                    <EuiFlexItem grow={false}>
                      <EuiToolTip content="Process ID">
                        <EuiBadge color="hollow">PID: {daemon.pid}</EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    <EuiBadge
                      color={
                        daemon.status === 'running' ? 'success' :
                        daemon.status === 'error' ? 'danger' : 'default'
                      }
                    >
                      {daemon.status}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      {Object.keys(daemons).length === 0 && (
        <EuiText color="subdued"><p>No daemon information available</p></EuiText>
      )}
    </EuiPanel>
  )
}

export default DaemonStatusPanel
