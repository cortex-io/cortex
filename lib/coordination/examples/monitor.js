#!/usr/bin/env node

/**
 * Example: Real-time Monitoring Dashboard
 * Monitor the coordination daemon with live updates
 */

const http = require('http');

const DAEMON_URL = process.env.DAEMON_URL || 'http://localhost:9500';
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || '2000', 10);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatNumber(num) {
  return num.toLocaleString();
}

function getStatusColor(status) {
  const statusMap = {
    idle: colors.green,
    busy: colors.yellow,
    offline: colors.red,
    error: colors.red
  };
  return statusMap[status] || colors.reset;
}

function drawProgressBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

async function displayDashboard() {
  try {
    const [metrics, state] = await Promise.all([
      fetchJson(`${DAEMON_URL}/api/metrics`),
      fetchJson(`${DAEMON_URL}/api/state`)
    ]);

    // Clear screen
    console.clear();

    // Header
    console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║          CORTEX COORDINATION DAEMON MONITOR                    ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    // System Status
    console.log(`${colors.bright}${colors.blue}SYSTEM STATUS${colors.reset}`);
    console.log(`  Uptime: ${formatUptime(metrics.daemon.uptime)}`);
    console.log(`  URL: ${DAEMON_URL}`);
    console.log(`  Last updated: ${new Date().toLocaleTimeString()}\n`);

    // Performance Metrics
    console.log(`${colors.bright}${colors.blue}PERFORMANCE${colors.reset}`);
    console.log(`  Operations/sec:     ${colors.green}${formatNumber(metrics.daemon.operationsPerSecond)}${colors.reset}`);
    console.log(`  Average Latency:    ${colors.green}${metrics.daemon.averageLatency.toFixed(2)}ms${colors.reset}`);
    console.log(`  Total Operations:   ${formatNumber(metrics.daemon.operations)}\n`);

    // Workers
    console.log(`${colors.bright}${colors.blue}WORKERS (${state.workers.length})${colors.reset}`);

    const workersByStatus = state.workers.reduce((acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`  Idle:    ${colors.green}${workersByStatus.idle || 0}${colors.reset}`);
    console.log(`  Busy:    ${colors.yellow}${workersByStatus.busy || 0}${colors.reset}`);
    console.log(`  Offline: ${colors.red}${workersByStatus.offline || 0}${colors.reset}\n`);

    // Top 5 workers by task count
    if (state.workers.length > 0) {
      const topWorkers = state.workers
        .sort((a, b) => b.completedTasks - a.completedTasks)
        .slice(0, 5);

      console.log(`  ${colors.bright}Top Workers:${colors.reset}`);
      topWorkers.forEach((worker, i) => {
        const status = getStatusColor(worker.status);
        console.log(`    ${i + 1}. ${worker.id.padEnd(20)} ${status}${worker.status.padEnd(8)}${colors.reset} ` +
                    `${worker.completedTasks} completed, ${worker.activeTasks} active`);
      });
      console.log();
    }

    // Tasks
    console.log(`${colors.bright}${colors.blue}TASKS${colors.reset}`);
    console.log(`  Active:     ${colors.yellow}${metrics.daemon.activeTasks}${colors.reset}`);
    console.log(`  Completed:  ${colors.green}${formatNumber(metrics.daemon.totalTasksProcessed)}${colors.reset}`);
    console.log(`  Failed:     ${colors.red}${formatNumber(metrics.daemon.totalTasksFailed)}${colors.reset}\n`);

    // Recent tasks
    if (state.tasks.length > 0) {
      const recentTasks = state.tasks
        .sort((a, b) => (b.assignedAt || 0) - (a.assignedAt || 0))
        .slice(0, 5);

      console.log(`  ${colors.bright}Recent Tasks:${colors.reset}`);
      recentTasks.forEach((task, i) => {
        const statusColor = task.status === 'completed' ? colors.green :
                           task.status === 'failed' ? colors.red :
                           task.status === 'in_progress' ? colors.yellow :
                           colors.cyan;

        console.log(`    ${i + 1}. ${task.id.padEnd(20)} ${statusColor}${task.status.padEnd(12)}${colors.reset} ` +
                    `${task.assignedTo || 'unassigned'}`);
      });
      console.log();
    }

    // State Store Metrics
    console.log(`${colors.bright}${colors.blue}STATE STORE${colors.reset}`);
    console.log(`  Collections:`);
    console.log(`    Workers:     ${metrics.stateStore.collections.workers}`);
    console.log(`    Tasks:       ${metrics.stateStore.collections.tasks}`);
    console.log(`    Assignments: ${metrics.stateStore.collections.assignments}`);
    console.log(`  Operations:    ${formatNumber(metrics.stateStore.operations)}`);
    console.log(`  Transactions:  ${formatNumber(metrics.stateStore.transactions)}\n`);

    // Message Bus Metrics
    console.log(`${colors.bright}${colors.blue}MESSAGE BUS${colors.reset}`);
    console.log(`  Sent:       ${formatNumber(metrics.messageBus.messagesSent)}`);
    console.log(`  Delivered:  ${formatNumber(metrics.messageBus.messagesDelivered)}`);
    console.log(`  Dropped:    ${formatNumber(metrics.messageBus.messagesDropped)}`);
    console.log(`  Queue:      ${metrics.messageBus.queueDepth}`);

    const queueStats = metrics.messageBus.queue;
    if (queueStats.total > 0) {
      console.log(`  Priority Queue:`);
      console.log(`    Critical: ${queueStats.critical}`);
      console.log(`    High:     ${queueStats.high}`);
      console.log(`    Normal:   ${queueStats.normal}`);
      console.log(`    Low:      ${queueStats.low}`);
    }
    console.log();

    // WebSocket Connections
    console.log(`${colors.bright}${colors.blue}WEBSOCKETS${colors.reset}`);
    console.log(`  Active Connections: ${metrics.websockets.connections}\n`);

    // Health indicators
    console.log(`${colors.bright}${colors.blue}HEALTH INDICATORS${colors.reset}`);

    const opsTargetMet = metrics.daemon.operationsPerSecond >= 1000;
    const latencyTargetMet = metrics.daemon.averageLatency < 100;

    console.log(`  ${opsTargetMet ? colors.green + '✓' : colors.red + '✗'} ` +
                `Operations/sec >= 1,000 ${colors.reset}` +
                `(${metrics.daemon.operationsPerSecond})`);

    console.log(`  ${latencyTargetMet ? colors.green + '✓' : colors.red + '✗'} ` +
                `Latency < 100ms ${colors.reset}` +
                `(${metrics.daemon.averageLatency.toFixed(2)}ms)`);

    const queueHealthy = metrics.messageBus.queueDepth < 1000;
    console.log(`  ${queueHealthy ? colors.green + '✓' : colors.yellow + '⚠'} ` +
                `Queue depth < 1,000 ${colors.reset}` +
                `(${metrics.messageBus.queueDepth})`);

    console.log();

    // Footer
    console.log(`${colors.cyan}Press Ctrl+C to exit${colors.reset}`);

  } catch (error) {
    console.error(`${colors.red}Error fetching metrics:${colors.reset}`, error.message);
    console.log(`${colors.yellow}Make sure the daemon is running at ${DAEMON_URL}${colors.reset}`);
  }
}

async function main() {
  console.log('Starting Coordination Daemon Monitor...\n');
  console.log(`Connecting to: ${DAEMON_URL}`);
  console.log(`Refresh interval: ${REFRESH_INTERVAL}ms\n`);

  // Initial display
  await displayDashboard();

  // Refresh periodically
  setInterval(displayDashboard, REFRESH_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nMonitor stopped');
    process.exit(0);
  });
}

main().catch(console.error);
