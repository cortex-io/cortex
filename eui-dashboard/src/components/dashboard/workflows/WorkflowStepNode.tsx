import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiIcon,
  EuiLoadingSpinner,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui'

export interface WorkflowStepNodeData {
  id: string
  name: string
  master: string
  action: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  duration_ms?: number
  error?: string
  onClick?: (stepId: string) => void
}

const statusConfig = {
  pending: {
    color: '#6B7280',
    icon: 'clock',
    label: 'Pending',
    badgeColor: 'hollow' as const,
  },
  running: {
    color: '#3B82F6',
    icon: 'loading',
    label: 'Running',
    badgeColor: 'primary' as const,
  },
  completed: {
    color: '#10B981',
    icon: 'checkInCircleFilled',
    label: 'Completed',
    badgeColor: 'success' as const,
  },
  failed: {
    color: '#EF4444',
    icon: 'crossInCircle',
    label: 'Failed',
    badgeColor: 'danger' as const,
  },
  skipped: {
    color: '#9CA3AF',
    icon: 'minusInCircle',
    label: 'Skipped',
    badgeColor: 'default' as const,
  },
}

const WorkflowStepNode = ({ data }: NodeProps<WorkflowStepNodeData>) => {
  const config = statusConfig[data.status]

  const handleClick = () => {
    if (data.onClick) {
      data.onClick(data.id)
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: config.color,
          width: 8,
          height: 8,
        }}
      />

      <EuiPanel
        hasBorder
        paddingSize="s"
        onClick={handleClick}
        style={{
          minWidth: 180,
          maxWidth: 220,
          cursor: data.onClick ? 'pointer' : 'default',
          borderColor: config.color,
          borderWidth: 2,
          transition: 'all 0.2s ease',
        }}
        className="workflow-step-node"
      >
        <EuiFlexGroup direction="column" gutterSize="xs">
          {/* Header with status */}
          <EuiFlexItem>
            <EuiFlexGroup
              justifyContent="spaceBetween"
              alignItems="center"
              gutterSize="s"
              responsive={false}
            >
              <EuiFlexItem grow={false}>
                {data.status === 'running' ? (
                  <EuiLoadingSpinner size="s" />
                ) : (
                  <EuiIcon type={config.icon} color={config.color} />
                )}
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s" style={{ fontWeight: 600 }}>
                  <span style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 120
                  }}>
                    {data.name || data.id}
                  </span>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={config.badgeColor}>
                  {config.label}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          {/* Master info */}
          <EuiFlexItem>
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="user" size="s" color="subdued" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="xs" color="subdued">
                  {data.master}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          {/* Action */}
          <EuiFlexItem>
            <EuiToolTip content={data.action}>
              <EuiText size="xs" color="subdued">
                <span style={{
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 170
                }}>
                  {data.action}
                </span>
              </EuiText>
            </EuiToolTip>
          </EuiFlexItem>

          {/* Duration (if completed or failed) */}
          {data.duration_ms && (
            <EuiFlexItem>
              <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="clock" size="s" color="subdued" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="xs" color="subdued">
                    {formatDuration(data.duration_ms)}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )}

          {/* Error indicator */}
          {data.error && (
            <EuiFlexItem>
              <EuiToolTip content={data.error}>
                <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="alert" size="s" color="danger" />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs" color="danger">
                      <span style={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 150
                      }}>
                        {data.error}
                      </span>
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPanel>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: config.color,
          width: 8,
          height: 8,
        }}
      />
    </>
  )
}

export default memo(WorkflowStepNode)
