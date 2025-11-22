import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiStat,
  EuiProgress,
  EuiCard,
  EuiIcon,
  EuiText,
  EuiCallOut,
  EuiBadge,
  EuiToolTip,
  EuiHorizontalRule,
} from '@elastic/eui'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import {
  getOptimizerSchedulerStats,
  getOptimizerTokenStats,
  getOptimizerTokenForecast,
  getOptimizerPoolStats,
  getOptimizerBottlenecks,
  getOptimizerRecommendations,
} from '../../../services/dashboardApi'

interface SchedulerStats {
  total_tasks: number
  assigned_tasks: number
  pending_tasks: number
  load_balance_score: number
}

interface TokenStats {
  total_budget: number
  used: number
  available: number
  usage_percentage: number
}

interface Forecast {
  time: string
  predicted_usage: number
  confidence: number
}

interface PoolStats {
  total_workers: number
  active_workers: number
  idle_workers: number
  utilization: number
}

interface Bottleneck {
  id: string
  type: string
  severity: 'high' | 'medium' | 'low'
  description: string
  impact: string
}

interface Recommendation {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  estimated_impact: string
  action: string
}

const OptimizerDashboardViz = () => {
  const [schedulerStats, setSchedulerStats] = useState<SchedulerStats | null>(null)
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  const [forecast, setForecast] = useState<Forecast[]>([])
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [
          schedulerResult,
          tokenResult,
          forecastResult,
          poolResult,
          bottlenecksResult,
          recommendationsResult,
        ] = await Promise.all([
          getOptimizerSchedulerStats(),
          getOptimizerTokenStats(),
          getOptimizerTokenForecast(),
          getOptimizerPoolStats(),
          getOptimizerBottlenecks(),
          getOptimizerRecommendations(),
        ])

        if (schedulerResult.data) setSchedulerStats(schedulerResult.data)
        if (tokenResult.data) setTokenStats(tokenResult.data)
        if (forecastResult.data) setForecast(forecastResult.data.forecast || [])
        if (poolResult.data) setPoolStats(poolResult.data)
        if (bottlenecksResult.data) setBottlenecks(bottlenecksResult.data.bottlenecks || [])
        if (recommendationsResult.data) setRecommendations(recommendationsResult.data.recommendations || [])

        setError(null)
      } catch (err) {
        setError('Failed to fetch optimizer data')
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'danger'
      case 'medium': return 'warning'
      case 'low': return 'default'
      default: return 'hollow'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return 'bolt'
      case 'medium': return 'alert'
      case 'low': return 'dot'
      default: return 'dot'
    }
  }

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <>
      {error && (
        <>
          <EuiCallOut title="Error" color="danger" iconType="alert" size="s">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Top Stats Row */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={schedulerStats?.load_balance_score?.toFixed(1) || 'N/A'}
              description="Load Balance Score"
              titleColor={
                (schedulerStats?.load_balance_score || 0) >= 80 ? 'success' :
                (schedulerStats?.load_balance_score || 0) >= 60 ? 'warning' : 'danger'
              }
              titleSize="s"
            />
            <EuiProgress
              value={schedulerStats?.load_balance_score || 0}
              max={100}
              color={
                (schedulerStats?.load_balance_score || 0) >= 80 ? 'success' :
                (schedulerStats?.load_balance_score || 0) >= 60 ? 'warning' : 'danger'
              }
              size="s"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${tokenStats?.usage_percentage?.toFixed(1) || 0}%`}
              description="Token Usage"
              titleColor={
                (tokenStats?.usage_percentage || 0) <= 70 ? 'success' :
                (tokenStats?.usage_percentage || 0) <= 90 ? 'warning' : 'danger'
              }
              titleSize="s"
            />
            <EuiProgress
              value={tokenStats?.usage_percentage || 0}
              max={100}
              color={
                (tokenStats?.usage_percentage || 0) <= 70 ? 'success' :
                (tokenStats?.usage_percentage || 0) <= 90 ? 'warning' : 'danger'
              }
              size="s"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${poolStats?.utilization?.toFixed(1) || 0}%`}
              description="Pool Utilization"
              titleColor={
                (poolStats?.utilization || 0) >= 50 ? 'success' :
                (poolStats?.utilization || 0) >= 25 ? 'warning' : 'subdued'
              }
              titleSize="s"
            />
            <EuiText size="xs" color="subdued">
              {poolStats?.active_workers || 0} / {poolStats?.total_workers || 0} workers active
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={schedulerStats?.pending_tasks || 0}
              description="Pending Tasks"
              titleColor={
                (schedulerStats?.pending_tasks || 0) <= 5 ? 'success' :
                (schedulerStats?.pending_tasks || 0) <= 15 ? 'warning' : 'danger'
              }
              titleSize="s"
            />
            <EuiText size="xs" color="subdued">
              {schedulerStats?.assigned_tasks || 0} assigned
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Token Forecast Chart */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Token Usage Forecast</h3></EuiTitle>
        <EuiSpacer size="m" />
        {forecast.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="time"
                stroke="#666"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: 4,
                }}
              />
              <Area
                type="monotone"
                dataKey="predicted_usage"
                stroke="#6092C0"
                fill="#6092C0"
                fillOpacity={0.3}
                name="Predicted Usage"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EuiText color="subdued" textAlign="center">
            <p>No forecast data available</p>
          </EuiText>
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Bottlenecks and Recommendations */}
      <EuiFlexGroup gutterSize="l">
        {/* Bottlenecks */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiTitle size="s"><h3>Bottlenecks</h3></EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={bottlenecks.length > 0 ? 'danger' : 'success'}>
                  {bottlenecks.length}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            {bottlenecks.length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="s">
                {bottlenecks.slice(0, 5).map((bottleneck) => (
                  <EuiFlexItem key={bottleneck.id}>
                    <EuiPanel paddingSize="s" color="subdued">
                      <EuiFlexGroup alignItems="center" gutterSize="s">
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={getSeverityColor(bottleneck.severity)}>
                            {bottleneck.severity}
                          </EuiBadge>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="s">
                            <strong>{bottleneck.type}</strong>
                          </EuiText>
                          <EuiText size="xs" color="subdued">
                            {bottleneck.description}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText color="subdued" textAlign="center">
                <p>No bottlenecks detected</p>
              </EuiText>
            )}
          </EuiPanel>
        </EuiFlexItem>

        {/* Recommendations */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiTitle size="s"><h3>Recommendations</h3></EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="primary">{recommendations.length}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            {recommendations.length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="s">
                {recommendations.slice(0, 5).map((rec) => (
                  <EuiFlexItem key={rec.id}>
                    <EuiCard
                      layout="horizontal"
                      paddingSize="s"
                      title=""
                      titleSize="xs"
                      description={
                        <EuiFlexGroup direction="column" gutterSize="xs">
                          <EuiFlexItem>
                            <EuiFlexGroup alignItems="center" gutterSize="s">
                              <EuiFlexItem grow={false}>
                                <EuiIcon type={getPriorityIcon(rec.priority)} color={getSeverityColor(rec.priority)} />
                              </EuiFlexItem>
                              <EuiFlexItem>
                                <EuiText size="s"><strong>{rec.title}</strong></EuiText>
                              </EuiFlexItem>
                            </EuiFlexGroup>
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiText size="xs" color="subdued">{rec.description}</EuiText>
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiText size="xs">
                              <EuiBadge color="hollow">{rec.estimated_impact}</EuiBadge>
                            </EuiText>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      }
                    />
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText color="subdued" textAlign="center">
                <p>No recommendations available</p>
              </EuiText>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  )
}

export default OptimizerDashboardViz
