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

  const data = {
    workerPool: await readJSON(FILES.workerPool),
    tokenBudget: await readJSON(FILES.tokenBudget),
    taskQueue: await readJSON(FILES.taskQueue),
    handoffs: await readJSON(FILES.handoffs),
    status: await readJSON(FILES.status),
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
function calculateSuccessRate(workerPool, period = 'all_time') {
  const now = Date.now();
  const completed = workerPool.completed_workers || [];
  const failed = workerPool.failed_workers || [];
  const active = workerPool.active_workers || [];

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
    worker.execution?.killed_by === 'zombie-killer-daemon'
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
    // Read live worker specs from active directory
    const workerSpecsDir = path.join(COORD_DIR, 'worker-specs/active');
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

  try {
    const files = await fs.readdir(specsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(specsDir, file), 'utf-8');
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
    console.error('Error reading worker specs directory:', err);
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

    let dashboardEvents = [];

    // Read dashboard-events.jsonl
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      dashboardEvents = lines.map(line => {
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
      dashboardEvents = eventBuffer.slice();
    }

    // Generate task events from current task queue
    const taskQueue = await readJSON(FILES.taskQueue);
    const taskEvents = [];

    if (taskQueue && taskQueue.tasks) {
      // Create events for recent task status changes
      for (const task of taskQueue.tasks) {
        // Add event for task creation
        if (task.created_at) {
          taskEvents.push({
            id: `task-created-${task.id}`,
            type: 'task_created',
            timestamp: task.created_at,
            data: {
              task_id: task.id,
              task_title: task.title,
              task_type: task.type,
              priority: task.priority
            },
            message: `Task Created: '${task.id}: ${task.title}'`
          });
        }

        // Add event for task assignment
        if (task.assigned_at) {
          taskEvents.push({
            id: `task-assigned-${task.id}`,
            type: 'task_assigned',
            timestamp: task.assigned_at,
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to,
              priority: task.priority
            },
            message: `Task Assigned: '${task.id}' → ${task.assigned_to}`
          });
        }

        // Add event for task completion
        if (task.status === 'completed' && task.completed_at) {
          taskEvents.push({
            id: `task-completed-${task.id}`,
            type: 'task_completed',
            timestamp: task.completed_at,
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to
            },
            message: `Task Completed: '${task.id}: ${task.title}' ✓`
          });
        }

        // Add event for task failure
        if (task.status === 'failed' && task.failed_at) {
          taskEvents.push({
            id: `task-failed-${task.id}`,
            type: 'task_failed',
            timestamp: task.failed_at,
            data: {
              task_id: task.id,
              task_title: task.title,
              assigned_to: task.assigned_to
            },
            message: `Task Failed: '${task.id}: ${task.title}' ✗`
          });
        }
      }
    }

    // Read git operations and convert to events
    let gitEvents = [];
    const gitOpsPath = path.join(COORD_DIR, 'git-operations.jsonl');
    if (fsSync.existsSync(gitOpsPath)) {
      const gitContent = fsSync.readFileSync(gitOpsPath, 'utf-8');
      const gitOps = gitContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      // Convert git operations to events
      gitEvents = gitOps.map(op => {
        const isSuccess = op.status === 'success';
        const commitHash = op.details && op.details.includes('Commit:') ?
          op.details.split('Commit:')[1].trim().split(' ')[0] : '';

        return {
          id: `git-${op.worker_id}-${op.timestamp}`,
          type: isSuccess ? 'git_push_success' : 'git_push_failed',
          timestamp: op.timestamp,
          data: {
            worker_id: op.worker_id,
            operation: op.operation,
            commit_hash: commitHash,
            details: op.details
          },
          message: isSuccess ?
            `Git Push: ${op.worker_id}${commitHash ? ` (${commitHash})` : ''} ✓` :
            `Git Push Failed: ${op.worker_id} ✗`
        };
      });
    }

    // Merge all events and sort by timestamp (most recent first)
    const allEvents = [...dashboardEvents, ...taskEvents, ...gitEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({ events: allEvents, total: allEvents.length });
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
