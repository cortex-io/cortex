/**
 * OpenTelemetry Tracing Configuration for Cortex
 *
 * This module sets up distributed tracing for Cortex agents and services.
 * It provides automatic instrumentation for HTTP, gRPC, and custom operations.
 *
 * Usage:
 *   import { initializeTracing, cortexTracer, createCortexSpan } from './cortex-tracing-config';
 *
 *   // Initialize at application startup
 *   initializeTracing('cortex-agent-executor');
 *
 *   // Use tracer for custom spans
 *   const span = cortexTracer.startSpan('process-task');
 *   // ... do work ...
 *   span.end();
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import type { Tracer, SpanOptions, Attributes } from '@opentelemetry/api';

// Configuration from environment variables or defaults
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://otel-collector.monitoring.svc.cluster.local:4318';

const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'cortex-service';
const OTEL_SERVICE_NAMESPACE = process.env.OTEL_SERVICE_NAMESPACE || 'cortex';
const OTEL_DEPLOYMENT_ENVIRONMENT = process.env.OTEL_DEPLOYMENT_ENVIRONMENT || 'production';

// Cortex-specific attributes
interface CortexSpanAttributes {
  'cortex.agent.id'?: string;
  'cortex.agent.type'?: string;
  'cortex.task.id'?: string;
  'cortex.worker.id'?: string;
  'cortex.master.id'?: string;
  'cortex.operation.type'?: string;
  'cortex.token.count'?: number;
  'cortex.model.name'?: string;
  [key: string]: any;
}

/**
 * Initialize OpenTelemetry SDK with Cortex-specific configuration
 */
export function initializeTracing(serviceName: string = OTEL_SERVICE_NAME): NodeSDK {
  // Create resource with service information
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: OTEL_SERVICE_NAMESPACE,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: OTEL_DEPLOYMENT_ENVIRONMENT,
    'cortex.system': true,
    'cortex.version': process.env.CORTEX_VERSION || '1.0.0',
  });

  // Configure trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Configure metrics exporter
  const metricExporter = new OTLPMetricExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Create SDK with all instrumentations
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    spanProcessor: new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 1000,
      maxExportBatchSize: 100,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    }),
    instrumentations: [
      new HttpInstrumentation({
        // Ignore health check endpoints
        ignoreIncomingRequestHook: (req) => {
          const ignorePaths = ['/health', '/healthz', '/readyz', '/livez'];
          return ignorePaths.some(path => req.url?.includes(path));
        },
        // Add custom attributes to HTTP spans
        requestHook: (span, request) => {
          span.setAttribute('http.client_ip', request.socket.remoteAddress || 'unknown');
        },
      }),
      new ExpressInstrumentation(),
      new GrpcInstrumentation({
        ignoreGrpcMethods: ['health.Health/Check', 'health.Health/Watch'],
      }),
      new MongoDBInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  // Start the SDK
  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });

  return sdk;
}

/**
 * Get the Cortex tracer instance
 */
export const cortexTracer: Tracer = trace.getTracer('cortex', '1.0.0');

/**
 * Create a new span with Cortex-specific attributes
 */
export function createCortexSpan(
  name: string,
  attributes: CortexSpanAttributes = {},
  options: SpanOptions = {}
): Span {
  const span = cortexTracer.startSpan(name, {
    ...options,
    attributes: {
      'cortex.system': true,
      ...attributes,
    },
  });

  return span;
}

/**
 * Execute a function within a traced span
 */
export async function traceOperation<T>(
  operationName: string,
  attributes: CortexSpanAttributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = createCortexSpan(operationName, attributes);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace a Cortex agent operation
 */
export async function traceAgentOperation<T>(
  agentId: string,
  agentType: string,
  operationType: string,
  taskId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return traceOperation(
    `agent.${operationType}`,
    {
      'cortex.agent.id': agentId,
      'cortex.agent.type': agentType,
      'cortex.task.id': taskId,
      'cortex.operation.type': operationType,
    },
    fn
  );
}

/**
 * Trace a Cortex worker operation
 */
export async function traceWorkerOperation<T>(
  workerId: string,
  workerType: string,
  operationType: string,
  taskId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return traceOperation(
    `worker.${operationType}`,
    {
      'cortex.worker.id': workerId,
      'cortex.agent.type': workerType,
      'cortex.task.id': taskId,
      'cortex.operation.type': operationType,
    },
    fn
  );
}

/**
 * Trace an LLM API call
 */
export async function traceLLMCall<T>(
  modelName: string,
  operationType: string,
  tokenCount: number | undefined,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return traceOperation(
    `llm.${operationType}`,
    {
      'cortex.model.name': modelName,
      'cortex.operation.type': operationType,
      ...(tokenCount !== undefined && { 'cortex.token.count': tokenCount }),
    },
    fn
  );
}

/**
 * Add Cortex context to the current span
 */
export function addCortexContext(attributes: CortexSpanAttributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined) {
        span.setAttribute(key, value);
      }
    });
  }
}

/**
 * Record a Cortex event
 */
export function recordCortexEvent(
  eventName: string,
  attributes: CortexSpanAttributes = {}
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(eventName, {
      'cortex.system': true,
      ...attributes,
    });
  }
}

/**
 * Example usage in a Cortex agent
 */
export async function exampleAgentExecution() {
  // Initialize tracing once at startup
  initializeTracing('cortex-agent-executor');

  // Trace an agent operation
  await traceAgentOperation(
    'agent-001',
    'development-master',
    'spawn-worker',
    'task-123',
    async (span) => {
      // Add custom context
      addCortexContext({
        'cortex.master.id': 'development-master',
        'cortex.worker.id': 'worker-456',
      });

      // Record events
      recordCortexEvent('worker.spawned', {
        'cortex.worker.type': 'feature-implementer',
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trace an LLM call within the operation
      await traceLLMCall(
        'claude-opus-4-5',
        'generate-code',
        1500,
        async (llmSpan) => {
          // Simulate LLM API call
          await new Promise(resolve => setTimeout(resolve, 50));

          llmSpan.setAttribute('llm.response.status', 'success');
          recordCortexEvent('llm.response.received', {
            'cortex.token.count': 1500,
          });
        }
      );

      recordCortexEvent('worker.completed', {
        'cortex.worker.status': 'success',
      });
    }
  );
}

// Export types for external use
export type { CortexSpanAttributes };
