#!/usr/bin/env node

/**
 * Example: Basic Worker
 * Simple worker that connects to the coordination daemon and processes tasks
 */

const { CoordinationClient } = require('../client');

// Helper function to simulate async work
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const workerId = process.argv[2] || `worker-${Date.now()}`;
  const capabilities = process.argv.slice(3);

  console.log(`Starting worker: ${workerId}`);
  console.log(`Capabilities: ${capabilities.join(', ') || 'none'}\n`);

  const client = new CoordinationClient({
    workerId,
    capabilities: capabilities.length > 0 ? capabilities : ['development'],
    wsUrl: 'ws://localhost:9501',
    httpUrl: 'http://localhost:9500'
  });

  // Handle task assignments
  client.on('task_assigned', async (task) => {
    console.log(`\n[TASK RECEIVED] ${task.id}`);
    console.log(`  Title: ${task.title || 'N/A'}`);
    console.log(`  Type: ${task.type || 'N/A'}`);
    console.log(`  Status: ${task.status}`);

    try {
      // Simulate work with progress updates
      console.log('  Processing...');

      for (let progress = 0; progress <= 100; progress += 20) {
        await sleep(1000);
        client.updateProgress(task.id, progress);
        console.log(`  Progress: ${progress}%`);
      }

      // Complete the task
      const result = {
        status: 'success',
        message: 'Task completed successfully',
        workerId,
        completedAt: new Date().toISOString()
      };

      client.completeTask(task.id, result);
      console.log(`  ✓ Completed`);

    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      client.failTask(task.id, {
        message: error.message,
        stack: error.stack
      });
    }
  });

  // Connection events
  client.on('connected', () => {
    console.log('✓ Connected to coordination daemon');
  });

  client.on('registered', () => {
    console.log('✓ Registered with daemon');
    console.log('\nWaiting for tasks...\n');
  });

  client.on('disconnected', () => {
    console.log('✗ Disconnected from daemon');
  });

  client.on('reconnecting', () => {
    console.log('⟳ Reconnecting to daemon...');
  });

  client.on('reconnected', () => {
    console.log('✓ Reconnected to daemon');
  });

  client.on('error', (error) => {
    console.error('Error:', error);
  });

  // Periodic metrics
  setInterval(() => {
    const metrics = client.getMetrics();
    console.log(`[METRICS] Messages sent: ${metrics.messagesSent} | ` +
                `Received: ${metrics.messagesReceived} | ` +
                `Tasks: ${metrics.tasksReceived} | ` +
                `Reconnects: ${metrics.reconnects}`);
  }, 30000); // Every 30 seconds

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down worker...');
    client.disconnect();
    process.exit(0);
  });

  // Connect to daemon
  try {
    await client.connect();
  } catch (error) {
    console.error('Failed to connect:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
