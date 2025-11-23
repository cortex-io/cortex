import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiStat,
  EuiSpacer,
  EuiText,
  EuiProgress,
  EuiBadge,
  EuiLoadingSpinner,
  EuiHealth,
  useEuiTheme,
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
import { useDecisionStats } from '../../../hooks/useDecisions'

const COLORS = ['#006BB4', '#00BFB3', '#F5A700', '#BD271E', '#98A2B3']
const CONFIDENCE_COLORS = {
  low: '#BD271E',
  medium: '#F5A700',
  high: '#00BFB3',
  very_high: '#006BB4',
}

const DecisionStats = () => {
  const { euiTheme } = useEuiTheme()
  const { data, loading, error } = useDecisionStats()

  const masterChartData = useMemo(() => {
    if (!data?.by_master) return []
    return data.by_master.map((m: any) => ({
      name: m.name,
      value: m.count,
      avgConfidence: m.avg_confidence,
    }))
  }, [data])

  const confidenceChartData = useMemo(() => {
    if (!data?.confidence_distribution) return []
    const dist = data.confidence_distribution
    return [
      { range: '0-50%', count: dist.low, color: CONFIDENCE_COLORS.low, label: 'Low' },
      { range: '50-75%', count: dist.medium, color: CONFIDENCE_COLORS.medium, label: 'Medium' },
      { range: '75-90%', count: dist.high, color: CONFIDENCE_COLORS.high, label: 'High' },
      { range: '90-100%', count: dist.very_high, color: CONFIDENCE_COLORS.very_high, label: 'Very High' },
    ]
  }, [data])

  const strategyChartData = useMemo(() => {
    if (!data?.by_strategy) return []
    return data.by_strategy.map((s: any) => ({
      name: s.name.replace(/_/g, ' '),
      count: s.count,
    }))
  }, [data])

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 200 }}>
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
        <EuiTitle size="s"><h3>Decision Statistics</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  const summary = data?.summary || {} as {
    total_decisions?: number
    avg_confidence?: number
    high_confidence_rate?: number
  }
  const recentActivity = data?.recent_activity || {} as {
    last_hour?: number
    last_day?: number
    last_week?: number
  }

  return (
    <>
      {/* Summary Stats */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Decision Summary</h3></EuiTitle>
        <EuiSpacer size="m" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={summary.total_decisions || 0}
              description="Total Decisions"
              titleColor="primary"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={`${((summary.avg_confidence || 0) * 100).toFixed(0)}%`}
              description="Avg Confidence"
              titleColor={(summary.avg_confidence || 0) >= 0.75 ? 'success' : 'warning'}
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={`${((summary.high_confidence_rate || 0) * 100).toFixed(0)}%`}
              description="High Confidence Rate"
              titleColor={(summary.high_confidence_rate || 0) >= 0.7 ? 'success' : 'warning'}
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Recent Activity */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Recent Activity</h3></EuiTitle>
        <EuiSpacer size="m" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={recentActivity.last_hour || 0}
              description="Last Hour"
              titleSize="s"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={recentActivity.last_day || 0}
              description="Last 24 Hours"
              titleSize="s"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={recentActivity.last_week || 0}
              description="Last Week"
              titleSize="s"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Distribution Charts */}
      <EuiFlexGroup gutterSize="l">
        {/* Routing by Master */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Routing by Master</h3></EuiTitle>
            <EuiSpacer size="m" />
            {masterChartData.length === 0 ? (
              <EuiText color="subdued" textAlign="center" style={{ paddingTop: 60 }}>
                <p>No routing data available</p>
              </EuiText>
            ) : (
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={masterChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={35}
                      label={({ name, percent }) =>
                        `${name} ${((percent || 0) * 100).toFixed(0)}%`
                      }
                      labelLine={true}
                    >
                      {masterChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </EuiPanel>
        </EuiFlexItem>

        {/* Confidence Distribution */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Confidence Distribution</h3></EuiTitle>
            <EuiSpacer size="m" />
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={confidenceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="count" name="Decisions">
                    {confidenceChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Master Performance */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Master Performance</h3></EuiTitle>
        <EuiSpacer size="m" />
        {data?.by_master?.length === 0 ? (
          <EuiText color="subdued"><p>No performance data available</p></EuiText>
        ) : (
          data?.by_master?.map((master: any, index: number) => (
            <div key={master.name} style={{ marginBottom: 12 }}>
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="s" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={COLORS[index % COLORS.length]}>
                        {master.name}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {master.count} tasks
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth
                    color={master.avg_confidence >= 0.75 ? 'success' : master.avg_confidence >= 0.5 ? 'warning' : 'danger'}
                  >
                    {(master.avg_confidence * 100).toFixed(0)}% avg
                  </EuiHealth>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="xs" />
              <EuiProgress
                value={master.high_confidence_rate * 100}
                max={100}
                size="s"
                color={COLORS[index % COLORS.length]}
                label={`${(master.high_confidence_rate * 100).toFixed(0)}% high confidence`}
              />
            </div>
          ))
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Routing Strategies */}
      {strategyChartData.length > 0 && (
        <EuiPanel hasBorder>
          <EuiTitle size="s"><h3>Routing Strategies Used</h3></EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup wrap gutterSize="m">
            {strategyChartData.map((strategy: any, index: number) => (
              <EuiFlexItem grow={false} key={strategy.name}>
                <EuiPanel
                  paddingSize="s"
                  style={{
                    backgroundColor: euiTheme.colors.lightestShade,
                    textAlign: 'center',
                  }}
                >
                  <EuiText size="s">
                    <strong>{strategy.count}</strong>
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    {strategy.name}
                  </EuiText>
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiPanel>
      )}
    </>
  )
}

export default DecisionStats
