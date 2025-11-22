/**
 * Consistent Panel wrapper following Elastic best practices
 * Uses borders instead of shadows for cleaner look
 */

import React from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui'

interface PanelProps {
  title?: string
  titleSize?: 'xxxs' | 'xxs' | 'xs' | 's' | 'm' | 'l'
  children: React.ReactNode
  loading?: boolean
  error?: string | null
  paddingSize?: 'none' | 's' | 'm' | 'l'
  height?: number | string
  actions?: React.ReactNode
  onRefresh?: () => void
  emptyMessage?: string
  isEmpty?: boolean
}

export const Panel: React.FC<PanelProps> = ({
  title,
  titleSize = 's',
  children,
  loading = false,
  error = null,
  paddingSize = 'm',
  height,
  actions,
  onRefresh,
  emptyMessage = 'No data available',
  isEmpty = false,
}) => {
  // Loading state
  if (loading) {
    return (
      <EuiPanel hasBorder paddingSize={paddingSize} style={height ? { height } : undefined}>
        {title && (
          <>
            <EuiTitle size={titleSize}>
              <h3>{title}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
          </>
        )}
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          style={{ minHeight: height ? undefined : 200 }}
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  // Error state
  if (error) {
    return (
      <EuiPanel hasBorder paddingSize={paddingSize} style={height ? { height } : undefined}>
        {title && (
          <>
            <EuiTitle size={titleSize}>
              <h3>{title}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
          </>
        )}
        <EuiFlexGroup
          direction="column"
          justifyContent="center"
          alignItems="center"
          style={{ minHeight: height ? undefined : 200 }}
        >
          <EuiFlexItem grow={false}>
            <EuiText color="danger" textAlign="center">
              <p>Error: {error}</p>
            </EuiText>
          </EuiFlexItem>
          {onRefresh && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Retry">
                <EuiButtonIcon
                  iconType="refresh"
                  aria-label="Retry"
                  onClick={onRefresh}
                  color="danger"
                />
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  // Empty state
  if (isEmpty) {
    return (
      <EuiPanel hasBorder paddingSize={paddingSize} style={height ? { height } : undefined}>
        {title && (
          <>
            <EuiTitle size={titleSize}>
              <h3>{title}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
          </>
        )}
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          style={{ minHeight: height ? undefined : 200 }}
        >
          <EuiFlexItem grow={false}>
            <EuiText color="subdued" textAlign="center">
              <p>{emptyMessage}</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  // Normal render
  return (
    <EuiPanel hasBorder paddingSize={paddingSize} style={height ? { height } : undefined}>
      {(title || actions || onRefresh) && (
        <>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              {title && (
                <EuiTitle size={titleSize}>
                  <h3>{title}</h3>
                </EuiTitle>
              )}
            </EuiFlexItem>
            {(actions || onRefresh) && (
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s" alignItems="center">
                  {actions && <EuiFlexItem grow={false}>{actions}</EuiFlexItem>}
                  {onRefresh && (
                    <EuiFlexItem grow={false}>
                      <EuiToolTip content="Refresh">
                        <EuiButtonIcon
                          iconType="refresh"
                          aria-label="Refresh"
                          onClick={onRefresh}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
          <EuiSpacer size="m" />
        </>
      )}
      {children}
    </EuiPanel>
  )
}

export default Panel
