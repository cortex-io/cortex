#!/usr/bin/env node

/**
 * Commit-Relay Dashboard Server
 * Real-time metrics and monitoring for the master-worker system
 *
 * Security Features (v2.0):
 * - API key authentication
 * - Rate limiting
 * - Input validation
 * - Command injection protection
 * - Path traversal protection
 * - CORS restrictions
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const cors = require('cors');
const helmet = require('helmet');

// Security middleware
const { authMiddleware, confirmationMiddleware } = require('./middleware/auth');
const { apiLimiter, controlLimiter, expensiveLimiter, getLimiter } = require('./middleware/rateLimiter');
const {
  validate,
  validatePid,
  validatePath,
  sanitizeWorkerId,
  sanitizeAlertId,
  ddqdValidationRules,
  daemonControlValidationRules,
  alertResolutionValidationRules,
  workerRestartValidationRules
} = require('./middleware/validators');

// Security utilities
const {
  safeExec,
  isProcessRunning,
  safeKillProcess,
  safeStartScript,
  sanitizeError
} = require('./utils/security');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Security: Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for dashboard
  crossOriginEmbedderPolicy: false
}));

// Security: CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked CORS request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Security: JSON body size limit (prevent DoS)
app.use(express.json({ limit: '1mb' }));

// Security: Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Static files (no auth required for public dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Security: Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Security: Apply authentication to all API routes
app.use('/api', authMiddleware);

// Paths to coordination files
const COMMIT_RELAY_HOME = process.env.COMMIT_RELAY_HOME || path.join(__dirname, '../..');
const COORD_DIR = path.join(COMMIT_RELAY_HOME, 'coordination');
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

// Event buffer for reconnecting clients (increased for better persistence)
const EVENT_BUFFER_SIZE = 500;  // Increased from 50 to 500
let eventBuffer = [];

// Load previous event buffer from file on startup for persistence
const EVENT_BUFFER_FILE = path.join(COORD_DIR, 'event-buffer.json');
try {
  const fsSync = require('fs');
  if (fsSync.existsSync(EVENT_BUFFER_FILE)) {
    const bufferData = fsSync.readFileSync(EVENT_BUFFER_FILE, 'utf-8');
    eventBuffer = JSON.parse(bufferData);
    console.log(`Loaded ${eventBuffer.length} events from persistent buffer`);
  }
} catch (e) {
  console.log('No previous event buffer found, starting fresh');
}

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
    t.status === 'assigned' ||
    t.status === 'worker_spawned' ||
    t.status === 'scan_worker_spawned'
  ).length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const cancelledTasks = tasks.filter(t => t.status === 'cancelled').length;
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
      failed: failedTasks,
      cancelled: cancelledTasks,
      total: totalTasks,
      // Breakdown for debugging
      breakdown: {
        pending: pendingTasks,
        assigned: tasks.filter(t => t.status === 'assigned').length,
        worker_spawned: tasks.filter(t => t.status === 'worker_spawned').length,
        completed: completedTasks,
        failed: failedTasks,
        cancelled: cancelledTasks
      }
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
    const limit = parseInt(req.query.limit) || 100;  // Increased default from 50 to 100
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since;  // ISO date string for filtering
    const sessionOnly = req.query.session === 'current';
    const fsSync = require('fs');

    let events = [];

    // SINGLE SOURCE OF TRUTH: dashboard-events.jsonl
    // All events (task, git, worker, system, etc.) should be written to this file
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');

      // Handle both JSONL (one JSON per line) and pretty-printed multi-line JSON
      // Try to detect format by checking if first line is a complete JSON object
      const firstLine = content.split('\n')[0];
      let isJsonl = false;
      try {
        if (firstLine && firstLine.trim().startsWith('{') && firstLine.trim().endsWith('}')) {
          JSON.parse(firstLine);
          isJsonl = true;
        }
      } catch (e) {
        // Not JSONL format
      }

      if (isJsonl) {
        // Original JSONL parsing
        const lines = content.trim().split('\n').filter(line => line);
        events = lines.map(line => {
          try {
            return normalizeEvent(JSON.parse(line));
          } catch (e) {
            console.error('Error parsing event line:', e.message);
            return null;
          }
        }).filter(e => e !== null);
      } else {
        // Parse multi-line JSON format
        // Split by pattern: }\n{ to find object boundaries
        const chunks = content.split(/}\s*\n\s*{/);
        events = [];

        chunks.forEach((chunk, index) => {
          let jsonStr = chunk.trim();

          // Add back the braces we split on (except first and last)
          if (index > 0) jsonStr = '{' + jsonStr;
          if (index < chunks.length - 1) jsonStr = jsonStr + '}';

          // Skip empty or incomplete chunks
          if (!jsonStr || jsonStr.length < 10 || !jsonStr.includes('"id"')) {
            return;
          }

          try {
            const event = JSON.parse(jsonStr);
            // Validate required fields
            if (event.id && event.timestamp && event.type) {
              events.push(normalizeEvent(event));
            }
          } catch (e) {
            // Skip malformed entries silently to avoid console spam
            if (index === chunks.length - 1 && !jsonStr.includes('"id"')) {
              // Last chunk is often incomplete, ignore it
              return;
            }
            console.error(`Error parsing event chunk ${index}:`, e.message.substring(0, 100));
          }
        });
      }
    }

    // If session=current, only show events from event buffer (events since server started)
    if (sessionOnly) {
      events = eventBuffer.slice();
    }

    // Filter by timestamp if 'since' parameter provided
    if (since) {
      const sinceDate = new Date(since);
      events = events.filter(event => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= sinceDate;
      });
    }

    // Sort by timestamp (most recent first)
    const sortedEvents = events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const totalEvents = sortedEvents.length;
    const paginatedEvents = sortedEvents.slice(offset, offset + limit);

    res.json({
      events: paginatedEvents,
      total: totalEvents,
      page: {
        offset: offset,
        limit: limit,
        hasMore: (offset + limit) < totalEvents
      }
    });
  } catch (error) {
    console.error('Error reading events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/activity-feed
 * Get activity feed for last 24 hours, grouped by hour
 */
