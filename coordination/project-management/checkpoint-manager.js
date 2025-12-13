#!/usr/bin/env node
/**
 * Checkpoint Manager
 *
 * Manages project checkpoints for state snapshots and rollback capability.
 * Features:
 * - Automatic checkpoints at progress milestones (25%, 50%, 75%)
 * - Manual checkpoints for critical points
 * - Checkpoint metadata and rollback plans
 * - Checkpoint retention and cleanup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CheckpointManager {
  constructor(options = {}) {
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || path.join(__dirname, '../..');
    this.checkpointsDir = path.join(this.cortexHome, 'coordination/project-management/checkpoints');
    this.checkpointLogPath = path.join(this.cortexHome, 'coordination/project-management/checkpoint-log.jsonl');

    // Configuration
    this.maxCheckpointsPerProject = options.maxCheckpointsPerProject || 20;
    this.retentionDays = options.retentionDays || 30;

    // Ensure directories exist
    this._ensureDirectories();
  }

  /**
   * Create a new checkpoint
   * @param {string} projectId - Project identifier
   * @param {string} checkpointName - Checkpoint name
   * @param {string} state - Current project state
   * @param {Object} snapshot - State snapshot
   * @param {Object} options - Additional options
   * @returns {Object} Checkpoint metadata
   */
  async createCheckpoint(projectId, checkpointName, state, snapshot, options = {}) {
    const checkpointId = this._generateCheckpointId(projectId, checkpointName);
    const timestamp = new Date().toISOString();

    const checkpoint = {
      checkpoint_id: checkpointId,
      project_id: projectId,
      name: checkpointName,
      created_at: timestamp,
      state: state,
      progress_percentage: snapshot.progress?.percentage || 0,
      snapshot: this._createSnapshot(snapshot),
      rollback_plan: this._createRollbackPlan(snapshot, options),
      metadata: {
        automatic: options.automatic || false,
        reason: options.reason || '',
        tags: options.tags || [],
        size_bytes: 0,
        hash: ''
      }
    };

    // Calculate snapshot size and hash
    const snapshotJson = JSON.stringify(checkpoint.snapshot);
    checkpoint.metadata.size_bytes = Buffer.byteLength(snapshotJson);
    checkpoint.metadata.hash = this._calculateHash(snapshotJson);

    // Save checkpoint
    await this._saveCheckpoint(checkpoint);

    // Log checkpoint creation
    this._logCheckpoint(checkpoint, 'created');

    // Cleanup old checkpoints
    await this._cleanupOldCheckpoints(projectId);

    return checkpoint;
  }

  /**
   * Get checkpoint by ID
   * @param {string} checkpointId
   * @returns {Object|null} Checkpoint or null
   */
  async getCheckpoint(checkpointId) {
    const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    if (!fs.existsSync(checkpointPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    } catch (error) {
      console.error(`Error reading checkpoint ${checkpointId}:`, error.message);
      return null;
    }
  }

  /**
   * List checkpoints for a project
   * @param {string} projectId
   * @param {Object} options - Filter options
   * @returns {Array} Array of checkpoints
   */
  async listCheckpoints(projectId, options = {}) {
    if (!fs.existsSync(this.checkpointsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.checkpointsDir)
      .filter(f => f.startsWith(projectId) && f.endsWith('.json'));

    const checkpoints = [];

    for (const file of files) {
      try {
        const checkpoint = JSON.parse(
          fs.readFileSync(path.join(this.checkpointsDir, file), 'utf8')
        );

        // Apply filters
        if (options.state && checkpoint.state !== options.state) continue;
        if (options.automatic !== undefined && checkpoint.metadata.automatic !== options.automatic) continue;

        checkpoints.push(checkpoint);
      } catch (error) {
        console.error(`Error reading checkpoint file ${file}:`, error.message);
      }
    }

    // Sort by creation time (newest first)
    checkpoints.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return checkpoints;
  }

  /**
   * Get latest checkpoint for project
   * @param {string} projectId
   * @returns {Object|null} Latest checkpoint or null
   */
  async getLatestCheckpoint(projectId) {
    const checkpoints = await this.listCheckpoints(projectId);
    return checkpoints.length > 0 ? checkpoints[0] : null;
  }

  /**
   * Get checkpoint at specific progress
   * @param {string} projectId
   * @param {number} progressPercentage
   * @returns {Object|null} Closest checkpoint or null
   */
  async getCheckpointAtProgress(projectId, progressPercentage) {
    const checkpoints = await this.listCheckpoints(projectId);

    if (checkpoints.length === 0) {
      return null;
    }

    // Find closest checkpoint before or at the target progress
    const validCheckpoints = checkpoints.filter(
      cp => cp.progress_percentage <= progressPercentage
    );

    if (validCheckpoints.length === 0) {
      return null;
    }

    // Return the one with highest progress that's still <= target
    return validCheckpoints.reduce((closest, current) => {
      if (current.progress_percentage > closest.progress_percentage) {
        return current;
      }
      return closest;
    });
  }

  /**
   * Delete checkpoint
   * @param {string} checkpointId
   * @returns {boolean} Success
   */
  async deleteCheckpoint(checkpointId) {
    const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    if (!fs.existsSync(checkpointPath)) {
      return false;
    }

    try {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      fs.unlinkSync(checkpointPath);
      this._logCheckpoint(checkpoint, 'deleted');
      return true;
    } catch (error) {
      console.error(`Error deleting checkpoint ${checkpointId}:`, error.message);
      return false;
    }
  }

  /**
   * Verify checkpoint integrity
   * @param {string} checkpointId
   * @returns {Object} Verification result
   */
  async verifyCheckpoint(checkpointId) {
    const checkpoint = await this.getCheckpoint(checkpointId);

    if (!checkpoint) {
      return {
        valid: false,
        error: 'Checkpoint not found'
      };
    }

    // Verify hash
    const snapshotJson = JSON.stringify(checkpoint.snapshot);
    const calculatedHash = this._calculateHash(snapshotJson);

    if (calculatedHash !== checkpoint.metadata.hash) {
      return {
        valid: false,
        error: 'Checkpoint hash mismatch - data may be corrupted',
        expected_hash: checkpoint.metadata.hash,
        actual_hash: calculatedHash
      };
    }

    // Verify required fields
    const requiredFields = ['project_id', 'name', 'state', 'snapshot'];
    const missingFields = requiredFields.filter(field => !checkpoint[field]);

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: 'Missing required fields',
        missing_fields: missingFields
      };
    }

    return {
      valid: true,
      checkpoint_id: checkpointId,
      created_at: checkpoint.created_at,
      state: checkpoint.state,
      progress: checkpoint.progress_percentage
    };
  }

  /**
   * Get checkpoint statistics
   * @param {string} projectId
   * @returns {Object} Statistics
   */
  async getStatistics(projectId = null) {
    let checkpoints = [];

    if (projectId) {
      checkpoints = await this.listCheckpoints(projectId);
    } else {
      // Get all checkpoints
      if (fs.existsSync(this.checkpointsDir)) {
        const files = fs.readdirSync(this.checkpointsDir).filter(f => f.endsWith('.json'));

        for (const file of files) {
          try {
            const checkpoint = JSON.parse(
              fs.readFileSync(path.join(this.checkpointsDir, file), 'utf8')
            );
            checkpoints.push(checkpoint);
          } catch (error) {
            // Skip invalid files
          }
        }
      }
    }

    const stats = {
      total_checkpoints: checkpoints.length,
      automatic_checkpoints: checkpoints.filter(cp => cp.metadata.automatic).length,
      manual_checkpoints: checkpoints.filter(cp => !cp.metadata.automatic).length,
      total_size_bytes: checkpoints.reduce((sum, cp) => sum + (cp.metadata.size_bytes || 0), 0),
      avg_size_bytes: 0,
      by_state: {},
      oldest_checkpoint: null,
      newest_checkpoint: null
    };

    if (checkpoints.length > 0) {
      stats.avg_size_bytes = Math.round(stats.total_size_bytes / checkpoints.length);

      // Sort by date
      const sorted = [...checkpoints].sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      );

      stats.oldest_checkpoint = sorted[0].checkpoint_id;
      stats.newest_checkpoint = sorted[sorted.length - 1].checkpoint_id;

      // Count by state
      for (const checkpoint of checkpoints) {
        const state = checkpoint.state;
        stats.by_state[state] = (stats.by_state[state] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Create snapshot of project state
   * @private
   */
  _createSnapshot(projectState) {
    // Create deep copy of relevant state
    return {
      project_id: projectState.project_id,
      state: projectState.state,
      progress: { ...projectState.progress },
      resources: { ...projectState.resources },
      milestones: JSON.parse(JSON.stringify(projectState.milestones || [])),
      validation: { ...projectState.validation },
      metadata: { ...projectState.metadata },
      active_workers: [...(projectState.resources?.active_workers || [])],
      errors: JSON.parse(JSON.stringify(projectState.errors || []))
    };
  }

  /**
   * Create rollback plan
   * @private
   */
  _createRollbackPlan(snapshot, options) {
    const plan = {
      actions: [],
      estimated_duration_minutes: 5,
      risk_level: options.riskLevel || 'low',
      validation_steps: []
    };

    // Define rollback actions based on state
    switch (snapshot.state) {
      case 'EXECUTING':
        plan.actions = [
          {
            action: 'stop_workers',
            workers: snapshot.resources?.active_workers || []
          },
          {
            action: 'restore_checkpoint',
            checkpoint_data: 'snapshot'
          },
          {
            action: 'verify_state',
            expected_state: snapshot.state
          }
        ];
        plan.estimated_duration_minutes = 10;
        break;

      case 'VALIDATING':
        plan.actions = [
          {
            action: 'rollback_validation',
            validation_state: snapshot.validation
          },
          {
            action: 'restore_checkpoint',
            checkpoint_data: 'snapshot'
          }
        ];
        plan.estimated_duration_minutes = 5;
        break;

      default:
        plan.actions = [
          {
            action: 'restore_checkpoint',
            checkpoint_data: 'snapshot'
          }
        ];
        break;
    }

    // Add validation steps
    plan.validation_steps = [
      { step: 'verify_state', expected: snapshot.state },
      { step: 'verify_progress', expected: snapshot.progress?.percentage },
      { step: 'verify_workers', expected: snapshot.resources?.active_workers?.length || 0 }
    ];

    return plan;
  }

  /**
   * Save checkpoint to disk
   * @private
   */
  async _saveCheckpoint(checkpoint) {
    const checkpointPath = path.join(this.checkpointsDir, `${checkpoint.checkpoint_id}.json`);
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Log checkpoint action
   * @private
   */
  _logCheckpoint(checkpoint, action) {
    const logEntry = {
      checkpoint_id: checkpoint.checkpoint_id,
      project_id: checkpoint.project_id,
      action: action,
      timestamp: new Date().toISOString(),
      state: checkpoint.state,
      size_bytes: checkpoint.metadata?.size_bytes || 0
    };

    try {
      fs.appendFileSync(this.checkpointLogPath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Error logging checkpoint:', error.message);
    }
  }

  /**
   * Generate checkpoint ID
   * @private
   */
  _generateCheckpointId(projectId, checkpointName) {
    const timestamp = Date.now();
    const sanitizedName = checkpointName.replace(/[^a-z0-9-]/gi, '_');
    return `${projectId}-cp-${sanitizedName}-${timestamp}`;
  }

  /**
   * Calculate hash of data
   * @private
   */
  _calculateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Cleanup old checkpoints
   * @private
   */
  async _cleanupOldCheckpoints(projectId) {
    const checkpoints = await this.listCheckpoints(projectId);

    // Remove excess checkpoints (keep most recent)
    if (checkpoints.length > this.maxCheckpointsPerProject) {
      const toDelete = checkpoints.slice(this.maxCheckpointsPerProject);

      for (const checkpoint of toDelete) {
        await this.deleteCheckpoint(checkpoint.checkpoint_id);
      }
    }

    // Remove checkpoints older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    for (const checkpoint of checkpoints) {
      const checkpointDate = new Date(checkpoint.created_at);

      if (checkpointDate < cutoffDate) {
        await this.deleteCheckpoint(checkpoint.checkpoint_id);
      }
    }
  }

  /**
   * Ensure directories exist
   * @private
   */
  _ensureDirectories() {
    const dirs = [
      this.checkpointsDir,
      path.dirname(this.checkpointLogPath)
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new CheckpointManager();

  switch (command) {
    case 'create':
      const [projectId, name, state] = args.slice(1);
      const snapshot = JSON.parse(args[4] || '{}');
      manager.createCheckpoint(projectId, name, state, snapshot)
        .then(cp => console.log(JSON.stringify(cp, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'get':
      manager.getCheckpoint(args[1])
        .then(cp => console.log(JSON.stringify(cp, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'list':
      manager.listCheckpoints(args[1])
        .then(cps => console.log(JSON.stringify(cps, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'verify':
      manager.verifyCheckpoint(args[1])
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'stats':
      manager.getStatistics(args[1])
        .then(stats => console.log(JSON.stringify(stats, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    default:
      console.log('Usage: checkpoint-manager.js <command> [args]');
      console.log('Commands:');
      console.log('  create <projectId> <name> <state> <snapshot_json>');
      console.log('  get <checkpointId>');
      console.log('  list <projectId>');
      console.log('  verify <checkpointId>');
      console.log('  stats [projectId]');
      break;
  }
}

module.exports = CheckpointManager;
