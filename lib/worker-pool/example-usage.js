/**
 * Worker Pool Example Usage
 * Demonstrates how to use the worker pool manager
 */

const { createWorkerPool } = require('./index');

async function exampleBasicUsage() {
  console.log('\n=== Basic Usage Example ===\n');

  // Create and initialize a worker pool
  const pool = await createWorkerPool({
    poolSize: 20,
    minWorkers: 5,
    maxWorkers: 50,
    fifoDir: '/tmp/cortex/workers',
    heartbeatInterval: 5000,
    taskTimeout: 300000, // 5 minutes
    loadBalancing: 'round-robin', // or 'least-loaded'
    autoRestart: true
  });

  // Submit a task
  try {
    const result = await pool.submitTask({
      type: 'implementation',
      payload: {
        feature: 'user-authentication',
        requirements: ['JWT tokens', 'password hashing', 'session management']
      },
      priority: 5 // Lower number = higher priority
    });

    console.log('Task completed:', result);
  } catch (error) {
    console.error('Task failed:', error.message);
  }

  // Get pool metrics
  const metrics = pool.getPoolMetrics();
  console.log('\nPool metrics:', JSON.stringify(metrics, null, 2));

  // Shutdown gracefully
  await pool.shutdown(true);
}

async function exampleMultipleTasks() {
  console.log('\n=== Multiple Tasks Example ===\n');

  const pool = await createWorkerPool({
    poolSize: 10,
    taskTimeout: 60000 // 1 minute
  });

  // Submit multiple tasks in parallel
  const tasks = [
    { type: 'analysis', payload: { file: 'app.js' }, priority: 1 },
    { type: 'test', payload: { suite: 'unit-tests' }, priority: 2 },
    { type: 'implementation', payload: { feature: 'api-endpoint' }, priority: 3 },
    { type: 'analysis', payload: { file: 'utils.js' }, priority: 1 },
    { type: 'test', payload: { suite: 'integration-tests' }, priority: 2 }
  ];

  try {
    const results = await Promise.all(
      tasks.map(task => pool.submitTask(task))
    );

    console.log(`Completed ${results.length} tasks`);
    results.forEach((result, i) => {
      console.log(`Task ${i + 1}:`, result);
    });
  } catch (error) {
    console.error('Error executing tasks:', error.message);
  }

  await pool.shutdown();
}

async function exampleMonitoring() {
  console.log('\n=== Monitoring Example ===\n');

  const pool = await createWorkerPool({ poolSize: 5 });

  // Listen to pool events
  pool.on('task-completed', ({ taskId, workerId, duration }) => {
    console.log(`Task ${taskId} completed by ${workerId} in ${duration}ms`);
  });

  pool.on('task-failed', ({ taskId, error }) => {
    console.error(`Task ${taskId} failed: ${error}`);
  });

  pool.on('worker-error', ({ workerId, error }) => {
    console.error(`Worker ${workerId} error: ${error}`);
  });

  pool.on('zombie-detected', ({ workerId }) => {
    console.warn(`Zombie worker detected: ${workerId}`);
  });

  // Submit some tasks
  for (let i = 0; i < 10; i++) {
    pool.submitTask({
      type: 'test',
      payload: { testId: i }
    }).catch(err => console.error(`Task ${i} error:`, err.message));
  }

  // Monitor for 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Get final metrics
  const metrics = pool.getPoolMetrics();
  console.log('\nFinal metrics:', JSON.stringify(metrics, null, 2));

  // Check individual worker status
  const workers = pool.getAllWorkersStatus();
  console.log('\nWorker status:');
  workers.forEach(worker => {
    console.log(`  ${worker.id}: state=${worker.state}, tasks=${worker.tasksExecuted}, healthy=${worker.healthy}`);
  });

  await pool.shutdown();
}

