#!/usr/bin/env node

/**
 * Example: Performance Test
 * Test the coordination daemon under load to verify 1,000+ ops/sec target
 */

const { createCoordinationDaemon } = require('../index');
const { CoordinationClient } = require('../client');

const NUM_WORKERS = 10;
const NUM_TASKS = 1000;
const TASK_DURATION = 100; // ms

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createWorkers(numWorkers) {
  const workers = [];

  for (let i = 0; i < numWorkers; i++) {
    const workerId = `perf-worker-${i}`;
    const client = new CoordinationClient({
      workerId,
      capabilities: ['performance-test'],
      wsUrl: 'ws://localhost:9501',
      httpUrl: 'http://localhost:9500'
    });

    // Handle tasks
    client.on('task_assigned', async (task) => {
      // Simulate work
      await sleep(TASK_DURATION);

      // Complete task
      client.completeTask(task.id, {
        status: 'success',
        duration: TASK_DURATION
      });
    });

    await client.connect();
    workers.push(client);
  }

  return workers;
}

async function main() {
  console.log('=== Coordination Daemon Performance Test ===\n');
  console.log(`Configuration:`);
  console.log(`  Workers: ${NUM_WORKERS}`);
  console.log(`  Tasks: ${NUM_TASKS}`);
  console.log(`  Task duration: ${TASK_DURATION}ms`);
  console.log(`  Target: 1,000 ops/sec, <100ms latency\n`);

  // Start daemon
  console.log('Starting daemon...');
  const daemon = createCoordinationDaemon({
    port: 9500,
    wsPort: 9501,
    persistence: 'memory-only', // Fastest for performance test
    maxTasksPerWorker: 100
  });

  await daemon.start();
  console.log('✓ Daemon started\n');

  // Create workers
  console.log(`Creating ${NUM_WORKERS} workers...`);
  const workers = await createWorkers(NUM_WORKERS);
  await sleep(1000); // Wait for registrations
  console.log('✓ Workers created\n');

  // Create tasks
  console.log(`Creating ${NUM_TASKS} tasks...`);
  const startTime = Date.now();
  const taskPromises = [];

  for (let i = 0; i < NUM_TASKS; i++) {
    const taskId = `perf-task-${i}`;
    const promise = daemon.assignTask(taskId, null, {
      title: `Performance test task ${i}`,
      type: 'performance-test',
      capabilities: ['performance-test']
    });
    taskPromises.push(promise);
  }

  await Promise.all(taskPromises);
  const taskCreationTime = Date.now() - startTime;

  console.log(`✓ Created ${NUM_TASKS} tasks in ${taskCreationTime}ms`);
  console.log(`  Task creation rate: ${Math.round(NUM_TASKS / (taskCreationTime / 1000))} tasks/sec\n`);

  // Monitor completion
  console.log('Waiting for tasks to complete...\n');

  let lastCompleted = 0;
  const monitorInterval = setInterval(() => {
    const metrics = daemon.getMetrics();
    const completed = metrics.daemon.totalTasksProcessed;
    const rate = completed - lastCompleted;
    lastCompleted = completed;

    console.log(`Progress: ${completed}/${NUM_TASKS} completed | ` +
                `Rate: ${rate}/sec | ` +
                `Ops/sec: ${metrics.daemon.operationsPerSecond} | ` +
                `Latency: ${metrics.daemon.averageLatency.toFixed(2)}ms | ` +
                `Active: ${metrics.daemon.activeTasks}`);

    if (completed >= NUM_TASKS) {
      clearInterval(monitorInterval);
    }
  }, 1000);

  // Wait for all tasks to complete
  let completed = 0;
  while (completed < NUM_TASKS) {
    await sleep(100);
    const metrics = daemon.getMetrics();
    completed = metrics.daemon.totalTasksProcessed;
  }

  const totalTime = Date.now() - startTime;

  // Final results
  console.log('\n=== Performance Test Results ===\n');

  const metrics = daemon.getMetrics();

  console.log('Task Processing:');
  console.log(`  Total tasks: ${NUM_TASKS}`);
  console.log(`  Completed: ${metrics.daemon.totalTasksProcessed}`);
  console.log(`  Failed: ${metrics.daemon.totalTasksFailed}`);
  console.log(`  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log(`  Throughput: ${Math.round(NUM_TASKS / (totalTime / 1000))} tasks/sec`);

  console.log('\nDaemon Performance:');
  console.log(`  Total operations: ${metrics.daemon.operations}`);
  console.log(`  Operations/sec: ${metrics.daemon.operationsPerSecond}`);
  console.log(`  Average latency: ${metrics.daemon.averageLatency.toFixed(2)}ms`);

  console.log('\nState Store:');
  console.log(`  Total ops: ${metrics.stateStore.operations}`);
  console.log(`  Transactions: ${metrics.stateStore.transactions}`);

  console.log('\nMessage Bus:');
  console.log(`  Messages sent: ${metrics.messageBus.messagesSent}`);
  console.log(`  Messages delivered: ${metrics.messageBus.messagesDelivered}`);
  console.log(`  Average latency: ${metrics.messageBus.averageLatency.toFixed(2)}ms`);

  console.log('\nTarget Validation:');
  const opsPerSecTarget = metrics.daemon.operationsPerSecond >= 1000;
  const latencyTarget = metrics.daemon.averageLatency < 100;

  console.log(`  ✓ Operations/sec >= 1,000: ${opsPerSecTarget ? '✓ PASS' : '✗ FAIL'} (${metrics.daemon.operationsPerSecond})`);
  console.log(`  ✓ Latency < 100ms: ${latencyTarget ? '✓ PASS' : '✗ FAIL'} (${metrics.daemon.averageLatency.toFixed(2)}ms)`);

  const overallPass = opsPerSecTarget && latencyTarget;
  console.log(`\n  Overall: ${overallPass ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\n================================\n');

  // Cleanup
  console.log('Cleaning up...');
  for (const worker of workers) {
    worker.disconnect();
  }
  await daemon.stop();

  process.exit(overallPass ? 0 : 1);
}

main().catch(console.error);
