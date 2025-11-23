/**
 * Budget Alerts Component
 * Displays budget status and alerts for LLM costs
 */

import React from 'react'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiProgress,
  EuiCallOut,
  EuiLoadingSpinner,
  EuiIcon,
  EuiToolTip,
} from '@elastic/eui'
import { BudgetData } from '../../../hooks/useCostMetrics'

interface BudgetAlertsProps {
  data: BudgetData | null
  loading?: boolean
  error?: string | null
}

const BudgetAlerts: React.FC<BudgetAlertsProps> = ({ data, loading, error }) => {
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
        <EuiCallOut title="Error loading budget data" color="danger" iconType="alert">
          <p>{error}</p>
        </EuiCallOut>
      </EuiPanel>
    )
  }

  if (!data) {
    return (
      <EuiPanel hasBorder>
        <EuiText color="subdued" textAlign="center">
          <p>No budget data available</p>
        </EuiText>
      </EuiPanel>
    )
  }

  const getProgressColor = (percentage: number, warningThreshold: number, criticalThreshold: number) => {
    if (percentage >= criticalThreshold * 100) return 'danger'
    if (percentage >= warningThreshold * 100) return 'warning'
    return 'success'
  }

  const monthlyColor = getProgressColor(
    data.current.monthly.percentage,
    data.budget.alert_threshold_warning,
    data.budget.alert_threshold_critical
  )

  const dailyColor = getProgressColor(
    data.current.daily.percentage,
    data.budget.alert_threshold_warning,
    data.budget.alert_threshold_critical
  )

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>Budget Status</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {data.period.month}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <>
          {data.alerts.map((alert, index) => (
            <React.Fragment key={index}>
              <EuiCallOut
                title={alert.message}
                color={alert.level === 'critical' ? 'danger' : 'warning'}
                iconType="alert"
                size="s"
              >
                <EuiText size="xs">
                  ${alert.spent.toFixed(2)} spent of ${alert.limit.toFixed(2)} limit
                </EuiText>
              </EuiCallOut>
              <EuiSpacer size="s" />
            </React.Fragment>
          ))}
        </>
      )}

      {/* Monthly Budget */}
      <EuiPanel paddingSize="s" hasShadow={false} color="subdued">
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="xs">
              <EuiFlexItem grow={false}>
                <EuiIcon type="calendar" size="s" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Monthly Budget</strong>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={`Projected: $${data.current.monthly.projected.toFixed(2)}`}>
              <EuiText size="s">
                <strong>${data.current.monthly.spent.toFixed(2)}</strong>
                <span style={{ color: 'var(--euiColorMediumShade)' }}> / ${data.budget.monthly_limit.toFixed(2)}</span>
              </EuiText>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <EuiProgress
          value={Math.min(data.current.monthly.percentage, 100)}
          max={100}
          size="m"
          color={monthlyColor}
          label={`${data.current.monthly.percentage.toFixed(1)}%`}
        />
        <EuiSpacer size="xs" />
        <EuiFlexGroup justifyContent="spaceBetween" gutterSize="none">
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              ${data.current.monthly.remaining.toFixed(2)} remaining
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {data.period.days_remaining} days left
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Daily Budget */}
      <EuiPanel paddingSize="s" hasShadow={false} color="subdued">
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="xs">
              <EuiFlexItem grow={false}>
                <EuiIcon type="clock" size="s" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Daily Budget</strong>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>${data.current.daily.spent.toFixed(2)}</strong>
              <span style={{ color: 'var(--euiColorMediumShade)' }}> / ${data.budget.daily_limit.toFixed(2)}</span>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <EuiProgress
          value={Math.min(data.current.daily.percentage, 100)}
          max={100}
          size="m"
          color={dailyColor}
          label={`${data.current.daily.percentage.toFixed(1)}%`}
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          ${data.current.daily.remaining.toFixed(2)} remaining today
        </EuiText>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Projection */}
      <EuiFlexGroup justifyContent="center">
        <EuiFlexItem grow={false}>
          <EuiPanel paddingSize="s" hasShadow={false} style={{ backgroundColor: 'var(--euiColorLightestShade)' }}>
            <EuiText size="xs" textAlign="center">
              <strong>Projected Monthly Total</strong>
              <br />
              <span style={{
                fontSize: '1.2em',
                color: data.current.monthly.projected > data.budget.monthly_limit
                  ? 'var(--euiColorDanger)'
                  : 'var(--euiColorSuccess)'
              }}>
                ${data.current.monthly.projected.toFixed(2)}
              </span>
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  )
}

export default BudgetAlerts
