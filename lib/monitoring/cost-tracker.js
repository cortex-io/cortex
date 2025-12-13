#!/usr/bin/env node
/**
 * Cost Tracker - Token usage and resource cost monitoring
 *
 * Tracks and analyzes:
 * - Token usage per master/task/worker
 * - Budget utilization and alerts
 * - Compute time and resource costs
 * - Cost forecasting
 * - Budget efficiency metrics
 *
 * Features:
 * - Real-time cost tracking
 * - Budget alerts (80% threshold)
 * - Cost attribution by task type
 * - Monthly forecasting
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class CostTracker {
  constructor(config = {}) {
    this.prometheusUrl = config.prometheusUrl || 'http://prometheus.monitoring:9090';
    this.costModelPath = config.costModelPath || '/Users/ryandahlberg/Projects/cortex/coordination/cost-model.json';
    this.costModel = config.costModel || this.loadCostModel();
    this.trackingEnabled = config.trackingEnabled !== undefined ? config.trackingEnabled : true;
    this.metricsCache = new Map();
    this.cacheTTL = config.cacheTTL || 15000; // 15 seconds
  }

  /**
   * Load cost model from file or use defaults
   */
  loadCostModel() {
    try {
      if (fs.existsSync(this.costModelPath)) {
        const data = fs.readFileSync(this.costModelPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load cost model, using defaults:', error.message);
    }

    return this.getDefaultCostModel();
  }

  /**
   * Default cost model
   */
  getDefaultCostModel() {
    return {
      // Token costs (USD per 1M tokens)
      tokenCosts: {
        input: 3.00,    // $3 per 1M input tokens (Claude Sonnet)
        output: 15.00   // $15 per 1M output tokens (Claude Sonnet)
      },

      // Compute costs (USD per hour)
      computeCosts: {
        cpu: 0.04,      // $0.04 per vCPU-hour
        memory: 0.005   // $0.005 per GiB-hour
      },

      // Budget limits
      budgets: {
        daily: 50.00,    // $50/day
        monthly: 1000.00 // $1000/month
      },

      // Alert thresholds
      alerts: {
        budgetUtilization: 0.80,  // Alert at 80% utilization
        dailyBurnRate: 0.90       // Alert if burning 90%+ of daily budget
      },

      // Token budgets per master
      masterTokenBudgets: {
        coordinator: 50000,
        development: 200000,
        security: 100000,
        inventory: 50000,
        cicd: 75000
      }
    };
  }

  /**
   * Save cost model
   */
  saveCostModel() {
    try {
      const dir = path.dirname(this.costModelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.costModelPath,
        JSON.stringify(this.costModel, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save cost model:', error.message);
    }
  }

  /**
   * Query Prometheus for metrics
   */
  async queryPrometheus(query) {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/v1/query', this.prometheusUrl);
      url.searchParams.append('query', query);

      const protocol = url.protocol === 'https:' ? https : http;

      protocol.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.status === 'success') {
              resolve(parsed.data.result);
            } else {
              reject(new Error(`Prometheus query failed: ${parsed.error}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Get token usage metrics
   */
  async getTokenUsage(master = null, period = '24h') {
    const cacheKey = `token-usage-${master || 'all'}-${period}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const masterFilter = master ? `{master="${master}"}` : '';

      // Total tokens used
      const usedQuery = `sum(increase(cortex_tokens_used_total${masterFilter}[${period}]))`;
      const usedResult = await this.queryPrometheus(usedQuery);

      // Token budget
      const budgetQuery = `sum(cortex_tokens_budget_total${masterFilter})`;
      const budgetResult = await this.queryPrometheus(budgetQuery);

      // Token usage by master
      const byMasterQuery = `sum(increase(cortex_tokens_used_total[${period}])) by (master)`;
      const byMasterResult = await this.queryPrometheus(byMasterQuery);

      const tokensUsed = parseFloat(usedResult[0]?.value[1] || 0);
      const tokenBudget = parseFloat(budgetResult[0]?.value[1] || 0);

      const byMaster = {};
      byMasterResult.forEach(r => {
        byMaster[r.metric.master] = parseFloat(r.value[1]);
      });

      const metrics = {
        tokensUsed,
        tokenBudget,
        budgetUtilization: tokenBudget > 0 ? tokensUsed / tokenBudget : 0,
        byMaster,
        timestamp: Date.now()
      };

      this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error('Failed to get token usage:', error.message);
      return {
        tokensUsed: 0,
        tokenBudget: 0,
        budgetUtilization: 0,
        byMaster: {},
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Get compute resource usage
   */
  async getComputeUsage(period = '24h') {
    const cacheKey = `compute-usage-${period}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // CPU seconds
      const cpuQuery = `sum(increase(cortex_worker_cpu_seconds_total[${period}]))`;
      const cpuResult = await this.queryPrometheus(cpuQuery);

      // Runtime seconds by worker type
      const runtimeQuery = `sum(increase(cortex_worker_runtime_seconds[${period}])) by (worker_type)`;
      const runtimeResult = await this.queryPrometheus(runtimeQuery);

      const cpuSeconds = parseFloat(cpuResult[0]?.value[1] || 0);

      const runtimeByType = {};
      runtimeResult.forEach(r => {
        runtimeByType[r.metric.worker_type] = parseFloat(r.value[1]);
      });

      const metrics = {
        cpuSeconds,
        cpuHours: cpuSeconds / 3600,
        runtimeByType,
        timestamp: Date.now()
      };

      this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error('Failed to get compute usage:', error.message);
      return {
        cpuSeconds: 0,
        cpuHours: 0,
        runtimeByType: {},
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Calculate costs
   */
  async calculateCosts(period = '24h') {
    const tokenUsage = await this.getTokenUsage(null, period);
    const computeUsage = await this.getComputeUsage(period);

    // Token costs (assuming average 50/50 input/output)
    const avgTokenCost = (this.costModel.tokenCosts.input + this.costModel.tokenCosts.output) / 2;
    const tokenCostUSD = (tokenUsage.tokensUsed / 1000000) * avgTokenCost;

    // Compute costs
    const computeCostUSD = computeUsage.cpuHours * this.costModel.computeCosts.cpu;

    // Total cost
    const totalCostUSD = tokenCostUSD + computeCostUSD;

    return {
      period,
      tokenCostUSD,
      computeCostUSD,
      totalCostUSD,
      breakdown: {
        tokens: {
          used: tokenUsage.tokensUsed,
          costPerMillion: avgTokenCost,
          costUSD: tokenCostUSD
        },
        compute: {
          cpuHours: computeUsage.cpuHours,
          costPerHour: this.costModel.computeCosts.cpu,
          costUSD: computeCostUSD
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get cost by task type
   */
  async getCostByTaskType(period = '24h') {
    try {
      // Token usage by task type
      const tokenQuery = `sum(increase(cortex_tokens_used_total[${period}])) by (task_type)`;
      const tokenResult = await this.queryPrometheus(tokenQuery);

      // Runtime by task type
      const runtimeQuery = `sum(increase(cortex_worker_runtime_seconds[${period}])) by (task_type)`;
      const runtimeResult = await this.queryPrometheus(runtimeQuery);

      const avgTokenCost = (this.costModel.tokenCosts.input + this.costModel.tokenCosts.output) / 2;

      const costsByType = {};

      tokenResult.forEach(r => {
        const taskType = r.metric.task_type;
        const tokens = parseFloat(r.value[1]);
        const tokenCost = (tokens / 1000000) * avgTokenCost;

        if (!costsByType[taskType]) {
          costsByType[taskType] = { tokenCost: 0, computeCost: 0, totalCost: 0 };
        }
        costsByType[taskType].tokenCost = tokenCost;
      });

      runtimeResult.forEach(r => {
        const taskType = r.metric.task_type;
        const runtime = parseFloat(r.value[1]);
        const computeCost = (runtime / 3600) * this.costModel.computeCosts.cpu;

        if (!costsByType[taskType]) {
          costsByType[taskType] = { tokenCost: 0, computeCost: 0, totalCost: 0 };
        }
        costsByType[taskType].computeCost = computeCost;
      });

      // Calculate totals
      Object.keys(costsByType).forEach(type => {
        costsByType[type].totalCost = costsByType[type].tokenCost + costsByType[type].computeCost;
      });

      return costsByType;
    } catch (error) {
      console.error('Failed to get cost by task type:', error.message);
      return {};
    }
  }

  /**
   * Forecast monthly costs
   */
  async forecastMonthlyCost() {
    const dailyCosts = await this.calculateCosts('24h');
    const weekCosts = await this.calculateCosts('7d');

    // Use 7-day average for more stable forecast
    const avgDailyCost = weekCosts.totalCostUSD / 7;
    const forecastMonthly = avgDailyCost * 30;

    const budgetUtilization = forecastMonthly / this.costModel.budgets.monthly;

    return {
      avgDailyCostUSD: avgDailyCost,
      forecastMonthlyCostUSD: forecastMonthly,
      monthlyBudgetUSD: this.costModel.budgets.monthly,
      budgetUtilization,
      projectedOverage: forecastMonthly - this.costModel.budgets.monthly,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check budget alerts
   */
  async checkBudgetAlerts() {
    const dailyCosts = await this.calculateCosts('24h');
    const monthlyCosts = await this.calculateCosts('30d');
    const forecast = await this.forecastMonthlyCost();

    const alerts = [];

    // Daily budget alert
    const dailyUtilization = dailyCosts.totalCostUSD / this.costModel.budgets.daily;
    if (dailyUtilization >= this.costModel.alerts.budgetUtilization) {
      alerts.push({
        severity: 'warning',
        type: 'daily_budget',
        message: `Daily cost ${dailyCosts.totalCostUSD.toFixed(2)} is ${(dailyUtilization * 100).toFixed(1)}% of budget`,
        utilization: dailyUtilization,
        cost: dailyCosts.totalCostUSD,
        budget: this.costModel.budgets.daily
      });
    }

    // Monthly budget alert
    const monthlyUtilization = monthlyCosts.totalCostUSD / this.costModel.budgets.monthly;
    if (monthlyUtilization >= this.costModel.alerts.budgetUtilization) {
      alerts.push({
        severity: 'warning',
        type: 'monthly_budget',
        message: `Monthly cost ${monthlyCosts.totalCostUSD.toFixed(2)} is ${(monthlyUtilization * 100).toFixed(1)}% of budget`,
        utilization: monthlyUtilization,
        cost: monthlyCosts.totalCostUSD,
        budget: this.costModel.budgets.monthly
      });
    }

    // Forecast alert
    if (forecast.budgetUtilization >= 1.0) {
      alerts.push({
        severity: 'critical',
        type: 'monthly_forecast',
        message: `Forecast monthly cost ${forecast.forecastMonthlyCostUSD.toFixed(2)} exceeds budget by ${forecast.projectedOverage.toFixed(2)}`,
        utilization: forecast.budgetUtilization,
        forecast: forecast.forecastMonthlyCostUSD,
        budget: this.costModel.budgets.monthly,
        overage: forecast.projectedOverage
      });
    }

    // Token budget alerts by master
    const tokenUsage = await this.getTokenUsage();
    Object.keys(tokenUsage.byMaster).forEach(master => {
      const used = tokenUsage.byMaster[master];
      const budget = this.costModel.masterTokenBudgets[master];

      if (budget) {
        const utilization = used / budget;
        if (utilization >= this.costModel.alerts.budgetUtilization) {
          alerts.push({
            severity: utilization >= 1.0 ? 'critical' : 'warning',
            type: 'token_budget',
            master,
            message: `Master ${master} token usage ${used.toFixed(0)} is ${(utilization * 100).toFixed(1)}% of budget`,
            utilization,
            used,
            budget
          });
        }
      }
    });

    return {
      alerts,
      alertCount: alerts.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get cost summary
   */
  async getCostSummary() {
    const dailyCosts = await this.calculateCosts('24h');
    const weeklyCosts = await this.calculateCosts('7d');
    const monthlyCosts = await this.calculateCosts('30d');
    const forecast = await this.forecastMonthlyCost();
    const costsByType = await getCostByTaskType('24h');
    const alerts = await this.checkBudgetAlerts();

    return {
      timestamp: new Date().toISOString(),
      period: {
        daily: dailyCosts,
        weekly: weeklyCosts,
        monthly: monthlyCosts
      },
      forecast,
      byTaskType: costsByType,
      alerts: alerts.alerts,
      budgets: this.costModel.budgets
    };
  }

  /**
   * Log cost tracking event
   */
  async logCostEvent(master, taskId, tokens, computeTime) {
    if (!this.trackingEnabled) {
      return;
    }

    const event = {
      timestamp: new Date().toISOString(),
      master,
      task_id: taskId,
      tokens_used: tokens,
      compute_time_seconds: computeTime,
      cost_usd: this.calculateEventCost(tokens, computeTime)
    };

    console.log(JSON.stringify(event));
  }

  /**
   * Calculate cost for a single event
   */
  calculateEventCost(tokens, computeTimeSeconds) {
    const avgTokenCost = (this.costModel.tokenCosts.input + this.costModel.tokenCosts.output) / 2;
    const tokenCost = (tokens / 1000000) * avgTokenCost;
    const computeCost = (computeTimeSeconds / 3600) * this.costModel.computeCosts.cpu;

    return tokenCost + computeCost;
  }

  /**
   * Monitor costs and log alerts
   */
  async monitor(intervalMs = 60000) {
    console.log(`Starting cost tracker monitoring (interval: ${intervalMs}ms)`);

    const monitor = async () => {
      try {
        const alerts = await this.checkBudgetAlerts();

        alerts.alerts.forEach(alert => {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            component: 'cost_tracker',
            ...alert
          }));
        });

        // Log summary every hour
        const now = new Date();
        if (now.getMinutes() === 0) {
          const summary = await this.getCostSummary();
          console.log(JSON.stringify({
            timestamp: summary.timestamp,
            component: 'cost_tracker',
            action: 'hourly_summary',
            daily_cost: summary.period.daily.totalCostUSD,
            forecast_monthly: summary.forecast.forecastMonthlyCostUSD,
            alert_count: summary.alerts.length
          }));
        }
      } catch (error) {
        console.error('Cost tracking monitoring error:', error.message);
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
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus.monitoring:9090',
    trackingEnabled: process.env.TRACKING_ENABLED !== 'false'
  };

  const tracker = new CostTracker(config);

  const command = process.argv[2];

  switch (command) {
    case 'monitor':
      const interval = parseInt(process.argv[3] || '60000', 10);
      tracker.monitor(interval);
      break;

    case 'summary':
      tracker.getCostSummary()
        .then(summary => console.log(JSON.stringify(summary, null, 2)))
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    case 'forecast':
      tracker.forecastMonthlyCost()
        .then(forecast => console.log(JSON.stringify(forecast, null, 2)))
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    case 'alerts':
      tracker.checkBudgetAlerts()
        .then(alerts => console.log(JSON.stringify(alerts, null, 2)))
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    default:
      console.log(`
Cost Tracker - Token usage and resource cost monitoring

Usage:
  cost-tracker.js monitor [interval]    Monitor costs and log alerts (default: 60000ms)
  cost-tracker.js summary               Get cost summary
  cost-tracker.js forecast              Get monthly cost forecast
  cost-tracker.js alerts                Check budget alerts

Environment variables:
  PROMETHEUS_URL     Prometheus server URL (default: http://prometheus.monitoring:9090)
  TRACKING_ENABLED   Enable cost tracking (default: true)

Examples:
  node cost-tracker.js monitor
  node cost-tracker.js summary
  node cost-tracker.js forecast
      `.trim());
      process.exit(command ? 1 : 0);
  }
}

module.exports = CostTracker;
