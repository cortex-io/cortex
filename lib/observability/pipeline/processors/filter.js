// lib/observability/pipeline/processors/filter.js
// Filter Processor - filters out unwanted events
// Weeks 3-4 Implementation
//
// Functionality:
// - Drop low-value events (heartbeats, health checks)
// - Filter by event type, level, source
// - Custom filter rules (allowlist/blocklist)
// - Pattern matching (regex support)
// - Conditional filtering

const { Processor } = require('../base');

class FilterProcessor extends Processor {
  constructor(config = {}) {
    super({
      name: config.name || 'FilterProcessor',
      ...config
    });

    // Drop patterns (events matching these will be dropped)
    this.dropPatterns = config.dropPatterns || [];

    // Keep patterns (events matching these will be kept, overrides drop)
    this.keepPatterns = config.keepPatterns || [];

    // Drop by event level
    this.dropLevels = config.dropLevels || [];

    // Drop by event type
    this.dropEventTypes = config.dropEventTypes || [];

    // Keep by event type (overrides drop)
    this.keepEventTypes = config.keepEventTypes || [];

    // Drop low-value events (default: true)
    this.dropLowValue = config.dropLowValue !== false;

    // Custom filter function
    this.customFilter = config.customFilter || null;

    // Filter mode: 'allowlist' or 'blocklist'
    this.filterMode = config.filterMode || 'blocklist';

    // Stats
    this.filterStats = {
      total_evaluated: 0,
      total_dropped: 0,
      total_kept: 0,
      dropped_by_pattern: 0,
      dropped_by_level: 0,
      dropped_by_type: 0,
      dropped_by_low_value: 0,
      dropped_by_custom: 0
    };

    // Compile regex patterns for performance
    this.compiledDropPatterns = this.compilePatterns(this.dropPatterns);
    this.compiledKeepPatterns = this.compilePatterns(this.keepPatterns);
  }

  compilePatterns(patterns) {
    return patterns.map(pattern => {
      if (pattern instanceof RegExp) {
        return pattern;
      }
      try {
        // Try to create regex from string
        return new RegExp(pattern, 'i'); // Case insensitive
      } catch (error) {
        console.warn(`Invalid regex pattern: ${pattern}`);
        return null;
      }
    }).filter(p => p !== null);
  }

  async initialize() {
    // Validate configuration
    if (this.filterMode !== 'allowlist' && this.filterMode !== 'blocklist') {
      throw new Error(`Invalid filterMode: ${this.filterMode}. Must be 'allowlist' or 'blocklist'`);
    }

    // Log filter configuration
    if (this.dropLowValue) {
      console.log(`${this.name}: Low-value event filtering enabled`);
    }

    return true;
  }

  async process(event) {
    if (!event) return null; // Drop null events

    this.filterStats.total_evaluated++;

    // Check keep patterns first (highest priority)
    if (this.matchesKeepPatterns(event)) {
      this.filterStats.total_kept++;
      return event;
    }

    // Check custom filter
    if (this.customFilter && typeof this.customFilter === 'function') {
      try {
        const shouldKeep = await this.customFilter(event);
        if (!shouldKeep) {
          this.filterStats.total_dropped++;
          this.filterStats.dropped_by_custom++;
          return null; // Drop event
        }
      } catch (error) {
        this.emit('error', { filter: 'custom', event, error });
        // On error, pass through
      }
    }

    // Check drop patterns
    if (this.matchesDropPatterns(event)) {
      this.filterStats.total_dropped++;
      this.filterStats.dropped_by_pattern++;
      return null; // Drop event
    }

    // Check drop levels
    if (this.shouldDropByLevel(event)) {
      this.filterStats.total_dropped++;
      this.filterStats.dropped_by_level++;
      return null; // Drop event
    }

    // Check drop event types
    if (this.shouldDropByType(event)) {
      this.filterStats.total_dropped++;
      this.filterStats.dropped_by_type++;
      return null; // Drop event
    }

    // Check low-value events
    if (this.dropLowValue && this.isLowValueEvent(event)) {
      this.filterStats.total_dropped++;
      this.filterStats.dropped_by_low_value++;
      return null; // Drop event
    }

    // Keep event
    this.filterStats.total_kept++;
    return event;
  }

