import { useState, useEffect } from 'react'
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSuperDatePicker,
  EuiButtonIcon,
  EuiSpacer,
  EuiPanel,
  EuiStat,
  EuiIcon,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiToolTip,
  EuiText,
  EuiLink,
  OnTimeChangeProps,
  OnRefreshProps,
} from '@elastic/eui'
import { DashboardMetrics } from '../../types/dashboard.types'
import { exportToJSON } from '../../utils/exportData'

// Panels
import TimeSeriesPanel from './panels/TimeSeriesPanel'
import TaskTablePanel from './panels/TaskTablePanel'
import DaemonStatusPanel from './panels/DaemonStatusPanel'
import HealthAlertsPanel from './panels/HealthAlertsPanel'
import LogStreamingPanel from './panels/LogStreamingPanel'
import ExecutionManagersPanel from './panels/ExecutionManagersPanel'
import StreamsManagementPanel from './panels/StreamsManagementPanel'

// Visualizations
import MoERoutingViz from './visualizations/MoERoutingViz'
import AgentStatusCards from './visualizations/AgentStatusCards'
import EventFeed from './visualizations/EventFeed'
import MoELearningViz from './visualizations/MoELearningViz'
import DDQDTestingViz from './visualizations/DDQDTestingViz'
import WorkerPoolViz from './visualizations/WorkerPoolViz'
import ComplianceDashboardViz from './visualizations/ComplianceDashboardViz'
import AdminControlsViz from './visualizations/AdminControlsViz'
import AnalyticsDashboardViz from './visualizations/AnalyticsDashboardViz'
import UserManagementViz from './visualizations/UserManagementViz'
import OptimizerDashboardViz from './visualizations/OptimizerDashboardViz'
import ExecutiveSummaryViz from './visualizations/ExecutiveSummaryViz'
import AgentstudioViz from './visualizations/AgentstudioViz'
import MoEAdvancedAnalyticsViz from './visualizations/MoEAdvancedAnalyticsViz'
import DDQDSchedulingViz from './visualizations/DDQDSchedulingViz'
import CoordinationViewerViz from './visualizations/CoordinationViewerViz'
import ApiExplorerViz from './visualizations/ApiExplorerViz'
import LLMCostDashboard from './visualizations/LLMCostDashboard'

type TabId = 'overview' | 'executive' | 'workers' | 'tasks' | 'routing' | 'compliance' | 'analytics' | 'costs' | 'agentstudio' | 'logs' | 'admin' | 'system'

