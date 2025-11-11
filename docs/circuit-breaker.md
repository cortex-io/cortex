# Circuit Breaker Pattern Implementation

## Overview

The circuit breaker pattern provides resilience for rate-limited and failure-prone operations by implementing fail-fast behavior and automatic recovery. This implementation is specifically designed to handle:

- Rate limiting from APIs (GitHub, dashboard server)
- Worker spawn failures and resource exhaustion
- Transient network failures
- Cascading failures during system overload

## Architecture

### Three States

1. **CLOSED** (Normal Operation)
   - All requests pass through to the protected action
   - Failures are tracked within a time window
   - Transitions to OPEN when failure threshold is exceeded

2. **OPEN** (Fail-Fast)
   - Requests are rejected immediately without calling the action
   - Provides fast failure response to prevent cascading failures
   - After timeout period, transitions to HALF_OPEN for recovery testing

3. **HALF_OPEN** (Testing Recovery)
   - Limited requests are allowed through to test if the issue is resolved
   - Success leads to CLOSED state (full recovery)
   - Failure leads back to OPEN state (still broken)

### Configuration

Default thresholds (configurable per breaker):

```javascript
{
  failureThreshold: 5,      // Failures needed to trigger OPEN
  failureWindow: 60000,     // Time window for failures (60s)
  openTimeout: 30000,       // Time before testing recovery (30s)
  successThreshold: 3,      // Successes needed to close (from HALF_OPEN)
  name: 'circuit-breaker'   // Name for logging and metrics
}
```

## Usage

### Basic Usage

```javascript
const { CircuitBreaker } = require('./lib/circuit-breaker');

// Wrap any async function
const breaker = new CircuitBreaker(
  async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP error');
    return response.json();
  },
  {
    name: 'api-fetch',
    failureThreshold: 5,
    openTimeout: 30000
  }
);

// Use it
try {
  const data = await breaker.execute('https://api.example.com/data');
  console.log('Success:', data);
} catch (error) {
  if (error.code === 'CIRCUIT_OPEN') {
    console.log('Circuit is open, failing fast');
  } else {
    console.log('Request failed:', error.message);
  }
}
```

### Pre-configured Integrations

#### Dashboard API Protection

```javascript
const { getCircuitBreakerManager } = require('./lib/circuit-breaker-integrations');

const manager = getCircuitBreakerManager();

// Protected file read
const data = await manager.dashboardApi.readJSON('/path/to/file.json');

// Protected file write
await manager.dashboardApi.writeJSON('/path/to/file.json', { key: 'value' });

// Protected external API call
const response = await manager.dashboardApi.fetchApi('https://api.example.com');
```

#### GitHub API Protection

```javascript
const { getCircuitBreakerManager } = require('./lib/circuit-breaker-integrations');

const manager = getCircuitBreakerManager();

// Create PR with rate limit protection
const result = await manager.githubApi.createPR(
  'Feature: Add circuit breaker',
  'This PR adds circuit breaker pattern...',
  { base: 'main', draft: false }
);

// List PRs
const prs = await manager.githubApi.listPRs({ state: 'open', limit: 10 });
```

#### Worker Spawn Protection

```javascript
const { getCircuitBreakerManager } = require('./lib/circuit-breaker-integrations');

const manager = getCircuitBreakerManager();

// Spawn worker with token budget protection
const result = await manager.workerSpawn.spawn(
  'implementation-worker',
  'task-123',
  'development-master',
  {
    repo: 'ry-ops/commit-relay',
    budget: 10000,
    priority: 'high'
  }
);

console.log('Worker spawned:', result.workerId);
```

### Monitoring

#### Get Metrics

