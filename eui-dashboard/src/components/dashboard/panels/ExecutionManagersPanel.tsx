import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBasicTable,
  EuiBadge,
  EuiHealth,
  EuiText,
  EuiCallOut,
  EuiStat,
  EuiProgress,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiDescriptionList,
  EuiToolTip,
  Criteria,
  EuiBasicTableColumn,
} from '@elastic/eui'
import { getExecutionManagers } from '../../../services/dashboardApi'

interface ExecutionManager {
  id: string
  task_id: string
  status: 'active' | 'completed' | 'failed' | 'pending'
  workers_assigned: number
  workers_completed: number
  progress: number
  started_at: string
  completed_at?: string
  duration_ms?: number
}

const ExecutionManagersPanel = () => {
  const [managers, setManagers] = useState<ExecutionManager[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEM, setSelectedEM] = useState<ExecutionManager | null>(null)
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false)
  const [sortField, setSortField] = useState<keyof ExecutionManager>('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(5)

  // Sort managers
  const sortedManagers = [...managers].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    if (aValue === undefined || aValue === null) return 1
    if (bValue === undefined || bValue === null) return -1
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  useEffect(() => {
    const fetchData = async () => {
      const result = await getExecutionManagers()
      if (result.error) {
        setError(result.error)
      } else {
        setManagers(result.data?.execution_managers || [])
        setError(null)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const activeCount = managers.filter(m => m.status === 'active').length
  const completedCount = managers.filter(m => m.status === 'completed').length
  const successRate = managers.length > 0
    ? (completedCount / managers.length * 100).toFixed(1)
    : '0'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'primary'
      case 'completed': return 'success'
      case 'failed': return 'danger'
      case 'pending': return 'warning'
      default: return 'default'
    }
  }

  const columns: EuiBasicTableColumn<ExecutionManager>[] = [
    {
      field: 'id',
      name: 'EM ID',
      sortable: true,
      truncateText: true,
      width: '150px',
    },
    {
      field: 'task_id',
      name: 'Task',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: (status: string) => (
        <EuiHealth color={getStatusColor(status)}>{status}</EuiHealth>
      ),
    },
    {
      field: 'progress',
      name: 'Progress',
      render: (progress: number, item: ExecutionManager) => (
        <EuiToolTip content={`${item.workers_completed}/${item.workers_assigned} workers`}>
          <EuiProgress
            value={progress}
            max={100}
            size="s"
            color={item.status === 'completed' ? 'success' : 'primary'}
          />
        </EuiToolTip>
      ),
    },
    {
      field: 'workers_assigned',
      name: 'Workers',
      render: (count: number, item: ExecutionManager) => (
        <EuiText size="s">{item.workers_completed}/{count}</EuiText>
      ),
    },
    {
      field: 'started_at',
      name: 'Started',
      sortable: true,
      render: (date: string) => new Date(date).toLocaleTimeString(),
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'View',
          description: 'View details',
          icon: 'search',
          type: 'icon' as const,
          onClick: (em: ExecutionManager) => {
            setSelectedEM(em)
            setIsFlyoutVisible(true)
          },
        },
      ],
    },
  ]

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
    <>
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Execution Managers</h3></EuiTitle>

        <EuiSpacer size="m" />

        {error && (
          <>
            <EuiCallOut title="Error" color="danger" iconType="alert" size="s">
              <p>{error}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Stats */}
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem>
            <EuiStat title={managers.length} description="Total" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat title={activeCount} description="Active" titleColor="primary" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat title={completedCount} description="Completed" titleColor="success" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat title={`${successRate}%`} description="Success Rate" titleSize="s" />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Table */}
        <EuiBasicTable
          items={sortedManagers.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)}
          columns={columns}
          itemId="id"
          sorting={{
            sort: { field: sortField, direction: sortDirection },
          }}
          onChange={({ sort, page }: Criteria<ExecutionManager>) => {
            if (sort) {
              setSortField(sort.field as keyof ExecutionManager)
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
            totalItemCount: sortedManagers.length,
            pageSizeOptions: [5, 10, 20],
          }}
        />
      </EuiPanel>

      {/* Detail Flyout */}
      {isFlyoutVisible && selectedEM && (
        <EuiFlyout onClose={() => setIsFlyoutVisible(false)} size="s">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m"><h2>Execution Manager Details</h2></EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiDescriptionList
              listItems={[
                { title: 'ID', description: selectedEM.id },
                { title: 'Task ID', description: selectedEM.task_id },
                {
                  title: 'Status',
                  description: (
                    <EuiBadge color={getStatusColor(selectedEM.status)}>
                      {selectedEM.status}
                    </EuiBadge>
                  ),
                },
                { title: 'Progress', description: `${selectedEM.progress}%` },
                {
                  title: 'Workers',
                  description: `${selectedEM.workers_completed}/${selectedEM.workers_assigned}`,
                },
                {
                  title: 'Started',
                  description: new Date(selectedEM.started_at).toLocaleString(),
                },
                {
                  title: 'Completed',
                  description: selectedEM.completed_at
                    ? new Date(selectedEM.completed_at).toLocaleString()
                    : 'In progress',
                },
                {
                  title: 'Duration',
                  description: selectedEM.duration_ms
                    ? `${(selectedEM.duration_ms / 1000).toFixed(1)}s`
                    : 'N/A',
                },
              ]}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  )
}

export default ExecutionManagersPanel
