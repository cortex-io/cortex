// lib/observability/pipeline/__tests__/pipeline.test.js
// Unit tests for Observability Pipeline

const { ObservabilityPipeline, Source, Processor, Destination } = require('../../lib/observability/pipeline/index');
const { PipelineConfigBuilder } = require('../../lib/observability/pipeline/config');
const fs = require('fs').promises;
const path = require('path');

// Mock components for testing
class MockSource extends Source {
  constructor(config = {}) {
    super({ name: 'MockSource', ...config });
    this.isStarted = false;
  }

  async initialize() {
    return true;
  }

  async start() {
    this.isStarted = true;
  }

  async stop() {
    this.isStarted = false;
  }

  // Manually emit events for testing
  emitTestEvent(event) {
    this.emitEvent(event);
  }
}

class MockProcessor extends Processor {
  constructor(config = {}) {
    super({ name: 'MockProcessor', ...config });
    this.processedCount = 0;
  }

  async initialize() {
    return true;
  }

  async process(event) {
    this.processedCount++;
    // Add processed flag
    return {
      ...event,
      _processed: true,
      _processor: this.name
    };
  }
}

class MockDestination extends Destination {
  constructor(config = {}) {
    super({ name: 'MockDestination', bufferSize: 1, ...config });
    this.receivedEvents = [];
  }

  async initialize() {
    return true;
  }

  async send(event) {
    this.receivedEvents.push(event);
  }
}

