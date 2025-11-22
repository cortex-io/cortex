# Analytics Integration Documentation

This document describes the analytics integration points and tracking setup for the EUI Dashboard.

## Overview

Analytics tracking helps understand user behavior, measure feature adoption, and identify areas for improvement. This documentation outlines the integration points ready for connection to analytics services.

## Supported Analytics Providers

The dashboard is prepared for integration with:

- **Google Analytics 4** - Page views, events
- **Mixpanel** - User behavior, funnels
- **Amplitude** - Product analytics
- **PostHog** - Open-source alternative
- **Custom solutions** - Internal analytics APIs

## Integration Points

### Page Views

Track when users navigate between dashboard sections:

```typescript
// src/hooks/useAnalytics.ts
export const useAnalytics = () => {
  const trackPageView = (pageName: string, properties?: Record<string, any>) => {
    // Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'page_view', {
        page_title: pageName,
        ...properties,
      })
    }

    // Mixpanel
    if (typeof mixpanel !== 'undefined') {
      mixpanel.track('Page View', {
        page: pageName,
        ...properties,
      })
    }

    // Custom
    console.log('[Analytics] Page View:', pageName, properties)
  }

  return { trackPageView }
}
```

### Feature Usage

Track interaction with dashboard features:

| Event Name | Description | Properties |
|------------|-------------|------------|
| `filter_applied` | User applies a filter | `filterType`, `filterValue` |
| `time_range_changed` | User changes time range | `start`, `end`, `preset` |
| `export_data` | User exports data | `format`, `rowCount` |
| `theme_toggled` | User toggles dark mode | `theme` |
| `refresh_triggered` | User triggers manual refresh | `autoRefresh` |
| `drill_down` | User drills into details | `source`, `target` |

```typescript
const trackFeatureUsage = (eventName: string, properties?: Record<string, any>) => {
  // Example implementation
  if (analyticsEnabled) {
    analytics.track(eventName, {
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      ...properties,
    })
  }
}
```

### User Interactions

Track specific UI interactions:

```typescript
// Chart interactions
trackEvent('chart_clicked', {
  chartType: 'timeseries',
  dataPoint: value,
})

// Table interactions
trackEvent('table_sorted', {
  column: 'status',
  direction: 'desc',
})

// Search interactions
trackEvent('search_performed', {
  query: searchText,
  resultCount: results.length,
})
```

### Performance Metrics

Track loading and rendering performance:

```typescript
// Core Web Vitals
const trackPerformance = () => {
  // First Contentful Paint
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]

  // Time to Interactive
  const tti = performance.now()

  trackEvent('performance_metrics', {
    fcp: fcp?.startTime,
    tti: tti,
    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
  })
}

// Component render timing
const trackRenderTime = (componentName: string, duration: number) => {
  trackEvent('component_rendered', {
    component: componentName,
    duration: duration,
    threshold: duration > 500 ? 'slow' : 'normal',
  })
}
```

## Implementation Guide

### Setup

1. **Install SDK:**

```bash
# Google Analytics
npm install gtag.js

# Mixpanel
npm install mixpanel-browser

# Amplitude
npm install @amplitude/analytics-browser
```

2. **Initialize in main.tsx:**

```typescript
import mixpanel from 'mixpanel-browser'

// Initialize analytics
if (import.meta.env.VITE_ENABLE_ANALYTICS === 'true') {
  mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN, {
    debug: import.meta.env.DEV,
  })
}
```

3. **Create Analytics Context:**

```typescript
// src/contexts/AnalyticsContext.tsx
const AnalyticsContext = createContext<AnalyticsContextType | null>(null)

export const AnalyticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const track = useCallback((event: string, properties?: Record<string, any>) => {
    if (!analyticsEnabled) return

    mixpanel.track(event, {
      ...properties,
      environment: import.meta.env.VITE_ENVIRONMENT,
    })
  }, [])

  return (
    <AnalyticsContext.Provider value={{ track }}>
      {children}
    </AnalyticsContext.Provider>
  )
}
```

### Usage in Components

```typescript
function DashboardHeader() {
  const { track } = useAnalytics()

  const handleExport = (format: string) => {
    track('export_data', { format, timestamp: new Date().toISOString() })
    // ... export logic
  }

  return (
    <EuiButton onClick={() => handleExport('csv')}>
      Export CSV
    </EuiButton>
  )
}
```

## Event Schema

### Standard Properties

All events should include:

```typescript
interface BaseEventProperties {
  timestamp: string       // ISO 8601 timestamp
  sessionId: string       // Unique session identifier
  userId?: string         // User identifier (if authenticated)
  environment: string     // development | staging | production
  appVersion: string      // Dashboard version
}
```

### Event Naming Convention

- Use `snake_case` for event names
- Use `camelCase` for property names
- Prefix related events (e.g., `filter_`, `chart_`, `table_`)

## Privacy Considerations

### Data Collection Guidelines

1. **Minimize PII**: Never collect personally identifiable information
2. **Anonymize**: Use hashed or anonymized identifiers
3. **Consent**: Respect user consent preferences
4. **Retention**: Set appropriate data retention policies

### Consent Management

```typescript
const canTrack = () => {
  // Check user consent
  const consent = localStorage.getItem('analytics_consent')
  return consent === 'accepted'
}

const trackWithConsent = (event: string, properties: object) => {
  if (canTrack()) {
    analytics.track(event, properties)
  }
}
```

## Testing Analytics

### Development Mode

```typescript
// Log events to console in development
if (import.meta.env.DEV) {
  window.analyticsDebug = true

  const originalTrack = analytics.track
  analytics.track = (event, props) => {
    console.log('[Analytics Debug]', event, props)
    return originalTrack(event, props)
  }
}
```

### Verification Checklist

- [ ] Events fire on expected interactions
- [ ] Properties contain correct values
- [ ] No PII in tracked data
- [ ] Performance metrics are accurate
- [ ] Consent is respected

## Dashboard Metrics

Key metrics to track for the commit-relay dashboard:

| Metric | Description | Target |
|--------|-------------|--------|
| Daily Active Users | Unique users per day | Growth |
| Session Duration | Time spent in dashboard | > 5 min |
| Feature Adoption | % using each feature | > 50% |
| Load Time | Page load performance | < 2s |
| Error Rate | Errors per session | < 1% |

## Resources

- [Google Analytics 4 Documentation](https://developers.google.com/analytics)
- [Mixpanel JavaScript SDK](https://developer.mixpanel.com/docs/javascript)
- [Amplitude Analytics](https://www.docs.developers.amplitude.com/)
- [PostHog Docs](https://posthog.com/docs)
