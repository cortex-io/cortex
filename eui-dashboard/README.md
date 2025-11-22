# Commit-Relay EUI Dashboard

A modern, enterprise-grade monitoring dashboard for the commit-relay automation system, built with Elastic UI (EUI) components.

## Overview

This dashboard provides real-time monitoring and visualization of the commit-relay system, including:

- **System Metrics**: Worker status, token usage, task completion rates
- **MoE Intelligence**: Routing decisions, confidence distributions, expert utilization
- **Agent Management**: Active workers, execution managers, agent registry
- **Governance**: Compliance scores, policy violations, audit trails
- **Health Monitoring**: Daemon status, alerts, system health

## Installation

### Prerequisites

- Node.js 18+
- npm 9+ or yarn

### Setup

```bash
cd eui-dashboard
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
```

The build output will be in the `dist/` directory.

### Type Checking

```bash
npm run lint
```

## Project Structure

```
eui-dashboard/
  src/
    components/
      common/          # Shared components (Panel, formatters)
      dashboard/       # Main dashboard components
        panels/        # Dashboard panels (ExecutionManagers, LogStreaming, etc.)
        visualizations/  # Chart visualizations
      visualizations/  # Reusable chart components
    hooks/            # React hooks
    services/         # API services
    styles/           # Theme configuration
    types/            # TypeScript type definitions
    utils/            # Utility functions (export, data processing)
    App.tsx           # Main application component
    main.tsx          # Entry point
  coordination/       # Dashboard coordination files
  dist/              # Production build output
  package.json
  tsconfig.json
  vite.config.ts
```

## Key Components

### Visualization Components

All visualization components are located in `src/components/visualizations/`:

- **TimeSeriesChart**: Line/area charts for time-based data
- **BarChart**: Horizontal/vertical bar charts
- **HistogramChart**: Distribution visualizations
- **TreemapChart**: Hierarchical data visualization
- **MetricCard**: KPI stat cards with trends
- **StatusIndicator**: Health badges and status indicators

### Dashboard Panels

Located in `src/components/dashboard/panels/`:

- **ExecutionManagersPanel**: Active execution manager monitoring
- **LogStreamingPanel**: Real-time log viewer
- **StreamsManagementPanel**: Workforce stream management

### Specialized Visualizations

Located in `src/components/dashboard/visualizations/`:

- **AgentstudioViz**: Agent registry and templates
- **DDQDSchedulingViz**: Test scheduling and history
- **DDQDTestingViz**: Test results and metrics
- **GovernanceViz**: Compliance and governance
- **MoEAdvancedAnalyticsViz**: MoE routing analytics
- **MoEIntelligenceViz**: Routing intelligence
- **MoELearningViz**: Learning state visualization
- **OptimizerDashboardViz**: System optimization metrics
- **UserManagementViz**: User administration
- **WorkerPoolViz**: Worker pool status

## Hooks

Custom React hooks in `src/hooks/`:

- **useDashboardData**: Generic data fetching with auto-refresh
- **useMetrics / useMetricsHistory**: Metrics data
- **useWorkers**: Worker status
- **useTimeRange**: Time range management
- **useFilters**: Dashboard filter state
- **useTheme**: Dark/light mode
- **useResponsive**: Responsive breakpoints
- **useRealtimeUpdates**: WebSocket/polling updates

## API Integration

The dashboard connects to the commit-relay API through the service layer in `src/services/dashboardApi.ts`.

### Available Endpoints

- Metrics: `/api/metrics`, `/api/metrics/history`
- Workers: `/api/workers`
- Tasks: `/api/tasks`
- Events: `/api/events`
- MoE: `/api/moe-intelligence`, `/api/moe-learning`
- Health: `/api/health`, `/api/health-alerts`, `/api/daemons/all`
- Governance: `/api/governance/dashboard`
- And many more...

## Features

### Time Controls

- EuiSuperDatePicker with common presets (15m, 1h, 24h, 7d, 30d)
- Auto-refresh with configurable intervals
- Time range persisted in URL

### Filtering

- Full-text search across components
- Status-based filtering
- Master/worker filtering
- Filters synced across visualizations

### Export & Sharing

- Export to CSV and JSON
- Share link generation with filters
- Copy to clipboard functionality

### Theming

- Light and dark mode support
- Automatic system preference detection
- EUI color palette for consistency

### Accessibility

- WCAG AA compliant
- Keyboard navigation
- Screen reader support
- Focus indicators

## Type Definitions

All types are defined in `src/types/`:

- `dashboard.types.ts`: Core dashboard types
- `index.ts`: Comprehensive type index with all exports

Key types include:

```typescript
// Worker and agent types
WorkerStatus, MasterStatus, AgentRegistryEntry

// Task types
Task, TaskMetrics

// MoE types
MoEDecision, MoERoutingIntelligence, MoELearningState

// System types
SystemHealth, DaemonStatus, HealthAlert

// Dashboard types
DashboardMetrics, DashboardEvent, DashboardFilters
```

## Styling

### Theme Configuration

Theme settings are in `src/styles/theme.ts`:

- Status colors (success, warning, danger)
- Chart colors (EUI visualization palette)
- Responsive breakpoints
- Dashboard spacing constants
- Time range presets
- Refresh intervals

### Best Practices

- Uses EUI components consistently
- Follows Elastic color palette
- Borders instead of shadows on panels
- Consistent spacing (gutterSize, paddingSize)
- Self-explanatory panel titles

## Performance

- Production build with code splitting
- Lazy loading for heavy components
- Virtualization for long lists
- Optimized chart rendering
- Efficient re-renders with React hooks

## Development Guidelines

### Adding a New Visualization

1. Create component in `src/components/visualizations/`
2. Follow the existing pattern (Panel wrapper, loading/error states)
3. Use EUI charts or Recharts
4. Export from `src/components/visualizations/index.ts`

### Adding API Endpoints

1. Add function to `src/services/dashboardApi.ts`
2. Create custom hook in `src/hooks/` if needed
3. Export from `src/hooks/index.ts`

### Type Safety

- All components use TypeScript
- Props interfaces for all components
- API responses are typed
- Strict mode enabled

## Troubleshooting

### Build Errors

If you encounter TypeScript errors:

```bash
npm run lint  # Check for type errors
```

### Missing Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

### API Connection Issues

Ensure the commit-relay API server is running on the expected port. Check `src/services/dashboardApi.ts` for the `API_BASE` configuration.

## License

MIT

## Contributing

1. Follow the existing code style
2. Use EUI components consistently
3. Add TypeScript types for all new code
4. Test on multiple screen sizes
5. Ensure accessibility compliance

## Related Documentation

- [Elastic UI Documentation](https://elastic.github.io/eui/)
- [Elastic Charts Documentation](https://elastic.github.io/elastic-charts/)
- [Commit-Relay System Documentation](../docs/)
