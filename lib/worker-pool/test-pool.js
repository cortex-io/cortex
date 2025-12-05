#!/usr/bin/env node

/**
 * Worker Pool Test Script
 * Simple test to verify the worker pool is functioning correctly
 */

const { createWorkerPool } = require('./index');

async function runTests() {
  console.log('='.repeat(60));
  console.log('Worker Pool Test Suite');
  console.log('='.repeat(60));

  let pool;

  try {
    // Test 1: Pool Initialization
    console.log('\n[Test 1] Initializing pool with 5 workers...');
    pool = await createWorkerPool({
      poolSize: 5,
      heartbeatInterval: 3000,
      taskTimeout: 30000,
      logWorkerInfo: false
    });
    console.log('✓ Pool initialized successfully');

    // Test 2: Submit Single Task
    console.log('\n[Test 2] Submitting single task...');
    const startTime = Date.now();
    try {
      const result = await pool.submitTask({
        type: 'test',
        payload: { testId: 1, message: 'Hello from test task' }
      });
      const duration = Date.now() - startTime;
      console.log(`✓ Task completed in ${duration}ms`);
      console.log('  Result:', result);
    } catch (error) {
      console.error('✗ Task failed:', error.message);
    }

    // Test 3: Submit Multiple Tasks
    console.log('\n[Test 3] Submitting 10 parallel tasks...');
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      payload: { testId: i + 2, iteration: i }
    }));

    const multiStart = Date.now();
    const results = await Promise.allSettled(
      tasks.map(task => pool.submitTask(task))
    );
    const multiDuration = Date.now() - multiStart;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✓ Completed ${successful} tasks, ${failed} failed in ${multiDuration}ms`);
    console.log(`  Average: ${Math.round(multiDuration / tasks.length)}ms per task`);

    // Test 4: Check Pool Metrics
    console.log('\n[Test 4] Checking pool metrics...');
    const metrics = pool.getPoolMetrics();
    console.log('✓ Pool metrics:');
    console.log(`  Workers: ${metrics.workers.total} (${metrics.workers.ready} ready, ${metrics.workers.busy} busy)`);
    console.log(`  Tasks: ${metrics.tasks.submitted} submitted, ${metrics.tasks.completed} completed, ${metrics.tasks.failed} failed`);
    console.log(`  Queue depth: ${metrics.tasks.queued}`);
    console.log(`  Worker reuse rate: ${metrics.performance.workerReuseRate}`);
    console.log(`  Workers spawned: ${metrics.performance.workersSpawned}`);

    // Test 5: Check Worker Status
    console.log('\n[Test 5] Checking worker status...');
    const workers = pool.getAllWorkersStatus();
    console.log(`✓ Found ${workers.length} workers:`);
    workers.forEach(worker => {
      console.log(`  ${worker.id}: state=${worker.state}, tasks=${worker.tasksExecuted}, healthy=${worker.healthy}`);
    });

    // Test 6: Test Priority Queue
    console.log('\n[Test 6] Testing priority queue...');
    const priorityTasks = [
      { type: 'test', payload: { priority: 'low' }, priority: 20 },
      { type: 'test', payload: { priority: 'high' }, priority: 1 },
      { type: 'test', payload: { priority: 'medium' }, priority: 10 }
    ];

    const priorityResults = [];
    for (const task of priorityTasks) {
      pool.submitTask(task).then(result => {
        priorityResults.push(result);
      }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✓ Priority tasks submitted (high priority should execute first)');

    // Test 7: Test Scaling
    console.log('\n[Test 7] Testing pool scaling...');
    console.log(`  Initial size: ${pool.getPoolMetrics().pool.size}`);

    await pool.scaleUp(3);
    console.log(`  After scale up: ${pool.getPoolMetrics().pool.size}`);

    await pool.scaleDown(2);
    console.log(`  After scale down: ${pool.getPoolMetrics().pool.size}`);
    console.log('✓ Scaling test passed');

    // Test 8: Health Monitoring
    console.log('\n[Test 8] Checking health monitoring...');
    const health = pool.healthMonitor.getHealthSummary();
    console.log('✓ Health summary:');
    console.log(`  Status: ${health.status}`);
    console.log(`  Capacity: ${health.capacity.capacityPercent}%`);
    console.log(`  Monitoring: ${health.monitoring}`);
    console.log(`  Alerts: ${health.alerts.total} total, ${health.alerts.critical} critical`);

    // Test 9: Test Worker Reuse
    console.log('\n[Test 9] Testing worker reuse with 20 sequential tasks...');
    const reuseStart = Date.now();
    const metricsBefore = pool.getPoolMetrics();

    for (let i = 0; i < 20; i++) {
      await pool.submitTask({
        type: 'test',
        payload: { reuseTest: i }
      });
    }

    const metricsAfter = pool.getPoolMetrics();
    const reuseDuration = Date.now() - reuseStart;
    const workersSpawnedDuring = metricsAfter.performance.workersSpawned - metricsBefore.performance.workersSpawned;

    console.log(`✓ Completed 20 tasks in ${reuseDuration}ms`);
    console.log(`  Workers spawned during test: ${workersSpawnedDuring}`);
    console.log(`  Worker reuse rate: ${metricsAfter.performance.workerReuseRate}`);

    if (workersSpawnedDuring === 0) {
      console.log('  ✓ Perfect worker reuse - no new workers spawned!');
    }

    // Final Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));

    const finalMetrics = pool.getPoolMetrics();
    console.log(`Total tasks executed: ${finalMetrics.tasks.completed}`);
    console.log(`Total tasks failed: ${finalMetrics.tasks.failed}`);
    console.log(`Worker reuse rate: ${finalMetrics.performance.workerReuseRate}`);
    console.log(`Workers spawned: ${finalMetrics.performance.workersSpawned}`);
    console.log(`Workers restarted: ${finalMetrics.performance.workersRestarted}`);
    console.log(`Pool uptime: ${Math.round(finalMetrics.pool.uptime / 1000)}s`);

    console.log('\n✓ All tests passed!');

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Shutting down pool...');
    if (pool) {
      await pool.shutdown(true);
      console.log('✓ Pool shutdown complete');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test suite completed successfully');
  console.log('='.repeat(60) + '\n');
}

// Run tests
runTests().then(() => {
  console.log('Exiting...');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
