/**
 * Intelligent Scheduler Examples
 *
 * Demonstrates various use cases and integration patterns.
 */

const { createIntelligentScheduler } = require('./index');

/**
 * Example 1: Basic Task Scheduling
 */
function example1_BasicScheduling() {
  console.log('\n=== Example 1: Basic Task Scheduling ===\n');

  const scheduler = createIntelligentScheduler({
    maxMemoryMB: 12288,
    maxConcurrentTasks: 20
  });

  const task = {
    id: 'task-001',
    type: 'implementation',
    description: 'Implement user authentication with JWT tokens and session management',
    priority: 'P1',
    createdAt: new Date().toISOString()
  };

  // Check if we can accept the task
  const check = scheduler.canAcceptTask(task);
  console.log('Feasibility Check:');
  console.log('  Feasible:', check.feasible);
  console.log('  Estimated Resources:');
  console.log('    Memory:', check.estimatedResources.memoryMB, 'MB');
  console.log('    CPU:', check.estimatedResources.cpuSeconds, 'seconds');
  console.log('    Tokens:', check.estimatedResources.tokens);
  console.log('    Duration:', check.estimatedResources.durationMs / 1000, 'seconds');
  console.log('  Prediction Method:', check.predictionMethod);

  if (check.feasible) {
    // Schedule the task
    const decision = scheduler.scheduleTask(task);
    console.log('\nScheduling Decision:');
    console.log('  Scheduled:', decision.scheduled);
    console.log('  Priority Score:', decision.priority.toFixed(2));
    console.log('  Queue Position:', decision.queuePosition);
    console.log('  Queue Size:', decision.queueSize);

    // Simulate task execution
    scheduler.startTask(task.id);
    console.log('\nTask Started:', task.id);

    // Simulate completion and report outcome
    setTimeout(() => {
      scheduler.reportOutcome(task.id, {
        memoryMB: 750,
        cpuSeconds: 165,
        tokens: 45000,
        durationMs: 280000
      });
      console.log('\nTask Completed and Outcome Reported');

      const stats = scheduler.getStats();
      console.log('Completed Tasks:', stats.scheduler.completedTasks);

      scheduler.stop();
    }, 100);
  } else {
    console.log('\nTask Rejected:', check.reason);
    console.log('Estimated Wait Time:', check.estimatedWaitTimeMs / 1000, 'seconds');
  }
}

/**
 * Example 2: Multiple Tasks with Priorities
 */
function example2_PriorityQueue() {
  console.log('\n=== Example 2: Priority Queue Management ===\n');

  const scheduler = createIntelligentScheduler();

  const tasks = [
    {
      id: 'sec-001',
      type: 'security',
      description: 'Security audit of authentication module',
      priority: 'P0',
      createdAt: new Date().toISOString()
    },
    {
      id: 'impl-001',
      type: 'implementation',
      description: 'Implement new API endpoint',
      priority: 'P2',
      createdAt: new Date().toISOString()
    },
    {
      id: 'doc-001',
      type: 'documentation',
      description: 'Update API documentation',
      priority: 'P3',
      createdAt: new Date().toISOString()
    },
    {
      id: 'fix-001',
      type: 'fix',
      description: 'Fix critical bug in payment processing',
      priority: 'P0',
      createdAt: new Date().toISOString()
    }
  ];

  // Schedule all tasks
  console.log('Scheduling Tasks:\n');
  for (const task of tasks) {
    const check = scheduler.canAcceptTask(task);
    if (check.feasible) {
      const decision = scheduler.scheduleTask(task);
      console.log(`${task.id} (${task.priority}):`);
      console.log(`  Priority Score: ${decision.priority.toFixed(2)}`);
      console.log(`  Queue Position: ${decision.queuePosition + 1} of ${decision.queueSize}`);
    }
  }

  // Show the prioritized queue
  console.log('\nPrioritized Queue:');
  const schedule = scheduler.getSchedule();
  schedule.queue.forEach((task, index) => {
    console.log(`${index + 1}. ${task.id} (${task.type}) - Score: ${task.priorityScore.toFixed(2)}`);
  });

  // Get next task
  const next = scheduler.getNextTask();
  console.log('\nNext Task to Execute:', next.task.id);
  console.log('Priority Score:', next.priority.toFixed(2));

  scheduler.stop();
}

/**
 * Example 3: SLA-Aware Scheduling with Deadlines
 */