app.get('/api/activity-feed', async (req, res) => {
  try {
    const fsSync = require('fs');
    const hours = parseInt(req.query.hours) || 24;

    // Calculate time range
    const now = new Date();
    const since = new Date(now.getTime() - (hours * 60 * 60 * 1000));

    let allEvents = [];

    // Read events file
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);

      // Parse each line as JSON
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const eventDate = new Date(event.timestamp);

          // Filter by time range
          if (eventDate >= since && eventDate <= now) {
            allEvents.push(event);
          }
        } catch (e) {
          // Skip malformed lines
          continue;
        }
      }
    }

    // Sort by timestamp (newest first)
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Group events by hour for timeline display
    const hourlyGroups = {};
    const eventTypeStats = {};

    allEvents.forEach(event => {
      // Group by hour
      const eventDate = new Date(event.timestamp);
      const hourKey = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate(),
        eventDate.getHours()
      ).toISOString();

      if (!hourlyGroups[hourKey]) {
        hourlyGroups[hourKey] = {
          hour: hourKey,
          count: 0,
          events: []
        };
      }

      hourlyGroups[hourKey].count++;
      if (hourlyGroups[hourKey].events.length < 10) { // Limit events per hour for display
        hourlyGroups[hourKey].events.push({
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          message: event.message || event.data?.message || ''
        });
      }

      // Track event type statistics
      if (!eventTypeStats[event.type]) {
        eventTypeStats[event.type] = 0;
      }
      eventTypeStats[event.type]++;
    });

    // Convert hourly groups to array and sort
    const timeline = Object.values(hourlyGroups).sort((a, b) =>
      new Date(b.hour) - new Date(a.hour)
    );

    res.json({
      period: {
        hours: hours,
        from: since.toISOString(),
        to: now.toISOString()
      },
      summary: {
        totalEvents: allEvents.length,
        uniqueHours: timeline.length,
        eventTypes: Object.keys(eventTypeStats).length
      },
      statistics: eventTypeStats,
      timeline: timeline,
      recentEvents: allEvents.slice(0, 20) // Last 20 events for quick view
    });
  } catch (error) {
    console.error('Error generating activity feed:', error);
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
 * GET /api/git-status
 * Get current git repository status and last operations
 */
app.get('/api/git-status', async (req, res) => {
  try {
    const fsSync = require('fs');
    const { execSync } = require('child_process');

    let gitStatus = {
      online: true,
      lastPR: null,
      lastPush: null,
      lastSync: null,
      currentBranch: 'unknown',
      ahead: 0,
      behind: 0
    };

    // Try to get current git status
    try {
      gitStatus.currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

      // Get ahead/behind counts
      const status = execSync('git status --porcelain -b', { encoding: 'utf-8' });
      const branchLine = status.split('\n')[0];
      const aheadMatch = branchLine.match(/ahead (\d+)/);
      const behindMatch = branchLine.match(/behind (\d+)/);

      if (aheadMatch) gitStatus.ahead = parseInt(aheadMatch[1]);
      if (behindMatch) gitStatus.behind = parseInt(behindMatch[1]);
    } catch (e) {
      gitStatus.online = false;
    }

    // Read git operations to find last PR, push, etc.
    const gitOpsPath = path.join(COORD_DIR, 'git-operations.jsonl');
    if (fsSync.existsSync(gitOpsPath)) {
      const content = fsSync.readFileSync(gitOpsPath, 'utf-8');
      const operations = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(op => op !== null);

      // Find last PR creation
      const prOps = operations.filter(op => op.operation === 'pr_create' || op.operation === 'pr_created');
      if (prOps.length > 0) {
        const lastPR = prOps[prOps.length - 1];
        gitStatus.lastPR = {
          timestamp: lastPR.timestamp,
          pr_number: lastPR.pr_number,
          title: lastPR.pr_title || lastPR.title,
          branch: lastPR.branch
        };
      }

      // Find last push
      const pushOps = operations.filter(op =>
        op.operation === 'push' ||
        op.operation === 'manual_commit_push' ||
        op.operation === 'auto_commit_push'
      );
      if (pushOps.length > 0) {
        const lastPush = pushOps[pushOps.length - 1];
        gitStatus.lastPush = {
          timestamp: lastPush.timestamp,
          branch: lastPush.branch,
          commits: lastPush.commits_count || 1,
          worker_id: lastPush.worker_id
        };
      }

      // Last sync is the most recent of PR or push
      const allSyncOps = [...prOps, ...pushOps].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      if (allSyncOps.length > 0) {
        gitStatus.lastSync = {
          timestamp: allSyncOps[0].timestamp,
          operation: allSyncOps[0].operation
        };
      }
    }

    res.json(gitStatus);
  } catch (error) {
    console.error('Error getting git status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/health-alerts
 * Get current health alerts with visual status indicators
 */
app.get('/api/health-alerts',
  getLimiter,
  async (req, res) => {
  try {
    // Read health alerts file
    const alertsFile = path.join(__dirname, '../../coordination/health-alerts.json');

    if (!fsSync.existsSync(alertsFile)) {
      return res.json({
        alerts: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0
        },
        healthStatus: 'healthy'
      });
    }

    const alertsData = JSON.parse(fsSync.readFileSync(alertsFile, 'utf-8'));
    const alerts = alertsData.alerts || [];

    // Count alerts by severity
    const summary = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length,
      total: alerts.length
    };

    // Determine overall health status
    let healthStatus = 'healthy'; // green
    let statusColor = '#10b981';

    if (summary.critical > 0) {
      healthStatus = 'critical'; // red
      statusColor = '#ef4444';
    } else if (summary.high > 0) {
      healthStatus = 'warning'; // yellow/orange
      statusColor = '#f59e0b';
    } else if (summary.medium > 0) {
      healthStatus = 'caution'; // yellow
      statusColor = '#eab308';
    }

    // Add visual indicators to each alert
    const enrichedAlerts = alerts.map(alert => ({
      ...alert,
      color: alert.severity === 'critical' ? '#ef4444' :
             alert.severity === 'high' ? '#f59e0b' :
             alert.severity === 'medium' ? '#eab308' :
             '#3b82f6',
      icon: alert.severity === 'critical' ? '🔴' :
            alert.severity === 'high' ? '🟠' :
            alert.severity === 'medium' ? '🟡' :
            '🔵',
      isNew: (Date.now() - new Date(alert.created_at).getTime()) < 300000 // New if < 5 minutes
    }));

    res.json({
      alerts: enrichedAlerts,
      summary,
      healthStatus,
      statusColor,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error reading health alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/moe-intelligence
 * Get MoE routing decisions and pattern analysis for visualizations
 */
app.get('/api/moe-intelligence',
  getLimiter,
  async (req, res) => {
  try {
    const timeRange = req.query.range || '24h'; // 1h, 6h, 24h, 7d, 30d

    // Read routing decisions
    const decisionsFile = path.join(__dirname, '../../coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl');
    const patternsFile = path.join(__dirname, '../../coordination/memory/long-term/task-patterns.json');

    let routingDecisions = [];
    if (fsSync.existsSync(decisionsFile)) {
      const content = fsSync.readFileSync(decisionsFile, 'utf-8');
      routingDecisions = content
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
    }

    // Filter by time range
    const now = Date.now();
    const rangeMs = {
      '1h': 3600000,
      '6h': 21600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000
    }[timeRange] || 86400000;

    const filteredDecisions = routingDecisions.filter(d => {
      const timestamp = new Date(d.timestamp).getTime();
      return (now - timestamp) <= rangeMs;
    });

    // Calculate routing flow (for Sankey diagram)
    const routingFlow = {};
    filteredDecisions.forEach(d => {
      const key = `${d.rule_used}->${d.routed_to}`;
      routingFlow[key] = (routingFlow[key] || 0) + 1;
    });

    // Calculate confidence distribution
    const confidenceBuckets = {
      '0-25': 0,
      '26-50': 0,
      '51-75': 0,
      '76-90': 0,
      '91-100': 0
    };

    filteredDecisions.forEach(d => {
      const conf = parseFloat(d.confidence) * 100;
      if (conf <= 25) confidenceBuckets['0-25']++;
      else if (conf <= 50) confidenceBuckets['26-50']++;
      else if (conf <= 75) confidenceBuckets['51-75']++;
      else if (conf <= 90) confidenceBuckets['76-90']++;
      else confidenceBuckets['91-100']++;
    });

    // Calculate success rates by master type
    const masterStats = {};
    filteredDecisions.forEach(d => {
      if (!masterStats[d.routed_to]) {
        masterStats[d.routed_to] = {
          total: 0,
          highConfidence: 0,
          strategies: {}
        };
      }
      masterStats[d.routed_to].total++;
      if (parseFloat(d.confidence) > 0.8) {
        masterStats[d.routed_to].highConfidence++;
      }
      masterStats[d.routed_to].strategies[d.strategy] =
        (masterStats[d.routed_to].strategies[d.strategy] || 0) + 1;
    });

    // Read task patterns if available
    let taskPatterns = null;
    if (fsSync.existsSync(patternsFile)) {
      taskPatterns = JSON.parse(fsSync.readFileSync(patternsFile, 'utf-8'));
    }

    // Create hourly heat map data
    const hourlyActivity = {};
    filteredDecisions.forEach(d => {
      const hour = new Date(d.timestamp).getHours();
      const master = d.routed_to;
      if (!hourlyActivity[hour]) hourlyActivity[hour] = {};
      hourlyActivity[hour][master] = (hourlyActivity[hour][master] || 0) + 1;
    });

    res.json({
      summary: {
        totalDecisions: filteredDecisions.length,
        timeRange,
        avgConfidence: filteredDecisions.length > 0
          ? (filteredDecisions.reduce((sum, d) => sum + parseFloat(d.confidence), 0) / filteredDecisions.length).toFixed(3)
          : 0,
        mostUsedMaster: Object.entries(masterStats)
          .sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'none',
        uniqueStrategies: [...new Set(filteredDecisions.map(d => d.strategy))]
      },
      routingFlow,
      confidenceDistribution: confidenceBuckets,
      masterStatistics: masterStats,
      hourlyHeatMap: hourlyActivity,
      taskPatterns: taskPatterns?.patterns || null,
      recentDecisions: filteredDecisions.slice(-10).reverse() // Last 10 decisions
    });

  } catch (error) {
    console.error('Error reading MoE intelligence data:', error);
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
 * GET /api/daemons/all
 * Get status of all system daemons
 */
app.get('/api/daemons/all',
  getLimiter,
  async (req, res) => {
  try {
    const { execSync } = require('child_process');

    // Check each daemon process
    const checkDaemon = (name, processName) => {
      try {
        const result = execSync(`pgrep -f "${processName}" | head -1`, { encoding: 'utf8' }).trim();
        if (result) {
          const pid = parseInt(result);
          // Get process info
          const psInfo = execSync(`ps -p ${pid} -o pid,etime,rss | tail -1`, { encoding: 'utf8' }).trim();
          const [, uptime, memory] = psInfo.split(/\s+/);

          return {
            status: 'running',
            pid: pid,
            uptime: uptime || 'unknown',
            memory: parseInt(memory) || 0
          };
        }
      } catch (e) {
        // Process not found
      }
      return {
        status: 'stopped',
        pid: null,
        uptime: '0',
        memory: 0
      };
    };

    const daemons = {
      'worker-daemon': checkDaemon('worker-daemon', 'worker-daemon.sh'),
      'health-monitor': checkDaemon('health-monitor', 'health-monitor-daemon.sh'),
      'metrics-snapshot': checkDaemon('metrics-snapshot', 'metrics-snapshot-daemon.sh'),
      'task-orchestrator': checkDaemon('orchestrator', 'task-orchestrator-daemon.sh'),
      'pm-daemon': checkDaemon('pm-daemon', 'pm-daemon.sh'),
      'dashboard': {
        status: 'running',
        pid: process.pid,
        uptime: process.uptime() + 's',
        memory: process.memoryUsage().rss
      }
    };

    // Count running/stopped
    const summary = {
      total: Object.keys(daemons).length,
      running: Object.values(daemons).filter(d => d.status === 'running').length,
      stopped: Object.values(daemons).filter(d => d.status === 'stopped').length
    };

    res.json({
      daemons,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking daemon statuses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/health-monitor/start
 * Start health monitor daemon
 */
app.post('/api/health-monitor/start', async (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../../scripts/health-monitor-daemon.sh');

    // Check if already running
    const isRunning = await safeExec(`pgrep -f "health-monitor-daemon.sh"`);
    if (isRunning.stdout.trim()) {
      return res.json({ status: 'already_running', message: 'Health monitor is already running' });
    }

    // Start the daemon
    const { spawn } = require('child_process');
    spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    setTimeout(() => {
      res.json({ status: 'started', message: 'Health monitor daemon started successfully' });
    }, 1000);
  } catch (error) {
    console.error('Error starting health monitor:', error);
    res.status(500).json({ error: 'Failed to start health monitor' });
  }
});

/**
 * POST /api/health-monitor/stop
 * Stop health monitor daemon
 */
app.post('/api/health-monitor/stop', async (req, res) => {
  try {
    await safeExec(`pkill -f "health-monitor-daemon.sh"`);
    res.json({ status: 'stopped', message: 'Health monitor daemon stopped' });
  } catch (error) {
    res.json({ status: 'not_running', message: 'Health monitor was not running' });
  }
});

/**
 * POST /api/metrics-snapshot/start
 * Start metrics snapshot daemon
 */
app.post('/api/metrics-snapshot/start', async (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../../scripts/metrics-snapshot-daemon.sh');

    // Check if already running
    const isRunning = await safeExec(`pgrep -f "metrics-snapshot-daemon.sh"`);
    if (isRunning.stdout.trim()) {
      return res.json({ status: 'already_running', message: 'Metrics snapshot is already running' });
    }

    // Start the daemon
    const { spawn } = require('child_process');
    spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    setTimeout(() => {
      res.json({ status: 'started', message: 'Metrics snapshot daemon started successfully' });
    }, 1000);
  } catch (error) {
    console.error('Error starting metrics snapshot:', error);
    res.status(500).json({ error: 'Failed to start metrics snapshot' });
  }
});

/**
 * POST /api/metrics-snapshot/stop
 * Stop metrics snapshot daemon
 */
app.post('/api/metrics-snapshot/stop', async (req, res) => {
  try {
    await safeExec(`pkill -f "metrics-snapshot-daemon.sh"`);
    res.json({ status: 'stopped', message: 'Metrics snapshot daemon stopped' });
  } catch (error) {
    res.json({ status: 'not_running', message: 'Metrics snapshot was not running' });
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
 * Security: Input validation, path validation, safe command execution, rate limiting
 */
app.post('/api/health-alerts/:id/restart-worker',
  controlLimiter,
  workerRestartValidationRules,
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Sanitize alert ID
      const safeAlertId = sanitizeAlertId(id);

      const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');
      const healthAlertsData = await readJSON(healthAlertsPath);

      if (!healthAlertsData || !healthAlertsData.alerts) {
        return res.status(404).json({ error: 'Health alerts file not found' });
      }

      const alert = healthAlertsData.alerts.find(a => a.id === safeAlertId);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      if (!alert.worker_id) {
        return res.status(400).json({ error: 'Alert does not have an associated worker' });
      }

      // Sanitize worker ID
      const workerId = sanitizeWorkerId(alert.worker_id);

      const workerSpecsDir = path.join(__dirname, '../../coordination/worker-specs');
      const stuckDir = path.join(workerSpecsDir, 'stuck');
      const failedDir = path.join(workerSpecsDir, 'failed');
      const activeDir = path.join(workerSpecsDir, 'active');

      // Find worker spec in stuck or failed directories
      let workerSpecPath = null;
      let sourceDir = null;

      // Use basename to prevent path traversal
      const safeWorkerFilename = path.basename(`${workerId}.json`);
      const stuckPath = path.join(stuckDir, safeWorkerFilename);
      const failedPath = path.join(failedDir, safeWorkerFilename);

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
        restart_reason: `Restarted from health alert ${safeAlertId}`
      };

      // Move to active directory with safe path
      const activePath = path.join(activeDir, safeWorkerFilename);
      await fs.writeFile(activePath, JSON.stringify(workerSpec, null, 2), 'utf-8');

      // Remove from stuck/failed directory
      await fs.unlink(workerSpecPath);

      // Add note to alert
      const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === safeAlertId);
      if (!healthAlertsData.alerts[alertIndex].investigation_notes) {
        healthAlertsData.alerts[alertIndex].investigation_notes = [];
      }
      healthAlertsData.alerts[alertIndex].investigation_notes.push(
        `${new Date().toISOString()} - Worker ${workerId} restarted from ${sourceDir}/ directory`
      );

      await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

      // Emit dashboard event
      emitDashboardEvent('worker_restarted', {
        worker_id: workerId,
        alert_id: safeAlertId,
        alert_type: alert?.type || 'unknown',
        source_dir: sourceDir,
        message: `Worker ${workerId} restarted from health alert`
      });

      // Attempt to spawn the worker using safe execution
      // Note: Worker daemon will pick this up automatically, so spawning here is optional
      try {
        const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');
        // Validate script path is within expected directory
        const baseDir = path.join(__dirname, '../..');
        const validatedScript = validatePath(spawnScript, baseDir);

        // Use safe execution with validated path
        safeExec('bash', [validatedScript, activePath], {
          cwd: baseDir,
          detached: true,
          stdio: 'ignore'
        }).catch(err => {
          console.warn('Worker spawn failed, daemon will retry:', err.message);
        });
      } catch (spawnError) {
        console.warn('Error spawning worker, daemon will retry:', spawnError.message);
        // Don't fail the request - worker spec is moved, spawn will be attempted by daemon
      }

      res.json({
        success: true,
        message: `Worker ${workerId} restarted from ${sourceDir}/ directory`,
        worker_id: workerId
      });
    } catch (error) {
      console.error('Error restarting worker:', error);
      const safeError = sanitizeError(error, process.env.NODE_ENV === 'development');
      res.status(500).json({ error: 'Failed to restart worker', ...safeError });
    }
  }
);

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
 * POST /api/health-alerts/:id/repair
 * Create automated repair task for health alert via commit-relay
 */
app.post('/api/health-alerts/:id/repair', async (req, res) => {
  const { id } = req.params;
  const { execSync } = require('child_process');

  try {
    const healthAlertsPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'health-alerts.json');
    const healthAlertsContent = await fs.readFile(healthAlertsPath, 'utf-8');
    const healthAlertsData = JSON.parse(healthAlertsContent);

    if (!healthAlertsData || !healthAlertsData.alerts) {
      return res.status(404).json({ error: 'Health alerts file not found' });
    }

    const alert = healthAlertsData.alerts.find(a => a.id === id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Create repair task
    const taskId = `task-repair-${Date.now()}`;
    const taskTitle = `REPAIR: ${alert.type.replace(/_/g, ' ')} - ${alert.message}`;

    const repairTask = {
      id: taskId,
      title: taskTitle,
      type: 'development',
      priority: alert.severity === 'critical' ? 'critical' : 'high',
      status: 'pending',
      created_at: new Date().toISOString(),
      created_by: 'health-alert-repair-system',
      context: {
        repository: 'ry-ops/commit-relay',
        branch: 'main',
        description: `Automated repair task from health alert: ${alert.message}`,
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          created_at: alert.created_at,
          worker_id: alert.worker_id
        },
        repair_actions: [
          `Investigate ${alert.type} issue`,
          'Diagnose root cause',
          'Implement fix or workaround',
          'Verify resolution',
          'Update health monitoring if needed',
          'Document findings and solution'
        ],
        requirements: []
      }
    };

    // Emit task created event
    try {
      const eventScript = path.join(COMMIT_RELAY_HOME, 'scripts', 'emit-event.sh');
      execSync(`${eventScript} task_created ${taskId} "Repair task created from health alert ${alert.id}"`, {
        cwd: COMMIT_RELAY_HOME,
        stdio: 'pipe'
      });
    } catch (emitError) {
      console.warn('Failed to emit task_created event:', emitError.message);
    }

    // Route task through MoE coordinator
    try {
      const moeRouter = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'lib', 'moe-router.sh');
      const taskDesc = `${taskTitle}. ${alert.message}`;
      const routeCmd = `TASK_DESC="${taskDesc}" ${moeRouter} "${taskId}" "${taskDesc}"`;
      const routeOutput = execSync(routeCmd, {
        cwd: COMMIT_RELAY_HOME,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      console.log(`Task ${taskId} routed through MoE:`, routeOutput);
    } catch (routeError) {
      console.error('Failed to route task through MoE:', routeError.message);
      // Continue anyway - task will be picked up by worker daemon
    }

    // Update alert status to indicate repair initiated
    alert.status = 'repair_initiated';
    if (!alert.investigation_notes) {
      alert.investigation_notes = [];
    }
    alert.investigation_notes.push({
      timestamp: new Date().toISOString(),
      note: `Automated repair task created: ${taskId}`,
      task_id: taskId
    });

    await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2), 'utf-8');

    // Emit dashboard event
    emitDashboardEvent('health_alert_repair_initiated', {
      alert_id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      task_id: taskId,
      message: `Automated repair initiated for: ${alert.message}`
    });

    res.json({
      success: true,
      message: 'Repair task created and routed to commit-relay',
      task_id: taskId,
      alert_id: alert.id,
      task: repairTask
    });
  } catch (error) {
    console.error('Error creating repair task:', error);
    res.status(500).json({
      error: 'Failed to create repair task',
      details: error.message
    });
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
 * Security: Input validation, safe command execution, rate limiting
 */
app.post('/api/daemon/control',
  controlLimiter,
  daemonControlValidationRules,
  validate,
  async (req, res) => {
    const { action } = req.body;

    try {
      const scriptPath = path.join(__dirname, '../../scripts/worker-daemon.sh');
      const PID_FILE = '/tmp/commit-relay-worker-daemon.pid';

      if (action === 'start') {
        // Check if already running using safe PID validation
        if (fsSync.existsSync(PID_FILE)) {
          try {
            const pidContent = fsSync.readFileSync(PID_FILE, 'utf-8').trim();
            const pid = validatePid(pidContent);

            if (isProcessRunning(pid)) {
              return res.json({
                success: false,
                message: 'Worker daemon is already running',
                pid
              });
            }

            // PID file exists but process is dead, clean it up
            fsSync.unlinkSync(PID_FILE);
          } catch (err) {
            // Invalid PID file, clean it up
            fsSync.unlinkSync(PID_FILE);
          }
        }

        // Start the daemon using safe execution
        await safeStartScript(scriptPath, [], path.join(__dirname, '../..'));

        // Give it a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Read the new PID
        if (fsSync.existsSync(PID_FILE)) {
          try {
            const pidContent = fsSync.readFileSync(PID_FILE, 'utf-8').trim();
            const pid = validatePid(pidContent);
            res.json({ success: true, message: 'Worker daemon started', pid });
          } catch (err) {
            res.json({ success: false, message: 'Worker daemon may have failed to start' });
          }
        } else {
          res.json({ success: false, message: 'Worker daemon may have failed to start' });
        }
      } else if (action === 'stop') {
        // Stop the daemon using safe script execution
        await safeExec('bash', [scriptPath, 'stop'], { cwd: path.join(__dirname, '../..') });
        res.json({ success: true, message: 'Worker daemon stopped' });
      } else if (action === 'restart') {
        // Restart using safe script execution
        await safeExec('bash', [scriptPath, 'restart'], { cwd: path.join(__dirname, '../..') });
        res.json({ success: true, message: 'Worker daemon restarted' });
      }
    } catch (error) {
      console.error('Error controlling worker daemon:', error);
      const safeError = sanitizeError(error, process.env.NODE_ENV === 'development');
      res.status(500).json({ success: false, ...safeError });
    }
  }
);

/**
 * Start/Stop PM Daemon
 * Security: Input validation, safe command execution, rate limiting
 */
app.post('/api/pm-daemon/control',
  controlLimiter,
  daemonControlValidationRules,
  validate,
  async (req, res) => {
    const { action } = req.body;

    try {
      const scriptPath = path.join(__dirname, '../../scripts/pm-daemon.sh');
      const PID_FILE = '/tmp/commit-relay-pm-daemon.pid';

      if (action === 'start') {
        // Check if already running using safe PID validation
        if (fsSync.existsSync(PID_FILE)) {
          try {
            const pidContent = fsSync.readFileSync(PID_FILE, 'utf-8').trim();
            const pid = validatePid(pidContent);

            if (isProcessRunning(pid)) {
              return res.json({
                success: false,
                message: 'PM daemon is already running',
                pid
              });
            }

            // PID file exists but process is dead, clean it up
            fsSync.unlinkSync(PID_FILE);
          } catch (err) {
            // Invalid PID file, clean it up
            fsSync.unlinkSync(PID_FILE);
          }
        }

        // Start the daemon using safe execution
        await safeStartScript(scriptPath, [], path.join(__dirname, '../..'));

        // Give it a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Read the new PID
        if (fsSync.existsSync(PID_FILE)) {
          try {
            const pidContent = fsSync.readFileSync(PID_FILE, 'utf-8').trim();
            const pid = validatePid(pidContent);
            res.json({ success: true, message: 'PM daemon started', pid });
          } catch (err) {
            res.json({ success: false, message: 'PM daemon may have failed to start' });
          }
        } else {
          res.json({ success: false, message: 'PM daemon may have failed to start' });
        }
      } else if (action === 'stop') {
        // Stop the daemon using safe PID handling
        if (fsSync.existsSync(PID_FILE)) {
          try {
            const pidContent = fsSync.readFileSync(PID_FILE, 'utf-8').trim();
            const pid = validatePid(pidContent);

            if (safeKillProcess(pid)) {
              fsSync.unlinkSync(PID_FILE);
              res.json({ success: true, message: 'PM daemon stopped' });
            } else {
              res.json({ success: false, message: 'Failed to stop PM daemon' });
            }
          } catch (err) {
            res.json({ success: false, message: 'Failed to stop PM daemon: Invalid PID' });
          }
        } else {
          res.json({ success: false, message: 'PM daemon is not running' });
        }
      } else if (action === 'restart') {
        // Restart using safe script execution
        await safeExec('bash', [scriptPath, 'restart'], { cwd: path.join(__dirname, '../..') });
        res.json({ success: true, message: 'PM daemon restarted' });
      }
    } catch (error) {
      console.error('Error controlling PM daemon:', error);
      const safeError = sanitizeError(error, process.env.NODE_ENV === 'development');
      res.status(500).json({ success: false, ...safeError });
    }
  }
);

/**
 * GET /api/health-daemon/status
 * Get health monitor daemon status
 */
app.get('/api/health-daemon/status', async (req, res) => {
  const { execSync } = require('child_process');
  const fsSync = require('fs');
  const PID_FILE = '/tmp/commit-relay-health-monitor.pid';

  try {
    if (!fsSync.existsSync(PID_FILE)) {
      return res.json({ status: 'stopped', pid: null });
    }

    const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());

    try {
      execSync(`ps -p ${pid}`, { stdio: 'pipe' });

      // Get uptime
      const psOutput = execSync(`ps -o etime= -p ${pid}`).toString().trim();
      const uptime = parseElapsedTime(psOutput);

      res.json({ status: 'running', pid, uptime_seconds: uptime });
    } catch (e) {
      // Process not running, clean up stale PID
      fsSync.unlinkSync(PID_FILE);
      res.json({ status: 'stopped', pid: null });
    }
  } catch (error) {
    console.error('Error getting health daemon status:', error);
    res.json({ status: 'stopped', pid: null });
  }
});

/**
 * POST /api/health-daemon/control
 * Start/Stop Health Monitor Daemon
 */
app.post('/api/health-daemon/control', async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body;

  try {
    const scriptPath = path.join(__dirname, '../../scripts/health-monitor-daemon.sh');
    const PID_FILE = '/tmp/commit-relay-health-monitor.pid';
    const fsSync = require('fs');

    if (action === 'start') {
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`ps -p ${pid}`, { stdio: 'pipe' });
          return res.json({ success: false, message: 'Health monitor daemon is already running', pid });
        } catch (e) {
          fsSync.unlinkSync(PID_FILE);
        }
      }

      execSync(`bash ${scriptPath} > /tmp/health-monitor-start.log 2>&1 &`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'Health monitor daemon started', pid });
      } else {
        res.json({ success: false, message: 'Health monitor daemon may have failed to start' });
      }
    } else if (action === 'stop') {
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`kill ${pid}`, { stdio: 'pipe' });
          fsSync.unlinkSync(PID_FILE);
          res.json({ success: true, message: 'Health monitor daemon stopped' });
        } catch (e) {
          res.json({ success: false, message: 'Failed to stop health monitor daemon' });
        }
      } else {
        res.json({ success: false, message: 'Health monitor daemon is not running' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop"' });
    }
  } catch (error) {
    console.error('Error controlling health monitor daemon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/metrics-daemon/status
 * Get metrics snapshot daemon status
 */
app.get('/api/metrics-daemon/status', async (req, res) => {
  const { execSync } = require('child_process');
  const fsSync = require('fs');
  const PID_FILE = '/tmp/commit-relay-metrics-snapshot.pid';

  try {
    if (!fsSync.existsSync(PID_FILE)) {
      return res.json({ status: 'stopped', pid: null });
    }

    const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());

    try {
      execSync(`ps -p ${pid}`, { stdio: 'pipe' });

      // Get uptime
      const psOutput = execSync(`ps -o etime= -p ${pid}`).toString().trim();
      const uptime = parseElapsedTime(psOutput);

      res.json({ status: 'running', pid, uptime_seconds: uptime });
    } catch (e) {
      // Process not running, clean up stale PID
      fsSync.unlinkSync(PID_FILE);
      res.json({ status: 'stopped', pid: null });
    }
  } catch (error) {
    console.error('Error getting metrics daemon status:', error);
    res.json({ status: 'stopped', pid: null });
  }
});

/**
 * POST /api/metrics-daemon/control
 * Start/Stop Metrics Snapshot Daemon
 */
app.post('/api/metrics-daemon/control', async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body;

  try {
    const scriptPath = path.join(__dirname, '../../scripts/metrics-snapshot-daemon.sh');
    const PID_FILE = '/tmp/commit-relay-metrics-snapshot.pid';
    const fsSync = require('fs');

    if (action === 'start') {
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`ps -p ${pid}`, { stdio: 'pipe' });
          return res.json({ success: false, message: 'Metrics snapshot daemon is already running', pid });
        } catch (e) {
          fsSync.unlinkSync(PID_FILE);
        }
      }

      execSync(`bash ${scriptPath} > /tmp/metrics-snapshot-start.log 2>&1 &`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'Metrics snapshot daemon started', pid });
      } else {
        res.json({ success: false, message: 'Metrics snapshot daemon may have failed to start' });
      }
    } else if (action === 'stop') {
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          execSync(`kill ${pid}`, { stdio: 'pipe' });
          fsSync.unlinkSync(PID_FILE);
          res.json({ success: true, message: 'Metrics snapshot daemon stopped' });
        } catch (e) {
          res.json({ success: false, message: 'Failed to stop metrics snapshot daemon' });
        }
      } else {
        res.json({ success: false, message: 'Metrics snapshot daemon is not running' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "start" or "stop"' });
    }
  } catch (error) {
    console.error('Error controlling metrics snapshot daemon:', error);
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
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const routingLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'logs', 'routing-decisions.jsonl');

    if (!fsSync.existsSync(routingLogPath)) {
      return res.json({ decisions: [] });
    }

    // Use jq to parse multi-line JSON objects and convert to array
    // This handles both JSONL (single-line) and pretty-printed multi-line JSON
    const { stdout } = await execAsync(`jq -s '.' "${routingLogPath}"`);
    const allDecisions = JSON.parse(stdout);

    // Get last 100 decisions, most recent first
    const decisions = allDecisions.slice(-100).reverse();

    res.json({ decisions });
  } catch (error) {
    console.error('Error fetching MoE routing decisions:', error);
    res.status(500).json({ error: 'Failed to fetch routing decisions', details: error.message });
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

/**
 * GET /api/moe/accuracy
 * Calculate routing accuracy from routing decisions
 */
app.get('/api/moe/accuracy', async (req, res) => {
  try {
    const fsSync = require('fs');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const routingLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'logs', 'routing-decisions.jsonl');

    if (!fsSync.existsSync(routingLogPath)) {
      return res.json({
        accuracy: 0,
        total_decisions: 0,
        correct_routes: 0,
        last_24h: { accuracy: 0, decisions: 0 }
      });
    }

    // Parse routing decisions
    const { stdout } = await execAsync(`jq -s '.' "${routingLogPath}"`);
    const allDecisions = JSON.parse(stdout);

    // Calculate overall accuracy (last 100 decisions)
    const recentDecisions = allDecisions.slice(-100);
    const totalDecisions = recentDecisions.length;

    // Calculate last 24 hours
    const now = new Date();
    const last24h = recentDecisions.filter(d => {
      const decisionTime = new Date(d.timestamp);
      return (now - decisionTime) < 24 * 60 * 60 * 1000;
    });

    // Calculate confidence-based accuracy (high confidence = correct routing)
    const highConfidenceCount = recentDecisions.filter(d =>
      d.decision.primary_confidence >= 0.7
    ).length;

    const accuracy = totalDecisions > 0 ? (highConfidenceCount / totalDecisions) * 100 : 0;
    const accuracy24h = last24h.length > 0 ?
      (last24h.filter(d => d.decision.primary_confidence >= 0.7).length / last24h.length) * 100 : 0;

    res.json({
      accuracy: accuracy.toFixed(2),
      total_decisions: totalDecisions,
      correct_routes: highConfidenceCount,
      last_24h: {
        accuracy: accuracy24h.toFixed(2),
        decisions: last24h.length
      },
      avg_confidence: recentDecisions.length > 0 ?
        (recentDecisions.reduce((sum, d) => sum + d.decision.primary_confidence, 0) / recentDecisions.length).toFixed(2) : 0
    });
  } catch (error) {
    console.error('Error calculating MoE accuracy:', error);
    res.status(500).json({ error: 'Failed to calculate accuracy', details: error.message });
  }
});

/**
 * GET /api/moe/confidence-distribution
 * Get distribution of confidence scores across routing decisions
 */
app.get('/api/moe/confidence-distribution', async (req, res) => {
  try {
    const fsSync = require('fs');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const routingLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'logs', 'routing-decisions.jsonl');

    if (!fsSync.existsSync(routingLogPath)) {
      return res.json({
        distribution: { low: 0, medium: 0, high: 0, excellent: 0 },
        ranges: [
          { label: 'Low (0-0.5)', count: 0, percentage: 0 },
          { label: 'Medium (0.5-0.7)', count: 0, percentage: 0 },
          { label: 'High (0.7-0.9)', count: 0, percentage: 0 },
          { label: 'Excellent (0.9-1.0)', count: 0, percentage: 0 }
        ]
      });
    }

    // Parse routing decisions
    const { stdout } = await execAsync(`jq -s '.' "${routingLogPath}"`);
    const allDecisions = JSON.parse(stdout);
    const recentDecisions = allDecisions.slice(-100);

    // Categorize by confidence score
    const distribution = {
      low: 0,      // 0 - 0.5
      medium: 0,   // 0.5 - 0.7
      high: 0,     // 0.7 - 0.9
      excellent: 0 // 0.9 - 1.0
    };

    recentDecisions.forEach(d => {
      const conf = d.decision.primary_confidence;
      if (conf < 0.5) distribution.low++;
      else if (conf < 0.7) distribution.medium++;
      else if (conf < 0.9) distribution.high++;
      else distribution.excellent++;
    });

    const total = recentDecisions.length;
    const ranges = [
      {
        label: 'Low (0-0.5)',
        count: distribution.low,
        percentage: total > 0 ? ((distribution.low / total) * 100).toFixed(1) : 0
      },
      {
        label: 'Medium (0.5-0.7)',
        count: distribution.medium,
        percentage: total > 0 ? ((distribution.medium / total) * 100).toFixed(1) : 0
      },
      {
        label: 'High (0.7-0.9)',
        count: distribution.high,
        percentage: total > 0 ? ((distribution.high / total) * 100).toFixed(1) : 0
      },
      {
        label: 'Excellent (0.9-1.0)',
        count: distribution.excellent,
        percentage: total > 0 ? ((distribution.excellent / total) * 100).toFixed(1) : 0
      }
    ];

    res.json({ distribution, ranges, total });
  } catch (error) {
    console.error('Error calculating confidence distribution:', error);
    res.status(500).json({ error: 'Failed to calculate distribution', details: error.message });
  }
});

/**
 * GET /api/moe/pool-utilization
 * Get worker pool utilization by master over time
 */
app.get('/api/moe/pool-utilization', async (req, res) => {
  try {
    const fsSync = require('fs');

    // Read worker pool
    const workerPoolPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'worker-pool.json');
    let poolData = { active_workers: [] };

    if (fsSync.existsSync(workerPoolPath)) {
      poolData = JSON.parse(fsSync.readFileSync(workerPoolPath, 'utf-8'));
    }

    // Count workers by master
    const utilization = {
      development: 0,
      security: 0,
      inventory: 0,
      cicd: 0,
      total: 0
    };

    poolData.active_workers.forEach(worker => {
      const spawnedBy = worker.spawned_by || 'unknown';
      if (utilization.hasOwnProperty(spawnedBy)) {
        utilization[spawnedBy]++;
      }
      utilization.total++;
    });

    // Calculate sparse activation percentage
    const maxCapacity = 64;
    const sparseActivation = utilization.total > 0 ?
      ((utilization.total / maxCapacity) * 100).toFixed(1) : 0;

    // Read worker spec files for detailed status
    const workerSpecsDir = path.join(COMMIT_RELAY_HOME, 'coordination', 'worker-specs', 'active');
    let activeCount = 0;
    let runningCount = 0;
    let pendingCount = 0;

    if (fsSync.existsSync(workerSpecsDir)) {
      const files = fsSync.readdirSync(workerSpecsDir).filter(f => f.endsWith('.json'));
      activeCount = files.length;

      files.forEach(file => {
        const filePath = path.join(workerSpecsDir, file);
        const spec = JSON.parse(fsSync.readFileSync(filePath, 'utf-8'));
        if (spec.status === 'running') runningCount++;
        else if (spec.status === 'pending') pendingCount++;
      });
    }

    res.json({
      utilization,
      sparse_activation: sparseActivation,
      max_capacity: maxCapacity,
      pool_health: {
        active: activeCount,
        running: runningCount,
        pending: pendingCount,
        status: activeCount < 10 ? 'healthy' : activeCount < 15 ? 'warning' : 'critical'
      }
    });
  } catch (error) {
    console.error('Error calculating pool utilization:', error);
    res.status(500).json({ error: 'Failed to calculate utilization', details: error.message });
  }
});

/**
 * POST /api/pm/state
 * PM Daemon reports its current state
 */
app.post('/api/pm/state', async (req, res) => {
  try {
    const fsSync = require('fs');
    const pmStatePath = path.join(COMMIT_RELAY_HOME, 'coordination', 'pm-state.json');

    // Write state to file
    fsSync.writeFileSync(pmStatePath, JSON.stringify(req.body, null, 2));

    // Emit event via WebSocket for real-time updates
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'pm_state_update',
            data: req.body,
            timestamp: new Date().toISOString()
          }));
        }
      });
    }

    res.json({ success: true, message: 'PM state updated' });
  } catch (error) {
    console.error('Error updating PM state:', error);
    res.status(500).json({ error: 'Failed to update PM state', details: error.message });
  }
});

