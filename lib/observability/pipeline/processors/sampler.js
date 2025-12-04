// lib/observability/pipeline/processors/sampler.js
// Sampler Processor - samples events to reduce volume
// Weeks 3-4 Implementation
//
// Functionality:
// - Keep 100% of errors (critical for debugging)
// - Keep 10% of successful events (reduce volume)
// - Configurable sampling rates by event type
// - Smart sampling based on patterns
// - Rate-based sampling with moving window

const { Processor } = require('../base');
const crypto = require('crypto');

class SamplerProcessor extends Processor {
  constructor(config = {}) {
    super({
      name: config.name || 'SamplerProcessor',
      ...config
    });

    // Default sampling rates
    this.errorRate = config.errorRate !== undefined ? config.errorRate : 1.0; // 100% of errors
    this.successRate = config.successRate !== undefined ? config.successRate : 0.1; // 10% of successes
    this.defaultRate = config.defaultRate !== undefined ? config.defaultRate : 0.1; // 10% default

    // Per-type sampling rates (overrides defaults)
    this.typeRates = config.typeRates || {};

    // Sampling strategy: 'random', 'deterministic', 'adaptive'
    this.strategy = config.strategy || 'random';

    // For deterministic sampling
    this.deterministicKey = config.deterministicKey || 'id';

    // For adaptive sampling
    this.adaptiveWindow = config.adaptiveWindow || 60000; // 1 minute window
    this.adaptiveTargetRate = config.adaptiveTargetRate || 0.1;
    this.adaptiveCounts = new Map(); // Track counts per type

    // Stats
    this.samplerStats = {
      total_evaluated: 0,
      total_sampled: 0,
      total_dropped: 0,
      errors_kept: 0,
      success_kept: 0,
      by_type: {}
    };
  }

  async initialize() {
    // Validate strategy
    const validStrategies = ['random', 'deterministic', 'adaptive'];
    if (!validStrategies.includes(this.strategy)) {
      throw new Error(`Invalid sampling strategy: ${this.strategy}`);
    }

    // Validate rates
    this.validateRate(this.errorRate, 'errorRate');
    this.validateRate(this.successRate, 'successRate');
    this.validateRate(this.defaultRate, 'defaultRate');

    // Start adaptive sampling cleanup if needed
    if (this.strategy === 'adaptive') {
      this.startAdaptiveCleanup();
    }

    return true;
  }

  validateRate(rate, name) {
    if (rate < 0 || rate > 1) {
      throw new Error(`${name} must be between 0 and 1, got: ${rate}`);
    }
  }

  async process(event) {
    if (!event) return event;

    this.samplerStats.total_evaluated++;

    // Determine if we should keep this event
    const shouldSample = this.shouldSampleEvent(event);

    if (shouldSample) {
      this.samplerStats.total_sampled++;

      // Track by type
      const eventType = this.getEventType(event);
      if (!this.samplerStats.by_type[eventType]) {
        this.samplerStats.by_type[eventType] = { sampled: 0, dropped: 0 };
      }
      this.samplerStats.by_type[eventType].sampled++;

      // Add sampling metadata
      event._sampling = {
        sampled: true,
        rate: this.getSamplingRate(event),
        strategy: this.strategy,
        timestamp: new Date().toISOString()
      };

      return event;
    } else {
      this.samplerStats.total_dropped++;

      // Track by type
      const eventType = this.getEventType(event);
      if (!this.samplerStats.by_type[eventType]) {
        this.samplerStats.by_type[eventType] = { sampled: 0, dropped: 0 };
      }
      this.samplerStats.by_type[eventType].dropped++;

      return null; // Drop event
    }
  }

  shouldSampleEvent(event) {
    const rate = this.getSamplingRate(event);

    // Always keep if rate is 1.0
    if (rate >= 1.0) {
      if (this.isErrorEvent(event)) {
        this.samplerStats.errors_kept++;
      } else {
        this.samplerStats.success_kept++;
      }
      return true;
    }

    // Never keep if rate is 0.0
    if (rate <= 0.0) {
      return false;
    }

    // Apply sampling strategy
    switch (this.strategy) {
      case 'random':
        return this.randomSample(rate);

      case 'deterministic':
        return this.deterministicSample(event, rate);

      case 'adaptive':
        return this.adaptiveSample(event, rate);

      default:
        return this.randomSample(rate);
    }
  }

