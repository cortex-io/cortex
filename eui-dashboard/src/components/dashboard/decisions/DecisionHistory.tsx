import { useState, useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiHealth,
  EuiBadge,
  EuiText,
  EuiSpacer,
  EuiFieldSearch,
  EuiSelect,
  EuiDatePicker,
  EuiLoadingSpinner,
  EuiButtonIcon,
  EuiToolTip,
  Criteria,
  EuiTableSortingType,
} from '@elastic/eui'
import { useDecisions } from '../../../hooks/useDecisions'
import DecisionDetailFlyout from './DecisionDetailFlyout'
import moment from 'moment'

interface Decision {
  id: string
  task_id: string
  timestamp: string
  master: string
  confidence: number
  strategy: string
  reasoning: string
}

interface DecisionHistoryProps {
  limit?: number
}

const DecisionHistory = ({ limit = 100 }: DecisionHistoryProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [masterFilter, setMasterFilter] = useState('')
  const [startDate, setStartDate] = useState<moment.Moment | null>(null)
  const [endDate, setEndDate] = useState<moment.Moment | null>(null)
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof Decision>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const filters = useMemo(() => ({
    master: masterFilter || undefined,
    task_type: searchQuery || undefined,
    start_date: startDate?.toISOString() || undefined,
    end_date: endDate?.toISOString() || undefined,
    limit,
  }), [masterFilter, searchQuery, startDate, endDate, limit])

  const { data, loading, error } = useDecisions(filters)

  const decisions = data?.decisions || []

  const sortedDecisions = useMemo(() => {
    return [...decisions].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'confidence':
          comparison = a.confidence - b.confidence
          break
        case 'master':
          comparison = a.master.localeCompare(b.master)
          break
        case 'timestamp':
        default:
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [decisions, sortField, sortDirection])

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success'
    if (confidence >= 0.75) return 'primary'
    if (confidence >= 0.5) return 'warning'
    return 'danger'
  }

  const getMasterColor = (master: string) => {
    switch (master.toLowerCase()) {
      case 'development':
        return 'primary'
      case 'security':
        return 'danger'
      case 'inventory':
        return 'success'
      case 'coordinator':
        return 'accent'
      case 'cicd':
        return 'warning'
      default:
        return 'hollow'
    }
  }

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const columns: EuiBasicTableColumn<Decision>[] = [
    {
      field: 'timestamp',
      name: 'Timestamp',
      sortable: true,
      width: '160px',
      render: (timestamp: string) => (
        <EuiText size="xs">
          {moment(timestamp).format('MMM D, HH:mm:ss')}
        </EuiText>
      ),
    },
    {
      field: 'task_id',
      name: 'Task ID',
      sortable: false,
      width: '200px',
      render: (taskId: string) => (
        <EuiToolTip content={taskId}>
          <EuiText size="xs">
            <code>{truncateText(taskId, 25)}</code>
          </EuiText>
        </EuiToolTip>
      ),
    },
    {
      field: 'master',
      name: 'Master',
      sortable: true,
      width: '120px',
      render: (master: string) => (
        <EuiBadge color={getMasterColor(master)}>
          {master}
        </EuiBadge>
      ),
    },
    {
      field: 'confidence',
      name: 'Confidence',
      sortable: true,
      width: '120px',
      render: (confidence: number) => (
        <EuiHealth color={getConfidenceColor(confidence)}>
          {(confidence * 100).toFixed(0)}%
        </EuiHealth>
      ),
    },
    {
      field: 'reasoning',
      name: 'Reasoning',
      sortable: false,
      render: (reasoning: string) => (
        <EuiToolTip content={reasoning}>
          <EuiText size="xs" color="subdued">
            {truncateText(reasoning)}
          </EuiText>
        </EuiToolTip>
      ),
    },
    {
      name: 'Actions',
      width: '60px',
      render: (decision: Decision) => (
        <EuiToolTip content="View details">
          <EuiButtonIcon
            iconType="inspect"
            aria-label="View decision details"
            onClick={() => setSelectedDecisionId(decision.id)}
          />
        </EuiToolTip>
      ),
    },
  ]

  const onTableChange = ({ sort }: Criteria<Decision>) => {
    if (sort) {
      setSortField(sort.field as keyof Decision)
      setSortDirection(sort.direction)
    }
  }

  const sorting: EuiTableSortingType<Decision> = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  }

  const masterOptions = [
    { value: '', text: 'All Masters' },
    { value: 'development', text: 'Development' },
    { value: 'security', text: 'Security' },
    { value: 'inventory', text: 'Inventory' },
    { value: 'coordinator', text: 'Coordinator' },
    { value: 'cicd', text: 'CI/CD' },
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

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Decision History</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Decision History</h3></EuiTitle>
        <EuiSpacer size="m" />

        {/* Filters */}
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={2}>
            <EuiFieldSearch
              placeholder="Search by task ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              isClearable
            />
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiSelect
              options={masterOptions}
              value={masterFilter}
              onChange={(e) => setMasterFilter(e.target.value)}
              aria-label="Filter by master"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiDatePicker
              selected={startDate}
              onChange={setStartDate}
              placeholder="Start date"
              showTimeSelect
              dateFormat="MMM D, HH:mm"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiDatePicker
              selected={endDate}
              onChange={setEndDate}
              placeholder="End date"
              showTimeSelect
              dateFormat="MMM D, HH:mm"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Results count */}
        <EuiText size="xs" color="subdued">
          Showing {sortedDecisions.length} of {data?.pagination?.total || 0} decisions
        </EuiText>

        <EuiSpacer size="s" />

        {/* Table */}
        <EuiBasicTable
          items={sortedDecisions}
          columns={columns}
          sorting={sorting}
          onChange={onTableChange}
          tableLayout="auto"
          rowProps={(item) => ({
            onClick: () => setSelectedDecisionId(item.id),
            style: { cursor: 'pointer' }
          })}
        />
      </EuiPanel>

      {/* Detail Flyout */}
      {selectedDecisionId && (
        <DecisionDetailFlyout
          decisionId={selectedDecisionId}
          onClose={() => setSelectedDecisionId(null)}
        />
      )}
    </>
  )
}

export default DecisionHistory
