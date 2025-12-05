import React, { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiStat,
  EuiProgress,
  EuiCallOut
} from '@elastic/eui'
import dashboardApi from '../../../api/dashboardApi'

function OptimizerDashboardViz() {
  const [stats, setStats] = useState(null)
  const [forecast, setForecast] = useState(null)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [statsData, forecastData] = await Promise.all([
        dashboardApi.getOptimizerStats(),
        dashboardApi.getTokenForecast()
      ])
      setStats(statsData)
      setForecast(forecastData)
    } catch (error) {
      console.error('Failed to fetch optimizer data:', error)
    }
  }

  return (
    <EuiPanel>
      <EuiTitle size="m">
        <h2>Optimizer Dashboard</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiStat
            title={stats?.queue_size || 0}
            description="Tasks in Queue"
            titleColor="primary"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat
            title={stats?.processing_rate || 0}
            description="Tasks/Hour"
            titleColor="success"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat
            title={forecast?.estimated_completion || 'N/A'}
            description="Est. Completion"
            titleColor="warning"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      <EuiTitle size="s">
        <h3>Token Budget Utilization</h3>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiProgress
        value={stats?.token_usage_percent || 0}
        max={100}
        color={stats?.token_usage_percent > 80 ? 'danger' : 'success'}
        size="l"
        label={`${stats?.token_usage_percent || 0}% Used`}
      />

      <EuiSpacer size="l" />

      {forecast?.bottlenecks && forecast.bottlenecks.length > 0 && (
        <EuiCallOut title="Bottlenecks Detected" color="warning" iconType="alert">
          <ul>
            {forecast.bottlenecks.map((bottleneck, i) => (
              <li key={i}>{bottleneck}</li>
            ))}
          </ul>
        </EuiCallOut>
      )}
    </EuiPanel>
  )
}

export default OptimizerDashboardViz