describe('ObservabilityPipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new ObservabilityPipeline();
  });

  afterEach(async () => {
    if (pipeline.running) {
      await pipeline.stop();
    }
  });

  describe('Component Management', () => {
    test('should add sources', () => {
      const source = new MockSource();
      pipeline.addSource(source);

      expect(pipeline.sources).toHaveLength(1);
      expect(pipeline.sources[0]).toBe(source);
    });

    test('should add processors', () => {
      const processor = new MockProcessor();
      pipeline.addProcessor(processor);

      expect(pipeline.processors).toHaveLength(1);
      expect(pipeline.processors[0]).toBe(processor);
    });

    test('should add destinations', () => {
      const destination = new MockDestination();
      pipeline.addDestination(destination);

      expect(pipeline.destinations).toHaveLength(1);
      expect(pipeline.destinations[0]).toBe(destination);
    });

    test('should throw error for invalid source', () => {
      expect(() => {
        pipeline.addSource({});
      }).toThrow('Invalid source');
    });

    test('should throw error for invalid processor', () => {
      expect(() => {
        pipeline.addProcessor({});
      }).toThrow('Invalid processor');
    });

    test('should throw error for invalid destination', () => {
      expect(() => {
        pipeline.addDestination({});
      }).toThrow('Invalid destination');
    });
  });

  describe('Pipeline Lifecycle', () => {
    test('should initialize all components', async () => {
      const source = new MockSource();
      const processor = new MockProcessor();
      const destination = new MockDestination();

      pipeline
        .addSource(source)
        .addProcessor(processor)
        .addDestination(destination);

      await pipeline.initialize();

      // Initialization should complete without error
      expect(pipeline.sources).toHaveLength(1);
      expect(pipeline.processors).toHaveLength(1);
      expect(pipeline.destinations).toHaveLength(1);
    });

    test('should start and stop pipeline', async () => {
      const source = new MockSource();
      pipeline.addSource(source);

      await pipeline.initialize();
      await pipeline.start();

      expect(pipeline.running).toBe(true);
      expect(source.isStarted).toBe(true);

      await pipeline.stop();

      expect(pipeline.running).toBe(false);
      expect(source.isStarted).toBe(false);
    });

    test('should not start if already running', async () => {
      const source = new MockSource();
      pipeline.addSource(source);

      await pipeline.initialize();
      await pipeline.start();

      const startedAt = pipeline.metrics.started_at;

      await pipeline.start(); // Second start

      expect(pipeline.metrics.started_at).toBe(startedAt);
    });
  });

  describe('Event Processing', () => {
    test('should process events through pipeline', async () => {
      const source = new MockSource();
      const processor = new MockProcessor();
      const destination = new MockDestination();

      pipeline
        .addSource(source)
        .addProcessor(processor)
        .addDestination(destination);

      await pipeline.initialize();
      await pipeline.start();

      // Emit test event
      const testEvent = { type: 'test', data: 'hello' };
      source.emitTestEvent(testEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processor.processedCount).toBe(1);
      expect(destination.receivedEvents).toHaveLength(1);
      expect(destination.receivedEvents[0]._processed).toBe(true);
    });

    test('should track event metrics', async () => {
      const source = new MockSource();
      const destination = new MockDestination();

      pipeline.addSource(source).addDestination(destination);

      await pipeline.initialize();
      await pipeline.start();

      // Emit multiple events
      source.emitTestEvent({ type: 'test1' });
      source.emitTestEvent({ type: 'test2' });
      source.emitTestEvent({ type: 'test3' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(pipeline.metrics.events_received).toBe(3);
      expect(pipeline.metrics.events_processed).toBe(3);
      expect(pipeline.metrics.events_delivered).toBe(3);
    });

    test('should drop events when processor returns null', async () => {
      const source = new MockSource();
      const dropProcessor = new (class extends Processor {
        async initialize() { return true; }
        async process(event) {
          // Drop all events
          return null;
        }
      })({ name: 'DropProcessor' });
      const destination = new MockDestination();

      pipeline
        .addSource(source)
        .addProcessor(dropProcessor)
        .addDestination(destination);

      await pipeline.initialize();
      await pipeline.start();

      source.emitTestEvent({ type: 'test' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(pipeline.metrics.events_received).toBe(1);
      expect(pipeline.metrics.events_dropped).toBe(1);
      expect(destination.receivedEvents).toHaveLength(0);
    });

    test('should send events to multiple destinations', async () => {
      const source = new MockSource();
      const dest1 = new MockDestination({ name: 'Dest1' });
      const dest2 = new MockDestination({ name: 'Dest2' });

      pipeline
        .addSource(source)
        .addDestination(dest1)
        .addDestination(dest2);

      await pipeline.initialize();
      await pipeline.start();

      source.emitTestEvent({ type: 'test' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(dest1.receivedEvents).toHaveLength(1);
      expect(dest2.receivedEvents).toHaveLength(1);
    });
  });

  describe('Health and Metrics', () => {
    test('should return health status', async () => {
      const source = new MockSource();
      const processor = new MockProcessor();
      const destination = new MockDestination();

      pipeline
        .addSource(source)
        .addProcessor(processor)
        .addDestination(destination);

      await pipeline.initialize();
      await pipeline.start();

      const health = pipeline.getHealth();

      expect(health.name).toBe('ObservabilityPipeline');
      expect(health.running).toBe(true);
      expect(health.components.sources).toHaveLength(1);
      expect(health.components.processors).toHaveLength(1);
      expect(health.components.destinations).toHaveLength(1);
    });

    test('should return metrics', async () => {
      const source = new MockSource();
      pipeline.addSource(source);

      await pipeline.initialize();
      await pipeline.start();

      const metrics = pipeline.getMetrics();

      expect(metrics).toHaveProperty('events_received');
      expect(metrics).toHaveProperty('events_processed');
      expect(metrics).toHaveProperty('events_dropped');
      expect(metrics).toHaveProperty('events_delivered');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('PipelineConfigBuilder', () => {
  test('should create default pipeline', () => {
    const pipeline = PipelineConfigBuilder.createDefaultPipeline();

    expect(pipeline).toBeInstanceOf(ObservabilityPipeline);
    expect(pipeline.sources.length).toBeGreaterThan(0);
    expect(pipeline.processors.length).toBeGreaterThan(0);
    expect(pipeline.destinations.length).toBeGreaterThan(0);
  });

  test('should create debug pipeline', () => {
    const pipeline = PipelineConfigBuilder.createDebugPipeline();

    expect(pipeline).toBeInstanceOf(ObservabilityPipeline);
    expect(pipeline.destinations.length).toBeGreaterThan(0);
  });

  test('should build from JSON config', () => {
    const config = {
      sources: [
        {
          type: 'event-stream',
          config: {
            name: 'TestEvents',
            eventsDir: 'coordination/events',
            eventTypes: ['test']
          }
        }
      ],
      processors: [
        {
          type: 'passthrough',
          config: { name: 'TestProcessor' }
        }
      ],
      destinations: [
        {
          type: 'console',
          config: { name: 'TestConsole' }
        }
      ]
    };

    const pipeline = PipelineConfigBuilder.fromJSON(config);

    expect(pipeline).toBeInstanceOf(ObservabilityPipeline);
    expect(pipeline.sources).toHaveLength(1);
    expect(pipeline.processors).toHaveLength(1);
    expect(pipeline.destinations).toHaveLength(1);
  });

  test('should throw error for unknown source type', () => {
    expect(() => {
      new PipelineConfigBuilder()
        .addSource('unknown-type', {})
        .build();
    }).toThrow('Unknown source type');
  });

  test('should throw error for unknown processor type', () => {
    expect(() => {
      new PipelineConfigBuilder()
        .addProcessor('unknown-type', {})
        .build();
    }).toThrow('Unknown processor type');
  });

  test('should throw error for unknown destination type', () => {
    expect(() => {
      new PipelineConfigBuilder()
        .addDestination('unknown-type', {})
        .build();
    }).toThrow('Unknown destination type');
  });
});
