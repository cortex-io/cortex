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
  EuiCode,
  EuiAccordion,
} from '@elastic/eui'
import { useDecision } from '../../../hooks/useDecisions'
import moment from 'moment'

interface DecisionDetailFlyoutProps {
  decisionId: string
  onClose: () => void
}

const DecisionDetailFlyout = ({ decisionId, onClose }: DecisionDetailFlyoutProps) => {
  const { data, loading, error } = useDecision(decisionId)

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success'
    if (confidence >= 0.75) return 'primary'
    if (confidence >= 0.5) return 'warning'
    return 'danger'
  }

  const getMasterColor = (master: string) => {
    switch (master?.toLowerCase()) {
      case 'development':
        return 'primary'
      case 'security':
        return 'danger'
      case 'inventory':
        return 'success'
      case 'coordinator':
        return 'accent'
      case 'cicd':
        return 'warning'
      default:
        return 'hollow'
    }
  }

  if (loading) {
    return (
      <EuiFlyout onClose={onClose} size="m">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m"><h2>Decision Details</h2></EuiTitle>
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

  if (error || !data) {
    return (
      <EuiFlyout onClose={onClose} size="m">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m"><h2>Decision Details</h2></EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiCallOut title="Error loading decision" color="danger" iconType="alert">
            <p>{error || 'Decision not found'}</p>
          </EuiCallOut>
        </EuiFlyoutBody>
      </EuiFlyout>
    )
  }

  const { selected_master, alternatives, matched_keywords, all_scores } = data

  return (
    <EuiFlyout onClose={onClose} size="m">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>Decision Details</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          <code>{data.task_id}</code>
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Task Information */}
        <EuiPanel hasBorder paddingSize="m">
          <EuiTitle size="xs"><h3>Task Information</h3></EuiTitle>
          <EuiSpacer size="s" />
          <EuiDescriptionList>
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiDescriptionListTitle>Task ID</EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  <EuiCode>{data.task_id}</EuiCode>
                </EuiDescriptionListDescription>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiDescriptionListTitle>Timestamp</EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {moment(data.timestamp).format('MMMM D, YYYY HH:mm:ss')}
                </EuiDescriptionListDescription>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiDescriptionListTitle>Routing Strategy</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <EuiBadge color="hollow">{data.routing_strategy}</EuiBadge>
            </EuiDescriptionListDescription>
          </EuiDescriptionList>
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Selected Master */}
        <EuiPanel hasBorder paddingSize="m">
          <EuiTitle size="xs"><h3>Selected Master</h3></EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiBadge color={getMasterColor(selected_master?.name)} iconType="user">
                {selected_master?.name || 'Unknown'}
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiHealth color={getConfidenceColor(selected_master?.confidence || 0)}>
                {((selected_master?.confidence || 0) * 100).toFixed(0)}% confidence
              </EuiHealth>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {selected_master?.strategy?.replace(/_/g, ' ') || 'Unknown strategy'}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Reasoning */}
        <EuiPanel hasBorder paddingSize="m">
          <EuiTitle size="xs"><h3>Reasoning</h3></EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <p>{data.reasoning}</p>
          </EuiText>
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Alternative Candidates */}
        {alternatives && alternatives.length > 0 && (
          <>
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs"><h3>Alternative Candidates</h3></EuiTitle>
              <EuiSpacer size="s" />
              {alternatives.map((alt: any, index: number) => (
                <div key={index} style={{ marginBottom: 12 }}>
                  <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getMasterColor(alt.expert)}>
                        {alt.expert}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs">
                        {(alt.confidence * 100).toFixed(0)}%
                        {alt.difference > 0 && (
                          <EuiText size="xs" color="subdued" style={{ display: 'inline', marginLeft: 8 }}>
                            (-{(alt.difference * 100).toFixed(0)}%)
                          </EuiText>
                        )}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="xs" />
                  <EuiProgress
                    value={alt.confidence * 100}
                    max={100}
                    size="s"
                    color="subdued"
                  />
                </div>
              ))}
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Expert Scores */}
        {all_scores && Object.keys(all_scores).length > 0 && (
          <>
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs"><h3>All Expert Scores</h3></EuiTitle>
              <EuiSpacer size="s" />
              {Object.entries(all_scores)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([expert, score]) => (
                  <div key={expert} style={{ marginBottom: 8 }}>
                    <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs">{expert}</EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs">{((score as number) * 100).toFixed(0)}%</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiProgress
                      value={(score as number) * 100}
                      max={100}
                      size="s"
                      color={expert === selected_master?.name ? 'primary' : 'subdued'}
                    />
                  </div>
                ))}
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Matched Keywords */}
        {matched_keywords && matched_keywords.length > 0 && (
          <>
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs"><h3>Matched Keywords</h3></EuiTitle>
              <EuiSpacer size="s" />
              <EuiFlexGroup wrap gutterSize="s">
                {matched_keywords.map((kw: any, index: number) => (
                  <EuiFlexItem grow={false} key={index}>
                    <EuiBadge color={getMasterColor(kw.category)}>
                      {kw.keyword}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Rule Used (for rule-based routing) */}
        {data.rule_used && (
          <>
            <EuiPanel hasBorder paddingSize="m">
              <EuiTitle size="xs"><h3>Rule Used</h3></EuiTitle>
              <EuiSpacer size="s" />
              <EuiBadge color="hollow">{data.rule_used}</EuiBadge>
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Raw Decision Data */}
        <EuiAccordion
          id="raw-decision-accordion"
          buttonContent="Raw Decision Data"
          paddingSize="m"
        >
          <EuiPanel color="subdued" paddingSize="s">
            <pre style={{ fontSize: '11px', overflow: 'auto', maxHeight: 300 }}>
              {JSON.stringify(data.raw_decision, null, 2)}
            </pre>
          </EuiPanel>
        </EuiAccordion>
      </EuiFlyoutBody>
    </EuiFlyout>
  )
}

export default DecisionDetailFlyout
