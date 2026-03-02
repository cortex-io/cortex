# OpenTelemetry Integration for Cortex

This directory contains the OpenTelemetry (OTel) integration for the Cortex automation system, providing comprehensive distributed tracing, metrics, and logging capabilities.

## Overview

OpenTelemetry provides:

- **Distributed Tracing**: Track requests through coordinator → master → worker chains
- **Metrics Collection**: Aggregate metrics from all Cortex services
- **Log Aggregation**: Centralized logging with trace correlation
- **LLM Observability**: Track Claude API calls, token usage, and costs
- **Kubernetes Integration**: Automatic enrichment with pod/deployment metadata

## Architecture

```
┌──────────────────┐
│ Cortex Services  │
│ (instrumented)   │
└────────┬─────────┘
         │ OTLP (gRPC/HTTP)
         ▼
┌─────────────────────────────────────┐
│   OpenTelemetry Collector           │
│                                     │
│  ┌──────────┐  ┌──────────────┐   │
│  │Receivers │→ │ Processors   │   │
│  └──────────┘  └──────┬───────┘   │
│                       │             │
│              ┌────────┴────────┐   │
│              ▼                 ▼   │
│         Prometheus         Jaeger  │
│         (metrics)        (traces)  │
└─────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `otel-collector-config.yaml` | Main OTel Collector configuration with receivers, processors, and exporters |
| `otel-collector-deployment.yaml` | Kubernetes deployment for OTel Collector |
| `otel-instrumentation.yaml` | Auto-instrumentation configs for Python, Node.js, Go, Java |
| `cortex-tracing-config.ts` | TypeScript SDK for manual instrumentation |
| `servicemonitor-otel.yaml` | Prometheus ServiceMonitor and alerts |
| `distributed-tracing-guide.md` | Complete implementation guide |
| `deploy-otel.sh` | Deployment script |
| `README.md` | This file |

## Quick Start

### 1. Deploy OpenTelemetry Collector

```bash
# Make deploy script executable
chmod +x deploy-otel.sh

# Run deployment
./deploy-otel.sh
```

This will:
- Create the `monitoring` namespace (if needed)
- Deploy the OTel Collector with ConfigMap
- Create ServiceMonitor for Prometheus
- Optionally deploy auto-instrumentation

### 2. Verify Deployment

```bash
# Check collector status
kubectl get pods -n monitoring -l app=otel-collector

# Check service endpoints
kubectl get svc -n monitoring otel-collector

# View collector logs
kubectl logs -n monitoring -l app=otel-collector -f

# Test health endpoint
kubectl run otel-test --rm -it --restart=Never \
  --image=curlimages/curl:latest \
  -- curl http://otel-collector.monitoring.svc.cluster.local:13133/health
```

### 3. Add Instrumentation to Services

**Option A: Auto-Instrumentation (Python)**

Add annotation to your deployment:

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
        instrumentation.opentelemetry.io/otel-service-name: "cortex-agent"
```

**Option B: Manual Instrumentation (TypeScript)**

```typescript
import { initializeTracing, traceAgentOperation } from './cortex-tracing-config';

// Initialize once at startup
initializeTracing('cortex-development-master');

// Trace operations
await traceAgentOperation(
  'dev-master-001',
  'development-master',
  'spawn-worker',
  'task-123',
  async (span) => {
    // Your code here
  }
);
```

See [distributed-tracing-guide.md](./distributed-tracing-guide.md) for complete examples.

## Configuration

### Receivers

The collector receives telemetry data from:

- **OTLP gRPC** (port 4317): Primary protocol for traces/metrics/logs
- **OTLP HTTP** (port 4318): HTTP alternative for OTLP
- **Prometheus** (scraping): Scrapes existing Prometheus endpoints
- **Filelog**: Collects logs from `/var/log/pods`
- **Kubernetes Events**: Monitors cluster events

### Processors

Data is processed through:

- **Memory Limiter**: Prevents OOM (400MiB limit)
- **Batch**: Batches data (10s timeout, 1000 items)
- **Resource**: Adds cluster/environment labels
- **K8s Attributes**: Enriches with Kubernetes metadata
- **Filter**: Drops low-value metrics (health checks)
- **Tail Sampling**: Intelligent trace sampling (100% errors, 10% normal)

### Exporters

Processed data is exported to:

- **Prometheus** (port 8889): Exposes metrics for Prometheus to scrape
- **OTLP/Traces**: Sends traces to Jaeger/Tempo
- **Loki**: Sends logs to Loki
- **Logging**: Debug output to collector logs

## Endpoints

| Endpoint | Port | Purpose |
|----------|------|---------|
| OTLP gRPC | 4317 | Primary telemetry ingestion (gRPC) |
| OTLP HTTP | 4318 | Primary telemetry ingestion (HTTP) |
| Prometheus | 8889 | Metrics endpoint for Prometheus scraping |
| Health Check | 13133 | Liveness/readiness probes |
| Metrics | 8888 | Collector's own metrics |
| Zpages | 55679 | Live debugging interface |
| Pprof | 1777 | Performance profiling |

## Integration with Existing Monitoring

### Prometheus Integration

The OTel Collector integrates with the existing Prometheus stack:

1. **ServiceMonitor**: Prometheus scrapes OTel Collector metrics endpoint (8889)
2. **Prometheus Receiver**: OTel can scrape existing Prometheus targets
3. **Remote Write**: Optional direct write to Prometheus

Configuration in `prometheus-values.yaml`:

```yaml
additionalScrapeConfigs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector.monitoring.svc.cluster.local:8889']
```

### Grafana Dashboards

Import OTel Collector dashboard:

1. Go to Grafana → Dashboards → Import
2. Use the ConfigMap: `otel-collector-dashboard`
3. Or import from Grafana.com: Dashboard ID `15983`

### Alertmanager Integration

Alerts are defined in `servicemonitor-otel.yaml`:

- `OtelCollectorDown`: Collector is unavailable
- `OtelCollectorDroppingData`: Data loss detected
- `OtelCollectorHighMemory`: Memory usage > 85%
- `OtelCollectorHighCPU`: CPU usage > 80%
- `OtelCollectorExporterFailing`: Export failures
- `OtelCollectorQueueAlmostFull`: Queue capacity > 90%

## Cortex-Specific Features

### Agent Tracing

Track operations across the agent hierarchy:

```typescript
// Trace master spawning worker
await traceAgentOperation(
  'dev-master-001',
  'development-master',
  'spawn_worker',
  'task-123',
  async (span) => {
    const workerId = await spawnWorker();
    span.setAttribute('cortex.worker.id', workerId);
  }
);
```

### LLM Call Tracking

Monitor Claude API usage:

```typescript
// Trace LLM call with token counting
await traceLLMCall(
  'claude-opus-4-5',
  'code_generation',
  1500,
  async (span) => {
    const response = await callClaude();
    span.setAttribute('cortex.token.count', response.usage.total_tokens);
  }
);
```

### Task Correlation

Every span includes `cortex.task.id` for end-to-end tracking:

```traceql
# Find all operations for a task
{ cortex.task.id = "task-123" }

# Find slow tasks
{ cortex.task.id != "" } | select(duration > 10s)
```

## Span Naming Conventions

Follow these conventions for consistent traces:

| Component | Operation | Span Name |
|-----------|-----------|-----------|
| Coordinator | Receive request | `coordinator.receive_request` |
| Master | Receive handoff | `master.receive_handoff` |
| Master | Spawn worker | `master.spawn_worker` |
| Worker | Execute task | `worker.execute_task` |
| RAG | Retrieve patterns | `rag.retrieve` |
| LLM | API call | `llm.completion` |
| Database | Query | `db.query` |

See [distributed-tracing-guide.md](./distributed-tracing-guide.md) for complete conventions.

## Required Attributes

Every Cortex span MUST include:

```typescript
{
  'cortex.system': true,
  'cortex.operation.type': string,
  'cortex.agent.id': string,        // For agent operations
  'cortex.task.id': string,          // Always include
  'service.namespace': 'cortex',
  'deployment.environment': string,
}
```

## Sampling Strategy

Default sampling configuration:

- **100% sampling**: All errors and critical operations
- **10% sampling**: Normal operations
- **0% sampling**: Health check endpoints (dropped by filter)

Override for specific services:

```yaml
# Use cortex-critical-instrumentation for 100% sampling
annotations:
  instrumentation.opentelemetry.io/instrumentation: "cortex-critical-instrumentation"
```

## Performance Tuning

### Memory Management