function example3_SlaAware() {
  console.log('\n=== Example 3: SLA-Aware Scheduling ===\n');

  const scheduler = createIntelligentScheduler({
    sla: {
      defaultDeadlineMinutes: 30
    }
  });

  const now = Date.now();

  const tasks = [
    {
      id: 'task-urgent',
      type: 'implementation',
      description: 'Urgent feature implementation',
      priority: 'P1',
      createdAt: new Date(now - 25 * 60000).toISOString(), // Started 25 min ago
      deadline: new Date(now + 5 * 60000).toISOString() // Deadline in 5 min
    },
    {
      id: 'task-normal',
      type: 'implementation',
      description: 'Normal feature implementation',
      priority: 'P2',
      createdAt: new Date(now - 10 * 60000).toISOString(), // Started 10 min ago
      deadline: new Date(now + 50 * 60000).toISOString() // Deadline in 50 min
    },
    {
      id: 'task-low',
      type: 'documentation',
      description: 'Update documentation',
      priority: 'P3',
      createdAt: new Date(now - 5 * 60000).toISOString(), // Started 5 min ago
      deadline: new Date(now + 120 * 60000).toISOString() // Deadline in 2 hours
    }
  ];

  console.log('Scheduling Tasks with Deadlines:\n');
  for (const task of tasks) {
    const check = scheduler.canAcceptTask(task);
    if (check.feasible) {
      const decision = scheduler.scheduleTask(task);
      const timeToDeadline = new Date(task.deadline).getTime() - Date.now();

      console.log(`${task.id}:`);
      console.log(`  Time to Deadline: ${(timeToDeadline / 60000).toFixed(1)} minutes`);
      console.log(`  Priority Score: ${decision.priority.toFixed(2)}`);
      console.log(`  Queue Position: ${decision.queuePosition + 1}`);
      console.log(`  SLA Component: ${decision.priorityScore ? 'Included' : 'N/A'}`);
    }
  }

  console.log('\nNote: Task with approaching deadline gets higher priority');

  scheduler.stop();
}

/**
 * Example 4: Resource-Constrained Scenario
 */
function example4_ResourceConstraints() {
  console.log('\n=== Example 4: Resource-Constrained Scenario ===\n');

  // Create scheduler with limited resources
  const scheduler = createIntelligentScheduler({
    maxMemoryMB: 2000,  // Only 2GB
    maxConcurrentTasks: 3,  // Only 3 concurrent tasks
    tokenBudgetPerHour: 100000  // Limited token budget
  });

  console.log('System Capacity:');
  const capacity = scheduler.getSystemCapacity();
  console.log('  Max Memory:', capacity.resources.memory.limitMB, 'MB');
  console.log('  Max Workers:', capacity.resources.workers.max);
  console.log('  Token Budget:', capacity.resources.tokens.hourly.limit);

  // Try to schedule multiple large tasks
  console.log('\nAttempting to schedule tasks:\n');
  for (let i = 1; i <= 5; i++) {
    const task = {
      id: `task-${i}`,
      type: 'implementation',
      description: `Large implementation task ${i} with significant resource requirements`,
      priority: 'P2',
      createdAt: new Date().toISOString()
    };

    const check = scheduler.canAcceptTask(task);
    console.log(`Task ${i}:`);
    console.log(`  Feasible: ${check.feasible}`);

    if (check.feasible) {
      const decision = scheduler.scheduleTask(task);
      console.log(`  Scheduled at position ${decision.queuePosition + 1}`);
      scheduler.startTask(task.id); // Mark as running
    } else {
      console.log(`  Rejected: ${check.reason}`);
      if (check.estimatedWaitTimeMs) {
        console.log(`  Estimated Wait: ${(check.estimatedWaitTimeMs / 1000).toFixed(0)} seconds`);
      }
    }
  }

  const stats = scheduler.getStats();
  console.log('\nFinal Statistics:');
  console.log('  Accepted:', stats.scheduler.acceptedTasks);
  console.log('  Rejected:', stats.scheduler.rejectedTasks);
  console.log('  Rejection Reasons:', stats.scheduler.rejectionReasons);

  scheduler.stop();
}

/**
 * Example 5: ML Training and Prediction Improvement
 */