```javascript
const manager = getCircuitBreakerManager();

// All metrics
const metrics = manager.getAllMetrics();
console.log('Dashboard metrics:', metrics.dashboard);
console.log('GitHub metrics:', metrics.github);
console.log('Worker spawn metrics:', metrics.workerSpawn);

// Health status
const health = manager.getHealthStatus();
console.log('System healthy:', health.healthy);
console.log('Breaker states:', health.breakers);

// Individual breaker metrics
const githubMetrics = manager.githubApi.getMetrics();
console.log('State:', githubMetrics.state);
console.log('Success rate:', githubMetrics.totalSuccesses / githubMetrics.totalCalls);
console.log('Current failures:', githubMetrics.currentFailures);
```

#### Export Metrics

```javascript
const manager = getCircuitBreakerManager();

// Export to default location
await manager.exportMetrics();

// Export to custom location
await manager.exportMetrics('/path/to/metrics.json');
```

### Dashboard API Endpoints

The circuit breaker metrics are exposed via the dashboard API:

```bash
# Get all metrics
curl http://localhost:3000/api/circuit-breakers/metrics

# Get health status
curl http://localhost:3000/api/circuit-breakers/health

# Get specific breaker state
curl http://localhost:3000/api/circuit-breakers/github/state

# Export metrics
curl -X POST http://localhost:3000/api/circuit-breakers/export

# Reset a breaker (requires auth)
curl -X POST http://localhost:3000/api/circuit-breakers/github/reset \
  -H "X-API-Key: your-api-key"
```

## Integration Points

### 1. Dashboard Server

Protected operations:
- File reads (coordination data)
- File writes (state updates)
- External API calls

Location: `dashboard/server/index.js`

### 2. GitHub API

Protected operations:
- PR creation
- Issue creation
- PR listing
- Issue viewing

Location: `scripts/lib/git-automation.sh` (via Node.js integration)

### 3. Worker Spawning

Protected operations:
- Worker spawn script execution
- Token budget allocation
- Worker pool updates

Location: `scripts/spawn-worker.sh` (via Node.js integration)

## Logging

### Log Files

Circuit breaker events are logged to:
- `coordination/circuit-breakers/dashboard-file-read.jsonl`
- `coordination/circuit-breakers/dashboard-file-write.jsonl`
- `coordination/circuit-breakers/dashboard-external-api.jsonl`
- `coordination/circuit-breakers/github-api.jsonl`
- `coordination/circuit-breakers/worker-spawn.jsonl`

### Log Format

Each log entry is a JSON line with:

```json
{
  "timestamp": "2025-11-11T14:00:00.000Z",
  "breaker": "github-api",
  "type": "failure",
  "state": "CLOSED",
  "data": {
    "error": "GitHub API rate limit exceeded",
    "code": "GITHUB_RATE_LIMIT",
    "failureCount": 3,
    "threshold": 5
  },
  "metrics": {
    "totalCalls": 10,
    "totalSuccesses": 7,
    "totalFailures": 3,
    "totalRejected": 0,
    "currentFailures": 3
  }
}
```

### Event Types

- `success` - Successful execution in CLOSED state
- `failure` - Failed execution
- `success_in_half_open` - Successful test in HALF_OPEN state
- `state_transition` - State change (CLOSED->OPEN, etc.)
- `request_rejected` - Request rejected in OPEN state

## Testing

### Run Tests

```bash
# Run circuit breaker tests
npm test test/circuit-breaker.test.js

# Run with coverage
npm test -- --coverage test/circuit-breaker.test.js
```

### Manual Testing

