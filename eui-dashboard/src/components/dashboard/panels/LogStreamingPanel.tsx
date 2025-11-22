import { useState, useEffect, useRef, useCallback } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiSelect,
  EuiFieldSearch,
  EuiButtonGroup,
  EuiButton,
  EuiButtonIcon,
  EuiCode,
  EuiText,
  EuiToolTip,
  EuiBadge,
  EuiCallOut,
  EuiRange,
} from '@elastic/eui'
import { getAvailableLogs, getLogTail } from '../../../services/dashboardApi'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  source?: string
}

interface LogSource {
  name: string
  path: string
  description?: string
}

const LogStreamingPanel = () => {
  const [availableLogs, setAvailableLogs] = useState<LogSource[]>([])
  const [selectedLog, setSelectedLog] = useState<string>('')
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [filteredEntries, setFilteredEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLevel, setSelectedLevel] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [lineLimit, setLineLimit] = useState(100)
  const [isConnected, setIsConnected] = useState(false)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch available logs
  useEffect(() => {
    const fetchLogs = async () => {
      const result = await getAvailableLogs()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        const logs = result.data.logs || []
        // Handle both string[] and LogSource[] formats
        const normalizedLogs: LogSource[] = logs.map((log: string | LogSource) => {
          if (typeof log === 'string') {
            return { name: log, path: log }
          }
          return log
        })
        setAvailableLogs(normalizedLogs)
        if (normalizedLogs.length > 0) {
          setSelectedLog(normalizedLogs[0].path || normalizedLogs[0].name)
        }
      }
      setLoading(false)
    }
    fetchLogs()
  }, [])

  // Connect to SSE stream
  useEffect(() => {
    if (!selectedLog || isPaused) {
      return
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Connect to log stream
    const eventSource = new EventSource(`/api/logs/stream?source=${encodeURIComponent(selectedLog)}`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    eventSource.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry
        setLogEntries(prev => {
          const newEntries = [...prev, entry]
          // Keep only the last N entries based on lineLimit
          return newEntries.slice(-lineLimit * 2)
        })
      } catch (e) {
        // Handle plain text messages
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: event.data
        }
        setLogEntries(prev => [...prev, entry].slice(-lineLimit * 2))
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (!isPaused && selectedLog) {
          // Will trigger useEffect again
          setSelectedLog(prev => prev)
        }
      }, 5000)
    }

    return () => {
      eventSource.close()
      setIsConnected(false)
    }
  }, [selectedLog, isPaused, lineLimit])

  // Fallback: fetch logs via tail if SSE not available
  useEffect(() => {
    if (!selectedLog || isConnected) return

    const fetchTail = async () => {
      const result = await getLogTail(selectedLog, lineLimit)
      if (result.data?.lines) {
        const entries = result.data.lines.map((line: string, idx: number) => {
          // Parse log line format: [TIMESTAMP] LEVEL: message
          const match = line.match(/^\[([^\]]+)\]\s*(\w+):\s*(.*)$/)
          if (match) {
            return {
              timestamp: match[1],
              level: match[2].toLowerCase(),
              message: match[3]
            }
          }
          return {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: line
          }
        })
        setLogEntries(entries)
      }
    }

    fetchTail()
    const interval = setInterval(fetchTail, 2000)
    return () => clearInterval(interval)
  }, [selectedLog, isConnected, lineLimit])

  // Filter entries based on search and level
  useEffect(() => {
    let filtered = logEntries

    if (selectedLevel !== 'all') {
      filtered = filtered.filter(entry => (entry.level || 'info') === selectedLevel)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(entry =>
        entry.message.toLowerCase().includes(query) ||
        entry.timestamp.includes(query)
      )
    }

    setFilteredEntries(filtered.slice(-lineLimit))
  }, [logEntries, selectedLevel, searchQuery, lineLimit])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [filteredEntries, autoScroll])

  const handleExport = useCallback(() => {
    const content = filteredEntries
      .map(e => `[${e.timestamp || 'unknown'}] ${(e.level || 'info').toUpperCase()}: ${e.message || ''}`)
      .join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedLog}-${new Date().toISOString().split('T')[0]}.log`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredEntries, selectedLog])

  const handleClear = () => {
    setLogEntries([])
    setFilteredEntries([])
  }

  const levelOptions = [
    { id: 'all', label: 'All' },
    { id: 'error', label: 'Error' },
    { id: 'warn', label: 'Warn' },
    { id: 'info', label: 'Info' },
    { id: 'debug', label: 'Debug' },
  ]

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'danger'
      case 'warn': return 'warning'
      case 'info': return 'primary'
      case 'debug': return 'default'
      default: return 'hollow'
    }
  }

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>
              Log Streaming
              {isConnected && (
                <EuiBadge color="success" style={{ marginLeft: 8 }}>Live</EuiBadge>
              )}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                onClick={() => setIsPaused(!isPaused)}
                color={isPaused ? 'primary' : 'text'}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                onClick={handleClear}
                color="text"
              >
                Clear
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                onClick={handleExport}
                color="text"
              >
                Export
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title="Connection Error" color="warning" iconType="alert" size="s">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Controls */}
      <EuiFlexGroup gutterSize="m" alignItems="center" wrap>
        <EuiFlexItem grow={false} style={{ minWidth: 200 }}>
          <EuiSelect
            prepend="Source"
            options={availableLogs.map(log => ({
              value: log.path || log.name,
              text: log.name
            }))}
            value={selectedLog}
            onChange={(e) => setSelectedLog(e.target.value)}
            compressed
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Log level filter"
            options={levelOptions}
            idSelected={selectedLevel}
            onChange={(id) => setSelectedLevel(id)}
            buttonSize="compressed"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <EuiFieldSearch
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            isClearable
            compressed
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
          <EuiRange
            min={50}
            max={500}
            step={50}
            value={lineLimit}
            onChange={(e) => setLineLimit(Number(e.currentTarget.value))}
            showInput
            compressed
            prepend="Lines"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}>
            <EuiButton
              size="s"
              onClick={() => setAutoScroll(!autoScroll)}
              color={autoScroll ? 'primary' : 'text'}
              fill={autoScroll}
            >
              Auto-scroll
            </EuiButton>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Log output */}
      <div
        ref={logContainerRef}
        style={{
          height: 400,
          overflow: 'auto',
          backgroundColor: '#1a1a1a',
          borderRadius: 4,
          padding: 12,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        {filteredEntries.length === 0 ? (
          <EuiText color="subdued" textAlign="center">
            <p style={{ paddingTop: 180 }}>
              {logEntries.length === 0 ? 'Waiting for logs...' : 'No logs match the current filters'}
            </p>
          </EuiText>
        ) : (
          filteredEntries.map((entry, idx) => (
            <div key={idx} style={{ marginBottom: 4 }}>
              <EuiCode
                language="plaintext"
                transparentBackground
                style={{
                  display: 'inline-block',
                  backgroundColor: 'transparent',
                  padding: 0,
                }}
              >
                <span style={{ color: '#666' }}>[{entry.timestamp || 'unknown'}]</span>
                {' '}
                <EuiBadge color={getLevelColor(entry.level || 'info')} style={{ marginRight: 8 }}>
                  {(entry.level || 'info').toUpperCase()}
                </EuiBadge>
                <span style={{ color: '#fff' }}>{entry.message || ''}</span>
              </EuiCode>
            </div>
          ))
        )}
      </div>

      <EuiSpacer size="s" />

      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            Showing {filteredEntries.length} of {logEntries.length} entries
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {isPaused ? 'Paused' : isConnected ? 'Streaming' : 'Polling'}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  )
}

export default LogStreamingPanel
