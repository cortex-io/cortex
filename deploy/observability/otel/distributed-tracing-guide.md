# Distributed Tracing Guide for Cortex

This guide explains how to implement distributed tracing across Cortex agents, workers, and services using OpenTelemetry.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Span Naming Conventions](#span-naming-conventions)
5. [Required Attributes](#required-attributes)
6. [Implementation Examples](#implementation-examples)
7. [Trace Correlation](#trace-correlation)
8. [Querying Traces](#querying-traces)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Overview

Distributed tracing allows you to follow a request through the entire Cortex system, from the initial user request through all agent/worker interactions, LLM API calls, and database operations.

### Why Tracing Matters for Cortex

- **Hierarchical Agent Operations**: Trace coordinator → master → worker chains
- **LLM Call Attribution**: See which agent made which LLM calls and their token usage
- **Performance Bottlenecks**: Identify slow operations in the agent execution pipeline
- **Error Root Cause**: Trace errors back to the originating agent/task
- **Resource Usage**: Correlate traces with metrics to understand token/cost impact

## Architecture

```
┌─────────────────┐
│ Cortex Agent    │
│ (instrumented)  │
└────────┬────────┘
         │ OTLP/HTTP (4318)
         ▼
┌─────────────────┐      ┌──────────────┐
│ OTel Collector  │─────→│ Prometheus   │ (metrics)
│                 │      └──────────────┘
└────────┬────────┘
         │
         ├─────→ ┌──────────────┐
         │       │ Jaeger/Tempo │ (traces)
         │       └──────────────┘
         │
         └─────→ ┌──────────────┐
                 │ Loki         │ (logs)
                 └──────────────┘
```

## Quick Start

### 1. Deploy OpenTelemetry Collector

```bash
# Create the OTel collector configuration
kubectl create configmap otel-collector-config \
  --from-file=otel-collector-config.yaml \
  -n monitoring

# Deploy the collector
kubectl apply -f otel-collector-deployment.yaml

# Verify deployment
kubectl get pods -n monitoring -l app=otel-collector
```

### 2. Enable Auto-Instrumentation (Python)

Add annotation to your pod specification:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-agent
  namespace: cortex
spec:
  template:
    metadata:
      annotations:
        instrumentation.opentelemetry.io/inject-python: "true"
        instrumentation.opentelemetry.io/otel-service-name: "cortex-agent-executor"
```

### 3. Manual Instrumentation (TypeScript/Node.js)

```typescript
import { initializeTracing, traceAgentOperation } from './cortex-tracing-config';

// Initialize once at startup
initializeTracing('cortex-development-master');

// Trace an operation
await traceAgentOperation(
  'dev-master-001',
  'development-master',
  'spawn-worker',
  'task-123',
  async (span) => {
    // Your operation code here
    const result = await spawnWorker();
    span.setAttribute('cortex.worker.spawned', true);
    return result;
  }
);
```

## Span Naming Conventions

Follow these conventions for consistent trace navigation:

### Agent Operations

| Operation | Span Name | Example |
|-----------|-----------|---------|
| Master receives handoff | `master.receive_handoff` | coordinator → development master |
| Master spawns worker | `master.spawn_worker` | development master → feature-implementer |
| Worker executes task | `worker.execute_task` | feature-implementer working |
| Agent completes task | `agent.complete_task` | Any agent finishing |

### LLM Operations

| Operation | Span Name | Example |
|-----------|-----------|---------|
| LLM API call | `llm.completion` | Claude API call |
| Embedding generation | `llm.embedding` | Generate embeddings |
| RAG retrieval | `rag.retrieve` | Knowledge base lookup |

### System Operations

| Operation | Span Name | Example |
|-----------|-----------|---------|
| Database query | `db.query` | PostgreSQL read |
| File operation | `fs.read` / `fs.write` | Read/write files |
| HTTP request | `http.request` | External API call |

### Format

- Use lowercase with underscores
- Prefix with component: `master.`, `worker.`, `llm.`, `db.`
- Use verb form: `spawn_worker`, not `worker_spawn`
- Be specific but concise: `llm.completion`, not `llm.api.call.completion`

## Required Attributes

### Core Cortex Attributes

Every span MUST include these attributes:

```typescript
{
  'cortex.system': true,              // Identifies Cortex spans
  'cortex.operation.type': string,    // Operation category
  'service.namespace': 'cortex',      // Always 'cortex'
  'deployment.environment': string,   // production/staging/dev
}
```

### Agent-Specific Attributes

For agent operations:

```typescript
{
  'cortex.agent.id': string,          // Unique agent identifier
  'cortex.agent.type': string,        // coordinator/master/worker type
  'cortex.task.id': string,           // Associated task ID
}
```

### Worker-Specific Attributes

For worker operations:

```typescript
{
  'cortex.worker.id': string,         // Unique worker identifier
  'cortex.worker.type': string,       // feature-implementer, bug-fixer, etc.
  'cortex.master.id': string,         // Parent master ID
  'cortex.task.id': string,           // Task being executed
}
```

### LLM-Specific Attributes

For LLM API calls:

```typescript
{
  'cortex.model.name': string,        // e.g., 'claude-opus-4-5'
  'cortex.token.count': number,       // Tokens used in call
  'cortex.token.input': number,       // Input tokens (optional)
  'cortex.token.output': number,      // Output tokens (optional)
  'llm.request.model': string,        // Model requested
  'llm.response.status': string,      // success/error
}
```

### Kubernetes Attributes (auto-added)

The k8sattributes processor automatically adds:

```typescript
{
  'k8s.namespace.name': string,
  'k8s.pod.name': string,
  'k8s.pod.uid': string,
  'k8s.deployment.name': string,
  'k8s.node.name': string,
}
```

## Implementation Examples

### Example 1: Development Master Spawning Worker

```typescript
import { traceAgentOperation, recordCortexEvent } from './cortex-tracing-config';

async function spawnFeatureWorker(taskId: string) {
  return await traceAgentOperation(
    'dev-master-001',
    'development-master',
    'spawn_worker',
    taskId,
    async (span) => {
      // Record the decision to spawn
      recordCortexEvent('worker.spawn.initiated', {
        'cortex.worker.type': 'feature-implementer',
        'cortex.task.complexity': 'high',
      });

      // RAG retrieval for worker context
      const patterns = await traceOperation(
        'rag.retrieve',
        { 'cortex.rag.type': 'implementation-patterns' },
        async (ragSpan) => {
          const results = await retrievePatterns();
          ragSpan.setAttribute('cortex.rag.results.count', results.length);
          return results;
        }
      );

      // Create worker spec
      const workerSpec = createWorkerSpec(patterns);

      // Spawn worker
      const workerId = await spawnWorker(workerSpec);

      span.setAttribute('cortex.worker.id', workerId);
      span.setAttribute('cortex.worker.spawned', true);

      recordCortexEvent('worker.spawn.completed', {
        'cortex.worker.id': workerId,
      });

      return workerId;
    }
  );
}
```

### Example 2: Worker Making LLM Call

```typescript
import { traceLLMCall, addCortexContext } from './cortex-tracing-config';

async function generateCode(prompt: string) {
  return await traceLLMCall(
    'claude-opus-4-5',
    'code_generation',
    undefined, // Token count will be added after
    async (span) => {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      // Add token usage
      const tokenCount = response.usage.input_tokens + response.usage.output_tokens;
      span.setAttribute('cortex.token.count', tokenCount);
      span.setAttribute('cortex.token.input', response.usage.input_tokens);
      span.setAttribute('cortex.token.output', response.usage.output_tokens);
      span.setAttribute('llm.response.status', 'success');

      return response.content[0].text;
    }
  );
}
```

### Example 3: Coordinator Orchestrating Workflow

```typescript
async function executeWorkflow(workflowId: string) {
  return await traceOperation(
    'coordinator.execute_workflow',
    {
      'cortex.workflow.id': workflowId,
      'cortex.agent.id': 'coordinator-001',
      'cortex.agent.type': 'coordinator',
    },
    async (span) => {
      // Parse workflow
      const workflow = await parseWorkflow(workflowId);
      span.setAttribute('cortex.workflow.steps', workflow.steps.length);

      // Create handoffs for each step
      for (const step of workflow.steps) {
        await traceOperation(
          'coordinator.create_handoff',
          {
            'cortex.handoff.to': step.masterType,
            'cortex.task.id': step.taskId,
          },
          async (handoffSpan) => {
            const handoff = await createHandoff(step);
            handoffSpan.setAttribute('cortex.handoff.created', true);
            recordCortexEvent('handoff.created', {
              'cortex.handoff.id': handoff.id,
            });
          }
        );
      }

      return { status: 'completed', steps: workflow.steps.length };
    }
  );
}
```

## Trace Correlation

### Correlating Traces with Metrics

Link traces to metrics using shared labels:

```promql
# Find all traces for a specific task
{cortex.task.id="task-123"}

# Find metrics for the same task
cortex_task_duration_seconds{task_id="task-123"}
```

### Correlating Traces with Logs

Ensure logs include trace context:

```typescript
import { trace } from '@opentelemetry/api';

function logWithTrace(message: string) {
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  console.log(JSON.stringify({
    message,
    trace_id: spanContext?.traceId,
    span_id: spanContext?.spanId,
    timestamp: new Date().toISOString(),
  }));
}
```

### Trace ID Propagation

Trace IDs are automatically propagated through:

- HTTP headers (W3C Trace Context)
- gRPC metadata
- Message queues (if instrumented)

For manual propagation:

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

// Extract trace context from headers
const ctx = propagation.extract(context.active(), headers);

// Continue trace in new span
context.with(ctx, () => {
  const span = cortexTracer.startSpan('continued-operation');
  // ... work ...
  span.end();
});
```

## Querying Traces

### Jaeger UI Queries

1. **Find all traces for a task**:
   ```
   cortex.task.id="task-123"
   ```

2. **Find traces with errors**:
   ```
   error=true
   ```

3. **Find slow LLM calls**:
   ```
   cortex.operation.type="llm.completion" AND duration > 5s
   ```

4. **Find traces by agent type**:
   ```
   cortex.agent.type="development-master"
   ```

### Tempo/Grafana TraceQL

```traceql
# High token usage traces
{ cortex.token.count > 10000 }

# Failed worker operations
{ cortex.worker.id != "" && status = error }

# Slow agent operations
{ cortex.agent.type = "development-master" } | select(duration > 10s)

# Complex query: Find all LLM calls in failed tasks
{ cortex.task.id = "task-123" && cortex.operation.type =~ "llm.*" }
```

### Prometheus + Exemplars

Query metrics with trace exemplars:

```promql
# Task duration with trace links
histogram_quantile(0.95,
  rate(cortex_task_duration_seconds_bucket[5m])
)
```

## Best Practices

### 1. Span Granularity

✅ **DO**: Create spans for significant operations
```typescript
// Good: Meaningful operation
await traceOperation('worker.execute_task', attrs, async () => {
  // Complex task execution
});
```

❌ **DON'T**: Create spans for trivial operations
```typescript
// Bad: Too granular
await traceOperation('validate.task.id', attrs, async () => {
  return taskId !== null;
});
```

### 2. Attribute Consistency

✅ **DO**: Use consistent attribute names
```typescript
span.setAttribute('cortex.agent.id', agentId);
span.setAttribute('cortex.task.id', taskId);
```

❌ **DON'T**: Mix naming conventions
```typescript
span.setAttribute('agentId', agentId);
span.setAttribute('task-id', taskId);
```

### 3. Error Handling

✅ **DO**: Record exceptions and set error status
```typescript
try {
  await doWork();
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
}
```

### 4. Sampling Strategy

- **100% sampling**: Errors, critical operations
- **10% sampling**: Normal operations
- **1% sampling**: High-volume operations (health checks excluded)

### 5. Performance Considerations

- Batch span exports (10s timeout)
- Use memory limiter (400MiB limit)
- Drop low-value metrics (health checks)
- Tail sampling for intelligent filtering

## Troubleshooting

### Issue: Traces not appearing

**Check:**
1. OTel collector is running: `kubectl get pods -n monitoring -l app=otel-collector`
2. Service is instrumented: Check for OTEL environment variables
3. Exporter endpoint is correct: `http://otel-collector.monitoring.svc.cluster.local:4318`
4. Firewall/network policies allow traffic

**Debug:**
```bash
# Check collector logs
kubectl logs -n monitoring -l app=otel-collector

# Test OTLP endpoint
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://otel-collector.monitoring.svc.cluster.local:4318/v1/traces
```

### Issue: High cardinality warnings

**Solution:**
Add filter processor to drop high-cardinality attributes:

```yaml
processors:
  filter/cardinality:
    metrics:
      datapoint:
        - 'attributes["http.url"] != ""'  # Drop full URLs
```

### Issue: Missing trace context

**Cause**: Context not propagated between services

**Solution**:
```typescript
// Ensure propagators are configured
propagators: ['tracecontext', 'baggage', 'b3']

// Manual propagation
const headers = {};
propagation.inject(context.active(), headers);
await fetch(url, { headers });
```

### Issue: Spans out of order

**Cause**: Clock skew between nodes

**Solution**:
- Enable NTP on all nodes
- Use batch processor with adequate timeout
- Check `scheduledDelayMillis` in span processor config

## Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Cortex Architecture](/docs/architecture.md)
- [Prometheus Integration](/deploy/monitoring/prometheus-values.yaml)
- [OTel Collector Config](/deploy/observability/otel/otel-collector-config.yaml)

## Support

For issues or questions:
1. Check collector logs: `kubectl logs -n monitoring -l app=otel-collector`
2. Verify ServiceMonitor: `kubectl get servicemonitor -n monitoring`
3. Review Prometheus targets: Grafana → Prometheus → Targets
4. Open issue with trace ID and timestamp
