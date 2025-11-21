# Commit-Relay EUI Dashboard Implementation Prompt

## Context
I'm implementing an Elastic UI Framework (EUI) based dashboard for my commit-relay project - an AI agent orchestration system featuring autonomous agents, Mixture of Experts (MoE) decision routing, and GitHub/Slack integrations. I want to create a professional, Kibana-inspired dashboard to visualize agent activities, task flows, decision patterns, and system health metrics. For best practices, the new dashboard should be created as new dashboard and assigned a  different port number. The existing dashboard will be used for testing during the transition and will be retired at a later time.

## Project Discovery Phase
First, explore the commit-relay project structure at `/Users/ryandahlberg/Projects/commit-relay`:

1. **Analyze existing architecture:**
   - Identify current tech stack (React/Vue/vanilla JS, backend framework, database)
   - Locate API endpoints and data models
   - Find existing UI components and styling approach
   - Identify agent orchestration logic and data structures
   - Map out MoE routing implementation
   - Document GitHub/Slack integration points

2. **Document key data structures:**
   - Agent task schemas
   - Decision routing patterns
   - Event/log formats
   - Integration webhook payloads
   - Metrics and telemetry data

## Implementation Objectives

### Phase 1: EUI Framework Integration
Install and configure the Elastic UI Framework in the commit-relay project:

**Resources:**
- EUI GitHub: https://github.com/elastic/eui
- EUI Documentation: https://eui.elastic.co/
- EUI Figma (reference): https://www.figma.com/community/file/964536385682658129/elastic-ui

**Tasks:**
1. Install EUI dependencies:
   ```bash
   npm install @elastic/eui @elastic/datemath @emotion/react @emotion/cache
   ```

2. Configure EUI theme provider in the application root

3. Set up proper TypeScript types if project uses TypeScript

4. Implement responsive layout structure using EUI components:
   - `EuiPage`, `EuiPageBody`, `EuiPageContent` for main layout
   - `EuiHeader` for top navigation
   - `EuiSideNav` for dashboard navigation (if needed)

### Phase 2: Dashboard Foundation
Create the core dashboard infrastructure inspired by Kibana's patterns:

**Core Components to Build:**

1. **Dashboard Container** (`/dashboard` or similar route)
   - Time range picker (`EuiSuperDatePicker`)
   - Global search/filter bar (`EuiSearchBar`)
   - Refresh interval controls
   - Dashboard layout grid system

2. **Panel System**
   - Resizable/draggable panel containers
   - Panel header with controls (refresh, expand, export)
   - Panel state management (loading, error, empty states)

3. **Visualization Types** (start with these core types):
   - **Metrics Panel**: Display key numbers (active agents, tasks completed, success rate)
   - **Time Series Charts**: Agent activity over time using EUI's integration with visualization libraries
   - **Task Status Table**: Searchable/sortable table of agent tasks
   - **Decision Flow Diagram**: Visual representation of MoE routing decisions
   - **Integration Health**: Status cards for GitHub/Slack connections

### Phase 3: Agent-Specific Visualizations
Build visualizations tailored to agent orchestration:

**Key Visualizations:**

1. **Agent Activity Dashboard:**
   - Real-time agent status cards (idle, working, completed, failed)
   - Agent performance metrics (avg completion time, success rate)
   - Agent utilization heat map

2. **MoE Routing Visualizer:**
   - Decision tree/flow diagram showing routing patterns
   - Expert selection frequency chart
   - Routing confidence scores over time
   - Decision rationale logs with search/filter

3. **Task Pipeline View:**
   - Kanban-style board (pending, in-progress, completed, failed)
   - Task duration histogram
   - Task dependency graph (if applicable)
   - Priority queue visualization

4. **Integration Monitoring:**
   - GitHub webhook activity timeline
   - Slack message delivery status
   - Integration error logs with severity indicators
   - API rate limit gauges

5. **System Health Overview:**
   - Error rate trends
   - Response time percentiles
   - Resource utilization (if collecting system metrics)
   - Alert/notification panel

### Phase 4: Data Layer Integration
Connect dashboard to commit-relay's data sources:

1. **Real-time Data:**
   - Implement WebSocket connections for live updates (if not already present)
   - Set up event stream processing for agent activities
   - Create efficient polling mechanisms for non-critical data

2. **Historical Data:**
   - Design time-series data storage (consider TimescaleDB, InfluxDB, or PostgreSQL with proper indexing)
   - Implement aggregation queries for dashboard performance
   - Create data retention/cleanup policies

