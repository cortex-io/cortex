#!/usr/bin/env node
/**
 * Token Usage Metrics Exporter - Export token usage metrics to Prometheus
 *
 * Exports metrics:
 * - cortex_tokens_used_total{master, task_id, task_type}
 * - cortex_tokens_budget_total{master}
 * - cortex_token_budget_utilization{master}
 * - cortex_tokens_remaining{master}
 * - cortex_token_cost_usd{master, period}
 *
 * Features:
 * - Prometheus-compatible metrics format
 * - HTTP endpoint for scraping
 * - Push gateway support
 * - Master and task attribution
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

class TokenUsageExporter {
  constructor(config = {}) {
    this.port = config.port || 9090;
    this.coordinationPath = config.coordinationPath || '/Users/ryandahlberg/Projects/cortex/coordination';
    this.pushGatewayUrl = config.pushGatewayUrl || null;
    this.pushInterval = config.pushInterval || 15000; // 15 seconds
    this.metrics = new Map();
    this.masterBudgets = config.masterBudgets || {
      coordinator: 50000,
      development: 200000,
      security: 100000,
      inventory: 50000,
      cicd: 75000
    };
  }

  /**
   * Read token usage from coordination files
   */
  async readTokenUsage() {
    const usage = {
      byMaster: {},
      byTask: {},
      total: 0
    };

    try {
      // Read dashboard events for token usage
      const eventsPath = path.join(this.coordinationPath, 'dashboard-events.jsonl');
      if (fs.existsSync(eventsPath)) {
        const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');

        lines.forEach(line => {
          try {
            const event = JSON.parse(line);

            // Extract token usage from events
            if (event.tokens_used !== undefined) {
              const master = event.master || event.component || 'unknown';
              const taskId = event.task_id || 'unknown';
              const taskType = event.task_type || event.type || 'unknown';
              const tokens = parseInt(event.tokens_used, 10);

              if (!isNaN(tokens)) {
                // Aggregate by master
                if (!usage.byMaster[master]) {
                  usage.byMaster[master] = 0;
                }
                usage.byMaster[master] += tokens;

                // Track by task
                usage.byTask[taskId] = {
                  master,
                  taskType,
                  tokens
                };

                usage.total += tokens;
              }
            }
          } catch (error) {
            // Skip invalid lines
          }
        });
      }

      // Read master state files for token usage
      const mastersPath = path.join(this.coordinationPath, 'masters');
      if (fs.existsSync(mastersPath)) {
        const masterDirs = fs.readdirSync(mastersPath);

        masterDirs.forEach(masterName => {
          const statePath = path.join(mastersPath, masterName, 'context', 'master-state.json');
          if (fs.existsSync(statePath)) {
            try {
              const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

              if (state.tokens_used !== undefined) {
                const tokens = parseInt(state.tokens_used, 10);
                if (!isNaN(tokens)) {
                  if (!usage.byMaster[masterName]) {
                    usage.byMaster[masterName] = 0;
                  }
                  usage.byMaster[masterName] += tokens;
                  usage.total += tokens;
                }
              }
            } catch (error) {
              // Skip invalid state files
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to read token usage:', error.message);
    }

    return usage;
  }

  /**
   * Calculate metrics
   */
  async calculateMetrics() {
    const usage = await this.readTokenUsage();
    const metrics = [];

    // Total tokens used across all masters
    metrics.push({
      name: 'cortex_tokens_used_total',
      type: 'counter',
      help: 'Total tokens used by Cortex',
      value: usage.total,
      labels: {}
    });

    // Tokens used by master
    Object.entries(usage.byMaster).forEach(([master, tokens]) => {
      metrics.push({
        name: 'cortex_tokens_used_total',
        type: 'counter',
        help: 'Total tokens used by master',
        value: tokens,
        labels: { master }
      });

      // Token budget for master
      const budget = this.masterBudgets[master] || 100000;
      metrics.push({
        name: 'cortex_tokens_budget_total',
        type: 'gauge',
        help: 'Token budget for master',
        value: budget,
        labels: { master }
      });

      // Budget utilization
      const utilization = budget > 0 ? tokens / budget : 0;
      metrics.push({
        name: 'cortex_token_budget_utilization',
        type: 'gauge',
        help: 'Token budget utilization (0-1)',
        value: utilization,
        labels: { master }
      });

      // Tokens remaining
      const remaining = Math.max(0, budget - tokens);
      metrics.push({
        name: 'cortex_tokens_remaining',
        type: 'gauge',
        help: 'Tokens remaining in budget',
        value: remaining,
        labels: { master }
      });
    });

    // Tokens by task
    Object.entries(usage.byTask).forEach(([taskId, task]) => {
      metrics.push({
        name: 'cortex_tokens_used_total',
        type: 'counter',
        help: 'Tokens used by task',
        value: task.tokens,
        labels: {
          master: task.master,
          task_id: taskId,
          task_type: task.taskType
        }
      });
    });

    return metrics;
  }

  /**
   * Format metrics in Prometheus format
   */
  formatPrometheusMetrics(metrics) {
    const lines = [];
    const grouped = new Map();

    // Group metrics by name
    metrics.forEach(metric => {
      if (!grouped.has(metric.name)) {
        grouped.set(metric.name, []);
      }
      grouped.get(metric.name).push(metric);
    });

    // Format each metric group
    grouped.forEach((metricGroup, name) => {
      const first = metricGroup[0];

      // HELP line
      lines.push(`# HELP ${name} ${first.help}`);

      // TYPE line
      lines.push(`# TYPE ${name} ${first.type}`);

      // Metric values
      metricGroup.forEach(metric => {
        const labels = Object.entries(metric.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');

        const labelStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelStr} ${metric.value}`);
      });

      lines.push(''); // Empty line between metric groups
    });

    return lines.join('\n');
  }

  /**
   * Push metrics to Prometheus Pushgateway
   */
  async pushMetrics() {
    if (!this.pushGatewayUrl) {
      return;
    }

    try {
      const metrics = await this.calculateMetrics();
      const prometheusFormat = this.formatPrometheusMetrics(metrics);

      const url = new URL('/metrics/job/cortex-token-usage', this.pushGatewayUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(prometheusFormat)
        }
      };

      const req = protocol.request(url, options, (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 202) {
          console.error(`Push failed with status ${res.statusCode}`);
        }
      });

      req.on('error', (error) => {
        console.error('Failed to push metrics:', error.message);
      });

      req.write(prometheusFormat);
      req.end();
    } catch (error) {
      console.error('Failed to push metrics:', error.message);
    }
  }

  /**
   * Start metrics HTTP server
   */
  async startServer() {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        try {
          const metrics = await this.calculateMetrics();
          const prometheusFormat = this.formatPrometheusMetrics(metrics);

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(prometheusFormat);
        } catch (error) {
          console.error('Failed to generate metrics:', error.message);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(this.port, () => {
      console.log(`Token usage metrics exporter listening on port ${this.port}`);
      console.log(`Metrics endpoint: http://localhost:${this.port}/metrics`);
    });

    // Start push gateway if configured
    if (this.pushGatewayUrl) {
      console.log(`Pushing metrics to ${this.pushGatewayUrl} every ${this.pushInterval}ms`);
      setInterval(() => this.pushMetrics(), this.pushInterval);

      // Initial push
      await this.pushMetrics();
    }
  }

  /**
   * Export metrics once and exit
   */
  async exportOnce(format = 'prometheus') {
    const metrics = await this.calculateMetrics();

    if (format === 'prometheus') {
      console.log(this.formatPrometheusMetrics(metrics));
    } else if (format === 'json') {
      console.log(JSON.stringify(metrics, null, 2));
    } else {
      throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Monitor and log token usage
   */
  async monitor(intervalMs = 30000) {
    console.log(`Starting token usage monitoring (interval: ${intervalMs}ms)`);

    const monitor = async () => {
      try {
        const usage = await this.readTokenUsage();

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          component: 'token_usage_exporter',
          total_tokens: usage.total,
          by_master: usage.byMaster,
          task_count: Object.keys(usage.byTask).length
        }));

        // Check budget alerts
        Object.entries(usage.byMaster).forEach(([master, tokens]) => {
          const budget = this.masterBudgets[master];
          if (budget) {
            const utilization = tokens / budget;
            if (utilization >= 0.8) {
              console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                component: 'token_usage_exporter',
                severity: utilization >= 1.0 ? 'critical' : 'warning',
                type: 'token_budget_alert',
                master,
                tokens_used: tokens,
                budget,
                utilization: utilization.toFixed(2)
              }));
            }
          }
        });
      } catch (error) {
        console.error('Token usage monitoring error:', error.message);
      }
    };

    // Initial run
    await monitor();

    // Schedule recurring runs
    setInterval(monitor, intervalMs);
  }
}

// CLI interface
if (require.main === module) {
  const config = {
    port: parseInt(process.env.PORT || '9090', 10),
    coordinationPath: process.env.COORDINATION_PATH || '/Users/ryandahlberg/Projects/cortex/coordination',
    pushGatewayUrl: process.env.PUSH_GATEWAY_URL || null,
    pushInterval: parseInt(process.env.PUSH_INTERVAL || '15000', 10)
  };

  const exporter = new TokenUsageExporter(config);

  const command = process.argv[2];

  switch (command) {
    case 'server':
      exporter.startServer();
      break;

    case 'export':
      const format = process.argv[3] || 'prometheus';
      exporter.exportOnce(format)
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    case 'monitor':
      const interval = parseInt(process.argv[3] || '30000', 10);
      exporter.monitor(interval);
      break;

    case 'push':
      exporter.pushMetrics()
        .then(() => {
          console.log('Metrics pushed successfully');
          process.exit(0);
        })
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    default:
      console.log(`
Token Usage Metrics Exporter - Export token usage metrics to Prometheus

Usage:
  token-usage-exporter.js server             Start metrics HTTP server
  token-usage-exporter.js export [format]    Export metrics once (prometheus|json)
  token-usage-exporter.js monitor [interval] Monitor and log token usage
  token-usage-exporter.js push               Push metrics to Pushgateway

Environment variables:
  PORT                 HTTP server port (default: 9090)
  COORDINATION_PATH    Path to coordination directory
  PUSH_GATEWAY_URL     Prometheus Pushgateway URL (optional)
  PUSH_INTERVAL        Push interval in ms (default: 15000)

Examples:
  node token-usage-exporter.js server
  node token-usage-exporter.js export prometheus
  node token-usage-exporter.js monitor
  PUSH_GATEWAY_URL=http://localhost:9091 node token-usage-exporter.js server
      `.trim());
      process.exit(command ? 1 : 0);
  }
}

module.exports = TokenUsageExporter;
