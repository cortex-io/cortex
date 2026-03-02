# OpenTelemetry Quick Reference for Cortex

## One-Line Commands

### Deploy
```bash
./deploy-otel.sh
```

### Check Status
```bash
kubectl get pods -n monitoring -l app=otel-collector
```

### View Logs
```bash
kubectl logs -n monitoring -l app=otel-collector -f
```

### Test Endpoints
```bash
kubectl run test --rm -it --image=curlimages/curl --restart=Never -- \
  curl http://otel-collector.monitoring.svc.cluster.local:13133/health
```

## Endpoints

| Service | Endpoint | Port |
|---------|----------|------|
| OTLP gRPC | `otel-collector.monitoring.svc.cluster.local` | 4317 |
| OTLP HTTP | `otel-collector.monitoring.svc.cluster.local` | 4318 |
| Prometheus | `otel-collector.monitoring.svc.cluster.local` | 8889 |
| Health | `otel-collector.monitoring.svc.cluster.local` | 13133 |

## Environment Variables

### Required
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.monitoring.svc.cluster.local:4318
OTEL_SERVICE_NAME=your-service-name
```

### Optional
```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_RESOURCE_ATTRIBUTES=service.namespace=cortex,cortex.system=true
```

## Auto-Instrumentation Annotations

### Python
```yaml
annotations:
  instrumentation.opentelemetry.io/inject-python: "true"
  instrumentation.opentelemetry.io/otel-service-name: "my-service"
```

### Node.js
```yaml
annotations:
  instrumentation.opentelemetry.io/inject-nodejs: "true"
  instrumentation.opentelemetry.io/otel-service-name: "my-service"
```

### Go
```yaml
annotations:
  instrumentation.opentelemetry.io/inject-go: "true"
  instrumentation.opentelemetry.io/otel-service-name: "my-service"
```

## TypeScript SDK Quick Start

### Install
```bash
npm install @opentelemetry/api @opentelemetry/sdk-node
```

### Initialize
```typescript
import { initializeTracing } from './cortex-tracing-config';
initializeTracing('my-service');
```

### Trace Operation
```typescript
import { traceAgentOperation } from './cortex-tracing-config';

await traceAgentOperation(
  'agent-id',
  'agent-type',
  'operation',
  'task-id',
  async (span) => {
    // Your code
  }
);
```

### Trace LLM Call
```typescript
import { traceLLMCall } from './cortex-tracing-config';

await traceLLMCall(
  'claude-opus-4-5',
  'completion',
  1500,
  async (span) => {
    const response = await callClaude();
    span.setAttribute('cortex.token.count', response.usage.total);
  }
);
```

## Span Naming

| Component | Operation | Span Name |
|-----------|-----------|-----------|
| Coordinator | Receive request | `coordinator.receive_request` |
| Master | Spawn worker | `master.spawn_worker` |
| Worker | Execute task | `worker.execute_task` |
| RAG | Retrieve | `rag.retrieve` |
| LLM | Completion | `llm.completion` |
| Database | Query | `db.query` |
| Filesystem | Read | `fs.read` |

## Required Attributes

### All Spans
```typescript
{
  'cortex.system': true,
  'cortex.operation.type': 'spawn_worker',
  'service.namespace': 'cortex',
}
```

### Agent Spans
```typescript
{
  'cortex.agent.id': 'agent-001',
  'cortex.agent.type': 'development-master',
  'cortex.task.id': 'task-123',
}
```

### Worker Spans
```typescript
{
  'cortex.worker.id': 'worker-456',
  'cortex.worker.type': 'feature-implementer',
  'cortex.master.id': 'dev-master-001',
  'cortex.task.id': 'task-123',
}
```

### LLM Spans
```typescript
{
  'cortex.model.name': 'claude-opus-4-5',
  'cortex.token.count': 1500,
  'llm.response.status': 'success',
}
```

## Query Examples

### Jaeger
```
# Find task traces
cortex.task.id="task-123"

# Find errors
error=true

# Find slow LLM calls
cortex.operation.type="llm.completion" AND duration > 5s

# Find agent type
cortex.agent.type="development-master"
```

### TraceQL (Tempo/Grafana)
```traceql
# High token usage
{ cortex.token.count > 10000 }

# Failed workers
{ cortex.worker.id != "" && status = error }

# Slow agents
{ cortex.agent.type = "development-master" } | select(duration > 10s)
```

### PromQL
```promql
# Task duration P95
histogram_quantile(0.95, rate(cortex_task_duration_seconds_bucket[5m]))

# Token usage rate
rate(cortex_llm_tokens_total[5m])

# Error rate
rate(cortex_errors_total[5m])
```

## Troubleshooting

### No Traces Appearing
```bash
# 1. Check collector
kubectl get pods -n monitoring -l app=otel-collector