3. **API Layer:**
   - Build RESTful endpoints for dashboard data:
     - `GET /api/dashboard/metrics` - Key metrics summary
     - `GET /api/dashboard/agents` - Agent status and performance
     - `GET /api/dashboard/tasks` - Task list with filters/pagination
     - `GET /api/dashboard/decisions` - MoE routing decisions
     - `GET /api/dashboard/integrations` - Integration health
     - `GET /api/dashboard/events` - Event stream with time range
   - Implement efficient filtering, pagination, and aggregation
   - Add response caching where appropriate

### Phase 5: Advanced Features
Implement Kibana-inspired advanced capabilities:

1. **Filtering System:**
   - Global filter bar that applies across all panels
   - Click-to-filter on visualization elements (e.g., click agent name to filter by that agent)
   - Filter pills with AND/OR logic
   - Saved filter sets

2. **Dashboard Management:**
   - Save/load custom dashboard layouts (JSON format)
   - Export dashboard configurations
   - Share dashboard via URL with embedded filters
   - Dashboard templates for common use cases

3. **Alerting (Basic):**
   - Define threshold-based alerts (e.g., error rate > 5%)
   - Visual indicators when alerts trigger
   - Alert history log

4. **Export Capabilities:**
   - Export visualizations as PNG/SVG
   - Export data tables as CSV
   - Generate PDF reports (if needed)

## Technical Requirements

### Component Structure
```
src/
├── components/
│   ├── dashboard/
│   │   ├── DashboardContainer.tsx
│   │   ├── DashboardGrid.tsx
│   │   ├── DashboardHeader.tsx
│   │   ├── panels/
│   │   │   ├── MetricsPanel.tsx
│   │   │   ├── TimeSeriesPanel.tsx
│   │   │   ├── TaskTablePanel.tsx
│   │   │   ├── DecisionFlowPanel.tsx
│   │   │   └── IntegrationHealthPanel.tsx
│   │   └── visualizations/
│   │       ├── AgentStatusCards.tsx
│   │       ├── MoERoutingViz.tsx
│   │       ├── TaskKanban.tsx
│   │       └── IntegrationTimeline.tsx
├── hooks/
│   ├── useDashboardData.ts
│   ├── useRealtimeUpdates.ts
│   └── useDashboardFilters.ts
├── services/
│   ├── dashboardApi.ts
│   └── websocketService.ts
└── types/
    └── dashboard.types.ts
```

### Best Practices to Follow:

1. **Performance:**
   - Virtualize long lists using `react-window` or similar
   - Implement proper memoization with `useMemo`/`useCallback`
   - Use EUI's `EuiLoadingSpinner` for async operations
   - Debounce search/filter inputs
   - Lazy load heavy visualizations

2. **Accessibility:**
   - Use EUI components which have built-in accessibility
   - Add proper ARIA labels to custom visualizations
   - Ensure keyboard navigation works throughout
   - Test with screen readers if possible

3. **Responsive Design:**
   - Use EUI's responsive utilities (`EuiHideFor`, `EuiShowFor`)
   - Implement mobile-friendly layouts
   - Test on various screen sizes

4. **Error Handling:**
   - Implement proper error boundaries
   - Show user-friendly error messages using `EuiCallOut`
   - Include retry mechanisms for failed data fetches
   - Log errors for debugging

5. **Code Quality:**
   - Write TypeScript types for all data structures
   - Add JSDoc comments for complex functions
   - Follow existing code style in the project
   - Write unit tests for utility functions
   - Add integration tests for key workflows

## Visualization Library Integration

For charts and advanced visualizations, integrate one of these libraries with EUI:

**Option 1: Recharts** (Recommended for simplicity)
```bash
npm install recharts
```
- Good React integration
- Declarative API
- Responsive by default
- Works well with EUI styling

**Option 2: Apache ECharts** (Recommended for complexity/power)
```bash
npm install echarts echarts-for-react
```
- Extremely powerful
- Used by Kibana (via Elastic Charts which is based on ECharts concepts)
- Great for complex visualizations like decision trees

**Option 3: Plotly.js** (Recommended for interactivity)
```bash
npm install plotly.js react-plotly.js
```
- Highly interactive
- 3D visualization support
- Good for scientific/technical visualizations

## Data Model Considerations

Design data structures optimized for dashboard queries:

