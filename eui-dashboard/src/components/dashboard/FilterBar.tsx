/**
 * FilterBar component for dashboard-wide filtering
 * Following Elastic best practices for search and filters
 */

import React from 'react'
import {
  EuiSearchBar,
  EuiFilterGroup,
  EuiFilterButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiButton,
  Query,
  EuiFilterSelectItem,
  EuiPopover,
  EuiFilterButtonProps,
} from '@elastic/eui'

export interface DashboardFilters {
  query?: string
  status?: string[]
  source?: string[]
  agent?: string
  timeRange?: string
}

interface FilterBarProps {
  filters: DashboardFilters
  onFiltersChange: (filters: DashboardFilters) => void
  onClearFilters: () => void
  availableAgents?: string[]
  showSearchBar?: boolean
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  availableAgents = [],
  showSearchBar = true,
}) => {
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = React.useState(false)
  const [isSourcePopoverOpen, setIsSourcePopoverOpen] = React.useState(false)

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' },
    { value: 'idle', label: 'Idle' },
  ]

  const sourceOptions = [
    { value: 'github', label: 'GitHub' },
    { value: 'slack', label: 'Slack' },
    { value: 'api', label: 'API' },
    { value: 'manual', label: 'Manual' },
  ]

  const handleSearchChange = ({ query }: { query: Query | null }) => {
    onFiltersChange({
      ...filters,
      query: query ? query.text : '',
    })
  }

  const toggleStatus = (value: string) => {
    const currentStatus = filters.status || []
    const newStatus = currentStatus.includes(value)
      ? currentStatus.filter((s) => s !== value)
      : [...currentStatus, value]

    onFiltersChange({
      ...filters,
      status: newStatus,
    })
  }

  const toggleSource = (value: string) => {
    const currentSource = filters.source || []
    const newSource = currentSource.includes(value)
      ? currentSource.filter((s) => s !== value)
      : [...currentSource, value]

    onFiltersChange({
      ...filters,
      source: newSource,
    })
  }

  const hasActiveFilters =
    (filters.status && filters.status.length > 0) ||
    (filters.source && filters.source.length > 0) ||
    (filters.query && filters.query.length > 0)

  return (
    <>
      {showSearchBar && (
        <>
          <EuiSearchBar
            box={{
              placeholder: 'Search agents, tasks, or logs...',
              incremental: true,
              schema: {
                fields: {
                  agent: { type: 'string' },
                  status: { type: 'string' },
                  source: { type: 'string' },
                  task: { type: 'string' },
                },
              },
            }}
            onChange={handleSearchChange}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            {/* Status filter */}
            <EuiPopover
              button={
                <EuiFilterButton
                  iconType="arrowDown"
                  onClick={() => setIsStatusPopoverOpen(!isStatusPopoverOpen)}
                  isSelected={isStatusPopoverOpen}
                  numFilters={statusOptions.length}
                  hasActiveFilters={filters.status && filters.status.length > 0}
                  numActiveFilters={filters.status?.length || 0}
                >
                  Status
                </EuiFilterButton>
              }
              isOpen={isStatusPopoverOpen}
              closePopover={() => setIsStatusPopoverOpen(false)}
              panelPaddingSize="none"
            >
              {statusOptions.map((option) => (
                <EuiFilterSelectItem
                  key={option.value}
                  checked={filters.status?.includes(option.value) ? 'on' : undefined}
                  onClick={() => toggleStatus(option.value)}
                >
                  {option.label}
                </EuiFilterSelectItem>
              ))}
            </EuiPopover>

            {/* Source filter */}
            <EuiPopover
              button={
                <EuiFilterButton
                  iconType="arrowDown"
                  onClick={() => setIsSourcePopoverOpen(!isSourcePopoverOpen)}
                  isSelected={isSourcePopoverOpen}
                  numFilters={sourceOptions.length}
                  hasActiveFilters={filters.source && filters.source.length > 0}
                  numActiveFilters={filters.source?.length || 0}
                >
                  Source
                </EuiFilterButton>
              }
              isOpen={isSourcePopoverOpen}
              closePopover={() => setIsSourcePopoverOpen(false)}
              panelPaddingSize="none"
            >
              {sourceOptions.map((option) => (
                <EuiFilterSelectItem
                  key={option.value}
                  checked={filters.source?.includes(option.value) ? 'on' : undefined}
                  onClick={() => toggleSource(option.value)}
                >
                  {option.label}
                </EuiFilterSelectItem>
              ))}
            </EuiPopover>
          </EuiFilterGroup>
        </EuiFlexItem>

        {hasActiveFilters && (
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              color="text"
              onClick={onClearFilters}
              iconType="cross"
            >
              Clear filters
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  )
}

export default FilterBar
