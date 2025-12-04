// testing/unit/observability-destinations.test.js
// Unit tests for Observability Pipeline Destinations (Weeks 5-6)
//
// Note: These tests focus on core logic (partitioning, formatting, authentication)
// without requiring external dependencies (pg, @aws-sdk/client-s3) to be installed.
// Integration tests with actual databases/services should be run separately.

// Mock global fetch for webhook tests
global.fetch = jest.fn();

const PostgreSQLDestination = require('../../lib/observability/pipeline/destinations/postgresql');
const S3Destination = require('../../lib/observability/pipeline/destinations/s3');
const WebhookDestination = require('../../lib/observability/pipeline/destinations/webhook');

describe('PostgreSQLDestination', () => {
  test('should create destination with default configuration', () => {
    const destination = new PostgreSQLDestination({
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });

    expect(destination.name).toBe('PostgreSQLDestination');
    expect(destination.connectionConfig.database).toBe('test_db');
    expect(destination.tableName).toBe('events');
  });

  test('should extract row data from event', () => {
    const destination = new PostgreSQLDestination({
      user: 'test',
      password: 'test'
    });

    const event = {
      id: 'event-123',
      type: 'test_event',
      level: 'info',
      timestamp: '2025-01-01T00:00:00.000Z',
      error: 'Test error',
      duration_ms: 1500,
      cost_estimate: { total_cost_usd: 0.005 },
      master_type: 'development',
      worker_type: 'implementation',
      data: { key: 'value' }
    };

    const row = destination.extractRowData(event);

    expect(row.event_id).toBe('event-123');
    expect(row.event_type).toBe('test_event');
    expect(row.event_level).toBe('info');
    expect(row.timestamp).toBe('2025-01-01T00:00:00.000Z');
    expect(row.error).toBe('Test error');
    expect(row.duration_ms).toBe(1500);
    expect(row.cost_usd).toBe(0.005);
    expect(row.master_type).toBe('development');
    expect(row.worker_type).toBe('implementation');
    expect(row.data).toBeDefined();
    expect(typeof row.data).toBe('string');
  });

  test('should extract row data with defaults for missing fields', () => {
    const destination = new PostgreSQLDestination({
      user: 'test',
      password: 'test'
    });

    const event = {
      type: 'simple_event',
      message: 'Hello'
    };

    const row = destination.extractRowData(event);

    expect(row.event_type).toBe('simple_event');
    expect(row.event_level).toBe('info'); // default
    expect(row.event_id).toBeNull();
    expect(row.error).toBeNull();
    expect(row.duration_ms).toBeNull();
    expect(row.cost_usd).toBeNull();
  });

  test('should get destination stats', () => {
    const destination = new PostgreSQLDestination({
      user: 'test',
      password: 'test'
    });

    destination.destinationStats.total_events_written = 100;
    destination.destinationStats.total_batches_written = 10;

    const stats = destination.getDestinationStats();
    expect(stats.total_events_written).toBe(100);
    expect(stats.total_batches_written).toBe(10);
  });

  test('should return health status', () => {
    const destination = new PostgreSQLDestination({
      user: 'test',
      password: 'test',
      database: 'test_db',
      host: 'localhost',
      port: 5432,
      tableName: 'custom_events'
    });

    const health = destination.getHealth();

    expect(health.database).toBe('test_db');
    expect(health.host).toBe('localhost');
    expect(health.port).toBe(5432);
    expect(health.tableName).toBe('public.custom_events');
  });
});

describe('S3Destination', () => {
  test('should create destination with default configuration', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      region: 'us-east-1'
    });

    expect(destination.name).toBe('S3Destination');
    expect(destination.bucket).toBe('test-bucket');
    expect(destination.region).toBe('us-east-1');
    expect(destination.compression).toBe(true);
    expect(destination.partitioning).toBe(true);
  });

  test('should partition events by date (year/month/day format)', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      partitioning: true,
      partitionFormat: 'year/month/day'
    });

    const event = {
      timestamp: '2025-01-15T10:30:00.000Z',
      type: 'test'
    };

    const partition = destination.getPartitionKey(event);

    expect(partition).toBe('year=2025/month=01/day=15');
  });

  test('should partition events by date (year-month-day format)', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      partitioning: true,
      partitionFormat: 'year-month-day'
    });

    const event = {
      timestamp: '2025-01-15T10:30:00.000Z',
      type: 'test'
    };

    const partition = destination.getPartitionKey(event);

    expect(partition).toBe('2025-01-15');
  });

  test('should partition events by date with hour', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      partitioning: true,
      partitionFormat: 'year/month/day/hour'
    });

    const event = {
      timestamp: '2025-01-15T10:30:00.000Z',
      type: 'test'
    };

    const partition = destination.getPartitionKey(event);

    expect(partition).toBe('year=2025/month=01/day=15/hour=10');
  });

  test('should group events by partition', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      partitioning: true,
      partitionFormat: 'year-month-day'
    });

    const events = [
      { timestamp: '2025-01-15T10:00:00.000Z', type: 'test1' },
      { timestamp: '2025-01-15T11:00:00.000Z', type: 'test2' },
      { timestamp: '2025-01-16T10:00:00.000Z', type: 'test3' }
    ];

    const partitioned = destination.partitionEvents(events);

    expect(Object.keys(partitioned).length).toBe(2); // 2 different days
    expect(partitioned['2025-01-15'].length).toBe(2);
    expect(partitioned['2025-01-16'].length).toBe(1);
  });

  test('should not partition when partitioning is disabled', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      partitioning: false
    });

    const events = [
      { timestamp: '2025-01-15T10:00:00.000Z', type: 'test1' },
      { timestamp: '2025-01-16T10:00:00.000Z', type: 'test2' }
    ];

    const partitioned = destination.partitionEvents(events);

    expect(Object.keys(partitioned).length).toBe(1);
    expect(partitioned['default']).toBeDefined();
    expect(partitioned['default'].length).toBe(2);
  });

  test('should track destination stats', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket'
    });

    // Manually update stats for testing
    destination.destinationStats.total_events_uploaded = 100;
    destination.destinationStats.total_batches_uploaded = 10;
    destination.destinationStats.total_bytes_uploaded = 50000;

    const stats = destination.getDestinationStats();

    expect(stats.total_events_uploaded).toBe(100);
    expect(stats.average_batch_size).toBe(10);
    expect(stats.average_upload_size_bytes).toBe(5000);
  });

  test('should return health status', () => {
    const destination = new S3Destination({
      bucket: 'test-bucket',
      region: 'us-west-2',
      prefix: 'logs',
      compression: true,
      storageClass: 'GLACIER'
    });

    const health = destination.getHealth();

    expect(health.bucket).toBe('test-bucket');
    expect(health.region).toBe('us-west-2');
    expect(health.prefix).toBe('logs');
    expect(health.compression).toBe(true);
    expect(health.storageClass).toBe('GLACIER');
  });
});

