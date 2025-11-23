import { useState } from 'react'
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiHealth,
  EuiPanel,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiProgress,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiCodeBlock,
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
  EuiIcon,
  EuiToolTip,
  EuiTabbedContent,
  EuiTab,
} from '@elastic/eui'
import { usePrompt, usePromptVersions, usePromptMetrics, activatePromptVersion } from '../../../hooks/usePrompts'
import moment from 'moment'

interface PromptDetailFlyoutProps {
  promptId: string
  onClose: () => void
  onVersionActivated?: () => void
}

const PromptDetailFlyout = ({ promptId, onClose, onVersionActivated }: PromptDetailFlyoutProps) => {
  const { data: prompt, loading: promptLoading, error: promptError, refetch: refetchPrompt } = usePrompt(promptId)
  const { data: versions, loading: versionsLoading, error: versionsError, refetch: refetchVersions } = usePromptVersions(promptId)
  const { data: metrics, loading: metricsLoading, error: metricsError } = usePromptMetrics(promptId)

  const [activating, setActivating] = useState<string | null>(null)
  const [activationError, setActivationError] = useState<string | null>(null)

  const handleActivateVersion = async (version: string) => {
    setActivating(version)
    setActivationError(null)

    const result = await activatePromptVersion(promptId, version)

    if (result.error) {
      setActivationError(result.error)
    } else {
      refetchPrompt()
      refetchVersions()
      onVersionActivated?.()
    }
    setActivating(null)
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.95) return 'success'
    if (accuracy >= 0.85) return 'primary'
    if (accuracy >= 0.75) return 'warning'
    return 'danger'
  }

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'success': return 'success'
      case 'info': return 'primary'
      case 'warning': return 'warning'
      case 'danger': return 'danger'
      default: return 'hollow'
    }
  }

  const loading = promptLoading && !prompt

  if (loading) {
    return (
      <EuiFlyout onClose={onClose} size="l">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m"><h2>Prompt Details</h2></EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 300 }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="l" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
      </EuiFlyout>
    )
  }

  if (promptError || !prompt) {
    return (
      <EuiFlyout onClose={onClose} size="l">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m"><h2>Prompt Details</h2></EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiCallOut title="Error loading prompt" color="danger" iconType="alert">
            <p>{promptError || 'Prompt not found'}</p>
          </EuiCallOut>
        </EuiFlyoutBody>
      </EuiFlyout>
    )
  }

  const tabs = [
    {
      id: 'overview',
      name: 'Overview',
      content: (
        <>
          <EuiSpacer size="m" />

          {/* Prompt Information */}
          <EuiPanel hasBorder paddingSize="m">
            <EuiTitle size="xs"><h3>Prompt Information</h3></EuiTitle>
            <EuiSpacer size="s" />
            <EuiDescriptionList>
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiDescriptionListTitle>ID</EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    <code>{prompt.id}</code>
                  </EuiDescriptionListDescription>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiDescriptionListTitle>Category</EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    <EuiBadge color="hollow">{prompt.category}</EuiBadge>
                  </EuiDescriptionListDescription>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiDescriptionListTitle>Description</EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {prompt.description}
              </EuiDescriptionListDescription>
              <EuiSpacer size="s" />
              <EuiDescriptionListTitle>Tags</EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                <EuiFlexGroup wrap gutterSize="xs">
                  {prompt.tags.map(tag => (
                    <EuiFlexItem grow={false} key={tag}>
                      <EuiBadge color="hollow">{tag}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </EuiDescriptionListDescription>
            </EuiDescriptionList>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Performance Metrics */}
          <EuiPanel hasBorder paddingSize="m">
            <EuiTitle size="xs"><h3>Performance Metrics</h3></EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Total Uses</strong><br />
                  {prompt.metrics.total_uses.toLocaleString()}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Accuracy</strong><br />
                  <EuiHealth color={getAccuracyColor(prompt.metrics.accuracy)}>
                    {(prompt.metrics.accuracy * 100).toFixed(1)}%
                  </EuiHealth>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Avg Confidence</strong><br />
                  {(prompt.metrics.avg_confidence * 100).toFixed(1)}%
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>Avg Latency</strong><br />
                  {prompt.metrics.avg_latency_ms}ms
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              Last used: {moment(prompt.metrics.last_used).format('MMMM D, YYYY HH:mm')}
            </EuiText>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Recommendations */}
          {metrics?.recommendations && metrics.recommendations.length > 0 && (
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs"><h3>Recommendations</h3></EuiTitle>
              <EuiSpacer size="s" />
              {metrics.recommendations.map((rec, index) => (
                <div key={index} style={{ marginBottom: 8 }}>
                  <EuiFlexGroup alignItems="center" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiIcon
                        type={rec.type === 'success' ? 'checkInCircleFilled' : rec.type === 'warning' ? 'warning' : 'iInCircle'}
                        color={getRecommendationColor(rec.type)}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="s">{rec.message}</EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </div>
              ))}
            </EuiPanel>
          )}

          <EuiSpacer size="m" />

          {/* Prompt Content */}
          {prompt.content && (
            <EuiAccordion
              id="prompt-content-accordion"
              buttonContent="Prompt Content"
              paddingSize="m"
            >
              <EuiCodeBlock
                language="markdown"
                fontSize="s"
                paddingSize="m"
                overflowHeight={400}
              >
                {prompt.content}
              </EuiCodeBlock>
            </EuiAccordion>
          )}
        </>
      ),
    },
    {
      id: 'versions',
      name: `Versions (${prompt.version_count})`,
      content: (
        <>
          <EuiSpacer size="m" />

          {activationError && (
            <>
              <EuiCallOut title="Activation failed" color="danger" iconType="alert">
                <p>{activationError}</p>
              </EuiCallOut>
              <EuiSpacer size="m" />
            </>
          )}

          {versionsLoading ? (
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="l" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : versionsError ? (
            <EuiCallOut title="Error loading versions" color="danger">
              <p>{versionsError}</p>
            </EuiCallOut>
          ) : (
            <>
              {versions?.versions.map((version, index) => (
                <div key={version.version}>
                  <EuiPanel hasBorder paddingSize="m">
                    <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiFlexGroup alignItems="center" gutterSize="s">
                          <EuiFlexItem grow={false}>
                            <EuiBadge color={version.active ? 'success' : 'hollow'}>
                              v{version.version}
                            </EuiBadge>
                          </EuiFlexItem>
                          {version.active && (
                            <EuiFlexItem grow={false}>
                              <EuiBadge color="success" iconType="check">
                                Active
                              </EuiBadge>
                            </EuiFlexItem>
                          )}
                        </EuiFlexGroup>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        {!version.active && (
                          <EuiButton
                            size="s"
                            onClick={() => handleActivateVersion(version.version)}
                            isLoading={activating === version.version}
                          >
                            Activate
                          </EuiButton>
                        )}
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="s" />
                    <EuiText size="s">
                      <p>{version.changelog}</p>
                    </EuiText>
                    <EuiSpacer size="xs" />
                    <EuiText size="xs" color="subdued">
                      Created: {moment(version.created_at).format('MMMM D, YYYY HH:mm')}
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      File: {version.file_path}
                    </EuiText>
                  </EuiPanel>
                  {index < versions.versions.length - 1 && <EuiSpacer size="s" />}
                </div>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      id: 'metrics',
      name: 'Metrics',
      content: (
        <>
          <EuiSpacer size="m" />

          {metricsLoading ? (
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="l" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : metricsError ? (
            <EuiCallOut title="Error loading metrics" color="danger">
              <p>{metricsError}</p>
            </EuiCallOut>
          ) : metrics ? (
            <>
              {/* Version Comparison */}
              <EuiPanel hasBorder paddingSize="m">
                <EuiTitle size="xs"><h3>Performance by Version</h3></EuiTitle>
                <EuiSpacer size="s" />
                {metrics.by_version.map((vMetric) => (
                  <div key={vMetric.version} style={{ marginBottom: 12 }}>
                    <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiFlexGroup alignItems="center" gutterSize="s">
                          <EuiFlexItem grow={false}>
                            <EuiBadge color={vMetric.active ? 'success' : 'hollow'}>
                              v{vMetric.version}
                            </EuiBadge>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiText size="xs">{vMetric.uses.toLocaleString()} uses</EuiText>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs">
                          Accuracy: {(parseFloat(vMetric.accuracy) * 100).toFixed(1)}%
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="xs" />
                    <EuiProgress
                      value={parseFloat(vMetric.accuracy) * 100}
                      max={100}
                      size="s"
                      color={vMetric.active ? 'success' : 'subdued'}
                    />
                  </div>
                ))}
              </EuiPanel>

              <EuiSpacer size="m" />

              {/* Time Series Preview */}
              <EuiPanel hasBorder paddingSize="m">
                <EuiTitle size="xs"><h3>Usage Over Last 24 Hours</h3></EuiTitle>
                <EuiSpacer size="s" />
                <EuiText size="xs" color="subdued">
                  Time series visualization would appear here showing uses, confidence, and latency over time.
                </EuiText>
                <EuiSpacer size="s" />
                <EuiFlexGroup wrap>
                  {metrics.time_series.slice(-6).map((point, index) => (
                    <EuiFlexItem grow={false} key={index}>
                      <EuiPanel color="subdued" paddingSize="s">
                        <EuiText size="xs">
                          <strong>{moment(point.timestamp).format('HH:mm')}</strong><br />
                          {point.uses} uses
                        </EuiText>
                      </EuiPanel>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </EuiPanel>
            </>
          ) : null}
        </>
      ),
    },
  ]

  return (
    <EuiFlyout onClose={onClose} size="l">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>{prompt.name}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{prompt.category}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">v{prompt.current_version}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiHealth color={getAccuracyColor(prompt.metrics.accuracy)}>
              {(prompt.metrics.accuracy * 100).toFixed(0)}% accuracy
            </EuiHealth>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiTabbedContent
          tabs={tabs}
          initialSelectedTab={tabs[0]}
          autoFocus="selected"
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  )
}

export default PromptDetailFlyout
