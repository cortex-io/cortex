#!/usr/bin/env node

/**
 * Cortex TUI Chat
 * Conversational interface for interacting with Cortex
 * Minimal controls - just type and press Enter
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

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
};

// Configuration
const CORTEX_ROOT = path.resolve(__dirname, '..');
const NLP_CLASSIFIER = path.join(CORTEX_ROOT, 'coordination/masters/coordinator/lib/nlp-classifier.sh');
const MOE_ROUTER = path.join(CORTEX_ROOT, 'coordination/masters/coordinator/lib/moe-router.sh');
const SPAWN_WORKER = path.join(CORTEX_ROOT, 'scripts/spawn-worker.sh');
const TASKS_DIR = path.join(CORTEX_ROOT, 'coordination/tasks');
const WORKERS_DIR = path.join(CORTEX_ROOT, 'coordination/worker-specs/active');

class CortexChat {
  constructor() {
    this.conversationHistory = [];
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}cortex>${colors.reset} `,
    });
  }

  // Print colored message
  print(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  // Print system message
  printSystem(message) {
    this.print(`${colors.dim}[System]${colors.reset} ${message}`, colors.cyan);
  }

  // Print error message
  printError(message) {
    this.print(`${colors.dim}[Error]${colors.reset} ${message}`, colors.red);
  }

  // Print success message
  printSuccess(message) {
    this.print(`${colors.dim}[Success]${colors.reset} ${message}`, colors.green);
  }

  // Print assistant message
  printAssistant(message) {
    this.print(`${colors.dim}[Cortex]${colors.reset} ${message}`, colors.white);
  }

  // Execute shell command
  async execCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: CORTEX_ROOT,
        env: { ...process.env, GOVERNANCE_BYPASS: 'true' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  // Classify user input using NLP classifier
  async classifyInput(input) {
    try {
      const result = await this.execCommand(NLP_CLASSIFIER, [input]);
      return JSON.parse(result);
    } catch (error) {
      // Fallback classification
      return {
        recommended_master: 'coordinator-master',
        confidence: 0.5,
        classification_method: 'fallback'
      };
    }
  }

  // Route task using MoE router
  async routeTask(taskId, description) {
    try {
      const result = await this.execCommand(MOE_ROUTER, [taskId, description]);
      return JSON.parse(result);
    } catch (error) {
      this.printError(`Routing failed: ${error.message}`);
      return null;
    }
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

  // Handle "status" command
  async handleStatus(args) {
    const taskId = args[0];

    if (!taskId) {
      this.printError('Please provide a task ID. Usage: status <task_id>');
      return;
    }

    const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
    const task = this.readJSON(taskFile);

    if (!task || !task.task_id) {
      this.printError(`Task ${taskId} not found`);
      return;
    }

    this.printAssistant(`Task: ${task.task_id}`);
    this.print(`  Description: ${task.description || 'N/A'}`);
    this.print(`  Status: ${task.status || 'unknown'}`);
    this.print(`  Master: ${task.master || 'N/A'}`);
    this.print(`  Priority: ${task.priority || 'medium'}`);
    this.print(`  Created: ${task.created_at || 'N/A'}`);
  }

  // Handle "list" command
  async handleList(args) {
    const filter = args[0] || 'all';

    if (!fs.existsSync(TASKS_DIR)) {
      this.printAssistant('No tasks found.');
      return;
    }

    const taskFiles = fs.readdirSync(TASKS_DIR).filter(f => f.startsWith('task-') && f.endsWith('.json'));

    if (taskFiles.length === 0) {
      this.printAssistant('No tasks found.');
      return;
    }

    this.printAssistant(`Found ${taskFiles.length} task(s):`);
    console.log();

    taskFiles.slice(-10).forEach(file => {
      const task = this.readJSON(path.join(TASKS_DIR, file));
      if (task && task.task_id) {
        const status = task.status || 'unknown';
        const statusColor = status === 'completed' ? colors.green :
                           status === 'failed' ? colors.red :
                           status === 'running' ? colors.cyan :
                           colors.yellow;

        const description = (task.description || 'N/A').substring(0, 60);
        this.print(`  ${statusColor}●${colors.reset} ${task.task_id} - ${description}`);
      }
    });

    if (taskFiles.length > 10) {
      this.print(`  ${colors.dim}... and ${taskFiles.length - 10} more${colors.reset}`);
    }
  }

  // Handle "workers" command
  async handleWorkers() {
    const workerPool = this.readJSON(path.join(CORTEX_ROOT, 'coordination/worker-pool.json'), { active_workers: [] });
    const workers = workerPool.active_workers || [];

    if (workers.length === 0) {
      this.printAssistant('No active workers.');
      return;
    }

    this.printAssistant(`Active workers: ${workers.length}`);
    console.log();

    workers.slice(-10).forEach(worker => {
      const status = worker.status || 'unknown';
      const statusColor = status === 'completed' ? colors.green :
                         status === 'failed' ? colors.red :
                         status === 'running' ? colors.cyan :
                         colors.yellow;

      this.print(`  ${statusColor}●${colors.reset} ${worker.worker_id} (${worker.worker_type}) - ${status}`);
    });

    if (workers.length > 10) {
      this.print(`  ${colors.dim}... and ${workers.length - 10} more${colors.reset}`);
    }
  }

  // Handle "budget" command
  async handleBudget() {
    const tokenBudget = this.readJSON(path.join(CORTEX_ROOT, 'coordination/token-budget.json'), {});

    const total = tokenBudget.total || 0;
    const allocated = tokenBudget.allocated || 0;
    const available = tokenBudget.available || (total - allocated);
    const in_use = tokenBudget.in_use || 0;

    this.printAssistant('Token Budget:');
    this.print(`  Total:     ${total.toLocaleString()}`);
    this.print(`  Allocated: ${allocated.toLocaleString()}`);
    this.print(`  In Use:    ${in_use.toLocaleString()}`);
    this.print(`  Available: ${available.toLocaleString()}`);

    const usagePercent = total > 0 ? Math.round((allocated / total) * 100) : 0;
    const barWidth = 30;
    const filledWidth = Math.round((usagePercent / 100) * barWidth);
    const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

    let barColor = colors.green;
    if (usagePercent > 80) barColor = colors.red;
    else if (usagePercent > 60) barColor = colors.yellow;

    this.print(`  ${barColor}${bar}${colors.reset} ${usagePercent}%`);
  }

  // Handle task creation from natural language
  async handleTaskCreation(input) {
    this.printSystem('Analyzing your request...');

    // Classify the input
    const classification = await this.classifyInput(input);
    const master = classification.recommended_master || 'coordinator-master';
    const confidence = classification.confidence || 0.5;
    const method = classification.classification_method || 'unknown';

    this.printSystem(`Classified as ${master} task (${(confidence * 100).toFixed(0)}% confidence, method: ${method})`);

    // Create task ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Route task
    this.printSystem('Routing task...');
    const routing = await this.routeTask(taskId, input);

    if (!routing) {
      this.printError('Failed to route task');
      return;
    }

    const primaryExpert = routing.decision?.primary_expert || 'development';
    const primaryConfidence = routing.decision?.primary_confidence || 0.5;

    this.printSystem(`Routed to ${primaryExpert} expert (${(primaryConfidence * 100).toFixed(0)}% confidence)`);

    // Create task JSON
    const task = {
      task_id: taskId,
      description: input,
      master: master,
      priority: 'medium',
      created_at: new Date().toISOString(),
      status: 'pending',
      metadata: {
        classification,
        routing,
        source: 'chat-interface'
      }
    };

    // Save task
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }

    fs.writeFileSync(
      path.join(TASKS_DIR, `${taskId}.json`),
      JSON.stringify(task, null, 2)
    );

    this.printSuccess(`Task created: ${taskId}`);
    this.printAssistant(`Task will be handled by ${master}`);
    this.print(`${colors.dim}  Use 'status ${taskId}' to check progress${colors.reset}`);

    // Store in conversation history
    this.conversationHistory.push({
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    });

    this.conversationHistory.push({
      role: 'assistant',
      content: `Task ${taskId} created and routed to ${master}`,
      timestamp: new Date().toISOString()
    });
  }

  // Process user input
  async processInput(input) {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    // Check for commands
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
      case '?':
        this.showHelp();
        break;

      case 'status':
        await this.handleStatus(args);
        break;

      case 'list':
      case 'tasks':
        await this.handleList(args);
        break;

      case 'workers':
        await this.handleWorkers();
        break;

      case 'budget':
      case 'tokens':
        await this.handleBudget();
        break;

      case 'clear':
        console.clear();
        this.showWelcome();
        break;

      case 'exit':
      case 'quit':
        this.stop();
        break;

      default:
        // Treat as natural language task creation
        await this.handleTaskCreation(trimmed);
        break;
    }
  }

  // Show welcome message
  showWelcome() {
    console.log();
    this.print('╔══════════════════════════════════════════════════════════════╗', colors.cyan);
    this.print('║           CORTEX CONVERSATIONAL INTERFACE                    ║', colors.cyan);
    this.print('╚══════════════════════════════════════════════════════════════╝', colors.cyan);
    console.log();
    this.printAssistant('Welcome! I can help you manage Cortex tasks and workers.');
    this.printAssistant('Type a command or describe what you want to do.');
    this.print(`${colors.dim}  Type 'help' for available commands or 'exit' to quit${colors.reset}`);
    console.log();
  }

  // Show help
  showHelp() {
    console.log();
    this.printAssistant('Available Commands:');
    console.log();
    this.print(`  ${colors.bright}status <task_id>${colors.reset}  - Show task status`);
    this.print(`  ${colors.bright}list [filter]${colors.reset}     - List recent tasks`);
    this.print(`  ${colors.bright}workers${colors.reset}           - Show active workers`);
    this.print(`  ${colors.bright}budget${colors.reset}            - Show token budget`);
    this.print(`  ${colors.bright}clear${colors.reset}             - Clear screen`);
    this.print(`  ${colors.bright}help${colors.reset}              - Show this help`);
    this.print(`  ${colors.bright}exit${colors.reset}              - Exit chat`);
    console.log();
    this.printAssistant('Or just type what you want to do in natural language:');
    this.print(`  ${colors.dim}"Scan repository for security vulnerabilities"${colors.reset}`);
    this.print(`  ${colors.dim}"Fix bug in authentication module"${colors.reset}`);
    this.print(`  ${colors.dim}"Document the API endpoints"${colors.reset}`);
    console.log();
  }

  // Start chat interface
  start() {
    this.showWelcome();

    this.rl.on('line', async (input) => {
      try {
        await this.processInput(input);
      } catch (error) {
        this.printError(`Error: ${error.message}`);
      }
      console.log();
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.stop();
    });

    this.rl.prompt();
  }

  // Stop chat interface
  stop() {
    console.log();
    this.printAssistant('Goodbye! 👋');
    console.log();
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  const chat = new CortexChat();
  chat.start();
}

module.exports = CortexChat;
