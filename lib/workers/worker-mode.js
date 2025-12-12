#!/usr/bin/env node

/**
 * Cortex Worker Mode
 *
 * Stateless worker that:
 * 1. Connects to task queue
 * 2. Processes tasks until SIGTERM
 * 3. Gracefully shuts down (finishes current task, then exits)
 *
 * This enables KEDA scale-to-zero capability
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class CortexWorker {
  constructor() {
    this.workerId = this.generateWorkerId();
    this.workerType = process.env.CORTEX_TYPE || process.env.WORKER_TYPE || 'implementation-worker';
    this.taskQueueEndpoint = process.env.TASK_QUEUE_ENDPOINT || 'http://task-queue-service:8080';
    this.coordinationDir = process.env.COORDINATION_DIR || '/app/coordination';
    this.isShuttingDown = false;
    this.currentTask = null;
    this.tasksProcessed = 0;
    this.startTime = Date.now();

    console.log(`[Worker] Initializing Cortex Worker`);
    console.log(`[Worker] ID: ${this.workerId}`);
    console.log(`[Worker] Type: ${this.workerType}`);
    console.log(`[Worker] Task Queue: ${this.taskQueueEndpoint}`);

    this.setupSignalHandlers();
  }

  generateWorkerId() {
    const hostname = process.env.HOSTNAME || 'unknown';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${hostname}-${timestamp}-${random}`;
  }

  setupSignalHandlers() {
    // Graceful shutdown on SIGTERM (Kubernetes pod termination)
    process.on('SIGTERM', () => {
      console.log('[Worker] Received SIGTERM - initiating graceful shutdown');
      this.isShuttingDown = true;

      if (!this.currentTask) {
        console.log('[Worker] No task in progress - shutting down immediately');
        this.shutdown();
      } else {
        console.log(`[Worker] Task in progress: ${this.currentTask.task_id} - will shutdown after completion`);
        // Set timeout to force shutdown after 5 minutes
        setTimeout(() => {
          console.log('[Worker] Graceful shutdown timeout - forcing shutdown');
          this.shutdown(1);
        }, 5 * 60 * 1000);
      }
    });

    process.on('SIGINT', () => {
      console.log('[Worker] Received SIGINT - shutting down');
      this.shutdown();
    });

    process.on('uncaughtException', (err) => {
      console.error('[Worker] Uncaught exception:', err);
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
      this.shutdown(1);
    });
  }

  async start() {
    console.log('[Worker] Starting worker loop...');
    await this.registerWorker();

    while (!this.isShuttingDown) {
      try {
        const task = await this.fetchTask();

        if (task) {
          await this.processTask(task);
        } else {
          // No tasks available - wait before polling again
          await this.sleep(10000); // 10 seconds

          // Check if we should exit due to inactivity
          const idleTime = Date.now() - this.startTime;
          if (this.tasksProcessed === 0 && idleTime > 5 * 60 * 1000) {
            console.log('[Worker] No tasks received in 5 minutes - shutting down');
            this.isShuttingDown = true;
          }
        }
      } catch (error) {
        console.error('[Worker] Error in worker loop:', error);
        await this.sleep(5000); // Wait 5s before retrying
      }
    }

    await this.shutdown();
  }

  async registerWorker() {
    try {
      const workerState = {
        worker_id: this.workerId,
        worker_type: this.workerType,
        status: 'active',
        registered_at: new Date().toISOString(),
        tasks_processed: 0,
        hostname: process.env.HOSTNAME,
        pod_ip: process.env.POD_IP || 'unknown'
      };

      const workerStateFile = path.join(
        this.coordinationDir,
        'workers',
        `${this.workerId}.json`
      );

      await fs.mkdir(path.dirname(workerStateFile), { recursive: true });
      await fs.writeFile(workerStateFile, JSON.stringify(workerState, null, 2));

      console.log(`[Worker] Registered: ${workerStateFile}`);
    } catch (error) {
      console.error('[Worker] Failed to register:', error);
    }
  }

  async fetchTask() {
    try {
      // In file-based mode, scan task queue directory
      const taskQueueDir = path.join(this.coordinationDir, 'task-queue', this.workerType);

      try {
        await fs.mkdir(taskQueueDir, { recursive: true });
        const files = await fs.readdir(taskQueueDir);

        const pendingTasks = files.filter(f =>
          f.endsWith('.json') && !f.includes('.processing')
        );

        if (pendingTasks.length === 0) {
          return null;
        }

        // Claim the first task by renaming it
        const taskFile = path.join(taskQueueDir, pendingTasks[0]);
        const processingFile = taskFile.replace('.json', '.processing.json');

        try {
          await fs.rename(taskFile, processingFile);
          const taskData = await fs.readFile(processingFile, 'utf8');
          return JSON.parse(taskData);
        } catch (error) {
          // Another worker claimed it
          return null;
        }
      } catch (error) {
        console.error('[Worker] Error fetching task:', error);
        return null;
      }
    } catch (error) {
      console.error('[Worker] Failed to fetch task:', error);
      return null;
    }
  }

  async processTask(task) {
    this.currentTask = task;
    console.log(`[Worker] Processing task: ${task.task_id}`);
    console.log(`[Worker] Task type: ${task.task_type || 'unknown'}`);

    const startTime = Date.now();

    try {
      // Execute the task using the existing spawn-worker script
      const result = await this.executeWorkerScript(task);

      const duration = Date.now() - startTime;
      console.log(`[Worker] Task completed: ${task.task_id} (${duration}ms)`);

      this.tasksProcessed++;
      await this.recordTaskCompletion(task, 'completed', result);

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Worker] Task failed: ${task.task_id} (${duration}ms)`, error);

      await this.recordTaskCompletion(task, 'failed', { error: error.message });
    } finally {
      this.currentTask = null;

      // Remove processing file
      try {
        const taskQueueDir = path.join(this.coordinationDir, 'task-queue', this.workerType);
        const processingFile = path.join(taskQueueDir, `${task.task_id}.processing.json`);
        await fs.unlink(processingFile);
      } catch (error) {
        console.error('[Worker] Failed to remove processing file:', error);
      }
    }
  }

  async executeWorkerScript(task) {
    return new Promise((resolve, reject) => {
      // Determine which spawn script to use
      const workerScript = path.join('/app/scripts', 'spawn-worker.sh');

      const args = [
        '--type', this.workerType,
        '--task-id', task.task_id,
        '--mode', 'execute'
      ];

      console.log(`[Worker] Executing: ${workerScript} ${args.join(' ')}`);

      const proc = spawn(workerScript, args, {
        env: {
          ...process.env,
          WORKER_ID: this.workerId,
          TASK_ID: task.task_id
        },
        stdio: 'inherit'
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Worker script exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  async recordTaskCompletion(task, status, result) {
    try {
      const completionRecord = {
        task_id: task.task_id,
        worker_id: this.workerId,
        worker_type: this.workerType,
        status: status,
        result: result,
        completed_at: new Date().toISOString()
      };

      const completionFile = path.join(
        this.coordinationDir,
        'task-results',
        `${task.task_id}.json`
      );

      await fs.mkdir(path.dirname(completionFile), { recursive: true });
      await fs.writeFile(completionFile, JSON.stringify(completionRecord, null, 2));

      console.log(`[Worker] Recorded completion: ${completionFile}`);
    } catch (error) {
      console.error('[Worker] Failed to record task completion:', error);
    }
  }

  async shutdown(exitCode = 0) {
    console.log('[Worker] Shutting down...');

    try {
      // Update worker state to inactive
      const workerStateFile = path.join(
        this.coordinationDir,
        'workers',
        `${this.workerId}.json`
      );

      const workerState = JSON.parse(await fs.readFile(workerStateFile, 'utf8'));
      workerState.status = 'shutdown';
      workerState.shutdown_at = new Date().toISOString();
      workerState.tasks_processed = this.tasksProcessed;
      workerState.uptime_ms = Date.now() - this.startTime;

      await fs.writeFile(workerStateFile, JSON.stringify(workerState, null, 2));
    } catch (error) {
      console.error('[Worker] Failed to update worker state:', error);
    }

    console.log(`[Worker] Processed ${this.tasksProcessed} tasks`);
    console.log('[Worker] Goodbye!');

    process.exit(exitCode);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the worker
if (require.main === module) {
  const worker = new CortexWorker();
  worker.start().catch(error => {
    console.error('[Worker] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = CortexWorker;
