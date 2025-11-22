import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiStat,
  EuiBasicTable,
  EuiHealth,
} from '@elastic/eui'
import { useWorkers } from '../../../hooks/useDashboardData'

const WorkerPoolViz = () => {
  const { data, loading, error } = useWorkers()

  const workerStats = useMemo(() => {
    if (!data) return null
    return {
      active: data.active_workers?.length || 0,
      completed: data.completed_workers?.length || 0,
      failed: data.failed_workers?.length || 0,
      total: (data.active_workers?.length || 0) +
             (data.completed_workers?.length || 0) +
             (data.failed_workers?.length || 0),
      stats: data.stats || {},
    }
  }, [data])

  const activeWorkers = useMemo(() => {
    if (!data?.active_workers) return []
    return data.active_workers.slice(0, 15).map((worker: any) => ({
      id: worker.worker_id || worker.id,
      type: worker.worker_type || worker.type || 'unknown',
      task: worker.task_id || worker.current_task || '-',
      status: worker.status || 'active',
      master: worker.master || worker.assigned_master || '-',
      startTime: worker.start_time || worker.created_at,
    }))
  }, [data])

  const columns = [
    {
      field: 'id',
      name: 'Worker ID',
      truncateText: true,
      render: (id: string) => (
        <EuiText size="xs">{id?.split('-').slice(-2).join('-') || id}</EuiText>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      render: (type: string) => (
        <EuiBadge color="hollow">{type}</EuiBadge>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      render: (status: string) => (
        <EuiHealth
          color={
            status === 'active' || status === 'running' ? 'success' :
            status === 'idle' ? 'subdued' :
            status === 'error' ? 'danger' : 'primary'
          }
        >
          {status}
        </EuiHealth>
      ),
    },
    {
      field: 'master',
      name: 'Master',
      render: (master: string) => (
        <EuiText size="xs" color="subdued">{master}</EuiText>
      ),
    },
    {
      field: 'task',
      name: 'Task',
      truncateText: true,
      render: (task: string) => (
        <EuiText size="xs">{task?.substring(0, 20) || '-'}</EuiText>
      ),
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

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Worker Pool</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Pool Statistics */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Worker Pool Statistics</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiStat
              title={workerStats?.active || 0}
              description="Active Workers"
              titleColor="primary"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={workerStats?.completed || 0}
              description="Completed"
              titleColor="success"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={workerStats?.failed || 0}
              description="Failed"
              titleColor="danger"
              textAlign="center"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiStat
              title={workerStats?.total || 0}
              description="Total"
              titleColor="subdued"
              textAlign="center"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        {workerStats?.stats && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  Today: {workerStats.stats.total_spawned_today || 0} spawned,{' '}
                  {workerStats.stats.total_completed_today || 0} completed,{' '}
                  {workerStats.stats.success_rate || 0}% success rate
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Active Workers Table */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Active Workers</h3></EuiTitle>
        <EuiSpacer size="m" />

        {activeWorkers.length > 0 ? (
          <EuiBasicTable
            items={activeWorkers}
            columns={columns}
            tableLayout="auto"
          />
        ) : (
          <EuiText color="subdued"><p>No active workers</p></EuiText>
        )}
      </EuiPanel>
    </>
  )
}

export default WorkerPoolViz
