import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiHealth,
  EuiCallOut,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiFieldNumber,
  EuiFormRow,
  EuiSwitch,
  EuiToolTip,
  EuiIcon,
  EuiStat,
} from '@elastic/eui'
import { useDaemonStatus, useDDQDTesting } from '../../../hooks/useDashboardData'
import * as api from '../../../services/dashboardApi'

interface DaemonInfo {
  name: string
  apiName: string
  statusKey: string
  description: string
  useStartStop?: boolean
}

const DAEMONS: DaemonInfo[] = [
  // Core Daemons
  { name: 'Worker Daemon', apiName: 'daemon', statusKey: 'worker-daemon', description: 'Manages worker lifecycle' },
  { name: 'PM Daemon', apiName: 'pm-daemon', statusKey: 'pm-daemon', description: 'Project management' },
  { name: 'Coordinator', apiName: 'coordinator-daemon', statusKey: 'coordinator-daemon', description: 'Task coordination' },
  { name: 'Dashboard', apiName: 'dashboard', statusKey: 'dashboard', description: 'Dashboard server' },

  // Monitoring Daemons
  { name: 'Health Monitor', apiName: 'health-monitor', statusKey: 'health-monitor', description: 'System health checks', useStartStop: true },
  { name: 'Metrics Snapshot', apiName: 'metrics-snapshot', statusKey: 'metrics-snapshot', description: 'Metrics collection', useStartStop: true },
  { name: 'Heartbeat Monitor', apiName: 'heartbeat-monitor', statusKey: 'heartbeat-monitor', description: 'Worker heartbeats', useStartStop: true },
  { name: 'Learning Monitor', apiName: 'learning-monitor', statusKey: 'learning-monitor', description: 'MoE learning events', useStartStop: true },

  // Maintenance Daemons
  { name: 'Daemon Supervisor', apiName: 'daemon-supervisor', statusKey: 'daemon-supervisor', description: 'Supervises all daemons', useStartStop: true },
  { name: 'Zombie Cleanup', apiName: 'zombie-cleanup', statusKey: 'zombie-cleanup', description: 'Dead worker cleanup', useStartStop: true },
  { name: 'Worker Restart', apiName: 'worker-restart', statusKey: 'worker-restart', description: 'Worker restart handling', useStartStop: true },
  { name: 'Auto Fix', apiName: 'auto-fix', statusKey: 'auto-fix', description: 'Automated issue fixes', useStartStop: true },
  { name: 'Failure Pattern', apiName: 'failure-pattern', statusKey: 'failure-pattern', description: 'Failure detection', useStartStop: true },

  // Integration Daemons
  { name: 'Handoff Processor', apiName: 'handoff-processor', statusKey: 'handoff-processor', description: 'Task handoffs', useStartStop: true },
  { name: 'Integration Validator', apiName: 'integration-validator', statusKey: 'integration-validator', description: 'Integration checks' },
  { name: 'MoE Learning', apiName: 'moe-learning', statusKey: 'moe-learning', description: 'MoE learning system', useStartStop: true },

  // Security & Backup
  { name: 'Threat Intel', apiName: 'threat-intel', statusKey: 'threat-intel', description: 'Security monitoring', useStartStop: true },
  { name: 'Backup', apiName: 'backup', statusKey: 'backup', description: 'Data backups', useStartStop: true },
]