```javascript
// Test failure scenario
const { CircuitBreaker } = require('./lib/circuit-breaker');

let callCount = 0;
const flakeyAction = async () => {
  callCount++;
  if (callCount <= 5) {
    throw new Error('Simulated failure');
  }
  return { success: true };
};

const breaker = new CircuitBreaker(flakeyAction, {
  name: 'test-breaker',
  failureThreshold: 5,
  openTimeout: 2000,
  successThreshold: 2
});

// Should fail 5 times and open
for (let i = 0; i < 5; i++) {
  try {
    await breaker.execute();
  } catch (error) {
    console.log(`Failure ${i + 1}:`, error.message);
  }
}

console.log('State after failures:', breaker.getState()); // OPEN

// Should reject immediately
try {
  await breaker.execute();
} catch (error) {
  console.log('Rejected:', error.code); // CIRCUIT_OPEN
}

// Wait for timeout
await new Promise(resolve => setTimeout(resolve, 2100));

// Should transition to HALF_OPEN and succeed
for (let i = 0; i < 2; i++) {
  const result = await breaker.execute();
  console.log('Success:', result);
}

console.log('State after recovery:', breaker.getState()); // CLOSED
```

## Benefits

1. **Prevents Cascading Failures**
   - Fails fast when downstream systems are unhealthy
   - Prevents resource exhaustion from retry storms
   - Isolates failures to prevent system-wide outages

2. **Graceful Degradation**
   - System continues operating with reduced functionality
   - Critical paths can still function during partial failures
   - User experience maintained during transient issues

3. **Automatic Recovery**
   - Tests recovery automatically after timeout
   - Returns to normal operation when possible
   - No manual intervention required

4. **Rate Limit Resilience**
   - Backs off automatically when rate limited
   - Prevents wasted API calls during rate limit windows
   - Maximizes API quota efficiency

5. **Observability**
   - Detailed metrics for all protected operations
   - Event logs for debugging and analysis
   - Health status endpoints for monitoring

## Performance Impact

- **CLOSED state**: Minimal overhead (~1ms per call)
- **OPEN state**: Near-instant rejection (<1ms per call)
- **HALF_OPEN state**: Same as CLOSED state

Memory overhead: ~1KB per breaker instance

## Best Practices

1. **Configure Thresholds Appropriately**
   - Lower thresholds for critical operations
   - Higher thresholds for less critical operations
   - Consider API rate limits when setting thresholds

2. **Monitor Metrics**
   - Check health status regularly
   - Alert on OPEN state for critical breakers
   - Track success rates over time

3. **Log Events**
   - Enable logging in production
   - Review logs for patterns
   - Use logs for capacity planning

4. **Test Recovery**
   - Test failure scenarios in development
   - Verify recovery behavior
   - Ensure metrics are accurate

5. **Combine with Retries**
   - Use circuit breaker for fail-fast
   - Implement retries at application level
   - Exponential backoff for rate limits

## Troubleshooting

### Circuit Stuck Open

**Symptoms**: Breaker remains OPEN for extended periods

**Solutions**:
1. Check underlying service health
2. Review failure logs to identify root cause
3. Increase `openTimeout` if recovery needs more time
4. Force close with API: `POST /api/circuit-breakers/:name/reset`

### Too Many State Transitions

**Symptoms**: Frequent OPEN/CLOSED cycling

**Solutions**:
1. Increase `failureThreshold` to reduce sensitivity
2. Increase `successThreshold` to require more confidence
3. Check for intermittent network issues
4. Review service health metrics

### Requests Still Failing After Recovery

**Symptoms**: Breaker closes but failures continue

**Solutions**:
1. This is expected behavior - circuit breaker detects problems, doesn't fix them
2. Check root cause of failures
3. Implement retry logic at application level
4. Consider increasing timeouts or improving error handling

## Future Enhancements

- [ ] Add exponential backoff for openTimeout
- [ ] Implement half-open request sampling (not all requests)
- [ ] Add custom fallback functions
- [ ] Integrate with alerting system
- [ ] Add circuit breaker UI dashboard component
- [ ] Implement circuit breaker clustering for distributed systems
- [ ] Add Prometheus metrics export
- [ ] Implement bulkhead pattern for resource isolation

## References

- [Martin Fowler - Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Release It! - Michael Nygard](https://pragprog.com/titles/mnee2/release-it-second-edition/)
- [Resilience4j Documentation](https://resilience4j.readme.io/docs/circuitbreaker)
