import React from 'react'
import { EuiPanel, EuiTitle, EuiSpacer, EuiText } from '@elastic/eui'

function DistributedTracingViz() {
  return (
    <EuiPanel>
      <EuiTitle size="m"><h2>Distributed Tracing</h2></EuiTitle>
      <EuiSpacer size="m" />
      <EuiText><p>Waterfall trace visualization coming soon...</p></EuiText>
    </EuiPanel>
  )
}

export default DistributedTracingViz
