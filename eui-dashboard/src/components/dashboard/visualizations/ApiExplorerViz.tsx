import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiButton,
  EuiButtonEmpty,
  EuiAccordion,
  EuiBadge,
  EuiCode,
  EuiCodeBlock,
  EuiText,
  EuiCallOut,
  EuiStat,
  EuiTabs,
  EuiTab,
  EuiFieldSearch,
  EuiCopy,
  EuiHealth,
  EuiToolTip,
} from '@elastic/eui'

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  path: string
  description: string
  category: string
  params?: string
  body?: any
}

interface TestResult {
  status: 'pending' | 'success' | 'error'
  statusCode?: number
  responseTime?: number
  data?: any
  error?: string
}

const API_ENDPOINTS: Endpoint[] = [
  // Metrics & Health (3)
  { method: 'GET', path: '/api/health', description: 'Health check endpoint', category: 'Metrics & Health' },
  { method: 'GET', path: '/api/metrics', description: 'System metrics', category: 'Metrics & Health', params: '?period=last_24h' },
  { method: 'GET', path: '/api/metrics/history', description: 'Historical metrics data', category: 'Metrics & Health' },

  // Governance (5)
  { method: 'GET', path: '/api/governance/dashboard', description: 'Governance dashboard', category: 'Governance' },
  { method: 'GET', path: '/api/governance/compliance-report', description: 'Compliance report', category: 'Governance' },
  { method: 'GET', path: '/api/governance/compliance-check/:framework', description: 'Check specific framework', category: 'Governance' },
  { method: 'GET', path: '/api/governance/metrics', description: 'Governance metrics', category: 'Governance' },
  { method: 'GET', path: '/api/governance/trends', description: 'Governance trends', category: 'Governance' },

  // Workers & Tasks (5)
  { method: 'GET', path: '/api/workers', description: 'Get all active workers', category: 'Workers & Tasks' },
  { method: 'GET', path: '/api/tasks', description: 'Get all tasks', category: 'Workers & Tasks' },
  { method: 'GET', path: '/api/execution-managers', description: 'Get execution managers', category: 'Workers & Tasks' },
  { method: 'GET', path: '/api/streams', description: 'Get workforce streams', category: 'Workers & Tasks' },
  { method: 'GET', path: '/api/coordination/raw', description: 'Raw coordination data', category: 'Workers & Tasks' },

  // Events & Activity (3)
  { method: 'GET', path: '/api/events', description: 'System events log', category: 'Events & Activity', params: '?limit=50' },
  { method: 'GET', path: '/api/activity-feed', description: 'Activity feed', category: 'Events & Activity' },
  { method: 'GET', path: '/api/event-log/info', description: 'Event log file info', category: 'Events & Activity' },
  { method: 'POST', path: '/api/event-log/purge', description: 'Purge event log to archive', category: 'Events & Activity' },

  // Git Operations (3)
  { method: 'GET', path: '/api/git-operations', description: 'Git commit/push operations', category: 'Git Operations' },
  { method: 'GET', path: '/api/git-status', description: 'Git status', category: 'Git Operations' },
  { method: 'GET', path: '/api/git-info', description: 'Last commit info', category: 'Git Operations' },

  // Health Alerts (6)
  { method: 'GET', path: '/api/health-alerts', description: 'Get all health alerts', category: 'Health Alerts' },
  { method: 'POST', path: '/api/health-alerts/:id/resolve', description: 'Resolve an alert', category: 'Health Alerts' },
  { method: 'POST', path: '/api/health-alerts/:id/restart-worker', description: 'Restart worker for alert', category: 'Health Alerts' },
  { method: 'POST', path: '/api/health-alerts/:id/note', description: 'Add note to alert', category: 'Health Alerts' },
  { method: 'POST', path: '/api/health-alerts/:id/repair', description: 'Repair alert', category: 'Health Alerts' },
  { method: 'DELETE', path: '/api/health-alerts/:id', description: 'Delete an alert', category: 'Health Alerts' },

  // MoE Intelligence (12)
  { method: 'GET', path: '/api/moe-intelligence', description: 'MoE routing intelligence', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe-learning', description: 'MoE learning status', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/routing', description: 'MoE routing decisions', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/pool', description: 'Worker pool state', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/learning', description: 'Learning system metrics', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/accuracy', description: 'MoE routing accuracy', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/confidence-distribution', description: 'Confidence distribution', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/pool-utilization', description: 'Pool utilization stats', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/learning/deliverables', description: 'Learning deliverables', category: 'MoE Intelligence' },
  { method: 'GET', path: '/api/moe/learning/deliverables/:filename', description: 'Get specific deliverable', category: 'MoE Intelligence' },
  { method: 'POST', path: '/api/moe/learning/activate', description: 'Activate learning', category: 'MoE Intelligence' },
  { method: 'POST', path: '/api/moe/clear-routing-decisions', description: 'Clear routing decisions', category: 'MoE Intelligence' },

  // Daemon Status (10)
  { method: 'GET', path: '/api/daemon/status', description: 'Worker daemon status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/daemons/all', description: 'All daemon statuses', category: 'Daemon Status' },
  { method: 'GET', path: '/api/pm-daemon/status', description: 'PM daemon status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/health-daemon/status', description: 'Health daemon status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/metrics-daemon/status', description: 'Metrics daemon status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/coordinator-daemon/status', description: 'Coordinator daemon status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/integration-validator/status', description: 'Integration validator status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/learning-monitor/status', description: 'Learning monitor status', category: 'Daemon Status' },
  { method: 'GET', path: '/api/learning-monitor/events', description: 'Learning monitor events', category: 'Daemon Status' },
  { method: 'GET', path: '/api/dashboard-server/status', description: 'Dashboard server status', category: 'Daemon Status' },

  // Daemon Controls (20)
  { method: 'POST', path: '/api/daemon/control', description: 'Start/stop worker daemon', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/pm-daemon/control', description: 'Start/stop PM daemon', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/health-daemon/control', description: 'Start/stop health daemon', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/metrics-daemon/control', description: 'Start/stop metrics daemon', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/coordinator-daemon/control', description: 'Start/stop coordinator', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/integration-validator/control', description: 'Start/stop integration validator', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/learning-monitor/control', description: 'Start/stop learning monitor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/dashboard-server/control', description: 'Restart dashboard server', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/health-monitor/start', description: 'Start health monitor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/health-monitor/stop', description: 'Stop health monitor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/metrics-snapshot/start', description: 'Start metrics snapshot', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/metrics-snapshot/stop', description: 'Stop metrics snapshot', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/heartbeat-monitor/start', description: 'Start heartbeat monitor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/heartbeat-monitor/stop', description: 'Stop heartbeat monitor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/daemon-supervisor/start', description: 'Start daemon supervisor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/daemon-supervisor/stop', description: 'Stop daemon supervisor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/zombie-cleanup/start', description: 'Start zombie cleanup', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/zombie-cleanup/stop', description: 'Stop zombie cleanup', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/handoff-processor/start', description: 'Start handoff processor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/handoff-processor/stop', description: 'Stop handoff processor', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/threat-intel/start', description: 'Start threat intel', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/threat-intel/stop', description: 'Stop threat intel', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/backup/start', description: 'Start backup', category: 'Daemon Controls' },
  { method: 'POST', path: '/api/backup/stop', description: 'Stop backup', category: 'Daemon Controls' },

  // Dashboard Analytics (7)
  { method: 'GET', path: '/api/dashboard/analytics/summary', description: 'Analytics summary', category: 'Dashboard Analytics' },
  { method: 'GET', path: '/api/dashboard/analytics/trends', description: 'Analytics trends', category: 'Dashboard Analytics' },
  { method: 'GET', path: '/api/dashboard/visualizations/all', description: 'All visualizations', category: 'Dashboard Analytics' },
  { method: 'GET', path: '/api/dashboard/visualizations/health', description: 'Health visualizations', category: 'Dashboard Analytics' },
  { method: 'GET', path: '/api/dashboard/alerts/active', description: 'Active alerts', category: 'Dashboard Analytics' },
  { method: 'GET', path: '/api/dashboard/alerts/stats', description: 'Alert statistics', category: 'Dashboard Analytics' },
  { method: 'POST', path: '/api/dashboard/alerts/check', description: 'Check alerts', category: 'Dashboard Analytics' },

  // Optimizer (8)
  { method: 'GET', path: '/api/optimizer/scheduler/stats', description: 'Scheduler statistics', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/scheduler/balance', description: 'Scheduler balance', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/tokens/stats', description: 'Token statistics', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/tokens/forecast', description: 'Token forecast', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/pool/stats', description: 'Pool statistics', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/profile/stats', description: 'Profile statistics', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/profile/bottlenecks', description: 'Profile bottlenecks', category: 'Optimizer' },
  { method: 'GET', path: '/api/optimizer/profile/recommendations', description: 'Profile recommendations', category: 'Optimizer' },

  // Agentstudio (6)
  { method: 'GET', path: '/api/agentstudio/agents', description: 'Get all agents', category: 'Agentstudio' },
  { method: 'GET', path: '/api/agentstudio/agents/:id', description: 'Get agent by ID', category: 'Agentstudio' },
  { method: 'POST', path: '/api/agentstudio/agents', description: 'Create agent', category: 'Agentstudio' },
  { method: 'PATCH', path: '/api/agentstudio/agents/:id', description: 'Update agent', category: 'Agentstudio' },
  { method: 'GET', path: '/api/agentstudio/registry/summary', description: 'Registry summary', category: 'Agentstudio' },
  { method: 'GET', path: '/api/agentstudio/templates', description: 'Agent templates', category: 'Agentstudio' },

  // DDQD Testing (7)
  { method: 'GET', path: '/api/ddqd-testing', description: 'DDQD testing status', category: 'DDQD Testing' },
  { method: 'POST', path: '/api/ddqd/run', description: 'Run DDQD test', category: 'DDQD Testing' },
  { method: 'GET', path: '/api/ddqd/status/:testId', description: 'Get test status', category: 'DDQD Testing' },
  { method: 'POST', path: '/api/ddqd/stop/:testId', description: 'Stop test', category: 'DDQD Testing' },
  { method: 'GET', path: '/api/ddqd/active', description: 'Get active tests', category: 'DDQD Testing' },
  { method: 'GET', path: '/api/ddqd/history', description: 'Get test history', category: 'DDQD Testing' },
  { method: 'POST', path: '/api/ddqd/schedule', description: 'Schedule test', category: 'DDQD Testing' },
  { method: 'GET', path: '/api/ddqd/schedule', description: 'Get scheduled tests', category: 'DDQD Testing' },

  // Users (10)
  { method: 'GET', path: '/api/users', description: 'Get all users', category: 'Users' },
  { method: 'GET', path: '/api/users/stats', description: 'User statistics', category: 'Users' },
  { method: 'GET', path: '/api/users/:id', description: 'Get user by ID', category: 'Users' },
  { method: 'POST', path: '/api/users', description: 'Create user', category: 'Users' },
  { method: 'PUT', path: '/api/users/:id', description: 'Update user', category: 'Users' },
  { method: 'PATCH', path: '/api/users/:id', description: 'Partial update user', category: 'Users' },
  { method: 'DELETE', path: '/api/users/:id', description: 'Delete user', category: 'Users' },
  { method: 'POST', path: '/api/users/bulk', description: 'Bulk create users', category: 'Users' },
  { method: 'POST', path: '/api/users/:id/login', description: 'User login', category: 'Users' },

  // Logs (4)
  { method: 'GET', path: '/api/logs/stream', description: 'Stream logs (SSE)', category: 'Logs' },
  { method: 'GET', path: '/api/logs/available', description: 'Available log sources', category: 'Logs' },
  { method: 'GET', path: '/api/logs/tail', description: 'Tail log file', category: 'Logs' },

  // Terminal Settings (2)
  { method: 'GET', path: '/api/terminal-settings', description: 'Get terminal settings', category: 'Terminal Settings' },
  { method: 'POST', path: '/api/terminal-settings', description: 'Update terminal settings', category: 'Terminal Settings' },

  // PM & Health Reports (3)
  { method: 'POST', path: '/api/pm/state', description: 'Update PM state', category: 'Reports' },
  { method: 'POST', path: '/api/health/report', description: 'Submit health report', category: 'Reports' },
  { method: 'POST', path: '/api/metrics/report', description: 'Submit metrics report', category: 'Reports' },
]

