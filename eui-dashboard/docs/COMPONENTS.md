# EUI Dashboard Component Documentation

This document describes all reusable components in the commit-relay EUI dashboard.

## Table of Contents
- [Visualization Components](#visualization-components)
  - [MetricCard](#metriccard)
  - [TimeSeriesChart](#timeserieschart)
  - [BarChart](#barchart)
  - [TreemapChart](#treemapchart)
  - [HistogramChart](#histogramchart)
  - [StatusIndicator](#statusindicator)
- [Layout Components](#layout-components)
  - [Panel](#panel)
  - [DashboardHeader](#dashboardheader)
  - [DashboardLayout](#dashboardlayout)
  - [FilterBar](#filterbar)
  - [MetricsRow](#metricsrow)
  - [AgentTable](#agenttable)

---

## Visualization Components

### MetricCard

Reusable metric display component using EuiStat for KPI visualization.

**Location**: `src/components/visualizations/MetricCard.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string \| number` | required | Main value to display |
| description | `string` | required | Label below the value |
| titleColor | `'default' \| 'subdued' \| 'primary' \| 'success' \| 'danger' \| 'accent' \| 'warning'` | `'default'` | Color of the main value |
| icon | `IconType` | - | Optional icon from EUI |
| iconColor | `string` | - | Color for the icon |
| loading | `boolean` | `false` | Show loading spinner |
| trend | `{ current: number; previous: number }` | - | Show trend indicator |
| format | `'number' \| 'percentage' \| 'duration' \| 'compact' \| 'none'` | `'none'` | Value formatting |
| onClick | `() => void` | - | Click handler |
| tooltip | `string` | - | Tooltip text |
| titleSize | `'xxxs' \| 'xxs' \| 'xs' \| 's' \| 'm' \| 'l'` | `'l'` | Size of the title |

#### Usage Example

```tsx
import { MetricCard } from '../visualizations/MetricCard'

<MetricCard
  title={42}
  description="Active Agents"
  titleColor="primary"
  icon="compute"
  trend={{ current: 42, previous: 38 }}
  onClick={() => console.log('Clicked')}
  tooltip="Click to view details"
/>
```

#### Dependencies
- `@elastic/eui`: EuiPanel, EuiStat, EuiIcon, EuiFlexGroup, EuiFlexItem, EuiText, EuiLoadingSpinner, EuiToolTip
- `../common/formatters`: formatTrend, formatCompactNumber, formatPercentage, formatDuration

---

### TimeSeriesChart

Time series visualization using Elastic Charts for trend data.

**Location**: `src/components/visualizations/TimeSeriesChart.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | required | Chart title |
| data | `DataPoint[]` | required | Array of data points |
| series | `SeriesConfig[]` | required | Series configuration |
| loading | `boolean` | `false` | Show loading state |
| error | `string \| null` | `null` | Error message |
| height | `number` | `300` | Chart height in pixels |
| xAxisTitle | `string` | - | X-axis label |
| yAxisTitle | `string` | - | Y-axis label |
| showLegend | `boolean` | `true` | Display legend |
| legendPosition | `Position` | `Position.Right` | Legend placement |
| enableZoom | `boolean` | `true` | Enable brush zoom |
| onBrush | `(start: number, end: number) => void` | - | Zoom callback |
| onElementClick | `(data: any) => void` | - | Click callback |
| showGrid | `boolean` | `true` | Show grid lines |
| themeMode | `'light' \| 'dark'` | `'light'` | Color theme |

#### Data Types

```typescript
interface DataPoint {
  timestamp: number | Date | string
  [key: string]: number | Date | string
}

interface SeriesConfig {
  id: string
  name: string
  accessor: string
  color?: string
  type?: 'line' | 'area'
}
```

#### Usage Example

```tsx
import { TimeSeriesChart } from '../visualizations/TimeSeriesChart'

const data = [
  { timestamp: Date.now() - 3600000, workers: 5, tasks: 10 },
  { timestamp: Date.now(), workers: 8, tasks: 15 },
]

<TimeSeriesChart
  title="Agent Activity"
  data={data}
  series={[
    { id: 'workers', name: 'Workers', accessor: 'workers', color: '#006BB4' },
    { id: 'tasks', name: 'Tasks', accessor: 'tasks', color: '#00BFB3' },
  ]}
  height={300}
  enableZoom={true}
  themeMode="light"
/>
```

#### Dependencies
- `@elastic/charts`: Chart, Settings, Axis, LineSeries, AreaSeries, etc.
- `@elastic/eui`: EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText
- `../common/Panel`
- `../../styles/theme`: chartColors
- `../common/formatters`: formatNumber, formatTime

---

### BarChart

Bar chart component for categorical data visualization.

**Location**: `src/components/visualizations/BarChart.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | required | Chart title |
| data | `DataPoint[]` | required | Array of data points |
| xAccessor | `string` | `'category'` | Field for x-axis |
| yAccessor | `string` | `'value'` | Field for y-axis |
| loading | `boolean` | `false` | Show loading state |
| error | `string \| null` | `null` | Error message |
| height | `number` | `300` | Chart height in pixels |
| horizontal | `boolean` | `false` | Horizontal bar orientation |
| stacked | `boolean` | `false` | Enable stacking |
| showLegend | `boolean` | `false` | Display legend |
| color | `string` | `chartColors[0]` | Bar color |
| themeMode | `'light' \| 'dark'` | `'light'` | Color theme |
| onElementClick | `(data: any) => void` | - | Click callback |
| sortByValue | `boolean` | `true` | Sort by value descending |
| maxBars | `number` | `10` | Maximum bars to display |

#### Usage Example

```tsx
import { BarChart } from '../visualizations/BarChart'

const data = [
  { category: 'GitHub', value: 45 },
  { category: 'Slack', value: 30 },
  { category: 'API', value: 15 },
]

<BarChart
  title="Tasks by Source"
  data={data}
  horizontal={true}
  sortByValue={true}
  maxBars={10}
  themeMode="light"
/>
```

#### Dependencies
- `@elastic/charts`: Chart, Settings, Axis, BarSeries, etc.
- `@elastic/eui`: EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText
- `../common/Panel`
- `../../styles/theme`: chartColors

---

### TreemapChart

Treemap visualization for hierarchical/proportional data.

**Location**: `src/components/visualizations/TreemapChart.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | required | Chart title |
| data | `TreemapData[]` | required | Hierarchical data |
| loading | `boolean` | `false` | Show loading state |
| error | `string \| null` | `null` | Error message |
| height | `number` | `300` | Chart height in pixels |
| onElementClick | `(data: any) => void` | - | Click callback |
| themeMode | `'light' \| 'dark'` | `'light'` | Color theme |

#### Data Types

```typescript
interface TreemapData {
  category: string
  value: number
  children?: TreemapData[]
  color?: string
}
```

#### Usage Example

```tsx
import { TreemapChart } from '../visualizations/TreemapChart'

const data = [
  { category: 'GitHub', value: 45, color: '#006BB4' },
  { category: 'Slack', value: 30, color: '#00BFB3' },
  { category: 'API', value: 15, color: '#54B399' },
]

<TreemapChart
  title="Task Distribution"
  data={data}
  height={300}
  themeMode="light"
/>
```

#### Dependencies
- `@elastic/charts`: Chart, Settings, Partition, PartitionLayout, etc.
- `@elastic/eui`: EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText
- `../common/Panel`
- `../../styles/theme`: chartColors

---

### HistogramChart

Histogram for distribution visualization.

**Location**: `src/components/visualizations/HistogramChart.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | required | Chart title |
| data | `HistogramData[]` | required | Bin data |
| loading | `boolean` | `false` | Show loading state |
| error | `string \| null` | `null` | Error message |
| height | `number` | `300` | Chart height in pixels |
| xAxisTitle | `string` | `'Value'` | X-axis label |
| yAxisTitle | `string` | `'Count'` | Y-axis label |
| color | `string` | `chartColors[1]` | Bar color |
| showPercentage | `boolean` | `false` | Show as percentage |
| themeMode | `'light' \| 'dark'` | `'light'` | Color theme |
| onElementClick | `(data: any) => void` | - | Click callback |

#### Data Types

```typescript
interface HistogramData {
  bin: string | number
  count: number
}
```

#### Usage Example

```tsx
import { HistogramChart } from '../visualizations/HistogramChart'

const data = [
  { bin: '0-20%', count: 5 },
  { bin: '20-40%', count: 12 },
  { bin: '40-60%', count: 28 },
  { bin: '60-80%', count: 45 },
  { bin: '80-100%', count: 65 },
]

<HistogramChart
  title="Confidence Distribution"
  data={data}
  xAxisTitle="Confidence Range"
  yAxisTitle="Count"
  themeMode="light"
/>
```

#### Dependencies
- `@elastic/charts`: Chart, Settings, Axis, BarSeries, etc.
- `@elastic/eui`: EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText
- `../common/Panel`
- `../../styles/theme`: chartColors
- `../common/formatters`: formatNumber, formatPercentage

---

### StatusIndicator

Status badge/health indicator component.

**Location**: `src/components/visualizations/StatusIndicator.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| status | `string` | required | Status value |
| label | `string` | - | Display label (defaults to status) |
| variant | `'badge' \| 'health' \| 'dot'` | `'badge'` | Display style |
| size | `'s' \| 'm'` | `'m'` | Component size |
| tooltip | `string` | - | Tooltip text |
| showLabel | `boolean` | `true` | Show label text |

#### IntegrationHealth Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| name | `string` | required | Integration name |
| status | `'online' \| 'offline' \| 'degraded'` | required | Health status |
| lastCheck | `Date \| string` | - | Last check timestamp |
| metrics | `{ label: string; value: string \| number }[]` | `[]` | Additional metrics |

#### Usage Example

```tsx
import { StatusIndicator, IntegrationHealth } from '../visualizations/StatusIndicator'

// Badge variant
<StatusIndicator status="active" variant="badge" />

// Health variant
<StatusIndicator status="completed" variant="health" />

// Dot variant
<StatusIndicator status="pending" variant="dot" />

// Integration health card
<IntegrationHealth
  name="GitHub"
  status="online"
  lastCheck={new Date()}
  metrics={[
    { label: 'API Calls', value: '1,234' },
    { label: 'Latency', value: '45ms' },
  ]}
/>
```

#### Dependencies
- `@elastic/eui`: EuiBadge, EuiHealth, EuiFlexGroup, EuiFlexItem, EuiText, EuiToolTip
- `../common/formatters`: getStatusColor

---

## Layout Components

### Panel

Consistent panel wrapper following Elastic best practices.

**Location**: `src/components/common/Panel.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | - | Panel title |
| titleSize | `'xxxs' \| 'xxs' \| 'xs' \| 's' \| 'm' \| 'l'` | `'s'` | Title font size |
| children | `React.ReactNode` | required | Panel content |
| loading | `boolean` | `false` | Show loading state |
| error | `string \| null` | `null` | Error message |
| paddingSize | `'none' \| 's' \| 'm' \| 'l'` | `'m'` | Internal padding |
| height | `number \| string` | - | Fixed height |
| actions | `React.ReactNode` | - | Action buttons |
| onRefresh | `() => void` | - | Refresh callback |
| emptyMessage | `string` | `'No data available'` | Empty state text |
| isEmpty | `boolean` | `false` | Show empty state |

#### Usage Example

```tsx
import { Panel } from '../common/Panel'

<Panel
  title="Recent Activity"
  loading={isLoading}
  error={error}
  onRefresh={() => fetchData()}
  actions={<EuiButtonIcon iconType="download" />}
>
  <YourContent />
</Panel>
```

#### Dependencies
- `@elastic/eui`: EuiPanel, EuiTitle, EuiSpacer, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText, EuiButtonIcon, EuiToolTip

---

### DashboardHeader

Header component with navigation, date picker, and controls.

**Location**: `src/components/dashboard/DashboardHeader.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| theme | `'light' \| 'dark'` | required | Current theme |
| onToggleTheme | `() => void` | required | Theme toggle callback |
| start | `string` | required | Start time (EUI format) |
| end | `string` | required | End time (EUI format) |
| onTimeChange | `(props: OnTimeChangeProps) => void` | required | Time change callback |
| onRefresh | `(props: OnRefreshProps) => void` | required | Refresh callback |
| isRefreshing | `boolean` | required | Loading state |
| onExport | `() => void` | required | Export callback |
| selectedTab | `string` | required | Current tab ID |
| onTabChange | `(tabId: string) => void` | required | Tab change callback |
| tabs | `{ id: string; name: string; icon: string }[]` | required | Navigation tabs |

#### Usage Example

```tsx
import { DashboardHeader } from './DashboardHeader'

<DashboardHeader
  theme="light"
  onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
  start="now-24h"
  end="now"
  onTimeChange={handleTimeChange}
  onRefresh={handleRefresh}
  isRefreshing={isLoading}
  onExport={handleExport}
  selectedTab="overview"
  onTabChange={setSelectedTab}
  tabs={[
    { id: 'overview', name: 'Overview', icon: 'dashboardApp' },
    { id: 'tasks', name: 'Tasks', icon: 'list' },
  ]}
/>
```

#### Dependencies
- `@elastic/eui`: EuiHeader, EuiHeaderSection, EuiSuperDatePicker, EuiFlyout, EuiSideNav, etc.
- `../../hooks/useResponsive`

---

### DashboardLayout

Main dashboard layout component with full feature set.

**Location**: `src/components/dashboard/DashboardLayout.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| theme | `'light' \| 'dark'` | required | Current theme |
| onToggleTheme | `() => void` | required | Theme toggle callback |

#### Usage Example

```tsx
import { DashboardLayout } from './DashboardLayout'

<DashboardLayout
  theme={theme}
  onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
/>
```

#### Features
- KPI metrics row
- Filter bar
- Time series charts
- Distribution visualizations
- Performance charts
- Integration health
- Keyboard shortcuts

#### Dependencies
- All visualization components
- `@elastic/eui`: EuiPage, EuiPageBody, EuiSpacer, EuiFlexGroup, EuiFlexItem, EuiCallOut
- `../../hooks/useResponsive`
- `../../utils/exportData`

---

### FilterBar

Dashboard-wide filtering controls.

**Location**: `src/components/dashboard/FilterBar.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| filters | `DashboardFilters` | required | Current filter state |
| onFiltersChange | `(filters: DashboardFilters) => void` | required | Filter change callback |
| onClearFilters | `() => void` | required | Clear all filters |
| availableAgents | `string[]` | `[]` | Agent options |
| showSearchBar | `boolean` | `true` | Show search bar |

#### Filter Types

```typescript
interface DashboardFilters {
  query?: string
  status?: string[]
  source?: string[]
  agent?: string
  timeRange?: string
}
```

#### Usage Example

```tsx
import { FilterBar, DashboardFilters } from './FilterBar'

const [filters, setFilters] = useState<DashboardFilters>({})

<FilterBar
  filters={filters}
  onFiltersChange={setFilters}
  onClearFilters={() => setFilters({})}
  showSearchBar={true}
/>
```

#### Dependencies
- `@elastic/eui`: EuiSearchBar, EuiFilterGroup, EuiFilterButton, EuiPopover, EuiFilterSelectItem

---

### MetricsRow

Primary KPI display row.

**Location**: `src/components/dashboard/MetricsRow.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| data | `MetricsData \| null` | required | Metrics data |
| loading | `boolean` | `false` | Loading state |
| onMetricClick | `(metricId: string) => void` | - | Metric click callback |

#### Data Types

```typescript
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
```

#### Usage Example

```tsx
import { MetricsRow } from './MetricsRow'

<MetricsRow
  data={metricsData}
  loading={isLoading}
  onMetricClick={(id) => console.log('Clicked:', id)}
/>
```

#### Dependencies
- `@elastic/eui`: EuiFlexGroup, EuiFlexItem
- `../visualizations/MetricCard`
- `../../hooks/useResponsive`

---

### AgentTable

Data table with sorting, filtering, and pagination.

**Location**: `src/components/dashboard/AgentTable.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| data | `AgentTask[]` | required | Task data |
| loading | `boolean` | `false` | Loading state |
| error | `string \| null` | `null` | Error message |
| title | `string` | `'Recent Agent Tasks'` | Table title |
| onTaskClick | `(task: AgentTask) => void` | - | Row click callback |
| onRetry | `(taskId: string) => void` | - | Retry action callback |
| onCancel | `(taskId: string) => void` | - | Cancel action callback |
| pageSize | `number` | `10` | Rows per page |

#### Data Types

```typescript
interface AgentTask {
  id: string
  agent: string
  agentType: string
  task: string
  status: 'active' | 'completed' | 'failed' | 'pending' | 'idle'
  duration: number
  timestamp: Date | string
  source: string
}
```

#### Usage Example

```tsx
import { AgentTable } from './AgentTable'

const tasks = [
  {
    id: '1',
    agent: 'coordinator-001',
    agentType: 'coordinator',
    task: 'Process webhook',
    status: 'completed',
    duration: 1500,
    timestamp: new Date(),
    source: 'github',
  },
]

<AgentTable
  data={tasks}
  loading={isLoading}
  onTaskClick={(task) => openTaskDetails(task)}
  onRetry={(id) => retryTask(id)}
  onCancel={(id) => cancelTask(id)}
  pageSize={25}
/>
```

#### Features
- Sortable columns
- Searchable
- Paginated
- Export to CSV
- Row actions (Retry/Cancel)

#### Dependencies
- `@elastic/eui`: EuiBasicTable, EuiSearchBar, EuiBadge, EuiSpacer, etc.
- `../common/Panel`
- `../visualizations/StatusIndicator`
- `../common/formatters`
- `../../utils/exportData`

---

## Best Practices

### Component Usage

1. **Always handle loading states**: Pass `loading={true}` while fetching data
2. **Always handle errors**: Pass `error={errorMessage}` when fetch fails
3. **Provide empty states**: Use `isEmpty` prop or check for empty data
4. **Use semantic colors**: Follow EUI color conventions for status
5. **Respect accessibility**: Include tooltips and ARIA labels

### Performance

1. **Memoize callbacks**: Use `useCallback` for event handlers
2. **Memoize data**: Use `useMemo` for computed data
3. **Limit data**: Use `maxBars`, `pageSize` to limit rendered items
4. **Lazy load**: Load heavy components only when visible

### Styling

1. **Use EUI theme**: Don't override with custom CSS
2. **Use borders over shadows**: `hasBorder={true}` for panels
3. **Consistent padding**: Use `paddingSize="m"` across panels
4. **Responsive design**: Test on mobile, tablet, desktop
