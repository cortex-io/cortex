import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiProgress,
  EuiBadge,
  EuiLoadingSpinner,
  EuiHealth,
  EuiStat,
} from '@elastic/eui'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useMoEIntelligence } from '../../../hooks/useDashboardData'

const COLORS = ['#006BB4', '#00BFB3', '#F5A700', '#BD271E', '#98A2B3']

const MoERoutingViz = () => {
  const { data, loading, error } = useMoEIntelligence()

  const routingData = useMemo(() => {
    const statsSource = data?.masterStatistics || data?.routing_patterns
    if (!statsSource) return []

    return Object.entries(statsSource).map(([master, stats]: [string, any]) => ({
      name: master.replace('-master', ''),
      value: stats.total || stats.task_count || 0,
      confidence: (stats.highConfidence / (stats.total || 1)) || stats.avg_confidence || 0,
    }))
  }, [data])

  const confidenceDistData = useMemo(() => {
    const dist = data?.confidenceDistribution
    if (!dist) return []

    return [
      { range: '0-25%', count: dist['0-25'] || 0, color: '#BD271E' },
      { range: '26-50%', count: dist['26-50'] || 0, color: '#F5A700' },
      { range: '51-75%', count: dist['51-75'] || 0, color: '#F5A700' },
      { range: '76-90%', count: dist['76-90'] || 0, color: '#00BFB3' },
      { range: '91-100%', count: dist['91-100'] || 0, color: '#006BB4' },
    ]
  }, [data])

  const recentDecisions = useMemo(() => {
    const decisions = data?.recentDecisions || data?.recent_decisions
    if (!decisions) return []
    return decisions.slice(0, 5)
  }, [data])

  const summary = data?.summary || {}

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
        <EuiTitle size="s"><h3>MoE Routing Intelligence</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Summary Stats */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Routing Summary</h3></EuiTitle>
        <EuiSpacer size="m" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={summary.totalDecisions || 0}
              description="Total Decisions"
              titleColor="primary"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={`${((summary.avgConfidence || 0) * 100).toFixed(0)}%`}
              description="Avg Confidence"
              titleColor={summary.avgConfidence > 0.7 ? 'success' : 'warning'}
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={summary.mostUsedMaster || 'none'}
              description="Top Expert"
              titleColor="accent"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Distribution Charts */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Expert & Confidence Distribution</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiText size="s"><strong>Expert Distribution</strong></EuiText>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={routingData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ name, percent }) =>
                    `${name} ${((percent || 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {routingData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiText size="s"><strong>Confidence Distribution</strong></EuiText>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={confidenceDistData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" fontSize={9} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="count" name="Decisions">
                  {confidenceDistData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Confidence by Expert */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>High-Confidence Rate by Expert</h3></EuiTitle>
        <EuiSpacer size="m" />
        {routingData.length === 0 ? (
          <EuiText color="subdued"><p>No routing data available</p></EuiText>
        ) : (
          routingData.map((item, index) => (
            <div key={item.name} style={{ marginBottom: 8 }}>
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">{item.name}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">{(item.confidence * 100).toFixed(0)}%</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiProgress
                value={item.confidence * 100}
                max={100}
                size="s"
                color={COLORS[index % COLORS.length]}
              />
            </div>
          ))
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Recent Decisions */}
      <EuiPanel hasBorder style={{ maxHeight: 300, overflow: 'auto' }}>
        <EuiTitle size="s"><h3>Recent Routing Decisions</h3></EuiTitle>
        <EuiSpacer size="m" />

        {recentDecisions.length === 0 ? (
          <EuiText color="subdued"><p>No recent decisions</p></EuiText>
        ) : (
          recentDecisions.map((decision: any, index: number) => (
            <div key={index} style={{ marginBottom: 8, padding: 8, background: '#f5f7fa', borderRadius: 4 }}>
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiBadge color="primary">
                    {decision.decision?.primary_expert || decision.routed_to || decision.selected_expert}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth
                    color={
                      (decision.decision?.primary_confidence || decision.confidence || 0) > 0.8
                        ? 'success'
                        : (decision.decision?.primary_confidence || decision.confidence || 0) > 0.6
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {((decision.decision?.primary_confidence || decision.confidence || 0) * 100).toFixed(0)}%
                  </EuiHealth>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiText size="xs" color="subdued">
                {decision.task_id}
                {decision.decision?.strategy && (
                  <EuiBadge color="hollow" style={{ marginLeft: 8 }}>
                    {decision.decision.strategy}
                  </EuiBadge>
                )}
              </EuiText>
            </div>
          ))
        )}
      </EuiPanel>
    </>
  )
}

export default MoERoutingViz