The collector is configured with:

- Memory limit: 512Mi (container)
- Memory limiter processor: 400MiB
- Spike limit: 100MiB
- Check interval: 1s

### Batch Processing

Optimized for throughput:

- Timeout: 10s
- Batch size: 1000 items
- Max batch size: 1500 items

### Scaling

Horizontal Pod Autoscaler configured:

- Min replicas: 1
- Max replicas: 3
- CPU threshold: 70%
- Memory threshold: 80%

## Troubleshooting

### Collector Not Receiving Data

1. Check service connectivity:
   ```bash
   kubectl run test --rm -it --image=curlimages/curl --restart=Never -- \
     curl -v http://otel-collector.monitoring.svc.cluster.local:4318/v1/traces
   ```

2. Check instrumentation:
   ```bash
   kubectl get pods -n cortex -o jsonpath='{.items[*].metadata.annotations}' | grep instrumentation
   ```

3. View collector logs:
   ```bash
   kubectl logs -n monitoring -l app=otel-collector -f
   ```

### High Memory Usage

1. Reduce batch size in `otel-collector-config.yaml`:
   ```yaml
   processors:
     batch:
       send_batch_size: 500  # Reduce from 1000
   ```

2. Lower memory limit:
   ```yaml
   processors:
     memory_limiter:
       limit_mib: 300  # Reduce from 400
   ```

### Missing Traces

1. Check sampling configuration
2. Verify trace context propagation
3. Check exporter status in collector logs
4. Ensure Jaeger/Tempo is deployed

See [distributed-tracing-guide.md](./distributed-tracing-guide.md#troubleshooting) for more details.

## Advanced Features

### Custom Exporters

Add additional exporters in `otel-collector-config.yaml`:

```yaml
exporters:
  # Example: Export to custom backend
  otlphttp/custom:
    endpoint: https://custom-backend.example.com
    headers:
      api-key: ${API_KEY}
```

### Multi-Cluster Support

For multi-cluster deployments:

1. Update resource processor with cluster ID:
   ```yaml
   resource:
     attributes:
       - key: cluster
         value: cortex-cluster-02
   ```

2. Configure remote write to central Prometheus
3. Use federated Jaeger deployment

### Custom Instrumentation

Create custom spans for Cortex-specific operations:

```typescript
import { cortexTracer } from './cortex-tracing-config';

const span = cortexTracer.startSpan('custom.operation', {
  attributes: {
    'cortex.custom.attribute': 'value',
  },
});

try {
  // Your operation
} finally {
  span.end();
}
```

## Security Considerations

1. **TLS**: Enable TLS for production exporters
2. **Authentication**: Use API keys for external backends
3. **RBAC**: Collector runs with minimal ServiceAccount permissions
4. **Network Policies**: Restrict traffic to collector endpoints
5. **Secrets**: Store credentials in Kubernetes Secrets

## Maintenance

### Regular Tasks

- Monitor collector resource usage
- Review and tune sampling rates
- Update collector image version
- Archive old traces (retention policy)
- Monitor cardinality of attributes

### Upgrades

```bash
# Update collector image
kubectl set image deployment/otel-collector \
  otel-collector=otel/opentelemetry-collector-contrib:0.96.0 \
  -n monitoring

# Update config
kubectl create configmap otel-collector-config \
  --from-file=otel-collector-config.yaml \
  --namespace=monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart collector
kubectl rollout restart deployment/otel-collector -n monitoring
```

## Resources

- **Official Docs**: https://opentelemetry.io/docs/
- **Collector Docs**: https://opentelemetry.io/docs/collector/
- **Instrumentation Guide**: [distributed-tracing-guide.md](./distributed-tracing-guide.md)
- **SDK Config**: [cortex-tracing-config.ts](./cortex-tracing-config.ts)
- **Prometheus Integration**: [../monitoring/prometheus-values.yaml](../../monitoring/prometheus-values.yaml)

## Support

For issues or questions:

1. Check collector logs: `kubectl logs -n monitoring -l app=otel-collector`
2. Review [troubleshooting guide](./distributed-tracing-guide.md#troubleshooting)
3. Verify ServiceMonitor: `kubectl get servicemonitor -n monitoring`
4. Test endpoints with curl
5. Open issue with trace ID and timestamp

## License

This configuration is part of the Cortex automation system.
