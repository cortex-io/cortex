#!/usr/bin/env node

/**
 * Cortex TUI Dashboard
 * Real-time ASCII dashboard showing system state
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Configuration
const CORTEX_ROOT = path.resolve(__dirname, '..');
const REFRESH_INTERVAL = 2000; // 2 seconds

// File paths
const WORKER_POOL_FILE = path.join(CORTEX_ROOT, 'coordination/worker-pool.json');
const TOKEN_BUDGET_FILE = path.join(CORTEX_ROOT, 'coordination/token-budget.json');
const TASK_QUEUE_FILE = path.join(CORTEX_ROOT, 'coordination/task-queue.json');
const EVENTS_FILE = path.join(CORTEX_ROOT, 'coordination/dashboard-events.jsonl');

class CortexDashboard {
  constructor() {
    this.lastEventPosition = 0;
    this.running = false;
  }

  // Read JSON file safely
  readJSON(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Silently return default on error
    }
    return defaultValue;
  }

  // Read last N lines from JSONL file
  readRecentEvents(count = 5) {
    try {
      if (!fs.existsSync(EVENTS_FILE)) {
        return [];
      }

      const content = fs.readFileSync(EVENTS_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      // Get last N lines
      const recentLines = lines.slice(-count);

      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(event => event !== null);
    } catch (error) {
      return [];
    }
  }

  // Clear screen
  clearScreen() {
    process.stdout.write('\x1bc'); // Clear screen and move cursor to home
  }

  // Draw box
  drawBox(x, y, width, height, title = '') {
    const top = '┌' + '─'.repeat(width - 2) + '┐';
    const middle = '│' + ' '.repeat(width - 2) + '│';
    const bottom = '└' + '─'.repeat(width - 2) + '┘';

    // Move cursor and draw top
    process.stdout.write(`\x1b[${y};${x}H${top}`);

    // Draw title if provided
    if (title) {
      const titleText = ` ${title} `;
      const titlePos = Math.floor((width - titleText.length) / 2);
      process.stdout.write(`\x1b[${y};${x + titlePos}H${colors.bright}${titleText}${colors.reset}`);
    }

    // Draw sides
    for (let i = 1; i < height - 1; i++) {
      process.stdout.write(`\x1b[${y + i};${x}H${middle}`);
    }

    // Draw bottom
    process.stdout.write(`\x1b[${y + height - 1};${x}H${bottom}`);
  }

  // Write text at position
  writeAt(x, y, text) {
    process.stdout.write(`\x1b[${y};${x}H${text}`);
  }

  // Format number with commas
  formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Get status color
  getStatusColor(status) {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'completed' || statusLower === 'success') return colors.green;
    if (statusLower === 'failed' || statusLower === 'error') return colors.red;
    if (statusLower === 'running' || statusLower === 'active') return colors.cyan;
    if (statusLower === 'pending') return colors.yellow;
    return colors.white;
  }

  // Render worker pool section
  renderWorkerPool(startY) {
    const workerPool = this.readJSON(WORKER_POOL_FILE, { active_workers: [] });
    const workers = workerPool.active_workers || [];

    this.writeAt(4, startY, `${colors.bright}Active Workers:${colors.reset} ${colors.cyan}${workers.length}${colors.reset}`);

    // Show worker summary by status
    const statusCounts = workers.reduce((acc, w) => {
      const status = w.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    let yOffset = startY + 1;
    Object.entries(statusCounts).forEach(([status, count]) => {
      const color = this.getStatusColor(status);
      this.writeAt(6, yOffset++, `${color}●${colors.reset} ${status}: ${count}`);
    });

    // Show recent workers
    if (workers.length > 0) {
      yOffset++;
      this.writeAt(4, yOffset++, `${colors.dim}Recent Workers:${colors.reset}`);

      const recentWorkers = workers.slice(-3);
      recentWorkers.forEach(worker => {
        const statusColor = this.getStatusColor(worker.status);
        const workerType = (worker.worker_type || 'unknown').substring(0, 15);
        this.writeAt(6, yOffset++,
          `${statusColor}●${colors.reset} ${worker.worker_id || 'unknown'} (${workerType})`
        );
      });
    }

    return yOffset + 1;
  }

  // Render token budget section
  renderTokenBudget(startY) {
    const tokenBudget = this.readJSON(TOKEN_BUDGET_FILE, {});

    const total = tokenBudget.total || 0;
    const allocated = tokenBudget.allocated || 0;
    const available = tokenBudget.available || total - allocated;
    const in_use = tokenBudget.in_use || 0;

    this.writeAt(4, startY, `${colors.bright}Token Budget:${colors.reset}`);

    const usagePercent = total > 0 ? Math.round((allocated / total) * 100) : 0;
    const barWidth = 30;
    const filledWidth = Math.round((usagePercent / 100) * barWidth);
    const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

    let barColor = colors.green;
    if (usagePercent > 80) barColor = colors.red;
    else if (usagePercent > 60) barColor = colors.yellow;

    this.writeAt(6, startY + 1, `Total:     ${colors.cyan}${this.formatNumber(total)}${colors.reset}`);
    this.writeAt(6, startY + 2, `Allocated: ${colors.yellow}${this.formatNumber(allocated)}${colors.reset}`);
    this.writeAt(6, startY + 3, `In Use:    ${colors.magenta}${this.formatNumber(in_use)}${colors.reset}`);
    this.writeAt(6, startY + 4, `Available: ${colors.green}${this.formatNumber(available)}${colors.reset}`);
    this.writeAt(6, startY + 5, `${barColor}${bar}${colors.reset} ${usagePercent}%`);

    return startY + 7;
  }

  // Render task queue section
  renderTaskQueue(startY) {
    const taskQueue = this.readJSON(TASK_QUEUE_FILE, { tasks: [] });
    const tasks = taskQueue.tasks || [];

    this.writeAt(4, startY, `${colors.bright}Task Queue:${colors.reset} ${colors.cyan}${tasks.length}${colors.reset}`);

    // Show task summary by status
    const statusCounts = tasks.reduce((acc, t) => {
      const status = t.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    let yOffset = startY + 1;
    Object.entries(statusCounts).forEach(([status, count]) => {
      const color = this.getStatusColor(status);
      this.writeAt(6, yOffset++, `${color}●${colors.reset} ${status}: ${count}`);
    });

    return yOffset + 1;
  }

  // Render masters section
  renderMasters(startX, startY) {
    const masters = [
      { name: 'Coordinator', status: 'active', color: colors.cyan },
      { name: 'Security', status: 'active', color: colors.red },
      { name: 'Development', status: 'active', color: colors.green },
      { name: 'Inventory', status: 'active', color: colors.yellow },
      { name: 'CI/CD', status: 'active', color: colors.magenta },
    ];

    this.writeAt(startX + 2, startY, `${colors.bright}Master Agents${colors.reset}`);

    let yOffset = startY + 1;
    masters.forEach(master => {
      const statusIcon = master.status === 'active' ? '●' : '○';
      this.writeAt(startX + 2, yOffset++,
        `${master.color}${statusIcon}${colors.reset} ${master.name}`
      );
    });

    return yOffset + 1;
  }

  // Render recent events section
  renderRecentEvents(startY, maxHeight) {
    const events = this.readRecentEvents(5);

    this.writeAt(4, startY, `${colors.bright}Recent Events:${colors.reset}`);

    let yOffset = startY + 1;
    const maxEvents = Math.min(events.length, maxHeight - 2);

    for (let i = events.length - maxEvents; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;

      const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '---';
      const type = event.type || 'unknown';
      const typeColor = type.includes('error') || type.includes('failed') ? colors.red :
                       type.includes('success') || type.includes('completed') ? colors.green :
                       colors.cyan;

      const message = `${colors.dim}[${timestamp}]${colors.reset} ${typeColor}${type}${colors.reset}`;
      this.writeAt(6, yOffset++, message.substring(0, 70));
    }

    return yOffset;
  }

  // Render header
  renderHeader() {
    const title = '╔═══════════════════════════════════════════════════════════════════════════════╗';
    const titleText = '                          CORTEX SYSTEM DASHBOARD                              ';
    const bottom = '╚═══════════════════════════════════════════════════════════════════════════════╝';

    this.writeAt(1, 1, `${colors.bright}${colors.blue}${title}${colors.reset}`);
    this.writeAt(1, 2, `${colors.bright}${colors.blue}║${colors.cyan}${titleText}${colors.blue}║${colors.reset}`);
    this.writeAt(1, 3, `${colors.bright}${colors.blue}${bottom}${colors.reset}`);

    const now = new Date().toLocaleString();
    this.writeAt(60, 2, `${colors.dim}${now}${colors.reset}`);
  }

  // Render footer
  renderFooter() {
    const rows = process.stdout.rows || 24;
    this.writeAt(1, rows - 1,
      `${colors.dim}Press ${colors.bright}Ctrl+C${colors.reset}${colors.dim} to exit | Refreshing every ${REFRESH_INTERVAL/1000}s${colors.reset}`
    );
  }

  // Main render method
  render() {
    this.clearScreen();

    // Hide cursor
    process.stdout.write('\x1b[?25l');

    // Render header
    this.renderHeader();

    // Left column (workers, tokens, tasks)
    let leftY = 5;
    this.drawBox(2, leftY, 42, 12, 'Workers');
    leftY = this.renderWorkerPool(leftY + 1);

    leftY += 2;
    this.drawBox(2, leftY, 42, 10, 'Token Budget');
    leftY = this.renderTokenBudget(leftY + 1);

    leftY += 2;
    this.drawBox(2, leftY, 42, 8, 'Task Queue');
    this.renderTaskQueue(leftY + 1);

    // Right column (masters, events)
    let rightY = 5;
    this.drawBox(46, rightY, 36, 10, 'Masters');
    rightY = this.renderMasters(46, rightY + 1);

    rightY += 2;
    this.drawBox(46, rightY, 36, 12, 'Recent Events');
    this.renderRecentEvents(rightY + 1, 10);

    // Render footer
    this.renderFooter();

    // Show cursor again
    process.stdout.write('\x1b[?25h');
  }

  // Start dashboard
  start() {
    this.running = true;

    // Initial render
    this.render();

    // Set up refresh interval
    this.interval = setInterval(() => {
      if (this.running) {
        this.render();
      }
    }, REFRESH_INTERVAL);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      this.stop();
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      if (this.running) {
        this.render();
      }
    });
  }

  // Stop dashboard
  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
    }

    // Clear screen and show cursor
    this.clearScreen();
    process.stdout.write('\x1b[?25h');

    console.log('Dashboard stopped.');
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  const dashboard = new CortexDashboard();
  dashboard.start();
}

module.exports = CortexDashboard;
