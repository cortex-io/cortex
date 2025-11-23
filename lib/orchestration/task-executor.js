/**
 * Task Executor - Execute Tasks with Quality Review Loops
 *
 * Provides task execution with integrated review cycles:
 * - Execute task and produce initial output
 * - Run through review cycles with feedback refinement
 * - Track metrics for learning and optimization
 * - Handle escalation when reviews don't pass
 *
 * Part of commit-relay orchestration system.
 */

const fs = require('fs');
const path = require('path');
const { ReviewExecutor } = require('./review-executor');

// Paths
const REVIEW_HISTORY_PATH = path.join(__dirname, '../../coordination/metrics/review-history.jsonl');
const REVIEW_POLICY_PATH = path.join(__dirname, '../../coordination/config/review-policy.json');

/**
 * TaskExecutor class for executing tasks with review loops
 */
class TaskExecutor {
  constructor(options = {}) {
    this.reviewExecutor = options.reviewExecutor || new ReviewExecutor();
    this.taskHandler = options.taskHandler || null; // Function to execute task
    this.refineHandler = options.refineHandler || null; // Function to refine based on feedback
    this.llmGateway = options.llmGateway || null;
    this.metrics = {
      total_reviews: 0,
      approvals: 0,
      rejections: 0,
      escalations: 0,
      avg_cycles: 0
    };

    // Share LLM gateway with review executor
    if (this.llmGateway) {
      this.reviewExecutor.setLLMGateway(this.llmGateway);
    }
  }

  /**
   * Execute task with review loops
   *
   * @param {object} task - Task definition
   * @param {object} options - Execution options
   * @returns {Promise<object>} Execution result with final output and review history
   */
  async executeWithReview(task, options = {}) {
    const startTime = Date.now();
    const reviewHistory = [];

    // Check if review is enabled for this task
    const reviewEnabled = this.reviewExecutor.isReviewEnabled(task);

    // Get review parameters
    const minCycles = task.review?.min_cycles || this.reviewExecutor.getMinCycles(task);
    const maxCycles = task.review?.max_cycles || this.reviewExecutor.getMaxCycles(task);
    const autoApproveThreshold = task.review?.auto_approve_threshold ||
      this.reviewExecutor.getAutoApproveThreshold(task);

    // Execute initial task
    let output;
    try {
      output = await this.executeTask(task, options);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        task_id: task.id,
        output: null,
        review_history: [],
        metrics: {
          duration_ms: Date.now() - startTime,
          cycles: 0,
          final_confidence: 0
        }
      };
    }

    // Skip review if disabled
    if (!reviewEnabled) {
      return {
        success: true,
        task_id: task.id,
        output,
        review_skipped: true,
        review_history: [],
        metrics: {
          duration_ms: Date.now() - startTime,
          cycles: 0,
          final_confidence: 1.0
        }
      };
    }

    // Review loop
    let currentOutput = output;
    let cycle = 0;
    let approved = false;
    let finalConfidence = 0;
    let escalated = false;

    while (cycle < maxCycles && !approved) {
      cycle++;

      // Perform review
      const reviewResult = await this.reviewExecutor.review(task, currentOutput);

      reviewHistory.push({
        cycle,
        timestamp: new Date().toISOString(),
        confidence: reviewResult.confidence,
        approved: reviewResult.approved,
        feedback: reviewResult.feedback,
        suggestions: reviewResult.suggestions,
        issues: reviewResult.issues || []
      });

      finalConfidence = reviewResult.confidence;

      // Check approval
      if (reviewResult.approved && cycle >= minCycles) {
        approved = true;
        break;
      }

      // Check if we should continue iterating
      if (cycle >= maxCycles) {
        break;
      }

      // Refine output based on feedback
      if (reviewResult.suggestions && reviewResult.suggestions.length > 0) {
        try {
          currentOutput = await this.refineOutput(task, currentOutput, reviewResult);
        } catch (error) {
          console.error(`[TaskExecutor] Refinement failed: ${error.message}`);
          // Continue with current output
        }
      }
    }

    // Handle non-approval after max cycles
    if (!approved && cycle >= maxCycles) {
      escalated = true;
      await this.handleEscalation(task, currentOutput, reviewHistory);
    }

    // Record metrics
    const result = {
      success: approved,
      task_id: task.id,
      output: currentOutput,
      approved,
      escalated,
      review_history: reviewHistory,
      metrics: {
        duration_ms: Date.now() - startTime,
        cycles: cycle,
        final_confidence: finalConfidence,
        auto_approved: reviewHistory[reviewHistory.length - 1]?.confidence >= autoApproveThreshold
      }
    };

    // Log to history
    await this.logReviewOutcome(task, result);

    // Update internal metrics
    this.updateMetrics(result);

