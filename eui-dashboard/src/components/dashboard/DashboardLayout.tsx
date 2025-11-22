/**
 * Main Dashboard Layout following Elastic best practices
 * Implements proper visual hierarchy: KPIs -> Trends -> Details
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCallOut,
  OnTimeChangeProps,
  OnRefreshProps,
} from '@elastic/eui'
import { DashboardHeader } from './DashboardHeader'
import { MetricsRow } from './MetricsRow'
import { FilterBar, DashboardFilters } from './FilterBar'
import { TimeSeriesChart } from '../visualizations/TimeSeriesChart'
import { TreemapChart } from '../visualizations/TreemapChart'
import { HistogramChart } from '../visualizations/HistogramChart'
import { BarChart } from '../visualizations/BarChart'
import { Panel } from '../common/Panel'
import { IntegrationHealth } from '../visualizations/StatusIndicator'
import { useResponsive } from '../../hooks/useResponsive'
import { exportToJSON, exportToCSV } from '../../utils/exportData'

interface DashboardLayoutProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  theme,
  onToggleTheme,
}) => {
  const { isMobile, getFlexDirection } = useResponsive()

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [start, setStart] = useState('now-24h')
  const [end, setEnd] = useState('now')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>({})

  // Dashboard data state
  const [metricsData, setMetricsData] = useState<any>(null)
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([])
  const [taskDistributionData, setTaskDistributionData] = useState<any[]>([])
  const [confidenceData, setConfidenceData] = useState<any[]>([])
  const [agentPerformanceData, setAgentPerformanceData] = useState<any[]>([])

  const tabs = [
    { id: 'overview', name: 'Overview', icon: 'dashboardApp' },
    { id: 'executive', name: 'Executive', icon: 'users' },
    { id: 'workers', name: 'Workers', icon: 'compute' },
    { id: 'tasks', name: 'Tasks', icon: 'list' },
    { id: 'routing', name: 'MoE Routing', icon: 'branch' },
    { id: 'analytics', name: 'Analytics', icon: 'stats' },
  ]

  const [selectedTab, setSelectedTab] = useState('overview')

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true)

      // Fetch metrics
      const metricsResponse = await fetch('/api/metrics')
      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json()
        setMetricsData({
          activeAgents: metrics.workers?.active || 0,
          previousActiveAgents: metrics.workers?.previousActive,
          tasksCompleted: metrics.workers?.completed || 0,
          previousTasksCompleted: metrics.workers?.previousCompleted,
          successRate: metrics.workers?.successRate || 0,
          previousSuccessRate: metrics.workers?.previousSuccessRate,
          avgDuration: metrics.workers?.avgDuration || 0,
          previousAvgDuration: metrics.workers?.previousAvgDuration,
          integrationHealth: {
            github: 'online',
            slack: 'online',
          },
        })
      }

      // Fetch time series data
      const historyResponse = await fetch('/api/metrics/history?range=24h')
      if (historyResponse.ok) {
        const history = await historyResponse.json()
        const snapshots = history.snapshots || history.dataPoints || []
        setTimeSeriesData(
          snapshots.map((point: any) => ({
            timestamp: new Date(point.timestamp).getTime(),
            workers: point.workers?.active || 0,
            tasks: point.tasks?.in_progress || point.tasks?.inProgress || 0,
            completed: point.workers?.completed || 0,
          }))
        )
      }

      // Generate sample distribution data (would come from API)
      setTaskDistributionData([
        { category: 'GitHub', value: 45 },
        { category: 'Slack', value: 30 },
        { category: 'API', value: 15 },
        { category: 'Manual', value: 10 },
      ])

      // Generate sample confidence histogram
      setConfidenceData([
        { bin: '0-20%', count: 5 },
        { bin: '20-40%', count: 12 },
        { bin: '40-60%', count: 28 },
        { bin: '60-80%', count: 45 },
        { bin: '80-100%', count: 65 },
      ])

      // Generate sample agent performance
      setAgentPerformanceData([
        { category: 'Coordinator', value: 85 },
        { category: 'Development', value: 72 },
        { category: 'Security', value: 68 },
        { category: 'CICD', value: 45 },
        { category: 'Inventory', value: 32 },
      ])

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Handlers
  const onTimeChange = ({ start, end }: OnTimeChangeProps) => {
    setStart(start)
    setEnd(end)
    fetchData()
  }

  const onRefresh = ({ start, end }: OnRefreshProps) => {
    setStart(start)
    setEnd(end)
    fetchData()
  }

  const handleExport = () => {
    const exportData = {
      metrics: metricsData,
      timeSeries: timeSeriesData,
      taskDistribution: taskDistributionData,
      confidence: confidenceData,
      exportedAt: new Date().toISOString(),
    }
    exportToJSON(exportData, 'commit-relay-dashboard')
  }

  const handleFiltersChange = (newFilters: DashboardFilters) => {
    setFilters(newFilters)
    // Apply filters to data fetching
  }

  const handleClearFilters = () => {
    setFilters({})
  }

  const handleMetricClick = (metricId: string) => {
    // Navigate to detailed view or apply filter
    console.log('Metric clicked:', metricId)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        fetchData()
      }
      if (e.key === '?' && e.shiftKey) {
        // Show help modal
        console.log('Help requested')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fetchData])

  return (
    <>
      {/* Header */}
      <DashboardHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        start={start}
        end={end}
        onTimeChange={onTimeChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onExport={handleExport}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        tabs={tabs}
      />

      {/* Main content with padding for fixed header */}
      <EuiPage paddingSize="l" style={{ paddingTop: 80 }}>
        <EuiPageBody>
          {/* Error callout */}
          {error && (
            <>
              <EuiCallOut title="Error loading data" color="danger" iconType="alert">
                <p>{error}</p>
              </EuiCallOut>
              <EuiSpacer size="l" />
            </>
          )}

          {selectedTab === 'overview' && (
            <>
              {/* Row 1: Primary KPIs */}
              <MetricsRow
                data={metricsData}
                loading={isLoading}
                onMetricClick={handleMetricClick}
              />

              <EuiSpacer size="l" />

              {/* Filters */}
              <FilterBar
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onClearFilters={handleClearFilters}
                showSearchBar={!isMobile}
              />

              <EuiSpacer size="l" />

              {/* Row 2: Time Series - Full width */}
              <TimeSeriesChart
                title="Agent Task Completion - Last 24 Hours"
                data={timeSeriesData}
                series={[
                  { id: 'workers', name: 'Active Workers', accessor: 'workers', color: '#006BB4' },
                  { id: 'tasks', name: 'Tasks In Progress', accessor: 'tasks', color: '#00BFB3' },
                  { id: 'completed', name: 'Completed', accessor: 'completed', color: '#54B399' },
                ]}
                loading={isLoading}
                height={300}
                enableZoom={true}
                themeMode={theme}
              />

              <EuiSpacer size="l" />

              {/* Row 3: Distribution & Confidence */}
              <EuiFlexGroup gutterSize="l" direction={getFlexDirection()}>
                <EuiFlexItem>
                  <TreemapChart
                    title="Task Distribution by Source"
                    data={taskDistributionData}
                    loading={isLoading}
                    height={300}
                    themeMode={theme}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <HistogramChart
                    title="MoE Routing Confidence Distribution"
                    data={confidenceData}
                    loading={isLoading}
                    height={300}
                    xAxisTitle="Confidence Range"
                    yAxisTitle="Count"
                    themeMode={theme}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="l" />

              {/* Row 4: Performance & Health */}
              <EuiFlexGroup gutterSize="l" direction={getFlexDirection()}>
                <EuiFlexItem grow={2}>
                  <BarChart
                    title="Agent Performance by Type"
                    data={agentPerformanceData}
                    loading={isLoading}
                    height={300}
                    horizontal={true}
                    themeMode={theme}
                    sortByValue={true}
                    maxBars={10}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={1}>
                  <Panel title="Integration Health">
                    <EuiSpacer size="m" />
                    <IntegrationHealth
                      name="GitHub"
                      status="online"
                      lastCheck={new Date()}
                      metrics={[
                        { label: 'API Calls', value: '1,234' },
                        { label: 'Latency', value: '45ms' },
                      ]}
                    />
                    <EuiSpacer size="m" />
                    <IntegrationHealth
                      name="Slack"
                      status="online"
                      lastCheck={new Date()}
                      metrics={[
                        { label: 'Messages', value: '567' },
                        { label: 'Latency', value: '32ms' },
                      ]}
                    />
                  </Panel>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}

          {/* Other tab content would go here */}
          {selectedTab !== 'overview' && (
            <EuiCallOut title={`${tabs.find(t => t.id === selectedTab)?.name} View`} iconType="iInCircle">
              <p>This tab content is provided by existing components.</p>
            </EuiCallOut>
          )}
        </EuiPageBody>
      </EuiPage>
    </>
  )
}

export default DashboardLayout
