/**
 * Cost Trend Chart Component
 * Line chart showing daily cost trend over time with cumulative toggle
 */

import React, { useState } from 'react'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiButtonGroup,
} from '@elastic/eui'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { CostTrendData } from '../../../hooks/useCostMetrics'

interface CostTrendChartProps {
  data: CostTrendData | null
  loading?: boolean
  error?: string | null
  height?: number
}

const CostTrendChart: React.FC<CostTrendChartProps> = ({
  data,
  loading,
  error,
  height = 300,
}) => {
  const [viewMode, setViewMode] = useState<'daily' | 'cumulative'>('daily')

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height }}>
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
        <EuiTitle size="s">
          <h3>Cost Trend</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="danger">Error: {error}</EuiText>
      </EuiPanel>
    )
  }

  if (!data || !data.trend || data.trend.length === 0) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s">
          <h3>Cost Trend</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="subdued" textAlign="center">
          <p>No trend data available</p>
        </EuiText>
      </EuiPanel>
    )
  }

  // Format data for chart
  const chartData = data.trend.map(point => ({
    date: new Date(point.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    dailyCost: point.cost,
    cumulativeCost: point.cumulative_cost,
    tasks: point.tasks,
  }))

  const viewOptions = [
    { id: 'daily', label: 'Daily' },
    { id: 'cumulative', label: 'Cumulative' },
  ]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <EuiPanel paddingSize="s" style={{ backgroundColor: 'white', border: '1px solid #D3DAE6' }}>
          <EuiText size="xs">
            <strong>{label}</strong>
            <br />
            {viewMode === 'daily' ? (
              <>
                Daily: <strong>${payload[0]?.value?.toFixed(2)}</strong>
              </>
            ) : (
              <>
                Total: <strong>${payload[0]?.value?.toFixed(2)}</strong>
              </>
            )}
            <br />
            Tasks: {chartData.find(d => d.date === label)?.tasks || 0}
          </EuiText>
        </EuiPanel>
      )
    }
    return null
  }

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>Cost Trend</h3>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            <p>LLM costs over time</p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="View mode"
            options={viewOptions}
            idSelected={viewMode}
            onChange={(id) => setViewMode(id as 'daily' | 'cumulative')}
            buttonSize="compressed"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <div style={{ height: height - 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'daily' ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EE" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="dailyCost"
                stroke="#006BB4"
                fill="#006BB4"
                fillOpacity={0.2}
                strokeWidth={2}
                name="Daily Cost"
              />
            </AreaChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EE" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="cumulativeCost"
                stroke="#00BFB3"
                strokeWidth={2}
                dot={false}
                name="Cumulative Cost"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <EuiSpacer size="s" />

      {/* Summary Stats */}
      <EuiFlexGroup gutterSize="l" justifyContent="center">
        <EuiFlexItem grow={false}>
          <EuiText size="xs" textAlign="center">
            <span style={{ color: 'var(--euiColorMediumShade)' }}>Total</span>
            <br />
            <strong style={{ fontSize: '1.1em' }}>${data.summary.total_cost.toFixed(2)}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" textAlign="center">
            <span style={{ color: 'var(--euiColorMediumShade)' }}>Avg Daily</span>
            <br />
            <strong style={{ fontSize: '1.1em' }}>${data.summary.avg_daily_cost.toFixed(2)}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" textAlign="center">
            <span style={{ color: 'var(--euiColorMediumShade)' }}>Days</span>
            <br />
            <strong style={{ fontSize: '1.1em' }}>{data.summary.total_days}</strong>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  )
}

export default CostTrendChart
