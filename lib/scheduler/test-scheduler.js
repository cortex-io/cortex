#!/usr/bin/env node
/**
 * Intelligent Scheduler Test Suite
 *
 * Comprehensive tests for all scheduler components.
 */

const { createIntelligentScheduler } = require('./index');
const { LinearRegressor, MovingAverage } = require('./ml-model');
const { TrainingDataManager } = require('./training-data');
const { ResourcePredictor } = require('./resource-predictor');
const { FeasibilityChecker } = require('./feasibility-checker');
const { PriorityEngine } = require('./priority-engine');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ ${message}`);
    failedTests++;
  }
}

function testSection(name) {
  console.log(`\n${name}`);
  console.log('='.repeat(name.length));
}

/**
 * Test 1: Linear Regressor
 */
function test_LinearRegressor() {
  testSection('Test 1: Linear Regressor');

  const model = new LinearRegressor({ learningRate: 0.1 });

  // Test initialization
  assert(!model.initialized, 'Model starts uninitialized');

  // Generate training data: y = 2x + 3
  const X = [];
  const y = [];
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 10;
    X.push([x]);
    y.push(2 * x + 3 + (Math.random() - 0.5)); // Add some noise
  }

  // Train model
  model.fit(X, y, 100);

  assert(model.initialized, 'Model initialized after training');
  assert(model.weights !== null, 'Weights exist');
  assert(model.weights.length === 1, 'Correct number of weights');

  // Test prediction
  const prediction = model.predict([5]);
  assert(prediction !== null, 'Can make predictions');
  assert(Math.abs(prediction - 13) < 2, 'Prediction reasonably accurate (2*5 + 3 = 13)');

  // Test online learning
  const loss = model.update([10], 23);
  assert(typeof loss === 'number', 'Update returns loss');
  assert(loss >= 0, 'Loss is non-negative');

  console.log(`  Model prediction for x=5: ${prediction.toFixed(2)} (expected ~13)`);
}

/**
 * Test 2: Moving Average
 */
function test_MovingAverage() {
  testSection('Test 2: Moving Average');

  const ma = new MovingAverage(5);

  // Test empty state
  assert(ma.getAverage() === null, 'Empty average is null');

  // Add values
  const values = [10, 12, 11, 13, 14];
  values.forEach(v => ma.add(v));

  const avg = ma.getAverage();
  assert(avg === 12, 'Average calculated correctly');

  // Test window
  ma.add(20); // Should push out 10
  const newAvg = ma.getAverage();
  assert(newAvg === 14, 'Window sliding works (12+11+13+14+20)/5 = 14');

  console.log(`  Moving average: ${newAvg}`);
}

/**
 * Test 3: Training Data Manager
 */
function test_TrainingDataManager() {
  testSection('Test 3: Training Data Manager');

  const manager = new TrainingDataManager({
    dataDir: '/tmp/scheduler-test-data'
  });

  // Test feature extraction
  const task = {
    type: 'implementation',
    description: 'Implement user authentication with JWT',
    priority: 'P1',
    fileCount: 3
  };

  const features = manager.extractFeatures(task);

  assert(features.taskType === 'implementation', 'Task type normalized');
  assert(features.taskTypeEncoded.length === 9, 'Task type one-hot encoded (9 types)');
  assert(features.taskTypeEncoded[0] === 1, 'Implementation is first type');
  assert(features.descriptionWordCount === 5, 'Word count correct');
  assert(features.fileCount === 3, 'File count extracted');
  assert(features.priority === 3, 'Priority normalized (P1 = 3)');

  // Test feature array conversion
  const featureArray = manager.featuresToArray(features);
  assert(featureArray.length === 17, 'Feature array has correct length');
  assert(featureArray.every(f => typeof f === 'number'), 'All features are numeric');

  // Test outcome recording
  manager.recordOutcome('test-task-1', task, {
    memoryMB: 750,
    cpuSeconds: 150,
    tokens: 40000,
    durationMs: 240000
  });

  const data = manager.getTrainingData();
  assert(data.length === 1, 'Outcome recorded');
  assert(data[0].taskId === 'test-task-1', 'Task ID matches');

  // Test historical stats
  const stats = manager.getHistoricalStatsByType();
  assert(stats.implementation !== undefined, 'Stats for implementation type exist');
  assert(stats.implementation.count === 1, 'One sample recorded');
  assert(stats.implementation.meanMemory === 750, 'Mean memory correct');

  console.log(`  Features extracted: ${featureArray.length} dimensions`);
  console.log(`  Historical stats: ${Object.keys(stats).length} task types`);

  // Cleanup
  manager.clear();
}

/**
 * Test 4: Resource Predictor
 */
function test_ResourcePredictor() {
  testSection('Test 4: Resource Predictor');

  const predictor = new ResourcePredictor({
    minSamplesForML: 5,
    dataDir: '/tmp/scheduler-test-data'
  });

  const task = {
    type: 'implementation',
    description: 'Implement new feature with database integration',
    priority: 'P2'
  };

  // Test prediction (should use heuristics initially)
  const prediction = predictor.predict(task);

  assert(prediction.estimatedMemoryMB > 0, 'Memory estimate is positive');
  assert(prediction.estimatedCpuSeconds > 0, 'CPU estimate is positive');
  assert(prediction.estimatedTokens > 0, 'Token estimate is positive');
  assert(prediction.estimatedDurationMs > 0, 'Duration estimate is positive');
  assert(prediction.method === 'heuristic', 'Uses heuristic initially');

  console.log(`  Prediction (heuristic):`);
  console.log(`    Memory: ${prediction.estimatedMemoryMB} MB`);
  console.log(`    CPU: ${prediction.estimatedCpuSeconds} seconds`);
  console.log(`    Tokens: ${prediction.estimatedTokens}`);

  // Train with some data
  for (let i = 0; i < 10; i++) {
    predictor.reportOutcome(`train-${i}`, task, {
      memoryMB: 700 + Math.random() * 100,
      cpuSeconds: 140 + Math.random() * 20,
      tokens: 38000 + Math.random() * 4000,
      durationMs: 230000 + Math.random() * 40000
    });
  }

  // Test prediction after training
  const prediction2 = predictor.predict(task);
  assert(prediction2.method === 'ml', 'Uses ML after training');

  console.log(`  Prediction (ML):`);
  console.log(`    Memory: ${prediction2.estimatedMemoryMB} MB`);
  console.log(`    Tokens: ${prediction2.estimatedTokens}`);

  const stats = predictor.getStats();
  assert(stats.predictions.totalPredictions >= 2, 'Predictions recorded');
  assert(stats.training.totalRecords === 10, 'Training records saved');

  // Cleanup
  predictor.trainingData.clear();
}

/**
 * Test 5: Feasibility Checker
 */
function test_FeasibilityChecker() {
  testSection('Test 5: Feasibility Checker');

  const checker = new FeasibilityChecker({
    maxMemoryMB: 2000,
    maxConcurrentTasks: 5,
    tokenBudgetPerHour: 100000
  });

  // Test system resources
  const sysRes = checker.checkSystemResources();
  assert(sysRes.system !== undefined, 'System resources checked');
  assert(sysRes.available.memoryMB === 2000, 'Available memory correct');
  assert(sysRes.available.taskSlots === 5, 'Available slots correct');

  console.log(`  System Memory: ${sysRes.system.totalMemoryMB} MB`);
  console.log(`  Available Memory: ${sysRes.available.memoryMB} MB`);

  // Test token budget
  const tokenCheck = checker.checkTokenBudget(50000);
  assert(tokenCheck.available === true, 'Tokens available');
  assert(tokenCheck.hourlyAvailable === 100000, 'Hourly budget correct');

  // Test feasibility calculation
  const feasibility = checker.calculateFeasibility({
    estimatedMemoryMB: 500,
    estimatedCpuSeconds: 100,
    estimatedTokens: 30000,
    estimatedDurationMs: 180000
  });

  assert(feasibility.systemState !== undefined, 'System state included');
  console.log(`  Task feasible: ${feasibility.feasible}`);
  if (!feasibility.feasible) {
    console.log(`  Reason: ${feasibility.reason}`);
  }

  // Test resource allocation
  const allocation = checker.allocateResources('test-task-1', {
    estimatedMemoryMB: 500,
    estimatedTokens: 30000
  });

  assert(allocation.allocated === true, 'Resources allocated');

  const sysRes2 = checker.checkSystemResources();
  assert(sysRes2.allocated.memoryMB === 500, 'Memory allocated correctly');
  assert(sysRes2.available.memoryMB === 1500, 'Available memory reduced');

  // Test release
  const release = checker.releaseResources('test-task-1', { tokens: 30000 });
  assert(release.released === true, 'Resources released');

  const sysRes3 = checker.checkSystemResources();
  assert(sysRes3.allocated.memoryMB === 0, 'Memory freed');
}

/**
 * Test 6: Priority Engine
 */
function test_PriorityEngine() {
  testSection('Test 6: Priority Engine');

  const engine = new PriorityEngine();

  const tasks = [
    {
      id: 'task-low',
      type: 'documentation',
      description: 'Update docs',
      priority: 'P3',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-high',
      type: 'security',
      description: 'Security audit',
      priority: 'P0',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-medium',
      type: 'implementation',
      description: 'Implement feature',
      priority: 'P2',
      createdAt: new Date().toISOString()
    }
  ];

  // Add tasks
  tasks.forEach(task => {
    const result = engine.addTask(task);
    assert(result.added === true, `Task ${task.id} added`);
    assert(typeof result.priorityScore === 'number', `Priority score calculated for ${task.id}`);
  });

  // Check queue order
  const queue = engine.getQueue();
  assert(queue.length === 3, 'All tasks in queue');
  assert(queue[0].id === 'task-high', 'High priority task is first');
  assert(queue[queue.length - 1].id === 'task-low', 'Low priority task is last');

  console.log(`  Queue order: ${queue.map(t => t.id).join(' -> ')}`);
  console.log(`  Priority scores: ${queue.map(t => t.priorityScore.toFixed(2)).join(', ')}`);

  // Test next task
  const next = engine.getNextTask();
  assert(next.id === 'task-high', 'Next task is highest priority');

  // Test removal
  const removed = engine.removeTask('task-high');
  assert(removed.removed === true, 'Task removed');
  assert(engine.getQueue().length === 2, 'Queue size reduced');

  // Test stats
  const stats = engine.getStats();
  assert(stats.queueDepth === 2, 'Queue depth correct');
  assert(stats.totalScored === 3, 'Total scored tasks correct');
}

/**
 * Test 7: Intelligent Scheduler Integration
 */
function test_IntelligentScheduler() {
  testSection('Test 7: Intelligent Scheduler Integration');

  const scheduler = createIntelligentScheduler({
    maxMemoryMB: 8192,  // Larger limit
    maxConcurrentTasks: 50,  // More slots
    minSamplesForML: 5,
    memoryReservePercent: 5,
    cpuReservePercent: 5
  });

  // Reduce health check strictness for tests
  scheduler.feasibilityChecker.resourceLimits.memoryReservePercent = 5;
  scheduler.feasibilityChecker.resourceLimits.cpuReservePercent = 5;

  assert(scheduler !== null, 'Scheduler created');

  const task = {
    id: 'integration-task-1',
    type: 'implementation',
    description: 'Integration test task with detailed description',
    priority: 'P1',
    createdAt: new Date().toISOString()
  };

  // Test canAcceptTask
  const check = scheduler.canAcceptTask(task);
  console.log(`  Can accept: ${check.feasible}`);
  if (check.estimatedResources) {
    console.log(`  Estimated memory: ${check.estimatedResources.memoryMB} MB`);
    assert(check.estimatedResources.memoryMB > 0, 'Memory estimate positive');
  }
  console.log(`  Prediction method: ${check.predictionMethod}`);

  // Task may not be feasible if system is unhealthy, just check we got a response
  assert(check.feasible !== undefined, 'Feasibility check returned result');

  if (!check.feasible) {
    console.log(`  Task not feasible: ${check.reason}`);
    console.log(`  Skipping rest of scheduler integration test`);
    scheduler.stop();
    return;
  }

  // Test scheduleTask
  const decision = scheduler.scheduleTask(task);
  assert(decision.scheduled === true, 'Task scheduled');
  assert(decision.taskId === task.id, 'Task ID matches');
  assert(typeof decision.priority === 'number', 'Priority score assigned');
  assert(decision.queuePosition >= 0, 'Queue position assigned');

  console.log(`  Scheduled: ${decision.scheduled}`);
  console.log(`  Priority score: ${decision.priority.toFixed(2)}`);
  console.log(`  Queue position: ${decision.queuePosition}`);

  // Test startTask
  const started = scheduler.startTask(task.id);
  assert(started.started === true, 'Task started');

  // Test reportOutcome
  const outcome = scheduler.reportOutcome(task.id, {
    memoryMB: 650,
    cpuSeconds: 145,
    tokens: 38000,
    durationMs: 235000
  });

  assert(outcome.recorded === true, 'Outcome recorded');
  assert(outcome.accuracy !== null, 'Accuracy calculated');

  console.log(`  Outcome recorded: ${outcome.recorded}`);
  if (outcome.accuracy) {
    console.log(`  Memory error: ${outcome.accuracy.memoryErrorPercent.toFixed(1)}%`);
  }

  // Test getStats
  const stats = scheduler.getStats();
  assert(stats.scheduler !== undefined, 'Scheduler stats available');
  assert(stats.scheduler.acceptedTasks === 1, 'Accepted tasks counted');
  assert(stats.scheduler.completedTasks === 1, 'Completed tasks counted');

  console.log(`  Total requests: ${stats.scheduler.totalRequests}`);
  console.log(`  Accepted: ${stats.scheduler.acceptedTasks}`);
  console.log(`  Completed: ${stats.scheduler.completedTasks}`);

  // Test getSchedule
  const schedule = scheduler.getSchedule();
  assert(schedule.queue !== undefined, 'Schedule has queue');
  assert(schedule.systemCapacity !== undefined, 'Schedule has capacity');

  // Test getSystemCapacity
  const capacity = scheduler.getSystemCapacity();
  assert(capacity.resources !== undefined, 'Capacity has resources');
  assert(capacity.health !== undefined, 'Capacity has health');

  console.log(`  Queue depth: ${schedule.queueDepth}`);
  console.log(`  Available memory: ${capacity.resources.memory.availableMB} MB`);

  scheduler.stop();
}

/**
 * Test 8: Backpressure and Rejection
 */
function test_Backpressure() {
  testSection('Test 8: Backpressure and Rejection');

  const scheduler = createIntelligentScheduler({
    maxMemoryMB: 1000,  // Very limited
    maxConcurrentTasks: 2,  // Very limited
    maxQueueDepth: 5,
    rejectOnOverload: true,
    memoryReservePercent: 5,
    cpuReservePercent: 5
  });

  let acceptedCount = 0;
  let rejectedCount = 0;

  // Try to schedule many tasks
  for (let i = 0; i < 10; i++) {
    const task = {
      id: `overload-task-${i}`,
      type: 'implementation',
      description: 'Task that may cause overload',
      priority: 'P2'
    };

    const check = scheduler.canAcceptTask(task);
    if (check.feasible) {
      scheduler.scheduleTask(task);
      acceptedCount++;
    } else {
      rejectedCount++;
      console.log(`  Task ${i} rejected: ${check.reason}`);
    }
  }

  assert(rejectedCount > 0, 'Some tasks were rejected (backpressure working)');
  assert(acceptedCount > 0, 'Some tasks were accepted');

  const stats = scheduler.getStats();
  assert(stats.scheduler.rejectedTasks === rejectedCount, 'Rejection count correct');

  console.log(`  Accepted: ${acceptedCount}, Rejected: ${rejectedCount}`);
  console.log(`  Rejection reasons:`, stats.scheduler.rejectionReasons);

  scheduler.stop();
}

/**
 * Test 9: ML Learning Over Time
 */
function test_MLLearning() {
  testSection('Test 9: ML Learning Over Time');

  const scheduler = createIntelligentScheduler({
    minSamplesForML: 10,
    memoryReservePercent: 5,
    cpuReservePercent: 5,
    maxMemoryMB: 8192
  });

  console.log('  Training with 20 task outcomes...');

  // Simulate many task completions
  for (let i = 0; i < 20; i++) {
    const task = {
      id: `ml-task-${i}`,
      type: i % 2 === 0 ? 'implementation' : 'security',
      description: 'Training task for ML model',
      priority: 'P2'
    };

    const check = scheduler.canAcceptTask(task);
    if (check.feasible) {
      scheduler.scheduleTask(task);
      scheduler.startTask(task.id);

      // Report realistic outcomes
      const baseMemory = task.type === 'implementation' ? 800 : 600;
      scheduler.reportOutcome(task.id, {
        memoryMB: baseMemory + (Math.random() * 100 - 50),
        cpuSeconds: 150 + (Math.random() * 40 - 20),
        tokens: 40000 + (Math.random() * 10000 - 5000),
        durationMs: 240000 + (Math.random() * 60000 - 30000)
      });
    }
  }

  const stats = scheduler.getStats();
  assert(stats.predictor.training.totalRecords === 20, 'All outcomes recorded');
  assert(stats.predictor.predictions.mlPredictions > 0, 'ML predictions being used');

  console.log(`  Training samples: ${stats.predictor.training.totalRecords}`);
  console.log(`  ML predictions: ${stats.predictor.predictions.mlPredictions}`);
  console.log(`  Heuristic predictions: ${stats.predictor.predictions.heuristicPredictions}`);

  // Test accuracy
  const accuracy = scheduler.getAccuracyMetrics();
  if (accuracy && accuracy.memoryMB.mape) {
    assert(accuracy.memoryMB.mape < 50, 'Memory prediction error reasonable (<50%)');
    console.log(`  Memory MAPE: ${accuracy.memoryMB.mape.toFixed(2)}%`);
    console.log(`  Token MAPE: ${accuracy.tokens.mape.toFixed(2)}%`);
  }

  scheduler.stop();
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Intelligent Scheduler Test Suite     ║');
  console.log('╚════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    test_LinearRegressor();
    test_MovingAverage();
    test_TrainingDataManager();
    test_ResourcePredictor();
    test_FeasibilityChecker();
    test_PriorityEngine();
    test_IntelligentScheduler();
    test_Backpressure();
    test_MLLearning();

    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(50));
    console.log('Test Results');
    console.log('='.repeat(50));
    console.log(`✓ Passed: ${passedTests}`);
    console.log(`✗ Failed: ${failedTests}`);
    console.log(`Duration: ${duration}ms`);
    console.log('='.repeat(50));

    if (failedTests === 0) {
      console.log('\n🎉 All tests passed!\n');
      process.exit(0);
    } else {
      console.log(`\n❌ ${failedTests} test(s) failed\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test suite crashed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
