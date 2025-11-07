#!/usr/bin/env node

/**
 * Commit-Relay Dashboard Server
 * Real-time metrics and monitoring for the master-worker system
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const cors = require('cors');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Paths to coordination files
const COORD_DIR = path.join(__dirname, '../../coordination');
const FILES = {
  workerPool: path.join(COORD_DIR, 'worker-pool.json'),
  tokenBudget: path.join(COORD_DIR, 'token-budget.json'),
  taskQueue: path.join(COORD_DIR, 'task-queue.json'),
  handoffs: path.join(COORD_DIR, 'handoffs.json'),
  status: path.join(COORD_DIR, 'status.json'),
  dashboardEvents: path.join(COORD_DIR, 'dashboard-events.jsonl')
};

// Cache for coordination data
let cache = {
  workerPool: null,
  tokenBudget: null,
  taskQueue: null,
  handoffs: null,
  status: null,
  lastUpdate: null,
  lastFileUpdate: {} // Track last update time per file
};

// Event buffer for reconnecting clients (last 50 events)
const EVENT_BUFFER_SIZE = 50;
let eventBuffer = [];

/**
 * Read and parse JSON file safely with retry logic
 */
async function readJSON(filePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Track file update time
      cache.lastFileUpdate[filePath] = new Date().toISOString();

      return data;
    } catch (error) {
      if (attempt === retries) {
        console.error(`Error reading ${filePath} after ${retries} attempts:`, error.message);
        return null;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 50 * attempt));
    }
  }
  return null;
}

/**
 * Generate task events from task queue changes
 */
async function generateTaskEvents(newTaskQueue, oldTaskQueue) {
  if (!newTaskQueue || !newTaskQueue.tasks) return [];

  const events = [];
  const oldTasks = oldTaskQueue?.tasks || [];
  const newTasks = newTaskQueue.tasks;

  // Create a map of old tasks by ID for quick lookup
  const oldTasksMap = {};
  oldTasks.forEach(task => {
    oldTasksMap[task.id] = task;
  });

  // Check each task for state changes
  for (const task of newTasks) {
    const oldTask = oldTasksMap[task.id];

    if (!oldTask) {
      // New task created
      events.push({
        id: `task-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'task_created',
        timestamp: task.created_at || new Date().toISOString(),
        data: {
          task_id: task.id,
          task_title: task.title,
          task_type: task.type,
          priority: task.priority,
          created_by: task.created_by
        },
        message: `Task Created: '${task.id}: ${task.title}'`
      });
    } else {
      // Check for status changes
      if (oldTask.status !== task.status) {
        if (task.status === 'assigned' || (oldTask.status === 'pending' && task.assigned_to)) {
          events.push({
            id: `task-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'task_assigned',
            timestamp: task.assigned_at || new Date().toISOString(),
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to,
              priority: task.priority
            },
            message: `Task Assigned: '${task.id}' → ${task.assigned_to}`
          });
        } else if (task.status === 'completed') {
          events.push({
            id: `task-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'task_completed',
            timestamp: task.completed_at || new Date().toISOString(),
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to,
              duration: task.completed_at && task.started_at
                ? Math.round((new Date(task.completed_at) - new Date(task.started_at)) / 60000) + ' min'
                : 'N/A'
            },
            message: `Task Completed: '${task.id}: ${task.title}' ✓`
          });
        } else if (task.status === 'failed') {
          events.push({
            id: `task-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'task_failed',
            timestamp: task.failed_at || new Date().toISOString(),
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to,
              error: task.error || 'Unknown error'
            },
            message: `Task Failed: '${task.id}: ${task.title}' ✗`
          });
        }
      }
    }
  }

  return events;
}

/**
 * Load all coordination data (serves from cache, updates on file changes)
 */
async function loadCoordinationData(forceRefresh = false) {
  if (!forceRefresh && cache.lastUpdate) {
    // Serve from cache if available
    return cache;
  }

  // Generate live worker pool from spec files
  const workerSpecsDir = path.join(COORD_DIR, 'worker-specs');
  const liveWorkerPool = await generateLiveWorkerPool(workerSpecsDir);

  // Load orchestrator state (v4.0)
  const orchestratorState = await readJSON(path.join(COORD_DIR, 'orchestrator/state/current.json'));

  // Load Execution Manager data (v4.0)
  const executionManagersData = await generateLiveExecutionManagers(COORD_DIR);

  const data = {
    workerPool: liveWorkerPool,
    tokenBudget: await readJSON(FILES.tokenBudget),
    taskQueue: await readJSON(FILES.taskQueue),
    handoffs: await readJSON(FILES.handoffs),
    status: await readJSON(FILES.status),
    orchestrator: orchestratorState || {
      active_orchestrations: 0,
      total_orchestrations: 0,
      completed_orchestrations: 0,
      failed_orchestrations: 0
    },
    executionManagers: executionManagersData,
    lastUpdate: new Date().toISOString(),
    lastFileUpdate: cache.lastFileUpdate
  };

  cache = data;
  return data;
}

/**
 * Get daemon status
 */