describe('WebhookDestination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
  });

  test('should create destination with default configuration', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook'
    });

    expect(destination.name).toBe('WebhookDestination');
    expect(destination.url).toBe('https://example.com/webhook');
    expect(destination.method).toBe('POST');
    expect(destination.payloadFormat).toBe('array');
  });

  test('should format payload as array', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      payloadFormat: 'array'
    });

    const events = [
      { type: 'test1', message: 'Event 1' },
      { type: 'test2', message: 'Event 2' }
    ];

    const payload = destination.formatPayload(events);

    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(2);
    expect(payload[0].type).toBe('test1');
  });

  test('should format payload as object with metadata', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      payloadFormat: 'object',
      payloadKey: 'events',
      includeMetadata: true
    });

    const events = [
      { type: 'test1' },
      { type: 'test2' }
    ];

    const payload = destination.formatPayload(events);

    expect(payload.events).toBeDefined();
    expect(payload.events.length).toBe(2);
    expect(payload.metadata).toBeDefined();
    expect(payload.metadata.count).toBe(2);
    expect(payload.metadata.destination).toBe('WebhookDestination');
  });

  test('should format payload as individual event', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      payloadFormat: 'individual'
    });

    const events = [
      { type: 'test1', message: 'Single event' }
    ];

    const payload = destination.formatPayload(events);

    expect(payload.type).toBe('test1');
    expect(payload.message).toBe('Single event');
  });

  test('should generate HMAC signature', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      hmacSecret: 'test-secret',
      hmacAlgorithm: 'sha256'
    });

    const payload = JSON.stringify({ test: 'data' });
    const signature = destination.generateHmacSignature(payload);

    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64); // SHA-256 hex is 64 chars
  });

  test('should generate consistent HMAC signatures', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      hmacSecret: 'test-secret',
      hmacAlgorithm: 'sha256'
    });

    const payload = JSON.stringify({ test: 'data' });
    const signature1 = destination.generateHmacSignature(payload);
    const signature2 = destination.generateHmacSignature(payload);

    expect(signature1).toBe(signature2);
  });

  test('should add bearer authentication', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      authType: 'bearer',
      authToken: 'test-token-123'
    });

    const headers = {};
    destination.addAuthentication(headers, {});

    expect(headers.Authorization).toBe('Bearer test-token-123');
  });

  test('should add basic authentication', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      authType: 'basic',
      username: 'testuser',
      password: 'testpass'
    });

    const headers = {};
    destination.addAuthentication(headers, {});

    expect(headers.Authorization).toBeDefined();
    expect(headers.Authorization).toContain('Basic ');
  });

  test('should add API key authentication', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      authType: 'api-key',
      apiKey: 'test-api-key',
      apiKeyHeader: 'X-API-Key'
    });

    const headers = {};
    destination.addAuthentication(headers, {});

    expect(headers['X-API-Key']).toBe('test-api-key');
  });

  test('should check rate limit', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      rateLimit: 10 // 10 requests per second
    });

    // Should allow first 10 requests
    for (let i = 0; i < 10; i++) {
      expect(destination.checkRateLimit()).toBe(true);
      destination.requestCount++;
    }

    // Should block 11th request
    expect(destination.checkRateLimit()).toBe(false);
  });

  test('should track destination stats', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook'
    });

    destination.destinationStats.total_events_sent = 20;
    destination.destinationStats.total_requests_sent = 10;
    destination.destinationStats.total_requests_succeeded = 9;
    destination.destinationStats.total_requests_failed = 1;

    const stats = destination.getDestinationStats();

    expect(stats.total_events_sent).toBe(20);
    expect(stats.total_requests_sent).toBe(10);
    expect(stats.success_rate).toBeCloseTo(0.9, 2);
    expect(stats.failure_rate).toBeCloseTo(0.1, 2);
    expect(stats.average_events_per_request).toBe(2);
  });

  test('should return health status', () => {
    const destination = new WebhookDestination({
      url: 'https://example.com/webhook',
      method: 'PUT',
      authType: 'bearer',
      payloadFormat: 'object',
      rateLimit: 100,
      maxRetries: 5
    });

    const health = destination.getHealth();

    expect(health.url).toBe('https://example.com/webhook');
    expect(health.method).toBe('PUT');
    expect(health.authType).toBe('bearer');
    expect(health.payloadFormat).toBe('object');
    expect(health.rateLimit).toBe(100);
    expect(health.maxRetries).toBe(5);
  });
});
