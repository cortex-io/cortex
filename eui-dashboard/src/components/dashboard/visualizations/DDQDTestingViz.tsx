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
  EuiBasicTable,
  EuiHealth,
} from '@elastic/eui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useDDQDTesting } from '../../../hooks/useDashboardData'

const DDQDTestingViz = () => {
  const { data, loading, error } = useDDQDTesting()

  const chartData = useMemo(() => {
    if (!data?.tests) return []
    return data.tests.slice(0, 10).map((test: any) => ({
      name: test.testId?.split('-').pop()?.substring(0, 6) || 'Test',
      accuracy: test.routingAccuracy || 0,
      duration: test.duration || 0,
    }))
  }, [data])

  const columns = [
    {
      field: 'testId',
      name: 'Test ID',
      truncateText: true,
      render: (id: string) => (
        <EuiText size="xs">{id?.split('-').slice(-2).join('-') || id}</EuiText>
      ),
    },
    {
      field: 'version',
      name: 'Version',
      render: (version: string) => (
        <EuiBadge color="hollow">{version}</EuiBadge>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      render: (status: string) => (
        <EuiHealth color={status === 'completed' ? 'success' : status === 'running' ? 'primary' : 'danger'}>
          {status}
        </EuiHealth>
      ),
    },
    {
      field: 'routingAccuracy',
      name: 'Accuracy',
      render: (accuracy: number) => (
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="xs">{accuracy?.toFixed(1)}%</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiProgress
              value={accuracy || 0}
              max={100}
              size="s"
              color={accuracy > 80 ? 'success' : accuracy > 60 ? 'warning' : 'danger'}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: 'duration',
      name: 'Duration',
      render: (duration: number) => (
        <EuiText size="xs">{duration}s</EuiText>
      ),
    },
    {
      field: 'timestamp',
      name: 'Time',
      render: (timestamp: string) => (
        <EuiText size="xs" color="subdued">
          {timestamp ? new Date(timestamp).toLocaleDateString() : '-'}
        </EuiText>
      ),
    },
  ]

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
        <EuiTitle size="s"><h3>DDQD Testing</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Summary Stats */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>DDQD Test Summary</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={data?.summary?.totalTests || 0}
              description="Total Tests"
              titleColor="primary"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={data?.summary?.completedTests || 0}
              description="Completed"
              titleColor="success"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={`${data?.summary?.avgRoutingAccuracy || 0}%`}
              description="Avg Accuracy"
              titleColor="accent"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        {data?.summary?.latestTest && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  Latest: {data.summary.latestTest.testId} - {data.summary.latestTest.routingAccuracy?.toFixed(1)}% accuracy
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Accuracy Chart */}
      {chartData.length > 0 && (
        <>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Routing Accuracy Trend</h3></EuiTitle>
            <EuiSpacer size="m" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis domain={[0, 100]} fontSize={10} />
                <Tooltip />
                <Bar dataKey="accuracy" fill="#006BB4" name="Accuracy %" />
              </BarChart>
            </ResponsiveContainer>
          </EuiPanel>

          <EuiSpacer size="l" />
        </>
      )}

      {/* Test History Table */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Test History</h3></EuiTitle>
        <EuiSpacer size="m" />

        {data?.tests && data.tests.length > 0 ? (
          <EuiBasicTable
            items={data.tests.slice(0, 10)}
            columns={columns}
            tableLayout="auto"
          />
        ) : (
          <EuiText color="subdued"><p>No test history available</p></EuiText>
        )}
      </EuiPanel>

      {/* Active Tests */}
      {data?.activeTests && data.activeTests.length > 0 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel hasBorder color="primary">
            <EuiTitle size="s"><h3>Active Tests</h3></EuiTitle>
            <EuiSpacer size="m" />

            {data.activeTests.map((test: any, index: number) => (
              <div key={index} style={{ marginBottom: 8 }}>
                <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="primary">{test.testId}</EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiLoadingSpinner size="s" />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </div>
            ))}
          </EuiPanel>
        </>
      )}
    </>
  )
}

export default DDQDTestingViz