async function getDaemonStatus() {
  const { execSync } = require('child_process');
  const fsSync = require('fs');

  const PID_FILE = '/tmp/commit-relay-worker-daemon.pid';
  const LOG_FILE = path.join(__dirname, '../../agents/logs/system/worker-daemon.log');

  let status = 'stopped';
  let pid = null;
  let uptime = null;
  let memory = null;

  if (fsSync.existsSync(PID_FILE)) {
    try {
      pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
      execSync(`ps -p ${pid}`, { stdio: 'pipe' });
      status = 'running';

      const psOutput = execSync(`ps -o etime= -p ${pid}`).toString().trim();
      uptime = parseElapsedTime(psOutput);

      const memOutput = execSync(`ps -o rss= -p ${pid}`).toString().trim();
      memory = parseInt(memOutput);
    } catch (error) {
      status = 'stopped';
      pid = null;
    }
  }

  let recentLogs = [];
  if (fsSync.existsSync(LOG_FILE)) {
    try {
      const logContent = fsSync.readFileSync(LOG_FILE, 'utf-8');
      const logLines = logContent.trim().split('\n');
      recentLogs = logLines.slice(-10);
    } catch (error) {
      console.error('Error reading daemon log:', error);
    }
  }

  const launchCount = recentLogs.filter(line =>
    line.includes('SUCCESS: Launched')
  ).length;

  return {
    status,
    pid,
    uptime,
    memory,
    launchCount,
    recentLogs,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate success rate for different time periods
 */
// Helper function to filter out test/zombie workers
function isProductionWorker(worker) {
  // Exclude stress test workers
  if (worker.stress_test === true) return false;
  // Exclude zombie test workers (from DDQD tests)
  if (worker.worker_id && worker.worker_id.includes('zombie-ddqd')) return false;
  if (worker.worker_id && worker.worker_id.startsWith('zombie-')) return false;
  // Exclude workers with test_id field (stress test workers)
  if (worker.test_id) return false;
  return true;
}

function calculateSuccessRate(workerPool, period = 'all_time') {
  const now = Date.now();
  // Filter out test/zombie workers from all pools
  const completed = (workerPool.completed_workers || []).filter(isProductionWorker);
  const failed = (workerPool.failed_workers || []).filter(isProductionWorker);
  const active = (workerPool.active_workers || []).filter(isProductionWorker);

  let filteredCompleted = [];
  let filteredFailed = [];
  let filteredActive = [];

  // Filter workers based on time period
  switch (period) {
    case 'current_run':
      // Only active workers
      filteredActive = active.filter(w => w.status === 'running' || w.status === 'active');
      break;

    case 'last_24h':
      const day_ago = now - (24 * 60 * 60 * 1000);
      filteredCompleted = completed.filter(w => {
        const completedAt = new Date(w.completed_at).getTime();
        return completedAt >= day_ago;
      });
      filteredFailed = failed.filter(w => {
        const failedAt = new Date(w.completed_at || w.failed_at).getTime();
        return failedAt >= day_ago;
      });
      break;

    case 'last_7d':
      const week_ago = now - (7 * 24 * 60 * 60 * 1000);
      filteredCompleted = completed.filter(w => {
        const completedAt = new Date(w.completed_at).getTime();
        return completedAt >= week_ago;
      });
      filteredFailed = failed.filter(w => {
        const failedAt = new Date(w.completed_at || w.failed_at).getTime();
        return failedAt >= week_ago;
      });
      break;

    case 'all_time':
    default:
      filteredCompleted = completed;
      filteredFailed = failed;
      break;
  }

  const totalCompleted = filteredCompleted.length;
  const totalFailed = filteredFailed.length;
  const totalActive = filteredActive.length;
  const total = totalCompleted + totalFailed + totalActive;

  const rate = total > 0 ? ((totalCompleted / total) * 100).toFixed(1) : 0;

  return {
    rate: parseFloat(rate),
    completed: totalCompleted,
    failed: totalFailed,
    active: totalActive,
    total: total,
    period: period
  };
}

/**
 * Calculate dashboard metrics from coordination data
 */
function calculateMetrics(data, successRatePeriod = 'all_time') {
  const { workerPool, tokenBudget, taskQueue } = data;

  if (!workerPool || !tokenBudget || !taskQueue) {
    return null;
  }

  // Worker metrics - Fix: Filter active workers by actual running status
  // A worker is truly active only if it has status='running' AND recent activity (< 5 minutes)
  const now = Date.now();
  const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const activeWorkers = (workerPool.active_workers || []).filter(worker => {
    // Worker must have 'running' status or recent heartbeat
    const hasRunningStatus = worker.status === 'running' || worker.status === 'active';

    // Check if worker has recent activity
    const lastActivity = worker.last_heartbeat || worker.spawned_at;
    if (!lastActivity) return hasRunningStatus;

    const activityTime = new Date(lastActivity).getTime();
    const isRecentlyActive = (now - activityTime) < ACTIVE_THRESHOLD_MS;

    // Must be both running and recently active, OR have a session_id (actively executing)
    return (hasRunningStatus && isRecentlyActive) || worker.session_id;
  }).length;

  const completedWorkers = workerPool.completed_workers?.length || 0;
  const failedWorkers = workerPool.failed_workers?.length || 0;

  // Count zombies killed by the zombie-killer-daemon
  const zombiesKilled = (workerPool.failed_workers || []).filter(worker =>
    worker.killed_by === 'zombie-killer-daemon'
  ).length;

  // Calculate success rate based on selected time period
  const successRateData = calculateSuccessRate(
    workerPool,
    successRatePeriod
  );

  const totalWorkers = successRateData.total;
  const successRate = successRateData.rate;

  // Token metrics
  const totalBudget = tokenBudget.total_budget || 270000;
  const mastersUsed = tokenBudget.usage_metrics?.masters_used ||
    Object.values(tokenBudget.masters || {}).reduce((sum, m) => sum + (m.used || 0), 0);
  const workersUsed = tokenBudget.usage_metrics?.workers_used || 0;
  const workersAllocated = tokenBudget.worker_pool?.allocated_to_workers || 0;
  const totalUsed = tokenBudget.usage_metrics?.total_tokens_used_today || (mastersUsed + workersUsed);
  const availableBudget = totalBudget - totalUsed;
  const usagePercentage = ((totalUsed / totalBudget) * 100).toFixed(1);

  // Calculate master and worker pool allocations
  const mastersAllocated = Object.values(tokenBudget.masters || {})
    .reduce((sum, m) => sum + (m.allocated || 0), 0);
  const workerPoolTotal = tokenBudget.worker_pool?.total || 80000;

  // Emergency reserve
  const emergencyReserve = tokenBudget.emergency_reserve?.total || 25000;
  const emergencyUsed = tokenBudget.emergency_reserve?.used || 0;

  // Efficiency score
  const efficiency = tokenBudget.usage_metrics?.efficiency_score || 96.2;

  // Task metrics
  const tasks = taskQueue.tasks || [];
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = tasks.filter(t =>
    t.status === 'in_progress' ||
    t.status === 'in-progress' ||
    t.status === 'scan_worker_spawned'
  ).length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;

  // Master agent status
  const masters = {
    coordinator: {
      allocated: tokenBudget.masters?.coordinator?.allocated || 0,
      used: tokenBudget.masters?.coordinator?.used || 0,
      workerPool: tokenBudget.masters?.coordinator?.worker_pool || 0,
      tasksHandled: tokenBudget.masters?.coordinator?.tasks_handled?.length || 0
    },
    security: {
      allocated: tokenBudget.masters?.security?.allocated || 0,
      used: tokenBudget.masters?.security?.used || 0,
      workerPool: tokenBudget.masters?.security?.worker_pool || 0,
      tasksHandled: tokenBudget.masters?.security?.tasks_handled?.length || 0
    },
    development: {
      allocated: tokenBudget.masters?.development?.allocated || 0,
      used: tokenBudget.masters?.development?.used || 0,
      workerPool: tokenBudget.masters?.development?.worker_pool || 0,
      tasksHandled: tokenBudget.masters?.development?.tasks_handled?.length || 0
    },
    inventory: {
      allocated: tokenBudget.masters?.inventory?.allocated || 0,
      used: tokenBudget.masters?.inventory?.used || 0,
      workerPool: tokenBudget.masters?.inventory?.worker_pool || 0,
      tasksHandled: tokenBudget.masters?.inventory?.tasks_handled?.length || 0
    },
    cicd: {
      allocated: tokenBudget.masters?.cicd?.allocated || 0,
      used: tokenBudget.masters?.cicd?.used || 0,
      workerPool: tokenBudget.masters?.cicd?.worker_pool || 0,
      tasksHandled: tokenBudget.masters?.cicd?.tasks_handled?.length || 0
    },
    dashboard: {
      allocated: tokenBudget.observers?.dashboard?.allocated || 0,
      used: tokenBudget.observers?.dashboard?.used || 0,
      eventsProcessed: tokenBudget.observers?.dashboard?.events_processed || 0
    }
  };

  // Claude Code usage status (read from status.json or use defaults)
  const usage = {
    sessionPercent: data.status?.usage?.session_percent || 15,
    weekAllPercent: data.status?.usage?.week_all_percent || 46,
    weekOpusPercent: data.status?.usage?.week_opus_percent || 0
  };

  // Orchestration metrics (v4.0)
  const orchestrator = data.orchestrator || {};

  // Execution Manager metrics (v4.0)
  const executionManagers = data.executionManagers || {
    active: 0,
    completed: 0,
    failed: 0,
    total: 0,
    success_rate: 0
  };

  return {
    workers: {
      active: activeWorkers,
      completed: successRateData.completed,
      failed: successRateData.failed,
      total: totalWorkers,
      successRate: parseFloat(successRate),
      successRatePeriod: successRatePeriod,
      successRateDetails: successRateData,
      avgDuration: workerPool.stats?.avg_duration_minutes || 0,
      avgTokens: workerPool.stats?.avg_tokens_used || 0,
      zombiesKilled: zombiesKilled
    },
    tokens: {
      total: totalBudget,
      used: totalUsed,
      available: availableBudget,
      usagePercentage: parseFloat(usagePercentage),
      mastersUsed,
      mastersAllocated,
      workersUsed,
      workersAllocated,
      workerPoolTotal,
      emergencyReserve,
      emergencyUsed,
      efficiency
    },
    tasks: {
      pending: pendingTasks,
      inProgress: inProgressTasks,
      completed: completedTasks,
      total: totalTasks
    },
    orchestrator: {
      active: orchestrator.active_orchestrations || 0,
      total: orchestrator.total_orchestrations || 0,
      completed: orchestrator.completed_orchestrations || 0,
      failed: orchestrator.failed_orchestrations || 0
    },
    executionManagers: {
      active: executionManagers.active || 0,
      completed: executionManagers.completed || 0,
      failed: executionManagers.failed || 0,
      total: executionManagers.total || 0,
      successRate: executionManagers.success_rate || 0
    },
    masters,
    usage,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// HTTP API Endpoints
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/metrics
 * Get current system metrics (serves from cache)
 * Query params:
 *   - period: success_rate_period (current_run, last_24h, last_7d, all_time)
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const period = req.query.period || 'all_time';
    const data = await loadCoordinationData(false); // Use cache
    const metrics = calculateMetrics(data, period);

    if (!metrics) {
      return res.status(500).json({
        error: 'Failed to calculate metrics',
        details: 'Coordination files may be missing or invalid'
      });
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error calculating metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/metrics/history
 * Get historical metrics data for trend charts
 * Query params:
 *   - range: time range (24h, 7d, 30d) - default: 24h
 *   - granularity: data point frequency (5m, 1h, 1d) - default: auto-selected
 */
app.get('/api/metrics/history', async (req, res) => {
  try {
    const range = req.query.range || '24h';
    const granularity = req.query.granularity || 'auto';

    const historyDir = path.join(__dirname, '../../coordination/history');
    const hourlyDir = path.join(historyDir, 'hourly');
    const dailyDir = path.join(historyDir, 'daily');

    // Determine which directory and files to read based on range
    let files = [];
    let actualGranularity = granularity;

    const now = new Date();
    let cutoffDate;

    switch (range) {
      case '24h':
        actualGranularity = granularity === 'auto' ? '5m' : granularity;
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // Read hourly directory for last 24 hours
        try {
          const hourlyFiles = await fs.readdir(hourlyDir);
          files = hourlyFiles
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(hourlyDir, f))
            .filter(f => {
              const fileDate = new Date(path.basename(f, '.json'));
              return fileDate >= cutoffDate;
            })
            .sort();
        } catch (error) {
          console.warn('No hourly data available yet');
        }
        break;

      case '7d':
        actualGranularity = granularity === 'auto' ? '1h' : granularity;
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Read hourly directory for last 7 days
        try {
          const hourlyFiles = await fs.readdir(hourlyDir);
          files = hourlyFiles
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(hourlyDir, f))
            .filter(f => {
              const fileDate = new Date(path.basename(f, '.json'));
              return fileDate >= cutoffDate;
            })
            .sort();
        } catch (error) {
          console.warn('No hourly data available yet');
        }
        break;

      case '30d':
        actualGranularity = granularity === 'auto' ? '1d' : granularity;
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Read daily directory for last 30 days
        try {
          const dailyFiles = await fs.readdir(dailyDir);
          files = dailyFiles
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(dailyDir, f))
            .filter(f => {
              const fileDate = new Date(path.basename(f, '.json'));
              return fileDate >= cutoffDate;
            })
            .sort();
        } catch (error) {
          console.warn('No daily data available yet');
        }
        break;

      default:
        return res.status(400).json({ error: 'Invalid range. Use 24h, 7d, or 30d' });
    }

    // Read all snapshot files
    const snapshots = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const snapshot = JSON.parse(content);
        snapshots.push(snapshot);
      } catch (error) {
        console.error(`Error reading snapshot ${file}:`, error.message);
      }
    }

    // If no historical data, return current metrics as single data point
    if (snapshots.length === 0) {
      const data = await loadCoordinationData(false);
      const currentMetrics = calculateMetrics(data);

      if (currentMetrics) {
        snapshots.push({
          timestamp: new Date().toISOString(),
          workers: currentMetrics.workers,
          tokens: currentMetrics.tokens,
          tasks: currentMetrics.tasks,
          orchestrator: currentMetrics.orchestrator
        });
      }
    }

    res.json({
      range,
      granularity: actualGranularity,
      data_points: snapshots.length,
      snapshots
    });
  } catch (error) {
    console.error('Error loading historical metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/streams
 * Get workforce streams data and metrics
 */
app.get('/api/streams', async (req, res) => {
  try {
    const streamsPath = path.join(__dirname, '../../coordination/workforce-streams.json');
    const streams = await readJSON(streamsPath);

    if (!streams) {
      return res.status(404).json({
        error: 'Workforce streams not configured',
        details: 'workforce-streams.json not found'
      });
    }

    res.json(streams);
  } catch (error) {
    console.error('Error loading workforce streams:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/coordination/raw
 * Get raw coordination data (for debugging)
 */
app.get('/api/coordination/raw', async (req, res) => {
  try {
    const data = await loadCoordinationData();
    res.json(data);
  } catch (error) {
    console.error('Error loading coordination data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workers
 * Get detailed worker information
 */
app.get('/api/workers', async (req, res) => {
  try {
    // Read live worker specs from all directories (active, completed, failed)
    const workerSpecsDir = path.join(COORD_DIR, 'worker-specs');
    const liveWorkerPool = await generateLiveWorkerPool(workerSpecsDir);
    res.json(liveWorkerPool);
  } catch (error) {
    console.error('Error reading worker pool:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generate live worker pool data from worker spec files
 */
async function generateLiveWorkerPool(specsDir) {
  const active_workers = [];
  const completed_workers = [];
  const failed_workers = [];

  // Read from multiple directories
  const directories = [
    { path: path.join(specsDir, 'active'), type: 'active' },
    { path: path.join(specsDir, 'completed'), type: 'completed' },
    { path: path.join(specsDir, 'failed'), type: 'failed' }
  ];

  for (const dir of directories) {
    try {
      const files = await fs.readdir(dir.path);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(dir.path, file), 'utf-8');
          const spec = JSON.parse(content);

          const worker = {
            worker_id: spec.worker_id,
            type: spec.worker_type,
            task_id: spec.task_id,
            spawned_at: spec.created_at,
            status: spec.status,
            parent_master: spec.parent_master
          };

          if (spec.execution) {
            worker.started_at = spec.execution.started_at;
            worker.completed_at = spec.execution.completed_at;
            worker.tokens_used = spec.execution.tokens_used;
            worker.killed_by = spec.execution.killed_by; // For zombie tracking
          }

          // Categorize by status
          if (spec.status === 'pending' || spec.status === 'running') {
            active_workers.push(worker);
          } else if (spec.status === 'completed' || spec.status === 'success') {
            completed_workers.push(worker);
          } else if (spec.status === 'failed') {
            failed_workers.push(worker);
          }
        } catch (err) {
          console.error(`Error reading worker spec ${file}:`, err);
        }
      }
    } catch (err) {
      // Directory might not exist, that's ok
      if (err.code !== 'ENOENT') {
        console.error(`Error reading directory ${dir.path}:`, err);
      }
    }
  }

  return {
    version: '2.0-live',
    updated_at: new Date().toISOString(),
    active_workers,
    completed_workers,
    failed_workers,
    stats: {
      total_active: active_workers.length,
      total_completed: completed_workers.length,
      total_failed: failed_workers.length
    }
  };
}

/**
 * Generate live Execution Manager data from EM state files (v4.0)
 */
async function generateLiveExecutionManagers(coordDir) {
  const active_ems = [];
  const completed_ems = [];
  const failed_ems = [];

  const emActiveDir = path.join(coordDir, 'execution-managers/active');
  const emCompletedDir = path.join(coordDir, 'execution-managers/completed');

  // Read active EMs
  try {
    const files = await fs.readdir(emActiveDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(emActiveDir, file), 'utf-8');
        const em = JSON.parse(content);
        active_ems.push(em);
      } catch (err) {
        console.error(`Error reading EM file ${file}:`, err);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading active EMs directory:`, err);
    }
  }

  // Read completed EMs (both successful and failed)
  try {
    const files = await fs.readdir(emCompletedDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(emCompletedDir, file), 'utf-8');
        const em = JSON.parse(content);

        if (em.status === 'failed') {
          failed_ems.push(em);
        } else {
          completed_ems.push(em);
        }
      } catch (err) {
        console.error(`Error reading EM file ${file}:`, err);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading completed EMs directory:`, err);
    }
  }

  const total = active_ems.length + completed_ems.length + failed_ems.length;
  const success_rate = (completed_ems.length + failed_ems.length) > 0
    ? ((completed_ems.length / (completed_ems.length + failed_ems.length)) * 100).toFixed(1)
    : 0;

  return {
    active: active_ems.length,
    completed: completed_ems.length,
    failed: failed_ems.length,
    total: total,
    success_rate: parseFloat(success_rate),
    active_ems,
    completed_ems,
    failed_ems
  };
}

/**
 * GET /api/execution-managers
 * Get detailed Execution Manager information (v4.0)
 */
app.get('/api/execution-managers', async (req, res) => {
  try {
    const emData = await generateLiveExecutionManagers(COORD_DIR);
    res.json(emData);
  } catch (error) {
    console.error('Error reading execution managers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks
 * Get task queue information
 */
app.get('/api/tasks', async (req, res) => {
  try {
    const taskQueue = await readJSON(FILES.taskQueue);
    if (!taskQueue) {
      return res.status(500).json({ error: 'Failed to read task queue' });
    }
    res.json(taskQueue);
  } catch (error) {
    console.error('Error reading task queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Normalize event format to consistent schema
 */
function normalizeEvent(event) {
  // Ensure the event has a consistent schema
  const normalized = {
    id: event.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: event.type || event.event_type || event.event || 'unknown',
    timestamp: event.timestamp || new Date().toISOString(),
    data: event.data || {},
    message: event.message || ''
  };

  // If data is a string, try to parse it as JSON
  if (typeof normalized.data === 'string') {
    try {
      normalized.data = JSON.parse(normalized.data);
    } catch (e) {
      // Keep as string if not valid JSON
      normalized.data = { message: normalized.data };
    }
  }

  // Extract common fields from root level to data if not already present
  if (event.task_id && !normalized.data.task_id) {
    normalized.data.task_id = event.task_id;
  }
  if (event.task_title && !normalized.data.task_title) {
    normalized.data.task_title = event.task_title;
  }
  if (event.assigned_to && !normalized.data.assigned_to) {
    normalized.data.assigned_to = event.assigned_to;
  }
  if (event.worker_id && !normalized.data.worker_id) {
    normalized.data.worker_id = event.worker_id;
  }

  // Generate message if not present
  if (!normalized.message) {
    normalized.message = `${normalized.type.replace(/_/g, ' ')}`;
    if (normalized.data.task_id) {
      normalized.message += `: ${normalized.data.task_id}`;
    }
    if (normalized.data.task_title) {
      normalized.message += ` - ${normalized.data.task_title}`;
    }
  }

  return normalized;
}

/**
 * GET /api/events
 * Get recent dashboard events (merged with task events)
 * Query params:
 *   - limit: number of events to return (default: 50)
 *   - session: 'current' to get only current session events (since server start)
 */
app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const sessionOnly = req.query.session === 'current';
    const fsSync = require('fs');

    let events = [];

    // SINGLE SOURCE OF TRUTH: dashboard-events.jsonl
    // All events (task, git, worker, system, etc.) should be written to this file
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      events = lines.map(line => {
        try {
          return normalizeEvent(JSON.parse(line));
        } catch (e) {
          console.error('Error parsing event line:', e);
          return null;
        }
      }).filter(e => e !== null);
    }

    // If session=current, only show events from event buffer (events since server started)
    if (sessionOnly) {
      events = eventBuffer.slice();
    }

    // Sort by timestamp (most recent first) and limit
    const sortedEvents = events
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({ events: sortedEvents, total: sortedEvents.length });
  } catch (error) {
    console.error('Error reading events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/git-operations
 * Get git operations log
 * Query params:
 *   - limit: number of operations to return (default: 50)
 *   - worker_id: filter by specific worker
 *   - status: filter by status (success/failed)
 */
app.get('/api/git-operations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const workerFilter = req.query.worker_id;
    const statusFilter = req.query.status;
    const fsSync = require('fs');

    let gitOperations = [];

    // Read git-operations.jsonl
    const gitOpsPath = path.join(COORD_DIR, 'git-operations.jsonl');
    if (fsSync.existsSync(gitOpsPath)) {
      const content = fsSync.readFileSync(gitOpsPath, 'utf-8');
      gitOperations = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }

    // Apply filters
    let filteredOps = gitOperations;

    if (workerFilter) {
      filteredOps = filteredOps.filter(op => op.worker_id === workerFilter);
    }

    if (statusFilter) {
      filteredOps = filteredOps.filter(op => op.status === statusFilter);
    }

    // Sort by timestamp (most recent first) and limit
    filteredOps = filteredOps
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({
      operations: filteredOps,
      total: filteredOps.length,
      filters: { worker_id: workerFilter, status: statusFilter }
    });
  } catch (error) {
    console.error('Error reading git operations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/daemon/status
 * Get worker daemon status (for backward compatibility)
 */
app.get('/api/daemon/status', async (req, res) => {
  try {
    const daemonStatus = await getDaemonStatus();
    res.json(daemonStatus);
  } catch (error) {
    console.error('Error getting daemon status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pm-daemon/status
 * Get PM daemon status from pm-state.json
 */
app.get('/api/pm-daemon/status', async (req, res) => {
  try {
    const pmStatePath = path.join(__dirname, '../../coordination/pm-state.json');
    const pmState = await readJSON(pmStatePath);

    if (!pmState || !pmState.pm_daemon) {
      return res.json({
        status: 'stopped',
        pid: null,
        uptime_seconds: 0,
        loops_completed: 0,
        last_loop: null
      });
    }

    const pmDaemon = pmState.pm_daemon;
    const status = pmDaemon.pid ? 'running' : 'stopped';

    res.json({
      status,
      pid: pmDaemon.pid || null,
      uptime_seconds: pmDaemon.uptime_seconds || 0,
      loops_completed: pmDaemon.loops_completed || 0,
      last_loop: pmDaemon.last_loop || null,
      started_at: pmDaemon.started_at || null
    });
  } catch (error) {
    console.error('Error getting PM daemon status:', error);
    res.json({
      status: 'stopped',
      pid: null,
      uptime_seconds: 0,
      loops_completed: 0,
      last_loop: null
    });
  }
});

/**
 * GET /api/health-alerts
 * Get all health alerts from health-alerts.json
 */
app.get('/api/health-alerts', async (req, res) => {
  try {
    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
    const healthAlertsData = await readJSON(healthAlertsPath);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.json({ alerts: [], sla_config: {} });
    }

    res.json({
      alerts: healthAlertsData.alerts || [],
      sla_config: healthAlertsData.sla_config || {}
    });
  } catch (error) {
    console.error('Error reading health alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/health-alerts/:id/resolve
 * Mark a health alert as resolved
 */
app.post('/api/health-alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;

    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
    const healthAlertsData = await readJSON(healthAlertsPath);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.status(404).json({ error: 'Health alerts file not found' });
    }

    const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === id);
    if (alertIndex === -1) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Update alert
    healthAlertsData.alerts[alertIndex].status = 'resolved';
    healthAlertsData.alerts[alertIndex].resolved_at = new Date().toISOString();

    if (!healthAlertsData.alerts[alertIndex].resolution_notes) {
      healthAlertsData.alerts[alertIndex].resolution_notes = [];
    }

    if (resolution_note) {
      healthAlertsData.alerts[alertIndex].resolution_notes.push(resolution_note);
    }

    // Write back to file
    await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

    // Emit dashboard event
    const alert = healthAlertsData.alerts[alertIndex];
    emitDashboardEvent('health_alert_resolved', {
      alert_id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      message: `Health alert resolved: ${alert.message}`
    });

    res.json({
      success: true,
      alert: healthAlertsData.alerts[alertIndex],
      message: 'Alert marked as resolved'
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/health-alerts/:id/restart-worker
 * Restart worker associated with an alert
 */
app.post('/api/health-alerts/:id/restart-worker', async (req, res) => {
  try {
    const { id } = req.params;
    const { execSync } = require('child_process');

    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
    const healthAlertsData = await readJSON(healthAlertsPath);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.status(404).json({ error: 'Health alerts file not found' });
    }

    const alert = healthAlertsData.alerts.find(a => a.id === id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (!alert.worker_id) {
      return res.status(400).json({ error: 'Alert does not have an associated worker' });
    }

    const workerId = alert.worker_id;
    const workerSpecsDir = path.join(__dirname, '../../coordination/worker-specs');
    const stuckDir = path.join(workerSpecsDir, 'stuck');
    const failedDir = path.join(workerSpecsDir, 'failed');
    const activeDir = path.join(workerSpecsDir, 'active');

    // Find worker spec in stuck or failed directories
    let workerSpecPath = null;
    let sourceDir = null;

    const stuckPath = path.join(stuckDir, `${workerId}.json`);
    const failedPath = path.join(failedDir, `${workerId}.json`);

    if (await fs.access(stuckPath).then(() => true).catch(() => false)) {
      workerSpecPath = stuckPath;
      sourceDir = 'stuck';
    } else if (await fs.access(failedPath).then(() => true).catch(() => false)) {
      workerSpecPath = failedPath;
      sourceDir = 'failed';
    } else {
      return res.status(404).json({ error: 'Worker spec not found in stuck/ or failed/ directories' });
    }

    // Read worker spec
    const workerSpec = await readJSON(workerSpecPath);
    if (!workerSpec) {
      return res.status(500).json({ error: 'Failed to read worker spec' });
    }

    // Reset worker spec status
    workerSpec.status = 'pending';
    workerSpec.execution = {
      ...workerSpec.execution,
      restarted_at: new Date().toISOString(),
      restarted_from: sourceDir,
      restart_reason: `Restarted from health alert ${id}`
    };

    // Move to active directory
    const activePath = path.join(activeDir, `${workerId}.json`);
    await fs.writeFile(activePath, JSON.stringify(workerSpec, null, 2), 'utf-8');

    // Remove from stuck/failed directory
    await fs.unlink(workerSpecPath);

    // Add note to alert
    const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === id);
    if (!healthAlertsData.alerts[alertIndex].investigation_notes) {
      healthAlertsData.alerts[alertIndex].investigation_notes = [];
    }
    healthAlertsData.alerts[alertIndex].investigation_notes.push(
      `${new Date().toISOString()} - Worker ${workerId} restarted from ${sourceDir}/ directory`
    );

    await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

    // Emit dashboard event (alert already declared earlier in function)
    emitDashboardEvent('worker_restarted', {
      worker_id: workerId,
      alert_id: id,
      alert_type: alert?.type || 'unknown',
      source_dir: sourceDir,
      message: `Worker ${workerId} restarted from health alert`
    });

    // Attempt to spawn the worker using the autonomous worker script
    try {
      const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');
      execSync(`bash ${spawnScript} ${activePath} > /dev/null 2>&1 &`);
    } catch (spawnError) {
      console.error('Error spawning worker:', spawnError);
      // Don't fail the request - worker spec is moved, spawn will be attempted by daemon
    }

    res.json({
      success: true,
      message: `Worker ${workerId} restarted from ${sourceDir}/ directory`,
      worker_id: workerId
    });
  } catch (error) {
    console.error('Error restarting worker:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/health-alerts/:id/note
 * Add investigation note to alert
 */
app.post('/api/health-alerts/:id/note', async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
    const healthAlertsData = await readJSON(healthAlertsPath);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.status(404).json({ error: 'Health alerts file not found' });
    }

    const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === id);
    if (alertIndex === -1) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Add note with timestamp
    if (!healthAlertsData.alerts[alertIndex].investigation_notes) {
      healthAlertsData.alerts[alertIndex].investigation_notes = [];
    }

    const timestampedNote = `${new Date().toISOString()} - ${note}`;
    healthAlertsData.alerts[alertIndex].investigation_notes.push(timestampedNote);

    // Write back to file
    await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

    // Emit dashboard event
    const alert = healthAlertsData.alerts[alertIndex];
    emitDashboardEvent('health_alert_note_added', {
      alert_id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      note: note,
      message: `Note added to ${alert.type} alert`
    });

    res.json({
      success: true,
      alert: healthAlertsData.alerts[alertIndex],
      message: 'Note added successfully'
    });
  } catch (error) {
    console.error('Error adding note to alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/health-alerts/:id
 * Delete a health alert
 */
app.delete('/api/health-alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
    const healthAlertsData = await readJSON(healthAlertsPath);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.status(404).json({ error: 'Health alerts file not found' });
    }

    const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === id);
    if (alertIndex === -1) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Remove alert
    const removedAlert = healthAlertsData.alerts.splice(alertIndex, 1)[0];

    // Write back to file
    await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

    // Emit dashboard event
    emitDashboardEvent('health_alert_deleted', {
      alert_id: removedAlert.id,
      alert_type: removedAlert.type,
      severity: removedAlert.severity,
      message: `Health alert deleted: ${removedAlert.message}`
    });

    res.json({
      success: true,
      message: 'Alert deleted successfully',
      deleted_alert: removedAlert
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Parse elapsed time string (format: [[DD-]HH:]MM:SS) to seconds
 */
function parseElapsedTime(timeStr) {
  const parts = timeStr.trim().split(/[-:]/);
  let seconds = 0;

  if (parts.length === 4) {
    // DD-HH:MM:SS
    seconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 +
              parseInt(parts[2]) * 60 + parseInt(parts[3]);
  } else if (parts.length === 3) {
    // HH:MM:SS
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  } else if (parts.length === 2) {
    // MM:SS
    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  return seconds;
}

/**
 * Helper function to get last commit info from git
 */
function getLastCommitInfo() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('git log -1 --format="%s|%ar"', {
      cwd: path.join(__dirname, '../../'),
      encoding: 'utf-8'
    }).toString().trim();
    const [message, timeAgo] = output.split('|');
    return { message: message || 'No commits', timeAgo: timeAgo || 'Never' };
  } catch (e) {
    return { message: 'No commits', timeAgo: 'Never' };
  }
}

/**
 * Helper function to get last repo sync time
 */
function getLastRepoSync() {
  const fsSync = require('fs');
  const fetchHeadPath = path.join(__dirname, '../../.git/FETCH_HEAD');

  if (fsSync.existsSync(fetchHeadPath)) {
    const stats = fsSync.statSync(fetchHeadPath);
    const now = Date.now();
    const diff = now - stats.mtimeMs;

    // Convert to human readable
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }
  return 'Never';
}

/**
 * GET /api/git-info
 * Get git information (last commit and last repo sync)
 */
app.get('/api/git-info', async (req, res) => {
  try {
    const lastCommit = getLastCommitInfo();
    const lastSync = getLastRepoSync();
    res.json({ lastCommit, lastSync });
  } catch (error) {
    console.error('Error getting git info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dashboard-server/status
 * Get dashboard server status
 */
app.get('/api/dashboard-server/status', (req, res) => {
  res.json({
    status: 'running',
    pid: process.pid,
    port: PORT,
    uptime: process.uptime()
  });
});

/**
 * POST /api/dashboard-server/control
 * Control dashboard server (restart only - can't stop itself)
 */
app.post('/api/dashboard-server/control', async (req, res) => {
  const { action } = req.body;

  if (action === 'restart') {
    try {
      const { spawn } = require('child_process');
      const serverScript = path.join(__dirname, 'index.js');

      // Send success response first
      res.json({
        success: true,
        message: 'Dashboard server restarting...',
        note: 'Please refresh the page in 2-3 seconds'
      });

      // Spawn new server process
      setTimeout(() => {
        spawn('node', [serverScript], {
          detached: true,
          stdio: 'ignore',
          cwd: path.dirname(serverScript)
        }).unref();

        // Exit current process after allowing response to be sent
        setTimeout(() => {
          process.exit(0);
        }, 500);
      }, 1000);
    } catch (error) {
      console.error('Error restarting dashboard server:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart server',
        error: error.message
      });
    }
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid action. Only "restart" is supported.'
    });
  }
});

/**
 * GET /api/event-log/info
 * Get information about the event log file
 */
app.get('/api/event-log/info', (req, res) => {
  try {
    const fsSync = require('fs');
    const eventLogPath = FILES.dashboardEvents;

    if (!fsSync.existsSync(eventLogPath)) {
      return res.json({
        created_date: 'N/A',
        event_count: 0,
        file_size: '0 B'
      });
    }

    const stats = fsSync.statSync(eventLogPath);
    const content = fsSync.readFileSync(eventLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    const eventCount = lines.length;

    // Format file size
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    res.json({
      created_date: stats.birthtime.toISOString().split('T')[0], // YYYY-MM-DD format
      event_count: eventCount,
      file_size: formatBytes(stats.size)
    });
  } catch (error) {
    console.error('Error getting event log info:', error);
    res.status(500).json({ error: 'Failed to get event log information' });
  }
});

/**
 * POST /api/event-log/purge
 * Purge event log by archiving current events and creating new empty log
 */
app.post('/api/event-log/purge', (req, res) => {
  try {
    const fsSync = require('fs');
    const eventLogPath = FILES.dashboardEvents;
    const archiveDir = path.join(COMMIT_RELAY_HOME, 'coordination', 'dashboard-events-archive');

    // Create archive directory if it doesn't exist
    if (!fsSync.existsSync(archiveDir)) {
      fsSync.mkdirSync(archiveDir, { recursive: true });
    }

    // Count events before purging
    let eventCount = 0;
    if (fsSync.existsSync(eventLogPath)) {
      const content = fsSync.readFileSync(eventLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      eventCount = lines.length;
    }

    // Create archive file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const archiveFile = path.join(archiveDir, `dashboard-events-${timestamp}.jsonl`);

    // Copy current log to archive
    if (fsSync.existsSync(eventLogPath) && eventCount > 0) {
      fsSync.copyFileSync(eventLogPath, archiveFile);
    }

    // Create new empty event log
    fsSync.writeFileSync(eventLogPath, '', 'utf-8');

    res.json({
      success: true,
      message: 'Event log purged successfully',
      archived_count: eventCount,
      archive_file: archiveFile
    });
  } catch (error) {
    console.error('Error purging event log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purge event log',
      error: error.message
    });
  }
});

/**
 * Start/Stop Worker Daemon
 */
app.post('/api/daemon/control', async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body; // 'start' or 'stop'

  try {
    const scriptPath = path.join(__dirname, '../../scripts/worker-daemon.sh');

    if (action === 'start') {
      // Check if already running
      const PID_FILE = '/tmp/commit-relay-worker-daemon.pid';
      const fsSync = require('fs');

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`ps -p ${pid}`, { stdio: 'pipe' });
          return res.json({ success: false, message: 'Worker daemon is already running', pid });
        } catch (e) {
          // PID file exists but process is dead, clean it up
          fsSync.unlinkSync(PID_FILE);
        }
      }

      // Start the daemon
      execSync(`bash ${scriptPath} > /tmp/worker-daemon-start.log 2>&1 &`);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Read the new PID
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'Worker daemon started', pid });
      } else {
        res.json({ success: false, message: 'Worker daemon may have failed to start' });
      }
    } else if (action === 'stop') {
      // Stop the daemon using its control script
      execSync(`bash ${scriptPath} stop`, { stdio: 'pipe' });
      res.json({ success: true, message: 'Worker daemon stopped' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop"' });
    }
  } catch (error) {
    console.error('Error controlling worker daemon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Start/Stop PM Daemon
 */
app.post('/api/pm-daemon/control', async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body; // 'start' or 'stop'

  try {
    const scriptPath = path.join(__dirname, '../../scripts/pm-daemon.sh');

    if (action === 'start') {
      // Check if already running
      const PID_FILE = '/tmp/commit-relay-pm-daemon.pid';
      const fsSync = require('fs');

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`ps -p ${pid}`, { stdio: 'pipe' });
          return res.json({ success: false, message: 'PM daemon is already running', pid });
        } catch (e) {
          // PID file exists but process is dead, clean it up
          fsSync.unlinkSync(PID_FILE);
        }
      }

      // Start the daemon
      execSync(`bash ${scriptPath} > /tmp/pm-daemon-start.log 2>&1 &`);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Read the new PID
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'PM daemon started', pid });
      } else {
        res.json({ success: false, message: 'PM daemon may have failed to start' });
      }
    } else if (action === 'stop') {
      // Stop the daemon by killing its PID
      const PID_FILE = '/tmp/commit-relay-pm-daemon.pid';
      const fsSync = require('fs');

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`kill ${pid}`, { stdio: 'pipe' });
          fsSync.unlinkSync(PID_FILE);
          res.json({ success: true, message: 'PM daemon stopped' });
        } catch (e) {
          res.json({ success: false, message: 'Failed to stop PM daemon' });
        }
      } else {
        res.json({ success: false, message: 'PM daemon is not running' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop"' });
    }
  } catch (error) {
    console.error('Error controlling PM daemon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// MoE Intelligence API Endpoints
// ============================================================================

/**
 * GET /api/moe/routing
 * Get MoE routing decisions from coordinator logs
 */
app.get('/api/moe/routing', async (req, res) => {
  try {
    const fsSync = require('fs');
    const routingLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'logs', 'routing-decisions.jsonl');

    if (!fsSync.existsSync(routingLogPath)) {
      return res.json({ decisions: [] });
    }

    const content = fsSync.readFileSync(routingLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);

    // Parse JSONL and get last 100 decisions
    const decisions = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(d => d !== null)
      .slice(-100)
      .reverse(); // Most recent first

    res.json({ decisions });
  } catch (error) {
    console.error('Error fetching MoE routing decisions:', error);
    res.status(500).json({ error: 'Failed to fetch routing decisions' });
  }
});

/**
 * GET /api/moe/pool
 * Get MoE worker pool state and metrics
 */
app.get('/api/moe/pool', async (req, res) => {
  try {
    const fsSync = require('fs');
    const poolStatePath = path.join(COMMIT_RELAY_HOME, 'coordination', 'memory', 'working', 'pool-state.json');

    if (!fsSync.existsSync(poolStatePath)) {
      return res.json({
        active_workers: 0,
        max_capacity: 64,
        activation_rate: 0,
        target_workers: 0,
        utilization: 0,
        moe_analogy: {
          active_params: 'No data'
        }
      });
    }

    const poolData = JSON.parse(fsSync.readFileSync(poolStatePath, 'utf-8'));

    // Extract pool metrics
    const metrics = poolData.pool_metrics || {};

    res.json({
      active_workers: metrics.active_workers || 0,
      max_capacity: metrics.max_capacity || 64,
      activation_rate: metrics.activation_rate || 0,
      target_workers: metrics.target_workers || 0,
      utilization: metrics.utilization || 0,
      moe_analogy: poolData.moe_analogy || { active_params: 'No data' }
    });
  } catch (error) {
    console.error('Error fetching MoE pool state:', error);
    res.status(500).json({ error: 'Failed to fetch pool state' });
  }
});

/**
 * GET /api/moe/learning
 * Get MoE learning system metrics and insights
 */
app.get('/api/moe/learning', async (req, res) => {
  try {
    const fsSync = require('fs');
    const successMetricsPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'memory', 'long-term', 'success-metrics.json');
    const taskPatternsPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'memory', 'long-term', 'task-patterns.json');

    let metrics = {
      total_tasks: 0,
      success_rate: 0,
      avg_time: 0,
      learned_keywords: 0,
      experts: {
        development: { tasks: 0, success_rate: 0, avg_time: 0 },
        security: { tasks: 0, success_rate: 0, avg_time: 0 },
        inventory: { tasks: 0, success_rate: 0, avg_time: 0 }
      }
    };

    let insights = [];

    // Load success metrics
    if (fsSync.existsSync(successMetricsPath)) {
      const successData = JSON.parse(fsSync.readFileSync(successMetricsPath, 'utf-8'));

      metrics.total_tasks = successData.overall_metrics?.total_tasks_processed || 0;
      metrics.success_rate = successData.overall_metrics?.success_rate || 0;
      metrics.avg_time = successData.overall_metrics?.average_completion_time_minutes || 0;

      // Extract expert-specific metrics
      const expertPerf = successData.expert_performance || {};
      ['development', 'security', 'inventory'].forEach(expert => {
        if (expertPerf[expert]) {
          metrics.experts[expert] = {
            tasks: expertPerf[expert].tasks_completed || 0,
            success_rate: expertPerf[expert].success_rate || 0,
            avg_time: expertPerf[expert].average_time_minutes || 0
          };
        }
      });
    }

    // Load task patterns for learned keywords
    if (fsSync.existsSync(taskPatternsPath)) {
      const patternsData = JSON.parse(fsSync.readFileSync(taskPatternsPath, 'utf-8'));
      const allKeywords = new Set();

      Object.values(patternsData.expert_patterns || {}).forEach(expertData => {
        Object.keys(expertData.keywords || {}).forEach(keyword => allKeywords.add(keyword));
      });

      metrics.learned_keywords = allKeywords.size;

      // Generate insights based on patterns
      if (metrics.total_tasks > 0) {
        insights.push({
          id: 'insight-1',
          message: `System has learned ${metrics.learned_keywords} keywords from ${metrics.total_tasks} tasks`,
          timestamp: new Date().toISOString()
        });

        if (metrics.success_rate > 90) {
          insights.push({
            id: 'insight-2',
            message: `Excellent routing accuracy: ${metrics.success_rate.toFixed(1)}% success rate`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    res.json({ metrics, insights });
  } catch (error) {
    console.error('Error fetching MoE learning metrics:', error);
    res.status(500).json({ error: 'Failed to fetch learning metrics' });
  }
});

// ============================================================================
// WebSocket Server for Real-time Updates
// ============================================================================

const server = app.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────────────────┐`);
  console.log(`│  Commit-Relay Dashboard Server                      │`);
  console.log(`├─────────────────────────────────────────────────────┤`);
  console.log(`│  HTTP Server:   http://localhost:${PORT}              │`);
  console.log(`│  WebSocket:     ws://localhost:${PORT}                │`);
  console.log(`│  Dashboard UI:  http://localhost:${PORT}/             │`);
  console.log(`└─────────────────────────────────────────────────────┘\n`);
});

const wss = new WebSocketServer({ server });

// Track connected WebSocket clients
const clients = new Set();

wss.on('connection', async (ws) => {
  console.log('WebSocket client connected');
  clients.add(ws);

  try {
    // Send initial data
    const data = await loadCoordinationData(false); // Use cache
    const metrics = calculateMetrics(data);
    ws.send(JSON.stringify({ type: 'initial', data: metrics }));

    // Send buffered events for reconnecting clients
    if (eventBuffer.length > 0) {
      ws.send(JSON.stringify({
        type: 'buffered_events',
        events: eventBuffer,
        count: eventBuffer.length
      }));
    }

    // Send initial daemon status
    const daemonStatus = await getDaemonStatus();
    ws.send(JSON.stringify({
      type: 'daemon_status',
      data: daemonStatus
    }));

    // Send initial PM daemon status
    const pmStatePath = path.join(__dirname, '../../coordination/pm-state.json');
    const pmState = await readJSON(pmStatePath);
    const pmDaemonStatus = pmState?.pm_daemon ? {
      status: pmState.pm_daemon.pid ? 'running' : 'stopped',
      pid: pmState.pm_daemon.pid || null,
      uptime_seconds: pmState.pm_daemon.uptime_seconds || 0,
      loops_completed: pmState.pm_daemon.loops_completed || 0,
      last_loop: pmState.pm_daemon.last_loop || null,
      started_at: pmState.pm_daemon.started_at || null
    } : {
      status: 'stopped',
      pid: null,
      uptime_seconds: 0,
      loops_completed: 0,
      last_loop: null
    };
    ws.send(JSON.stringify({
      type: 'pm_daemon_status',
      data: pmDaemonStatus
    }));
  } catch (error) {
    console.error('Error sending initial data:', error);
  }

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

/**
 * Broadcast update to all connected WebSocket clients
 */
function broadcastUpdate(data) {
  const metrics = calculateMetrics(data);
  const message = JSON.stringify({
    type: 'update',
    data: metrics,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

/**
 * Emit a dashboard event to dashboard-events.jsonl
 */
function emitDashboardEvent(type, data) {
  try {
    const fsSync = require('fs');
    const event = {
      id: `evt-${Date.now()}-${process.pid}`,
      timestamp: new Date().toISOString(),
      type: type,
      data: typeof data === 'string' ? data : JSON.stringify(data),
      source: 'dashboard'
    };

    const eventLine = JSON.stringify(event) + '\n';
    fsSync.appendFileSync(FILES.dashboardEvents, eventLine, 'utf-8');
    console.log(`Dashboard event emitted: ${type}`);
  } catch (error) {
    console.error('Error emitting dashboard event:', error);
  }
}

/**
 * Broadcast daemon status to all connected WebSocket clients
 */
function broadcastDaemonStatus(daemonStatus) {
  const message = JSON.stringify({
    type: 'daemon_status',
    data: daemonStatus
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

/**
 * Debounce function to batch multiple updates
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================================================
// File Watcher for Real-time Updates
// ============================================================================

// Watch coordination JSON files (excluding events file)
const coordFiles = Object.values(FILES).filter(f => !f.endsWith('.jsonl'));
const watcher = chokidar.watch(coordFiles, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 150, // Reduced from 500ms to 150ms
    pollInterval: 50 // Reduced from 100ms to 50ms
  }
});

// Debounced handler to batch multiple file changes within 1 second
const debouncedBroadcast = debounce(async (filePath) => {
  try {
    const oldData = { ...cache }; // Save old state before refresh
    const data = await loadCoordinationData(true); // Force refresh cache

    // Check if task queue changed - generate task events
    if (filePath === FILES.taskQueue && oldData.taskQueue && data.taskQueue) {
      const taskEvents = await generateTaskEvents(data.taskQueue, oldData.taskQueue);

      // Broadcast each task event
      for (const event of taskEvents) {
        console.log(`Task event: ${event.type} - ${event.data.task_id}`);
        broadcastEvent(event);
      }
    }

    broadcastUpdate(data);
  } catch (error) {
    console.error('Error processing file changes:', error);
  }
}, 1000);

watcher.on('change', async (filePath) => {
  console.log(`File changed: ${path.basename(filePath)}`);
  debouncedBroadcast(filePath);
});

// ============================================================================
// Dashboard Events Stream Watcher
// ============================================================================

/**
 * Broadcast event to all connected WebSocket clients
 */
function broadcastEvent(event) {
  // Add to event buffer (circular buffer)
  eventBuffer.push(event);
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift(); // Remove oldest event
  }

  const message = JSON.stringify({
    type: 'event',
    event: event,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Watch dashboard-events.jsonl for new events
const eventWatcher = chokidar.watch(FILES.dashboardEvents, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50
  }
});

eventWatcher.on('change', async () => {
  try {
    // Read the last line of the JSONL file (most recent event)
    const fsSync = require('fs');
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);

      if (lines.length > 0) {
        const lastEvent = normalizeEvent(JSON.parse(lines[lines.length - 1]));
        console.log(`Dashboard event: ${lastEvent.type}`);
        broadcastEvent(lastEvent);
      }
    }
  } catch (error) {
    console.error('Error processing dashboard event:', error);
  }
});

// ============================================================================
// Daemon Status Polling (WebSocket Push)
// ============================================================================

// Poll daemon status every 10 seconds and push via WebSocket
setInterval(async () => {
  if (clients.size > 0) {
    try {
      const daemonStatus = await getDaemonStatus();
      broadcastDaemonStatus(daemonStatus);
    } catch (error) {
      console.error('Error polling daemon status:', error);
    }
  }
}, 10000);

// Poll PM daemon status every 10 seconds and push via WebSocket
setInterval(async () => {
  if (clients.size > 0) {
    try {
      const pmStatePath = path.join(__dirname, '../../coordination/pm-state.json');
      const pmState = await readJSON(pmStatePath);
      const pmDaemonStatus = pmState?.pm_daemon ? {
        status: pmState.pm_daemon.pid ? 'running' : 'stopped',
        pid: pmState.pm_daemon.pid || null,
        uptime_seconds: pmState.pm_daemon.uptime_seconds || 0,
        loops_completed: pmState.pm_daemon.loops_completed || 0,
        last_loop: pmState.pm_daemon.last_loop || null,
        started_at: pmState.pm_daemon.started_at || null
      } : {
        status: 'stopped',
        pid: null,
        uptime_seconds: 0,
        loops_completed: 0,
        last_loop: null
      };

      // Broadcast to all connected clients
      clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'pm_daemon_status',
            data: pmDaemonStatus
          }));
        }
      });
    } catch (error) {
      console.error('Error polling PM daemon status:', error);
    }
  }
}, 10000);

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', () => {
  console.log('\nShutting down dashboard server...');
  watcher.close();
  eventWatcher.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down dashboard server...');
  watcher.close();
  eventWatcher.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
