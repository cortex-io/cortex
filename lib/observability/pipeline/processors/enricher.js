// lib/observability/pipeline/processors/enricher.js
// Enricher Processor - adds metadata to events
// Weeks 3-4 Implementation
//
// Functionality:
// - Add timestamp if missing
// - Add hostname and environment info
// - Add master/worker type from event context
// - Add performance metrics (duration, tokens, cost)
// - Add session and trace IDs

const { Processor } = require('../base');
const os = require('os');

class EnricherProcessor extends Processor {
  constructor(config = {}) {
    super({
      name: config.name || 'EnricherProcessor',
      ...config
    });

    // Configuration
    this.enrichments = config.enrichments || [
      'timestamp',
      'hostname',
      'environment',
      'process',
      'performance'
    ];

    // Environment detection
    this.environment = config.environment || process.env.NODE_ENV || 'development';

    // Cache hostname for performance
    this.hostname = os.hostname();
    this.platform = os.platform();
    this.arch = os.arch();
    this.nodeVersion = process.version;

    // Process info
    this.processId = process.pid;
    this.processStartTime = Date.now();

    // Enrichment stats
    this.enrichmentStats = {
      timestamp: 0,
      hostname: 0,
      environment: 0,
      process: 0,
      performance: 0,
      context: 0
    };
  }

  async initialize() {
    // Validate enrichment types
    const validEnrichments = [
      'timestamp',
      'hostname',
      'environment',
      'process',
      'performance',
      'context',
      'all'
    ];

    for (const enrichment of this.enrichments) {
      if (!validEnrichments.includes(enrichment) && enrichment !== 'all') {
        console.warn(`Unknown enrichment type: ${enrichment}`);
      }
    }

    // 'all' means enable all enrichments
    if (this.enrichments.includes('all')) {
      this.enrichments = validEnrichments.filter(e => e !== 'all');
    }

    return true;
  }

  async process(event) {
    if (!event) return event;

    const enrichedEvent = { ...event };

    // Add enrichment metadata wrapper
    if (!enrichedEvent._enrichment) {
      enrichedEvent._enrichment = {
        enriched_at: new Date().toISOString(),
        enriched_by: this.name,
        enrichments_applied: []
      };
    }

    // Apply each enabled enrichment
    if (this.shouldEnrich('timestamp')) {
      this.enrichTimestamp(enrichedEvent);
    }

    if (this.shouldEnrich('hostname')) {
      this.enrichHostname(enrichedEvent);
    }

    if (this.shouldEnrich('environment')) {
      this.enrichEnvironment(enrichedEvent);
    }

    if (this.shouldEnrich('process')) {
      this.enrichProcess(enrichedEvent);
    }

    if (this.shouldEnrich('performance')) {
      this.enrichPerformance(enrichedEvent);
    }

    if (this.shouldEnrich('context')) {
      this.enrichContext(enrichedEvent);
    }

    return enrichedEvent;
  }

  shouldEnrich(type) {
    return this.enrichments.includes(type);
  }

  enrichTimestamp(event) {
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
      event._enrichment.enrichments_applied.push('timestamp');
      this.enrichmentStats.timestamp++;
    }
  }

  enrichHostname(event) {
    if (!event.hostname) {
      event.hostname = this.hostname;
      event._enrichment.enrichments_applied.push('hostname');
      this.enrichmentStats.hostname++;
    }

    if (!event.platform) {
      event.platform = this.platform;
    }

    if (!event.arch) {
      event.arch = this.arch;
    }
  }

  enrichEnvironment(event) {
    if (!event.environment) {
      event.environment = this.environment;
      event._enrichment.enrichments_applied.push('environment');
      this.enrichmentStats.environment++;
    }

    if (!event.node_version) {
      event.node_version = this.nodeVersion;
    }
  }

  enrichProcess(event) {
    if (!event.process_id) {
      event.process_id = this.processId;
      event._enrichment.enrichments_applied.push('process');
      this.enrichmentStats.process++;
    }

    if (!event.process_uptime) {
      event.process_uptime = Date.now() - this.processStartTime;
    }

    // Add memory usage
    const memUsage = process.memoryUsage();
    event.memory_usage = {
      rss: memUsage.rss,
      heap_total: memUsage.heapTotal,
      heap_used: memUsage.heapUsed,
      external: memUsage.external
    };
  }

  enrichPerformance(event) {
    // Calculate duration if start/end times exist
    if (event.started_at && event.completed_at) {
      const start = new Date(event.started_at).getTime();
      const end = new Date(event.completed_at).getTime();

      if (!event.duration_ms) {
        event.duration_ms = end - start;
      }

      event._enrichment.enrichments_applied.push('performance');
      this.enrichmentStats.performance++;
    }

    // Add token usage metadata if present
    if (event.tokens_used || event.token_usage) {
      const tokens = event.tokens_used || event.token_usage;

      if (!event.cost_estimate) {
        // Estimate cost (rough estimates for Claude Sonnet)
        const inputCost = (tokens.input_tokens || 0) * 0.000003; // $3 per 1M tokens
        const outputCost = (tokens.output_tokens || 0) * 0.000015; // $15 per 1M tokens

        event.cost_estimate = {
          input_cost_usd: inputCost,
          output_cost_usd: outputCost,
          total_cost_usd: inputCost + outputCost,
          model: event.model || 'claude-sonnet-4',
          tokens: tokens
        };
      }
    }

    // Add CPU usage if available
    const cpuUsage = process.cpuUsage();
    event.cpu_usage = {
      user: cpuUsage.user,
      system: cpuUsage.system
    };
  }

  enrichContext(event) {
    // Extract and enrich context from event
    if (event.master_type && !event._context) {
      event._context = {
        master_type: event.master_type,
        is_master: true
      };

      event._enrichment.enrichments_applied.push('context');
      this.enrichmentStats.context++;
    }

    if (event.worker_type && !event._context) {
      event._context = {
        worker_type: event.worker_type,
        worker_id: event.worker_id,
        is_worker: true
      };

      event._enrichment.enrichments_applied.push('context');
      this.enrichmentStats.context++;
    }

    // Add trace/session context if available
    if (event.trace_id && !event._context?.trace_id) {
      if (!event._context) event._context = {};
      event._context.trace_id = event.trace_id;
    }

    if (event.session_id && !event._context?.session_id) {
      if (!event._context) event._context = {};
      event._context.session_id = event.session_id;
    }

    // Add parent span context if available
    if (event.parent_span_id && !event._context?.parent_span_id) {
      if (!event._context) event._context = {};
      event._context.parent_span_id = event.parent_span_id;
    }
  }

  getHealth() {
    return {
      ...super.getHealth(),
      type: 'enricher',
      enrichments: this.enrichments,
      environment: this.environment,
      hostname: this.hostname,
      stats: this.enrichmentStats
    };
  }

  getEnrichmentStats() {
    return {
      ...this.enrichmentStats,
      total_enrichments: Object.values(this.enrichmentStats).reduce((a, b) => a + b, 0)
    };
  }
}

module.exports = EnricherProcessor;
