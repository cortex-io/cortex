#!/usr/bin/env node
// lib/observability/pipeline/example.js
// Example usage of Observability Pipeline

const { PipelineConfigBuilder } = require('./config');

async function exampleBasicPipeline() {
  console.log('=== Basic Pipeline Example ===\n');

  // Create a simple pipeline: File → Console
  const pipeline = new PipelineConfigBuilder()
    .addSource('file-watcher', {
      name: 'HeartbeatWatcher',
      filePath: 'coordination/events/heartbeat-events.jsonl',
      watchInterval: 1000
    })
    .addProcessor('enricher', {
      name: 'BasicEnricher',
      enrichments: ['timestamp', 'hostname']
    })
    .addDestination('console', {
      name: 'ConsoleOutput',
      pretty: true
    })
    .build();

  // Initialize and start
  await pipeline.initialize();
  await pipeline.start();

  console.log('Pipeline started. Watching for events...');
  console.log('Press Ctrl+C to stop\n');

  // Monitor pipeline health
  setInterval(() => {
    const health = pipeline.getHealth();
    console.log(`\nPipeline Health:`);
    console.log(`  Events received: ${health.metrics.events_received}`);
    console.log(`  Events processed: ${health.metrics.events_processed}`);
    console.log(`  Events delivered: ${health.metrics.events_delivered}`);
    console.log(`  Errors: ${health.metrics.errors}`);
  }, 10000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down pipeline...');
    await pipeline.stop();
    process.exit(0);
  });
}

async function exampleMultiDestination() {
  console.log('=== Multi-Destination Pipeline Example ===\n');

  // Create pipeline with multiple destinations
  const pipeline = new PipelineConfigBuilder()
    .addSource('event-stream', {
      name: 'AllEvents',
      eventsDir: 'coordination/events',
      eventTypes: ['all']
    })
    .addProcessor('enricher', {
      name: 'FullEnricher',
      enrichments: ['timestamp', 'hostname']
    })
    .addDestination('jsonl', {
      name: 'PipelineLog',
      outputPath: 'coordination/observability/pipeline-events.jsonl',
      rotateDaily: true
    })
    .addDestination('console', {
      name: 'ConsoleMonitor',
      pretty: false
    })
    .build();

  await pipeline.initialize();
  await pipeline.start();

  console.log('Multi-destination pipeline started.');
  console.log('Events will be written to both JSONL and console.');
  console.log('Press Ctrl+C to stop\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down pipeline...');
    await pipeline.stop();
    process.exit(0);
  });
}

async function exampleDefaultPipeline() {
  console.log('=== Default Cortex Pipeline ===\n');

  // Use the default Cortex pipeline configuration
  const pipeline = PipelineConfigBuilder.createDefaultPipeline();

  await pipeline.initialize();
  await pipeline.start();

  console.log('Default Cortex pipeline started.');
  console.log('Watching all event files in coordination/events/');
  console.log('Writing to coordination/observability/pipeline-events.jsonl');
  console.log('Press Ctrl+C to stop\n');

  // Monitor metrics
  setInterval(() => {
    const metrics = pipeline.getMetrics();
    console.log(`Metrics: ${JSON.stringify(metrics, null, 2)}`);
  }, 15000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down pipeline...');
    await pipeline.stop();
    process.exit(0);
  });
}

async function exampleFromJSON() {
  console.log('=== Pipeline from JSON Config ===\n');

  // Define pipeline configuration as JSON
  const config = {
    sources: [
      {
        type: 'event-stream',
        config: {
          name: 'CortexEvents',
          eventsDir: 'coordination/events',
          eventTypes: ['worker', 'heartbeat']
        }
      }
    ],
    processors: [
      {
        type: 'enricher',
        config: {
          name: 'EventEnricher',
          enrichments: ['timestamp']
        }
      }
    ],
    destinations: [
      {
        type: 'jsonl',
        config: {
          name: 'FilteredLog',
          outputPath: 'coordination/observability/filtered-events.jsonl',
          rotateDaily: true
        }
      }
    ]
  };

  const pipeline = PipelineConfigBuilder.fromJSON(config);

  await pipeline.initialize();
  await pipeline.start();

  console.log('JSON-configured pipeline started.');
  console.log('Press Ctrl+C to stop\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down pipeline...');
    await pipeline.stop();
    process.exit(0);
  });
}

// Run example based on command line argument
const example = process.argv[2] || 'default';

switch (example) {
  case 'basic':
    exampleBasicPipeline();
    break;
  case 'multi':
    exampleMultiDestination();
    break;
  case 'json':
    exampleFromJSON();
    break;
  case 'default':
  default:
    exampleDefaultPipeline();
    break;
}
