import React, { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiStat,
  EuiBadge,
  EuiBasicTable,
  EuiLoadingSpinner
} from '@elastic/eui'
import dashboardApi from '../../../api/dashboardApi'

function ExecutiveSummaryViz() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState(null)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [metricsData, healthData] = await Promise.all([
        dashboardApi.getMetrics(),
        dashboardApi.getHealth()
      ])
      setMetrics(metricsData)
      setHealth(healthData)
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch summary data:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <EuiPanel>
        <EuiLoadingSpinner size="xl" />
      </EuiPanel>
    )
  }

  const kpiData = [
    {
      title: metrics?.active_workers || 0,
      description: 'Active Workers',
      color: 'primary'
    },
    {
      title: metrics?.total_tasks || 0,
      description: 'Total Tasks',
      color: 'success'
    },
    {
      title: `${metrics?.success_rate || 0}%`,
      description: 'Success Rate',
      color: metrics?.success_rate > 90 ? 'success' : 'warning'
    },
    {
      title: metrics?.tokens_available || 0,
      description: 'Tokens Available',
      color: metrics?.tokens_available > 100000 ? 'success' : 'danger'
    }
  ]

  const healthStatus = health?.status || 'unknown'
  const healthColor = healthStatus === 'healthy' ? 'success' : healthStatus === 'degraded' ? 'warning' : 'danger'

  return (
    <>
      <EuiPanel>
        <EuiTitle size="m">
          <h2>Executive Summary</h2>
        </EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiBadge color={healthColor}>
              System Status: {healthStatus.toUpperCase()}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        <EuiFlexGroup>
          {kpiData.map((kpi, index) => (
            <EuiFlexItem key={index}>
              <EuiStat
                title={kpi.title}
                description={kpi.description}
                titleColor={kpi.color}
                textAlign="center"
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiPanel>
    </>
  )
}

export default ExecutiveSummaryViz
