/**
 * Orchestration Module
 *
 * Provides task execution with quality review loops for commit-relay.
 *
 * Components:
 * - ReviewExecutor: LLM-based quality review for task outputs
 * - TaskExecutor: Task execution with integrated review cycles
 *
 * Usage:
 *
 * ```javascript
 * const { TaskExecutor, ReviewExecutor, createTaskExecutor } = require('./lib/orchestration');
 *
 * // Create executor with custom handlers
 * const executor = createTaskExecutor({
 *   taskHandler: async (task) => { ... },
 *   refineHandler: async (task, output, feedback) => { ... },
 *   llmGateway: myLLMGateway
 * });
 *
 * // Execute task with review loops
 * const result = await executor.executeWithReview(task);
 *
 * if (result.approved) {
 *   console.log('Task approved with confidence:', result.metrics.final_confidence);
 * } else if (result.escalated) {
 *   console.log('Task escalated for manual review');
 * }
 * ```
 */

const { ReviewExecutor } = require('./review-executor');
const { TaskExecutor, createTaskExecutor } = require('./task-executor');

module.exports = {
  // Classes
  ReviewExecutor,
  TaskExecutor,

  // Factory functions
  createTaskExecutor
};
