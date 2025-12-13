#!/usr/bin/env node
/**
 * Resource Estimator
 *
 * Predicts resource requirements for tasks:
 * - Token budget (based on complexity and contractor)
 * - Time estimates (minutes)
 * - Worker count needed
 * - Parallel execution planning
 *
 * Uses historical data and heuristics.
 */

const fs = require('fs');
const path = require('path');

class ResourceEstimator {
  constructor(options = {}) {
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || path.join(__dirname, '../..');

    // Base resource allocations per complexity level
    this.baseTokens = {
      1: 2000,   // Trivial
      2: 3000,   // Very simple
      3: 5000,   // Simple
      4: 8000,   // Below medium
      5: 12000,  // Medium
      6: 15000,  // Above medium
      7: 20000,  // Complex
      8: 30000,  // Very complex
      9: 45000,  // Extremely complex
      10: 60000  // Maximum complexity
    };

    this.baseTime = {
      1: 5,      // 5 minutes
      2: 10,     // 10 minutes
      3: 15,     // 15 minutes
      4: 25,     // 25 minutes
      5: 40,     // 40 minutes
      6: 60,     // 1 hour
      7: 90,     // 1.5 hours
      8: 120,    // 2 hours
      9: 180,    // 3 hours
      10: 240    // 4 hours
    };

    // Contractor-specific multipliers
    this.contractorMultipliers = {
      development: {
        tokens: 1.0,
        time: 1.0
      },
      security: {
        tokens: 1.2,  // Security tasks need more thorough analysis
        time: 1.3
      },
      inventory: {
        tokens: 0.8,  // Documentation tasks generally lighter
        time: 0.9
      },
      cicd: {
        tokens: 1.1,  // CI/CD tasks moderately complex
        time: 1.0
      }
    };

    // Load historical data if available
    this.historicalData = this._loadHistoricalData();
  }

  /**
   * Estimate resources for a task
   * @param {string} taskDescription
   * @param {number} complexityScore - 1-10
   * @param {string} contractor - Primary contractor
   * @param {number} supportingCount - Number of supporting contractors
   * @returns {Object} Resource estimates
   */
  estimate(taskDescription, complexityScore, contractor, supportingCount = 0) {
    // Get base estimates
    const baseTokenEstimate = this.estimateTokens(complexityScore);
    const baseTimeEstimate = this.estimateTime(complexityScore);

    // Apply contractor multipliers
    const multiplier = this.contractorMultipliers[contractor] || { tokens: 1.0, time: 1.0 };
    let tokens = Math.round(baseTokenEstimate * multiplier.tokens);
    let time = Math.round(baseTimeEstimate * multiplier.time);

    // Adjust for supporting contractors (add overhead)
    if (supportingCount > 0) {
      tokens += supportingCount * 3000; // 3k tokens per supporting contractor
      time += supportingCount * 15;      // 15 minutes overhead per contractor
    }

    // Estimate workers needed
    const workers = this._estimateWorkers(complexityScore, supportingCount);

    // Create parallel execution plan
    const parallelPlan = this._createParallelPlan(
      complexityScore,
      contractor,
      supportingCount,
      workers
    );

    // Check historical data for similar tasks
    const historicalAdjustment = this._getHistoricalAdjustment(
      taskDescription,
      contractor,
      complexityScore
    );

    if (historicalAdjustment) {
      tokens = Math.round(tokens * historicalAdjustment.tokenMultiplier);
      time = Math.round(time * historicalAdjustment.timeMultiplier);
    }

    return {
      tokens: tokens,
      time: time,
      workers: workers,
      parallelPlan: parallelPlan,
      breakdown: {
        base_tokens: baseTokenEstimate,
        base_time: baseTimeEstimate,
        contractor_multiplier: multiplier,
        supporting_overhead: {
          tokens: supportingCount * 3000,
          time: supportingCount * 15
        },
        historical_adjustment: historicalAdjustment
      }
    };
  }

  /**
   * Estimate tokens needed for complexity level
   * @param {number} complexityScore
   * @returns {number}
   */
  estimateTokens(complexityScore) {
    const score = Math.max(1, Math.min(10, Math.round(complexityScore)));
    return this.baseTokens[score];
  }

