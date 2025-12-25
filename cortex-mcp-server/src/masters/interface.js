/**
 * Master Agent Interface
 *
 * Handles communication with master agents via handoff files
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CORTEX_HOME = process.env.CORTEX_HOME || '/Users/ryandahlberg/Projects/cortex';
const HANDOFFS_DIR = path.join(CORTEX_HOME, 'coordination/masters/coordinator/handoffs');
const TASK_QUEUE_FILE = path.join(CORTEX_HOME, 'coordination/task-queue.json');

class MasterInterface {
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Create a handoff to a master agent
   * @param {string} targetMaster - Master ID to hand off to
   * @param {object} taskData - Task data
   * @returns {Promise<object>} Handoff result
   */
  async createHandoff(targetMaster, taskData) {
    const handoffId = `mcp-to-${targetMaster}-${uuidv4().substring(0, 8)}`;

    const handoff = {
      handoff_id: handoffId,
      from_master: 'mcp-server',
      to_master: targetMaster,
      task_id: taskData.task_id || `task-${uuidv4()}`,
      task_data: taskData,
      context: {
        routing_reason: 'MCP Server delegation',
        priority: taskData.priority || 'normal',
        expected_outcome: 'Task completion with results handoff'
      },
      created_at: new Date().toISOString(),
      status: 'pending_pickup'
    };

    try {
      const handoffPath = path.join(HANDOFFS_DIR, `${handoffId}.json`);
      await fs.writeFile(handoffPath, JSON.stringify(handoff, null, 2));

      console.log(`[Master Interface] Created handoff: ${handoffId} → ${targetMaster}`);

      return {
        success: true,
        handoff_id: handoffId,
        handoff_path: handoffPath,
        target_master: targetMaster
      };
    } catch (error) {
      console.error(`[Master Interface] Failed to create handoff: ${error.message}`);
      return {
        success: false,
        error: error.message,
        handoff_id: handoffId
      };
    }
  }

  /**
   * Check handoff status
   */
  async getHandoffStatus(handoffId) {
    try {
      const handoffPath = path.join(HANDOFFS_DIR, `${handoffId}.json`);
      const data = await fs.readFile(handoffPath, 'utf8');
      const handoff = JSON.parse(data);

      // Check if processed
      const processedPath = `${handoffPath}.processed`;
      const isProcessed = await fs.access(processedPath)
        .then(() => true)
        .catch(() => false);

      return {
        ...handoff,
        is_processed: isProcessed,
        checked_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Handoff not found: ${error.message}`,
        handoff_id: handoffId
      };
    }
  }

  /**
   * Add task to task queue
   */
  async addTaskToQueue(taskData) {
    try {
      const queueData = await fs.readFile(TASK_QUEUE_FILE, 'utf8');
      const queue = JSON.parse(queueData);

      const task = {
        task_id: taskData.task_id || `task-${uuidv4()}`,
        description: taskData.description,
        type: taskData.type || 'general',
        status: 'pending',
        priority: taskData.priority || 'normal',
        created_at: new Date().toISOString(),
        metadata: taskData.metadata || {}
      };

      queue.tasks = queue.tasks || [];
      queue.tasks.push(task);

      await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(queue, null, 2));

      console.log(`[Master Interface] Added task to queue: ${task.task_id}`);

      return {
        success: true,
        task
      };
    } catch (error) {
      console.error(`[Master Interface] Failed to add task to queue: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Coordinate a task by finding best master and creating handoff
   */
  async coordinateTask(taskDescription, options = {}) {
    console.log(`[Master Interface] Coordinating task: ${taskDescription}`);

    // Find best master for this task
    const routing = this.registry.findBestMaster(taskDescription);

    console.log(`[Master Interface] Routed to ${routing.master_name} (confidence: ${routing.confidence})`);

    // Create task data
    const taskData = {
      task_id: options.task_id || `task-${uuidv4()}`,
      description: taskDescription,
      type: options.type || 'general',
      priority: options.priority || 'normal',
      metadata: options.metadata || {}
    };

    // Add to task queue
    await this.addTaskToQueue(taskData);

    // Create handoff
    const handoff = await this.createHandoff(routing.master_id, taskData);

    return {
      task_id: taskData.task_id,
      routed_to: routing.master_name,
      master_id: routing.master_id,
      confidence: routing.confidence,
      reason: routing.reason,
      handoff_id: handoff.handoff_id,
      handoff_path: handoff.handoff_path,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get master status
   */
  async getMasterStatus(masterId) {
    const state = await this.registry.getMasterState(masterId);
    const manifest = this.registry.getMaster(masterId);

    return {
      master_id: masterId,
      master_name: manifest?.master_name || 'Unknown',
      state,
      capabilities: manifest?.capabilities || [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * List all pending handoffs
   */
  async listPendingHandoffs() {
    try {
      const files = await fs.readdir(HANDOFFS_DIR);
      const pendingFiles = files.filter(f =>
        f.startsWith('mcp-to-') && f.endsWith('.json') && !f.endsWith('.processed')
      );

      const pending = [];
      for (const file of pendingFiles) {
        try {
          const data = await fs.readFile(path.join(HANDOFFS_DIR, file), 'utf8');
          const handoff = JSON.parse(data);
          pending.push(handoff);
        } catch (error) {
          // Skip invalid files
        }
      }

      return pending;
    } catch (error) {
      console.error(`[Master Interface] Failed to list handoffs: ${error.message}`);
      return [];
    }
  }
}

module.exports = MasterInterface;
