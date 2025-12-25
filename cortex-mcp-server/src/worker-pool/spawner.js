/**
 * Worker Pool Spawner
 *
 * Manages spawning of 1-10,000 workers using the existing spawn-worker.sh infrastructure
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CORTEX_HOME = process.env.CORTEX_HOME || '/Users/ryandahlberg/Projects/cortex';
const SPAWN_SCRIPT = path.join(CORTEX_HOME, 'scripts/spawn-worker.sh');
const WORKER_POOL_FILE = path.join(CORTEX_HOME, 'coordination/worker-pool.json');

class WorkerPoolSpawner {
  constructor() {
    this.activeSpawns = new Map();
  }

  /**
   * Spawn a single worker
   * @param {object} config - Worker configuration
   * @returns {Promise<object>} Spawn result
   */
  async spawnWorker(config) {
    const {
      worker_type = 'implementation',
      task_id = `task-${uuidv4()}`,
      master = 'development-master',
      priority = 'normal',
      spec = {}
    } = config;

    console.log(`[Worker Spawner] Spawning ${worker_type} worker for task ${task_id}`);

    return new Promise((resolve) => {
      const args = [
        SPAWN_SCRIPT,
        '--type', `${worker_type}-worker`,
        '--task-id', task_id,
        '--master', master,
        '--priority', priority
      ];

      const proc = spawn('bash', args, {
        env: {
          ...process.env,
          GOVERNANCE_BYPASS: 'true',
          CORTEX_HOME
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        const result = {
          worker_type,
          task_id,
          master,
          priority,
          success: code === 0,
          output: stdout.trim(),
          error: stderr.trim(),
          timestamp: new Date().toISOString()
        };

        if (code === 0) {
          console.log(`[Worker Spawner] Worker spawned successfully: ${task_id}`);
        } else {
          console.error(`[Worker Spawner] Worker spawn failed: ${task_id} (code ${code})`);
        }

        resolve(result);
      });
    });
  }

  /**
   * Spawn multiple workers in parallel
   * @param {object[]} configs - Array of worker configurations
   * @param {number} concurrency - Maximum concurrent spawns (default: 10)
   * @returns {Promise<object[]>} Array of spawn results
   */
  async spawnWorkers(configs, concurrency = 10) {
    console.log(`[Worker Spawner] Spawning ${configs.length} workers (concurrency: ${concurrency})`);

    const results = [];
    const batches = [];

    // Split into batches based on concurrency
    for (let i = 0; i < configs.length; i += concurrency) {
      batches.push(configs.slice(i, i + concurrency));
    }

    // Process batches sequentially, workers within batch in parallel
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[Worker Spawner] Processing batch ${i + 1}/${batches.length} (${batch.length} workers)`);

      const batchResults = await Promise.all(
        batch.map(config => this.spawnWorker(config))
      );

      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the system
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Worker Spawner] Spawn complete: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Spawn worker swarm for a specific task type
   * @param {string} swarmType - Type of swarm (e.g., 'microservice-build')
   * @param {number} count - Number of workers
   * @param {object} baseConfig - Base configuration for all workers
   * @returns {Promise<object>} Swarm spawn result
   */
  async spawnSwarm(swarmType, count, baseConfig = {}) {
    console.log(`[Worker Spawner] Spawning ${swarmType} swarm: ${count} workers`);

    const configs = [];
    for (let i = 0; i < count; i++) {
      configs.push({
        ...baseConfig,
        task_id: `${swarmType}-${i + 1}-${uuidv4().substring(0, 8)}`,
        worker_type: baseConfig.worker_type || 'implementation',
        master: baseConfig.master || 'development-master',
        priority: baseConfig.priority || 'normal'
      });
    }

    const startTime = Date.now();
    const results = await this.spawnWorkers(configs, 20); // Higher concurrency for swarms
    const duration = (Date.now() - startTime) / 1000;

    return {
      swarm_type: swarmType,
      worker_count: count,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration_seconds: duration,
      workers_per_second: count / duration,
      results
    };
  }

  /**
   * Get current worker pool status
   */
  async getPoolStatus() {
    try {
      const data = await fs.readFile(WORKER_POOL_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`[Worker Spawner] Failed to read worker pool: ${error.message}`);
      return {
        active_workers: [],
        completed_workers: [],
        failed_workers: [],
        capacity: { current: 0, max: 10000 }
      };
    }
  }

  /**
   * Calculate available capacity
   */
  async getAvailableCapacity() {
    const pool = await this.getPoolStatus();
    const active = pool.active_workers?.length || 0;
    const max = pool.capacity?.max || 10000;

    return {
      active,
      max,
      available: max - active,
      usage_percentage: (active / max) * 100
    };
  }
}

module.exports = WorkerPoolSpawner;
