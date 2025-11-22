import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiStat,
  EuiProgress,
  EuiCallOut,
  EuiAccordion,
  EuiDescriptionList,
} from '@elastic/eui'
import { useMoELearning } from '../../../hooks/useDashboardData'

const MoELearningViz = () => {
  const { data, loading, error } = useMoELearning()

  const learningStats = useMemo(() => {
    if (!data?.learningState) return null
    return {
      monitored: data.learningState.total_tasks_monitored || 0,
      completed: data.learningState.total_tasks_completed || 0,
      killed: data.learningState.total_tasks_killed || 0,
      lastUpdated: data.learningState.last_updated,
    }
  }, [data])

  const routingInsights = useMemo(() => {
    if (!data?.routingIntelligence) return []
    const intel = data.routingIntelligence
    const insights = []

    if (intel.agentRouting) {
      Object.entries(intel.agentRouting).forEach(([agent, info]: [string, any]) => {
        insights.push({
          agent,
          expertise: info.primary_expertise || [],
          confidence: info.confidence_factors || {},
        })
      })
    }

    return insights
  }, [data])

  const recommendations = useMemo(() => {
    return data?.routingIntelligence?.recommendations || []
  }, [data])

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 300 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>MoE Learning Intelligence</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Recent Learning Events - Moved to top */}
      {data?.recentEvents && data.recentEvents.length > 0 && (
        <>
          <EuiPanel hasBorder style={{ maxHeight: 300, overflow: 'auto' }}>
            <EuiTitle size="s"><h3>Recent Learning Events</h3></EuiTitle>
            <EuiSpacer size="m" />

            {data.recentEvents.slice(0, 10).map((event: any, index: number) => (
              <div key={index} style={{ marginBottom: 8, padding: 8, borderRadius: 4, border: '1px solid #D3DAE6' }}>
                <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{event.event_type || event.type}</EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '-'}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {event.message && (
                  <EuiText size="xs" color="subdued" style={{ marginTop: 4 }}>
                    {event.message.substring(0, 100)}
                  </EuiText>
                )}
              </div>
            ))}
          </EuiPanel>
          <EuiSpacer size="l" />
        </>
      )}

      {/* Agent Routing Intelligence */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Agent Routing Intelligence</h3></EuiTitle>
        <EuiSpacer size="m" />

        {routingInsights.length === 0 ? (
          <EuiText color="subdued"><p>No routing intelligence available</p></EuiText>
        ) : (
          routingInsights.map((insight, index) => (
            <EuiAccordion
              key={insight.agent}
              id={`agent-${index}`}
              buttonContent={
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="primary">{insight.agent}</EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {insight.expertise.slice(0, 3).join(', ')}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              paddingSize="m"
            >
              <EuiDescriptionList
                type="column"
                listItems={[
                  {
                    title: 'Primary Expertise',
                    description: insight.expertise.join(', ') || 'None specified',
                  },
                  {
                    title: 'Confidence Factors',
                    description: Object.entries(insight.confidence)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ') || 'None',
                  },
                ]}
              />
            </EuiAccordion>
          ))
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Learning Stats */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Learning Statistics</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={learningStats?.monitored || 0}
              description="Tasks Monitored"
              titleColor="primary"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={learningStats?.completed || 0}
              description="Tasks Completed"
              titleColor="success"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={learningStats?.killed || 0}
              description="Tasks Killed"
              titleColor="danger"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        {learningStats?.lastUpdated && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued" textAlign="center">
              Last updated: {new Date(learningStats.lastUpdated).toLocaleString()}
            </EuiText>
          </>
        )}
      </EuiPanel>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Learning Recommendations</h3></EuiTitle>
            <EuiSpacer size="m" />

            {recommendations.map((rec: any, index: number) => (
              <div key={index} style={{ marginBottom: 8 }}>
                <EuiCallOut
                  title={rec.title || rec.type || 'Recommendation'}
                  color={rec.priority === 'high' ? 'warning' : 'primary'}
                  size="s"
                >
                  <EuiText size="xs">
                    <p>{rec.description || rec.message}</p>
                  </EuiText>
                </EuiCallOut>
              </div>
            ))}
          </EuiPanel>
        </>
      )}
    </>
  )
}

export default MoELearningViz
