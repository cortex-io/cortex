#!/usr/bin/env node
/**
 * Rollback Coordinator
 *
 * Coordinates rollback operations for projects.
 * Features:
 * - Restore project state from checkpoints
 * - Execute rollback plans
 * - Validate rollback success
 * - Handle rollback failures
 */

const fs = require('fs');
const path = require('path');
const CheckpointManager = require('./checkpoint-manager');

class RollbackCoordinator {
  constructor(options = {}) {
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || path.join(__dirname, '../..');
    this.rollbackLogPath = path.join(this.cortexHome, 'coordination/project-management/rollback-log.jsonl');

    this.checkpointManager = new CheckpointManager({ cortexHome: this.cortexHome });

    // Ensure log directory exists
    this._ensureLogDirectory();
  }

  /**
   * Execute rollback to a checkpoint
   * @param {string} projectId - Project identifier
   * @param {string} checkpointId - Checkpoint to restore (null = latest)
   * @param {string} reason - Reason for rollback
   * @returns {Object} Restored state
   */
  async rollback(projectId, checkpointId = null, reason = 'Manual rollback') {
    const rollbackId = `rollback-${Date.now()}`;
    const startTime = Date.now();

    this._logRollback(rollbackId, projectId, 'started', {
      checkpoint_id: checkpointId,
      reason: reason
    });

    try {
      // Get checkpoint to restore
      let checkpoint;

      if (checkpointId) {
        checkpoint = await this.checkpointManager.getCheckpoint(checkpointId);
      } else {
        checkpoint = await this.checkpointManager.getLatestCheckpoint(projectId);
      }

      if (!checkpoint) {
        throw new Error(`No checkpoint found for project ${projectId}`);
      }

      // Verify checkpoint integrity
      const verification = await this.checkpointManager.verifyCheckpoint(checkpoint.checkpoint_id);

      if (!verification.valid) {
        throw new Error(`Checkpoint verification failed: ${verification.error}`);
      }

      // Execute rollback plan
      const rollbackPlan = checkpoint.rollback_plan;
      const restoredState = await this._executeRollbackPlan(
        projectId,
        checkpoint,
        rollbackPlan
      );

      // Validate rollback
      const validation = await this._validateRollback(
        checkpoint,
        restoredState,
        rollbackPlan.validation_steps
      );

      if (!validation.success) {
        throw new Error(`Rollback validation failed: ${validation.errors.join(', ')}`);
      }

      const duration = Date.now() - startTime;

      this._logRollback(rollbackId, projectId, 'completed', {
        checkpoint_id: checkpoint.checkpoint_id,
        reason: reason,
        duration_ms: duration,
        validation: validation
      });

      return {
        success: true,
        rollback_id: rollbackId,
        checkpoint_restored: checkpoint.checkpoint_id,
        restored_state: restoredState,
        duration_ms: duration,
        validation: validation
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      this._logRollback(rollbackId, projectId, 'failed', {
        checkpoint_id: checkpointId,
        reason: reason,
        error: error.message,
        duration_ms: duration
      });

      throw error;
    }
  }

  /**
   * Preview rollback (dry run)
   * @param {string} projectId
   * @param {string} checkpointId
   * @returns {Object} Rollback preview
   */
  async previewRollback(projectId, checkpointId = null) {
    let checkpoint;

    if (checkpointId) {
      checkpoint = await this.checkpointManager.getCheckpoint(checkpointId);
    } else {
      checkpoint = await this.checkpointManager.getLatestCheckpoint(projectId);
    }

    if (!checkpoint) {
      throw new Error(`No checkpoint found for project ${projectId}`);
    }

    const preview = {
      checkpoint_id: checkpoint.checkpoint_id,
      checkpoint_name: checkpoint.name,
      checkpoint_created_at: checkpoint.created_at,
      will_restore_to_state: checkpoint.state,
      will_restore_to_progress: checkpoint.progress_percentage,
      rollback_plan: checkpoint.rollback_plan,
      estimated_duration_minutes: checkpoint.rollback_plan.estimated_duration_minutes,
      risk_level: checkpoint.rollback_plan.risk_level,
      validation_steps: checkpoint.rollback_plan.validation_steps.length,
      actions_to_execute: checkpoint.rollback_plan.actions.length
    };

    return preview;
  }

  /**
   * Get available rollback points for project
   * @param {string} projectId
   * @returns {Array} Array of rollback points
   */
  async getAvailableRollbackPoints(projectId) {
    const checkpoints = await this.checkpointManager.listCheckpoints(projectId);

    return checkpoints.map(cp => ({
      checkpoint_id: cp.checkpoint_id,
      name: cp.name,
      created_at: cp.created_at,
      state: cp.state,
      progress: cp.progress_percentage,
      automatic: cp.metadata.automatic,
      estimated_rollback_duration: cp.rollback_plan.estimated_duration_minutes,
      risk_level: cp.rollback_plan.risk_level
    }));
  }

  /**
   * Get rollback history for project
   * @param {string} projectId
   * @returns {Array} Rollback history
   */
  async getRollbackHistory(projectId) {
    if (!fs.existsSync(this.rollbackLogPath)) {
      return [];
    }

    try {
      const lines = fs.readFileSync(this.rollbackLogPath, 'utf8')
        .split('\n')
        .filter(l => l.trim());

      const history = [];

      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.project_id === projectId) {
          history.push(entry);
        }
      }

      return history.sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      );

    } catch (error) {
      console.error('Error reading rollback history:', error.message);
      return [];
    }
  }

  /**
   * Get rollback statistics
   * @param {string} projectId - Optional project filter
   * @returns {Object} Statistics
   */
  async getStatistics(projectId = null) {
    const history = projectId
      ? await this.getRollbackHistory(projectId)
      : await this._getAllRollbackHistory();

    const stats = {
      total_rollbacks: history.length,
      successful_rollbacks: history.filter(h => h.status === 'completed').length,
      failed_rollbacks: history.filter(h => h.status === 'failed').length,
      avg_duration_ms: 0,
      by_reason: {},
      by_checkpoint: {},
      recent_rollbacks: history.slice(0, 10)
    };

    if (history.length > 0) {
      // Calculate average duration
      const durations = history
        .filter(h => h.details?.duration_ms)
        .map(h => h.details.duration_ms);

      if (durations.length > 0) {
        stats.avg_duration_ms = Math.round(
          durations.reduce((sum, d) => sum + d, 0) / durations.length
        );
      }

      // Count by reason
      for (const entry of history) {
        const reason = entry.details?.reason || 'Unknown';
        stats.by_reason[reason] = (stats.by_reason[reason] || 0) + 1;
      }

      // Count by checkpoint
      for (const entry of history) {
        const checkpoint = entry.details?.checkpoint_id || 'Unknown';
        stats.by_checkpoint[checkpoint] = (stats.by_checkpoint[checkpoint] || 0) + 1;
      }
    }

    // Calculate success rate
    stats.success_rate = stats.total_rollbacks > 0
      ? stats.successful_rollbacks / stats.total_rollbacks
      : 0;

    return stats;
  }

  /**
   * Execute rollback plan
   * @private
   */
  async _executeRollbackPlan(projectId, checkpoint, rollbackPlan) {
    const restoredState = { ...checkpoint.snapshot };

    // Execute each action in the plan
    for (const action of rollbackPlan.actions) {
      switch (action.action) {
        case 'stop_workers':
          // In real implementation, would stop active workers
          restoredState.resources = restoredState.resources || {};
          restoredState.resources.active_workers = [];
          break;

        case 'restore_checkpoint':
          // State is already in checkpoint.snapshot
          break;

        case 'rollback_validation':
          // Restore validation state
          restoredState.validation = action.validation_state;
          break;

        case 'verify_state':
          // State verification handled in validation phase
          break;

        default:
          console.warn(`Unknown rollback action: ${action.action}`);
          break;
      }
    }

    // Update timestamps
    restoredState.updated_at = new Date().toISOString();
    restoredState.rollback_at = new Date().toISOString();
    restoredState.rollback_from_checkpoint = checkpoint.checkpoint_id;

    return restoredState;
  }

  /**
   * Validate rollback success
   * @private
   */
  async _validateRollback(checkpoint, restoredState, validationSteps) {
    const errors = [];

    for (const step of validationSteps) {
      switch (step.step) {
        case 'verify_state':
          if (restoredState.state !== step.expected) {
            errors.push(`State mismatch: expected ${step.expected}, got ${restoredState.state}`);
          }
          break;

        case 'verify_progress':
          if (restoredState.progress?.percentage !== step.expected) {
            errors.push(`Progress mismatch: expected ${step.expected}%, got ${restoredState.progress?.percentage}%`);
          }
          break;

        case 'verify_workers':
          const workerCount = restoredState.resources?.active_workers?.length || 0;
          if (workerCount !== step.expected) {
            errors.push(`Worker count mismatch: expected ${step.expected}, got ${workerCount}`);
          }
          break;

        default:
          console.warn(`Unknown validation step: ${step.step}`);
          break;
      }
    }

    return {
      success: errors.length === 0,
      errors: errors,
      steps_validated: validationSteps.length,
      steps_passed: validationSteps.length - errors.length
    };
  }

  /**
   * Log rollback event
   * @private
   */
  _logRollback(rollbackId, projectId, status, details = {}) {
    const logEntry = {
      rollback_id: rollbackId,
      project_id: projectId,
      status: status,
      timestamp: new Date().toISOString(),
      details: details
    };

    try {
      fs.appendFileSync(this.rollbackLogPath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Error logging rollback:', error.message);
    }
  }

  /**
   * Get all rollback history
   * @private
   */
  async _getAllRollbackHistory() {
    if (!fs.existsSync(this.rollbackLogPath)) {
      return [];
    }

    try {
      const lines = fs.readFileSync(this.rollbackLogPath, 'utf8')
        .split('\n')
        .filter(l => l.trim());

      return lines.map(line => JSON.parse(line));
    } catch (error) {
      console.error('Error reading rollback history:', error.message);
      return [];
    }
  }

  /**
   * Ensure log directory exists
   * @private
   */
  _ensureLogDirectory() {
    const logDir = path.dirname(this.rollbackLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const coordinator = new RollbackCoordinator();

  switch (command) {
    case 'rollback':
      const [projectId, checkpointId] = args.slice(1);
      const reason = args[3] || 'Manual rollback';
      coordinator.rollback(projectId, checkpointId, reason)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'preview':
      coordinator.previewRollback(args[1], args[2])
        .then(preview => console.log(JSON.stringify(preview, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'points':
      coordinator.getAvailableRollbackPoints(args[1])
        .then(points => console.log(JSON.stringify(points, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'history':
      coordinator.getRollbackHistory(args[1])
        .then(history => console.log(JSON.stringify(history, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'stats':
      coordinator.getStatistics(args[1])
        .then(stats => console.log(JSON.stringify(stats, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    default:
      console.log('Usage: rollback-coordinator.js <command> [args]');
      console.log('Commands:');
      console.log('  rollback <projectId> [checkpointId] [reason]');
      console.log('  preview <projectId> [checkpointId]');
      console.log('  points <projectId>');
      console.log('  history <projectId>');
      console.log('  stats [projectId]');
      break;
  }
}

module.exports = RollbackCoordinator;
