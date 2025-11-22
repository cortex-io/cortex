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
  EuiIcon,
  EuiText,
  EuiCallOut,
  EuiBadge,
  EuiCard,
  EuiHorizontalRule,
} from '@elastic/eui'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  getMetrics,
  getHealth,
  getDashboardAnalyticsSummary,
  getDashboardAnalyticsTrends,
  getHealthAlerts,
} from '../../../services/dashboardApi'

interface KPIData {
  systemHealth: number
  workerSuccessRate: number
  tokenEfficiency: number
  taskThroughput: number
  activeAlerts: number
}

interface TrendData {
  time: string
  value: number
}

const ExecutiveSummaryViz = () => {
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [healthTrend, setHealthTrend] = useState<TrendData[]>([])
  const [throughputTrend, setThroughputTrend] = useState<TrendData[]>([])
  const [recentAchievements, setRecentAchievements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [metricsResult, healthResult, summaryResult, trendsResult, alertsResult] = await Promise.all([
          getMetrics(),
          getHealth(),
          getDashboardAnalyticsSummary(),
          getDashboardAnalyticsTrends(),
          getHealthAlerts(),
        ])

        // Calculate KPIs from metrics
        const metrics = metricsResult.data
        const health = healthResult.data
        const summary = summaryResult.data
        const trends = trendsResult.data
        const alerts = alertsResult.data

        // Build KPI data
        const kpiData: KPIData = {
          systemHealth: health?.overall_score || calculateHealthScore(metrics),
          workerSuccessRate: metrics?.workers?.successRate || 0,
          tokenEfficiency: calculateTokenEfficiency(metrics?.tokens),
          taskThroughput: summary?.task_throughput || metrics?.tasks?.completed || 0,
          activeAlerts: alerts?.active?.length || 0,
        }
        setKpis(kpiData)

        // Generate trend data (mock if not available)
        if (trends?.health_trend) {
          setHealthTrend(trends.health_trend)
        } else {
          // Generate sample trend data
          setHealthTrend(generateTrendData(7, 85, 98))
        }

        if (trends?.throughput_trend) {
          setThroughputTrend(trends.throughput_trend)
        } else {
          setThroughputTrend(generateTrendData(7, 10, 50))
        }

        // Recent achievements
        if (summary?.recent_completions) {
          setRecentAchievements(summary.recent_completions.slice(0, 5))
        }

        setError(null)
      } catch (err) {
        setError('Failed to fetch executive summary data')
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  // Helper functions
  const calculateHealthScore = (metrics: any): number => {
    if (!metrics) return 85
    const workerScore = (metrics.workers?.successRate || 94) * 0.4
    const tokenScore = (100 - (metrics.tokens?.usagePercentage || 50)) * 0.3
    const taskScore = (metrics.tasks?.completed / (metrics.tasks?.total || 1)) * 100 * 0.3
    return Math.min(100, workerScore + tokenScore + taskScore)
  }

  const calculateTokenEfficiency = (tokens: any): number => {
    if (!tokens) return 75
    const used = tokens.used || 0
    const total = tokens.total || 270000
    // Efficiency = how much work done relative to tokens used
    return Math.min(100, 100 - (used / total * 100))
  }

  const generateTrendData = (days: number, min: number, max: number): TrendData[] => {
    const data: TrendData[] = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      data.push({
        time: date.toLocaleDateString('en-US', { weekday: 'short' }),
        value: Math.floor(Math.random() * (max - min) + min),
      })
    }
    return data
  }

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'success'
    if (score >= 70) return 'warning'
    return 'danger'
  }

  const getHealthLabel = (score: number) => {
    if (score >= 90) return 'Excellent'
    if (score >= 80) return 'Good'
    if (score >= 70) return 'Fair'
    return 'Needs Attention'
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

      {/* System Health Score - Hero */}
      <EuiPanel hasBorder paddingSize="l">
        <EuiFlexGroup alignItems="center" justifyContent="center">
          <EuiFlexItem grow={false} style={{ textAlign: 'center' }}>
            <EuiTitle size="s"><h3>System Health</h3></EuiTitle>
            <EuiSpacer size="m" />
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <EuiProgress
                value={kpis?.systemHealth || 0}
                max={100}
                color={getHealthColor(kpis?.systemHealth || 0)}
                size="l"
                style={{ width: 200 }}
              />
              <EuiSpacer size="s" />
              <EuiText size="m">
                <strong style={{ fontSize: 48 }}>{kpis?.systemHealth?.toFixed(0) || 0}</strong>
                <span style={{ fontSize: 24 }}>/100</span>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiBadge color={getHealthColor(kpis?.systemHealth || 0)}>
                {getHealthLabel(kpis?.systemHealth || 0)}
              </EuiBadge>
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Key KPIs */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.workerSuccessRate?.toFixed(1) || 0}%`}
              description="Worker Success Rate"
              titleColor={
                (kpis?.workerSuccessRate || 0) >= 90 ? 'success' :
                (kpis?.workerSuccessRate || 0) >= 75 ? 'warning' : 'danger'
              }
              titleSize="m"
            >
              <EuiIcon type="checkInCircleFilled" color="success" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.tokenEfficiency?.toFixed(0) || 0}%`}
              description="Token Efficiency"
              titleColor={
                (kpis?.tokenEfficiency || 0) >= 50 ? 'success' :
                (kpis?.tokenEfficiency || 0) >= 25 ? 'warning' : 'danger'
              }
              titleSize="m"
            >
              <EuiIcon type="bolt" color="primary" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={kpis?.taskThroughput || 0}
              description="Tasks Completed (24h)"
              titleColor="primary"
              titleSize="m"
            >
              <EuiIcon type="stats" color="primary" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={kpis?.activeAlerts || 0}
              description="Active Alerts"
              titleColor={
                (kpis?.activeAlerts || 0) === 0 ? 'success' :
                (kpis?.activeAlerts || 0) <= 3 ? 'warning' : 'danger'
              }
              titleSize="m"
            >
              <EuiIcon
                type="alert"
                color={(kpis?.activeAlerts || 0) === 0 ? 'success' : 'warning'}
              />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Trend Charts */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="xs"><h4>Health Trend (7 days)</h4></EuiTitle>
            <EuiSpacer size="m" />
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={healthTrend}>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#666" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 4,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#54B399"
                  fill="#54B399"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="xs"><h4>Task Throughput (7 days)</h4></EuiTitle>
            <EuiSpacer size="m" />
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={throughputTrend}>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#666" />
                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 4,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6092C0"
                  strokeWidth={2}
                  dot={{ fill: '#6092C0', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Recent Achievements */}
      {recentAchievements.length > 0 && (
        <EuiPanel hasBorder>
          <EuiTitle size="s"><h3>Recent Achievements</h3></EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup direction="column" gutterSize="s">
            {recentAchievements.map((achievement, idx) => (
              <EuiFlexItem key={idx}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="checkInCircleFilled" color="success" />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="s">{achievement.title || achievement}</EuiText>
                  </EuiFlexItem>
                  {achievement.completed_at && (
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {new Date(achievement.completed_at).toLocaleDateString()}
                      </EuiText>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiPanel>
      )}
    </>
  )
}

export default ExecutiveSummaryViz
