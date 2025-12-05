import React from 'react'
import { EuiPanel, EuiTitle, EuiSpacer, EuiText } from '@elastic/eui'

function StreamsManagementPanel() {
  return (
    <EuiPanel>
      <EuiTitle size="s"><h3>Streams Management</h3></EuiTitle>
      <EuiSpacer size="m" />
      <EuiText><p>Stream monitoring and controls coming soon...</p></EuiText>
    </EuiPanel>
  )
}

export default StreamsManagementPanel
