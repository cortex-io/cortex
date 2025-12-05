#!/usr/bin/env node

/**
 * Example: Basic Coordination Daemon
 * Start a simple coordination daemon with default settings
 */

const { createCoordinationDaemon } = require('../index');

async function main() {
  console.log('Starting Basic Coordination Daemon...\n');

  const daemon = createCoordinationDaemon({
    port: 9500,
    wsPort: 9501,
    persistence: 'periodic-snapshot',
    snapshotInterval: 30000,
    snapshotPath: './coordination/state-snapshot.json'
  });

  // Event handlers
  daemon.on('started', (data) => {
    console.log('\nDaemon started successfully!');
    console.log(`  HTTP API: http://localhost:${data.httpPort}`);
    console.log(`  WebSocket: ws://localhost:${data.wsPort}`);
    console.log('\nTry these endpoints:');
    console.log(`  Health: curl http://localhost:${data.httpPort}/health`);
    console.log(`  Metrics: curl http://localhost:${data.httpPort}/api/metrics`);
    console.log(`  State: curl http://localhost:${data.httpPort}/api/state`);
    console.log('\nPress Ctrl+C to stop\n');
  });

  daemon.on('worker-registered', (data) => {
    console.log(`[WORKER] Registered: ${data.workerId}`);
    console.log(`  Capabilities: ${data.capabilities.join(', ') || 'none'}`);
  });

  daemon.on('worker-unregistered', (data) => {
    console.log(`[WORKER] Unregistered: ${data.workerId}`);
  });

  daemon.on('task-assigned', (data) => {
    console.log(`[TASK] Assigned: ${data.taskId} -> ${data.workerId}`);
  });

  daemon.on('task-completed', (data) => {
    console.log(`[TASK] Completed: ${data.taskId} by ${data.workerId}`);
  });

  daemon.on('task-failed', (data) => {
    console.log(`[TASK] Failed: ${data.taskId} by ${data.workerId}`);
  });

  daemon.on('snapshot-created', (data) => {
    console.log(`[STATE] Snapshot created at ${data.timestamp}`);
  });

  daemon.on('error', (data) => {
    console.error(`[ERROR]`, data);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    const metrics = daemon.getMetrics();
    console.log('\nFinal Metrics:');
    console.log(`  Operations: ${metrics.daemon.operations}`);
    console.log(`  Ops/sec: ${metrics.daemon.operationsPerSecond}`);
    console.log(`  Avg latency: ${metrics.daemon.averageLatency.toFixed(2)}ms`);
    console.log(`  Workers: ${metrics.daemon.activeWorkers}`);
    console.log(`  Tasks processed: ${metrics.daemon.totalTasksProcessed}`);

    await daemon.stop();
    process.exit(0);
  });

  // Start the daemon
  await daemon.start();
}

main().catch(console.error);
