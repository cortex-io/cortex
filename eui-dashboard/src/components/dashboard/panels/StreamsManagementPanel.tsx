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
  Criteria,
} from '@elastic/eui'
import { getStreams } from '../../../services/dashboardApi'

interface Stream {
  id: string
  name: string
  status: 'active' | 'paused' | 'error'
  message_count: number
  throughput: number
  last_message: string
}

const StreamsManagementPanel = () => {
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof Stream>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Sort streams
  const sortedStreams = [...streams].sort((a, b) => {
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
      const result = await getStreams()
      if (result.error) {
        setError(result.error)
      } else {
        setStreams(result.data?.streams || [])
        setError(null)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const activeCount = streams.filter(s => s.status === 'active').length
  const totalMessages = streams.reduce((sum, s) => sum + s.message_count, 0)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success'
      case 'paused': return 'warning'
      case 'error': return 'danger'
      default: return 'default'
    }
  }

  const columns = [
    {
      field: 'name',
      name: 'Stream',
      sortable: true,
    },
    {
      field: 'status',
      name: 'Status',
      render: (status: string) => (
        <EuiHealth color={getStatusColor(status)}>{status}</EuiHealth>
      ),
    },
    {
      field: 'message_count',
      name: 'Messages',
      sortable: true,
      render: (count: number) => (count ?? 0).toLocaleString(),
    },
    {
      field: 'throughput',
      name: 'Throughput',
      render: (throughput: number) => `${throughput ?? 0}/s`,
    },
    {
      field: 'last_message',
      name: 'Last Message',
      render: (date: string) => date ? new Date(date).toLocaleTimeString() : '-',
    },
  ]

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 200 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s"><h3>Streams</h3></EuiTitle>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title="Error" color="warning" iconType="alert" size="s">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Stats */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiStat title={streams.length} description="Total" titleSize="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat title={activeCount} description="Active" titleColor="success" titleSize="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat title={totalMessages.toLocaleString()} description="Messages" titleSize="s" />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiBasicTable
        items={sortedStreams}
        columns={columns}
        itemId="id"
        sorting={{
          sort: { field: sortField, direction: sortDirection },
        }}
        onChange={({ sort }: Criteria<Stream>) => {
          if (sort) {
            setSortField(sort.field as keyof Stream)
            setSortDirection(sort.direction)
          }
        }}
      />

      {streams.length === 0 && (
        <EuiText color="subdued" textAlign="center">
          <p>No streams available</p>
        </EuiText>
      )}
    </EuiPanel>
  )
}

export default StreamsManagementPanel
