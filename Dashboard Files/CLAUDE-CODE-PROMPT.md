# Claude Code Prompt: Implement Elastic Dashboard Best Practices in Commit-Relay

## Objective
Transform the commit-relay dashboard to follow enterprise-grade Elastic design principles, creating a unified, professional interface with optimal UX for monitoring AI agent orchestration.

## Required Reading
First, thoroughly review:
1. `/Users/ryandahlberg/Projects/commit-relay/docs/` (existing architecture)
2. The comprehensive implementation guide: `COMMIT-RELAY-ELASTIC-DASHBOARD-IMPLEMENTATION.md`

## Core Principles to Apply

### Layout & Visual Hierarchy
- **Top-to-bottom disclosure**: KPIs → trends → detailed data
- **Row-based organization**: Group related visualizations horizontally
- **Central focal point**: Largest/most important chart in center
- **Always use margins**: Enable spacing between all panels for clean separation
- **Responsive breakpoints**: Ensure mobile, tablet, desktop optimization

### Color & Typography
- Use EUI color palette exclusively: `euiColorVis0-9`, semantic colors (success/warning/danger)
- Highlight important data with accent colors, use neutral for baseline
- Self-explanatory panel titles; remove redundant axis labels
- Reduce decimal places to minimum necessary
- Format values consistently (bytes, percentages, durations)

### Visualization Selection
Match chart types to data purpose:
- **Metrics (EuiStat)**: Single important numbers with trend indicators
- **Line charts**: Time-series trends (agent activity, completion rates)
- **Bar charts**: Categorical comparisons (task distribution, error types)
- **Area charts**: Volume over time, cumulative totals
- **Tables (EuiBasicTable)**: Sortable/filterable lists (tasks, logs, decisions)
- **Treemap**: Hierarchical data (task sources, error breakdown)
- **Gauges**: Progress toward limits (capacity, rate limits)

### Component Standards
```tsx
// Use these EUI patterns consistently:
- EuiPage/EuiPageBody/EuiPageHeader for layout
- EuiSuperDatePicker for time controls (top-right)
- EuiPanel with borders (not shadows)
- EuiFlexGroup for responsive grids
- EuiSearchBar for filtering
- EuiBadge/EuiHealth for status indicators
```

## Implementation Tasks

### Phase 1: Foundation
1. Audit current dashboard structure at `/Users/ryandahlberg/Projects/commit-relay`
2. Identify components that need restructuring
3. Set up EUI theme provider if not configured
4. Create responsive layout grid system with margin support

### Phase 2: Primary KPIs (Row 1 - Above fold)
Implement 4-6 prominent metric cards using `EuiStat`:
- Active Agents count (with status color)
- Tasks Completed Today (with percentage change)
- Success Rate 7-day average (with sparkline if possible)
- Average Task Duration (formatted)
- Integration Health status (GitHub/Slack)

### Phase 3: Time Series Visualizations (Row 2)
- Agent task completion rate line chart (last 24h/7d/30d)
- Add reference lines for 75th percentile or SLA thresholds
- Enable zoom (click-drag) and sync across time-based charts
- Hide axis titles when panel title is descriptive

### Phase 4: Distribution Charts (Row 3)
- Task distribution treemap (by source: GitHub/Slack/Other)
- MoE routing confidence histogram
- Use consistent EUI colors across both

### Phase 5: Detailed Monitoring (Row 4+)
- Agent performance stacked bar chart (success/failure over time)
- Integration health cards with metrics
- Recent tasks table with sorting, filtering, pagination
- MoE decision log table with search capability

### Phase 6: Responsive Design
- Test at breakpoints: 1920px, 1366px, 768px, 375px
- Stack panels vertically on mobile
- Simplify visualizations for small screens
- Implement collapsible sections for detailed data
- Use EuiFlyout for mobile navigation

