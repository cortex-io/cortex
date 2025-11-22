/**
 * Histogram Chart component using Elastic Charts
 * For distribution visualizations like MoE confidence
 */

import React from 'react'
import {
  Chart,
  Settings,
  Axis,
  BarSeries,
  ScaleType,
  Position,
  Tooltip,
  TooltipType,
  DARK_THEME,
  LIGHT_THEME,
} from '@elastic/charts'
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui'
import { Panel } from '../common/Panel'
import { chartColors } from '../../styles/theme'
import { formatNumber, formatPercentage } from '../common/formatters'

interface HistogramData {
  bin: string | number
  count: number
}

interface HistogramChartProps {
  title: string
  data: HistogramData[]
  loading?: boolean
  error?: string | null
  height?: number
  xAxisTitle?: string
  yAxisTitle?: string
  color?: string
  showPercentage?: boolean
  themeMode?: 'light' | 'dark'
  onElementClick?: (data: any) => void
  ariaLabel?: string
}

export const HistogramChart: React.FC<HistogramChartProps> = ({
  title,
  data,
  loading = false,
  error = null,
  height = 300,
  xAxisTitle = 'Value',
  yAxisTitle = 'Count',
  color = chartColors[1],
  showPercentage = false,
  themeMode = 'light',
  onElementClick,
  ariaLabel,
}) => {
  // Generate descriptive alt text for the chart
  const getChartDescription = () => {
    if (!data || data.length === 0) return `${title} - No data available`
    const total = data.reduce((sum, d) => sum + d.count, 0)
    const peakBin = data.reduce((max, d) => d.count > max.count ? d : max, data[0])
    const displayType = showPercentage ? 'percentage distribution' : 'frequency distribution'
    return ariaLabel || `Histogram showing ${displayType} for ${title}. ${data.length} bins with total count of ${total}. Peak at ${peakBin.bin} with ${peakBin.count} occurrences.`
  }
  if (loading) {
    return (
      <Panel title={title} height={height}>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: height - 80 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel title={title} height={height}>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: height - 80 }}>
          <EuiFlexItem grow={false}>
            <EuiText color="danger">Error: {error}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </Panel>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Panel title={title} height={height}>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: height - 80 }}>
          <EuiFlexItem grow={false}>
            <EuiText color="subdued">No data available</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </Panel>
    )
  }

  // Calculate total for percentage
  const total = data.reduce((sum, d) => sum + d.count, 0)

  // Transform data if showing percentage
  const chartData = showPercentage
    ? data.map((d) => ({
        ...d,
        count: (d.count / total) * 100,
      }))
    : data

  const handleElementClick = (elements: any[]) => {
    if (onElementClick && elements.length > 0) {
      onElementClick(elements[0])
    }
  }

  return (
    <Panel title={title}>
      <div
        role="img"
        aria-label={getChartDescription()}
      >
      <Chart size={{ height }}>
        <Settings
          theme={{
            background: { color: themeMode === 'dark' ? '#1D1E24' : '#FFFFFF' },
            barSeriesStyle: {
              rect: { opacity: 0.8 },
              rectBorder: { visible: false },
            },
          }}
          onElementClick={handleElementClick}
          baseTheme={themeMode === 'dark' ? DARK_THEME : LIGHT_THEME}
        />

        <Tooltip type={TooltipType.Follow} />

        <Axis
          id="bin-axis"
          position={Position.Bottom}
          title={xAxisTitle}
          gridLine={{ visible: false }}
        />

        <Axis
          id="count-axis"
          position={Position.Left}
          title={showPercentage ? 'Percentage' : yAxisTitle}
          gridLine={{ visible: true }}
          tickFormat={(d: number) => (showPercentage ? formatPercentage(d) : formatNumber(d))}
        />

        <BarSeries
          id="histogram"
          name={title}
          data={chartData}
          xScaleType={ScaleType.Ordinal}
          yScaleType={ScaleType.Linear}
          xAccessor="bin"
          yAccessors={['count']}
          color={color}
        />
      </Chart>
      </div>
    </Panel>
  )
}

export default HistogramChart
