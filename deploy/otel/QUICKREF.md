# OpenTelemetry Quick Reference for Cortex Developers

Quick reference for adding tracing to Cortex agents.

## Environment Setup

```bash
# Required environment variables
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-agent.cortex-observability.svc.cluster.local:4318"
export OTEL_SERVICE_NAME="cortex-${CORTEX_AGENT_TYPE}"
export CORTEX_AGENT_TYPE="development-master"
export CORTEX_TASK_ID="task-123"
```

## Node.js Quick Start

```javascript
// 1. Install dependencies
// npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node

// 2. Initialize (at app startup)
require('./tracing');  // See cortex-instrumentation.yaml for config

// 3. Create spans
const { trace } = require('@opentelemetry/api');

const tracer = trace.getTracer('cortex-master');
tracer.startActiveSpan('cortex.master.handle_task', (span) => {
  span.setAttribute('cortex.task.id', taskId);
  // ... do work
  span.end();
});
```

## Python Quick Start

```python
# 1. Install dependencies
# pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp

# 2. Initialize (at app startup)
from tracing import initialize_tracing
initialize_tracing()

# 3. Create spans
from opentelemetry import trace

tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("cortex.worker.execute") as span:
    span.set_attribute("cortex.task.id", task_id)
    # ... do work
```

## Standard Span Names

```
cortex.master.{operation}         # Master operations
cortex.worker.{operation}         # Worker operations
cortex.coordinator.{operation}    # Coordinator operations
cortex.knowledge.{operation}      # Knowledge base ops
cortex.git.{operation}            # Git operations
cortex.api.{service}.{operation}  # External API calls
```

## Required Attributes

Every span should have:

```javascript
span.setAttribute('cortex.agent.type', process.env.CORTEX_AGENT_TYPE);
span.setAttribute('cortex.task.id', taskId);
```

## Common Attributes

```javascript
// Master attributes
'cortex.master.type': 'development'
'cortex.master.session_id': 'session-123'

// Worker attributes
'cortex.worker.id': 'worker-456'
'cortex.worker.type': 'feature-implementer'

// Task attributes
'cortex.task.status': 'completed'  // pending, in_progress, completed, failed
'cortex.task.tokens_used': 15000
'cortex.task.priority': 1          // 1-5
```

## Error Handling

```javascript
try {
  await doWork();
} catch (error) {
  span.recordException(error);
  span.setAttribute('cortex.task.status', 'failed');
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
}
```

## Adding Events

```javascript
span.addEvent('worker_spawned', {
  'cortex.worker.id': workerId
});
```

## Kubernetes Annotations

```yaml
annotations:
  instrumentation.opentelemetry.io/inject-nodejs: "true"
  cortex.task.id: "task-123"
```

## Testing

```bash
# Test OTLP endpoint
curl -X POST http://otel-collector.cortex-observability.svc.cluster.local:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @test-span.json

# View traces in Grafana
kubectl port-forward -n cortex-system svc/grafana 3000:3000
# Open http://localhost:3000/explore (select Tempo)
```

## Debugging

```bash
# Enable debug logging
export OTEL_LOG_LEVEL=debug

# View collector logs
kubectl logs -n cortex-observability -l app.kubernetes.io/name=otel-collector -f

# Check metrics
kubectl port-forward -n cortex-observability svc/otel-collector 8888:8888
curl http://localhost:8888/metrics
```

## Common Patterns

### Master Handling Task

```javascript
async handleTask(task) {
  return tracer.startActiveSpan('cortex.master.handle_task', async (span) => {
    span.setAttribute('cortex.task.id', task.id);
    span.setAttribute('cortex.master.type', this.masterType);

    const patterns = await this.retrievePatterns(task);
    span.addEvent('patterns_retrieved', { count: patterns.length });

    const worker = await this.spawnWorker(task, patterns);
    span.setAttribute('cortex.worker.id', worker.id);

    const result = await this.monitorWorker(worker);
    span.setAttribute('cortex.task.status', result.status);
    span.end();

    return result;
  });
}
```

### Worker Executing Task

```python
def execute_task(self, task_spec):
    with tracer.start_as_current_span("cortex.worker.execute_task") as span:
        span.set_attribute("cortex.worker.id", self.worker_id)
        span.set_attribute("cortex.task.id", task_spec['task_id'])

        result = self.implement_feature(task_spec)

        span.add_event("implementation_complete")

        test_result = self.run_tests()
        span.set_attribute("tests_passed", test_result.passed)

        span.set_attribute("cortex.task.status", "completed")
        return result
```

### External API Call

```javascript
async callAnthropicAPI(prompt) {
  return tracer.startActiveSpan('cortex.api.anthropic.messages', async (span) => {
    span.setAttribute('llm.provider', 'anthropic');
    span.setAttribute('llm.model', 'claude-opus-4.5');
    span.setAttribute('llm.prompt_tokens', prompt.length);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify(prompt)
    });

    span.setAttribute('http.status_code', response.status);
    span.setAttribute('llm.completion_tokens', response.data.usage.completion_tokens);
    span.end();

    return response;
  });
}
```

## Best Practices

1. Always set `cortex.agent.type` and `cortex.task.id`
2. Use hierarchical span names: `cortex.component.operation`
3. Record exceptions with `span.recordException(error)`
4. Add meaningful events: `span.addEvent('checkpoint', attributes)`
5. Set appropriate status: `SpanStatusCode.OK` or `SpanStatusCode.ERROR`
6. Don't include sensitive data in attributes
7. Keep attribute values concise (avoid large JSON)
8. End spans in `finally` blocks

## Sampling Rates

- Development: 100% (1.0)
- Staging: 50% (0.5)
- Production: 10% (0.1)
- Errors: Always 100%
- Slow operations (>1s): Always 100%

## Resources

- Full Guide: [tracing-config.md](./tracing-config.md)
- Deployment: [README.md](./README.md)
- Test Span: [test-span.json](./test-span.json)

---

For help: #cortex-observability on Slack
