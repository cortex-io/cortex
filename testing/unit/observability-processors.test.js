// testing/unit/observability-processors.test.js
// Unit tests for Observability Pipeline Processors (Weeks 3-4)

const { EnricherProcessor, FilterProcessor, SamplerProcessor, PIIRedactorProcessor } = require('../../lib/observability/pipeline/processors');

describe('EnricherProcessor', () => {
  test('should enrich event with timestamp', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['timestamp']
    });

    await processor.initialize();

    const event = { type: 'test', data: 'hello' };
    const enriched = await processor.process(event);

    expect(enriched.timestamp).toBeDefined();
    expect(enriched._enrichment).toBeDefined();
    expect(enriched._enrichment.enrichments_applied).toContain('timestamp');
  });

  test('should enrich event with hostname', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['hostname']
    });

    await processor.initialize();

    const event = { type: 'test' };
    const enriched = await processor.process(event);

    expect(enriched.hostname).toBeDefined();
    expect(enriched.platform).toBeDefined();
    expect(enriched._enrichment.enrichments_applied).toContain('hostname');
  });

  test('should enrich event with process info', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['process']
    });

    await processor.initialize();

    const event = { type: 'test' };
    const enriched = await processor.process(event);

    expect(enriched.process_id).toBeDefined();
    expect(enriched.memory_usage).toBeDefined();
    expect(enriched.memory_usage.heap_used).toBeDefined();
  });

  test('should calculate duration from start/end times', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['performance']
    });

    await processor.initialize();

    const event = {
      type: 'test',
      started_at: '2025-01-01T00:00:00.000Z',
      completed_at: '2025-01-01T00:00:05.000Z'
    };

    const enriched = await processor.process(event);

    expect(enriched.duration_ms).toBe(5000);
  });

  test('should estimate cost from token usage', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['performance']
    });

    await processor.initialize();

    const event = {
      type: 'test',
      tokens_used: {
        input_tokens: 1000,
        output_tokens: 500
      }
    };

    const enriched = await processor.process(event);

    expect(enriched.cost_estimate).toBeDefined();
    expect(enriched.cost_estimate.total_cost_usd).toBeGreaterThan(0);
  });

  test('should track enrichment stats', async () => {
    const processor = new EnricherProcessor({
      enrichments: ['timestamp', 'hostname']
    });

    await processor.initialize();

    await processor.process({ type: 'test1' });
    await processor.process({ type: 'test2' });

    const stats = processor.getEnrichmentStats();
    expect(stats.total_enrichments).toBeGreaterThan(0);
  });
});

describe('FilterProcessor', () => {
  test('should pass through events by default', async () => {
    const processor = new FilterProcessor();

    await processor.initialize();

    const event = { type: 'test', data: 'hello' };
    const result = await processor.process(event);

    expect(result).not.toBeNull();
    expect(result.type).toBe('test');
  });

  test('should drop low-value events', async () => {
    const processor = new FilterProcessor({
      dropLowValue: true
    });

    await processor.initialize();

    const heartbeat = { type: 'heartbeat', data: 'ping' };
    const result = await processor.process(heartbeat);

    expect(result).toBeNull();
  });

  test('should drop events by level', async () => {
    const processor = new FilterProcessor({
      dropLevels: ['debug', 'trace'],
      dropLowValue: false // Disable default low-value filtering
    });

    await processor.initialize();

    const debugEvent = { type: 'test', level: 'debug', message: 'debug info' };
    const errorEvent = { type: 'test', level: 'error', message: 'error info' };

    const debugResult = await processor.process(debugEvent);
    const errorResult = await processor.process(errorEvent);

    expect(debugResult).toBeNull();
    expect(errorResult).not.toBeNull();
  });

  test('should drop events by type', async () => {
    const processor = new FilterProcessor({
      dropEventTypes: ['heartbeat', 'ping'],
      dropLowValue: false // Disable default low-value filtering
    });

    await processor.initialize();

    const heartbeat = { type: 'heartbeat', message: 'test' };
    const error = { type: 'error', message: 'test error' };

    const heartbeatResult = await processor.process(heartbeat);
    const errorResult = await processor.process(error);

    expect(heartbeatResult).toBeNull();
    expect(errorResult).not.toBeNull();
  });

  test('should respect keep patterns over drop patterns', async () => {
    const processor = new FilterProcessor({
      dropEventTypes: ['test'],
      keepEventTypes: ['test']
    });

    await processor.initialize();

    const event = { type: 'test' };
    const result = await processor.process(event);

    expect(result).not.toBeNull();
  });

  test('should drop events matching regex pattern', async () => {
    const processor = new FilterProcessor({
      dropPatterns: ['secret', 'confidential']
    });

    await processor.initialize();

    const secretEvent = { type: 'test', message: 'This is secret data' };
    const publicEvent = { type: 'test', message: 'This is public data' };

    const secretResult = await processor.process(secretEvent);
    const publicResult = await processor.process(publicEvent);

    expect(secretResult).toBeNull();
    expect(publicResult).not.toBeNull();
  });

  test('should track filter stats', async () => {
    const processor = new FilterProcessor({
      dropLowValue: true
    });

    await processor.initialize();

    await processor.process({ type: 'heartbeat' }); // Dropped (low-value)
    await processor.process({ type: 'test', level: 'error', message: 'error' }); // Kept (error with content)

    const stats = processor.getFilterStats();
    expect(stats.total_evaluated).toBe(2);
    expect(stats.total_dropped).toBe(1);
    expect(stats.total_kept).toBe(1);
  });
});

