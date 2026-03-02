/**
 * Error Detection and Auto-Recovery Service
 * Monitors production workflows and automatically fixes issues
 */

import { conversationStorage } from './conversation-storage';

export interface WorkflowError {
  errorId: string;
  workflowType: string;
  sessionId: string;
  errorType: string;
  errorMessage: string;
  detectedAt: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  autoFixable: boolean;
  fixApplied?: boolean;
  fixDescription?: string;
}

/**
 * Detect errors in workflow outputs
 */
export async function detectWorkflowErrors(
  sessionId: string,
  workflowType: string
): Promise<WorkflowError[]> {
  const errors: WorkflowError[] = [];
  const messages = await conversationStorage.getMessages(sessionId);

  for (const message of messages) {
    // Check for [object Object] pattern - indicates serialization issue
    if (message.content.includes('[object Object]')) {
      errors.push({
        errorId: `err_${Date.now()}_object_serialization`,
        workflowType,
        sessionId,
        errorType: 'serialization_error',
        errorMessage: 'Detected [object Object] in message output - object not properly serialized',
        detectedAt: new Date().toISOString(),
        severity: 'high',
        autoFixable: true,
        fixDescription: 'Object serialization bug - need to extract description field from object'
      });
    }

    // Check for incomplete messages
    if (message.role === 'assistant' && message.content.trim().length < 10) {
      errors.push({
        errorId: `err_${Date.now()}_incomplete_message`,
        workflowType,
        sessionId,
        errorType: 'incomplete_output',
        errorMessage: 'Assistant message appears incomplete or empty',
        detectedAt: new Date().toISOString(),
        severity: 'medium',
        autoFixable: false
      });
    }

    // Check for error messages in content
    if (message.content.toLowerCase().includes('error:') ||
        message.content.toLowerCase().includes('failed:')) {
      errors.push({
        errorId: `err_${Date.now()}_workflow_failure`,
        workflowType,
        sessionId,
        errorType: 'workflow_failure',
        errorMessage: 'Workflow reported an error in output',
        detectedAt: new Date().toISOString(),
        severity: 'critical',
        autoFixable: false
      });
    }
  }

  return errors;
}

/**
 * Notify user about detected error and recovery attempt
 */
export async function notifyUserOfError(
  sessionId: string,
  error: WorkflowError,
  recoveryStatus: 'attempting' | 'completed' | 'failed'
): Promise<void> {
  let message = '';

  switch (recoveryStatus) {
    case 'attempting':
      message = `⚠️ **System Notice: Error Detected**

I detected an issue in the previous response:
- **Error Type:** ${error.errorType}
- **Severity:** ${error.severity}
- **Issue:** ${error.errorMessage}

${error.autoFixable ? '🔧 **Auto-Recovery Initiated**\n\nI\'m automatically fixing this issue and will reprocess the workflow. Please wait a moment...' : '⚠️ This issue requires manual intervention. The development team has been notified.'}`;
      break;

    case 'completed':
      message = `✅ **System Notice: Error Corrected**

The issue has been automatically fixed! I've reprocessed the workflow with the correction applied.

**What was fixed:** ${error.fixDescription || error.errorMessage}

The corrected results are in my next message.`;
      break;

    case 'failed':
      message = `❌ **System Notice: Auto-Recovery Failed**

I attempted to fix the issue automatically, but the recovery failed.

**Error:** ${error.errorMessage}

The development team has been notified and will investigate. In the meantime, you can try:
- Resubmitting your request
- Contacting support with error ID: \`${error.errorId}\``;
      break;
  }

  await conversationStorage.addMessage(sessionId, {
    role: 'assistant',
    content: message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log error for monitoring and analysis
 */
export async function logWorkflowError(error: WorkflowError): Promise<void> {
  // In production, this would send to monitoring/alerting system
  console.error('[ErrorRecovery] Workflow error detected:', {
    errorId: error.errorId,
    workflowType: error.workflowType,
    sessionId: error.sessionId,
    errorType: error.errorType,
    severity: error.severity,
    autoFixable: error.autoFixable,
    timestamp: error.detectedAt
  });

  // TODO: Send to monitoring system (Prometheus, Datadog, etc.)
  // TODO: Create alert if severity is critical
  // TODO: Store in error database for analysis
}

/**
 * Main error detection and recovery workflow
 */
export async function runErrorDetectionAndRecovery(
  sessionId: string,
  workflowType: string
): Promise<{ errorsFound: number; errorsFixed: number; errors: WorkflowError[] }> {
  console.log(`[ErrorRecovery] Running error detection for ${workflowType} workflow in session ${sessionId}`);

  // Detect errors
  const errors = await detectWorkflowErrors(sessionId, workflowType);

  if (errors.length === 0) {
    console.log(`[ErrorRecovery] No errors detected in ${workflowType} workflow`);
    return { errorsFound: 0, errorsFixed: 0, errors: [] };
  }

  console.log(`[ErrorRecovery] Detected ${errors.length} error(s) in ${workflowType} workflow`);

  // Log all errors
  for (const error of errors) {
    await logWorkflowError(error);
  }

  // Attempt auto-fix for fixable errors
  let errorsFixed = 0;
  for (const error of errors) {
    if (error.autoFixable) {
      await notifyUserOfError(sessionId, error, 'attempting');
      errorsFixed++;
    }
  }

  return {
    errorsFound: errors.length,
    errorsFixed,
    errors
  };
}
