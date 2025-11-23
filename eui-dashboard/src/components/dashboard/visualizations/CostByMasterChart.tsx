/**
 * Cost By Master Chart Component
 * Pie/donut chart showing cost breakdown by master agent
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
  EuiHealth,
} from '@elastic/eui'
import {
  Chart,
  Settings,
  Partition,
  PartitionLayout,
  DARK_THEME,
  LIGHT_THEME,
} from '@elastic/charts'
import { CostBreakdownData } from '../../../hooks/useCostMetrics'

interface CostByMasterChartProps {
  data: CostBreakdownData | null
  loading?: boolean
  error?: string | null
  height?: number
  themeMode?: 'light' | 'dark'
}

// Colors for masters
const MASTER_COLORS: Record<string, string> = {
  development: '#00BFB3',
  security: '#F04E98',
  inventory: '#FEC514',
  coordinator: '#006BB4',
  cicd: '#BD271E',
  unknown: '#98A2B3',
}

const CostByMasterChart: React.FC<CostByMasterChartProps> = ({
  data,
  loading,
  error,
  height = 300,
  themeMode = 'light',
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
          <h3>Cost by Master</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="danger">Error: {error}</EuiText>
      </EuiPanel>
    )
  }

  if (!data || !data.by_master || data.by_master.length === 0) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s">
          <h3>Cost by Master</h3>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiText color="subdued" textAlign="center">
          <p>No cost data available</p>
        </EuiText>
      </EuiPanel>
    )
  }

  const chartData = data.by_master.map(item => ({
    master: item.name.charAt(0).toUpperCase() + item.name.slice(1),
    cost: item.cost,
    percentage: item.percentage,
    tasks: item.tasks,
  }))

  const totalCost = data.by_master.reduce((sum, item) => sum + item.cost, 0)

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s">
        <h3>Cost by Master</h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        <p>Distribution of LLM costs across master agents</p>
      </EuiText>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="l">
        {/* Chart */}
        <EuiFlexItem grow={2}>
          <div style={{ height: height - 100 }}>
            <Chart>
              <Settings
                baseTheme={themeMode === 'dark' ? DARK_THEME : LIGHT_THEME}
                showLegend={false}
              />
              <Partition
                id="cost-by-master"
                data={chartData}
                valueAccessor={(d: any) => d.cost}
                valueFormatter={(d: number) => `$${d.toFixed(2)}`}
                layers={[
                  {
                    groupByRollup: (d: any) => d.master,
                    shape: {
                      fillColor: (key: any) => {
                        const masterKey = key.toLowerCase()
                        return MASTER_COLORS[masterKey] || MASTER_COLORS.unknown
                      },
                    },
                  },
                ]}
                layout={PartitionLayout.sunburst}
                clockwiseSectors={false}
              />
            </Chart>
          </div>
        </EuiFlexItem>

        {/* Legend */}
        <EuiFlexItem grow={1}>
          <div>
            {chartData.map((item) => (
              <div key={item.master} style={{ marginBottom: 12 }}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiHealth
                      color={MASTER_COLORS[item.master.toLowerCase()] || MASTER_COLORS.unknown}
                    >
                      <strong>{item.master}</strong>
                    </EuiHealth>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiText size="xs" style={{ marginLeft: 20 }}>
                  <span style={{ fontWeight: 600 }}>${item.cost.toFixed(2)}</span>
                  <span style={{ color: 'var(--euiColorMediumShade)' }}> ({item.percentage}%)</span>
                  <br />
                  <span style={{ color: 'var(--euiColorMediumShade)' }}>{item.tasks} tasks</span>
                </EuiText>
              </div>
            ))}

            <EuiSpacer size="m" />

            <EuiPanel paddingSize="s" hasShadow={false} color="subdued">
              <EuiText size="xs" textAlign="center">
                <strong>Total Cost</strong>
                <br />
                <span style={{ fontSize: '1.3em', color: 'var(--euiColorPrimary)' }}>
                  ${totalCost.toFixed(2)}
                </span>
              </EuiText>
            </EuiPanel>
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  )
}

export default CostByMasterChart
