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

// Union system imports
const CertificationValidator = require('../../coordination/worker-certification/cert-validator');
const PermitManager = require('../../coordination/union/permit-manager');
const AuditLogger = require('../../coordination/governance/audit-logger');

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

    // Union system components
    this.certValidator = new CertificationValidator({ coordinationDir: this.coordinationDir });
    this.permitManager = new PermitManager({ coordinationDir: this.coordinationDir });
    this.auditLogger = new AuditLogger({ coordinationDir: this.coordinationDir });

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

    // Initialize union system components
    await this.initializeUnionSystem();

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

  async initializeUnionSystem() {
    try {
      await this.certValidator.initialize();
      await this.permitManager.initialize();
      await this.auditLogger.initialize();

      console.log('[Worker] Union system components initialized');

      // Validate worker certifications on startup
      const environment = process.env.ENVIRONMENT || 'development';
      const certValidation = await this.certValidator.validateWorkerSpawn(
        this.workerId,
        this.workerType,
        environment
      );

      if (!certValidation.valid) {
        console.error('[Worker] Certification validation failed:', certValidation.denial_reason);
        console.error('[Worker] Missing certifications:', certValidation.missing_required);
        console.error('[Worker] Expired certifications:', certValidation.expired);

        if (certValidation.union_status === 'union') {
          throw new Error('Union worker failed certification validation - cannot start');
        } else {
          console.warn('[Worker] Non-union worker starting with certification warnings');
        }
      } else {
        console.log('[Worker] Certification validation passed');
      }

      this.certificationStatus = certValidation;
    } catch (error) {
      console.error('[Worker] Failed to initialize union system:', error);
      throw error;
    }
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
        pod_ip: process.env.POD_IP || 'unknown',
        certification_status: this.certificationStatus
      };

      const workerStateFile = path.join(
        this.coordinationDir,
        'workers',
        `${this.workerId}.json`
      );

      await fs.mkdir(path.dirname(workerStateFile), { recursive: true });
      await fs.writeFile(workerStateFile, JSON.stringify(workerState, null, 2));

      console.log(`[Worker] Registered: ${workerStateFile}`);

      // Log worker spawn to audit trail
      await this.auditLogger.logWorkerSpawn(
        this.workerId,
        this.workerType,
        'self-spawned',
        {
          certification_valid: this.certificationStatus?.valid || false,
          environment: process.env.ENVIRONMENT || 'development'
        }
      );
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
      // Check if task requires permit
      const permitRequired = await this.checkPermitRequirement(task);

      if (permitRequired.required && !task.permit_id) {
        throw new Error(`Task requires permit but none provided: ${permitRequired.reason}`);
      }

      // Validate permit if provided
      if (task.permit_id) {
        const permitValid = await this.validatePermit(task.permit_id, task);

        if (!permitValid.valid) {
          throw new Error(`Invalid permit: ${permitValid.reason}`);
        }

        console.log(`[Worker] Permit ${task.permit_id} validated successfully`);
      }

      // Execute the task using the existing spawn-worker script
      const result = await this.executeWorkerScript(task);

      // Consume permit if used
      if (task.permit_id) {
        await this.permitManager.consumePermit(task.permit_id, this.workerId);
      }

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

  async checkPermitRequirement(task) {
    // Check if worker type requires permits for this environment
    const environment = task.environment || process.env.ENVIRONMENT || 'development';

    // Load skill matrix to check permit requirements
    try {
      const skillMatrixPath = path.join(
        this.coordinationDir,
        'worker-certification',
        'skill-matrix.json'
      );
      const skillMatrixData = await fs.readFile(skillMatrixPath, 'utf8');
      const skillMatrix = JSON.parse(skillMatrixData);

      const workerConfig = skillMatrix.worker_types[this.workerType];

      if (!workerConfig) {
        return { required: false, reason: 'Unknown worker type' };
      }

      const permitRequired = workerConfig.permit_requirements?.[environment] || false;

      return {
        required: permitRequired,
        reason: permitRequired ? `${this.workerType} requires permit for ${environment}` : 'No permit required',
        union_status: workerConfig.union_status
      };
    } catch (error) {
      console.warn('[Worker] Failed to check permit requirement:', error.message);
      return { required: false, reason: 'Could not determine requirement' };
    }
  }

  async validatePermit(permitId, task) {
    try {
      const permitStatus = await this.permitManager.checkPermit(permitId);

      if (!permitStatus.valid) {
        return {
          valid: false,
          reason: `Permit status: ${permitStatus.status}`
        };
      }

      // Check permit hasn't expired
      if (new Date() > new Date(permitStatus.permit.expires_at)) {
        return {
          valid: false,
          reason: 'Permit has expired'
        };
      }

      // Check permit resource matches task
      const permitResource = permitStatus.permit.resource;
      if (task.resource && task.resource.identifier !== permitResource.identifier) {
        return {
          valid: false,
          reason: 'Permit resource does not match task resource'
        };
      }

      return {
        valid: true,
        permit: permitStatus.permit
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Permit validation error: ${error.message}`
      };
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