  matchesKeepPatterns(event) {
    if (this.keepEventTypes.length > 0 && event.type) {
      if (this.keepEventTypes.includes(event.type)) {
        return true;
      }
    }

    if (this.compiledKeepPatterns.length === 0) {
      return false;
    }

    const eventString = JSON.stringify(event);

    for (const pattern of this.compiledKeepPatterns) {
      if (pattern.test(eventString)) {
        return true;
      }
    }

    return false;
  }

  matchesDropPatterns(event) {
    if (this.compiledDropPatterns.length === 0) {
      return false;
    }

    const eventString = JSON.stringify(event);

    for (const pattern of this.compiledDropPatterns) {
      if (pattern.test(eventString)) {
        return true;
      }
    }

    return false;
  }

  shouldDropByLevel(event) {
    if (this.dropLevels.length === 0) {
      return false;
    }

    const level = event.level || event.severity || '';
    return this.dropLevels.includes(level.toLowerCase());
  }

  shouldDropByType(event) {
    if (this.dropEventTypes.length === 0) {
      return false;
    }

    // Check if keep types overrides
    if (this.keepEventTypes.length > 0 && event.type) {
      if (this.keepEventTypes.includes(event.type)) {
        return false; // Keep overrides drop
      }
    }

    const eventType = event.type || event.event_type || '';
    return this.dropEventTypes.includes(eventType);
  }

  isLowValueEvent(event) {
    // Define low-value event patterns
    const lowValueTypes = [
      'heartbeat',
      'health_check',
      'ping',
      'pong',
      'keepalive',
      'status',
      'info'
    ];

    const eventType = (event.type || event.event_type || '').toLowerCase();

    // Check if event type is low-value
    if (lowValueTypes.includes(eventType)) {
      return true;
    }

    // Check if event level is debug/trace
    const level = (event.level || event.severity || '').toLowerCase();
    if (level === 'debug' || level === 'trace') {
      return true;
    }

    // Check if event has no meaningful data
    if (this.isEmptyEvent(event)) {
      return true;
    }

    // Check if event is a duplicate (same type/message within short time)
    // This could be enhanced with a deduplication cache

    return false;
  }

  isEmptyEvent(event) {
    // Check if event has meaningful content
    const meaningfulFields = [
      'error',
      'message',
      'data',
      'result',
      'output',
      'response'
    ];

    for (const field of meaningfulFields) {
      if (event[field]) {
        return false; // Has meaningful content
      }
    }

    // Event only has metadata, no content
    return Object.keys(event).length <= 5; // Arbitrary threshold
  }

  getHealth() {
    return {
      ...super.getHealth(),
      type: 'filter',
      filterMode: this.filterMode,
      dropLowValue: this.dropLowValue,
      dropPatterns: this.dropPatterns.length,
      keepPatterns: this.keepPatterns.length,
      dropLevels: this.dropLevels,
      dropEventTypes: this.dropEventTypes,
      stats: this.filterStats
    };
  }

  getFilterStats() {
    const total = this.filterStats.total_evaluated;
    return {
      ...this.filterStats,
      drop_rate: total > 0 ? (this.filterStats.total_dropped / total) : 0,
      keep_rate: total > 0 ? (this.filterStats.total_kept / total) : 0
    };
  }

  resetStats() {
    this.filterStats = {
      total_evaluated: 0,
      total_dropped: 0,
      total_kept: 0,
      dropped_by_pattern: 0,
      dropped_by_level: 0,
      dropped_by_type: 0,
      dropped_by_low_value: 0,
      dropped_by_custom: 0
    };
  }
}

module.exports = FilterProcessor;
