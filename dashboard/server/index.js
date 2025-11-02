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
  lastUpdate: null
};

/**
 * Read and parse JSON file safely
 */
async function readJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Load all coordination data
 */
async function loadCoordinationData() {
  const data = {
    workerPool: await readJSON(FILES.workerPool),
    tokenBudget: await readJSON(FILES.tokenBudget),
    taskQueue: await readJSON(FILES.taskQueue),
    handoffs: await readJSON(FILES.handoffs),
    status: await readJSON(FILES.status),
    lastUpdate: new Date().toISOString()
  };

  cache = data;
  return data;
}

/**
 * Calculate dashboard metrics from coordination data
 */
function calculateMetrics(data) {
  const { workerPool, tokenBudget, taskQueue } = data;

  if (!workerPool || !tokenBudget || !taskQueue) {
    return null;
  }

  // Worker metrics
  const activeWorkers = workerPool.active_workers?.length || 0;
  const completedWorkers = workerPool.completed_workers?.length || 0;
  const failedWorkers = workerPool.failed_workers?.length || 0;
  const totalWorkers = activeWorkers + completedWorkers + failedWorkers;
  const successRate = totalWorkers > 0
    ? ((completedWorkers / totalWorkers) * 100).toFixed(1)
    : 0;

  // Token metrics
  const totalBudget = tokenBudget.total_budget || 200000;
  const mastersUsed = Object.values(tokenBudget.masters || {})
    .reduce((sum, m) => sum + (m.used || 0), 0);
  const workersAllocated = tokenBudget.worker_pool?.allocated_to_workers || 0;
  const totalUsed = mastersUsed + workersAllocated;
  const availableBudget = totalBudget - totalUsed;
  const usagePercentage = ((totalUsed / totalBudget) * 100).toFixed(1);

  // Task metrics
  const tasks = taskQueue.tasks || [];
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;

  // Master agent status
  const masters = {
    coordinator: {
      allocated: tokenBudget.masters?.coordinator?.allocated || 0,
      used: tokenBudget.masters?.coordinator?.used || 0,
      workerPool: tokenBudget.masters?.coordinator?.worker_pool || 0
    },
    security: {
      allocated: tokenBudget.masters?.security?.allocated || 0,
      used: tokenBudget.masters?.security?.used || 0,
      workerPool: tokenBudget.masters?.security?.worker_pool || 0
    },
    development: {
      allocated: tokenBudget.masters?.development?.allocated || 0,
      used: tokenBudget.masters?.development?.used || 0,
      workerPool: tokenBudget.masters?.development?.worker_pool || 0
    },
    inventory: {
      allocated: tokenBudget.masters?.inventory?.allocated || 0,
      used: tokenBudget.masters?.inventory?.used || 0,
      workerPool: tokenBudget.masters?.inventory?.worker_pool || 0
    }
  };

  return {
    workers: {
      active: activeWorkers,
      completed: completedWorkers,
      failed: failedWorkers,
      total: totalWorkers,
      successRate: parseFloat(successRate),
      avgDuration: workerPool.stats?.avg_duration_minutes || 0,
      avgTokens: workerPool.stats?.avg_tokens_used || 0
    },
    tokens: {
      total: totalBudget,
      used: totalUsed,
      available: availableBudget,
      usagePercentage: parseFloat(usagePercentage),
      mastersUsed,
      workersAllocated,
      emergencyReserve: tokenBudget.emergency_reserve?.total || 0
    },
    tasks: {
      pending: pendingTasks,
      inProgress: inProgressTasks,
      completed: completedTasks,
      total: totalTasks
    },
    masters,
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
 * Get current system metrics
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const data = await loadCoordinationData();
    const metrics = calculateMetrics(data);

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
    const workerPool = await readJSON(FILES.workerPool);
    if (!workerPool) {
      return res.status(500).json({ error: 'Failed to read worker pool' });
    }
    res.json(workerPool);
  } catch (error) {
    console.error('Error reading worker pool:', error);
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
 * GET /api/events
 * Get recent dashboard events
 */
app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const fsSync = require('fs');

    if (!fsSync.existsSync(FILES.dashboardEvents)) {
      return res.json({ events: [] });
    }

    const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);

    // Get last N events
    const events = lines
      .slice(-limit)
      .map(line => JSON.parse(line))
      .reverse(); // Most recent first

    res.json({ events, total: lines.length });
  } catch (error) {
    console.error('Error reading dashboard events:', error);
    res.status(500).json({ error: 'Internal server error' });
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

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  clients.add(ws);

  // Send initial data
  loadCoordinationData()
    .then(data => {
      const metrics = calculateMetrics(data);
      ws.send(JSON.stringify({ type: 'initial', data: metrics }));
    })
    .catch(error => {
      console.error('Error sending initial data:', error);
    });

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

// ============================================================================
// File Watcher for Real-time Updates
// ============================================================================

// Watch coordination JSON files (excluding events file)
const coordFiles = Object.values(FILES).filter(f => !f.endsWith('.jsonl'));
const watcher = chokidar.watch(coordFiles, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100
  }
});

watcher.on('change', async (filePath) => {
  console.log(`File changed: ${path.basename(filePath)}`);

  try {
    const data = await loadCoordinationData();
    broadcastUpdate(data);
  } catch (error) {
    console.error('Error processing file change:', error);
  }
});

// ============================================================================
// Dashboard Events Stream Watcher
// ============================================================================

/**
 * Broadcast event to all connected WebSocket clients
 */
function broadcastEvent(event) {
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
        const lastEvent = JSON.parse(lines[lines.length - 1]);
        console.log(`Dashboard event: ${lastEvent.type}`);
        broadcastEvent(lastEvent);
      }
    }
  } catch (error) {
    console.error('Error processing dashboard event:', error);
  }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', () => {
  console.log('\nShutting down dashboard server...');
  watcher.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down dashboard server...');
  watcher.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