interface DashboardContainerProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const DashboardContainer = ({ theme, onToggleTheme }: DashboardContainerProps) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [start, setStart] = useState('now-24h')
  const [end, setEnd] = useState('now')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState<TabId>('overview')
  const [isNavOpen, setIsNavOpen] = useState(true)

  const navGroups = [
    {
      title: 'Monitoring',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'executive', label: 'Executive' },
      ]
    },
    {
      title: 'Operations',
      items: [
        { id: 'workers', label: 'Workers' },
        { id: 'tasks', label: 'Tasks' },
      ]
    },
    {
      title: 'Intelligence',
      items: [
        { id: 'routing', label: 'MoE Routing' },
        { id: 'analytics', label: 'Analytics' },
        { id: 'costs', label: 'LLM Costs' },
      ]
    },
    {
      title: 'Tools',
      items: [
        { id: 'agentstudio', label: 'Agent Studio' },
        { id: 'logs', label: 'Logs' },
      ]
    },
    {
      title: 'Administration',
      items: [
        { id: 'compliance', label: 'Compliance' },
        { id: 'admin', label: 'Admin' },
        { id: 'system', label: 'System' },
      ]
    },
  ]

  const fetchMetrics = async () => {
    try {
      setIsRefreshing(true)
      const response = await fetch('/api/metrics')
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const data = await response.json()
      setMetrics(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  const onTimeChange = ({ start, end }: OnTimeChangeProps) => {
    setStart(start)
    setEnd(end)
    fetchMetrics()
  }

  const onRefresh = ({ start, end }: OnRefreshProps) => {
    setStart(start)
    setEnd(end)
    fetchMetrics()
  }

  // Get current tab label for header
  const getCurrentTabLabel = () => {
    for (const group of navGroups) {
      const item = group.items.find(i => i.id === selectedTab)
      if (item) return item.label
    }
    return 'Dashboard'
  }

  if (isLoading) {
    return (
      <EuiPage paddingSize="l">
        <EuiPageBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageBody>
      </EuiPage>
    )
  }

  return (
    <EuiPage paddingSize="l">
      {/* Slide-out Side Navigation */}
      {isNavOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 260,
          height: '100vh',
          zIndex: 1000,
          overflowY: 'auto',
          backgroundColor: 'var(--euiColorEmptyShade)',
          borderRight: '1px solid var(--euiColorLightShade)',
          padding: 16,
        }}>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="dashboardApp" size="l" color="primary" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiTitle size="xs"><h2>Commit-Relay</h2></EuiTitle>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="cross"
                aria-label="Close navigation"
                onClick={() => setIsNavOpen(false)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          {navGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 16 }}>
              <EuiText size="xs" color="subdued">
                <strong>{group.title}</strong>
              </EuiText>
              <EuiSpacer size="xs" />
              {group.items.map((item) => (
                <div key={item.id} style={{ marginBottom: 4 }}>
                  <EuiLink
                    onClick={() => {
                      setSelectedTab(item.id as TabId)
                      if (window.innerWidth < 992) {
                        setIsNavOpen(false)
                      }
                    }}
                    color={selectedTab === item.id ? 'primary' : 'text'}
                    style={{
                      display: 'block',
                      padding: '6px 8px',
                      borderRadius: 4,
                      backgroundColor: selectedTab === item.id ? 'rgba(0, 119, 204, 0.1)' : 'transparent',
                      fontWeight: selectedTab === item.id ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </EuiLink>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div style={{ marginLeft: isNavOpen ? 260 : 0, transition: 'margin-left 0.3s ease', width: '100%' }}>
        <EuiPageBody>
          {/* Header */}
          <EuiPageHeader>
            <EuiPageHeaderSection>
              <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType="list"
                    aria-label="Toggle navigation"
                    onClick={() => setIsNavOpen(!isNavOpen)}
                    display="base"
                    size="m"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="l">
                    <h1>{getCurrentTabLabel()}</h1>
                  </EuiTitle>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPageHeaderSection>
            <EuiPageHeaderSection>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiSuperDatePicker
                    start={start}
                    end={end}
                    onTimeChange={onTimeChange}
                    onRefresh={onRefresh}
                    isPaused={false}
                    refreshInterval={30000}
                    isLoading={isRefreshing}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="Export metrics as JSON">
                    <EuiButtonIcon
                      iconType="exportAction"
                      aria-label="Export data"
                      onClick={() => metrics && exportToJSON(metrics, 'dashboard-metrics')}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                    <EuiButtonIcon
                      iconType={theme === 'light' ? 'moon' : 'sun'}
                      aria-label="Toggle theme"
                      onClick={onToggleTheme}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPageHeaderSection>
          </EuiPageHeader>

          <EuiSpacer size="l" />

        {error && (
          <>
            <EuiCallOut title="Error loading data" color="danger" iconType="alert">
              <p>{error}</p>
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        )}

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <>
            {/* Key Metrics Row */}
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem>
                <EuiPanel hasBorder>
                  <EuiStat
                    title={metrics?.workers.active || 0}
                    description="Active Workers"
                    titleColor="primary"
                    textAlign="center"
                  >
                    <EuiIcon type="compute" color="primary" />
                  </EuiStat>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder>
                  <EuiStat
                    title={metrics?.workers.completed || 0}
                    description="Completed"
                    titleColor="success"
                    textAlign="center"
                  >
                    <EuiIcon type="checkInCircleFilled" color="success" />
                  </EuiStat>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder>
                  <EuiStat
                    title={metrics?.workers.failed || 0}
                    description="Failed"
                    titleColor="danger"
                    textAlign="center"
                  >
                    <EuiIcon type="crossInCircle" color="danger" />
                  </EuiStat>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder>
                  <EuiStat
                    title={`${metrics?.workers.successRate?.toFixed(1) || 0}%`}
                    description="Success Rate"
                    titleColor="accent"
                    textAlign="center"
                  >
                    <EuiIcon type="visGauge" color="accent" />
                  </EuiStat>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="l" />

            {/* Time Series & Events */}
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem grow={2}>
                <TimeSeriesPanel title="System Activity" range="24h" />
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <EventFeed start={start} end={end} />
              </EuiFlexItem>
            </EuiFlexGroup>

          </>
        )}

        {/* Executive Tab */}
        {selectedTab === 'executive' && (
          <ExecutiveSummaryViz />
        )}

        {/* Workers Tab */}
        {selectedTab === 'workers' && (
          <>
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem grow={2}>
                <WorkerPoolViz />
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <AgentStatusCards />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <ExecutionManagersPanel />
          </>
        )}

        {/* Tasks Tab */}
        {selectedTab === 'tasks' && (
          <TaskTablePanel />
        )}

        {/* MoE Routing Tab */}
        {selectedTab === 'routing' && (
          <>
            <EuiFlexGroup gutterSize="l">
              {/* Left Column - Routing */}
              <EuiFlexItem grow={2}>
                <MoERoutingViz />
              </EuiFlexItem>

              {/* Right Column - DDQD and Learning */}
              <EuiFlexItem grow={1}>
                <DDQDSchedulingViz />
                <EuiSpacer size="l" />
                <MoELearningViz />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <MoEAdvancedAnalyticsViz />
          </>
        )}

        {/* Compliance Tab */}
        {selectedTab === 'compliance' && (
          <ComplianceDashboardViz />
        )}

        {/* Analytics Tab */}
        {selectedTab === 'analytics' && (
          <>
            <AnalyticsDashboardViz />
            <EuiSpacer size="l" />
            <OptimizerDashboardViz />
          </>
        )}

        {/* LLM Costs Tab */}
        {selectedTab === 'costs' && (
          <LLMCostDashboard />
        )}

        {/* Agentstudio Tab */}
        {selectedTab === 'agentstudio' && (
          <AgentstudioViz />
        )}

        {/* Logs Tab */}
        {selectedTab === 'logs' && (
          <LogStreamingPanel />
        )}

        {/* Admin Tab */}
        {selectedTab === 'admin' && (
          <>
            <ApiExplorerViz />
            <EuiSpacer size="l" />
            <UserManagementViz />
            <EuiSpacer size="l" />
            <AdminControlsViz />
            <EuiSpacer size="l" />
            <CoordinationViewerViz />
          </>
        )}

        {/* System Tab */}
        {selectedTab === 'system' && (
          <>
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem>
                <DaemonStatusPanel />
              </EuiFlexItem>
              <EuiFlexItem>
                <HealthAlertsPanel />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <StreamsManagementPanel />
          </>
        )}
        </EuiPageBody>
      </div>
    </EuiPage>
  )
}

export default DashboardContainer
