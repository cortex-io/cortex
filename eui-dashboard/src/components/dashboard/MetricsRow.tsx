/**
 * Metrics Row component for Primary KPIs
 * 4-6 prominent metric cards following Elastic best practices
 */

import React from 'react'
import {
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui'
import { MetricCard } from '../visualizations/MetricCard'
import { useResponsive } from '../../hooks/useResponsive'

interface MetricsData {
  activeAgents: number
  previousActiveAgents?: number
  tasksCompleted: number
  previousTasksCompleted?: number
  successRate: number
  previousSuccessRate?: number
  avgDuration: number
  previousAvgDuration?: number
  integrationHealth: {
    github: 'online' | 'offline' | 'degraded'
    slack: 'online' | 'offline' | 'degraded'
  }
}

interface MetricsRowProps {
  data: MetricsData | null
  loading?: boolean
  onMetricClick?: (metricId: string) => void
}

export const MetricsRow: React.FC<MetricsRowProps> = ({
  data,
  loading = false,
  onMetricClick,
}) => {
  const { isMobile, getFlexDirection } = useResponsive()

  const getHealthStatus = (): { status: string; color: 'success' | 'warning' | 'danger' } => {
    if (!data) return { status: 'Unknown', color: 'warning' }

    const { github, slack } = data.integrationHealth
    if (github === 'online' && slack === 'online') {
      return { status: 'Healthy', color: 'success' }
    }
    if (github === 'offline' || slack === 'offline') {
      return { status: 'Offline', color: 'danger' }
    }
    return { status: 'Degraded', color: 'warning' }
  }

  const health = getHealthStatus()

  // Generate announcement text for screen readers
  const getAnnouncementText = () => {
    if (loading || !data) return ''
    return `Dashboard metrics updated: ${data.activeAgents} active agents, ${data.tasksCompleted} tasks completed today, ${data.successRate}% success rate, integration status ${health.status}`
  }

  return (
    <>
      {/* ARIA live region for announcing metric updates to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="euiScreenReaderOnly"
      >
        {getAnnouncementText()}
      </div>
      <EuiFlexGroup
        gutterSize="l"
        responsive={true}
        direction={getFlexDirection()}
        wrap={isMobile}
      >
      {/* Active Agents */}
      <EuiFlexItem>
        <MetricCard
          title={data?.activeAgents || 0}
          description="Active Agents"
          titleColor="primary"
          icon="compute"
          loading={loading}
          trend={data?.previousActiveAgents !== undefined ? {
            current: data.activeAgents,
            previous: data.previousActiveAgents,
          } : undefined}
          onClick={onMetricClick ? () => onMetricClick('agents') : undefined}
          tooltip="Click to view agent details"
        />
      </EuiFlexItem>

      {/* Tasks Completed Today */}
      <EuiFlexItem>
        <MetricCard
          title={data?.tasksCompleted || 0}
          description="Tasks Today"
          titleColor="success"
          icon="checkInCircleFilled"
          loading={loading}
          trend={data?.previousTasksCompleted !== undefined ? {
            current: data.tasksCompleted,
            previous: data.previousTasksCompleted,
          } : undefined}
          onClick={onMetricClick ? () => onMetricClick('tasks') : undefined}
          tooltip="Click to view task details"
        />
      </EuiFlexItem>

      {/* Success Rate */}
      <EuiFlexItem>
        <MetricCard
          title={data?.successRate || 0}
          description="Success Rate (7d)"
          titleColor="accent"
          icon="stats"
          loading={loading}
          format="percentage"
          trend={data?.previousSuccessRate !== undefined ? {
            current: data.successRate,
            previous: data.previousSuccessRate,
          } : undefined}
          onClick={onMetricClick ? () => onMetricClick('success') : undefined}
          tooltip="7-day rolling average success rate"
        />
      </EuiFlexItem>

      {/* Average Duration */}
      <EuiFlexItem>
        <MetricCard
          title={data?.avgDuration || 0}
          description="Avg Duration"
          titleColor="default"
          icon="clock"
          loading={loading}
          format="duration"
          trend={data?.previousAvgDuration !== undefined ? {
            current: data.avgDuration,
            previous: data.previousAvgDuration,
          } : undefined}
          onClick={onMetricClick ? () => onMetricClick('duration') : undefined}
          tooltip="Average task completion time"
        />
      </EuiFlexItem>

      {/* Integration Health */}
      <EuiFlexItem>
        <MetricCard
          title={health.status}
          description="Integrations"
          titleColor={health.color}
          icon="heart"
          loading={loading}
          onClick={onMetricClick ? () => onMetricClick('integrations') : undefined}
          tooltip={`GitHub: ${data?.integrationHealth?.github || 'unknown'}, Slack: ${data?.integrationHealth?.slack || 'unknown'}`}
        />
      </EuiFlexItem>
      </EuiFlexGroup>
    </>
  )
}

export default MetricsRow