### Phase 7: Interactivity
- Dashboard-wide filters that cascade to all visualizations
- Click-to-drill-down on chart elements
- Export functionality (CSV/JSON)
- Auto-refresh with pause/play controls
- Keyboard shortcuts (r=refresh, f=filter, ?=help)

## File Structure to Create/Modify

```
src/
├── components/
│   ├── dashboard/
│   │   ├── DashboardLayout.tsx          # Main container
│   │   ├── DashboardHeader.tsx          # Time picker, controls
│   │   ├── MetricsRow.tsx               # Primary KPIs
│   │   ├── TimeSeriesPanel.tsx          # Line/area charts
│   │   ├── DistributionPanel.tsx        # Treemaps, histograms
│   │   ├── AgentTable.tsx               # Task/agent tables
│   │   └── FilterBar.tsx                # Global filters
│   ├── visualizations/
│   │   ├── MetricCard.tsx               # Reusable EuiStat wrapper
│   │   ├── TimeSeriesChart.tsx          # Line/area chart component
│   │   ├── BarChart.tsx                 # Bar chart component
│   │   ├── TreemapChart.tsx             # Hierarchical viz
│   │   └── StatusIndicator.tsx          # Health badges
│   └── common/
│       ├── Panel.tsx                    # Consistent panel wrapper
│       └── formatters.ts                # Number/date/duration utils
├── hooks/
│   ├── useDashboardData.ts              # Data fetching
│   ├── useTimeRange.ts                  # Time picker state
│   └── useResponsive.ts                 # Breakpoint detection
└── styles/
    ├── dashboard.scss                   # Dashboard-specific styles
    └── theme.ts                         # EUI theme customization
```

## Data Flow & State Management

1. **Global State** (Context or Redux):
   - Time range selection
   - Active filters
   - Dashboard layout preferences
   - Auto-refresh settings

2. **Data Fetching**:
   - Use SWR or React Query for caching
   - Implement WebSocket for real-time updates
   - Batch API requests where possible
   - Handle loading/error states gracefully

3. **Performance**:
   - Lazy load chart libraries
   - Virtualize long tables (>100 rows)
   - Debounce filter inputs (300ms)
   - Memoize expensive calculations

## Testing Requirements

- [ ] All visualizations render with sample data
- [ ] Responsive behavior at all breakpoints
- [ ] Filter interactions work across panels
- [ ] Time range changes update all charts
- [ ] Export functionality produces valid files
- [ ] Accessibility: keyboard navigation, ARIA labels
- [ ] Loading states don't block UI
- [ ] Error states show helpful messages

## Success Criteria

**Visual Quality**:
- Dashboard looks professional and polished
- Consistent spacing, colors, typography throughout
- No visual jank or layout shifts
- Smooth animations and transitions

**Functionality**:
- All key metrics visible without scrolling
- Drill-down navigation is intuitive
- Filters work predictably across visualizations
- Data updates without page refresh
- Export works for all data types

**Performance**:
- Initial load < 2 seconds
- Filter operations < 500ms
- Smooth scrolling and interactions
- No memory leaks on auto-refresh

**User Experience**:
- Dashboard tells a clear story about agent orchestration
- Important information is immediately obvious
- Power users can dig deeper easily
- Mobile users have a functional (if simplified) experience

## References
- EUI Documentation: https://eui.elastic.co/
- Elastic Charts: https://elastic.github.io/eui/#/elastic-charts
- Dashboard Best Practices: See comprehensive guide
- Kibana Examples: https://www.elastic.co/docs/explore-analyze/dashboards/

---

## Quick Start Command

When ready to begin implementation:

```bash
cd /Users/ryandahlberg/Projects/commit-relay
# Review current structure
find src -type f -name "*.tsx" -o -name "*.jsx" | head -20
# Start with layout foundation, then iterate through phases
```

**Focus Areas**: Layout structure → Primary KPIs → Time series charts → Tables → Polish

Let's build a dashboard that makes commit-relay's AI orchestration crystal clear! 🚀