describe('SamplerProcessor', () => {
  test('should keep 100% of errors', async () => {
    const processor = new SamplerProcessor({
      errorRate: 1.0,
      successRate: 0.0
    });

    await processor.initialize();

    const errorEvent = { type: 'test', error: 'Something went wrong' };
    const result = await processor.process(errorEvent);

    expect(result).not.toBeNull();
    expect(result._sampling).toBeDefined();
    expect(result._sampling.rate).toBe(1.0);
  });

  test('should sample success events at configured rate', async () => {
    const processor = new SamplerProcessor({
      successRate: 0.0 // Drop all successes for testing
    });

    await processor.initialize();

    const successEvent = { type: 'test', status: 'success' };
    const result = await processor.process(successEvent);

    expect(result).toBeNull();
  });

  test('should detect error events correctly', async () => {
    const processor = new SamplerProcessor({
      errorRate: 1.0,
      successRate: 0.0
    });

    await processor.initialize();

    const errorEvent1 = { type: 'test', error: 'failed' };
    const errorEvent2 = { type: 'test', status: 'error' };
    const errorEvent3 = { type: 'test', level: 'error' };

    expect(await processor.process(errorEvent1)).not.toBeNull();
    expect(await processor.process(errorEvent2)).not.toBeNull();
    expect(await processor.process(errorEvent3)).not.toBeNull();
  });

  test('should support per-type sampling rates', async () => {
    const processor = new SamplerProcessor({
      defaultRate: 0.0,
      typeRates: {
        'important': 1.0
      }
    });

    await processor.initialize();

    const importantEvent = { type: 'important', data: 'test' };
    const unimportantEvent = { type: 'unimportant', data: 'test' };

    expect(await processor.process(importantEvent)).not.toBeNull();
    expect(await processor.process(unimportantEvent)).toBeNull();
  });

  test('should use deterministic sampling with same key', async () => {
    const processor = new SamplerProcessor({
      strategy: 'deterministic',
      successRate: 0.5,
      deterministicKey: 'id'
    });

    await processor.initialize();

    const event1 = { type: 'test', id: 'same-id', status: 'success' };
    const event2 = { type: 'test', id: 'same-id', status: 'success' };

    const result1 = await processor.process(event1);
    const result2 = await processor.process(event2);

    // Should have same result (both sampled or both dropped)
    expect((result1 === null) === (result2 === null)).toBe(true);
  });

  test('should track sampler stats', async () => {
    const processor = new SamplerProcessor({
      errorRate: 1.0,
      successRate: 0.0
    });

    await processor.initialize();

    await processor.process({ type: 'test', error: 'failed' }); // Kept
    await processor.process({ type: 'test', status: 'success' }); // Dropped

    const stats = processor.getSamplerStats();
    expect(stats.total_evaluated).toBe(2);
    expect(stats.total_sampled).toBe(1);
    expect(stats.total_dropped).toBe(1);
    expect(stats.errors_kept).toBe(1);
  });
});

describe('PIIRedactorProcessor', () => {
  test('should redact email addresses', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'mask'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      message: 'Contact me at user@example.com for details'
    };

    const redacted = await processor.process(event);

    expect(redacted.message).not.toContain('user@example.com');
    expect(redacted.message).toContain('@example.com');
    expect(redacted._redaction).toBeDefined();
    expect(redacted._redaction.redacted).toBe(true);
  });

  test('should redact phone numbers', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'mask'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      message: 'Call me at 555-123-4567'
    };

    const redacted = await processor.process(event);

    expect(redacted.message).not.toContain('555-123-4567');
    expect(redacted.message).toContain('*');
  });

  test('should redact SSN', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'remove'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      ssn: '123-45-6789'
    };

    const redacted = await processor.process(event);

    expect(redacted.ssn).toBe('[REDACTED]');
  });

  test('should hash PII in hash mode', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'hash'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      email: 'test@example.com'
    };

    const redacted = await processor.process(event);

    expect(redacted.email).toContain('[REDACTED:');
    expect(redacted.email).not.toContain('test@example.com');
  });

  test('should skip configured fields', async () => {
    const processor = new PIIRedactorProcessor({
      fieldsToSkip: ['_id', 'timestamp', 'type', 'safe'] // Skip fields containing 'safe'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      safe_email: 'test@example.com',
      user_email: 'test@example.com'
    };

    const redacted = await processor.process(event);

    expect(redacted.safe_email).toBe('test@example.com'); // Not redacted (has 'safe')
    expect(redacted.user_email).not.toBe('test@example.com'); // Redacted
  });

  test('should detect API keys', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'remove'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      config: 'sk-abcdefghijklmnopqrstuvwxyz123456'
    };

    const redacted = await processor.process(event);

    expect(redacted.config).toContain('[REDACTED]');
  });

  test('should handle nested objects', async () => {
    const processor = new PIIRedactorProcessor({
      redactionMode: 'mask'
    });

    await processor.initialize();

    const event = {
      type: 'test',
      user: {
        name: 'John',
        contact: {
          email: 'john@example.com'
        }
      }
    };

    const redacted = await processor.process(event);

    expect(redacted.user.contact.email).not.toBe('john@example.com');
  });

  test('should track redaction stats', async () => {
    const processor = new PIIRedactorProcessor();

    await processor.initialize();

    await processor.process({ type: 'test', email: 'test@example.com' });
    await processor.process({ type: 'test', data: 'no PII here' });

    const stats = processor.getRedactionStats();
    expect(stats.total_events_scanned).toBe(2);
    expect(stats.total_events_redacted).toBe(1);
    expect(stats.by_type.email).toBe(1);
  });
});
