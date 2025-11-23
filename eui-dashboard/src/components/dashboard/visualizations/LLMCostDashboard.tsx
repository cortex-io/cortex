/**
 * LLM Cost Dashboard Component
 * Main container for LLM cost analytics
 */

import React, { useState, useMemo } from 'react'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiStat,
  EuiSelect,
  EuiIcon,
  EuiLoadingSpinner,
  EuiCallOut,
} from '@elastic/eui'
import { useCostMetrics } from '../../../hooks/useCostMetrics'

// Import chart components
import BudgetAlerts from './BudgetAlerts'
import CostByMasterChart from './CostByMasterChart'
import CostTrendChart from './CostTrendChart'
import CostByModelChart from './CostByModelChart'

const LLMCostDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState('30d')

  // Calculate date range based on selection
  const dateRange = useMemo(() => {
    const end = new Date()
    let start = new Date()

    switch (timeRange) {
      case '7d':
        start.setDate(start.getDate() - 7)
        break
      case '14d':
        start.setDate(start.getDate() - 14)
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        break
      case '60d':
        start.setDate(start.getDate() - 60)
        break
      case '90d':
        start.setDate(start.getDate() - 90)
        break
      default:
        start.setDate(start.getDate() - 30)
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    }
  }, [timeRange])

  const { summary, trend, breakdown, budget, loading, error } = useCostMetrics(dateRange)

  const timeRangeOptions = [
    { value: '7d', text: 'Last 7 Days' },
    { value: '14d', text: 'Last 14 Days' },
    { value: '30d', text: 'Last 30 Days' },
    { value: '60d', text: 'Last 60 Days' },
    { value: '90d', text: 'Last 90 Days' },
  ]

  if (loading && !summary && !budget) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 300 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Header */}
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="m">
            <h2>LLM Cost Analytics</h2>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            <p>Track and analyze LLM usage costs across the system</p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            options={timeRangeOptions}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            compressed
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {error && (
        <>
          <EuiCallOut title="Error loading cost data" color="warning" iconType="alert">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="l" />
        </>
      )}

      {/* Key Metrics */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`$${summary?.total_cost?.toFixed(2) || '0.00'}`}
              description="Total Spend"
              titleColor="primary"
              textAlign="center"
            >
              <EuiIcon type="stats" color="primary" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={((summary?.total_tokens?.input || 0) + (summary?.total_tokens?.output || 0)).toLocaleString()}
              description="Total Tokens"
              titleColor="accent"
              textAlign="center"
            >
              <EuiIcon type="bolt" color="accent" />
            </EuiStat>
            <EuiText size="xs" color="subdued" textAlign="center">
              {((summary?.total_tokens?.input || 0) / 1000).toFixed(0)}K in / {((summary?.total_tokens?.output || 0) / 1000).toFixed(0)}K out
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={summary?.task_count || 0}
              description="Total Tasks"
              titleColor="success"
              textAlign="center"
            >
              <EuiIcon type="checkInCircleFilled" color="success" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`$${summary?.avg_cost_per_task?.toFixed(3) || '0.000'}`}
              description="Avg Cost/Task"
              titleColor="warning"
              textAlign="center"
            >
              <EuiIcon type="visGauge" color="warning" />
            </EuiStat>
            <EuiText size="xs" color="subdued" textAlign="center">
              {summary?.avg_tokens_per_task?.toLocaleString() || 0} tokens/task
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Budget Alerts and Cost Trend */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem grow={1}>
          <BudgetAlerts data={budget} loading={loading && !budget} error={null} />
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <CostTrendChart data={trend} loading={loading && !trend} error={null} height={350} />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Cost Breakdown Charts */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <CostByMasterChart
            data={breakdown}
            loading={loading && !breakdown}
            error={null}
            height={350}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <CostByModelChart
            data={breakdown}
            loading={loading && !breakdown}
            error={null}
            height={350}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Detailed Daily Breakdown */}
      {summary?.by_day && summary.by_day.length > 0 && (
        <EuiPanel hasBorder>
          <EuiTitle size="s">
            <h3>Daily Cost Breakdown</h3>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            <p>Recent daily cost details</p>
          </EuiText>

          <EuiSpacer size="m" />

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--euiColorLightShade)' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Cost</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Tokens</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Tasks</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Avg/Task</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_day.slice().reverse().slice(0, 14).map((day) => {
                  const totalTokens = day.tokens.input + day.tokens.output
                  const avgCost = day.tasks > 0 ? day.cost / day.tasks : 0
                  return (
                    <tr key={day.date} style={{ borderBottom: '1px solid var(--euiColorLightestShade)' }}>
                      <td style={{ padding: '8px' }}>
                        <EuiText size="s">
                          {new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </EuiText>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <EuiText size="s">
                          <strong>${day.cost.toFixed(2)}</strong>
                        </EuiText>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <EuiText size="s" color="subdued">
                          {(totalTokens / 1000).toFixed(1)}K
                        </EuiText>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <EuiText size="s" color="subdued">
                          {day.tasks}
                        </EuiText>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <EuiText size="s" color="subdued">
                          ${avgCost.toFixed(3)}
                        </EuiText>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </EuiPanel>
      )}
    </>
  )
}

export default LLMCostDashboard