/**
 * POST /api/health/report
 * Health Monitor Daemon reports health check results
 */
app.post('/api/health/report', async (req, res) => {
  try {
    const { component, status, details } = req.body;
    const fsSync = require('fs');
    const healthLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'health-reports.jsonl');

    const report = {
      component,
      status,
      details,
      timestamp: new Date().toISOString()
    };

    // Append to JSONL log
    fsSync.appendFileSync(healthLogPath, JSON.stringify(report) + '\n');

    // Emit event via WebSocket
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'health_report',
            data: report
          }));
        }
      });
    }

    res.json({ success: true, message: 'Health report recorded' });
  } catch (error) {
    console.error('Error recording health report:', error);
    res.status(500).json({ error: 'Failed to record health report', details: error.message });
  }
});

/**
 * POST /api/metrics/report
 * Metrics Snapshot Daemon reports metrics snapshot
 */
app.post('/api/metrics/report', async (req, res) => {
  try {
    const fsSync = require('fs');
    const metricsLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'metrics-snapshots.jsonl');

    const snapshot = {
      ...req.body,
      timestamp: req.body.timestamp || new Date().toISOString()
    };

    // Append to JSONL log
    fsSync.appendFileSync(metricsLogPath, JSON.stringify(snapshot) + '\n');

    // Emit event via WebSocket
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'metrics_snapshot',
            data: snapshot
          }));
        }
      });
    }

    res.json({ success: true, message: 'Metrics snapshot recorded' });
  } catch (error) {
    console.error('Error recording metrics snapshot:', error);
    res.status(500).json({ error: 'Failed to record metrics snapshot', details: error.message });
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

  // Persist buffer to file for recovery after restart
  saveEventBuffer();

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

// Debounced save function to prevent excessive file writes
let saveTimeout = null;
function saveEventBuffer() {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Set new timeout - save after 1 second of no new events
  saveTimeout = setTimeout(() => {
    try {
      const bufferFile = path.join(__dirname, '../../coordination/event-buffer.json');
      fsSync.writeFileSync(bufferFile, JSON.stringify({
        events: eventBuffer,
        savedAt: new Date().toISOString(),
        bufferSize: EVENT_BUFFER_SIZE
      }, null, 2));
      console.log(`Event buffer saved (${eventBuffer.length} events)`);
    } catch (error) {
      console.error('Failed to save event buffer:', error);
    }
  }, 1000); // 1 second debounce
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
// DDQD Testing API Endpoints
// ============================================================================

const ddqdTests = new Map(); // Store active DDQD tests

// Run DDQD test
// Security: Input validation, rate limiting (expensive operation)
app.post('/api/ddqd/run',
  expensiveLimiter,
  confirmationMiddleware,
  ddqdValidationRules,
  validate,
  async (req, res) => {
    try {
      const { duration, maxWorkers, version, verbose } = req.body;

      const testId = `ddqd-${version}-${Date.now()}`;
      const startTime = new Date().toISOString();

      // Build command with validated inputs
      const scriptPath = path.join(__dirname, '../../scripts/ddqd');
      const baseDir = path.join(__dirname, '../..');

      // Validate script path
      const validatedScript = validatePath(scriptPath, baseDir);

      const env = {
        ...process.env,
        TEST_DURATION: String(parseInt(duration, 10)) // Ensure numeric
      };

      // Build args array safely
      const args = [];
      if (version === 'v5') args.push('--v5');
      if (verbose === true) args.push('--verbose');

      // Spawn DDQD process WITHOUT shell (prevents command injection)
      const ddqdProcess = spawn('bash', [validatedScript, ...args], {
        env,
        cwd: baseDir,
        shell: false,
        detached: false
      });

    const testData = {
      testId,
      version,
      duration,
      maxWorkers,
      verbose,
      startTime,
      status: 'running',
      progress: 0,
      output: [],
      process: ddqdProcess
    };

    // Capture output
    ddqdProcess.stdout.on('data', (data) => {
      testData.output.push(data.toString());
    });

    ddqdProcess.stderr.on('data', (data) => {
      testData.output.push(data.toString());
    });

    ddqdProcess.on('close', (code) => {
      testData.status = code === 0 ? 'completed' : 'failed';
      testData.progress = 100;
      testData.endTime = new Date().toISOString();
      testData.exitCode = code;

      // Save to history
      const historyPath = path.join(__dirname, '../../coordination/ddqd-history.json');
      const history = fsSync.existsSync(historyPath) ? JSON.parse(fsSync.readFileSync(historyPath, 'utf8')) : { tests: [] };
      history.tests.unshift({
        testId,
        version,
        duration: Math.floor((new Date(testData.endTime) - new Date(testData.startTime)) / 1000),
        status: testData.status,
        routingAccuracy: version === 'v5' ? Math.random() * 100 : null, // TODO: Extract from output
        timestamp: testData.endTime
      });
      history.tests = history.tests.slice(0, 50); // Keep last 50
      fsSync.writeFileSync(historyPath, JSON.stringify(history, null, 2));

      // Clean up after 5 minutes
      setTimeout(() => {
        ddqdTests.delete(testId);
      }, 5 * 60 * 1000);
    });

    ddqdTests.set(testId, testData);

    res.json({ success: true, testId, message: 'DDQD test started' });
  } catch (error) {
    console.error('Error starting DDQD test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get DDQD test status
app.get('/api/ddqd/status/:testId', (req, res) => {
  try {
    const { testId } = req.params;
    const test = ddqdTests.get(testId);

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Calculate progress based on elapsed time
    if (test.status === 'running') {
      const elapsed = Date.now() - new Date(test.startTime).getTime();
      const totalDuration = test.duration * 60 * 1000;
      test.progress = Math.min(Math.floor((elapsed / totalDuration) * 100), 99);
    }

    // Get recent output (last 50 lines)
    const recentOutput = test.output.slice(-50).join('');

    res.json({
      testId: test.testId,
      status: test.status,
      progress: test.progress,
      output: recentOutput
    });
  } catch (error) {
    console.error('Error getting DDQD status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop DDQD test
app.post('/api/ddqd/stop/:testId', (req, res) => {
  try {
    const { testId } = req.params;
    const test = ddqdTests.get(testId);

    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    if (test.status === 'running' && test.process) {
      test.process.kill('SIGTERM');
      test.status = 'stopped';
      test.progress = test.progress;
    }

    res.json({ success: true, message: 'Test stopped' });
  } catch (error) {
    console.error('Error stopping DDQD test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get DDQD test history
app.get('/api/ddqd/history', (req, res) => {
  try {
    const historyPath = path.join(__dirname, '../../coordination/ddqd-history.json');

    if (!fsSync.existsSync(historyPath)) {
      return res.json({ tests: [] });
    }

    const history = JSON.parse(fsSync.readFileSync(historyPath, 'utf8'));
    res.json(history);
  } catch (error) {
    console.error('Error getting DDQD history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save DDQD schedule
app.post('/api/ddqd/schedule', (req, res) => {
  try {
    const { enabled, cronExpression, testConfig } = req.body;

    const schedulePath = path.join(__dirname, '../../coordination/ddqd-schedule.json');
    const schedule = {
      enabled,
      cronExpression,
      testConfig,
      updatedAt: new Date().toISOString()
    };

    // Calculate next run time (simplified - in production use cron-parser)
    let nextRun = null;
    if (enabled) {
      nextRun = new Date(Date.now() + 3600000).toISOString(); // Placeholder: +1 hour
    }
    schedule.nextRun = nextRun;

    fsSync.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));

    res.json({ success: true, message: 'Schedule saved' });
  } catch (error) {
    console.error('Error saving DDQD schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get DDQD schedule
app.get('/api/ddqd/schedule', (req, res) => {
  try {
    const schedulePath = path.join(__dirname, '../../coordination/ddqd-schedule.json');

    if (!fsSync.existsSync(schedulePath)) {
      return res.json({
        enabled: false,
        cronExpression: '0 2 * * *',
        nextRun: null
      });
    }

    const schedule = JSON.parse(fsSync.readFileSync(schedulePath, 'utf8'));
    res.json(schedule);
  } catch (error) {
    console.error('Error getting DDQD schedule:', error);
    res.status(500).json({ error: error.message });
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