  /**
   * Estimate time needed for complexity level
   * @param {number} complexityScore
   * @returns {number} Minutes
   */
  estimateTime(complexityScore) {
    const score = Math.max(1, Math.min(10, Math.round(complexityScore)));
    return this.baseTime[score];
  }

  /**
   * Estimate number of workers needed
   * @private
   */
  _estimateWorkers(complexityScore, supportingCount) {
    let workers = 1; // Base: 1 worker

    // Complex tasks may need multiple workers
    if (complexityScore >= 7) {
      workers = Math.ceil(complexityScore / 3);
    }

    // Add workers for supporting contractors
    workers += supportingCount;

    return Math.min(workers, 5); // Cap at 5 workers
  }

  /**
   * Create parallel execution plan
   * @private
   */
  _createParallelPlan(complexityScore, contractor, supportingCount, workerCount) {
    if (complexityScore < 7 && supportingCount === 0) {
      // Simple task, sequential execution
      return {
        strategy: 'sequential',
        phases: [
          {
            phase: 'execution',
            workers: [{ contractor: contractor, worker_count: 1 }],
            estimated_time: this.estimateTime(complexityScore)
          }
        ]
      };
    }

    // Complex task or multiple contractors - parallel execution
    const plan = {
      strategy: 'parallel',
      phases: []
    };

    if (complexityScore >= 7) {
      // Phase 1: Planning
      plan.phases.push({
        phase: 'planning',
        workers: [{ contractor: contractor, worker_count: 1 }],
        estimated_time: Math.round(this.estimateTime(complexityScore) * 0.15)
      });

      // Phase 2: Parallel implementation
      const implementationWorkers = Math.ceil(workerCount * 0.7);
      plan.phases.push({
        phase: 'implementation',
        workers: [{ contractor: contractor, worker_count: implementationWorkers }],
        estimated_time: Math.round(this.estimateTime(complexityScore) * 0.6),
        parallel: true
      });

      // Phase 3: Integration and validation
      plan.phases.push({
        phase: 'validation',
        workers: [{ contractor: contractor, worker_count: 1 }],
        estimated_time: Math.round(this.estimateTime(complexityScore) * 0.25)
      });
    } else {
      // Medium complexity with supporting contractors
      plan.phases.push({
        phase: 'execution',
        workers: [
          { contractor: contractor, worker_count: 1 },
          ...(supportingCount > 0 ? [{ contractor: 'supporting', worker_count: supportingCount }] : [])
        ],
        estimated_time: this.estimateTime(complexityScore),
        parallel: supportingCount > 0
      });
    }

    return plan;
  }

  /**
   * Get historical adjustment based on past similar tasks
   * @private
   */
  _getHistoricalAdjustment(taskDescription, contractor, complexityScore) {
    if (!this.historicalData || this.historicalData.length === 0) {
      return null;
    }

    // Find similar tasks
    const similarTasks = this.historicalData.filter(task => {
      return (
        task.contractor === contractor &&
        Math.abs(task.complexity - complexityScore) <= 2 &&
        this._isSimilarTask(task.description, taskDescription)
      );
    });

    if (similarTasks.length === 0) {
      return null;
    }

    // Calculate average multipliers
    const avgTokenMultiplier = similarTasks.reduce((sum, task) => {
      const ratio = task.actual_tokens / task.estimated_tokens;
      return sum + ratio;
    }, 0) / similarTasks.length;

    const avgTimeMultiplier = similarTasks.reduce((sum, task) => {
      const ratio = task.actual_time / task.estimated_time;
      return sum + ratio;
    }, 0) / similarTasks.length;

    return {
      tokenMultiplier: avgTokenMultiplier,
      timeMultiplier: avgTimeMultiplier,
      sample_size: similarTasks.length,
      confidence: Math.min(similarTasks.length / 5, 1.0) // Max confidence at 5+ samples
    };
  }