const AdminControlsViz = () => {
  const { data: daemonStatus, loading: daemonLoading, error: daemonError, refetch: refetchDaemons } = useDaemonStatus()
  const { data: ddqdData, refetch: refetchDDQD } = useDDQDTesting()

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'danger', message: string } | null>(null)
  const [showDDQDModal, setShowDDQDModal] = useState(false)
  const [ddqdConfig, setDdqdConfig] = useState({
    duration: 300,
    maxWorkers: 50,
    verbose: true
  })

  // New state for additional controls
  const [terminalSettings, setTerminalSettings] = useState({
    terminal_windows_enabled: false,
    headless_mode: false,
    auto_close_duration_minutes: 30
  })
  const [eventLogInfo, setEventLogInfo] = useState<any>(null)
  const [gitInfo, setGitInfo] = useState<any>(null)

  // Load terminal settings, event log info, and git info
  useEffect(() => {
    const loadData = async () => {
      try {
        const [terminalRes, eventLogRes, gitRes] = await Promise.all([
          api.getTerminalSettings(),
          api.getEventLogInfo(),
          api.getGitInfo()
        ])
        if (terminalRes.data) setTerminalSettings(terminalRes.data)
        if (eventLogRes.data) setEventLogInfo(eventLogRes.data)
        if (gitRes.data) setGitInfo(gitRes.data)
      } catch (err) {
        console.error('Error loading admin data:', err)
      }
    }
    loadData()
  }, [])

  const handleDaemonAction = async (daemon: DaemonInfo, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${daemon.apiName}-${action}`)
    setActionResult(null)

    try {
      let result
      if (daemon.useStartStop) {
        result = action === 'start'
          ? await api.startDaemon(daemon.apiName)
          : await api.stopDaemon(daemon.apiName)
      } else {
        result = await api.controlDaemon(daemon.apiName, action)
      }

      if (result.error) {
        setActionResult({ type: 'danger', message: `Failed to ${action} ${daemon.name}: ${result.error}` })
      } else {
        setActionResult({ type: 'success', message: `${daemon.name} ${action} successful` })
        refetchDaemons()
      }
    } catch (err) {
      setActionResult({ type: 'danger', message: `Error: ${err}` })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSystemOperation = async (operation: string) => {
    setActionLoading(operation)
    setActionResult(null)

    try {
      let result
      switch (operation) {
        case 'purge-events':
          result = await api.purgeEventLog()
          break
        case 'clear-routing':
          result = await api.clearRoutingDecisions()
          break
        case 'restart-server':
          result = await api.restartDashboardServer()
          break
        case 'activate-learning':
          result = await api.activateMoELearning()
          break
        default:
          result = { error: 'Unknown operation' }
      }

      if (result.error) {
        setActionResult({ type: 'danger', message: `Operation failed: ${result.error}` })
      } else {
        setActionResult({ type: 'success', message: `Operation "${operation}" completed successfully` })
      }
    } catch (err) {
      setActionResult({ type: 'danger', message: `Error: ${err}` })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRunDDQD = async () => {
    setShowDDQDModal(false)
    setActionLoading('run-ddqd')
    setActionResult(null)

    try {
      const result = await api.runDDQDTest(ddqdConfig)
      if (result.error) {
        setActionResult({ type: 'danger', message: `DDQD test failed: ${result.error}` })
      } else {
        setActionResult({ type: 'success', message: `DDQD test started: ${result.data?.testId}` })
        refetchDDQD()
      }
    } catch (err) {
      setActionResult({ type: 'danger', message: `Error: ${err}` })
    } finally {
      setActionLoading(null)
    }
  }

  const handleStopDDQD = async (testId: string) => {
    setActionLoading(`stop-${testId}`)
    setActionResult(null)

    try {
      const result = await api.stopDDQDTest(testId)
      if (result.error) {
        setActionResult({ type: 'danger', message: `Failed to stop test: ${result.error}` })
      } else {
        setActionResult({ type: 'success', message: 'DDQD test stopped' })
        refetchDDQD()
      }
    } catch (err) {
      setActionResult({ type: 'danger', message: `Error: ${err}` })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSaveTerminalSettings = async () => {
    setActionLoading('save-terminal')
    setActionResult(null)

    try {
      const result = await api.updateTerminalSettings(terminalSettings)
      if (result.error) {
        setActionResult({ type: 'danger', message: `Failed to save settings: ${result.error}` })
      } else {
        setActionResult({ type: 'success', message: 'Terminal settings saved successfully' })
      }
    } catch (err) {
      setActionResult({ type: 'danger', message: `Error: ${err}` })
    } finally {
      setActionLoading(null)
    }
  }

  const getDaemonStatus = (statusKey: string) => {
    if (!daemonStatus?.daemons) return null
    return daemonStatus.daemons[statusKey]
  }

  if (daemonLoading) {
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

  const activeTests = ddqdData?.activeTests || []

  return (
    <>
      {/* Action Result */}
      {actionResult && (
        <>
          <EuiCallOut
            title={actionResult.message}
            color={actionResult.type}
            iconType={actionResult.type === 'success' ? 'check' : 'alert'}
            size="s"
            onDismiss={() => setActionResult(null)}
          />
          <EuiSpacer size="m" />
        </>
      )}

      {/* Daemon Controls */}
      <EuiPanel hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s"><h3>Daemon Controls</h3></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {daemonStatus?.summary && (
              <EuiText size="xs" color="subdued">
                {daemonStatus.summary.running}/{daemonStatus.summary.total} running
              </EuiText>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {daemonError && (
          <>
            <EuiCallOut title="Error loading daemon status" color="danger" size="s">
              <p>{daemonError}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        <EuiFlexGroup wrap gutterSize="m">
          {DAEMONS.map((daemon) => {
            const status = getDaemonStatus(daemon.statusKey)
            const isRunning = status?.status === 'running'

            return (
              <EuiFlexItem key={daemon.apiName} style={{ minWidth: 280, maxWidth: 320 }}>
                <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
                  <EuiFlexGroup alignItems="center" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiHealth color={isRunning ? 'success' : 'subdued'}>
                        {daemon.name}
                      </EuiHealth>
                    </EuiFlexItem>
                    {status?.pid && (
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">PID {status.pid}</EuiBadge>
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>

                  <EuiText size="xs" color="subdued">
                    <p style={{ margin: '4px 0' }}>{daemon.description}</p>
                  </EuiText>

                  {status?.uptime && (
                    <EuiText size="xs" color="subdued">
                      <p style={{ margin: 0 }}>Uptime: {status.uptime}</p>
                    </EuiText>
                  )}

                  <EuiSpacer size="xs" />

                  <EuiFlexGroup gutterSize="xs">
                    {daemon.useStartStop ? (
                      <>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="success"
                            onClick={() => handleDaemonAction(daemon, 'start')}
                            isLoading={actionLoading === `${daemon.apiName}-start`}
                            isDisabled={isRunning || !!actionLoading}
                          >
                            Start
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="danger"
                            onClick={() => handleDaemonAction(daemon, 'stop')}
                            isLoading={actionLoading === `${daemon.apiName}-stop`}
                            isDisabled={!isRunning || !!actionLoading}
                          >
                            Stop
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                      </>
                    ) : (
                      <>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="success"
                            onClick={() => handleDaemonAction(daemon, 'start')}
                            isLoading={actionLoading === `${daemon.apiName}-start`}
                            isDisabled={isRunning || !!actionLoading}
                          >
                            Start
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="danger"
                            onClick={() => handleDaemonAction(daemon, 'stop')}
                            isLoading={actionLoading === `${daemon.apiName}-stop`}
                            isDisabled={!isRunning || !!actionLoading}
                          >
                            Stop
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="primary"
                            onClick={() => handleDaemonAction(daemon, 'restart')}
                            isLoading={actionLoading === `${daemon.apiName}-restart`}
                            isDisabled={!isRunning || !!actionLoading}
                          >
                            Restart
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                      </>
                    )}
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            )
          })}
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* System Operations */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>System Operations</h3></EuiTitle>
            <EuiSpacer size="m" />

            <EuiFlexGroup direction="column" gutterSize="s">
              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Archive and clear the event log">
                      <EuiButton
                        size="s"
                        color="warning"
                        onClick={() => handleSystemOperation('purge-events')}
                        isLoading={actionLoading === 'purge-events'}
                        isDisabled={!!actionLoading}
                        iconType="trash"
                      >
                        Purge Event Log
                      </EuiButton>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">Archive and reset dashboard events</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Clear MoE routing decision history">
                      <EuiButton
                        size="s"
                        color="warning"
                        onClick={() => handleSystemOperation('clear-routing')}
                        isLoading={actionLoading === 'clear-routing'}
                        isDisabled={!!actionLoading}
                        iconType="refresh"
                      >
                        Clear Routing History
                      </EuiButton>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">Reset MoE routing decisions and metrics</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Restart the dashboard API server">
                      <EuiButton
                        size="s"
                        color="danger"
                        onClick={() => handleSystemOperation('restart-server')}
                        isLoading={actionLoading === 'restart-server'}
                        isDisabled={!!actionLoading}
                        iconType="refresh"
                      >
                        Restart Server
                      </EuiButton>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">Restart the dashboard API server</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>MoE Operations</h3></EuiTitle>
            <EuiSpacer size="m" />

            <EuiFlexGroup direction="column" gutterSize="s">
              {/* MoE Learning Status */}
              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiHealth color={getDaemonStatus('moe-learning')?.status === 'running' ? 'success' : 'subdued'}>
                      MoE Learning
                    </EuiHealth>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={getDaemonStatus('moe-learning')?.status === 'running' ? 'success' : 'default'}>
                      {getDaemonStatus('moe-learning')?.status === 'running' ? 'Running' : 'Stopped'}
                    </EuiBadge>
                  </EuiFlexItem>
                  {getDaemonStatus('moe-learning')?.pid && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">PID {getDaemonStatus('moe-learning')?.pid}</EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Start the MoE Learning System task">
                      <EuiButton
                        size="s"
                        color="primary"
                        onClick={() => handleSystemOperation('activate-learning')}
                        isLoading={actionLoading === 'activate-learning'}
                        isDisabled={!!actionLoading}
                        iconType="play"
                      >
                        Activate Learning
                      </EuiButton>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">Start MoE Learning System (2.5-3.5 hrs)</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>

              <EuiSpacer size="m" />

              {/* DDQD Testing Status */}
              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiTitle size="xs"><h4>DDQD Testing</h4></EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={activeTests.length > 0 ? 'success' : 'default'}>
                      {activeTests.length > 0 ? `${activeTests.length} Active` : 'Idle'}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="s" />
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      color="primary"
                      onClick={() => setShowDDQDModal(true)}
                      isLoading={actionLoading === 'run-ddqd'}
                      isDisabled={!!actionLoading}
                      iconType="play"
                    >
                      Run DDQD Test
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>

                {activeTests.length > 0 && (
                  <>
                    <EuiSpacer size="s" />
                    <EuiText size="xs"><strong>Active Tests:</strong></EuiText>
                    {activeTests.map((test: any) => (
                      <EuiFlexGroup key={test.testId} alignItems="center" gutterSize="s">
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="primary">{test.testId}</EuiBadge>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            color="danger"
                            onClick={() => handleStopDDQD(test.testId)}
                            isLoading={actionLoading === `stop-${test.testId}`}
                            isDisabled={!!actionLoading}
                          >
                            Stop
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    ))}
                  </>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* Additional Admin Controls Row */}
      <EuiFlexGroup gutterSize="l">
        {/* Terminal Window Controls */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Terminal Window Controls</h3></EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>Control worker terminal window visibility and auto-close behavior.</p>
            </EuiText>
            <EuiSpacer size="m" />

            <EuiFlexGroup direction="column" gutterSize="m">
              <EuiFlexItem>
                <EuiSwitch
                  label="Show Terminal Windows"
                  checked={terminalSettings?.terminal_windows_enabled || false}
                  onChange={(e) => setTerminalSettings(prev => ({
                    ...prev,
                    terminal_windows_enabled: e.target.checked
                  }))}
                />
                <EuiText size="xs" color="subdued">
                  <p>Display visible Terminal.app windows when launching workers</p>
                </EuiText>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiSwitch
                  label="Force Headless Mode"
                  checked={terminalSettings?.headless_mode || false}
                  onChange={(e) => setTerminalSettings(prev => ({
                    ...prev,
                    headless_mode: e.target.checked
                  }))}
                />
                <EuiText size="xs" color="subdued">
                  <p>Run all workers in headless mode (no terminal windows)</p>
                </EuiText>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiFormRow label="Auto-Close Duration (minutes)">
                  <EuiFieldNumber
                    value={terminalSettings?.auto_close_duration_minutes || 0}
                    onChange={(e) => setTerminalSettings(prev => ({
                      ...prev,
                      auto_close_duration_minutes: parseInt(e.target.value) || 0
                    }))}
                    min={0}
                    max={1440}
                    compressed
                  />
                </EuiFormRow>
                <EuiText size="xs" color="subdued">
                  <p>Auto-close terminal windows after N minutes (0 = never)</p>
                </EuiText>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiButton
                  size="s"
                  onClick={handleSaveTerminalSettings}
                  isLoading={actionLoading === 'save-terminal'}
                  isDisabled={!!actionLoading}
                >
                  Apply Settings
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>

        {/* Event Log Management */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Event Log Management</h3></EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>Monitor and manage the dashboard-events.jsonl file.</p>
            </EuiText>
            <EuiSpacer size="m" />

            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiStat
                  title={eventLogInfo?.event_count?.toLocaleString() || '0'}
                  description="Total Events"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={eventLogInfo?.file_size || 'N/A'}
                  description="File Size"
                  titleSize="s"
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            <EuiCallOut
              title="Purging will archive events and reset the log"
              color="warning"
              size="s"
              iconType="alert"
            />

            <EuiSpacer size="s" />

            <EuiButton
              size="s"
              color="danger"
              onClick={() => handleSystemOperation('purge-events')}
              isLoading={actionLoading === 'purge-events'}
              isDisabled={!!actionLoading}
              iconType="trash"
              fullWidth
            >
              Purge Event Log
            </EuiButton>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* MoE Data & Git Management Row */}
      <EuiFlexGroup gutterSize="l">
        {/* MoE Data Management */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>MoE Data Management</h3></EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>Manage MoE routing decisions and cached metrics data.</p>
            </EuiText>
            <EuiSpacer size="m" />

            <EuiCallOut
              title="Clearing will backup and reset routing decisions"
              color="warning"
              size="s"
              iconType="alert"
            >
              <EuiText size="xs">
                <p>Use when stale decisions affect routing accuracy in DDQD tests.</p>
              </EuiText>
            </EuiCallOut>

            <EuiSpacer size="s" />

            <EuiButton
              size="s"
              color="danger"
              onClick={() => handleSystemOperation('clear-routing')}
              isLoading={actionLoading === 'clear-routing'}
              isDisabled={!!actionLoading}
              iconType="trash"
              fullWidth
            >
              Clear Routing Decisions
            </EuiButton>
          </EuiPanel>
        </EuiFlexItem>

        {/* Git & Server Management */}
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Git & Server Management</h3></EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>View git repository status and control the dashboard server.</p>
            </EuiText>
            <EuiSpacer size="m" />

            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiPanel paddingSize="s" hasShadow={false} color="subdued">
                  <EuiText size="xs"><strong>Last Commit</strong></EuiText>
                  <EuiText size="xs" color="subdued">
                    {gitInfo?.lastCommit?.message?.substring(0, 50) || 'No commits'}
                  </EuiText>
                  <EuiBadge color="hollow">
                    {gitInfo?.lastCommit?.timeAgo || 'N/A'}
                  </EuiBadge>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel paddingSize="s" hasShadow={false} color="subdued">
                  <EuiText size="xs"><strong>Last Sync</strong></EuiText>
                  <EuiText size="xs">
                    {gitInfo?.lastSync || 'Never'}
                  </EuiText>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="s" />

            <EuiButton
              size="s"
              color="warning"
              onClick={() => handleSystemOperation('restart-server')}
              isLoading={actionLoading === 'restart-server'}
              isDisabled={!!actionLoading}
              iconType="refresh"
              fullWidth
            >
              Restart Dashboard Server
            </EuiButton>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* DDQD Configuration Modal */}
      {showDDQDModal && (
        <EuiModal onClose={() => setShowDDQDModal(false)}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              <EuiIcon type="play" style={{ marginRight: 8 }} />
              Configure DDQD Test
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiFormRow label="Duration (seconds)">
              <EuiFieldNumber
                value={ddqdConfig.duration}
                onChange={(e) => setDdqdConfig({ ...ddqdConfig, duration: parseInt(e.target.value) || 300 })}
                min={60}
                max={3600}
              />
            </EuiFormRow>
            <EuiFormRow label="Max Workers">
              <EuiFieldNumber
                value={ddqdConfig.maxWorkers}
                onChange={(e) => setDdqdConfig({ ...ddqdConfig, maxWorkers: parseInt(e.target.value) || 50 })}
                min={1}
                max={100}
              />
            </EuiFormRow>
            <EuiFormRow>
              <EuiSwitch
                label="Verbose output"
                checked={ddqdConfig.verbose}
                onChange={(e) => setDdqdConfig({ ...ddqdConfig, verbose: e.target.checked })}
              />
            </EuiFormRow>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setShowDDQDModal(false)}>Cancel</EuiButtonEmpty>
            <EuiButton onClick={handleRunDDQD} fill color="primary">
              Run Test
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </>
  )
}

export default AdminControlsViz
