import React, { useState, useEffect, useRef } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiCodeBlock,
  EuiButtonGroup,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiBadge
} from '@elastic/eui'
import dashboardApi from '../../../api/dashboardApi'

function LogStreamingPanel() {
  const [logs, setLogs] = useState([])
  const [filterLevel, setFilterLevel] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const logEndRef = useRef(null)

  useEffect(() => {
    const eventSource = dashboardApi.streamLogs((log) => {
      setLogs(prev => [...prev.slice(-499), log])
    })

    return () => eventSource.close()
  }, [])

  useEffect(() => {
    if (autoscroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoscroll])

  const levelOptions = [
    { id: 'all', label: 'All' },
    { id: 'error', label: 'Error' },
    { id: 'warn', label: 'Warn' },
    { id: 'info', label: 'Info' }
  ]

  const filteredLogs = logs.filter(log => {
    const levelMatch = filterLevel === 'all' || log.level === filterLevel
    const searchMatch = !searchText || JSON.stringify(log).toLowerCase().includes(searchText.toLowerCase())
    return levelMatch && searchMatch
  })

  const logText = filteredLogs.map(log =>
    `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
  ).join('\n')

  return (
    <EuiPanel>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="m">
            <h2>
              Log Streaming <EuiBadge color="success">{filteredLogs.length} logs</EuiBadge>
            </h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFieldSearch
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            fullWidth
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={() => setAutoscroll(!autoscroll)}
            iconType={autoscroll ? 'pause' : 'play'}
            size="s"
          >
            {autoscroll ? 'Pause' : 'Resume'}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiButtonGroup
        legend="Filter by level"
        options={levelOptions}
        idSelected={filterLevel}
        onChange={setFilterLevel}
        buttonSize="s"
      />

      <EuiSpacer size="m" />

      <EuiCodeBlock
        language="text"
        fontSize="s"
        paddingSize="m"
        overflowHeight={400}
        isCopyable
      >
        {logText || 'No logs to display'}
      </EuiCodeBlock>
      <div ref={logEndRef} />
    </EuiPanel>
  )
}

export default LogStreamingPanel