function example5_MLTraining() {
  console.log('\n=== Example 5: ML Training and Prediction ===\n');

  const scheduler = createIntelligentScheduler({
    minSamplesForML: 5  // Low threshold for demo
  });

  console.log('Initial Predictor State:');
  let stats = scheduler.getStats();
  console.log('  Training Samples:', stats.predictor.training.totalRecords);
  console.log('  ML Predictions:', stats.predictor.predictions.mlPredictions);
  console.log('  Heuristic Predictions:', stats.predictor.predictions.heuristicPredictions);

  // Simulate multiple task completions
  console.log('\nSimulating task completions to train ML model...\n');
  const taskTypes = ['implementation', 'security', 'documentation'];

  for (let i = 0; i < 10; i++) {
    const taskType = taskTypes[i % taskTypes.length];
    const task = {
      id: `training-task-${i}`,
      type: taskType,
      description: `${taskType} task for training purposes`,
      priority: 'P2',
      createdAt: new Date().toISOString()
    };

    const check = scheduler.canAcceptTask(task);
    if (check.feasible) {
      scheduler.scheduleTask(task);
      scheduler.startTask(task.id);

      // Simulate actual resource usage with some variation
      const baseMemory = taskType === 'implementation' ? 800 : taskType === 'security' ? 600 : 400;
      const actualMemory = baseMemory + (Math.random() * 200 - 100);

      scheduler.reportOutcome(task.id, {
        memoryMB: actualMemory,
        cpuSeconds: 120 + Math.random() * 60,
        tokens: 30000 + Math.random() * 20000,
        durationMs: 180000 + Math.random() * 60000
      });
    }
  }

  // Check updated stats
  console.log('After Training:');
  stats = scheduler.getStats();
  console.log('  Training Samples:', stats.predictor.training.totalRecords);
  console.log('  ML Predictions:', stats.predictor.predictions.mlPredictions);
  console.log('  Heuristic Predictions:', stats.predictor.predictions.heuristicPredictions);

  // Test prediction
  console.log('\nTesting Prediction:');
  const testTask = {
    type: 'implementation',
    description: 'Test implementation task',
    priority: 'P2'
  };

  const prediction = scheduler.canAcceptTask(testTask);
  console.log('  Prediction Method:', prediction.predictionMethod);
  console.log('  Estimated Memory:', prediction.estimatedResources.memoryMB, 'MB');
  console.log('  Estimated Tokens:', prediction.estimatedResources.tokens);

  // Get accuracy metrics
  const accuracy = scheduler.getAccuracyMetrics();
  if (accuracy) {
    console.log('\nPrediction Accuracy:');
    console.log('  Memory MAPE:', accuracy.memoryMB.mape?.toFixed(2), '%');
    console.log('  Token MAPE:', accuracy.tokens.mape?.toFixed(2), '%');
  }

  scheduler.stop();
}

/**
 * Example 6: Monitoring and Events
 */
function example6_Monitoring() {
  console.log('\n=== Example 6: Monitoring and Events ===\n');

  const scheduler = createIntelligentScheduler();

  // Set up event listeners
  scheduler.on('task-scheduled', (decision) => {
    console.log(`[EVENT] Task Scheduled: ${decision.taskId}`);
    console.log(`        Priority: ${decision.priority.toFixed(2)}`);
  });

  scheduler.on('task-started', ({ taskId }) => {
    console.log(`[EVENT] Task Started: ${taskId}`);
  });

  scheduler.on('task-completed', ({ taskId, accuracy }) => {
    console.log(`[EVENT] Task Completed: ${taskId}`);
    if (accuracy) {
      console.log(`        Memory Error: ${accuracy.memoryErrorPercent.toFixed(1)}%`);
    }
  });

  scheduler.on('health-check', ({ capacity, queueDepth }) => {
    console.log(`[EVENT] Health Check:`);
    console.log(`        Available Memory: ${capacity.resources.memory.availableMB} MB`);
    console.log(`        Queue Depth: ${queueDepth}`);
  });

  // Schedule some tasks
  console.log('Scheduling tasks...\n');
  const task = {
    id: 'monitor-task-1',
    type: 'implementation',
    description: 'Task for monitoring demo',
    priority: 'P1'
  };

  const check = scheduler.canAcceptTask(task);
  if (check.feasible) {
    scheduler.scheduleTask(task);
    scheduler.startTask(task.id);

    setTimeout(() => {
      scheduler.reportOutcome(task.id, {
        memoryMB: 700,
        cpuSeconds: 150,
        tokens: 40000,
        durationMs: 250000
      });

      setTimeout(() => {
        scheduler.stop();
      }, 100);
    }, 100);
  }
}

/**
 * Example 7: Production Integration Pattern
 */
