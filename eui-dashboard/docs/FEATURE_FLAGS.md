# Feature Flags Documentation

This document describes the configurable features and runtime options available in the EUI Dashboard.

## Environment Variables

### Core Configuration

| Variable | Description | Default | Values |
|----------|-------------|---------|--------|
| `VITE_API_BASE_URL` | Base URL for the API server | `http://localhost:3001` | URL string |
| `VITE_WS_URL` | WebSocket URL for real-time updates | `ws://localhost:3001` | WebSocket URL |
| `VITE_ENVIRONMENT` | Deployment environment | `development` | `development`, `staging`, `production` |

### Feature Toggles

| Variable | Description | Default | Values |
|----------|-------------|---------|--------|
| `VITE_ENABLE_REALTIME` | Enable WebSocket real-time updates | `true` | `true`, `false` |
| `VITE_ENABLE_ANALYTICS` | Enable analytics tracking | `false` | `true`, `false` |
| `VITE_ENABLE_ERROR_TRACKING` | Enable Sentry error tracking | `false` | `true`, `false` |
| `VITE_ENABLE_DARK_MODE` | Allow dark mode toggle | `true` | `true`, `false` |

### Performance Options

| Variable | Description | Default | Values |
|----------|-------------|---------|--------|
| `VITE_DEFAULT_REFRESH_INTERVAL` | Default auto-refresh interval (ms) | `30000` | Number |
| `VITE_MAX_TABLE_ROWS` | Maximum rows per table page | `50` | Number |
| `VITE_CHART_ANIMATION_DURATION` | Chart animation duration (ms) | `300` | Number |

## Runtime Configuration

### Time Range Presets

Configure available time range options in `src/styles/theme.ts`:

```typescript
export const timeRangePresets = [
  { start: 'now-15m', end: 'now', label: 'Last 15 minutes' },
  { start: 'now-1h', end: 'now', label: 'Last 1 hour' },
  { start: 'now-24h', end: 'now', label: 'Last 24 hours' },
  { start: 'now-7d', end: 'now', label: 'Last 7 days' },
  { start: 'now-30d', end: 'now', label: 'Last 30 days' },
]
```

### Refresh Intervals

Configure auto-refresh options in `src/styles/theme.ts`:

```typescript
export const refreshIntervals = [
  { value: 0, label: 'Off' },
  { value: 5000, label: '5 seconds' },
  { value: 10000, label: '10 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
  { value: 300000, label: '5 minutes' },
]
```

### Chart Colors

Customize the chart color palette in `src/styles/theme.ts`:

```typescript
export const chartColors = [
  '#54B399', // vis0 - green
  '#6092C0', // vis1 - blue
  '#D36086', // vis2 - pink
  '#9170B8', // vis3 - purple
  '#CA8EAE', // vis4 - light pink
  '#D6BF57', // vis5 - yellow
  '#B9A888', // vis6 - tan
  '#DA8B45', // vis7 - orange
  '#AA6556', // vis8 - brown
  '#E7664C', // vis9 - coral
]
```

## Usage Examples

### Setting Environment Variables

Create a `.env.local` file in the project root:

```bash
# API Configuration
VITE_API_BASE_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com

# Feature Flags
VITE_ENABLE_REALTIME=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_TRACKING=true

# Performance
VITE_DEFAULT_REFRESH_INTERVAL=60000
```

### Accessing Feature Flags in Code

```typescript
// Access environment variables
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const enableAnalytics = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'

// Conditional feature rendering
if (enableAnalytics) {
  initializeAnalytics()
}
```

### Dynamic Feature Toggles

For features that need runtime toggling, use React context or state:

```typescript
// In a context provider
const [features, setFeatures] = useState({
  darkMode: true,
  realtime: true,
  animations: true,
})

// Toggle a feature
const toggleFeature = (feature: string) => {
  setFeatures(prev => ({
    ...prev,
    [feature]: !prev[feature]
  }))
}
```

## Feature Flag Best Practices

1. **Default to Safe Values**: Always provide sensible defaults
2. **Validate Early**: Check feature flags on app initialization
3. **Document Changes**: Update this file when adding new flags
4. **Clean Up**: Remove deprecated flags after migration periods
5. **Test Both States**: Ensure features work when enabled and disabled

## Deployment Considerations

- **Development**: Use `.env.local` for local overrides
- **Staging**: Configure in CI/CD pipeline or staging server
- **Production**: Set via hosting platform environment variables

## Future Feature Flags (Planned)

| Variable | Description | Status |
|----------|-------------|--------|
| `VITE_ENABLE_EXPORT_PDF` | Enable PDF export functionality | Planned |
| `VITE_ENABLE_COLLABORATION` | Enable multi-user collaboration | Planned |
| `VITE_ENABLE_NOTIFICATIONS` | Enable browser notifications | Planned |
