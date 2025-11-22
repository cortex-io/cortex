import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiIcon,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiProgress,
  EuiBadge,
} from '@elastic/eui'
import { useWorkers } from '../../../hooks/useDashboardData'

const AgentStatusCards = () => {
  const { data, loading, error } = useWorkers()

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

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Worker Status</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  const activeWorkers = data?.active_workers || []
  const completedWorkers = data?.completed_workers || []
  const failedWorkers = data?.failed_workers || []

  // Group by worker type
  const workerTypes = activeWorkers.reduce((acc: Record<string, number>, worker: any) => {
    const type = worker.worker_type || 'unknown'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})

  // Group by master
  const masterWorkloads = activeWorkers.reduce((acc: Record<string, number>, worker: any) => {
    const master = worker.master || 'unknown'
    acc[master] = (acc[master] || 0) + 1
    return acc
  }, {})

  return (
    <EuiPanel hasBorder>
      <EuiTitle size="s"><h3>Worker Status Overview</h3></EuiTitle>
      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" wrap>
        <EuiFlexItem grow={1}>
          <EuiCard
            title={activeWorkers.length}
            description="Active"
            icon={<EuiIcon type="compute" color="primary" size="l" />}
            paddingSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiCard
            title={completedWorkers.length}
            description="Completed"
            icon={<EuiIcon type="checkInCircleFilled" color="success" size="l" />}
            paddingSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiCard
            title={failedWorkers.length}
            description="Failed"
            icon={<EuiIcon type="crossInACircleFilled" color="danger" size="l" />}
            paddingSize="s"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />
      <EuiText size="s"><strong>By Worker Type</strong></EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup wrap gutterSize="s">
        {Object.entries(workerTypes).map(([type, count]) => (
          <EuiFlexItem key={type} grow={false}>
            <EuiBadge color="hollow">
              {type}: {count as number}
            </EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      <EuiSpacer size="m" />
      <EuiText size="s"><strong>Master Workloads</strong></EuiText>
      <EuiSpacer size="s" />
      {Object.entries(masterWorkloads).map(([master, count]) => (
        <div key={master} style={{ marginBottom: 8 }}>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{master}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{count as number} workers</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiProgress
            value={count as number}
            max={Math.max(...Object.values(masterWorkloads) as number[], 10)}
            size="s"
            color="primary"
          />
        </div>
      ))}
    </EuiPanel>
  )
}

export default AgentStatusCards