# 2. Check logs
kubectl logs -n monitoring -l app=otel-collector

# 3. Test endpoint
kubectl run test --rm -it --image=curlimages/curl --restart=Never -- \
  curl -v http://otel-collector.monitoring.svc.cluster.local:4318

# 4. Check service
kubectl get svc -n monitoring otel-collector
```

### High Memory Usage
```bash
# Check memory
kubectl top pods -n monitoring -l app=otel-collector

# Restart collector
kubectl rollout restart deployment/otel-collector -n monitoring

# Scale up
kubectl scale deployment/otel-collector --replicas=2 -n monitoring
```

### Collector Errors
```bash
# Get detailed logs
kubectl logs -n monitoring -l app=otel-collector --tail=100

# Check events
kubectl get events -n monitoring --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod -n monitoring -l app=otel-collector
```

## Configuration Updates

### Update ConfigMap
```bash
kubectl create configmap otel-collector-config \
  --from-file=otel-collector-config.yaml \
  -n monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/otel-collector -n monitoring
```

### Update Collector Image
```bash
kubectl set image deployment/otel-collector \
  otel-collector=otel/opentelemetry-collector-contrib:0.96.0 \
  -n monitoring
```

### Scale Collector
```bash
# Manual
kubectl scale deployment/otel-collector --replicas=3 -n monitoring

# Auto (HPA already configured)
kubectl get hpa -n monitoring otel-collector
```

## Metrics to Monitor

### Collector Health
```promql
# Collector up
up{job="otel-collector"}

# Memory usage
process_runtime_go_mem_heap_alloc_bytes{job="otel-collector-internal"}

# Spans received
rate(otelcol_receiver_accepted_spans_total[5m])

# Spans exported
rate(otelcol_exporter_sent_spans_total[5m])

# Dropped spans (should be 0)
rate(otelcol_processor_dropped_spans_total[5m])
```

### Cortex Metrics
```promql
# Task completion rate
rate(cortex_task_completed_total[5m])

# LLM token usage
sum(rate(cortex_llm_tokens_total[5m])) by (model)

# Error rate by agent type
sum(rate(cortex_errors_total[5m])) by (agent_type)

# Worker spawn time
histogram_quantile(0.95, rate(cortex_worker_spawn_duration_seconds_bucket[5m]))
```

## Alerts

### Critical
- `OtelCollectorDown`: Collector unavailable
- `OtelCollectorDroppingData`: Data loss detected

### Warning
- `OtelCollectorHighMemory`: Memory > 85%
- `OtelCollectorHighCPU`: CPU > 80%
- `OtelCollectorExporterFailing`: Export failures
- `OtelCollectorQueueAlmostFull`: Queue > 90%

## Port Forwarding

### Prometheus
```bash
kubectl port-forward -n monitoring svc/prometheus-prometheus 9090:9090
# http://localhost:9090
```

### Grafana
```bash
kubectl port-forward -n monitoring svc/grafana 3000:80
# http://localhost:3000
```

### Jaeger (if deployed)
```bash
kubectl port-forward -n monitoring svc/jaeger-query 16686:16686
# http://localhost:16686
```

### OTel Collector (Zpages)
```bash
kubectl port-forward -n monitoring svc/otel-collector 55679:55679
# http://localhost:55679/debug/tracez
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No traces | Collector down | Check pod status |
| High memory | Too much buffering | Lower batch size |
| Missing context | Not propagated | Check propagators |
| Spans out of order | Clock skew | Enable NTP |
| High cardinality | Too many attributes | Add filters |

## File Locations

| File | Path |
|------|------|
| Collector Config | `otel-collector-config.yaml` |
| Deployment | `otel-collector-deployment.yaml` |
| Auto-Instrumentation | `otel-instrumentation.yaml` |
| TypeScript SDK | `cortex-tracing-config.ts` |
| ServiceMonitor | `servicemonitor-otel.yaml` |
| Deploy Script | `deploy-otel.sh` |
| Full Guide | `distributed-tracing-guide.md` |
| Architecture | `ARCHITECTURE.md` |

## Resources

- **Docs**: https://opentelemetry.io/docs/
- **Collector**: https://opentelemetry.io/docs/collector/
- **Instrumentation**: [distributed-tracing-guide.md](./distributed-tracing-guide.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Support Checklist

- [ ] Check collector status
- [ ] View collector logs
- [ ] Test health endpoint
- [ ] Verify ServiceMonitor
- [ ] Check Prometheus targets
- [ ] Review instrumentation annotations
- [ ] Test OTLP endpoint
- [ ] Check network policies
- [ ] Review configuration
- [ ] Consult documentation
