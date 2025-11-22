import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiCallOut,
  EuiButton,
} from '@elastic/eui'
import { useHealthAlerts } from '../../../hooks/useDashboardData'

const HealthAlertsPanel = () => {
  const { data, loading, error, refetch } = useHealthAlerts()

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
        <EuiTitle size="s"><h3>Health Alerts</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  const alerts = data?.alerts || []
  const activeAlerts = alerts.filter((a: any) => !a.resolved)
  const resolvedAlerts = alerts.filter((a: any) => a.resolved)

  const getSeverityColor = (severity: string): 'primary' | 'success' | 'warning' | 'danger' => {
    switch (severity) {
      case 'critical': return 'danger'
      case 'error': return 'danger'
      case 'warning': return 'warning'
      default: return 'primary'
    }
  }

  return (
    <EuiPanel hasBorder style={{ maxHeight: 400, overflow: 'auto' }}>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>
              Health Alerts
              {activeAlerts.length > 0 && (
                <EuiBadge color="danger" style={{ marginLeft: 8 }}>
                  {activeAlerts.length}
                </EuiBadge>
              )}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size="s" onClick={() => refetch()}>
            Refresh
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      {activeAlerts.length === 0 && resolvedAlerts.length === 0 ? (
        <EuiCallOut title="No alerts" color="success" iconType="check">
          <p>System is healthy with no active alerts.</p>
        </EuiCallOut>
      ) : (
        <>
          {activeAlerts.map((alert: any, index: number) => (
            <div key={alert.id || index} style={{ marginBottom: 8 }}>
              <EuiCallOut
                title={alert.title || alert.type}
                color={getSeverityColor(alert.severity)}
                iconType="alert"
                size="s"
              >
                <EuiText size="xs">
                  <p>{alert.message}</p>
                  <EuiFlexGroup justifyContent="spaceBetween">
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {alert.created_at
                          ? new Date(alert.created_at).toLocaleString()
                          : '-'}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiText>
              </EuiCallOut>
            </div>
          ))}

          {resolvedAlerts.length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiText size="xs" color="subdued">
                <strong>Resolved ({resolvedAlerts.length})</strong>
              </EuiText>
              <EuiSpacer size="s" />
              {resolvedAlerts.slice(0, 3).map((alert: any, index: number) => (
                <EuiText key={alert.id || index} size="xs" color="subdued">
                  <p style={{ marginBottom: 4 }}>
                    ✓ {alert.title || alert.type} - {alert.message?.substring(0, 50)}
                  </p>
                </EuiText>
              ))}
            </>
          )}
        </>
      )}
    </EuiPanel>
  )
}

export default HealthAlertsPanel