```typescript
// Example types for dashboard data
interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'completed' | 'failed';
  currentTask?: string;
  performance: {
    tasksCompleted: number;
    averageTime: number;
    successRate: number;
  };
  lastActivity: Date;
}

interface MoEDecision {
  id: string;
  timestamp: Date;
  input: string;
  selectedExpert: string;
  confidence: number;
  alternatives: Array<{
    expert: string;
    score: number;
  }>;
  rationale: string;
  outcome: 'success' | 'failure' | 'pending';
}

interface TaskMetrics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  averageDuration: number;
  successRate: number;
}

interface IntegrationHealth {
  github: {
    status: 'healthy' | 'degraded' | 'down';
    lastWebhook: Date;
    errorRate: number;
    rateLimit: {
      remaining: number;
      total: number;
      resetAt: Date;
    };
  };
  slack: {
    status: 'healthy' | 'degraded' | 'down';
    lastMessage: Date;
    errorRate: number;
  };
}
```

## Testing Strategy

1. **Unit Tests:**
   - Test data transformation functions
   - Test filter logic
   - Test utility functions

2. **Integration Tests:**
   - Test API endpoint responses
   - Test WebSocket connections
   - Test dashboard state management

3. **E2E Tests (Optional but recommended):**
   - Test complete user workflows
   - Test dashboard interactions
   - Test data updates and filtering

## Success Criteria

The implementation is complete when:

1. ✅ EUI is fully integrated and themed
2. ✅ Dashboard displays real commit-relay data
3. ✅ All core visualization types are implemented
4. ✅ Time range picker filters data across panels
5. ✅ Click-to-filter works on interactive elements
6. ✅ Real-time updates are working (if WebSocket implemented)
7. ✅ Dashboard is responsive and accessible
8. ✅ Data loads efficiently (< 2 second load times)
9. ✅ Error states are handled gracefully
10. ✅ Code is documented and follows project conventions

## Documentation Requirements

Create the following documentation:

1. **Architecture Document:**
   - Dashboard component hierarchy
   - Data flow diagram
   - API endpoints reference
   - WebSocket event types

2. **Developer Guide:**
   - How to add new visualizations
   - How to add new dashboard panels
   - How to extend filtering logic
   - How to modify data aggregations

3. **User Guide:**
   - Dashboard navigation
   - Using filters and time ranges
   - Understanding visualizations
   - Exporting data

## Deployment Considerations

1. **Build Optimization:**
   - Configure code splitting for dashboard route
   - Optimize bundle size (EUI can be large, ensure tree-shaking works)
   - Enable production builds with minification

2. **Environment Configuration:**
   - API endpoints configurable via environment variables
   - WebSocket URLs configurable
   - Feature flags for experimental visualizations

3. **Monitoring:**
   - Add analytics for dashboard usage
   - Track visualization load times
   - Monitor API performance

## Next Steps After Implementation

1. **User Feedback:**
   - Gather feedback from team/users
   - Identify most-used visualizations
   - Find performance bottlenecks

2. **Iteration:**
   - Add custom visualizations based on needs
   - Implement advanced filtering
   - Build dashboard templates
   - Add export/sharing features

3. **Advanced Features:**
   - Machine learning insights panel
   - Anomaly detection alerts
   - Predictive analytics for agent workload
   - Custom query builder

## Additional Resources

- **EUI Components Gallery**: Browse all available components at https://eui.elastic.co/
- **Kibana Dashboard Docs**: https://www.elastic.co/guide/en/kibana/current/dashboard.html
- **EUI GitHub Issues**: Search for examples and solutions at https://github.com/elastic/eui/issues
- **Elastic Charts**: https://elastic.github.io/elastic-charts/ (if you want Kibana's exact chart library)

## Notes for Implementation

- **Start small**: Begin with 2-3 core visualizations and expand from there
- **Iterate quickly**: Get basic dashboard working first, then enhance
- **Use existing patterns**: Look at how commit-relay currently handles data, don't reinvent
- **Performance matters**: Dashboard should feel snappy even with lots of data
- **Make it useful**: Focus on visualizations that provide actionable insights for your use case

---

**IMPORTANT**: Before starting implementation, please:
1. Show me the current commit-relay project structure
2. Identify the existing tech stack
3. Confirm the data models for agents, tasks, and decisions
4. Ask any clarifying questions about the architecture or requirements

Let's build an amazing dashboard that makes commit-relay's AI orchestration visible and understandable! 🚀
