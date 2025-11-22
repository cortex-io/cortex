import { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiSelect,
  EuiCodeBlock,
  EuiButton,
  EuiText,
  EuiCallOut,
} from '@elastic/eui'
import { getCoordinationRaw } from '../../../services/dashboardApi'

const CoordinationViewerViz = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState('task-queue')

  const fileOptions = [
    { value: 'task-queue', text: 'Task Queue' },
    { value: 'worker-pool', text: 'Worker Pool' },
    { value: 'token-budget', text: 'Token Budget' },
    { value: 'handoffs', text: 'Handoffs' },
    { value: 'status', text: 'System Status' },
  ]

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const result = await getCoordinationRaw()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
        setError(null)
      }
      setLoading(false)
    }

    fetchData()
  }, [])

  const getCurrentFileContent = () => {
    if (!data) return '{}'
    const fileData = data[selectedFile.replace('-', '_')]
    return JSON.stringify(fileData || {}, null, 2)
  }

  const handleDownload = () => {
    const content = getCurrentFileContent()
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedFile}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    const content = getCurrentFileContent()
    navigator.clipboard.writeText(content)
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

  const content = getCurrentFileContent()

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s"><h3>Coordination Viewer</h3></EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiButton size="s" onClick={handleCopy}>
                Copy
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size="s" onClick={handleDownload}>
                Download
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title="Error" color="warning" iconType="alert" size="s">
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiSelect
        prepend="File"
        options={fileOptions}
        value={selectedFile}
        onChange={(e) => setSelectedFile(e.target.value)}
      />

      <EuiSpacer size="m" />

      <EuiCodeBlock
        language="json"
        fontSize="s"
        paddingSize="m"
        overflowHeight={400}
      >
        {content}
      </EuiCodeBlock>

      <EuiSpacer size="s" />

      <EuiText size="xs" color="subdued">
        Raw coordination file data for debugging purposes
      </EuiText>
    </EuiPanel>
  )
}

export default CoordinationViewerViz