async function exampleScaling() {
  console.log('\n=== Dynamic Scaling Example ===\n');

  const pool = await createWorkerPool({
    poolSize: 5,
    minWorkers: 2,
    maxWorkers: 20
  });

  console.log('Initial pool size:', pool.getPoolMetrics().pool.size);

  // Scale up when load increases
  console.log('Scaling up by 10 workers...');
  await pool.scaleUp(10);
  console.log('New pool size:', pool.getPoolMetrics().pool.size);

  // Submit many tasks
  const tasks = Array.from({ length: 50 }, (_, i) => ({
    type: 'test',
    payload: { taskId: i }
  }));

  const startTime = Date.now();
  await Promise.all(tasks.map(task => pool.submitTask(task)));
  const duration = Date.now() - startTime;

  console.log(`Completed 50 tasks in ${duration}ms with ${pool.getPoolMetrics().pool.size} workers`);

  // Scale down when load decreases
  console.log('Scaling down by 8 workers...');
  await pool.scaleDown(8);
  console.log('Final pool size:', pool.getPoolMetrics().pool.size);

  await pool.shutdown();
}

async function exampleHealthMonitoring() {
  console.log('\n=== Health Monitoring Example ===\n');

  const pool = await createWorkerPool({
    poolSize: 10,
    heartbeatInterval: 3000 // 3 seconds
  });

  // Monitor health summary
  setInterval(() => {
    const metrics = pool.getPoolMetrics();
    console.log('\nHealth Summary:');
    console.log(`  Status: ${metrics.health.status}`);
    console.log(`  Capacity: ${metrics.health.capacity.capacityPercent}%`);
    console.log(`  Utilization: ${metrics.health.capacity.utilizationPercent}%`);
    console.log(`  Workers: ${metrics.workers.total} total, ${metrics.workers.healthy} healthy, ${metrics.workers.busy} busy`);
    console.log(`  Tasks: ${metrics.tasks.queued} queued, ${metrics.tasks.completed} completed, ${metrics.tasks.failed} failed`);
    console.log(`  Performance: ${metrics.performance.workerReuseRate} reuse rate`);
  }, 10000); // Every 10 seconds

  // Submit tasks continuously
  const submitTasks = setInterval(() => {
    pool.submitTask({
      type: 'test',
      payload: { timestamp: Date.now() }
    }).catch(() => {});
  }, 2000);

  // Run for 60 seconds
  await new Promise(resolve => setTimeout(resolve, 60000));

  clearInterval(submitTasks);
  await pool.shutdown();
}

async function exampleErrorHandling() {
  console.log('\n=== Error Handling Example ===\n');

  const pool = await createWorkerPool({
    poolSize: 5,
    maxTaskRetries: 3 // Retry failed tasks up to 3 times
  });

  // Task that might fail
  try {
    const result = await pool.submitTask({
      type: 'risky-operation',
      payload: { data: 'test' },
      timeout: 10000 // 10 second timeout
    });
    console.log('Task succeeded:', result);
  } catch (error) {
    console.error('Task failed after retries:', error.message);
  }

  // Check dead letter queue
  const metrics = pool.getPoolMetrics();
  if (metrics.tasks.dlq > 0) {
    console.log(`\nDead letter queue has ${metrics.tasks.dlq} failed tasks`);
  }

  await pool.shutdown();
}

async function exampleCustomWorkerScript() {
  console.log('\n=== Custom Worker Script Example ===\n');

  // You can provide a custom worker script
  const pool = await createWorkerPool({
    poolSize: 5,
    workerScript: '/path/to/custom-worker.js', // Custom worker implementation
    fifoDir: '/tmp/cortex/custom-workers'
  });

  // Use the pool normally
  const result = await pool.submitTask({
    type: 'custom-task',
    payload: { custom: 'data' }
  });

  console.log('Result:', result);

  await pool.shutdown();
}

// Run examples
async function runAllExamples() {
  try {
    // Uncomment the examples you want to run:

    // await exampleBasicUsage();
    // await exampleMultipleTasks();
    // await exampleMonitoring();
    // await exampleScaling();
    // await exampleHealthMonitoring();
    // await exampleErrorHandling();
    // await exampleCustomWorkerScript();

    console.log('\nAll examples completed!');
  } catch (error) {
    console.error('Example error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples().then(() => {
    console.log('\nExamples finished. Exiting...');
    process.exit(0);
  });
}

module.exports = {
  exampleBasicUsage,
  exampleMultipleTasks,
  exampleMonitoring,
  exampleScaling,
  exampleHealthMonitoring,
  exampleErrorHandling,
  exampleCustomWorkerScript
};
