/**
 * Cost By Model Chart Component
 * Bar chart comparing costs across LLM models
 */

import React from 'react'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
} from '@elastic/eui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { CostBreakdownData } from '../../../hooks/useCostMetrics'

interface CostByModelChartProps {
  data: CostBreakdownData | null
  loading?: boolean
  error?: string | null
  height?: number
}

// Colors for models
const MODEL_COLORS: Record<string, string> = {
  'claude-sonnet-4-5-20250929': '#006BB4',
  'claude-3-5-sonnet-20241022': '#0077CC',
  'claude-3-5-haiku-20241022': '#00BFB3',
  'claude-3-opus-20240229': '#F04E98',
  'default': '#98A2B3',
}

// Friendly model names
const MODEL_NAMES: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
  'claude-3-5-haiku-20241022': 'Haiku 3.5',
  'claude-3-opus-20240229': 'Opus 3',
}

const CostByModelChart: React.FC<CostByModelChartProps> = ({
  data,
  loading,
  error,
  height = 300,
}) => {
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
          <h3>Cost by Model</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="danger">Error: {error}</EuiText>
      </EuiPanel>
    )
  }

  if (!data || !data.by_model || data.by_model.length === 0) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s">
          <h3>Cost by Model</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="subdued" textAlign="center">
          <p>No model data available</p>
        </EuiText>
      </EuiPanel>
    )
  }

  // Format data for chart
  const chartData = data.by_model.map(item => ({
    model: MODEL_NAMES[item.name] || item.name.split('-').slice(-2)[0],
    fullName: item.name,
    cost: item.cost,
    percentage: item.percentage,
    tasks: item.tasks,
    tokens: item.tokens.input + item.tokens.output,
    inputTokens: item.tokens.input,
    outputTokens: item.tokens.output,
    pricing: item.pricing,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <EuiPanel paddingSize="s" style={{ backgroundColor: 'white', border: '1px solid #D3DAE6' }}>
          <EuiText size="xs">
            <strong>{data.fullName}</strong>
            <br />
            Cost: <strong>${data.cost.toFixed(2)}</strong> ({data.percentage}%)
            <br />
            Tasks: {data.tasks}
            <br />
            Tokens: {(data.tokens / 1000).toFixed(1)}K
            <br />
            <span style={{ color: 'var(--euiColorMediumShade)', fontSize: '0.9em' }}>
              Input: ${data.pricing?.input}/1K | Output: ${data.pricing?.output}/1K
            </span>
          </EuiText>
        </EuiPanel>
      )
    }
    return null
  }

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s">
        <h3>Cost by Model</h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        <p>Cost comparison across LLM models</p>
      </EuiText>

      <EuiSpacer size="m" />

      <div style={{ height: height - 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EE" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={(value) => `$${value}`}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={{ fontSize: 11 }}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={MODEL_COLORS[entry.fullName] || MODEL_COLORS.default}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <EuiSpacer size="m" />

      {/* Model Details */}
      <EuiFlexGroup gutterSize="s" wrap>
        {chartData.map((item) => (
          <EuiFlexItem key={item.fullName} grow={false}>
            <EuiPanel paddingSize="xs" hasShadow={false} color="subdued">
              <EuiFlexGroup alignItems="center" gutterSize="xs">
                <EuiFlexItem grow={false}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: MODEL_COLORS[item.fullName] || MODEL_COLORS.default,
                    }}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="xs">
                    <strong>{item.model}</strong>
                    <span style={{ color: 'var(--euiColorMediumShade)', marginLeft: 4 }}>
                      {(item.tokens / 1000).toFixed(0)}K tokens
                    </span>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </EuiPanel>
  )
}

export default CostByModelChart
