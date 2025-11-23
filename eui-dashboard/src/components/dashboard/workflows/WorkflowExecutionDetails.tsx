import { useState } from 'react'
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiBadge,
  EuiDescriptionList,
  EuiAccordion,
  EuiCodeBlock,
  EuiHealth,
  EuiIcon,
  EuiButton,
  EuiButtonEmpty,
  EuiProgress,
  EuiPanel,
  EuiLoadingSpinner,
  EuiCallOut,
} from '@elastic/eui'
import { WorkflowExecution, WorkflowStep, useWorkflowCancel } from '../../../hooks/useWorkflows'

interface WorkflowExecutionDetailsProps {
  execution: WorkflowExecution
  onClose: () => void
  onRefresh?: () => void
}

const statusConfig = {
  pending: { color: 'hollow' as const, label: 'Pending', health: 'subdued' as const },
  running: { color: 'primary' as const, label: 'Running', health: 'primary' as const },
  completed: { color: 'success' as const, label: 'Completed', health: 'success' as const },
  failed: { color: 'danger' as const, label: 'Failed', health: 'danger' as const },
  cancelled: { color: 'warning' as const, label: 'Cancelled', health: 'warning' as const },
  skipped: { color: 'default' as const, label: 'Skipped', health: 'subdued' as const },
}

const WorkflowExecutionDetails = ({
  execution,
  onClose,
  onRefresh,
}: WorkflowExecutionDetailsProps) => {
  const { cancel, loading: cancelling, error: cancelError } = useWorkflowCancel()
  const [selectedStep, setSelectedStep] = useState<string | null>(null)

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatDate = (date?: string) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString()
  }

  const handleCancel = async () => {
    const success = await cancel(execution.id)
    if (success && onRefresh) {
      onRefresh()
    }
  }

  const completedSteps = execution.steps.filter((s) => s.status === 'completed').length
  const totalSteps = execution.steps.length
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  const getStepConfig = (status: string) =>
    statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

  const renderStepDetails = (step: WorkflowStep) => {
    const config = getStepConfig(step.status)
    const isExpanded = selectedStep === step.id

    return (
      <EuiAccordion
        key={step.id}
        id={`step-${step.id}`}
        buttonContent={
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiHealth color={config.health}>{step.name || step.id}</EuiHealth>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={config.color}>{config.label}</EuiBadge>
            </EuiFlexItem>
            {step.duration_ms && (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {formatDuration(step.duration_ms)}
                </EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        }
        paddingSize="m"
        forceState={isExpanded ? 'open' : 'closed'}
        onToggle={() => setSelectedStep(isExpanded ? null : step.id)}
      >
        <EuiPanel hasBorder paddingSize="m">
          <EuiDescriptionList
            listItems={[
              { title: 'Step ID', description: step.id },
              { title: 'Master', description: step.master },
              { title: 'Action', description: step.action },
              {
                title: 'Dependencies',
                description:
                  step.dependencies.length > 0
                    ? step.dependencies.join(', ')
                    : 'None',
              },
              { title: 'Started', description: formatDate(step.started_at) },
              { title: 'Completed', description: formatDate(step.completed_at) },
              { title: 'Duration', description: formatDuration(step.duration_ms) },
            ]}
            type="column"
            columnWidths={[1, 2]}
          />

          {step.error && (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut title="Error" color="danger" iconType="alert" size="s">
                <p>{step.error}</p>
              </EuiCallOut>
            </>
          )}

          {step.inputs && Object.keys(step.inputs).length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <strong>Inputs</strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiCodeBlock
                language="json"
                fontSize="s"
                paddingSize="s"
                overflowHeight={150}
              >
                {JSON.stringify(step.inputs, null, 2)}
              </EuiCodeBlock>
            </>
          )}

          {step.outputs && Object.keys(step.outputs).length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiText size="s">
                <strong>Outputs</strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiCodeBlock
                language="json"
                fontSize="s"
                paddingSize="s"
                overflowHeight={150}
              >
                {JSON.stringify(step.outputs, null, 2)}
              </EuiCodeBlock>
            </>
          )}
        </EuiPanel>
      </EuiAccordion>
    )
  }

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2>Execution Details</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color={getStepConfig(execution.status).color}>
              {getStepConfig(execution.status).label}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Execution Summary */}
        <EuiPanel hasBorder paddingSize="m">
          <EuiTitle size="xs">
            <h3>Summary</h3>
          </EuiTitle>
          <EuiSpacer size="m" />

          <EuiDescriptionList
            listItems={[
              { title: 'Execution ID', description: execution.id },
              { title: 'Workflow', description: execution.workflow_name },
              { title: 'Trigger', description: execution.trigger },
              {
                title: 'Triggered By',
                description: execution.triggered_by || 'System',
              },
              { title: 'Started', description: formatDate(execution.started_at) },
              { title: 'Completed', description: formatDate(execution.completed_at) },
              { title: 'Duration', description: formatDuration(execution.duration_ms) },
            ]}
            type="column"
            columnWidths={[1, 2]}
          />

          <EuiSpacer size="m" />

          {/* Progress bar */}
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <strong>Progress:</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiProgress
                value={progress}
                max={100}
                size="m"
                color={
                  execution.status === 'completed'
                    ? 'success'
                    : execution.status === 'failed'
                    ? 'danger'
                    : 'primary'
                }
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                {completedSteps}/{totalSteps}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiSpacer size="l" />

        {/* Context */}
        {execution.context && Object.keys(execution.context).length > 0 && (
          <>
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs">
                <h3>Context</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiCodeBlock
                language="json"
                fontSize="s"
                paddingSize="s"
                overflowHeight={200}
              >
                {JSON.stringify(execution.context, null, 2)}
              </EuiCodeBlock>
            </EuiPanel>
            <EuiSpacer size="l" />
          </>
        )}

        {/* Error message */}
        {execution.error && (
          <>
            <EuiCallOut title="Execution Error" color="danger" iconType="alert">
              <p>{execution.error}</p>
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        )}

        {cancelError && (
          <>
            <EuiCallOut title="Cancel Error" color="warning" iconType="alert">
              <p>{cancelError}</p>
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        )}

        {/* Steps */}
        <EuiTitle size="xs">
          <h3>Steps ({execution.steps.length})</h3>
        </EuiTitle>
        <EuiSpacer size="m" />

        {execution.steps.map(renderStepDetails)}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>Close</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              {onRefresh && (
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={onRefresh} iconType="refresh">
                    Refresh
                  </EuiButton>
                </EuiFlexItem>
              )}
              {(execution.status === 'pending' || execution.status === 'running') && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    onClick={handleCancel}
                    color="danger"
                    isLoading={cancelling}
                    iconType="cross"
                  >
                    Cancel
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  )
}

export default WorkflowExecutionDetails
