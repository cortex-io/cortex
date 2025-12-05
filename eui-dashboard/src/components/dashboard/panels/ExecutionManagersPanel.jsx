import React from 'react'
import { EuiPanel, EuiTitle, EuiSpacer, EuiText } from '@elastic/eui'

function ExecutionManagersPanel() {
  return (
    <EuiPanel>
      <EuiTitle size="s"><h3>Execution Managers</h3></EuiTitle>
      <EuiSpacer size="m" />
      <EuiText><p>Active execution managers and DAG visualization coming soon...</p></EuiText>
    </EuiPanel>
  )
}

export default ExecutionManagersPanel
