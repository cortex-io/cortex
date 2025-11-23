/**
 * Security Dashboard Component
 * Portfolio-wide security status overview and management
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  EuiPageTemplate,
  EuiPageHeader,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlexGrid,
  EuiStat,
  EuiHealth,
  EuiBadge,
  EuiCard,
  EuiTimeline,
  EuiTimelineItem,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiIcon,
  EuiToolTip,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiSwitch,
  EuiBasicTable,
  EuiTableFieldDataColumnType,
} from '@elastic/eui'

// TypeScript Interfaces
interface VulnerabilityCounts {
  critical: number
  high: number
  medium: number
  low: number
  total: number
}

interface TrendIndicator {
  direction: 'up' | 'down' | 'stable'
  value: number
  percentage: number
}

interface PortfolioSummary {
  total_vulnerabilities: number
  vulnerability_counts: VulnerabilityCounts
  repositories_scanned: number
  total_repositories: number
  last_scan_time: string
  trend: TrendIndicator
  scan_coverage_percentage: number
  avg_time_to_fix: number
}

interface RepositorySecurityStatus {
  repository_id: string
  repository_name: string
  status: 'healthy' | 'warning' | 'critical'
  vulnerability_counts: VulnerabilityCounts
  last_scan_time: string
  scan_status: 'completed' | 'in_progress' | 'failed' | 'never'
  dependencies_count: number
  outdated_dependencies: number
}

interface ScanHistoryItem {
  scan_id: string
  repository_name: string
  scan_type: 'full' | 'quick' | 'dependency'
  status: 'completed' | 'in_progress' | 'failed'
  started_at: string
  completed_at: string | null
  vulnerabilities_found: number
  vulnerabilities_fixed: number
  event_type: 'scan_completed' | 'vulnerability_discovered' | 'fix_applied'
}

interface PortfolioRepo {
  id: string
  url: string
  owner: string
  name: string
  branch: string
  auto_scan: boolean
  added_at: string
  last_scan: string | null
  status: string
  vulnerability_counts: VulnerabilityCounts
  error?: string
}

interface SecurityDashboardState {
  summary: PortfolioSummary | null
  repositories: RepositorySecurityStatus[]
  scanHistory: ScanHistoryItem[]
  portfolioRepos: PortfolioRepo[]
  loading: boolean
  error: string | null
  refreshing: boolean
  showAddRepoModal: boolean
  addingRepo: boolean
}

const REFRESH_INTERVAL = 30000 // 30 seconds

const SecurityDashboard: React.FC = () => {
  const [state, setState] = useState<SecurityDashboardState>({
    summary: null,
    repositories: [],
    scanHistory: [],
    portfolioRepos: [],
    loading: true,
    error: null,
    refreshing: false,
    showAddRepoModal: false,
    addingRepo: false,
  })

  // Form state for adding repos
  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [newRepoBranch, setNewRepoBranch] = useState('main')
  const [newRepoAutoScan, setNewRepoAutoScan] = useState(true)

  // Fetch portfolio summary
  const fetchSummary = useCallback(async (): Promise<PortfolioSummary | null> => {
    try {
      const response = await fetch('/api/v1/security/portfolio/summary')
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.statusText}`)
      }
      return await response.json()
    } catch (err) {
      console.error('Error fetching portfolio summary:', err)
      return null
    }
  }, [])

  // Fetch repositories
  const fetchRepositories = useCallback(async (): Promise<RepositorySecurityStatus[]> => {
    try {
      const response = await fetch('/api/v1/security/repositories')
      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`)
      }
      const data = await response.json()
      return data.repositories || []
    } catch (err) {
      console.error('Error fetching repositories:', err)
      return []
    }
  }, [])

  // Fetch scan history
  const fetchScanHistory = useCallback(async (): Promise<ScanHistoryItem[]> => {
    try {
      const response = await fetch('/api/v1/security/scan-history?limit=10')
      if (!response.ok) {
        throw new Error(`Failed to fetch scan history: ${response.statusText}`)
      }
      const data = await response.json()
      return data.history || []
    } catch (err) {
      console.error('Error fetching scan history:', err)
      return []
    }
  }, [])

  // Fetch portfolio repos
  const fetchPortfolioRepos = useCallback(async (): Promise<PortfolioRepo[]> => {
    try {
      const response = await fetch('/api/v1/security/portfolio/repos')
      if (!response.ok) {
        throw new Error(`Failed to fetch portfolio repos: ${response.statusText}`)
      }
      const data = await response.json()
      return data.data?.repositories || []
    } catch (err) {
      console.error('Error fetching portfolio repos:', err)
      return []
    }
  }, [])

  // Load all data
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setState(prev => ({ ...prev, refreshing: true }))
    } else {
      setState(prev => ({ ...prev, loading: true, error: null }))
    }

    try {
      const [summary, repositories, scanHistory, portfolioRepos] = await Promise.all([
        fetchSummary(),
        fetchRepositories(),
        fetchScanHistory(),
        fetchPortfolioRepos(),
      ])

      if (!summary) {
        throw new Error('Failed to load portfolio summary')
      }

      setState(prev => ({
        ...prev,
        summary,
        repositories,
        scanHistory,
        portfolioRepos,
        loading: false,
        error: null,
        refreshing: false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: err instanceof Error ? err.message : 'An unknown error occurred',
      }))
    }
  }, [fetchSummary, fetchRepositories, fetchScanHistory, fetchPortfolioRepos])

  // Initial load and refresh interval
  useEffect(() => {
    loadData()

    const intervalId = setInterval(() => {
      loadData(true)
    }, REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [loadData])

  // Portfolio repo action handlers
  const handleAddRepo = async () => {
    if (!newRepoUrl.trim()) return

    setState(prev => ({ ...prev, addingRepo: true }))
    try {
      const response = await fetch('/api/v1/security/portfolio/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newRepoUrl,
          branch: newRepoBranch,
          auto_scan: newRepoAutoScan,
        }),
      })

      if (response.ok) {
        setNewRepoUrl('')
        setNewRepoBranch('main')
        setNewRepoAutoScan(true)
        setState(prev => ({ ...prev, showAddRepoModal: false, addingRepo: false }))
        loadData(true)
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to add repository')
        setState(prev => ({ ...prev, addingRepo: false }))
      }
    } catch (err) {
      console.error('Error adding repository:', err)
      setState(prev => ({ ...prev, addingRepo: false }))
    }
  }

  const handleRemoveRepo = async (repoId: string) => {
    if (!confirm('Are you sure you want to remove this repository?')) return

    try {
      const response = await fetch(`/api/v1/security/portfolio/repos/${repoId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        loadData(true)
      }
    } catch (err) {
      console.error('Error removing repository:', err)
    }
  }

  const handleScanRepo = async (repoId: string) => {
    try {
      const response = await fetch(`/api/v1/security/portfolio/repos/${repoId}/scan`, {
        method: 'POST',
      })

      if (response.ok) {
        loadData(true)
      }
    } catch (err) {
      console.error('Error scanning repository:', err)
    }
  }

  // Action handlers
  const handleScanAll = async () => {
    try {
      const response = await fetch('/api/v1/security/scan/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        loadData(true)
      }
    } catch (err) {
      console.error('Error initiating scan:', err)
    }
  }

  const handleViewCritical = () => {
    // Navigate to critical issues view
    window.location.hash = '#/security/critical'
  }

  const handleExportReport = async () => {
    try {
      const response = await fetch('/api/v1/security/report/export')
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `security-report-${new Date().toISOString().split('T')[0]}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Error exporting report:', err)
    }
  }

  // Helper functions
  const getTrendIcon = (trend: TrendIndicator) => {
    if (trend.direction === 'up') {
      return <EuiIcon type="sortUp" color="danger" />
    } else if (trend.direction === 'down') {
      return <EuiIcon type="sortDown" color="success" />
    }
    return <EuiIcon type="minus" color="subdued" />
  }

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'healthy':
        return 'success'
      case 'warning':
        return 'warning'
      case 'critical':
        return 'danger'
      default:
        return 'warning'
    }
  }

  const getTimelineIcon = (eventType: string) => {
    switch (eventType) {
      case 'scan_completed':
        return 'check'
      case 'vulnerability_discovered':
        return 'alert'
      case 'fix_applied':
        return 'wrench'
      default:
        return 'dot'
    }
  }

  const getTimelineColor = (eventType: string): 'success' | 'warning' | 'danger' | 'primary' => {
    switch (eventType) {
      case 'scan_completed':
        return 'success'
      case 'vulnerability_discovered':
        return 'danger'
      case 'fix_applied':
        return 'primary'
      default:
        return 'warning'
    }
  }

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now.getTime() - time.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Loading state
  if (state.loading && !state.summary) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
            <EuiSpacer size="m" />
            <EuiText textAlign="center" color="subdued">
              Loading security dashboard...
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <EuiPageTemplate panelled={false}>
      <EuiPageHeader
        pageTitle="Security Dashboard"
        description="Portfolio-wide security status and vulnerability management"
        rightSideItems={[
          state.refreshing && <EuiLoadingSpinner size="m" key="spinner" />,
          <EuiButtonEmpty
            key="refresh"
            iconType="refresh"
            onClick={() => loadData(true)}
            disabled={state.refreshing}
          >
            Refresh
          </EuiButtonEmpty>,
        ]}
      />

      <EuiSpacer size="l" />

      {/* Error Callout */}
      {state.error && (
        <>
          <EuiCallOut title="Error loading security data" color="danger" iconType="alert">
            <p>{state.error}</p>
          </EuiCallOut>
          <EuiSpacer size="l" />
        </>
      )}

      {/* Summary Stats Panel */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={state.summary?.total_vulnerabilities || 0}
              description="Total Vulnerabilities"
              titleColor="primary"
              textAlign="center"
            >
              <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
                {state.summary?.trend && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={`${state.summary.trend.direction === 'up' ? '+' : ''}${state.summary.trend.value} (${state.summary.trend.percentage}%)`}
                    >
                      {getTrendIcon(state.summary.trend)}
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={state.summary?.vulnerability_counts?.critical || 0}
              description="Critical"
              titleColor="danger"
              textAlign="center"
            >
              <EuiIcon type="error" color="danger" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={state.summary?.vulnerability_counts?.high || 0}
              description="High"
              titleColor="warning"
              textAlign="center"
            >
              <EuiIcon type="alert" color="warning" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={`${state.summary?.repositories_scanned || 0}/${state.summary?.total_repositories || 0}`}
              description="Repos Scanned"
              titleColor="success"
              textAlign="center"
            >
              <EuiText size="xs" color="subdued">
                {state.summary?.scan_coverage_percentage || 0}% coverage
              </EuiText>
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiStat
              title={state.summary?.last_scan_time ? formatTimeAgo(state.summary.last_scan_time) : 'Never'}
              description="Last Scan"
              titleColor="subdued"
              textAlign="center"
            >
              <EuiIcon type="clock" color="subdued" />
            </EuiStat>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Main Content Area */}
      <EuiFlexGroup gutterSize="l">
        {/* Repository Health Grid */}
        <EuiFlexItem grow={2}>
          <EuiPanel hasBorder>
            <EuiTitle size="s">
              <h3>Repository Health</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>Security status by repository</p>
            </EuiText>

            <EuiSpacer size="m" />

            {state.repositories.length === 0 ? (
              <EuiCallOut title="No repositories found" color="warning" iconType="help">
                <p>No repositories have been scanned yet.</p>
              </EuiCallOut>
            ) : (
              <EuiFlexGrid columns={2} gutterSize="m">
                {state.repositories.map((repo) => (
                  <EuiFlexItem key={repo.repository_id}>
                    <EuiCard
                      layout="horizontal"
                      titleSize="xs"
                      title={
                        <EuiFlexGroup alignItems="center" gutterSize="s">
                          <EuiFlexItem grow={false}>
                            <EuiHealth color={getStatusColor(repo.status)} />
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <span>{repo.repository_name}</span>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      }
                      description={
                        <EuiFlexGroup gutterSize="xs" wrap>
                          {repo.vulnerability_counts.critical > 0 && (
                            <EuiFlexItem grow={false}>
                              <EuiBadge color="danger">
                                {repo.vulnerability_counts.critical} Critical
                              </EuiBadge>
                            </EuiFlexItem>
                          )}
                          {repo.vulnerability_counts.high > 0 && (
                            <EuiFlexItem grow={false}>
                              <EuiBadge color="warning">
                                {repo.vulnerability_counts.high} High
                              </EuiBadge>
                            </EuiFlexItem>
                          )}
                          {repo.vulnerability_counts.total === 0 && (
                            <EuiFlexItem grow={false}>
                              <EuiBadge color="success">No issues</EuiBadge>
                            </EuiFlexItem>
                          )}
                          <EuiFlexItem grow={false}>
                            <EuiText size="xs" color="subdued">
                              {formatTimeAgo(repo.last_scan_time)}
                            </EuiText>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      }
                      onClick={() => {
                        window.location.hash = `#/security/repository/${repo.repository_id}`
                      }}
                      hasBorder
                    />
                  </EuiFlexItem>
                ))}
              </EuiFlexGrid>
            )}
          </EuiPanel>
        </EuiFlexItem>

        {/* Right Column - Timeline and Actions */}
        <EuiFlexItem grow={1}>
          {/* Quick Actions Panel */}
          <EuiPanel hasBorder>
            <EuiTitle size="s">
              <h3>Quick Actions</h3>
            </EuiTitle>

            <EuiSpacer size="m" />

            <EuiFlexGroup direction="column" gutterSize="s">
              <EuiFlexItem>
                <EuiButton
                  fill
                  iconType="search"
                  onClick={handleScanAll}
                  fullWidth
                >
                  Scan All Repositories
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiButton
                  color="danger"
                  iconType="alert"
                  onClick={handleViewCritical}
                  fullWidth
                  disabled={(state.summary?.vulnerability_counts?.critical || 0) === 0}
                >
                  View Critical Issues ({state.summary?.vulnerability_counts?.critical || 0})
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiButtonEmpty
                  iconType="exportAction"
                  onClick={handleExportReport}
                >
                  Export Report
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>

          <EuiSpacer size="l" />

          {/* Manage GitHub Repositories */}
          <EuiPanel hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiTitle size="s">
                  <h3>GitHub Repositories</h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  iconType="plus"
                  fill
                  onClick={() => setState(prev => ({ ...prev, showAddRepoModal: true }))}
                >
                  Add Repo
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {/* Inline Add Repo Form */}
            {state.showAddRepoModal && (
              <EuiPanel paddingSize="m" hasBorder color="subdued">
                <EuiForm>
                  <EuiFormRow label="Repository URL" helpText="e.g., https://github.com/owner/repo">
                    <EuiFieldText
                      placeholder="https://github.com/owner/repo"
                      value={newRepoUrl}
                      onChange={e => setNewRepoUrl(e.target.value)}
                    />
                  </EuiFormRow>

                  <EuiFormRow label="Branch">
                    <EuiFieldText
                      placeholder="main"
                      value={newRepoBranch}
                      onChange={e => setNewRepoBranch(e.target.value)}
                    />
                  </EuiFormRow>

                  <EuiFormRow>
                    <EuiSwitch
                      label="Scan immediately after adding"
                      checked={newRepoAutoScan}
                      onChange={e => setNewRepoAutoScan(e.target.checked)}
                    />
                  </EuiFormRow>

                  <EuiSpacer size="m" />

                  <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="s"
                        onClick={() => setState(prev => ({ ...prev, showAddRepoModal: false }))}
                      >
                        Cancel
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        size="s"
                        fill
                        onClick={handleAddRepo}
                        isLoading={state.addingRepo}
                        disabled={!newRepoUrl.trim()}
                      >
                        Add
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiForm>
              </EuiPanel>
            )}

            {state.portfolioRepos.length === 0 && !state.showAddRepoModal ? (
              <EuiText color="subdued" textAlign="center">
                <p>No repositories added yet</p>
              </EuiText>
            ) : (
              <EuiFlexGroup direction="column" gutterSize="s">
                {state.portfolioRepos.map(repo => (
                  <EuiFlexItem key={repo.id}>
                    <EuiPanel paddingSize="s" hasBorder>
                      <EuiFlexGroup alignItems="center" gutterSize="s">
                        <EuiFlexItem>
                          <EuiText size="s">
                            <strong>{repo.owner}/{repo.name}</strong>
                          </EuiText>
                          <EuiText size="xs" color="subdued">
                            {repo.branch} · {repo.status}
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiFlexGroup gutterSize="xs">
                            <EuiFlexItem>
                              <EuiToolTip content="Scan repository">
                                <EuiButtonIcon
                                  iconType="search"
                                  aria-label="Scan"
                                  onClick={() => handleScanRepo(repo.id)}
                                />
                              </EuiToolTip>
                            </EuiFlexItem>
                            <EuiFlexItem>
                              <EuiToolTip content="Remove repository">
                                <EuiButtonIcon
                                  iconType="trash"
                                  aria-label="Remove"
                                  color="danger"
                                  onClick={() => handleRemoveRepo(repo.id)}
                                />
                              </EuiToolTip>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            )}
          </EuiPanel>

          <EuiSpacer size="l" />

          {/* Recent Activity Timeline */}
          <EuiPanel hasBorder>
            <EuiTitle size="s">
              <h3>Recent Activity</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>Latest security events</p>
            </EuiText>

            <EuiSpacer size="m" />

            {state.scanHistory.length === 0 ? (
              <EuiText color="subdued" textAlign="center">
                <p>No recent activity</p>
              </EuiText>
            ) : (
              <EuiTimeline>
                {state.scanHistory.map((item) => (
                  <EuiTimelineItem
                    key={item.scan_id}
                    icon={getTimelineIcon(item.event_type)}
                    iconAriaLabel={item.event_type}
                    verticalAlign="top"
                  >
                    <EuiFlexGroup direction="column" gutterSize="xs">
                      <EuiFlexItem>
                        <EuiText size="s">
                          <strong>{item.repository_name}</strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiFlexGroup gutterSize="xs" alignItems="center">
                          <EuiFlexItem grow={false}>
                            <EuiBadge color={getTimelineColor(item.event_type)}>
                              {item.event_type.replace(/_/g, ' ')}
                            </EuiBadge>
                          </EuiFlexItem>
                          {item.vulnerabilities_found > 0 && (
                            <EuiFlexItem grow={false}>
                              <EuiText size="xs" color="danger">
                                +{item.vulnerabilities_found}
                              </EuiText>
                            </EuiFlexItem>
                          )}
                          {item.vulnerabilities_fixed > 0 && (
                            <EuiFlexItem grow={false}>
                              <EuiText size="xs" color="success">
                                -{item.vulnerabilities_fixed} fixed
                              </EuiText>
                            </EuiFlexItem>
                          )}
                        </EuiFlexGroup>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="xs" color="subdued">
                          {formatTimeAgo(item.completed_at || item.started_at)}
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiTimelineItem>
                ))}
              </EuiTimeline>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Additional Stats Row */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiStat
                  title={`${state.summary?.avg_time_to_fix || 0}h`}
                  description="Avg Time to Fix"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={state.summary?.vulnerability_counts?.medium || 0}
                  description="Medium Issues"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={state.summary?.vulnerability_counts?.low || 0}
                  description="Low Issues"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

    </EuiPageTemplate>
  )
}

export default SecurityDashboard
