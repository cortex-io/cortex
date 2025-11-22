import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiText,
  EuiCallOut,
  EuiStat,
} from '@elastic/eui'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  getMoEAccuracy,
  getMoEPoolUtilization,
} from '../../../services/dashboardApi'

const COLORS = ['#54B399', '#6092C0', '#D36086', '#9170B8', '#CA8EAE']

const MoEAdvancedAnalyticsViz = () => {
  const [accuracyData, setAccuracyData] = useState<any[]>([])
  const [utilizationData, setUtilizationData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [accuracyResult, utilizationResult] = await Promise.all([
          getMoEAccuracy(),
          getMoEPoolUtilization(),
        ])

        if (accuracyResult.data) {
          setAccuracyData(accuracyResult.data.accuracy_over_time || [])
        }
        if (utilizationResult.data) {
          // Handle direct array or nested utilization
          const utilData = Array.isArray(utilizationResult.data)
            ? utilizationResult.data
            : utilizationResult.data.utilization || []
          setUtilizationData(utilData)
        }

        setError(null)
      } catch (err) {
        setError('Failed to fetch MoE analytics data')
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate average accuracy
  const avgAccuracy = accuracyData.length > 0
    ? (accuracyData.reduce((sum, d) => sum + d.accuracy, 0) / accuracyData.length).toFixed(1)
    : 'N/A'

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

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s"><h3>Advanced MoE Analytics</h3></EuiTitle>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title="Error" color="warning" iconType="alert" size="s">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Stats Row */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiStat
            title={avgAccuracy !== 'N/A' ? `${avgAccuracy}%` : 'N/A'}
            description="Avg Accuracy"
            titleColor={Number(avgAccuracy) >= 90 ? 'success' : Number(avgAccuracy) >= 70 ? 'warning' : 'subdued'}
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat
            title={accuracyData.length || 0}
            description="Data Points"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat
            title={utilizationData.length || 0}
            description="Experts Tracked"
            titleSize="s"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Accuracy Over Time */}
      <EuiTitle size="xs"><h4>Accuracy Over Time</h4></EuiTitle>
      <EuiSpacer size="s" />
      {accuracyData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={accuracyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#666" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 4,
              }}
            />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#54B399"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EuiText color="subdued" textAlign="center">
          <p>No accuracy data available</p>
        </EuiText>
      )}

      <EuiSpacer size="l" />

      {/* Pool Utilization */}
      <EuiTitle size="xs"><h4>Expert Pool Utilization</h4></EuiTitle>
      <EuiSpacer size="s" />
      {utilizationData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={utilizationData}
              dataKey="usage"
              nameKey="expert"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={(props) => props.name && props.value ? `${props.name}: ${props.value}%` : ''}
            >
              {utilizationData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 4,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <EuiText color="subdued" textAlign="center">
          <p>No utilization data available</p>
        </EuiText>
      )}
    </EuiPanel>
  )
}

export default MoEAdvancedAnalyticsViz
