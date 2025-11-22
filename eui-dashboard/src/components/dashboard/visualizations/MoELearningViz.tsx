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
    const insights: Array<{ agent: string; specialization: string; expertise: string[]; confidence: Record<string, number>; techStack: any }> = []

    if (intel.agentRouting) {
      Object.entries(intel.agentRouting).forEach(([agent, info]: [string, any]) => {
        insights.push({
          agent: agent.replace('_master', '').replace('_', ' '),
          specialization: info.specialization || '',
          expertise: info.optimal_task_patterns || info.primary_expertise || [],
          confidence: info.routing_confidence_boosters || info.confidence_factors || {},
          techStack: info.technology_stack || {},
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
                    <EuiBadge color={
                      (event.event || event.event_type || '').includes('killed') ? 'danger' :
                      (event.event || event.event_type || '').includes('completed') ? 'success' :
                      'hollow'
                    }>
                      {event.event || event.event_type || event.type || 'Event'}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {event.timestamp ? new Date(event.timestamp).toLocaleString() : '-'}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {event.task_id && (
                  <EuiText size="xs" style={{ marginTop: 4 }}>
                    <strong>Task:</strong> {event.task_id}
                  </EuiText>
                )}
                {event.details && (
                  <EuiText size="xs" color="subdued" style={{ marginTop: 4 }}>
                    {event.details.reason || event.details.message || JSON.stringify(event.details).substring(0, 100)}
                  </EuiText>
                )}
                {event.message && !event.details && (
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
            <div key={insight.agent} style={{ marginBottom: index < routingInsights.length - 1 ? 8 : 0 }}>
              <EuiAccordion
                id={`agent-${index}`}
                arrowDisplay="left"
                buttonContent={
                  <EuiFlexGroup alignItems="center" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="primary">{insight.agent}</EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs" color="subdued">
                        {insight.specialization.substring(0, 60)}...
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
                    title: 'Specialization',
                    description: insight.specialization || 'None specified',
                  },
                  {
                    title: 'Task Patterns',
                    description: Array.isArray(insight.expertise)
                      ? insight.expertise.slice(0, 3).join(' | ')
                      : 'None specified',
                  },
                  {
                    title: 'Confidence Boosters',
                    description: Array.isArray(insight.confidence)
                      ? insight.confidence.slice(0, 3).join(' | ')
                      : typeof insight.confidence === 'object'
                        ? Object.entries(insight.confidence).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
                        : 'None',
                  },
                  {
                    title: 'Tech Stack',
                    description: insight.techStack && Object.keys(insight.techStack).length > 0
                      ? Object.entries(insight.techStack).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.slice(0, 2).join(', ') : v}`).slice(0, 2).join(' | ')
                      : 'None',
                  },
                ]}
              />
              </EuiAccordion>
            </div>
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
