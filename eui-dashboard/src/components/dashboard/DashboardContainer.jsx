import React, { useState } from 'react'
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageSection,
  EuiSpacer,
  EuiTabs,
  EuiTab,
  EuiFlexGroup,
  EuiFlexItem
} from '@elastic/eui'

// Import panels and visualizations (will be created next)
import ExecutiveSummaryViz from './visualizations/ExecutiveSummaryViz'
import LogStreamingPanel from './panels/LogStreamingPanel'
import OptimizerDashboardViz from './visualizations/OptimizerDashboardViz'
import UserManagementViz from './visualizations/UserManagementViz'
import MoEAdvancedAnalyticsViz from './visualizations/MoEAdvancedAnalyticsViz'
import ExecutionManagersPanel from './panels/ExecutionManagersPanel'
import DDQDSchedulingViz from './visualizations/DDQDSchedulingViz'
import AgentstudioViz from './visualizations/AgentstudioViz'
import DistributedTracingViz from './visualizations/DistributedTracingViz'
import StreamsManagementPanel from './panels/StreamsManagementPanel'
import CoordinationViewerViz from './visualizations/CoordinationViewerViz'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'optimizer', label: 'Optimizer' },
  { id: 'moe', label: 'MoE Analytics' },
  { id: 'execution', label: 'Execution' },
  { id: 'logs', label: 'Logs' },
  { id: 'users', label: 'Users' },
  { id: 'tools', label: 'Tools' }
]

function DashboardContainer() {
  const [selectedTab, setSelectedTab] = useState('overview')

  const renderContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <>
            <ExecutiveSummaryViz />
            <EuiSpacer size="l" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <ExecutionManagersPanel />
              </EuiFlexItem>
              <EuiFlexItem>
                <StreamsManagementPanel />
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )
      case 'optimizer':
        return <OptimizerDashboardViz />
      case 'moe':
        return <MoEAdvancedAnalyticsViz />
      case 'execution':
        return (
          <>
            <AgentstudioViz />
            <EuiSpacer size="l" />
            <DDQDSchedulingViz />
          </>
        )
      case 'logs':
        return (
          <>
            <LogStreamingPanel />
            <EuiSpacer size="l" />
            <DistributedTracingViz />
          </>
        )
      case 'users':
        return <UserManagementViz />
      case 'tools':
        return <CoordinationViewerViz />
      default:
        return <ExecutiveSummaryViz />
    }
  }

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader
          pageTitle="Cortex Dashboard"
          description="Advanced EUI Dashboard - Built by Cortex in Inception Mode"
        />
        <EuiSpacer size="l" />
        <EuiTabs>
          {TABS.map(tab => (
            <EuiTab
              key={tab.id}
              isSelected={selectedTab === tab.id}
              onClick={() => setSelectedTab(tab.id)}
            >
              {tab.label}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer size="l" />
        <EuiPageSection>
          {renderContent()}
        </EuiPageSection>
      </EuiPageBody>
    </EuiPage>
  )
}

export default DashboardContainer
