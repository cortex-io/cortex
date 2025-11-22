/**
 * Treemap Chart component using Elastic Charts
 * Following Elastic best practices for hierarchical data
 */

import React from 'react'
import {
  Chart,
  Settings,
  Partition,
  PartitionLayout,
  DARK_THEME,
  LIGHT_THEME,
} from '@elastic/charts'
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui'
import { Panel } from '../common/Panel'
import { chartColors } from '../../styles/theme'

interface TreemapData {
  category: string
  value: number
  children?: TreemapData[]
  color?: string
}

interface TreemapChartProps {
  title: string
  data: TreemapData[]
  loading?: boolean
  error?: string | null
  height?: number
  valueAccessor?: string
  labelAccessor?: string
  onElementClick?: (data: any) => void
  themeMode?: 'light' | 'dark'
  ariaLabel?: string
}

export const TreemapChart: React.FC<TreemapChartProps> = ({
  title,
  data,
  loading = false,
  error = null,
  height = 300,
  onElementClick,
  themeMode = 'light',
  ariaLabel,
}) => {
  // Generate descriptive alt text for the chart
  const getChartDescription = () => {
    if (!data || data.length === 0) return `${title} - No data available`
    const totalValue = data.reduce((sum, item) => sum + item.value, 0)
    const largestCategory = data.reduce((max, item) => item.value > max.value ? item : max, data[0])
    return ariaLabel || `Treemap chart showing ${title}. ${data.length} categories displayed. Total value: ${totalValue}. Largest category: ${largestCategory.category} with ${largestCategory.value}.`
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

  // Flatten nested data for the treemap
  const flattenData = (items: TreemapData[], parent?: string) => {
    const result: any[] = []
    items.forEach((item, index) => {
      result.push({
        category: item.category,
        parent: parent || null,
        value: item.value,
        color: item.color || chartColors[index % chartColors.length],
      })
      if (item.children) {
        result.push(...flattenData(item.children, item.category))
      }
    })
    return result
  }

  const flatData = flattenData(data)

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
          onElementClick={handleElementClick}
          baseTheme={themeMode === 'dark' ? DARK_THEME : LIGHT_THEME}
        />

        <Partition
          id="treemap"
          data={flatData}
          valueAccessor={(d: any) => d.value}
          layout={PartitionLayout.treemap}
          layers={[
            {
              groupByRollup: (d: any) => d.category,
              nodeLabel: (d: any) => String(d),
              shape: {
                fillColor: (key: any, sortIndex: number) => {
                  const item = flatData.find((i) => i.category === key)
                  return item?.color || chartColors[sortIndex % chartColors.length]
                },
              },
            },
          ]}
        />
      </Chart>
      </div>
    </Panel>
  )
}

export default TreemapChart
