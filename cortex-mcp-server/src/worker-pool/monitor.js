/**
 * Worker Pool Monitor
 *
 * Monitors worker health, tracks completion, and provides real-time status
 */

const fs = require('fs').promises;
const path = require('path');

const CORTEX_HOME = process.env.CORTEX_HOME || '/Users/ryandahlberg/Projects/cortex';
const WORKER_POOL_FILE = path.join(CORTEX_HOME, 'coordination/worker-pool.json');
const HEALTH_METRICS_FILE = path.join(CORTEX_HOME, 'coordination/worker-health-metrics.jsonl');

class WorkerPoolMonitor {
  constructor() {
    this.healthChecks = new Map();
  }

  /**
   * Get current worker pool state
   */
  async getPoolState() {
    try {
      const data = await fs.readFile(WORKER_POOL_FILE, 'utf8');
      const pool = JSON.parse(data);

      return {
        active: pool.active_workers || [],
        completed: pool.completed_workers || [],
        failed: pool.failed_workers || [],
        capacity: pool.capacity || { current: 0, max: 10000 },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[Worker Monitor] Failed to read pool state: ${error.message}`);
      return {
        active: [],
        completed: [],
        failed: [],
        capacity: { current: 0, max: 10000 },
        error: error.message
      };
    }
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats() {
    const pool = await this.getPoolState();

    const totalWorkers = pool.active.length + pool.completed.length + pool.failed.length;
    const successRate = totalWorkers > 0
      ? (pool.completed.length / (pool.completed.length + pool.failed.length)) * 100
      : 0;

    return {
      total: totalWorkers,
      active: pool.active.length,
      completed: pool.completed.length,
      failed: pool.failed.length,
      success_rate: successRate.toFixed(2) + '%',
      capacity_usage: {
        current: pool.active.length,
        max: pool.capacity.max,
        available: pool.capacity.max - pool.active.length,
        percentage: ((pool.active.length / pool.capacity.max) * 100).toFixed(2) + '%'
      }
    };
  }

  /**
   * Get worker health metrics
   */
  async getHealthMetrics() {
    try {
      const data = await fs.readFile(HEALTH_METRICS_FILE, 'utf8');
      const lines = data.trim().split('\n').filter(l => l.trim());

      // Get last 10 health metrics
      const metrics = lines.slice(-10).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(m => m !== null);

      return metrics;
    } catch (error) {
      console.error(`[Worker Monitor] Failed to read health metrics: ${error.message}`);
      return [];
    }
  }

  /**
   * Monitor worker progress
   * @param {string} taskId - Task ID to monitor
   * @param {number} intervalMs - Polling interval in milliseconds
   * @returns {AsyncGenerator} Yields worker status updates
   */
  async *monitorWorker(taskId, intervalMs = 5000) {
    while (true) {
      const pool = await this.getPoolState();

      // Find worker in active, completed, or failed lists
      let worker = pool.active.find(w => w.task_id === taskId);
      let status = 'active';

      if (!worker) {
        worker = pool.completed.find(w => w.task_id === taskId);
        status = 'completed';
      }

      if (!worker) {
        worker = pool.failed.find(w => w.task_id === taskId);
        status = 'failed';
      }

      if (!worker) {
        yield {
          task_id: taskId,
          status: 'not_found',
          timestamp: new Date().toISOString()
        };
        return;
      }

      yield {
        task_id: taskId,
        status,
        worker,
        timestamp: new Date().toISOString()
      };

      // Stop monitoring if worker is completed or failed
      if (status === 'completed' || status === 'failed') {
        return;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Get aggregated swarm status
   * @param {string[]} taskIds - Array of task IDs in the swarm
   */
  async getSwarmStatus(taskIds) {
    const pool = await this.getPoolState();
    const swarmWorkers = [];

    for (const taskId of taskIds) {
      let worker = pool.active.find(w => w.task_id === taskId);
      let status = 'active';

      if (!worker) {
        worker = pool.completed.find(w => w.task_id === taskId);
        status = 'completed';
      }

      if (!worker) {
        worker = pool.failed.find(w => w.task_id === taskId);
        status = 'failed';
      }

      swarmWorkers.push({
        task_id: taskId,
        status: worker ? status : 'not_found',
        worker
      });
    }

    const statusCounts = swarmWorkers.reduce((acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    }, {});

    const completionPercentage = taskIds.length > 0
      ? ((statusCounts.completed || 0) / taskIds.length) * 100
      : 0;

    return {
      total_workers: taskIds.length,
      status_counts: statusCounts,
      completion_percentage: completionPercentage.toFixed(2) + '%',
      workers: swarmWorkers,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if worker pool is healthy
   */
  async isHealthy() {
    try {
      const stats = await this.getWorkerStats();

      // Pool is healthy if:
      // 1. We can read the pool state
      // 2. Capacity usage is below 90%
      // 3. Success rate is above 50% (if we have completed workers)

      const capacityOk = parseFloat(stats.capacity_usage.percentage) < 90;
      const successRateOk = stats.completed + stats.failed === 0 ||
        parseFloat(stats.success_rate) > 50;

      return {
        healthy: capacityOk && successRateOk,
        capacity_ok: capacityOk,
        success_rate_ok: successRateOk,
        stats
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = WorkerPoolMonitor;