function example7_ProductionIntegration() {
  console.log('\n=== Example 7: Production Integration ===\n');

  class TaskExecutor {
    constructor(config) {
      this.scheduler = createIntelligentScheduler(config);
      this.setupMonitoring();
    }

    setupMonitoring() {
      this.scheduler.on('task-scheduled', (decision) => {
        this.logMetric('task.scheduled', {
          taskId: decision.taskId,
          priority: decision.priority,
          queuePosition: decision.queuePosition
        });
      });

      this.scheduler.on('task-completed', ({ taskId, accuracy }) => {
        this.logMetric('task.completed', { taskId, accuracy });
      });

      // Periodic health checks
      setInterval(() => {
        const stats = this.scheduler.getStats();
        const capacity = this.scheduler.getSystemCapacity();

        console.log('\n[HEALTH]', new Date().toISOString());
        console.log('  Acceptance Rate:',
          (stats.scheduler.acceptedTasks / stats.scheduler.totalRequests * 100).toFixed(1), '%');
        console.log('  Memory Usage:',
          capacity.health.memoryPercent.toFixed(1), '%');
        console.log('  Queue Depth:', stats.priority.queueDepth);

        // Alert if unhealthy
        if (!capacity.health.healthy) {
          console.log('  [ALERT] System unhealthy!');
        }
      }, 5000);
    }

    async submitTask(task) {
      // Validate task
      if (!task.id || !task.type) {
        throw new Error('Invalid task: missing required fields');
      }

      // Check admission
      const check = await this.scheduler.canAcceptTask(task);

      if (!check.feasible) {
        throw new Error(`Task rejected: ${check.reason}`);
      }

      // Schedule
      const decision = this.scheduler.scheduleTask(task);
      console.log(`\n[SUBMIT] Task ${task.id} scheduled`);
      console.log(`         Priority: ${decision.priority.toFixed(2)}`);
      console.log(`         Estimated Memory: ${check.estimatedResources.memoryMB} MB`);

      return decision;
    }

    async executeTask(task) {
      const startTime = Date.now();

      try {
        this.scheduler.startTask(task.id);
        console.log(`[EXECUTE] Task ${task.id} started`);

        // Simulate execution
        await new Promise(resolve => setTimeout(resolve, 100));

        // Report success
        const actualResources = {
          memoryMB: 650 + Math.random() * 200,
          cpuSeconds: 140 + Math.random() * 40,
          tokens: 35000 + Math.random() * 10000,
          durationMs: Date.now() - startTime
        };

        const result = this.scheduler.reportOutcome(task.id, actualResources);
        console.log(`[COMPLETE] Task ${task.id} finished`);

        if (result.accuracy) {
          console.log(`           Memory prediction error: ${result.accuracy.memoryErrorPercent.toFixed(1)}%`);
        }

        return { success: true };
      } catch (error) {
        console.error(`[ERROR] Task ${task.id} failed:`, error.message);
        throw error;
      }
    }

    logMetric(metric, data) {
      // In production, send to monitoring system
      // console.log(`[METRIC] ${metric}:`, data);
    }

    shutdown() {
      this.scheduler.stop();
      console.log('\n[SHUTDOWN] Executor stopped');
    }
  }

  // Use the executor
  const executor = new TaskExecutor({
    maxMemoryMB: 12288,
    maxConcurrentTasks: 20
  });

  const task = {
    id: 'prod-task-1',
    type: 'implementation',
    description: 'Production task example',
    priority: 'P1'
  };

  executor.submitTask(task)
    .then(() => executor.executeTask(task))
    .then(() => {
      setTimeout(() => executor.shutdown(), 2000);
    })
    .catch(error => {
      console.error('Task failed:', error.message);
      executor.shutdown();
    });
}

// Run examples
if (require.main === module) {
  console.log('========================================');
  console.log('Intelligent Scheduler Examples');
  console.log('========================================');

  const examples = [
    example1_BasicScheduling,
    example2_PriorityQueue,
    example3_SlaAware,
    example4_ResourceConstraints,
    example5_MLTraining,
    example6_Monitoring,
    example7_ProductionIntegration
  ];

  // Run one example at a time
  let currentExample = 0;

  function runNext() {
    if (currentExample < examples.length) {
      setTimeout(() => {
        examples[currentExample]();
        currentExample++;
        setTimeout(runNext, 3000);
      }, 1000);
    } else {
      console.log('\n========================================');
      console.log('All examples completed!');
      console.log('========================================\n');
      process.exit(0);
    }
  }

  runNext();
}

module.exports = {
  example1_BasicScheduling,
  example2_PriorityQueue,
  example3_SlaAware,
  example4_ResourceConstraints,
  example5_MLTraining,
  example6_Monitoring,
  example7_ProductionIntegration
};
