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
  EuiForm,
  EuiFormRow,
  EuiFieldNumber,
  EuiSelect,
  EuiSwitch,
  EuiBadge,
  EuiHealth,
  EuiText,
  EuiCallOut,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiButtonEmpty,
  EuiStat,
  EuiDatePicker,
  Criteria,
} from '@elastic/eui'
import moment from 'moment'
import {
  getDDQDHistory,
  getDDQDSchedule,
  scheduleDDQDTest,
  runDDQDTest,
  stopDDQDTest,
} from '../../../services/dashboardApi'

interface TestHistory {
  id: string
  status: 'completed' | 'failed' | 'running' | 'scheduled'
  version: string
  duration: number
  max_workers: number
  started_at: string
  completed_at?: string
  results?: {
    total_tasks: number
    successful: number
    failed: number
  }
}

const DDQDSchedulingViz = () => {
  const [history, setHistory] = useState<TestHistory[]>([])
  const [scheduled, setScheduled] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [sortField, setSortField] = useState<keyof TestHistory>('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(5)

  // Sort history
  const sortedHistory = [...history].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    if (aValue === undefined || aValue === null) return 1
    if (bValue === undefined || bValue === null) return -1
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Form state
  const [formData, setFormData] = useState({
    duration: 300,
    maxWorkers: 50,
    version: 'v5',
    scheduleTime: moment().add(1, 'hour'),
    immediate: true,
  })

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [historyResult, scheduleResult] = await Promise.all([
          getDDQDHistory(),
          getDDQDSchedule(),
        ])

        if (historyResult.data) setHistory(historyResult.data.history || [])
        if (scheduleResult.data) setScheduled(scheduleResult.data.scheduled || [])

        setError(null)
      } catch (err) {
        setError('Failed to fetch DDQD data')
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleScheduleTest = async () => {
    setIsSaving(true)
    try {
      if (formData.immediate) {
        await runDDQDTest({
          duration: formData.duration,
          maxWorkers: formData.maxWorkers,
          version: formData.version,
        })
      } else {
        await scheduleDDQDTest({
          duration: formData.duration,
          maxWorkers: formData.maxWorkers,
          version: formData.version,
          scheduled_time: formData.scheduleTime.toISOString(),
        })
      }
      setIsModalVisible(false)
      // Refresh data
      const [historyResult, scheduleResult] = await Promise.all([
        getDDQDHistory(),
        getDDQDSchedule(),
      ])
      if (historyResult.data) setHistory(historyResult.data.history || [])
      if (scheduleResult.data) setScheduled(scheduleResult.data.scheduled || [])
    } catch (err) {
      setError('Failed to schedule test')
    }
    setIsSaving(false)
  }

  const handleStopTest = async (testId: string) => {
    await stopDDQDTest(testId)
    const historyResult = await getDDQDHistory()
    if (historyResult.data) setHistory(historyResult.data.history || [])
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success'
      case 'running': return 'primary'
      case 'failed': return 'danger'
      case 'scheduled': return 'warning'
      default: return 'default'
    }
  }

  const columns = [
    {
      field: 'id',
      name: 'Test ID',
      sortable: true,
      truncateText: true,
      width: '120px',
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
      field: 'version',
      name: 'Version',
      render: (version: string) => <EuiBadge color="hollow">{version}</EuiBadge>,
    },
    {
      field: 'duration',
      name: 'Duration',
      render: (duration: number) => `${duration}s`,
    },
    {
      field: 'max_workers',
      name: 'Workers',
    },
    {
      field: 'started_at',
      name: 'Started',
      sortable: true,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      field: 'results',
      name: 'Results',
      render: (results: any) => {
        if (!results) return '-'
        return (
          <EuiText size="xs">
            {results.successful}/{results.total_tasks} passed
          </EuiText>
        )
      },
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Stop',
          description: 'Stop test',
          icon: 'stop',
          type: 'icon' as const,
          color: 'danger',
          available: (item: TestHistory) => item.status === 'running',
          onClick: (item: TestHistory) => handleStopTest(item.id),
        },
      ],
    },
  ]

  // Stats
  const totalTests = history.length
  const successfulTests = history.filter(t => t.status === 'completed').length
  const runningTests = history.filter(t => t.status === 'running').length

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
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s"><h3>DDQD Test Scheduling</h3></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              iconType="play"
              fill
              onClick={() => setIsModalVisible(true)}
            >
              Schedule Test
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

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
            <EuiStat title={totalTests} description="Total Tests" titleSize="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={runningTests}
              description="Running"
              titleColor="primary"
              titleSize="s"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={successfulTests}
              description="Completed"
              titleColor="success"
              titleSize="s"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={scheduled.length}
              description="Scheduled"
              titleColor="warning"
              titleSize="s"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* History Table */}
        <EuiTitle size="xs"><h4>Test History</h4></EuiTitle>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={sortedHistory.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)}
          columns={columns}
          itemId="id"
          hasActions={true}
          sorting={{
            sort: { field: sortField, direction: sortDirection },
          }}
          onChange={({ sort, page }: Criteria<TestHistory>) => {
            if (sort) {
              setSortField(sort.field as keyof TestHistory)
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
            totalItemCount: sortedHistory.length,
            pageSizeOptions: [5, 10, 20],
          }}
        />
      </EuiPanel>

      {/* Schedule Modal */}
      {isModalVisible && (
        <EuiModal onClose={() => setIsModalVisible(false)}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Schedule DDQD Test</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiForm>
              <EuiFormRow label="Duration (seconds)">
                <EuiFieldNumber
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                  min={60}
                  max={3600}
                />
              </EuiFormRow>
              <EuiFormRow label="Max Workers">
                <EuiFieldNumber
                  value={formData.maxWorkers}
                  onChange={(e) => setFormData({ ...formData, maxWorkers: Number(e.target.value) })}
                  min={1}
                  max={100}
                />
              </EuiFormRow>
              <EuiFormRow label="Version">
                <EuiSelect
                  options={[
                    { value: 'v5', text: 'v5 (Latest)' },
                    { value: 'v4', text: 'v4' },
                    { value: 'v3', text: 'v3' },
                  ]}
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                />
              </EuiFormRow>
              <EuiFormRow>
                <EuiSwitch
                  label="Run immediately"
                  checked={formData.immediate}
                  onChange={(e) => setFormData({ ...formData, immediate: e.target.checked })}
                />
              </EuiFormRow>
              {!formData.immediate && (
                <EuiFormRow label="Schedule Time">
                  <EuiDatePicker
                    selected={formData.scheduleTime}
                    onChange={(date) => setFormData({ ...formData, scheduleTime: date || moment() })}
                    showTimeSelect
                  />
                </EuiFormRow>
              )}
            </EuiForm>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setIsModalVisible(false)}>Cancel</EuiButtonEmpty>
            <EuiButton onClick={handleScheduleTest} fill isLoading={isSaving}>
              {formData.immediate ? 'Run Now' : 'Schedule'}
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </>
  )
}

export default DDQDSchedulingViz
