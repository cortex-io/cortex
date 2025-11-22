/**
 * Agent Table component with sorting, filtering, and pagination
 * Following Elastic best practices for data tables
 */

import React, { useState, useMemo } from 'react'
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiSearchBar,
  EuiBadge,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonIcon,
  EuiToolTip,
  Criteria,
  Query,
  Pagination,
} from '@elastic/eui'
import { Panel } from '../common/Panel'
import { StatusIndicator } from '../visualizations/StatusIndicator'
import { formatDuration, formatRelativeTime, formatAgentId } from '../common/formatters'
import { exportToCSV } from '../../utils/exportData'

interface AgentTask {
  id: string
  agent: string
  agentType: string
  task: string
  status: 'active' | 'completed' | 'failed' | 'pending' | 'idle'
  duration: number
  timestamp: Date | string
  source: string
}

interface AgentTableProps {
  data: AgentTask[]
  loading?: boolean
  error?: string | null
  title?: string
  onTaskClick?: (task: AgentTask) => void
  onRetry?: (taskId: string) => void
  onCancel?: (taskId: string) => void
  pageSize?: number
}

export const AgentTable: React.FC<AgentTableProps> = ({
  data,
  loading = false,
  error = null,
  title = 'Recent Agent Tasks',
  onTaskClick,
  onRetry,
  onCancel,
  pageSize = 10,
}) => {
  const [pageIndex, setPageIndex] = useState(0)
  const [sortField, setSortField] = useState<keyof AgentTask>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [query, setQuery] = useState<Query | null>(null)

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!query) return data

    return data.filter((item) => {
      const queryText = query.text?.toLowerCase() || ''
      if (!queryText) return true

      return (
        item.agent.toLowerCase().includes(queryText) ||
        item.task.toLowerCase().includes(queryText) ||
        item.status.toLowerCase().includes(queryText) ||
        item.source.toLowerCase().includes(queryText)
      )
    })
  }, [data, query])

  // Sort data
  const sortedData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === 'asc'
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime()
      }

      return 0
    })

    return sorted
  }, [filteredData, sortField, sortDirection])

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = pageIndex * pageSize
    return sortedData.slice(startIndex, startIndex + pageSize)
  }, [sortedData, pageIndex, pageSize])

  // Table columns
  const columns: EuiBasicTableColumn<AgentTask>[] = [
    {
      field: 'agent',
      name: 'Agent',
      sortable: true,
      truncateText: true,
      render: (agent: string) => (
        <EuiToolTip content={agent}>
          <span>{formatAgentId(agent)}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'agentType',
      name: 'Type',
      sortable: true,
      width: '100px',
      render: (type: string) => (
        <EuiBadge color="hollow">{type}</EuiBadge>
      ),
    },
    {
      field: 'task',
      name: 'Task',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      width: '100px',
      render: (status: string) => (
        <StatusIndicator status={status} variant="badge" size="s" />
      ),
    },
    {
      field: 'duration',
      name: 'Duration',
      sortable: true,
      width: '100px',
      render: (duration: number) => formatDuration(duration),
    },
    {
      field: 'timestamp',
      name: 'Time',
      sortable: true,
      width: '120px',
      render: (timestamp: Date | string) => formatRelativeTime(timestamp),
    },
    {
      field: 'source',
      name: 'Source',
      sortable: true,
      width: '80px',
      render: (source: string) => (
        <EuiBadge color="default">{source}</EuiBadge>
      ),
    },
    {
      name: 'Actions',
      width: '80px',
      actions: [
        {
          name: 'Retry',
          description: 'Retry this task',
          icon: 'refresh',
          type: 'icon',
          onClick: (item) => onRetry?.(item.id),
          available: (item) => item.status === 'failed',
        },
        {
          name: 'Cancel',
          description: 'Cancel this task',
          icon: 'cross',
          type: 'icon',
          color: 'danger',
          onClick: (item) => onCancel?.(item.id),
          available: (item) => item.status === 'active' || item.status === 'pending',
        },
      ],
    },
  ]

  // Pagination config
  const pagination: Pagination = {
    pageIndex,
    pageSize,
    totalItemCount: sortedData.length,
    pageSizeOptions: [10, 25, 50],
  }

  // Handle table change
  const onTableChange = ({ page, sort }: Criteria<AgentTask>) => {
    if (page) {
      setPageIndex(page.index)
    }
    if (sort) {
      setSortField(sort.field as keyof AgentTask)
      setSortDirection(sort.direction)
    }
  }

  // Handle search
  const onSearchChange = ({ query }: { query: Query | null }) => {
    setQuery(query)
    setPageIndex(0) // Reset to first page on search
  }

  // Handle export
  const handleExport = () => {
    const exportData = sortedData.map((item) => ({
      Agent: item.agent,
      Type: item.agentType,
      Task: item.task,
      Status: item.status,
      Duration: formatDuration(item.duration),
      Timestamp: new Date(item.timestamp).toISOString(),
      Source: item.source,
    }))
    exportToCSV(exportData, 'agent-tasks')
  }

  // Handle row click
  const getRowProps = (item: AgentTask) => ({
    onClick: () => onTaskClick?.(item),
    style: { cursor: onTaskClick ? 'pointer' : 'default' },
  })

  return (
    <Panel
      title={title}
      loading={loading}
      error={error}
      actions={
        <EuiToolTip content="Export to CSV">
          <EuiButtonIcon
            iconType="exportAction"
            aria-label="Export data"
            onClick={handleExport}
          />
        </EuiToolTip>
      }
    >
      <EuiSearchBar
        box={{
          placeholder: 'Search tasks...',
          incremental: true,
          schema: {
            fields: {
              agent: { type: 'string' },
              task: { type: 'string' },
              status: { type: 'string' },
              source: { type: 'string' },
            },
          },
        }}
        onChange={onSearchChange}
      />

      {/* ARIA live region for announcing filter results to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="euiScreenReaderOnly"
      >
        {query ? `Found ${filteredData.length} matching tasks out of ${data.length} total` : ''}
      </div>

      <EuiSpacer size="m" />

      <EuiBasicTable
        items={paginatedData}
        columns={columns}
        pagination={pagination}
        sorting={{
          sort: {
            field: sortField,
            direction: sortDirection,
          },
        }}
        onChange={onTableChange}
        rowProps={getRowProps}
        noItemsMessage={query ? 'No matching tasks found' : 'No tasks available'}
      />
    </Panel>
  )
}

export default AgentTable
