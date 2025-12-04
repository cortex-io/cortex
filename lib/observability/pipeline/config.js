// lib/observability/pipeline/config.js
// Pipeline Configuration Builder
// Simplifies pipeline setup with configuration objects

const { ObservabilityPipeline } = require('./index');
const sources = require('./sources');
const processors = require('./processors');
const destinations = require('./destinations');

class PipelineConfigBuilder {
  constructor() {
    this.config = {
      sources: [],
      processors: [],
      destinations: []
    };
  }

  /**
   * Add source configuration
   * @param {string} type - Source type
   * @param {Object} config - Source configuration
   */
  addSource(type, config = {}) {
    this.config.sources.push({ type, config });
    return this;
  }

  /**
   * Add processor configuration
   * @param {string} type - Processor type
   * @param {Object} config - Processor configuration
   */
  addProcessor(type, config = {}) {
    this.config.processors.push({ type, config });
    return this;
  }

  /**
   * Add destination configuration
   * @param {string} type - Destination type
   * @param {Object} config - Destination configuration
   */
  addDestination(type, config = {}) {
    this.config.destinations.push({ type, config });
    return this;
  }

  /**
   * Build and return configured pipeline
   * @returns {ObservabilityPipeline}
   */
  build() {
    const pipeline = new ObservabilityPipeline();

    // Create and add sources
    for (const { type, config } of this.config.sources) {
      const SourceClass = this.getSourceClass(type);
      const source = new SourceClass(config);
      pipeline.addSource(source);
    }

    // Create and add processors
    for (const { type, config } of this.config.processors) {
      const ProcessorClass = this.getProcessorClass(type);
      const processor = new ProcessorClass(config);
      pipeline.addProcessor(processor);
    }

    // Create and add destinations
    for (const { type, config } of this.config.destinations) {
      const DestinationClass = this.getDestinationClass(type);
      const destination = new DestinationClass(config);
      pipeline.addDestination(destination);
    }

    return pipeline;
  }

  getSourceClass(type) {
    const classMap = {
      'file-watcher': sources.FileWatcherSource,
      'event-stream': sources.EventStreamSource
    };

    if (!classMap[type]) {
      throw new Error(`Unknown source type: ${type}`);
    }

    return classMap[type];
  }

  getProcessorClass(type) {
    const classMap = {
      'passthrough': processors.PassthroughProcessor,
      'enricher': processors.EnricherProcessor,
      'sampler': processors.SamplerProcessor,
      'filter': processors.FilterProcessor,
      'pii-redactor': processors.PIIRedactorProcessor
    };

    if (!classMap[type]) {
      throw new Error(`Unknown processor type: ${type}`);
    }

    return classMap[type];
  }

  getDestinationClass(type) {
    const classMap = {
      'jsonl': destinations.JSONLDestination,
      'console': destinations.ConsoleDestination
    };

    if (!classMap[type]) {
      throw new Error(`Unknown destination type: ${type}`);
    }

    return classMap[type];
  }

  /**
   * Build from JSON configuration
   * @param {Object} json - Configuration object
   * @returns {ObservabilityPipeline}
   */
  static fromJSON(json) {
    const builder = new PipelineConfigBuilder();

    // Add sources
    for (const sourceConfig of json.sources || []) {
      builder.addSource(sourceConfig.type, sourceConfig.config);
    }

    // Add processors
    for (const procConfig of json.processors || []) {
      builder.addProcessor(procConfig.type, procConfig.config);
    }

    // Add destinations
    for (const destConfig of json.destinations || []) {
      builder.addDestination(destConfig.type, destConfig.config);
    }

    return builder.build();
  }

  /**
   * Create a default pipeline for Cortex
   * Backward compatible with existing JSONL logging
   */
  static createDefaultPipeline() {
    return new PipelineConfigBuilder()
      // Source: Watch all Cortex event files
      .addSource('event-stream', {
        name: 'CortexEvents',
        eventsDir: 'coordination/events',
        eventTypes: ['all']
      })
      // Processor: Basic enrichment (Weeks 3-4 will enhance this)
      .addProcessor('enricher', {
        name: 'EventEnricher',
        enrichments: ['timestamp', 'hostname']
      })
      // Destination: JSONL (backward compatible)
      .addDestination('jsonl', {
        name: 'ObservabilityLogs',
        outputPath: 'coordination/observability/pipeline-events.jsonl',
        rotateDaily: true,
        bufferSize: 100,
        flushInterval: 5000
      })
      .build();
  }

  /**
   * Create a debug pipeline (console output)
   */
  static createDebugPipeline() {
    return new PipelineConfigBuilder()
      .addSource('event-stream', {
        name: 'CortexEvents',
        eventsDir: 'coordination/events',
        eventTypes: ['all']
      })
      .addProcessor('enricher', {
        name: 'EventEnricher',
        enrichments: ['timestamp']
      })
      .addDestination('console', {
        name: 'ConsoleOutput',
        pretty: true
      })
      .build();
  }
}

module.exports = {
  PipelineConfigBuilder
};
