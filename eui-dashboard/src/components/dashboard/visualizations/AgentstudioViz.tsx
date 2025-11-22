import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBasicTable,
  EuiButton,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiBadge,
  EuiHealth,
  EuiText,
  EuiCallOut,
  EuiStat,
  EuiFieldSearch,
  EuiCard,
  EuiIcon,
  EuiDescriptionList,
  EuiTabs,
  EuiTab,
  EuiCode,
  Criteria,
  EuiBasicTableColumn,
} from '@elastic/eui'
import {
  getAgentstudioAgents,
  getAgentstudioAgent,
  getAgentstudioRegistrySummary,
  getAgentstudioTemplates,
} from '../../../services/dashboardApi'

interface Agent {
  id: string
  name: string
  type: string
  status: 'active' | 'inactive' | 'error'
  version: string
  tasks_completed: number
  success_rate: number
  created_at: string
  last_active: string
}

interface Template {
  id: string
  name: string
  description: string
  category: string
  version: string
  downloads: number
}

interface RegistrySummary {
  total_agents: number
  active_agents: number
  total_tasks: number
  avg_success_rate: number
}

const AgentstudioViz = () => {
  const [agents, setAgents] = useState<Agent[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [summary, setSummary] = useState<RegistrySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<'agents' | 'templates'>('agents')

  // Flyout state
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)
  const [loadingAgent, setLoadingAgent] = useState(false)

  // Sorting and pagination state
  const [sortField, setSortField] = useState<keyof Agent>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [agentsResult, templatesResult, summaryResult] = await Promise.all([
          getAgentstudioAgents(),
          getAgentstudioTemplates(),
          getAgentstudioRegistrySummary(),
        ])

        if (agentsResult.data) setAgents(agentsResult.data.agents || [])
        if (templatesResult.data) setTemplates(templatesResult.data.templates || [])
        if (summaryResult.data) setSummary(summaryResult.data)

        setError(null)
      } catch (err) {
        setError('Failed to fetch Agentstudio data')
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Open agent detail flyout
  const openAgentDetail = async (agent: Agent) => {
    setIsFlyoutVisible(true)
    setLoadingAgent(true)
    const result = await getAgentstudioAgent(agent.id)
    if (result.data) {
      setSelectedAgent(result.data)
    } else {
      setSelectedAgent(agent)
    }
    setLoadingAgent(false)
  }

  // Filter agents by search
  const filteredAgents = agents.filter(agent => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.type.toLowerCase().includes(query) ||
      agent.id.toLowerCase().includes(query)
    )
  })

  // Sort filtered agents
  const sortedAgents = [...filteredAgents].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    if (aValue === undefined || aValue === null) return 1
    if (bValue === undefined || bValue === null) return -1
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Filter templates by search
  const filteredTemplates = templates.filter(template => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      template.name.toLowerCase().includes(query) ||
      template.category.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query)
    )
  })

  // Agent table columns
  const agentColumns: EuiBasicTableColumn<Agent>[] = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'type',
      name: 'Type',
      sortable: true,
      render: (type: string) => <EuiBadge color="hollow">{type}</EuiBadge>,
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: (status: string) => {
        const color = status === 'active' ? 'success' : status === 'inactive' ? 'subdued' : 'danger'
        return <EuiHealth color={color}>{status}</EuiHealth>
      },
    },
    {
      field: 'tasks_completed',
      name: 'Tasks',
      sortable: true,
    },
    {
      field: 'success_rate',
      name: 'Success Rate',
      sortable: true,
      render: (rate: number) => (
        <EuiText size="s" color={rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'danger'}>
          {rate?.toFixed(1)}%
        </EuiText>
      ),
    },
    {
      field: 'version',
      name: 'Version',
      sortable: true,
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'View',
          description: 'View agent details',
          icon: 'search',
          type: 'icon' as const,
          onClick: (agent: Agent) => openAgentDetail(agent),
        },
      ],
    },
  ]

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <>
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Agentstudio</h3></EuiTitle>

        <EuiSpacer size="m" />

        {error && (
          <>
            <EuiCallOut title="Error" color="danger" iconType="alert" size="s">
              <p>{error}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Summary Stats */}
        {summary && (
          <>
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem>
                <EuiStat
                  title={summary.total_agents ?? 0}
                  description="Total Agents"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={summary.active_agents ?? 0}
                  description="Active"
                  titleColor="success"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={summary.total_tasks ?? 0}
                  description="Total Tasks"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={summary.avg_success_rate != null ? `${summary.avg_success_rate.toFixed(1)}%` : 'N/A'}
                  description="Avg Success"
                  titleColor={(summary.avg_success_rate ?? 0) >= 90 ? 'success' : 'warning'}
                  titleSize="s"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Tabs */}
        <EuiTabs>
          <EuiTab
            isSelected={selectedTab === 'agents'}
            onClick={() => setSelectedTab('agents')}
          >
            Agents ({agents.length})
          </EuiTab>
          <EuiTab
            isSelected={selectedTab === 'templates'}
            onClick={() => setSelectedTab('templates')}
          >
            Templates ({templates.length})
          </EuiTab>
        </EuiTabs>

        <EuiSpacer size="m" />

        {/* Search */}
        <EuiFieldSearch
          placeholder={selectedTab === 'agents' ? 'Search agents...' : 'Search templates...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          isClearable
        />

        <EuiSpacer size="m" />

        {/* Agents Table */}
        {selectedTab === 'agents' && (
          <EuiBasicTable
            items={sortedAgents.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)}
            columns={agentColumns}
            itemId="id"
            sorting={{
              sort: {
                field: sortField,
                direction: sortDirection,
              },
            }}
            onChange={({ sort, page }: Criteria<Agent>) => {
              if (sort) {
                setSortField(sort.field as keyof Agent)
                setSortDirection(sort.direction)
              }
              if (page) {
                setPageIndex(page.index)
                setPageSize(page.size)
              }
            }}
            pagination={{
              pageIndex,
              pageSize,
              totalItemCount: sortedAgents.length,
              pageSizeOptions: [5, 10, 20],
            }}
          />
        )}

        {/* Templates Grid */}
        {selectedTab === 'templates' && (
          <EuiFlexGroup wrap gutterSize="m">
            {filteredTemplates.map((template) => (
              <EuiFlexItem key={template.id} style={{ minWidth: 250, maxWidth: 300 }}>
                <EuiCard
                  title={template.name}
                  titleSize="xs"
                  description={template.description}
                  footer={
                    <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">{template.category}</EuiBadge>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs" color="subdued">v{template.version}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  }
                >
                  <EuiButton size="s" fullWidth>
                    Use Template
                  </EuiButton>
                </EuiCard>
              </EuiFlexItem>
            ))}
            {filteredTemplates.length === 0 && (
              <EuiFlexItem>
                <EuiText color="subdued" textAlign="center">
                  <p>No templates found</p>
                </EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        )}
      </EuiPanel>

      {/* Agent Detail Flyout */}
      {isFlyoutVisible && (
        <EuiFlyout onClose={() => setIsFlyoutVisible(false)} size="m">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2>{selectedAgent?.name || 'Agent Details'}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {loadingAgent ? (
              <EuiFlexGroup justifyContent="center">
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="l" />
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : selectedAgent ? (
              <>
                <EuiDescriptionList
                  listItems={[
                    { title: 'ID', description: selectedAgent.id },
                    { title: 'Type', description: <EuiBadge>{selectedAgent.type}</EuiBadge> },
                    {
                      title: 'Status',
                      description: (
                        <EuiHealth
                          color={
                            selectedAgent.status === 'active' ? 'success' :
                            selectedAgent.status === 'inactive' ? 'subdued' : 'danger'
                          }
                        >
                          {selectedAgent.status}
                        </EuiHealth>
                      ),
                    },
                    { title: 'Version', description: selectedAgent.version },
                    { title: 'Tasks Completed', description: selectedAgent.tasks_completed },
                    {
                      title: 'Success Rate',
                      description: `${selectedAgent.success_rate?.toFixed(1)}%`,
                    },
                    {
                      title: 'Created',
                      description: new Date(selectedAgent.created_at).toLocaleString(),
                    },
                    {
                      title: 'Last Active',
                      description: selectedAgent.last_active
                        ? new Date(selectedAgent.last_active).toLocaleString()
                        : 'Never',
                    },
                  ]}
                />
                {selectedAgent.config && (
                  <>
                    <EuiSpacer size="m" />
                    <EuiTitle size="xs"><h4>Configuration</h4></EuiTitle>
                    <EuiSpacer size="s" />
                    <EuiCode language="json">
                      {JSON.stringify(selectedAgent.config, null, 2)}
                    </EuiCode>
                  </>
                )}
              </>
            ) : (
              <EuiText color="subdued">No agent data available</EuiText>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  )
}

export default AgentstudioViz
