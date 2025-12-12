#!/usr/bin/env node

/**
 * Cortex Master Mode
 *
 * Persistent master that:
 * 1. Loads master-specific configuration
 * 2. Starts coordination loop
 * 3. Never exits (StatefulSet requirement)
 * 4. Monitors handoffs and spawns workers
 *
 * This is used by StatefulSets that always maintain 1 replica
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class CortexMaster {
  constructor() {
    this.masterType = process.env.CORTEX_TYPE || process.env.MASTER_TYPE || 'coordinator';
    this.coordinationDir = process.env.COORDINATION_DIR || '/app/coordination';
    this.masterStateFile = path.join(
      this.coordinationDir,
      'masters',
      this.masterType,
      'context',
      'master-state.json'
    );
    this.handoffCheckInterval = parseInt(process.env.HANDOFF_CHECK_INTERVAL || '30') * 1000;
    this.isRunning = false;
    this.masterScript = null;
    this.masterProcess = null;

    console.log(`[Master] Initializing Cortex Master`);
    console.log(`[Master] Type: ${this.masterType}`);
    console.log(`[Master] Coordination Dir: ${this.coordinationDir}`);
    console.log(`[Master] State File: ${this.masterStateFile}`);

    this.setupSignalHandlers();
  }

  setupSignalHandlers() {
    // Masters should never exit normally, but handle signals gracefully
    process.on('SIGTERM', async () => {
      console.log('[Master] Received SIGTERM - this should not happen for masters!');
      console.log('[Master] Masters are StatefulSets and should not be terminated normally');
      await this.updateMasterState({ status: 'terminating' });
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('[Master] Received SIGINT');
      await this.updateMasterState({ status: 'stopped' });
      process.exit(0);
    });

    process.on('uncaughtException', async (err) => {
      console.error('[Master] Uncaught exception:', err);
      await this.updateMasterState({
        status: 'error',
        last_error: err.message,
        last_error_at: new Date().toISOString()
      });
      // Don't exit - restart the master loop
      setTimeout(() => this.start(), 5000);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[Master] Unhandled rejection at:', promise, 'reason:', reason);
      await this.updateMasterState({
        status: 'error',
        last_error: reason.toString(),
        last_error_at: new Date().toISOString()
      });
    });
  }

  async start() {
    console.log('[Master] Starting master...');
    this.isRunning = true;

    // Initialize master state
    await this.initializeMasterState();

    // Determine which master script to run
    this.masterScript = this.getMasterScript();

    if (!this.masterScript) {
      console.error(`[Master] No master script found for type: ${this.masterType}`);
      console.error('[Master] Falling back to coordination loop');
      await this.coordinationLoop();
      return;
    }

    // Start the master script
    await this.startMasterScript();
  }

  getMasterScript() {
    const scriptMap = {
      'coordinator': '/app/scripts/run-coordinator-master.sh',
      'development': '/app/scripts/run-development-master.sh',
      'security': '/app/scripts/run-security-master.sh',
      'cicd': '/app/scripts/run-cicd-master.sh',
      'inventory': '/app/scripts/run-inventory-master.sh'
    };

    return scriptMap[this.masterType] || null;
  }

  async startMasterScript() {
    console.log(`[Master] Starting master script: ${this.masterScript}`);

    const proc = spawn(this.masterScript, [], {
      env: {
        ...process.env,
        CORTEX_MODE: 'master',
        CORTEX_TYPE: this.masterType
      },
      stdio: 'inherit'
    });

    this.masterProcess = proc;

    proc.on('exit', async (code) => {
      console.log(`[Master] Master script exited with code ${code}`);
      await this.updateMasterState({
        status: 'restarting',
        last_exit_code: code,
        last_exit_at: new Date().toISOString()
      });

      // Restart after 5 seconds
      setTimeout(() => {
        if (this.isRunning) {
          console.log('[Master] Restarting master script...');
          this.startMasterScript();
        }
      }, 5000);
    });

    proc.on('error', async (error) => {
      console.error('[Master] Master script error:', error);
      await this.updateMasterState({
        status: 'error',
        last_error: error.message,
        last_error_at: new Date().toISOString()
      });

      // Restart after 5 seconds
      setTimeout(() => {
        if (this.isRunning) {
          console.log('[Master] Restarting master script...');
          this.startMasterScript();
        }
      }, 5000);
    });

    // Keep the process alive
    await this.keepAlive();
  }

  async coordinationLoop() {
    console.log('[Master] Starting coordination loop...');

    while (this.isRunning) {
      try {
        await this.updateMasterState({
          status: 'active',
          last_heartbeat: new Date().toISOString()
        });

        // Check for handoffs
        await this.checkHandoffs();

        // Sleep before next iteration
        await this.sleep(this.handoffCheckInterval);
      } catch (error) {
        console.error('[Master] Error in coordination loop:', error);
        await this.sleep(5000);
      }
    }
  }

  async checkHandoffs() {
    try {
      const handoffDir = path.join(
        this.coordinationDir,
        'masters',
        this.masterType,
        'handoffs'
      );

      await fs.mkdir(handoffDir, { recursive: true });
      const files = await fs.readdir(handoffDir);

      const pendingHandoffs = files.filter(f =>
        f.startsWith('to-') && f.endsWith('.json')
      );

      if (pendingHandoffs.length > 0) {
        console.log(`[Master] Found ${pendingHandoffs.length} pending handoffs`);

        for (const handoffFile of pendingHandoffs) {
          try {
            const handoffPath = path.join(handoffDir, handoffFile);
            const handoffData = JSON.parse(await fs.readFile(handoffPath, 'utf8'));

            if (handoffData.status === 'pending_pickup') {
              console.log(`[Master] Processing handoff: ${handoffData.handoff_id}`);
              // This would trigger master-specific logic
              // For now, just log it
            }
          } catch (error) {
            console.error(`[Master] Error processing handoff ${handoffFile}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[Master] Error checking handoffs:', error);
    }
  }

  async initializeMasterState() {
    try {
      await fs.mkdir(path.dirname(this.masterStateFile), { recursive: true });

      let state;
      try {
        const existingState = await fs.readFile(this.masterStateFile, 'utf8');
        state = JSON.parse(existingState);
        console.log('[Master] Loaded existing state');
      } catch (error) {
        // Create new state
        state = {
          master_type: this.masterType,
          session_id: this.generateSessionId(),
          status: 'initializing',
          started_at: new Date().toISOString(),
          active_workers: [],
          performance_metrics: {
            tasks_processed: 0,
            workers_spawned: 0,
            avg_task_duration: 0
          }
        };
        console.log('[Master] Created new state');
      }

      state.status = 'active';
      state.last_startup = new Date().toISOString();
      state.hostname = process.env.HOSTNAME || 'unknown';
      state.pod_ip = process.env.POD_IP || 'unknown';

      await fs.writeFile(this.masterStateFile, JSON.stringify(state, null, 2));
      console.log(`[Master] Initialized state: ${this.masterStateFile}`);
    } catch (error) {
      console.error('[Master] Failed to initialize state:', error);
    }
  }

  async updateMasterState(updates) {
    try {
      let state;
      try {
        const existingState = await fs.readFile(this.masterStateFile, 'utf8');
        state = JSON.parse(existingState);
      } catch (error) {
        state = {
          master_type: this.masterType,
          session_id: this.generateSessionId()
        };
      }

      Object.assign(state, updates);
      state.updated_at = new Date().toISOString();

      await fs.writeFile(this.masterStateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('[Master] Failed to update state:', error);
    }
  }

  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${this.masterType}-${timestamp}-${random}`;
  }

  async keepAlive() {
    // Keep the process running
    while (this.isRunning) {
      await this.sleep(60000); // Heartbeat every minute

      await this.updateMasterState({
        last_heartbeat: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000)
      });
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the master
if (require.main === module) {
  const master = new CortexMaster();
  master.startTime = Date.now();
  master.start().catch(error => {
    console.error('[Master] Fatal error:', error);
    // Don't exit - masters should never die
    setTimeout(() => master.start(), 5000);
  });
}

module.exports = CortexMaster;
