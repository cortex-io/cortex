# Error Tracking Documentation

This document describes the error tracking setup and Sentry integration for the EUI Dashboard.

## Overview

Error tracking is essential for monitoring production issues and maintaining application reliability. This dashboard uses React Error Boundaries for graceful error handling and is prepared for Sentry integration.

## Error Boundary Component

The `ErrorBoundary` component catches JavaScript errors in the component tree and displays a fallback UI.

### Location

`/src/components/common/ErrorBoundary.tsx`

### Usage

```tsx
import { ErrorBoundary } from './components/common/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <DashboardContainer />
    </ErrorBoundary>
  )
}
```

### Features

- Catches render errors in child components
- Displays user-friendly error message
- Provides retry/reload functionality
- Logs errors for debugging
- Ready for Sentry integration

## Sentry Integration

### Setup

1. **Install Sentry packages:**

```bash
npm install @sentry/react @sentry/tracing
```

2. **Initialize Sentry in main.tsx:**

```typescript
import * as Sentry from '@sentry/react'
import { BrowserTracing } from '@sentry/tracing'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [new BrowserTracing()],
  tracesSampleRate: 0.2,
  environment: import.meta.env.VITE_ENVIRONMENT || 'development',
  release: import.meta.env.VITE_APP_VERSION,
  beforeSend(event) {
    // Filter out non-critical errors
    if (event.exception) {
      const message = event.exception.values?.[0]?.value || ''
      if (message.includes('ResizeObserver loop')) {
        return null // Ignore ResizeObserver errors
      }
    }
    return event
  },
})
```

3. **Wrap App with Sentry Error Boundary:**

```tsx
import * as Sentry from '@sentry/react'

function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <DashboardContainer />
    </Sentry.ErrorBoundary>
  )
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SENTRY_DSN` | Sentry Data Source Name | Yes |
| `VITE_ENVIRONMENT` | Environment name | No |
| `VITE_APP_VERSION` | Application version | No |

### Error Capturing

#### Automatic Capturing

Sentry automatically captures:
- Unhandled JavaScript exceptions
- Unhandled promise rejections
- Console errors

#### Manual Error Capturing

```typescript
import * as Sentry from '@sentry/react'

try {
  riskyOperation()
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'AgentTable',
      action: 'fetch',
    },
    extra: {
      agentId: '123',
      timestamp: new Date().toISOString(),
    },
  })
}
```

#### Custom Error Messages

```typescript
Sentry.captureMessage('Agent connection lost', {
  level: 'warning',
  tags: { agentId: 'abc123' },
})
```

### User Context

```typescript
Sentry.setUser({
  id: userId,
  email: userEmail,
  username: userName,
})
```

### Performance Monitoring

```typescript
const transaction = Sentry.startTransaction({
  name: 'Dashboard Load',
})

try {
  await loadDashboardData()
  transaction.setStatus('ok')
} catch (error) {
  transaction.setStatus('internal_error')
  throw error
} finally {
  transaction.finish()
}
```

## Error Handling Patterns

### API Error Handling

```typescript
async function fetchAgentData() {
  try {
    const response = await fetch('/api/agents')
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, response.status)
    }
    return await response.json()
  } catch (error) {
    // Log to Sentry with context
    Sentry.captureException(error, {
      tags: { endpoint: '/api/agents' },
    })

    // Return fallback or re-throw
    throw error
  }
}
```

### Component Error Handling

```tsx
function AgentPanel() {
  const [error, setError] = useState<Error | null>(null)

  if (error) {
    return (
      <Panel error={error.message} onRetry={() => setError(null)}>
        <EuiCallOut title="Error" color="danger">
          {error.message}
        </EuiCallOut>
      </Panel>
    )
  }

  return <Panel>...</Panel>
}
```

## Best Practices

1. **Categorize Errors**: Use tags to categorize errors by component, action, or severity
2. **Add Context**: Include relevant data in the `extra` field
3. **Filter Noise**: Configure `beforeSend` to filter out non-actionable errors
4. **Monitor Performance**: Use Sentry tracing for critical user flows
5. **Protect Sensitive Data**: Never send PII or credentials to Sentry
6. **Set Up Alerts**: Configure Sentry alerts for critical errors

## Error Types

| Type | Severity | Action |
|------|----------|--------|
| Network errors | Warning | Retry with backoff |
| Authentication errors | Error | Redirect to login |
| Data validation errors | Info | Show user message |
| Render errors | Critical | Show error boundary |
| Unhandled exceptions | Critical | Log and notify |

## Testing Error Handling

```typescript
// Trigger test error
function TestError() {
  throw new Error('Test error for Sentry')
}

// Use in development
if (import.meta.env.DEV) {
  window.testSentryError = () => {
    Sentry.captureException(new Error('Manual test error'))
  }
}
```

## Monitoring Dashboard

After setup, access your Sentry dashboard to:

- View error trends
- Set up issue alerts
- Monitor performance metrics
- Track release health
- Analyze user impact

## Resources

- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
