#!/usr/bin/env node
/**
 * Quick Demo of Intelligent Scheduler
 */

const { createIntelligentScheduler } = require('./index');

console.log('╔══════════════════════════════════════════════════╗');
console.log('║   Cortex Intelligent Scheduler - Quick Demo     ║');
console.log('╚══════════════════════════════════════════════════╝\n');

// Create scheduler
const scheduler = createIntelligentScheduler({
  maxMemoryMB: 8192,
  maxConcurrentTasks: 30,
  tokenBudgetPerHour: 500000,
  minSamplesForML: 5
});

console.log('📊 Scheduler Configuration:');
console.log('  Max Memory: 8192 MB');
console.log('  Max Concurrent Tasks: 30');
console.log('  Token Budget: 500K/hour\n');

// Define sample tasks
const tasks = [
  {
    id: 'sec-001',
    type: 'security',
    description: 'Security audit of authentication module with comprehensive testing',
    priority: 'P0',
    createdAt: new Date(Date.now() - 10 * 60000).toISOString()
  },
  {
    id: 'impl-001',
    type: 'implementation',
    description: 'Implement new REST API endpoint for user management',
    priority: 'P1',
    createdAt: new Date(Date.now() - 5 * 60000).toISOString()
  },
  {
    id: 'doc-001',
    type: 'documentation',
    description: 'Update API documentation and examples',
    priority: 'P3',
    createdAt: new Date(Date.now() - 2 * 60000).toISOString()
  },
  {
    id: 'fix-001',
    type: 'fix',
    description: 'Fix critical bug in payment processing workflow',
    priority: 'P0',
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    deadline: new Date(Date.now() + 10 * 60000).toISOString() // Urgent: 10 min deadline
  }
];

console.log('📝 Submitting Tasks:\n');

// Submit tasks
for (const task of tasks) {
  const check = scheduler.canAcceptTask(task);

  console.log(`${task.id} [${task.priority}] - ${task.type}`);
  console.log(`  Feasible: ${check.feasible ? '✅' : '❌'}`);

  if (check.feasible) {
    console.log(`  Estimated Resources:`);
    console.log(`    Memory: ${check.estimatedResources.memoryMB} MB`);
    console.log(`    Tokens: ${check.estimatedResources.tokens.toLocaleString()}`);
    console.log(`    Duration: ${(check.estimatedResources.durationMs / 1000).toFixed(0)}s`);
    console.log(`  Method: ${check.predictionMethod}`);

    const decision = scheduler.scheduleTask(task);
    console.log(`  ✓ Scheduled with priority score: ${decision.priority.toFixed(2)}`);
    console.log(`  Queue position: ${decision.queuePosition + 1} of ${decision.queueSize}`);
  } else {
    console.log(`  ✗ Rejected: ${check.reason}`);
  }
  console.log('');
}

// Show prioritized queue
console.log('🎯 Prioritized Task Queue:\n');
const schedule = scheduler.getSchedule();
schedule.queue.forEach((task, index) => {
  const urgency = task.deadline ? ' [URGENT]' : '';
  console.log(`  ${index + 1}. ${task.id} - Score: ${task.priorityScore.toFixed(2)}${urgency}`);
});

// Show system capacity
console.log('\n💾 System Capacity:\n');
const capacity = scheduler.getSystemCapacity();
console.log(`  Memory:`);
console.log(`    Total: ${capacity.resources.memory.totalMB.toLocaleString()} MB`);
console.log(`    Available: ${capacity.resources.memory.availableMB.toLocaleString()} MB`);
console.log(`    Allocated: ${capacity.resources.memory.allocatedMB.toLocaleString()} MB`);
console.log(`  Workers:`);
console.log(`    Available: ${capacity.resources.workers.available} / ${capacity.resources.workers.max}`);
console.log(`  Tokens:`);
console.log(`    Hourly Used: ${capacity.resources.tokens.hourly.used.toLocaleString()} / ${capacity.resources.tokens.hourly.limit.toLocaleString()}`);

// Show statistics
console.log('\n📈 Scheduler Statistics:\n');
const stats = scheduler.getStats();
console.log(`  Total Requests: ${stats.scheduler.totalRequests}`);
console.log(`  Accepted: ${stats.scheduler.acceptedTasks}`);
console.log(`  Rejected: ${stats.scheduler.rejectedTasks}`);
if (stats.scheduler.rejectedTasks > 0) {
  console.log(`  Rejection Reasons:`, stats.scheduler.rejectionReasons);
}
console.log(`  Training Samples: ${stats.predictor.training.totalRecords}`);

// Simulate task completion
console.log('\n⚡ Simulating Task Execution:\n');

const nextTask = scheduler.getNextTask();
if (nextTask) {
  console.log(`  Executing: ${nextTask.task.id}`);
  scheduler.startTask(nextTask.task.id);

  // Simulate completion with realistic resource usage
  setTimeout(() => {
    const actualResources = {
      memoryMB: 550,
      cpuSeconds: 125,
      tokens: 28000,
      durationMs: 180000
    };

    const outcome = scheduler.reportOutcome(nextTask.task.id, actualResources);

    console.log(`  ✓ Task completed`);
    if (outcome.accuracy) {
      console.log(`  Prediction Accuracy:`);
      console.log(`    Memory Error: ${outcome.accuracy.memoryErrorPercent.toFixed(1)}%`);
      console.log(`    Token Error: ${outcome.accuracy.tokenErrorPercent.toFixed(1)}%`);
    }

    // Final stats
    console.log('\n📊 Final Statistics:\n');
    const finalStats = scheduler.getStats();
    console.log(`  Completed Tasks: ${finalStats.scheduler.completedTasks}`);
    console.log(`  ML Predictions: ${finalStats.predictor.predictions.mlPredictions}`);
    console.log(`  Heuristic Predictions: ${finalStats.predictor.predictions.heuristicPredictions}`);

    console.log('\n✨ Demo Complete!\n');
    console.log('The scheduler is now ready for production use.');
    console.log('As tasks complete, the ML models will improve prediction accuracy.\n');

    scheduler.stop();
    process.exit(0);
  }, 100);
} else {
  console.log('  No tasks in queue\n');
  scheduler.stop();
  process.exit(0);
}
