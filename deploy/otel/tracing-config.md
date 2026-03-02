# OpenTelemetry Tracing Configuration for Cortex Developers

This guide explains how to add distributed tracing to Cortex agents, workers, and services using OpenTelemetry.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Language-Specific Guides](#language-specific-guides)
5. [Span Naming Conventions](#span-naming-conventions)
6. [Attribute Standards](#attribute-standards)
7. [Error Handling](#error-handling)
8. [Performance Considerations](#performance-considerations)
9. [Testing and Debugging](#testing-and-debugging)
10. [Best Practices](#best-practices)

---

## Overview

Cortex uses OpenTelemetry for distributed tracing, metrics, and logs. The observability stack consists of:

- **OTel Agents** (DaemonSet): Collect host and container metrics, logs
- **OTel Collector** (Deployment): Process and export telemetry data
- **Prometheus**: Store and query metrics
- **Tempo/Jaeger**: Store and query traces
- **Loki**: Store and query logs
- **Grafana**: Visualize all telemetry data

### Benefits

- **End-to-end visibility**: Trace requests across masters, workers, and external services
- **Performance insights**: Identify bottlenecks and slow operations
- **Debugging**: Correlate logs, metrics, and traces
- **SLA monitoring**: Track latency, error rates, and throughput (RED metrics)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cortex Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Master     │  │   Worker     │  │   Service    │      │
│  │  (Node.js)   │  │  (Python)    │  │   (Bash)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │ OTLP              │ OTLP            │ OTLP        │
│         └───────────────────┴─────────────────┘             │
└─────────────────────────┬───────────────────────────────────┘
                          │ 4317/4318
                          ▼
              ┌─────────────────────┐
              │   OTel Agent        │ (DaemonSet)
              │  (per node)         │
              └──────────┬──────────┘
                         │ OTLP
                         ▼
              ┌─────────────────────┐
              │  OTel Collector     │ (Deployment)
              │  (central)          │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │Prometheus│   │  Tempo   │   │   Loki   │
   └────┬─────┘   └────┬─────┘   └────┬─────┘
        │              │              │
        └──────────────┴──────────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ Grafana  │
                 └──────────┘
```

---

## Quick Start

### Environment Variables

All Cortex agents should set these environment variables:

```bash
# Required
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-agent.cortex-observability.svc.cluster.local:4318"
export OTEL_SERVICE_NAME="cortex-${CORTEX_AGENT_TYPE}"

# Cortex-specific (set by deployment)
export CORTEX_AGENT_TYPE="development-master"    # or worker type
export CORTEX_MASTER_TYPE="development"           # for masters
export CORTEX_WORKER_ID="worker-123"             # for workers
export CORTEX_TASK_ID="task-456"                 # current task
export CORTEX_SESSION_ID="session-789"           # session ID

# Optional tuning
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"             # 10% sampling
```

### Kubernetes Pod Annotations

Add these annotations to enable auto-instrumentation:

```yaml
apiVersion: v1
kind: Pod
metadata:
  annotations:
    # Enable auto-instrumentation
    instrumentation.opentelemetry.io/inject-nodejs: "true"    # for Node.js
    instrumentation.opentelemetry.io/inject-python: "true"    # for Python

    # Cortex-specific attributes
    cortex.task.id: "task-123"
    cortex.session.id: "session-456"
```

---

## Language-Specific Guides

### Node.js

#### Installation

```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

#### Basic Setup

```javascript
// tracing.js - Initialize at application startup
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.CORTEX_AGENT_TYPE || 'cortex-agent',
  'cortex.agent.type': process.env.CORTEX_AGENT_TYPE,
  'cortex.master.type': process.env.CORTEX_MASTER_TYPE,
  'cortex.task.id': process.env.CORTEX_TASK_ID,
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

#### Manual Instrumentation

```javascript
const { trace } = require('@opentelemetry/api');

async function executeTask(taskId) {
  const tracer = trace.getTracer('cortex-master');

  return tracer.startActiveSpan('cortex.task.execute', async (span) => {
    try {
      // Add task-specific attributes
      span.setAttribute('cortex.task.id', taskId);
      span.setAttribute('cortex.task.type', 'feature-implementation');

      // Execute task logic
      const result = await performTask(taskId);

      // Record success metrics
      span.setAttribute('cortex.task.status', 'completed');
      span.setAttribute('cortex.task.tokens_used', result.tokensUsed);
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      // Record error details
      span.setAttribute('cortex.task.status', 'failed');
      span.setAttribute('cortex.task.error', error.message);
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Python

#### Installation

```bash
pip install \
  opentelemetry-api \
  opentelemetry-sdk \
  opentelemetry-exporter-otlp \
  opentelemetry-instrumentation-requests \
  opentelemetry-instrumentation-flask
```

#### Basic Setup

```python
# tracing.py - Initialize at application startup
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME

# Create resource with Cortex attributes
resource = Resource.create({
    SERVICE_NAME: os.getenv('CORTEX_AGENT_TYPE', 'cortex-agent'),
    'cortex.agent.type': os.getenv('CORTEX_AGENT_TYPE'),
    'cortex.master.type': os.getenv('CORTEX_MASTER_TYPE'),
    'cortex.task.id': os.getenv('CORTEX_TASK_ID'),
})

# Set up tracer provider
tracer_provider = TracerProvider(resource=resource)
trace.set_tracer_provider(tracer_provider)

# Configure OTLP exporter
span_exporter = OTLPSpanExporter()
span_processor = BatchSpanProcessor(span_exporter)
tracer_provider.add_span_processor(span_processor)
```

#### Manual Instrumentation

```python
from opentelemetry import trace
from opentelemetry.trace.status import Status, StatusCode

tracer = trace.get_tracer(__name__)

def execute_task(task_id: str):
    with tracer.start_as_current_span("cortex.task.execute") as span:
        try:
            # Add task-specific attributes
            span.set_attribute("cortex.task.id", task_id)
            span.set_attribute("cortex.task.type", "bug-fix")

            # Execute task logic
            result = perform_task(task_id)

            # Record success
            span.set_attribute("cortex.task.status", "completed")
            span.set_attribute("cortex.task.tokens_used", result.tokens_used)
            span.set_status(Status(StatusCode.OK))

            return result
        except Exception as e:
            # Record error
            span.set_attribute("cortex.task.status", "failed")
            span.set_attribute("cortex.task.error", str(e))
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise
```

### Bash/Shell Scripts

For bash-based agents, use the helper functions:

```bash
#!/bin/bash
# Source the tracing helpers
source /etc/otel/bash-tracing.sh

# Set Cortex context
export CORTEX_AGENT_TYPE="deployment-worker"
export CORTEX_TASK_ID="task-123"

# Wrap command execution with tracing
otel_exec "git clone https://github.com/example/repo.git"

# Manual span creation
START=$(date +%s)
perform_complex_operation
END=$(date +%s)
otel_trace_span "cortex.worker.deploy" "$START" "$END" "OK"
```

---

## Span Naming Conventions

Use hierarchical dot notation for span names:

### Format

```
{namespace}.{component}.{operation}
```

### Examples

| Span Name | Description |
|-----------|-------------|
| `cortex.master.receive_task` | Master receives task from coordinator |
| `cortex.master.spawn_worker` | Master spawns a worker |
| `cortex.worker.execute_task` | Worker executes assigned task |
| `cortex.coordinator.route_handoff` | Coordinator routes handoff |
| `cortex.knowledge.rag_retrieval` | RAG knowledge retrieval |
| `cortex.git.commit` | Git commit operation |
| `cortex.npm.install` | NPM package installation |
| `cortex.api.anthropic.messages` | Anthropic API call |

### Operation Types

- **receive**: Receiving/accepting work
- **execute**: Main execution logic
- **spawn**: Creating child processes/workers
- **route**: Routing/directing work
- **retrieve**: Data retrieval operations
- **update**: Data modification operations
- **validate**: Validation operations
- **deploy**: Deployment operations

---

## Attribute Standards

### Required Attributes

Every span should include:

```javascript
span.setAttribute('cortex.agent.type', process.env.CORTEX_AGENT_TYPE);
span.setAttribute('cortex.task.id', taskId);
```

### Standard Attributes

#### Agent Attributes

```javascript
{
  'cortex.agent.type': 'development-master',      // master, worker, coordinator
  'cortex.agent.id': 'agent-abc123',              // unique agent ID
  'cortex.agent.version': '1.0.0'                 // agent version
}
```

#### Master Attributes

```javascript
{
  'cortex.master.type': 'development',            // coordinator, development, security, etc.
  'cortex.master.session_id': 'session-xyz789'    // session identifier
}
```

#### Worker Attributes

```javascript
{
  'cortex.worker.id': 'worker-123',               // worker identifier
  'cortex.worker.type': 'feature-implementer',    // worker specialization
  'cortex.worker.parent_master': 'development'    // parent master type
}
```

#### Task Attributes

```javascript
{
  'cortex.task.id': 'task-456',                   // task identifier
  'cortex.task.type': 'feature-implementation',   // task type
  'cortex.task.priority': 1,                      // 1-5 priority
  'cortex.task.status': 'completed',              // pending, in_progress, completed, failed
  'cortex.task.result': 'success',                // success, failure, partial
  'cortex.task.tokens_used': 15000,               // tokens consumed
  'cortex.task.execution_time_ms': 45000          // execution time
}
```

#### Context Attributes

```javascript
{
  'cortex.context.workflow_id': 'workflow-789',   // workflow identifier
  'cortex.context.handoff_id': 'handoff-012',     // handoff identifier
  'cortex.context.parent_task_id': 'task-345'     // parent task (if nested)
}
```

#### HTTP Attributes (auto-instrumented)

```javascript
{
  'http.method': 'POST',
  'http.url': 'https://api.anthropic.com/v1/messages',
  'http.status_code': 200,
  'http.route': '/v1/messages'
}
```

---

## Error Handling

### Recording Exceptions

Always record exceptions with proper context:

```javascript
try {
  await riskyOperation();
} catch (error) {
  // Record the exception
  span.recordException(error);

  // Add error attributes
  span.setAttribute('error', true);
  span.setAttribute('error.type', error.name);
  span.setAttribute('error.message', error.message);
  span.setAttribute('cortex.task.status', 'failed');

  // Set error status
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message
  });

  // Re-throw to propagate
  throw error;
}
```

### Error Severity Levels

Add severity to categorize errors:

```javascript
span.setAttribute('error.severity', 'high');     // low, medium, high, critical
span.setAttribute('error.recoverable', false);   // can this be retried?
```

### Partial Failures

For operations that partially succeed:

```javascript
span.setAttribute('cortex.task.status', 'partial');
span.setAttribute('cortex.task.completed_items', 8);
span.setAttribute('cortex.task.failed_items', 2);
span.setAttribute('cortex.task.total_items', 10);
span.setStatus({ code: SpanStatusCode.OK }); // Still OK, but with notes
```

---

## Performance Considerations

### Sampling Strategies

Cortex uses intelligent sampling to balance observability and overhead:

1. **Always sample** (100%):
   - Errors and exceptions
   - Slow operations (>1s)
   - Task executions with high priority

2. **High sampling** (30-50%):
   - Master operations
   - Worker spawning
   - Knowledge base queries

3. **Medium sampling** (10-20%):
   - Worker operations
   - Standard task execution

4. **Low sampling** (1-5%):
   - Health checks
   - Metrics endpoints
   - Background jobs

### Resource Usage

Typical overhead per instrumented service:

- **CPU**: 50-100m (5-10% of 1 core)
- **Memory**: 64-128Mi
- **Network**: ~10KB/s per span

### Optimization Tips

1. **Batch export**: Use batch processors (already configured)
   ```javascript
   // Already configured in SDK
   batchProcessor: {
     maxQueueSize: 2048,
     maxExportBatchSize: 512,
     scheduledDelayMillis: 5000
   }
   ```

2. **Minimize span attributes**: Only add valuable attributes
   ```javascript
   // Good - actionable attributes
   span.setAttribute('cortex.task.tokens_used', 15000);

   // Bad - redundant or too verbose
   span.setAttribute('cortex.task.entire_config', JSON.stringify(config));
   ```

3. **Use semantic conventions**: Prefer standard attributes
   ```javascript
   // Use semantic conventions
   span.setAttribute('http.status_code', 200);

   // Instead of custom attributes
   span.setAttribute('response_status', 200);
   ```

4. **Async export**: Never block on telemetry
   ```javascript
   // Exporters are async by default - don't await
   ```

---

## Testing and Debugging

### Local Development

Test tracing locally without full infrastructure:

```bash
# Run OTel Collector locally
docker run -p 4317:4317 -p 4318:4318 \
  -v $(pwd)/otel-collector-config.yaml:/etc/otel/config.yaml \
  otel/opentelemetry-collector-contrib:0.91.0 \
  --config=/etc/otel/config.yaml

# Set environment variables
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export CORTEX_AGENT_TYPE="test-agent"

# Run your application
node index.js
```

### Viewing Traces

1. **Jaeger UI**: http://jaeger.cortex-system.svc.cluster.local:16686
2. **Grafana**: http://grafana.cortex-system.svc.cluster.local/explore
   - Select "Tempo" data source
   - Query by `cortex.task.id` or `cortex.agent.type`

### Debug Logging

Enable verbose logging to troubleshoot:

```bash
# Node.js
export OTEL_LOG_LEVEL=debug

# Python
export OTEL_PYTHON_LOG_LEVEL=debug
```

### Validation Checklist

- [ ] Spans appear in Jaeger/Tempo
- [ ] All required attributes present
- [ ] Parent-child relationships correct
- [ ] Error spans marked with ERROR status
- [ ] Sampling rate appropriate
- [ ] No sensitive data in attributes

---

## Best Practices

### 1. Trace Context Propagation

Always propagate trace context across service boundaries:

```javascript
// HTTP requests (auto-instrumented)
const response = await fetch('http://api.example.com', {
  headers: {
    'traceparent': getCurrentTraceParent(),  // auto-added
  }
});

// Message queues (manual)
await publishMessage({
  body: taskData,
  attributes: {
    traceparent: getCurrentTraceParent(),
  }
});
```

### 2. Meaningful Span Names

```javascript
// Good - descriptive and hierarchical
span.updateName('cortex.worker.deploy.kubernetes.apply');

// Bad - too generic
span.updateName('process');
```

### 3. Add Events for Milestones

```javascript
span.addEvent('worker_spawned', {
  'cortex.worker.id': workerId,
  'cortex.worker.type': 'feature-implementer'
});

span.addEvent('rag_retrieval_complete', {
  'results_count': 5,
  'retrieval_time_ms': 150
});

span.addEvent('task_checkpoint', {
  'checkpoint_id': 'checkpoint-123',
  'progress_percentage': 60
});
```

### 4. Link Related Spans

```javascript
// Link to related task
span.addLink({
  context: relatedSpanContext,
  attributes: {
    'link.type': 'parent_task',
    'cortex.task.id': parentTaskId
  }
});
```

### 5. Use Baggage for Cross-Cutting Concerns

```javascript
const baggage = require('@opentelemetry/api').propagation.getBaggage();
baggage?.setEntry('cortex.session.id', { value: sessionId });
baggage?.setEntry('cortex.user.id', { value: userId });
```

### 6. Don't Over-Instrument

```javascript
// Good - instrument significant operations
tracer.startActiveSpan('cortex.worker.execute_task', (span) => {
  // Meaningful work
});

// Bad - too granular
tracer.startActiveSpan('cortex.worker.parse_json', (span) => {
  JSON.parse(data);  // Too fine-grained
  span.end();
});
```

### 7. Security Considerations

```javascript
// Never include sensitive data
span.setAttribute('cortex.api.key', apiKey);  // DON'T

// Sanitize or hash sensitive attributes
span.setAttribute('cortex.user.id_hash', hashUserId(userId));  // OK
```

### 8. Consistent Attribute Naming

Follow the naming conventions in [Attribute Standards](#attribute-standards).

---

## Examples

### Complete Master Agent Example

```javascript
// development-master.js
require('./tracing');  // Initialize tracing first
const { trace, context } = require('@opentelemetry/api');

class DevelopmentMaster {
  constructor() {
    this.tracer = trace.getTracer('cortex-development-master');
  }

  async handleHandoff(handoff) {
    return this.tracer.startActiveSpan('cortex.master.handle_handoff', async (span) => {
      try {
        span.setAttribute('cortex.handoff.id', handoff.handoff_id);
        span.setAttribute('cortex.handoff.from', handoff.from_master);
        span.setAttribute('cortex.task.id', handoff.task_id);

        // RAG retrieval
        const patterns = await this.retrievePatterns(handoff.task_id);
        span.addEvent('rag_retrieval_complete', { patterns_count: patterns.length });

        // Spawn worker
        const worker = await this.spawnWorker(handoff, patterns);
        span.setAttribute('cortex.worker.id', worker.id);

        // Monitor worker
        const result = await this.monitorWorker(worker);
        span.setAttribute('cortex.task.status', result.status);
        span.setAttribute('cortex.task.tokens_used', result.tokensUsed);

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async retrievePatterns(taskId) {
    return this.tracer.startActiveSpan('cortex.knowledge.rag_retrieval', async (span) => {
      span.setAttribute('cortex.task.id', taskId);
      const patterns = await this.knowledgeBase.retrieve(taskId);
      span.setAttribute('patterns_retrieved', patterns.length);
      span.end();
      return patterns;
    });
  }

  async spawnWorker(handoff, patterns) {
    return this.tracer.startActiveSpan('cortex.master.spawn_worker', async (span) => {
      span.setAttribute('cortex.worker.type', 'feature-implementer');
      const worker = await this.createWorker(handoff, patterns);
      span.setAttribute('cortex.worker.id', worker.id);
      span.addEvent('worker_spawned');
      span.end();
      return worker;
    });
  }
}
```

### Complete Worker Agent Example

```python
# feature_worker.py
from tracing import initialize_tracing
from opentelemetry import trace
from opentelemetry.trace.status import Status, StatusCode

initialize_tracing()
tracer = trace.get_tracer(__name__)

class FeatureWorker:
    def execute_task(self, task_spec):
        with tracer.start_as_current_span("cortex.worker.execute_task") as span:
            try:
                span.set_attribute("cortex.worker.id", self.worker_id)
                span.set_attribute("cortex.task.id", task_spec['task_id'])
                span.set_attribute("cortex.worker.type", "feature-implementer")

                # Implement feature
                result = self.implement_feature(task_spec)

                # Run tests
                test_result = self.run_tests()
                span.add_event("tests_complete", {
                    "tests_passed": test_result.passed,
                    "tests_failed": test_result.failed
                })

                # Create PR
                pr_url = self.create_pull_request(result)
                span.set_attribute("cortex.pr.url", pr_url)

                span.set_attribute("cortex.task.status", "completed")
                span.set_status(Status(StatusCode.OK))

                return result
            except Exception as e:
                span.record_exception(e)
                span.set_attribute("cortex.task.status", "failed")
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise

    def implement_feature(self, task_spec):
        with tracer.start_as_current_span("cortex.worker.implement") as span:
            span.set_attribute("feature_type", task_spec.get("feature_type"))
            # Implementation logic
            pass
```

---

## Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Cortex Architecture](/deploy/ARCHITECTURE.md)
- [Grafana Dashboards](/deploy/monitoring/)

---

## Support

For questions or issues:

1. Check Grafana for trace visualization
2. Review OTel Collector logs: `kubectl logs -n cortex-observability -l app.kubernetes.io/name=otel-collector`
3. Verify configuration: `kubectl get cm -n cortex-observability otel-collector-config -o yaml`
4. Consult development team in `#cortex-observability` Slack channel

---

**Last Updated**: 2025-12-11
**Version**: 1.0.0
**Maintainer**: Cortex Development Team