  getSamplingRate(event) {
    // Check if event is an error (highest priority)
    if (this.isErrorEvent(event)) {
      return this.errorRate;
    }

    // Check per-type rates
    const eventType = this.getEventType(event);
    if (this.typeRates[eventType] !== undefined) {
      return this.typeRates[eventType];
    }

    // Check if event is successful
    if (this.isSuccessEvent(event)) {
      return this.successRate;
    }

    // Default rate
    return this.defaultRate;
  }

  isErrorEvent(event) {
    // Check multiple indicators of error events
    if (event.error) return true;
    if (event.status === 'error' || event.status === 'failed') return true;

    const level = (event.level || event.severity || '').toLowerCase();
    if (level === 'error' || level === 'critical' || level === 'fatal') return true;

    const eventType = (event.type || event.event_type || '').toLowerCase();
    if (eventType.includes('error') || eventType.includes('fail')) return true;

    return false;
  }

  isSuccessEvent(event) {
    if (event.status === 'success' || event.status === 'completed') return true;

    const level = (event.level || event.severity || '').toLowerCase();
    if (level === 'info' || level === 'success') return true;

    return false;
  }

  getEventType(event) {
    return event.type || event.event_type || 'unknown';
  }

  // Random sampling: Simple probabilistic sampling
  randomSample(rate) {
    return Math.random() < rate;
  }

  // Deterministic sampling: Hash-based sampling for consistency
  deterministicSample(event, rate) {
    // Get deterministic key from event
    const key = event[this.deterministicKey] || event.id || JSON.stringify(event);

    // Hash the key
    const hash = crypto.createHash('md5').update(key).digest('hex');

    // Convert first 8 hex chars to number between 0 and 1
    const hashValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;

    return hashValue < rate;
  }

  // Adaptive sampling: Adjust sampling based on recent traffic
  adaptiveSample(event, baseRate) {
    const eventType = this.getEventType(event);
    const now = Date.now();

    // Get or create count tracker for this type
    if (!this.adaptiveCounts.has(eventType)) {
      this.adaptiveCounts.set(eventType, {
        count: 0,
        windowStart: now
      });
    }

    const tracker = this.adaptiveCounts.get(eventType);

    // Check if we need to reset the window
    if (now - tracker.windowStart > this.adaptiveWindow) {
      tracker.count = 0;
      tracker.windowStart = now;
    }

    // Increment count
    tracker.count++;

    // Calculate adaptive rate
    // If we're seeing high volume, reduce sampling rate
    const volume = tracker.count / ((now - tracker.windowStart) / 1000); // events per second
    const adaptiveRate = Math.min(baseRate, this.adaptiveTargetRate / Math.max(volume, 0.1));

    return this.randomSample(adaptiveRate);
  }

  startAdaptiveCleanup() {
    // Periodically clean up old adaptive tracking data
    this.adaptiveCleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [type, tracker] of this.adaptiveCounts.entries()) {
        if (now - tracker.windowStart > this.adaptiveWindow * 2) {
          this.adaptiveCounts.delete(type);
        }
      }
    }, this.adaptiveWindow);
  }

  async shutdown() {
    if (this.adaptiveCleanupInterval) {
      clearInterval(this.adaptiveCleanupInterval);
      this.adaptiveCleanupInterval = null;
    }

    await super.shutdown();
  }

  getHealth() {
    const total = this.samplerStats.total_evaluated;

    return {
      ...super.getHealth(),
      type: 'sampler',
      strategy: this.strategy,
      rates: {
        error: this.errorRate,
        success: this.successRate,
        default: this.defaultRate
      },
      stats: {
        ...this.samplerStats,
        sample_rate: total > 0 ? (this.samplerStats.total_sampled / total) : 0,
        drop_rate: total > 0 ? (this.samplerStats.total_dropped / total) : 0
      }
    };
  }

  getSamplerStats() {
    const total = this.samplerStats.total_evaluated;

    return {
      ...this.samplerStats,
      sample_rate: total > 0 ? (this.samplerStats.total_sampled / total) : 0,
      drop_rate: total > 0 ? (this.samplerStats.total_dropped / total) : 0,
      type_stats: this.samplerStats.by_type
    };
  }

  resetStats() {
    this.samplerStats = {
      total_evaluated: 0,
      total_sampled: 0,
      total_dropped: 0,
      errors_kept: 0,
      success_kept: 0,
      by_type: {}
    };
  }
}

module.exports = SamplerProcessor;
