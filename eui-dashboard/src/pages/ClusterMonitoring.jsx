import React, { useState, useEffect } from 'react'
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiText,
  EuiFlexGrid,
  EuiFlexItem,
  EuiCard,
  EuiSpacer,
  EuiStat,
  EuiProgress,
  EuiTable,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableBody,
  EuiTableRow,
  EuiTableRowCell,
  EuiBadge,
  EuiCallOut,
  EuiPanel,
  EuiHealth,
  EuiIcon,
  EuiButton,
  EuiFlexGroup,
  EuiTabs,
  EuiTab,
  EuiLoadingSpinner
} from '@elastic/eui'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export const ClusterMonitoring = () => {
  const [selectedTab, setSelectedTab] = useState(0)
  const [clusterHealth, setClusterHealth] = useState(null)
  const [pods, setPods] = useState([])
  const [services, setServices] = useState([])
  const [deployments, setDeployments] = useState([])
  const [events, setEvents] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch cluster health data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Simulate K3s API calls
        // In production, these would call the actual Kubernetes API via a proxy
        const healthResponse = await fetch('/api/health')
        const healthData = await healthResponse.json()
        setClusterHealth(healthData)

        const metricsResponse = await fetch('/api/metrics')
        const metricsData = await metricsResponse.json()
        setMetrics(metricsData)

        // Mock pod data (would be replaced with real K8s API data)
        const mockPods = [
          { name: 'cortex-coordinator-0', status: 'Running', cpu: '150m', memory: '512Mi', restarts: 0, age: '5d' },
          { name: 'cortex-development-0', status: 'Running', cpu: '200m', memory: '768Mi', restarts: 0, age: '5d' },
          { name: 'cortex-security-0', status: 'Running', cpu: '100m', memory: '256Mi', restarts: 0, age: '5d' },
          { name: 'cortex-cicd-0', status: 'Running', cpu: '180m', memory: '512Mi', restarts: 0, age: '5d' },
          { name: 'cortex-inventory-0', status: 'Running', cpu: '120m', memory: '384Mi', restarts: 0, age: '5d' }
        ]
        setPods(mockPods)

        // Mock services
        const mockServices = [
          { name: 'dashboard', type: 'LoadBalancer', clusterIP: '10.43.1.100', externalIP: '10.88.145.201', ports: '80' },
          { name: 'api', type: 'ClusterIP', clusterIP: '10.43.1.101', externalIP: 'None', ports: '3000' },
          { name: 'metrics', type: 'ClusterIP', clusterIP: '10.43.1.102', externalIP: 'None', ports: '9090' }
        ]
        setServices(mockServices)

        // Mock deployments
        const mockDeployments = [
          { name: 'cortex-masters', desired: 5, current: 5, ready: 5, available: 5 },
          { name: 'cortex-dashboard', desired: 1, current: 1, ready: 1, available: 1 }
        ]
        setDeployments(mockDeployments)

        // Mock events
        const mockEvents = [
          { type: 'Normal', reason: 'Started', message: 'Started container cortex-coordinator', timestamp: new Date(Date.now() - 300000).toISOString() },
          { type: 'Normal', reason: 'Pulled', message: 'Container image cortex:latest already present', timestamp: new Date(Date.now() - 600000).toISOString() },
          { type: 'Normal', reason: 'Created', message: 'Created container cortex-development', timestamp: new Date(Date.now() - 900000).toISOString() }
        ]
        setEvents(mockEvents)

        setError(null)
      } catch (err) {
        console.error('Error fetching cluster data:', err)
        setError('Failed to fetch cluster monitoring data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Tab content
  const tabs = [
    {
      id: 'overview',
      name: 'Overview',
      content: <OverviewTab clusterHealth={clusterHealth} metrics={metrics} />
    },
    {
      id: 'pods',
      name: 'Pods',
      content: <PodsTab pods={pods} />
    },
    {
      id: 'services',
      name: 'Services & Endpoints',
      content: <ServicesTab services={services} />
    },
    {
      id: 'deployments',
      name: 'Deployments',
      content: <DeploymentsTab deployments={deployments} />
    },
    {
      id: 'events',
      name: 'Events',
      content: <EventsTab events={events} />
    }
  ]

  if (loading && !clusterHealth) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: '400px' }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageBody>
      </EuiPage>
    )
  }

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>K3s Cortex Cluster Monitoring</h1>
            </EuiTitle>
            <EuiText color="subdued">
              Real-time cluster health and pod status dashboard
            </EuiText>
          </EuiPageHeaderSection>
          <EuiPageHeaderSection side="right">
            <EuiButton iconType="refresh" onClick={() => window.location.reload()}>
              Refresh
            </EuiButton>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        {error && (
          <>
            <EuiCallOut title="Error" color="danger" iconType="alert">
              {error}
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}

        <EuiSpacer />

        {/* Quick Status Cards */}
        <EuiFlexGrid columns={4}>
          <EuiFlexItem>
            <EuiCard
              icon={<EuiIcon size="xl" type="compute" />}
              title="Cluster Status"
              description={clusterHealth?.status || 'Unknown'}
              footer={
                <EuiHealth color={clusterHealth?.status === 'healthy' ? 'success' : 'warning'}>
                  {clusterHealth?.status === 'healthy' ? 'All systems operational' : 'Issues detected'}
                </EuiHealth>
              }
            />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiStat
              title={metrics?.active_workers || 0}
              description="Active Workers"
              titleSize="l"
              textAlign="center"
              description={`${metrics?.success_rate || 0}% success rate`}
            />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiStat
              title={pods.length}
              description="Running Pods"
              titleSize="l"
              textAlign="center"
            />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiStat
              title={services.length}
              description="Services"
              titleSize="l"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGrid>

        <EuiSpacer size="l" />

        {/* Tabs */}
        <EuiTabs>
          {tabs.map((tab, index) => (
            <EuiTab
              key={tab.id}
              onClick={() => setSelectedTab(index)}
              isSelected={index === selectedTab}
            >
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>

        <EuiSpacer />

        {tabs[selectedTab].content}
      </EuiPageBody>
    </EuiPage>
  )
}

// Overview Tab
const OverviewTab = ({ clusterHealth, metrics }) => (
  <div>
    <EuiFlexGrid columns={2}>
      <EuiFlexItem>
        <EuiPanel>
          <EuiTitle size="s">
            <h3>Cluster Health Summary</h3>
          </EuiTitle>
          <EuiSpacer />
          <div style={{ minHeight: '300px' }}>
            {/* Mock resource chart */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { name: 'CPU', usage: 45 },
                { name: 'Memory', usage: 62 },
                { name: 'Disk', usage: 38 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="usage" fill="#1EA593" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiPanel>
          <EuiTitle size="s">
            <h3>Cluster Metrics</h3>
          </EuiTitle>
          <EuiSpacer />
          <div>
            <EuiText>
              <p><strong>Active Workers:</strong> {metrics?.active_workers || 0}</p>
              <p><strong>Total Tasks:</strong> {metrics?.total_tasks || 0}</p>
              <p><strong>Completed Tasks:</strong> {metrics?.completed_tasks || 0}</p>
              <p><strong>Success Rate:</strong> {metrics?.success_rate || 0}%</p>
              <p><strong>Tokens Available:</strong> {metrics?.tokens_available || 0}</p>
            </EuiText>
          </div>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGrid>

    <EuiSpacer />

    <EuiPanel>
      <EuiTitle size="s">
        <h3>Endpoints</h3>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGrid columns={2}>
        <EuiFlexItem>
          <EuiText>
            <h4>Dashboard</h4>
            <p><code>http://10.88.145.201/</code></p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText>
            <h4>API Server</h4>
            <p><code>http://10.88.145.201:3004/api</code></p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGrid>
    </EuiPanel>
  </div>
)

// Pods Tab
const PodsTab = ({ pods }) => (
  <EuiPanel>
    <EuiTitle size="s">
      <h3>Cortex Pods ({pods.length})</h3>
    </EuiTitle>
    <EuiSpacer />
    <EuiTable>
      <EuiTableHeader>
        <EuiTableHeaderCell>Pod Name</EuiTableHeaderCell>
        <EuiTableHeaderCell>Status</EuiTableHeaderCell>
        <EuiTableHeaderCell>CPU</EuiTableHeaderCell>
        <EuiTableHeaderCell>Memory</EuiTableHeaderCell>
        <EuiTableHeaderCell>Restarts</EuiTableHeaderCell>
        <EuiTableHeaderCell>Age</EuiTableHeaderCell>
      </EuiTableHeader>
      <EuiTableBody>
        {pods.map((pod, index) => (
          <EuiTableRow key={index}>
            <EuiTableRowCell>{pod.name}</EuiTableRowCell>
            <EuiTableRowCell>
              <EuiBadge color="success">{pod.status}</EuiBadge>
            </EuiTableRowCell>
            <EuiTableRowCell>{pod.cpu}</EuiTableRowCell>
            <EuiTableRowCell>{pod.memory}</EuiTableRowCell>
            <EuiTableRowCell>{pod.restarts}</EuiTableRowCell>
            <EuiTableRowCell>{pod.age}</EuiTableRowCell>
          </EuiTableRow>
        ))}
      </EuiTableBody>
    </EuiTable>
  </EuiPanel>
)

// Services Tab
const ServicesTab = ({ services }) => (
  <EuiPanel>
    <EuiTitle size="s">
      <h3>Services & Endpoints</h3>
    </EuiTitle>
    <EuiSpacer />
    <EuiTable>
      <EuiTableHeader>
        <EuiTableHeaderCell>Service Name</EuiTableHeaderCell>
        <EuiTableHeaderCell>Type</EuiTableHeaderCell>
        <EuiTableHeaderCell>Cluster IP</EuiTableHeaderCell>
        <EuiTableHeaderCell>External IP</EuiTableHeaderCell>
        <EuiTableHeaderCell>Ports</EuiTableHeaderCell>
      </EuiTableHeader>
      <EuiTableBody>
        {services.map((svc, index) => (
          <EuiTableRow key={index}>
            <EuiTableRowCell>{svc.name}</EuiTableRowCell>
            <EuiTableRowCell>{svc.type}</EuiTableRowCell>
            <EuiTableRowCell><code>{svc.clusterIP}</code></EuiTableRowCell>
            <EuiTableRowCell><code>{svc.externalIP}</code></EuiTableRowCell>
            <EuiTableRowCell>{svc.ports}</EuiTableRowCell>
          </EuiTableRow>
        ))}
      </EuiTableBody>
    </EuiTable>
  </EuiPanel>
)

// Deployments Tab
const DeploymentsTab = ({ deployments }) => (
  <EuiPanel>
    <EuiTitle size="s">
      <h3>Deployments</h3>
    </EuiTitle>
    <EuiSpacer />
    <EuiTable>
      <EuiTableHeader>
        <EuiTableHeaderCell>Deployment</EuiTableHeaderCell>
        <EuiTableHeaderCell>Desired</EuiTableHeaderCell>
        <EuiTableHeaderCell>Current</EuiTableHeaderCell>
        <EuiTableHeaderCell>Ready</EuiTableHeaderCell>
        <EuiTableHeaderCell>Available</EuiTableHeaderCell>
      </EuiTableHeader>
      <EuiTableBody>
        {deployments.map((dep, index) => (
          <EuiTableRow key={index}>
            <EuiTableRowCell>{dep.name}</EuiTableRowCell>
            <EuiTableRowCell>{dep.desired}</EuiTableRowCell>
            <EuiTableRowCell>{dep.current}</EuiTableRowCell>
            <EuiTableRowCell>
              <EuiHealth color={dep.ready === dep.desired ? 'success' : 'warning'}>
                {dep.ready}/{dep.desired}
              </EuiHealth>
            </EuiTableRowCell>
            <EuiTableRowCell>
              <EuiHealth color={dep.available === dep.desired ? 'success' : 'warning'}>
                {dep.available}/{dep.desired}
              </EuiHealth>
            </EuiTableRowCell>
          </EuiTableRow>
        ))}
      </EuiTableBody>
    </EuiTable>
  </EuiPanel>
)

// Events Tab
const EventsTab = ({ events }) => (
  <EuiPanel>
    <EuiTitle size="s">
      <h3>Recent Cluster Events</h3>
    </EuiTitle>
    <EuiSpacer />
    <EuiTable>
      <EuiTableHeader>
        <EuiTableHeaderCell>Type</EuiTableHeaderCell>
        <EuiTableHeaderCell>Reason</EuiTableHeaderCell>
        <EuiTableHeaderCell>Message</EuiTableHeaderCell>
        <EuiTableHeaderCell>Timestamp</EuiTableHeaderCell>
      </EuiTableHeader>
      <EuiTableBody>
        {events.map((event, index) => (
          <EuiTableRow key={index}>
            <EuiTableRowCell>
              <EuiBadge color={event.type === 'Normal' ? 'primary' : 'warning'}>
                {event.type}
              </EuiBadge>
            </EuiTableRowCell>
            <EuiTableRowCell>{event.reason}</EuiTableRowCell>
            <EuiTableRowCell>{event.message}</EuiTableRowCell>
            <EuiTableRowCell>{new Date(event.timestamp).toLocaleString()}</EuiTableRowCell>
          </EuiTableRow>
        ))}
      </EuiTableBody>
    </EuiTable>
  </EuiPanel>
)

export default ClusterMonitoring