const ApiExplorerViz = () => {
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
  const [selectedCodeLang, setSelectedCodeLang] = useState<'python' | 'javascript' | 'curl'>('python')
  const [searchQuery, setSearchQuery] = useState('')
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [testProgress, setTestProgress] = useState({ current: 0, total: 0 })
  const [requestHistory, setRequestHistory] = useState<any[]>([])

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('apiExplorerHistory')
    if (saved) {
      try {
        setRequestHistory(JSON.parse(saved))
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [])

  // Save history to localStorage
  const saveHistory = (history: any[]) => {
    localStorage.setItem('apiExplorerHistory', JSON.stringify(history.slice(-50)))
    setRequestHistory(history.slice(-50))
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'primary'
      case 'POST': return 'success'
      case 'DELETE': return 'danger'
      case 'PUT': return 'warning'
      default: return 'default'
    }
  }

  const testEndpoint = async (endpoint: Endpoint) => {
    const key = `${endpoint.method}:${endpoint.path}`
    setTestResults(prev => ({
      ...prev,
      [key]: { status: 'pending' }
    }))

    const startTime = Date.now()
    try {
      const response = await fetch(endpoint.path)
      const responseTime = Date.now() - startTime
      const data = await response.json()

      const result: TestResult = {
        status: response.ok ? 'success' : 'error',
        statusCode: response.status,
        responseTime,
        data
      }

      setTestResults(prev => ({ ...prev, [key]: result }))

      // Add to history
      const historyEntry = {
        method: endpoint.method,
        path: endpoint.path,
        statusCode: response.status,
        responseTime,
        timestamp: new Date().toISOString()
      }
      saveHistory([...requestHistory, historyEntry])

      return result
    } catch (error) {
      const result: TestResult = {
        status: 'error',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      setTestResults(prev => ({ ...prev, [key]: result }))
      return result
    }
  }

  const testAllGetEndpoints = async () => {
    const getEndpoints = API_ENDPOINTS.filter(e => e.method === 'GET')
    setIsTestingAll(true)
    setTestProgress({ current: 0, total: getEndpoints.length })

    for (let i = 0; i < getEndpoints.length; i++) {
      await testEndpoint(getEndpoints[i])
      setTestProgress({ current: i + 1, total: getEndpoints.length })
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setIsTestingAll(false)
  }

  const generateCode = (endpoint: Endpoint, lang: string) => {
    const url = `http://localhost:3000${endpoint.path}`

    switch (lang) {
      case 'python':
        return `import requests

response = requests.${endpoint.method.toLowerCase()}('${url}')
data = response.json()
print(data)`

      case 'javascript':
        return `const response = await fetch('${url}'${endpoint.method !== 'GET' ? `, {
  method: '${endpoint.method}'
}` : ''});
const data = await response.json();
console.log(data);`

      case 'curl':
        return `curl -X ${endpoint.method} '${url}'`

      default:
        return ''
    }
  }

  // Group endpoints by category
  const categories = API_ENDPOINTS.reduce((acc, endpoint) => {
    if (!acc[endpoint.category]) {
      acc[endpoint.category] = []
    }
    acc[endpoint.category].push(endpoint)
    return acc
  }, {} as Record<string, Endpoint[]>)

  // Filter endpoints
  const filteredCategories = Object.entries(categories).reduce((acc, [cat, endpoints]) => {
    const filtered = endpoints.filter(e =>
      !searchQuery ||
      e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    if (filtered.length > 0) {
      acc[cat] = filtered
    }
    return acc
  }, {} as Record<string, Endpoint[]>)

  // Stats
  const totalEndpoints = API_ENDPOINTS.length
  const testedCount = Object.keys(testResults).length
  const successCount = Object.values(testResults).filter(r => r.status === 'success').length

  return (
    <>
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s"><h3>API Explorer</h3></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={testAllGetEndpoints}
              isLoading={isTestingAll}
              size="s"
            >
              {isTestingAll ? `Testing ${testProgress.current}/${testProgress.total}...` : 'Test All GET'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Stats */}
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem>
            <EuiStat title={totalEndpoints} description="Total Endpoints" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat title={testedCount} description="Tested" titleColor="primary" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat title={successCount} description="Passed" titleColor="success" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={testedCount - successCount}
              description="Failed"
              titleColor={testedCount - successCount > 0 ? 'danger' : 'subdued'}
              titleSize="s"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Search */}
        <EuiFieldSearch
          placeholder="Search endpoints..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          isClearable
        />

        <EuiSpacer size="m" />

        {/* Endpoints by Category */}
        {Object.entries(filteredCategories).map(([category, endpoints]) => (
          <div key={category} style={{ marginBottom: 8 }}>
            <EuiAccordion
              id={category}
              buttonContent={
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText size="s"><strong>{category}</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{endpoints.length}</EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              initialIsOpen={true}
              paddingSize="s"
            >
              {endpoints.map(endpoint => {
                const key = `${endpoint.method}:${endpoint.path}`
                const result = testResults[key]

                return (
                  <div key={key} style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
                    <EuiFlexGroup alignItems="center" gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiBadge color={getMethodColor(endpoint.method)}>
                          {endpoint.method}
                        </EuiBadge>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s">
                          <code>{endpoint.path}</code>
                          <span style={{ color: '#999', marginLeft: 8 }}>{endpoint.description}</span>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        {result && (
                          <EuiHealth color={result.status === 'success' ? 'success' : result.status === 'error' ? 'danger' : 'subdued'}>
                            {result.status === 'pending' ? 'Testing...' :
                             result.statusCode ? `${result.statusCode} (${result.responseTime}ms)` :
                             result.error || 'Error'}
                          </EuiHealth>
                        )}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiFlexGroup gutterSize="xs">
                          <EuiFlexItem grow={false}>
                            <EuiButton
                              size="s"
                              onClick={() => testEndpoint(endpoint)}
                              isLoading={result?.status === 'pending'}
                            >
                              Test
                            </EuiButton>
                          </EuiFlexItem>
                          {result?.data && (
                            <EuiFlexItem grow={false}>
                              <EuiButton
                                size="s"
                                onClick={() => setSelectedEndpoint(endpoint)}
                              >
                                View
                              </EuiButton>
                            </EuiFlexItem>
                          )}
                        </EuiFlexGroup>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </div>
                )
              })}
            </EuiAccordion>
          </div>
        ))}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Response Viewer */}
      {selectedEndpoint && testResults[`${selectedEndpoint.method}:${selectedEndpoint.path}`]?.data && (
        <EuiPanel hasBorder>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h4>
                  <EuiBadge color={getMethodColor(selectedEndpoint.method)} style={{ marginRight: 8 }}>
                    {selectedEndpoint.method}
                  </EuiBadge>
                  {selectedEndpoint.path}
                </h4>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={() => setSelectedEndpoint(null)} size="s">
                Close
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          {/* Code Generation Tabs */}
          <EuiTabs size="s">
            <EuiTab isSelected={selectedCodeLang === 'python'} onClick={() => setSelectedCodeLang('python')}>
              Python
            </EuiTab>
            <EuiTab isSelected={selectedCodeLang === 'javascript'} onClick={() => setSelectedCodeLang('javascript')}>
              JavaScript
            </EuiTab>
            <EuiTab isSelected={selectedCodeLang === 'curl'} onClick={() => setSelectedCodeLang('curl')}>
              cURL
            </EuiTab>
          </EuiTabs>

          <EuiSpacer size="s" />

          <EuiCodeBlock language={selectedCodeLang === 'curl' ? 'bash' : selectedCodeLang} paddingSize="m">
            {generateCode(selectedEndpoint, selectedCodeLang)}
          </EuiCodeBlock>

          <EuiSpacer size="m" />

          <EuiTitle size="xs"><h5>Response</h5></EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock language="json" paddingSize="m" overflowHeight={300}>
            {JSON.stringify(testResults[`${selectedEndpoint.method}:${selectedEndpoint.path}`].data, null, 2)}
          </EuiCodeBlock>
        </EuiPanel>
      )}

      <EuiSpacer size="l" />

      {/* Request History */}
      {requestHistory.length > 0 && (
        <EuiPanel hasBorder>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs"><h4>Request History</h4></EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                onClick={() => {
                  localStorage.removeItem('apiExplorerHistory')
                  setRequestHistory([])
                }}
              >
                Clear History
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="s" />

          {requestHistory.slice(-10).reverse().map((entry, idx) => (
            <EuiFlexGroup key={idx} alignItems="center" gutterSize="s" style={{ padding: '4px 0' }}>
              <EuiFlexItem grow={false}>
                <EuiBadge color={getMethodColor(entry.method)}>{entry.method}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="xs"><code>{entry.path}</code></EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">{entry.responseTime}ms</EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={entry.statusCode < 400 ? 'success' : 'danger'}>
                  {entry.statusCode}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          ))}
        </EuiPanel>
      )}
    </>
  )
}

export default ApiExplorerViz
