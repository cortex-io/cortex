/**
 * Bar Chart component using Elastic Charts
 * Following Elastic best practices for categorical data
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
  StackMode,
} from '@elastic/charts'
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui'
import { Panel } from '../common/Panel'
import { chartColors } from '../../styles/theme'
import { formatNumber } from '../common/formatters'

interface DataPoint {
  category: string
  value: number
  [key: string]: string | number
}

interface BarChartProps {
  title: string
  data: DataPoint[]
  xAccessor?: string
  yAccessor?: string
  loading?: boolean
  error?: string | null
  height?: number
  horizontal?: boolean
  stacked?: boolean
  showLegend?: boolean
  color?: string
  themeMode?: 'light' | 'dark'
  onElementClick?: (data: any) => void
  sortByValue?: boolean
  maxBars?: number
  ariaLabel?: string
}

export const BarChart: React.FC<BarChartProps> = ({
  title,
  data,
  xAccessor = 'category',
  yAccessor = 'value',
  loading = false,
  error = null,
  height = 300,
  horizontal = false,
  stacked = false,
  showLegend = false,
  color = chartColors[0],
  themeMode = 'light',
  onElementClick,
  sortByValue = true,
  maxBars = 10,
  ariaLabel,
}) => {
  // Generate descriptive alt text for the chart
  const getChartDescription = () => {
    if (!data || data.length === 0) return `${title} - No data available`
    const orientation = horizontal ? 'Horizontal' : 'Vertical'
    const topCategory = data[0]?.[xAccessor] || 'Unknown'
    const topValue = data[0]?.[yAccessor] || 0
    return ariaLabel || `${orientation} bar chart showing ${title}. ${data.length} categories displayed. Highest value: ${topCategory} with ${topValue}.`
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

  // Process data: sort by value and limit
  let processedData = [...data]
  if (sortByValue) {
    processedData.sort((a, b) => (b[yAccessor] as number) - (a[yAccessor] as number))
  }
  if (maxBars > 0 && processedData.length > maxBars) {
    processedData = processedData.slice(0, maxBars)
  }

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
          showLegend={showLegend}
          onElementClick={handleElementClick}
          baseTheme={themeMode === 'dark' ? DARK_THEME : LIGHT_THEME}
          rotation={horizontal ? 90 : 0}
        />

        <Tooltip type={TooltipType.Follow} />

        <Axis
          id="category-axis"
          position={horizontal ? Position.Left : Position.Bottom}
          gridLine={{ visible: false }}
        />

        <Axis
          id="value-axis"
          position={horizontal ? Position.Bottom : Position.Left}
          gridLine={{ visible: true }}
          tickFormat={(d: number) => formatNumber(d)}
        />

        <BarSeries
          id="bars"
          name={title}
          data={processedData}
          xScaleType={ScaleType.Ordinal}
          yScaleType={ScaleType.Linear}
          xAccessor={xAccessor}
          yAccessors={[yAccessor]}
          color={color}
          stackMode={stacked ? StackMode.Percentage : undefined}
        />
      </Chart>
      </div>
    </Panel>
  )
}

export default BarChart