    return result;
  }

  /**
   * Execute the actual task
   */
  async executeTask(task, options) {
    if (this.taskHandler) {
      return await this.taskHandler(task, options);
    }

    // Default: return empty output for external handling
    return {
      status: 'pending_execution',
      message: 'Task handler not provided - implement taskHandler function',
      task_id: task.id
    };
  }

  /**
   * Refine output based on review feedback
   */
  async refineOutput(task, currentOutput, reviewResult) {
    if (this.refineHandler) {
      return await this.refineHandler(task, currentOutput, reviewResult);
    }

    // Default: Use LLM to refine based on feedback
    if (this.llmGateway) {
      return await this.llmRefine(task, currentOutput, reviewResult);
    }

    // No refinement possible - return current output
    console.warn('[TaskExecutor] No refinement handler available');
    return currentOutput;
  }

  /**
   * Use LLM to refine output based on feedback
   */
  async llmRefine(task, currentOutput, reviewResult) {
    const prompt = {
      system: 'You are refining task output based on review feedback. Apply the suggestions and fix any issues identified.',
      user: `
## Task
${task.description || JSON.stringify(task)}

## Current Output
\`\`\`
${typeof currentOutput === 'string' ? currentOutput : JSON.stringify(currentOutput, null, 2)}
\`\`\`

## Review Feedback
${reviewResult.feedback}

## Suggestions to Apply
${reviewResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Issues to Fix
${(reviewResult.issues || []).map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None'}

Please provide the refined output that addresses the feedback and suggestions.
`
    };

    const response = await this.llmGateway.complete({
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      temperature: 0.4,
      max_tokens: 4000
    });

    return response.content || response;
  }

  /**
   * Handle escalation when max cycles reached without approval
   */
  async handleEscalation(task, output, reviewHistory) {
    const escalation = {
      task_id: task.id,
      task_type: task.type,
      reason: 'max_review_cycles_reached',
      cycles_attempted: reviewHistory.length,
      final_confidence: reviewHistory[reviewHistory.length - 1]?.confidence || 0,
      issues: reviewHistory.flatMap(r => r.issues || []),
      timestamp: new Date().toISOString(),
      requires_manual_review: true
    };

    // Log escalation event
    console.warn(`[TaskExecutor] Escalating task ${task.id}: ${escalation.reason}`);

    // Write escalation to events (if available)
    const eventsPath = path.join(__dirname, '../../coordination/events/review-escalations.jsonl');
    try {
      const dir = path.dirname(eventsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(eventsPath, JSON.stringify(escalation) + '\n');
    } catch (error) {
      console.error(`[TaskExecutor] Failed to log escalation: ${error.message}`);
    }

    this.metrics.escalations++;
  }

  /**
   * Log review outcome for learning
   */
  async logReviewOutcome(task, result) {
    const entry = {
      timestamp: new Date().toISOString(),
      task_id: task.id,
      task_type: task.type,
      success: result.success,
      cycles: result.metrics.cycles,
      final_confidence: result.metrics.final_confidence,
      auto_approved: result.metrics.auto_approved,
      escalated: result.escalated || false,
      duration_ms: result.metrics.duration_ms,
      issues_count: result.review_history.reduce((sum, r) => sum + (r.issues?.length || 0), 0),
      suggestions_count: result.review_history.reduce((sum, r) => sum + (r.suggestions?.length || 0), 0)
    };

    try {
      const dir = path.dirname(REVIEW_HISTORY_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(REVIEW_HISTORY_PATH, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error(`[TaskExecutor] Failed to log review outcome: ${error.message}`);
    }
  }

  /**
   * Update internal metrics
   */
  updateMetrics(result) {
    this.metrics.total_reviews++;

    if (result.approved) {
      this.metrics.approvals++;
    } else {
      this.metrics.rejections++;
    }

    // Running average of cycles
    const n = this.metrics.total_reviews;
    this.metrics.avg_cycles = ((this.metrics.avg_cycles * (n - 1)) + result.metrics.cycles) / n;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      approval_rate: this.metrics.total_reviews > 0
        ? this.metrics.approvals / this.metrics.total_reviews
        : 0,
      escalation_rate: this.metrics.total_reviews > 0
        ? this.metrics.escalations / this.metrics.total_reviews
        : 0
    };
  }

  /**
   * Set task execution handler
   */
  setTaskHandler(handler) {
    this.taskHandler = handler;
  }

  /**
   * Set output refinement handler
   */
  setRefineHandler(handler) {
    this.refineHandler = handler;
  }

  /**
   * Set LLM gateway
   */
  setLLMGateway(gateway) {
    this.llmGateway = gateway;
    this.reviewExecutor.setLLMGateway(gateway);
  }

  /**
   * Execute multiple tasks with review (parallel or sequential)
   */
  async executeMultiple(tasks, options = {}) {
    const { parallel = false, maxParallel = 3 } = options;
    const results = [];

    if (parallel) {
      // Execute in batches
      for (let i = 0; i < tasks.length; i += maxParallel) {
        const batch = tasks.slice(i, i + maxParallel);
        const batchResults = await Promise.all(
          batch.map(task => this.executeWithReview(task, options))
        );
        results.push(...batchResults);
      }
    } else {
      // Execute sequentially
      for (const task of tasks) {
        const result = await this.executeWithReview(task, options);
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * Factory function to create configured TaskExecutor
 */
function createTaskExecutor(options = {}) {
  return new TaskExecutor(options);
}

module.exports = {
  TaskExecutor,
  createTaskExecutor
};
