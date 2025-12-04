// lib/observability/pipeline/base.js
// Base classes for Observability Pipeline
// Inspired by Datadog Observability Pipelines architecture
//
// Architecture: Sources → Processors → Destinations
// - Sources: Where events come from (masters, workers, events)
// - Processors: Transform/filter/enrich events (PII, sampling, etc.)
// - Destinations: Where events go (JSONL, PostgreSQL, S3, webhooks)

const EventEmitter = require('events');

/**
 * Base class for all pipeline components
 */
class PipelineComponent extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.name = config.name || this.constructor.name;
    this.enabled = config.enabled !== false;
    this.metrics = {
      events_processed: 0,
      events_failed: 0,
      last_processed_at: null,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Initialize the component
   * @returns {Promise<boolean>}
   */
  async initialize() {
    throw new Error(`${this.name}.initialize() must be implemented`);
  }

  /**
   * Shutdown the component gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.emit('shutdown');
  }

  /**
   * Get component health status
   * @returns {Object}
   */
  getHealth() {
    return {
      name: this.name,
      enabled: this.enabled,
      metrics: this.metrics,
      status: 'healthy'
    };
  }

  /**
   * Record successful processing
   */
  _recordSuccess() {
    this.metrics.events_processed++;
    this.metrics.last_processed_at = new Date().toISOString();
  }

  /**
   * Record failed processing
   */
  _recordFailure() {
    this.metrics.events_failed++;
  }
}

/**
 * Base class for data sources
 * Sources emit events into the pipeline
 */
class Source extends PipelineComponent {
  constructor(config = {}) {
    super(config);
    this.type = 'source';
  }

  /**
   * Start collecting events from the source
   * @returns {Promise<void>}
   */
  async start() {
    throw new Error(`${this.name}.start() must be implemented`);
  }

  /**
   * Stop collecting events
   * @returns {Promise<void>}
   */
  async stop() {
    throw new Error(`${this.name}.stop() must be implemented`);
  }

  /**
   * Emit an event to the pipeline
   * @param {Object} event
   */
  emitEvent(event) {
    if (!this.enabled) return;

    try {
      // Add source metadata
      const enrichedEvent = {
        ...event,
        _source: {
          name: this.name,
          type: this.type,
          timestamp: new Date().toISOString()
        }
      };

      this.emit('event', enrichedEvent);
      this._recordSuccess();
    } catch (error) {
      this._recordFailure();
      this.emit('error', error);
    }
  }
}

/**
 * Base class for processors
 * Processors transform, filter, or enrich events
 */
class Processor extends PipelineComponent {
  constructor(config = {}) {
    super(config);
    this.type = 'processor';
  }

  /**
   * Process an event
   * @param {Object} event - The event to process
   * @returns {Promise<Object|null>} - Processed event or null to drop
   */
  async process(event) {
    throw new Error(`${this.name}.process() must be implemented`);
  }

  /**
   * Wrapper for processing with metrics
   * @param {Object} event
   * @returns {Promise<Object|null>}
   */
  async processWithMetrics(event) {
    if (!this.enabled) return event;

    try {
      const result = await this.process(event);
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure();
      this.emit('error', { processor: this.name, event, error });

      // By default, pass through on error (can be configured)
      if (this.config.dropOnError) {
        return null;
      }
      return event;
    }
  }
}

/**
 * Base class for destinations
 * Destinations receive processed events and store/forward them
 */
class Destination extends PipelineComponent {
  constructor(config = {}) {
    super(config);
    this.type = 'destination';
    this.buffer = [];
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushInterval || 5000; // 5 seconds
    this.flushTimer = null;
  }

  /**
   * Send an event to the destination
   * @param {Object} event - The event to send
   * @returns {Promise<void>}
   */
  async send(event) {
    throw new Error(`${this.name}.send() must be implemented`);
  }

  /**
   * Write buffered events to destination (batch operation)
   * @param {Array} events - Array of events
   * @returns {Promise<void>}
   */
  async sendBatch(events) {
    // Default: send individually
    for (const event of events) {
      await this.send(event);
    }
  }

  /**
   * Add event to buffer
   * @param {Object} event
   * @returns {Promise<void>}
   */
  async write(event) {
    if (!this.enabled) return;

    try {
      // Add destination metadata
      const enrichedEvent = {
        ...event,
        _destination: {
          name: this.name,
          type: this.type,
          timestamp: new Date().toISOString()
        }
      };

      this.buffer.push(enrichedEvent);

      // Flush if buffer is full
      if (this.buffer.length >= this.bufferSize) {
        await this.flush();
      }

      this._recordSuccess();
    } catch (error) {
      this._recordFailure();
      this.emit('error', { destination: this.name, event, error });
    }
  }

  /**
   * Flush buffer to destination
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const eventsToSend = [...this.buffer];
    this.buffer = [];

    try {
      await this.sendBatch(eventsToSend);
      this.emit('flush', { count: eventsToSend.length });
    } catch (error) {
      this.emit('error', { destination: this.name, error, eventCount: eventsToSend.length });

      // Re-add to buffer if configured
      if (this.config.retryOnError) {
        this.buffer.unshift(...eventsToSend);
      }
    }
  }

  /**
   * Start automatic flushing
   */
  startAutoFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop automatic flushing
   */
  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Shutdown with final flush
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.stopAutoFlush();
    await this.flush();
    await super.shutdown();
  }
}

module.exports = {
  PipelineComponent,
  Source,
  Processor,
  Destination
};
