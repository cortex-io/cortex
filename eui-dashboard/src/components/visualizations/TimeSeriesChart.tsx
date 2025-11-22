/**
 * Time Series Chart component using Elastic Charts
 * Following Elastic best practices for time-series visualization
 */

import React from 'react'
import {
  Chart,
  Settings,
  Axis,
  LineSeries,
  AreaSeries,
  ScaleType,
  Position,
  Tooltip,
  TooltipType,
  DARK_THEME,
  LIGHT_THEME,
  CurveType,
} from '@elastic/charts'
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui'
import { Panel } from '../common/Panel'
import { chartColors } from '../../styles/theme'
import { formatNumber, formatTime } from '../common/formatters'

interface DataPoint {
  timestamp: number | Date | string
  [key: string]: number | Date | string
}

interface SeriesConfig {
  id: string
  name: string
  accessor: string
  color?: string
  type?: 'line' | 'area'
}

interface TimeSeriesChartProps {
  title: string
  data: DataPoint[]
  series: SeriesConfig[]
  loading?: boolean
  error?: string | null
  height?: number
  xAxisTitle?: string
  yAxisTitle?: string
  showLegend?: boolean
  legendPosition?: Position
  enableZoom?: boolean
  onBrush?: (start: number, end: number) => void
  onElementClick?: (data: any) => void
  showGrid?: boolean
  referenceLines?: { value: number; label: string; color: string }[]
  themeMode?: 'light' | 'dark'
  ariaLabel?: string
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  title,
  data,
  series,
  loading = false,
  error = null,
  height = 300,
  xAxisTitle,
  yAxisTitle,
  showLegend = true,
  legendPosition = Position.Right,
  enableZoom = true,
  onBrush,
  onElementClick,
  showGrid = true,
  themeMode = 'light',
  ariaLabel,
}) => {
  // Generate descriptive alt text for the chart
  const getChartDescription = () => {
    if (!data || data.length === 0) return `${title} - No data available`
    const seriesNames = series.map(s => s.name).join(', ')
    const trend = data.length > 1 ?
      (data[data.length - 1] as any)[series[0]?.accessor] > (data[0] as any)[series[0]?.accessor]
        ? 'trending upward'
        : 'trending downward'
      : 'single data point'
    return ariaLabel || `Line chart showing ${seriesNames} over time, ${trend}. ${data.length} data points displayed.`
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

  const handleBrushEnd = (brushEvent: any) => {
    if (onBrush && brushEvent.x) {
      const [start, end] = brushEvent.x
      onBrush(start, end)
    }
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
            lineSeriesStyle: {
              line: { strokeWidth: 2 },
              point: { visible: 'never' as const },
            },
            areaSeriesStyle: {
              area: { opacity: 0.3 },
              line: { strokeWidth: 2 },
            },
          }}
          showLegend={showLegend}
          legendPosition={legendPosition}
          onBrushEnd={enableZoom ? handleBrushEnd : undefined}
          onElementClick={handleElementClick}
          baseTheme={themeMode === 'dark' ? DARK_THEME : LIGHT_THEME}
        />

        <Tooltip type={TooltipType.Crosshairs} />

        <Axis
          id="time-axis"
          position={Position.Bottom}
          title={xAxisTitle}
          gridLine={{ visible: false }}
          tickFormat={(d: number) => formatTime(d)}
        />

        <Axis
          id="value-axis"
          position={Position.Left}
          title={yAxisTitle}
          gridLine={{ visible: showGrid }}
          tickFormat={(d: number) => formatNumber(d)}
        />

        {series.map((s, index) => {
          const color = s.color || chartColors[index % chartColors.length]

          if (s.type === 'area') {
            return (
              <AreaSeries
                key={s.id}
                id={s.id}
                name={s.name}
                data={data}
                xScaleType={ScaleType.Time}
                yScaleType={ScaleType.Linear}
                xAccessor="timestamp"
                yAccessors={[s.accessor]}
                color={color}
              />
            )
          }

          return (
            <LineSeries
              key={s.id}
              id={s.id}
              name={s.name}
              data={data}
              xScaleType={ScaleType.Time}
              yScaleType={ScaleType.Linear}
              xAccessor="timestamp"
              yAccessors={[s.accessor]}
              color={color}
              curve={CurveType.CURVE_MONOTONE_X}
            />
          )
        })}
      </Chart>
      </div>
    </Panel>
  )
}

export default TimeSeriesChart