  /**
   * Check if two tasks are similar
   * @private
   */
  _isSimilarTask(desc1, desc2) {
    const words1 = new Set(desc1.toLowerCase().split(/\s+/));
    const words2 = new Set(desc2.toLowerCase().split(/\s+/));

    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;
    return similarity > 0.3; // 30% word overlap
  }

  /**
   * Load historical task data
   * @private
   */
  _loadHistoricalData() {
    const historicalPath = path.join(
      this.cortexHome,
      'coordination/metrics/historical-task-data.jsonl'
    );

    if (!fs.existsSync(historicalPath)) {
      return [];
    }

    try {
      const lines = fs.readFileSync(historicalPath, 'utf8')
        .split('\n')
        .filter(l => l.trim());

      // Load last 100 tasks
      return lines.slice(-100).map(line => JSON.parse(line));
    } catch (error) {
      console.error('Error loading historical data:', error.message);
      return [];
    }
  }

  /**
   * Record actual resource usage for learning
   * @param {string} taskId
   * @param {Object} estimated
   * @param {Object} actual
   */
  recordActual(taskId, estimated, actual) {
    const historicalPath = path.join(
      this.cortexHome,
      'coordination/metrics/historical-task-data.jsonl'
    );

    const record = {
      task_id: taskId,
      timestamp: new Date().toISOString(),
      description: actual.description || '',
      contractor: actual.contractor || '',
      complexity: actual.complexity || 5,
      estimated_tokens: estimated.tokens,
      estimated_time: estimated.time,
      actual_tokens: actual.tokens,
      actual_time: actual.time,
      accuracy: {
        token_accuracy: 1 - Math.abs(estimated.tokens - actual.tokens) / estimated.tokens,
        time_accuracy: 1 - Math.abs(estimated.time - actual.time) / estimated.time
      }
    };

    try {
      // Ensure directory exists
      const dir = path.dirname(historicalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.appendFileSync(historicalPath, JSON.stringify(record) + '\n');
    } catch (error) {
      console.error('Error recording actual usage:', error.message);
    }
  }

  /**
   * Get estimation accuracy statistics
   * @returns {Object} Accuracy metrics
   */
  getAccuracyStats() {
    if (!this.historicalData || this.historicalData.length === 0) {
      return {
        sample_size: 0,
        avg_token_accuracy: 0,
        avg_time_accuracy: 0
      };
    }

    const tokenAccuracies = this.historicalData
      .filter(t => t.accuracy && t.accuracy.token_accuracy)
      .map(t => t.accuracy.token_accuracy);

    const timeAccuracies = this.historicalData
      .filter(t => t.accuracy && t.accuracy.time_accuracy)
      .map(t => t.accuracy.time_accuracy);

    return {
      sample_size: this.historicalData.length,
      avg_token_accuracy: tokenAccuracies.length > 0
        ? tokenAccuracies.reduce((a, b) => a + b, 0) / tokenAccuracies.length
        : 0,
      avg_time_accuracy: timeAccuracies.length > 0
        ? timeAccuracies.reduce((a, b) => a + b, 0) / timeAccuracies.length
        : 0,
      recent_tasks: this.historicalData.slice(-10).map(t => ({
        task_id: t.task_id,
        contractor: t.contractor,
        complexity: t.complexity,
        token_accuracy: t.accuracy?.token_accuracy || 0,
        time_accuracy: t.accuracy?.time_accuracy || 0
      }))
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: resource-estimator.js <task_description> <complexity> <contractor>');
    console.log('Example: resource-estimator.js "Fix authentication bug" 5 development');
    console.log('\nOr: resource-estimator.js --stats  (show accuracy statistics)');
    process.exit(1);
  }

  const estimator = new ResourceEstimator();

  if (args[0] === '--stats') {
    const stats = estimator.getAccuracyStats();
    console.log(JSON.stringify(stats, null, 2));
  } else {
    const taskDescription = args[0];
    const complexity = parseInt(args[1]);
    const contractor = args[2];
    const supportingCount = args[3] ? parseInt(args[3]) : 0;

    const estimate = estimator.estimate(taskDescription, complexity, contractor, supportingCount);
    console.log(JSON.stringify(estimate, null, 2));
  }
}

module.exports = ResourceEstimator;
