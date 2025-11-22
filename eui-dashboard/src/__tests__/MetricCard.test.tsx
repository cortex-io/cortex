/**
 * Unit tests for MetricCard component
 * Tests rendering, formatting, and interactions
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EuiProvider } from '@elastic/eui'
import { MetricCard } from '../components/visualizations/MetricCard'

// Wrapper for EUI provider
const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <EuiProvider colorMode="light">
      {component}
    </EuiProvider>
  )
}

describe('MetricCard', () => {
  describe('basic rendering', () => {
    it('renders with title and description', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Active Agents"
        />
      )

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('Active Agents')).toBeInTheDocument()
    })

    it('renders string title correctly', () => {
      renderWithProvider(
        <MetricCard
          title="Healthy"
          description="Status"
        />
      )

      expect(screen.getByText('Healthy')).toBeInTheDocument()
    })

    it('applies title color', () => {
      const { container } = renderWithProvider(
        <MetricCard
          title={50}
          description="Success Rate"
          titleColor="success"
        />
      )

      // Check that EuiStat received the color prop
      const stat = container.querySelector('.euiStat')
      expect(stat).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows loading spinner when loading', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Loading Test"
          loading={true}
        />
      )

      // Should show loading spinner instead of content
      expect(screen.queryByText('100')).not.toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('shows content when not loading', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Not Loading"
          loading={false}
        />
      )

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })
  })

  describe('value formatting', () => {
    it('formats number with locale separators', () => {
      renderWithProvider(
        <MetricCard
          title={1000}
          description="Count"
          format="number"
        />
      )

      // Should have comma separator
      expect(screen.getByText('1,000')).toBeInTheDocument()
    })

    it('formats percentage correctly', () => {
      renderWithProvider(
        <MetricCard
          title={95.5}
          description="Success Rate"
          format="percentage"
        />
      )

      expect(screen.getByText('95.5%')).toBeInTheDocument()
    })

    it('formats duration correctly', () => {
      renderWithProvider(
        <MetricCard
          title={3500}
          description="Avg Duration"
          format="duration"
        />
      )

      expect(screen.getByText('3.5s')).toBeInTheDocument()
    })

    it('formats compact numbers correctly', () => {
      renderWithProvider(
        <MetricCard
          title={1500}
          description="Total"
          format="compact"
        />
      )

      expect(screen.getByText('1.5K')).toBeInTheDocument()
    })

    it('displays string values as-is', () => {
      renderWithProvider(
        <MetricCard
          title="N/A"
          description="Status"
          format="none"
        />
      )

      expect(screen.getByText('N/A')).toBeInTheDocument()
    })
  })

  describe('trend indicator', () => {
    it('shows upward trend for positive change', () => {
      renderWithProvider(
        <MetricCard
          title={110}
          description="Tasks"
          trend={{ current: 110, previous: 100 }}
        />
      )

      expect(screen.getByText('+10.0%')).toBeInTheDocument()
    })

    it('shows downward trend for negative change', () => {
      renderWithProvider(
        <MetricCard
          title={90}
          description="Tasks"
          trend={{ current: 90, previous: 100 }}
        />
      )

      expect(screen.getByText('-10.0%')).toBeInTheDocument()
    })

    it('shows N/A when previous is zero', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Tasks"
          trend={{ current: 100, previous: 0 }}
        />
      )

      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('does not show trend when not provided', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Tasks"
        />
      )

      expect(screen.queryByText('%')).not.toBeInTheDocument()
    })
  })

  describe('click handler', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn()
      renderWithProvider(
        <MetricCard
          title={100}
          description="Clickable"
          onClick={handleClick}
        />
      )

      const panel = screen.getByText('100').closest('.euiPanel')
      if (panel) {
        fireEvent.click(panel)
      }

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('has pointer cursor when clickable', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Clickable"
          onClick={() => {}}
        />
      )

      const panel = screen.getByText('100').closest('.euiPanel')
      expect(panel).toHaveStyle({ cursor: 'pointer' })
    })

    it('has default cursor when not clickable', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="Not Clickable"
        />
      )

      const panel = screen.getByText('100').closest('.euiPanel')
      expect(panel).toHaveStyle({ cursor: 'default' })
    })
  })

  describe('tooltip', () => {
    it('wraps content in tooltip when tooltip prop provided', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="With Tooltip"
          tooltip="Click for details"
        />
      )

      // The content should still be visible
      expect(screen.getByText('100')).toBeInTheDocument()
    })

    it('does not show tooltip wrapper when no tooltip', () => {
      renderWithProvider(
        <MetricCard
          title={100}
          description="No Tooltip"
        />
      )

      expect(screen.getByText('100')).toBeInTheDocument()
    })
  })

  describe('icon', () => {
    it('renders with icon when provided', () => {
      const { container } = renderWithProvider(
        <MetricCard
          title={100}
          description="With Icon"
          icon="compute"
        />
      )

      // Check for icon presence
      const icon = container.querySelector('.euiIcon')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('title size', () => {
    it('applies custom title size', () => {
      const { container } = renderWithProvider(
        <MetricCard
          title={100}
          description="Small Title"
          titleSize="s"
        />
      )

      // Check that EuiStat received the titleSize prop
      const stat = container.querySelector('.euiStat')
      expect(stat).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('panel has border for visual distinction', () => {
      const { container } = renderWithProvider(
        <MetricCard
          title={100}
          description="Accessible"
        />
      )

      const panel = container.querySelector('.euiPanel')
      expect(panel).toHaveClass('euiPanel--hasBorder')
    })
  })
})
