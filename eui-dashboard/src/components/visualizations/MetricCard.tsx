/**
 * Reusable Metric Card component using EuiStat
 * Following Elastic best practices for KPI display
 */

import React from 'react'
import {
  EuiPanel,
  EuiStat,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiLoadingSpinner,
  EuiToolTip,
  IconType,
} from '@elastic/eui'
import { formatTrend, formatCompactNumber, formatPercentage, formatDuration } from '../common/formatters'

interface MetricCardProps {
  title: string | number
  description: string
  titleColor?: 'default' | 'subdued' | 'primary' | 'success' | 'danger' | 'accent' | 'warning'
  icon?: IconType
  iconColor?: string
  loading?: boolean
  trend?: {
    current: number
    previous: number
  }
  format?: 'number' | 'percentage' | 'duration' | 'compact' | 'none'
  onClick?: () => void
  tooltip?: string
  titleSize?: 'xxxs' | 'xxs' | 'xs' | 's' | 'm' | 'l'
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  description,
  titleColor = 'default',
  icon,
  iconColor,
  loading = false,
  trend,
  format = 'none',
  onClick,
  tooltip,
  titleSize = 'l',
}) => {
  // Format the title value
  const formatValue = (value: string | number): string => {
    if (typeof value === 'string') return value
    switch (format) {
      case 'number':
        return value.toLocaleString()
      case 'percentage':
        return formatPercentage(value)
      case 'duration':
        return formatDuration(value)
      case 'compact':
        return formatCompactNumber(value)
      default:
        return String(value)
    }
  }

  const formattedTitle = formatValue(title)

  // Calculate trend if provided
  const trendInfo = trend ? formatTrend(trend.current, trend.previous) : null

  const content = (
    <EuiPanel
      hasBorder
      paddingSize="m"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease',
      }}
      className={onClick ? 'eui-panel-clickable' : undefined}
    >
      {loading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 80 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="m" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <>
          <EuiStat
            title={formattedTitle}
            description={description}
            titleColor={titleColor}
            textAlign="center"
            titleSize={titleSize}
          >
            {icon && (
              <EuiIcon
                type={icon}
                color={iconColor || titleColor}
                size="m"
              />
            )}
          </EuiStat>

          {trendInfo && (
            <EuiFlexGroup justifyContent="center" gutterSize="xs" style={{ marginTop: 8 }}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color={trendInfo.color}>
                  <EuiFlexGroup gutterSize="xs" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiIcon
                        type={trendInfo.direction === 'up' ? 'sortUp' : trendInfo.direction === 'down' ? 'sortDown' : 'minus'}
                        size="s"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      {trendInfo.value}
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </>
      )}
    </EuiPanel>
  )

  if (tooltip) {
    return (
      <EuiToolTip content={tooltip} position="top">
        {content}
      </EuiToolTip>
    )
  }

  return content
}

export default MetricCard
