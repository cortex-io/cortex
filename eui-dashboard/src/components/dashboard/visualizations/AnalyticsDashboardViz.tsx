import { useState, useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiStat,
  EuiSelect,
  EuiIcon,
  EuiProgress,
  EuiBasicTable,
  EuiBadge,
  EuiHealth,
} from '@elastic/eui'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useMetrics, useMetricsHistory, useWorkers, useDaemonStatus } from '../../../hooks/useDashboardData'

const AnalyticsDashboardViz = () => {
  const [timeRange, setTimeRange] = useState('24h')
  const { data: metrics, loading: metricsLoading } = useMetrics()
  const { data: historyData, loading: historyLoading } = useMetricsHistory(timeRange)
  const { data: workersData } = useWorkers()
  const { data: daemonStatus } = useDaemonStatus()

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!metrics) return null

    const tasksCompleted = metrics.tasks?.completed || 0
    const tasksTotal = (metrics.tasks?.completed || 0) + (metrics.tasks?.failed || 0) + (metrics.tasks?.pending || 0)
    const completionRate = tasksTotal > 0 ? Math.round(tasksCompleted / tasksTotal * 100) : 0

    const tokensUsed = metrics.tokens?.used || 0
    const tokensTotal = metrics.tokens?.total || 1
    const tokenEfficiency = Math.round((1 - tokensUsed / tokensTotal) * 100)

    const activeDaemons = daemonStatus?.summary?.running || 0
    const totalDaemons = daemonStatus?.summary?.total || 0
    const healthScore = totalDaemons > 0 ? Math.round(activeDaemons / totalDaemons * 100) : 0

    // Estimate cost (roughly $0.00001 per token for Claude)
    const estimatedCost = Math.round(tokensUsed * 0.00001 * 100) / 100
    const costPerTask = tasksTotal > 0 ? Math.round(estimatedCost / tasksTotal * 100) / 100 : 0

    return {
      completionRate,
      tasksCompleted,
      tasksTotal,
      avgResponseTime: metrics.workers?.avgDuration || 0,
      tokenEfficiency,
      tokensUsed,
      healthScore,
      activeDaemons,
      totalDaemons,
      estimatedCost,
      costPerTask,
      successRate: metrics.workers?.successRate || 0,
    }
  }, [metrics, daemonStatus])

  // Format history data for charts
  const chartData = useMemo(() => {
    if (!historyData?.dataPoints) return []
    return historyData.dataPoints.map((point: any) => ({
      time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      successRate: point.workers?.successRate || 0,
      throughput: point.tasks?.completed || 0,
      avgDuration: point.workers?.avgDuration || 0,
      activeWorkers: point.workers?.active || 0,
    }))
  }, [historyData])

  // Master activity data
  const masterActivity = useMemo(() => {
    if (!metrics?.masters) return []
    return Object.entries(metrics.masters).map(([name, data]: [string, any]) => ({
      name: name.replace('-master', ''),
      tasksHandled: data.tasksHandled || 0,
      workerPool: data.workerPool || 0,
      utilization: data.allocated > 0 ? Math.round(data.used / data.allocated * 100) : 0,
    }))
  }, [metrics])

  // Worker timeline data
  const workerTimeline = useMemo(() => {
    if (!workersData) return []
    const allWorkers = [
      ...(workersData.active_workers || []).map((w: any) => ({ ...w, status: 'active' })),
      ...(workersData.completed_workers || []).slice(0, 10).map((w: any) => ({ ...w, status: 'completed' })),
      ...(workersData.failed_workers || []).slice(0, 5).map((w: any) => ({ ...w, status: 'failed' })),
    ]
    return allWorkers.slice(0, 20).map((worker: any) => ({
      id: worker.worker_id || worker.id,
      type: worker.worker_type || worker.type || 'unknown',
      status: worker.status,
      startTime: worker.start_time || worker.created_at,
      duration: worker.duration || '-',
    }))
  }, [workersData])

  const timelineColumns = [
    {
      field: 'id',
      name: 'Worker ID',
      truncateText: true,
      render: (id: string) => (
        <EuiText size="xs">{id?.split('-').slice(-2).join('-') || id}</EuiText>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      render: (type: string) => (
        <EuiBadge color="hollow">{type}</EuiBadge>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      render: (status: string) => (
        <EuiHealth
          color={
            status === 'active' || status === 'running' ? 'primary' :
            status === 'completed' ? 'success' :
            status === 'failed' ? 'danger' : 'subdued'
          }
        >
          {status}
        </EuiHealth>
      ),
    },
    {
      field: 'startTime',
      name: 'Started',
      render: (time: string) => (
        <EuiText size="xs" color="subdued">
          {time ? new Date(time).toLocaleTimeString() : '-'}
        </EuiText>
      ),
    },
  ]

  const timeRangeOptions = [
    { value: '1h', text: 'Last Hour' },
    { value: '6h', text: 'Last 6 Hours' },
    { value: '24h', text: 'Last 24 Hours' },
    { value: '7d', text: 'Last 7 Days' },
    { value: '30d', text: 'Last 30 Days' },
  ]

  if (metricsLoading) {
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

  return (
    <>
      {/* KPI Cards */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.completionRate || 0}%`}
              description="Task Completion Rate"
              titleColor="success"
              textAlign="center"
            >
              <EuiIcon type="checkInCircleFilled" color="success" />
            </EuiStat>
            <EuiText size="xs" color="subdued" textAlign="center">
              {kpis?.tasksCompleted || 0} of {kpis?.tasksTotal || 0} tasks
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.avgResponseTime?.toFixed(1) || 0}m`}
              description="Avg Response Time"
              titleColor="primary"
              textAlign="center"
            >
              <EuiIcon type="clock" color="primary" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.tokenEfficiency || 0}%`}
              description="Token Efficiency"
              titleColor="accent"
              textAlign="center"
            >
              <EuiIcon type="visGauge" color="accent" />
            </EuiStat>
            <EuiText size="xs" color="subdued" textAlign="center">
              {kpis?.tokensUsed?.toLocaleString() || 0} tokens used
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${kpis?.healthScore || 0}%`}
              description="System Health"
              titleColor={kpis?.healthScore && kpis.healthScore >= 80 ? 'success' : 'warning'}
              textAlign="center"
            >
              <EuiIcon type="heart" color={kpis?.healthScore && kpis.healthScore >= 80 ? 'success' : 'warning'} />
            </EuiStat>
            <EuiText size="xs" color="subdued" textAlign="center">
              {kpis?.activeDaemons || 0}/{kpis?.totalDaemons || 0} daemons
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Historical Analytics */}
      <EuiPanel hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s"><h3>Historical Analytics & Trends</h3></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={timeRangeOptions}
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              compressed
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {historyLoading ? (
          <EuiFlexGroup justifyContent="center" style={{ height: 200 }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="l" />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : chartData.length === 0 ? (
          <EuiText color="subdued" textAlign="center">
            <p>No historical data available for the selected time range</p>
          </EuiText>
        ) : (
          <EuiFlexGroup gutterSize="l" wrap>
            {/* Worker Success Rate */}
            <EuiFlexItem style={{ minWidth: 300 }}>
              <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}>
                    <EuiText size="s"><strong>Worker Success Rate</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="checkInCircleFilled" color="success" size="s" />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="successRate" stroke="#00BFB3" fill="#00BFB3" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <EuiText size="xs" color="subdued">
                  Current: {kpis?.successRate?.toFixed(1) || 0}%
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>

            {/* System Throughput */}
            <EuiFlexItem style={{ minWidth: 300 }}>
              <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}>
                    <EuiText size="s"><strong>System Throughput</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="bolt" color="warning" size="s" />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="throughput" fill="#FEC514" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <EuiText size="xs" color="subdued">
                  Total: {metrics?.tasks?.completed || 0} tasks
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>

            {/* Avg Completion Time */}
            <EuiFlexItem style={{ minWidth: 300 }}>
              <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}>
                    <EuiText size="s"><strong>Avg Completion Time</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="clock" color="primary" size="s" />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="avgDuration" stroke="#006BB4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <EuiText size="xs" color="subdued">
                  Avg: {kpis?.avgResponseTime?.toFixed(1) || 0} min
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>

            {/* Active Workers */}
            <EuiFlexItem style={{ minWidth: 300 }}>
              <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}>
                    <EuiText size="s"><strong>Active Workers</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="users" color="accent" size="s" />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="activeWorkers" stroke="#DD0A73" fill="#DD0A73" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <EuiText size="xs" color="subdued">
                  Current: {metrics?.workers?.active || 0}
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Cost Analysis & Master Activity */}
      <EuiFlexGroup gutterSize="l">
        {/* Cost Analysis */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Cost & Efficiency Analysis</h3></EuiTitle>
            <EuiSpacer size="m" />

            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasShadow={false} color="subdued">
                  <EuiStat
                    title={`$${kpis?.estimatedCost || 0}`}
                    description="Estimated Cost (MTD)"
                    titleSize="m"
                    textAlign="center"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasShadow={false} color="subdued">
                  <EuiStat
                    title={`$${kpis?.costPerTask || 0}`}
                    description="Cost per Task"
                    titleSize="m"
                    textAlign="center"
                  />
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="m" hasShadow={false} color="subdued">
                  <EuiStat
                    title="15x"
                    description="ROI Multiplier"
                    titleSize="m"
                    textAlign="center"
                  />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>

        {/* Master Activity */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Master Activity</h3></EuiTitle>
            <EuiSpacer size="m" />

            {masterActivity.length === 0 ? (
              <EuiText color="subdued"><p>No master activity data</p></EuiText>
            ) : (
              <div>
                {masterActivity.map((master) => (
                  <div key={master.name} style={{ marginBottom: 12 }}>
                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiText size="s">
                          <strong style={{ textTransform: 'capitalize' }}>{master.name}</strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs" color="subdued">
                          {master.tasksHandled} tasks
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiProgress
                      value={master.utilization}
                      max={100}
                      size="s"
                      color={master.utilization > 80 ? 'danger' : master.utilization > 50 ? 'warning' : 'success'}
                    />
                  </div>
                ))}
              </div>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Worker Timeline */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Worker Timeline</h3></EuiTitle>
        <EuiText size="xs" color="subdued">
          <p>Recent worker execution history</p>
        </EuiText>
        <EuiSpacer size="m" />

        {workerTimeline.length > 0 ? (
          <EuiBasicTable
            items={workerTimeline}
            columns={timelineColumns}
            tableLayout="auto"
          />
        ) : (
          <EuiText color="subdued"><p>No worker timeline data available</p></EuiText>
        )}
      </EuiPanel>
    </>
  )
}

export default AnalyticsDashboardViz
