#!/usr/bin/env node

/**
 * Example: Task Orchestrator
 * Automatically assign tasks to workers
 */

const { createCoordinationDaemon } = require('../index');

async function main() {
  console.log('Starting Task Orchestrator Daemon...\n');

  const daemon = createCoordinationDaemon({
    port: 9500,
    wsPort: 9501,
    persistence: 'memory-only', // Fast for demo
    maxTasksPerWorker: 5
  });

  let taskCounter = 0;

  // Event handlers
  daemon.on('started', () => {
    console.log('Daemon started successfully!\n');

    // Auto-assign tasks every 5 seconds
    setInterval(() => {
      const state = daemon.getState();

      // Only create tasks if we have workers
      if (state.workers.length === 0) {
        console.log('[ORCHESTRATOR] No workers available, waiting...');
        return;
      }

      // Create a few tasks
      const numTasks = Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < numTasks; i++) {
        const taskId = `task-${++taskCounter}`;
        const types = ['development', 'security', 'testing', 'deployment'];
        const type = types[Math.floor(Math.random() * types.length)];

        daemon.assignTask(taskId, null, {
          title: `Automated ${type} task #${taskCounter}`,
          type,
          capabilities: [type],
          priority: Math.random() > 0.7 ? 'high' : 'normal',
          createdAt: new Date().toISOString()
        }).then(result => {
          if (result.success) {
            console.log(`[ORCHESTRATOR] Created ${taskId} -> assigned to ${result.workerId}`);
          } else {
            console.log(`[ORCHESTRATOR] Failed to assign ${taskId}: ${result.error}`);
          }
        });
      }
    }, 5000);

    // Display status every 10 seconds
    setInterval(() => {
      const state = daemon.getState();
      const metrics = daemon.getMetrics();

      console.log('\n=== Status ===');
      console.log(`Workers: ${state.workers.length} (${state.workers.filter(w => w.status === 'idle').length} idle)`);
      console.log(`Active tasks: ${metrics.daemon.activeTasks}`);
      console.log(`Completed: ${metrics.daemon.totalTasksProcessed}`);
      console.log(`Failed: ${metrics.daemon.totalTasksFailed}`);
      console.log(`Ops/sec: ${metrics.daemon.operationsPerSecond}`);
      console.log(`Avg latency: ${metrics.daemon.averageLatency.toFixed(2)}ms`);
      console.log('==============\n');
    }, 10000);
  });

  daemon.on('worker-registered', (data) => {
    console.log(`[WORKER] ✓ Registered: ${data.workerId} (${data.capabilities.join(', ')})`);
  });

  daemon.on('worker-unregistered', (data) => {
    console.log(`[WORKER] ✗ Unregistered: ${data.workerId}`);
  });

  daemon.on('worker-timeout', (data) => {
    console.log(`[WORKER] ⚠ Timeout: ${data.workerId} - marking as offline`);
  });

  daemon.on('task-assigned', (data) => {
    console.log(`[TASK] → Assigned: ${data.taskId} to ${data.workerId}`);
  });

  daemon.on('task-completed', (data) => {
    console.log(`[TASK] ✓ Completed: ${data.taskId} by ${data.workerId}`);
  });

  daemon.on('task-failed', (data) => {
    console.log(`[TASK] ✗ Failed: ${data.taskId} by ${data.workerId}`);
  });

  daemon.on('task-reassigned', (data) => {
    console.log(`[TASK] ⟳ Reassigned: ${data.taskId} from ${data.fromWorker}`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down orchestrator...');

    const metrics = daemon.getMetrics();
    console.log('\n=== Final Statistics ===');
    console.log(`Total tasks created: ${taskCounter}`);
    console.log(`Tasks completed: ${metrics.daemon.totalTasksProcessed}`);
    console.log(`Tasks failed: ${metrics.daemon.totalTasksFailed}`);
    console.log(`Total operations: ${metrics.daemon.operations}`);
    console.log(`Average ops/sec: ${metrics.daemon.operationsPerSecond}`);
    console.log(`Average latency: ${metrics.daemon.averageLatency.toFixed(2)}ms`);
    console.log(`Uptime: ${Math.round(metrics.daemon.uptime / 1000)}s`);
    console.log('========================\n');

    await daemon.stop();
    process.exit(0);
  });

  // Start the daemon
  await daemon.start();
}

main().catch(console.error);
