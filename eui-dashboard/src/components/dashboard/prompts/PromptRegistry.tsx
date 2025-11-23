import { useState, useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiHealth,
  EuiBadge,
  EuiText,
  EuiSpacer,
  EuiFieldSearch,
  EuiSelect,
  EuiLoadingSpinner,
  EuiButtonIcon,
  EuiToolTip,
  Criteria,
  EuiTableSortingType,
  EuiStat,
  EuiIcon,
} from '@elastic/eui'
import { usePrompts, PromptSummary } from '../../../hooks/usePrompts'
import PromptDetailFlyout from './PromptDetailFlyout'

const PromptRegistry = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof PromptSummary>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const filters = useMemo(() => ({
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
  }), [categoryFilter, searchQuery])

  const { data, loading, error, refetch } = usePrompts(filters, 30000)

  const prompts = data?.prompts || []
  const categories = data?.categories || []

  const sortedPrompts = useMemo(() => {
    return [...prompts].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'metrics':
          comparison = a.metrics.total_uses - b.metrics.total_uses
          break
        case 'category':
          comparison = a.category.localeCompare(b.category)
          break
        case 'current_version':
          comparison = (a.current_version || '').localeCompare(b.current_version || '')
          break
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [prompts, sortField, sortDirection])

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!prompts.length) return null
    const totalUses = prompts.reduce((sum, p) => sum + p.metrics.total_uses, 0)
    const avgAccuracy = prompts.reduce((sum, p) => sum + p.metrics.accuracy, 0) / prompts.length
    const avgConfidence = prompts.reduce((sum, p) => sum + p.metrics.avg_confidence, 0) / prompts.length
    return { totalUses, avgAccuracy, avgConfidence }
  }, [prompts])

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.95) return 'success'
    if (accuracy >= 0.85) return 'primary'
    if (accuracy >= 0.75) return 'warning'
    return 'danger'
  }

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    return category?.color || '#666666'
  }

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const columns: EuiBasicTableColumn<PromptSummary>[] = [
    {
      field: 'name',
      name: 'Prompt',
      sortable: true,
      width: '200px',
      render: (name: string, prompt: PromptSummary) => (
        <div>
          <EuiText size="s"><strong>{name}</strong></EuiText>
          <EuiText size="xs" color="subdued">
            {truncateText(prompt.description, 40)}
          </EuiText>
        </div>
      ),
    },
    {
      field: 'category',
      name: 'Category',
      sortable: true,
      width: '120px',
      render: (category: string) => (
        <EuiBadge style={{ backgroundColor: getCategoryColor(category), color: 'white' }}>
          {category}
        </EuiBadge>
      ),
    },
    {
      field: 'current_version',
      name: 'Version',
      sortable: true,
      width: '100px',
      render: (version: string | null) => (
        <EuiBadge color="hollow">
          {version || 'N/A'}
        </EuiBadge>
      ),
    },
    {
      field: 'metrics',
      name: 'Uses',
      sortable: true,
      width: '100px',
      render: (metrics: PromptSummary['metrics']) => (
        <EuiText size="s">
          {metrics.total_uses.toLocaleString()}
        </EuiText>
      ),
    },
    {
      field: 'metrics',
      name: 'Accuracy',
      width: '100px',
      render: (metrics: PromptSummary['metrics']) => (
        <EuiHealth color={getAccuracyColor(metrics.accuracy)}>
          {(metrics.accuracy * 100).toFixed(0)}%
        </EuiHealth>
      ),
    },
    {
      field: 'metrics',
      name: 'Confidence',
      width: '100px',
      render: (metrics: PromptSummary['metrics']) => (
        <EuiText size="s">
          {(metrics.avg_confidence * 100).toFixed(0)}%
        </EuiText>
      ),
    },
    {
      field: 'metrics',
      name: 'Latency',
      width: '100px',
      render: (metrics: PromptSummary['metrics']) => (
        <EuiText size="xs" color={metrics.avg_latency_ms > 2000 ? 'warning' : 'default'}>
          {metrics.avg_latency_ms}ms
        </EuiText>
      ),
    },
    {
      field: 'tags',
      name: 'Tags',
      width: '180px',
      render: (tags: string[]) => (
        <EuiFlexGroup wrap gutterSize="xs" responsive={false}>
          {tags.slice(0, 2).map(tag => (
            <EuiFlexItem grow={false} key={tag}>
              <EuiBadge color="hollow">{tag}</EuiBadge>
            </EuiFlexItem>
          ))}
          {tags.length > 2 && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tags.slice(2).join(', ')}>
                <EuiBadge color="hollow">+{tags.length - 2}</EuiBadge>
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
    {
      name: 'Actions',
      width: '60px',
      render: (prompt: PromptSummary) => (
        <EuiToolTip content="View details">
          <EuiButtonIcon
            iconType="inspect"
            aria-label="View prompt details"
            onClick={() => setSelectedPromptId(prompt.id)}
          />
        </EuiToolTip>
      ),
    },
  ]

  const onTableChange = ({ sort }: Criteria<PromptSummary>) => {
    if (sort) {
      setSortField(sort.field as keyof PromptSummary)
      setSortDirection(sort.direction)
    }
  }

  const sorting: EuiTableSortingType<PromptSummary> = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  }

  const categoryOptions = [
    { value: '', text: 'All Categories' },
    ...categories.map(cat => ({ value: cat.id, text: cat.name }))
  ]

  if (loading && !data) {
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

  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Prompt Registry</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {error}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Stats Row */}
      {stats && (
        <>
          <EuiFlexGroup gutterSize="l">
            <EuiFlexItem>
              <EuiPanel hasBorder>
                <EuiStat
                  title={prompts.length}
                  description="Total Prompts"
                  titleColor="primary"
                  textAlign="center"
                >
                  <EuiIcon type="documents" color="primary" />
                </EuiStat>
              </EuiPanel>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiPanel hasBorder>
                <EuiStat
                  title={stats.totalUses.toLocaleString()}
                  description="Total Uses"
                  titleColor="success"
                  textAlign="center"
                >
                  <EuiIcon type="play" color="success" />
                </EuiStat>
              </EuiPanel>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiPanel hasBorder>
                <EuiStat
                  title={`${(stats.avgAccuracy * 100).toFixed(1)}%`}
                  description="Avg Accuracy"
                  titleColor="accent"
                  textAlign="center"
                >
                  <EuiIcon type="bullseye" color="accent" />
                </EuiStat>
              </EuiPanel>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiPanel hasBorder>
                <EuiStat
                  title={`${(stats.avgConfidence * 100).toFixed(1)}%`}
                  description="Avg Confidence"
                  titleColor="warning"
                  textAlign="center"
                >
                  <EuiIcon type="visGauge" color="warning" />
                </EuiStat>
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="l" />
        </>
      )}

      {/* Main Table */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Prompt Registry</h3></EuiTitle>
        <EuiSpacer size="m" />

        {/* Filters */}
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={2}>
            <EuiFieldSearch
              placeholder="Search prompts by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              isClearable
            />
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiSelect
              options={categoryOptions}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Results count */}
        <EuiText size="xs" color="subdued">
          Showing {sortedPrompts.length} of {data?.total || 0} prompts
        </EuiText>

        <EuiSpacer size="s" />

        {/* Table */}
        <EuiBasicTable
          items={sortedPrompts}
          columns={columns}
          sorting={sorting}
          onChange={onTableChange}
          tableLayout="auto"
          rowProps={(item) => ({
            onClick: () => setSelectedPromptId(item.id),
            style: { cursor: 'pointer' }
          })}
        />
      </EuiPanel>

      {/* Detail Flyout */}
      {selectedPromptId && (
        <PromptDetailFlyout
          promptId={selectedPromptId}
          onClose={() => setSelectedPromptId(null)}
          onVersionActivated={refetch}
        />
      )}
    </>
  )
}

export default PromptRegistry
