import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
  EuiSpacer,
} from '@elastic/eui'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useMetricsHistory } from '../../../hooks/useDashboardData'

interface TimeSeriesPanelProps {
  title: string
  range?: string
}

const TimeSeriesPanel = ({ title, range = '24h' }: TimeSeriesPanelProps) => {
  const { data, loading, error } = useMetricsHistory(range)
  const [chartData, setChartData] = useState<any[]>([])

  useEffect(() => {
    // API returns 'snapshots' not 'dataPoints'
    const points = data?.snapshots || data?.dataPoints
    if (points && points.length > 0) {
      const formatted = points.map((point: any) => ({
        time: new Date(point.timestamp).toLocaleTimeString(),
        workers: point.workers?.active || 0,
        tasks: point.tasks?.in_progress || point.tasks?.inProgress || 0,
        tokens: Math.round((point.tokens?.total_used || point.tokens?.used || 0) / 1000),
      }))
      setChartData(formatted)
    }
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
        <EuiTitle size="s"><h3>{title}</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s"><h3>{title}</h3></EuiTitle>
      <EuiSpacer size="m" />
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="workers"
            stroke="#006BB4"
            name="Active Workers"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="tasks"
            stroke="#00BFB3"
            name="Tasks In Progress"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="tokens"
            stroke="#F5A700"
            name="Tokens (K)"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </EuiPanel>
  )
}

export default TimeSeriesPanel
