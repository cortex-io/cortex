/**
 * Elastic APM Custom Event Tracking Utilities
 *
 * This module provides helper functions for tracking custom events,
 * spans, and labels in Elastic APM for commit-relay operations.
 */

const apm = require('../../apm');

/**
 * Track an agent lifecycle event
 * @param {string} eventType - Type of event (spawned, completed, failed, etc.)
 * @param {object} agentData - Agent information
 * @param {string} agentData.agentId - Agent/worker ID
 * @param {string} agentData.agentType - Type of agent (master, worker, etc.)
 * @param {string} agentData.taskId - Associated task ID
 * @param {object} [agentData.metadata] - Additional metadata
 */
function trackAgentEvent(eventType, agentData) {
  if (!apm) return;

  try {
    // Set custom context for the current transaction
    apm.setCustomContext({
      agent_event: {
        type: eventType,
        agent_id: agentData.agentId,
        agent_type: agentData.agentType,
        task_id: agentData.taskId,
        metadata: agentData.metadata || {}
      }
    });

    // Add labels for filtering in Kibana
    apm.addLabels({
      'agent.event.type': eventType,
      'agent.id': agentData.agentId,
      'agent.type': agentData.agentType,
      'task.id': agentData.taskId
    });

    console.log(`[APM] Tracked agent event: ${eventType} for ${agentData.agentId}`);
  } catch (error) {
    console.error('[APM] Failed to track agent event:', error.message);
  }
}

/**
 * Track a tool or API invocation
 * @param {string} toolName - Name of the tool/API
 * @param {object} invocationData - Invocation details
 * @param {string} invocationData.operation - Operation being performed
 * @param {number} [invocationData.duration] - Duration in milliseconds
 * @param {string} [invocationData.status] - Status (success, error)
 * @param {object} [invocationData.metadata] - Additional metadata
 */
function trackToolUsage(toolName, invocationData) {
  if (!apm) return;

  try {
    // Create a custom span for the tool usage
    const span = apm.startSpan(`tool.${toolName}`, 'external');

    if (span) {
      span.addLabels({
        'tool.name': toolName,
        'tool.operation': invocationData.operation,
        'tool.status': invocationData.status || 'unknown'
      });

      // Set custom context
      apm.setCustomContext({
        tool_usage: {
          name: toolName,
          operation: invocationData.operation,
          duration: invocationData.duration,
          status: invocationData.status,
          metadata: invocationData.metadata || {}
        }
      });

      if (invocationData.duration && span.end) {
        span.end(invocationData.duration);
      } else if (span.end) {
        span.end();
      }
    }

    console.log(`[APM] Tracked tool usage: ${toolName}.${invocationData.operation}`);
  } catch (error) {
    console.error('[APM] Failed to track tool usage:', error.message);
  }
}

/**
 * Track a relay task completion
 * @param {string} taskId - Task ID
 * @param {object} completionData - Completion details
 * @param {string} completionData.status - Completion status (success, failure)
 * @param {number} completionData.duration - Duration in milliseconds
 * @param {string} [completionData.master] - Master that handled the task
 * @param {number} [completionData.workersUsed] - Number of workers used
 * @param {object} [completionData.metrics] - Task metrics
 */
function trackRelayCompletion(taskId, completionData) {
  if (!apm) return;

  try {
    // Create a custom transaction for task completion
    const transaction = apm.startTransaction(`task.${taskId}`, 'task-completion');

    if (transaction) {
      // Add labels
      transaction.addLabels({
        'task.id': taskId,
        'task.status': completionData.status,
        'task.master': completionData.master || 'unknown',
        'task.workers_used': completionData.workersUsed || 0
      });

      // Set custom context
      transaction.setCustomContext({
        task_completion: {
          task_id: taskId,
          status: completionData.status,
          duration: completionData.duration,
          master: completionData.master,
          workers_used: completionData.workersUsed,
          metrics: completionData.metrics || {}
        }
      });

      // Set result based on status
      transaction.result = completionData.status === 'success' ? 'success' : 'failure';

      // End transaction
      transaction.end();
    }

    console.log(`[APM] Tracked relay completion: ${taskId} (${completionData.status})`);
  } catch (error) {
    console.error('[APM] Failed to track relay completion:', error.message);
  }
}

/**
 * Create a custom span for an operation
 * @param {string} name - Span name
 * @param {string} type - Span type (e.g., 'db', 'external', 'custom')
 * @param {Function} fn - Function to execute within the span
 * @returns {Promise<any>} Result of the function
 */
async function withCustomSpan(name, type, fn) {
  if (!apm) {
    // If APM is not enabled, just execute the function
    return await fn();
  }

  const span = apm.startSpan(name, type);

  try {
    const result = await fn();

    if (span) {
      span.setOutcome('success');
      span.end();
    }

    return result;
  } catch (error) {
    if (span) {
      span.setOutcome('failure');
      span.end();
    }

    throw error;
  }
}

/**
 * Capture an exception with additional context
 * @param {Error} error - Error object
 * @param {object} [context] - Additional context
 * @param {string} [context.user] - User identifier
 * @param {string} [context.operation] - Operation being performed
 * @param {object} [context.metadata] - Additional metadata
 */
function captureException(error, context = {}) {
  if (!apm) {
    console.error('[APM] Exception (APM disabled):', error);
    return;
  }

  try {
    // Set custom context before capturing
    if (context.metadata) {
      apm.setCustomContext(context.metadata);
    }

    // Add labels
    if (context.operation) {
      apm.addLabels({
        'error.operation': context.operation
      });
    }

    // Capture the exception
    apm.captureError(error);

    console.log(`[APM] Captured exception: ${error.message}`);
  } catch (captureError) {
    console.error('[APM] Failed to capture exception:', captureError.message);
  }
}

/**
 * Set user context for the current transaction
 * @param {object} user - User information
 * @param {string} user.id - User ID
 * @param {string} [user.username] - Username
 * @param {string} [user.email] - User email
 */
function setUser(user) {
  if (!apm) return;

  try {
    apm.setUserContext({
      id: user.id,
      username: user.username,
      email: user.email
    });

    console.log(`[APM] Set user context: ${user.id}`);
  } catch (error) {
    console.error('[APM] Failed to set user context:', error.message);
  }
}

/**
 * Add custom labels to the current transaction
 * @param {object} labels - Key-value pairs of labels
 */
function addLabels(labels) {
  if (!apm) return;

  try {
    apm.addLabels(labels);
  } catch (error) {
    console.error('[APM] Failed to add labels:', error.message);
  }
}

/**
 * Get the current transaction ID (for log correlation)
 * @returns {string|null} Transaction ID or null
 */
function getTransactionId() {
  if (!apm) return null;

  try {
    const transaction = apm.currentTransaction;
    return transaction ? transaction.id : null;
  } catch (error) {
    return null;
  }
}

/**
 * Get the current trace ID (for log correlation)
 * @returns {string|null} Trace ID or null
 */
function getTraceId() {
  if (!apm) return null;

  try {
    const transaction = apm.currentTransaction;
    return transaction ? transaction.traceId : null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  trackAgentEvent,
  trackToolUsage,
  trackRelayCompletion,
  withCustomSpan,
  captureException,
  setUser,
  addLabels,
  getTransactionId,
  getTraceId
};
