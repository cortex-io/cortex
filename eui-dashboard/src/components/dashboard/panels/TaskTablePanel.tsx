import { useState, useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiBasicTable,
  EuiHealth,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldSearch,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiText,
  Criteria,
  EuiTableSortingType,
} from '@elastic/eui'
import { useTasks } from '../../../hooks/useDashboardData'

const TaskTablePanel = () => {
  const { data, loading, error } = useTasks()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const tasks = useMemo(() => {
    if (!data?.tasks) return []

    let filtered = data.tasks.filter((task: any) =>
      task.id?.toLowerCase().includes(search.toLowerCase()) ||
      task.title?.toLowerCase().includes(search.toLowerCase()) ||
      task.type?.toLowerCase().includes(search.toLowerCase())
    )

    return filtered.sort((a: any, b: any) => {
      const aVal = a[sortField] || ''
      const bVal = b[sortField] || ''
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, search, sortField, sortDirection])

  const columns = [
    {
      field: 'id',
      name: 'Task ID',
      sortable: true,
      truncateText: true,
      width: '150px',
    },
    {
      field: 'title',
      name: 'Title',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      width: '120px',
      render: (status: string) => {
        const colors: Record<string, string> = {
          pending: 'warning',
          assigned: 'primary',
          in_progress: 'primary',
          completed: 'success',
          failed: 'danger',
          cancelled: 'subdued',
        }
        return <EuiHealth color={colors[status] || 'subdued'}>{status}</EuiHealth>
      },
    },
    {
      field: 'priority',
      name: 'Priority',
      sortable: true,
      width: '100px',
      render: (priority: string) => {
        const colors: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
          low: 'default',
          normal: 'primary',
          high: 'warning',
          critical: 'danger',
        }
        return <EuiBadge color={colors[priority] || 'default'}>{priority}</EuiBadge>
      },
    },
    {
      field: 'assigned_to',
      name: 'Assigned To',
      sortable: true,
      truncateText: true,
      width: '150px',
    },
    {
      field: 'created_at',
      name: 'Created',
      sortable: true,
      width: '150px',
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
  ]

  const sorting: EuiTableSortingType<any> = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  }

  const onTableChange = ({ sort }: Criteria<any>) => {
    if (sort) {
      setSortField(sort.field as string)
      setSortDirection(sort.direction)
    }
  }

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

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Task Queue</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s"><h3>Task Queue ({tasks.length})</h3></EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 300 }}>
          <EuiFieldSearch
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            isClearable
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiBasicTable
        items={tasks.slice(0, 20)}
        columns={columns}
        sorting={sorting}
        onChange={onTableChange}
        tableLayout="fixed"
      />
    </EuiPanel>
  )
}

export default TaskTablePanel
