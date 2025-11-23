import { useState, useMemo } from 'react'
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiListGroup,
  EuiListGroupItem,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiBadge,
  EuiBasicTable,
  EuiHealth,
  EuiButton,
  EuiButtonEmpty,
  EuiFieldSearch,
  EuiIcon,
  EuiToolTip,
  EuiEmptyPrompt,
  EuiBasicTableColumn,
  Criteria,
} from '@elastic/eui'
import WorkflowDAG from './WorkflowDAG'
import WorkflowExecutionDetails from './WorkflowExecutionDetails'
import {
  useWorkflows,
  useWorkflowExecutions,
  useWorkflowTrigger,
  Workflow,
  WorkflowExecution,
} from '../../../hooks/useWorkflows'

const statusConfig = {
  pending: { color: 'hollow' as const, label: 'Pending', health: 'subdued' as const },
  running: { color: 'primary' as const, label: 'Running', health: 'primary' as const },
  completed: { color: 'success' as const, label: 'Completed', health: 'success' as const },
  failed: { color: 'danger' as const, label: 'Failed', health: 'danger' as const },
  cancelled: { color: 'warning' as const, label: 'Cancelled', health: 'warning' as const },
}

const WorkflowsPage = () => {
  // State
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [sortField, setSortField] = useState<keyof WorkflowExecution>('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Data fetching
  const { data: workflowsData, loading: workflowsLoading, error: workflowsError } = useWorkflows()
  const {
    data: executionsData,
    loading: executionsLoading,
    error: executionsError,
    refetch: refetchExecutions,
  } = useWorkflowExecutions(selectedWorkflow || undefined)
  const { trigger, loading: triggering, error: triggerError } = useWorkflowTrigger()

  // Filter workflows by search
  const filteredWorkflows = useMemo(() => {
    if (!workflowsData?.workflows) return []
    if (!searchQuery) return workflowsData.workflows

    const query = searchQuery.toLowerCase()
    return workflowsData.workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query)
    )
  }, [workflowsData?.workflows, searchQuery])

  // Get selected workflow data
  const selectedWorkflowData = useMemo(() => {
    if (!selectedWorkflow || !workflowsData?.workflows) return null
    return workflowsData.workflows.find((w) => w.name === selectedWorkflow) || null
  }, [selectedWorkflow, workflowsData?.workflows])

  // Sort executions
  const sortedExecutions = useMemo(() => {
    if (!executionsData?.executions) return []
    return [...executionsData.executions].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]
      if (aValue === undefined || aValue === null) return 1
      if (bValue === undefined || bValue === null) return -1
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [executionsData?.executions, sortField, sortDirection])

  // Handle workflow trigger
  const handleTrigger = async () => {
    if (!selectedWorkflow) return
    const result = await trigger(selectedWorkflow)
    if (result) {
      refetchExecutions()
      setSelectedExecution(result)
    }
  }

  // Handle step click in DAG
  const handleStepClick = (stepId: string) => {
    // Could expand to show step details or highlight in table
    console.log('Step clicked:', stepId)
  }

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // Execution table columns
  const executionColumns: EuiBasicTableColumn<WorkflowExecution>[] = [
    {
      field: 'id',
      name: 'Execution ID',
      sortable: true,
      truncateText: true,
      width: '180px',
      render: (id: string) => (
        <EuiToolTip content={id}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
            {id.slice(0, 12)}...
          </span>
        </EuiToolTip>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      width: '120px',
      render: (status: string) => {
        const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
        return <EuiHealth color={config.health}>{config.label}</EuiHealth>
      },
    },
    {
      field: 'trigger',
      name: 'Trigger',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'started_at',
      name: 'Started',
      sortable: true,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      field: 'duration_ms',
      name: 'Duration',
      sortable: true,
      render: formatDuration,
    },
    {
      name: 'Actions',
      width: '80px',
      actions: [
        {
          name: 'View',
          description: 'View execution details',
          icon: 'search',
          type: 'icon' as const,
          onClick: (execution: WorkflowExecution) => setSelectedExecution(execution),
        },
      ],
    },
  ]

  // Loading state
  if (workflowsLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 400 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    )
  }

  // Error state
  if (workflowsError) {
    return (
      <EuiCallOut title="Error loading workflows" color="danger" iconType="alert">
        <p>{workflowsError}</p>
      </EuiCallOut>
    )
  }

  return (
    <>
      <EuiFlexGroup gutterSize="l">
        {/* Sidebar - Workflow List */}
        <EuiFlexItem grow={1} style={{ maxWidth: 300 }}>
          <EuiPanel hasBorder>
            <EuiTitle size="s">
              <h3>Workflows</h3>
            </EuiTitle>
            <EuiSpacer size="m" />

            <EuiFieldSearch
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              isClearable
              fullWidth
            />
            <EuiSpacer size="m" />

            {filteredWorkflows.length === 0 ? (
              <EuiText color="subdued" textAlign="center">
                <p>No workflows found</p>
              </EuiText>
            ) : (
              <EuiListGroup flush>
                {filteredWorkflows.map((workflow) => (
                  <EuiListGroupItem
                    key={workflow.name}
                    label={
                      <EuiFlexGroup
                        alignItems="center"
                        gutterSize="s"
                        responsive={false}
                      >
                        <EuiFlexItem>
                          <EuiText size="s">
                            <strong>{workflow.name}</strong>
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="hollow">{workflow.steps.length}</EuiBadge>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    }
                    onClick={() => setSelectedWorkflow(workflow.name)}
                    isActive={selectedWorkflow === workflow.name}
                    extraAction={{
                      iconType: 'arrowRight',
                      iconSize: 's',
                      'aria-label': 'Select workflow',
                      alwaysShow: selectedWorkflow === workflow.name,
                    }}
                  />
                ))}
              </EuiListGroup>
            )}
          </EuiPanel>
        </EuiFlexItem>

        {/* Main Content */}
        <EuiFlexItem grow={3}>
          {!selectedWorkflow ? (
            <EuiPanel hasBorder>
              <EuiEmptyPrompt
                iconType="visVega"
                title={<h2>Select a Workflow</h2>}
                body={
                  <p>
                    Choose a workflow from the list to view its DAG visualization
                    and execution history.
                  </p>
                }
              />
            </EuiPanel>
          ) : (
            <>
              {/* Workflow Header */}
              <EuiPanel hasBorder paddingSize="m">
                <EuiFlexGroup
                  alignItems="center"
                  justifyContent="spaceBetween"
                  responsive={false}
                >
                  <EuiFlexItem>
                    <EuiFlexGroup alignItems="center" gutterSize="m">
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="visVega" size="l" />
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiTitle size="s">
                          <h3>{selectedWorkflow}</h3>
                        </EuiTitle>
                        {selectedWorkflowData?.description && (
                          <EuiText size="s" color="subdued">
                            {selectedWorkflowData.description}
                          </EuiText>
                        )}
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiButtonEmpty
                          onClick={refetchExecutions}
                          iconType="refresh"
                        >
                          Refresh
                        </EuiButtonEmpty>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButton
                          onClick={handleTrigger}
                          isLoading={triggering}
                          iconType="play"
                          color="primary"
                        >
                          Run Workflow
                        </EuiButton>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>

                {triggerError && (
                  <>
                    <EuiSpacer size="m" />
                    <EuiCallOut
                      title="Trigger error"
                      color="danger"
                      iconType="alert"
                      size="s"
                    >
                      <p>{triggerError}</p>
                    </EuiCallOut>
                  </>
                )}
              </EuiPanel>

              <EuiSpacer size="l" />

              {/* DAG Visualization */}
              <EuiPanel hasBorder>
                <EuiTitle size="xs">
                  <h4>Workflow DAG</h4>
                </EuiTitle>
                <EuiSpacer size="m" />

                {selectedWorkflowData ? (
                  <WorkflowDAG
                    steps={selectedWorkflowData.steps}
                    onStepClick={handleStepClick}
                    height={400}
                  />
                ) : (
                  <EuiFlexGroup
                    justifyContent="center"
                    alignItems="center"
                    style={{ height: 400 }}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="l" />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                )}
              </EuiPanel>

              <EuiSpacer size="l" />

              {/* Execution History */}
              <EuiPanel hasBorder>
                <EuiTitle size="xs">
                  <h4>Execution History</h4>
                </EuiTitle>
                <EuiSpacer size="m" />

                {executionsError && (
                  <>
                    <EuiCallOut
                      title="Error loading executions"
                      color="danger"
                      iconType="alert"
                      size="s"
                    >
                      <p>{executionsError}</p>
                    </EuiCallOut>
                    <EuiSpacer size="m" />
                  </>
                )}

                <EuiBasicTable
                  items={sortedExecutions.slice(
                    pageIndex * pageSize,
                    (pageIndex + 1) * pageSize
                  )}
                  columns={executionColumns}
                  loading={executionsLoading}
                  itemId="id"
                  sorting={{
                    sort: { field: sortField, direction: sortDirection },
                  }}
                  onChange={({ sort, page }: Criteria<WorkflowExecution>) => {
                    if (sort) {
                      setSortField(sort.field as keyof WorkflowExecution)
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
                    totalItemCount: sortedExecutions.length,
                    pageSizeOptions: [5, 10, 20, 50],
                  }}
                  noItemsMessage="No executions found"
                />
              </EuiPanel>
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Execution Details Flyout */}
      {selectedExecution && (
        <WorkflowExecutionDetails
          execution={selectedExecution}
          onClose={() => setSelectedExecution(null)}
          onRefresh={() => {
            refetchExecutions()
            // Update selected execution with fresh data
            const updated = executionsData?.executions.find(
              (e) => e.id === selectedExecution.id
            )
            if (updated) {
              setSelectedExecution(updated)
            }
          }}
        />
      )}
    </>
  )
}

export default WorkflowsPage
