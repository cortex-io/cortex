/**
 * Status Indicator component
 * Following Elastic best practices for health badges
 */

import React from 'react'
import {
  EuiBadge,
  EuiHealth,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiToolTip,
} from '@elastic/eui'
import { getStatusColor } from '../common/formatters'

interface StatusIndicatorProps {
  status: string
  label?: string
  variant?: 'badge' | 'health' | 'dot'
  size?: 's' | 'm'
  tooltip?: string
  showLabel?: boolean
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  variant = 'badge',
  size = 'm',
  tooltip,
  showLabel = true,
}) => {
  const color = getStatusColor(status)
  const displayLabel = label || status

  const content = () => {
    switch (variant) {
      case 'badge':
        return (
          <>
            {/* ARIA live region for announcing status changes to screen readers */}
            <span
              aria-live="polite"
              aria-atomic="true"
              className="euiScreenReaderOnly"
            >
              Status: {displayLabel}
            </span>
            <EuiBadge color={color}>
              {showLabel ? displayLabel : ''}
            </EuiBadge>
          </>
        )

      case 'health':
        return (
          <EuiHealth color={color} textSize={size === 's' ? 'xs' : 's'}>
            {showLabel ? displayLabel : ''}
          </EuiHealth>
        )

      case 'dot':
        return (
          <EuiFlexGroup gutterSize="xs" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiHealth color={color} />
            </EuiFlexItem>
            {showLabel && (
              <EuiFlexItem grow={false}>
                <EuiText size={size === 's' ? 'xs' : 's'}>{displayLabel}</EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        )

      default:
        return <EuiBadge color={color}>{displayLabel}</EuiBadge>
    }
  }

  if (tooltip) {
    return (
      <EuiToolTip content={tooltip} position="top">
        <span>{content()}</span>
      </EuiToolTip>
    )
  }

  return content()
}

// Integration health card component
interface IntegrationHealthProps {
  name: string
  status: 'online' | 'offline' | 'degraded'
  lastCheck?: Date | string
  metrics?: {
    label: string
    value: string | number
  }[]
}

export const IntegrationHealth: React.FC<IntegrationHealthProps> = ({
  name,
  status,
  lastCheck,
  metrics = [],
}) => {
  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>{name}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <StatusIndicator status={status} variant="badge" size="s" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>

      {metrics.map((metric, index) => (
        <EuiFlexItem key={index}>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {metric.label}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{metric.value}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      ))}

      {lastCheck && (
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            Last check: {new Date(lastCheck).toLocaleTimeString()}
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  )
}

export default StatusIndicator
