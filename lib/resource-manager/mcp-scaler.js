#!/usr/bin/env node
/**
 * MCP Server Scaler - Dynamic scaling logic for MCP servers
 *
 * Provides programmatic control over MCP server scaling based on:
 * - Request rate monitoring
 * - Queue depth analysis
 * - Server utilization metrics
 * - Warm standby strategy
 *
 * Integrates with KEDA for Kubernetes-native autoscaling
 */

const https = require('https');
const http = require('http');

class MCPScaler {
  constructor(config = {}) {
    this.prometheusUrl = config.prometheusUrl || 'http://prometheus.monitoring:9090';
    this.scalingPolicies = config.scalingPolicies || this.getDefaultPolicies();
    this.metricsCache = new Map();
    this.cacheTTL = config.cacheTTL || 15000; // 15 seconds
  }

  /**
   * Default scaling policies for MCP servers
   */
  getDefaultPolicies() {
    return {
      'wazuh': {
        minReplicas: 0,
        maxReplicas: 5,
        scaleUpThreshold: 10,    // requests/min
        scaleDownThreshold: 2,
        queueDepthThreshold: 5,
        cooldownPeriod: 300,     // 5 minutes
        warmStandby: false       // Scale to zero
      },
      'proxmox': {
        minReplicas: 0,
        maxReplicas: 5,
        scaleUpThreshold: 10,
        scaleDownThreshold: 2,
        queueDepthThreshold: 5,
        cooldownPeriod: 300,
        warmStandby: false       // Scale to zero
      },
      'n8n': {
        minReplicas: 1,          // Warm standby
        maxReplicas: 10,
        scaleUpThreshold: 20,
        scaleDownThreshold: 5,
        queueDepthThreshold: 10,
        cooldownPeriod: 300,
        warmStandby: true        // Keep 1 replica
      },
      'k3s': {
        minReplicas: 1,          // Warm standby
        maxReplicas: 5,
        scaleUpThreshold: 15,
        scaleDownThreshold: 3,
        queueDepthThreshold: 8,
        cooldownPeriod: 300,
        warmStandby: true        // Keep 1 replica
      },
      'cortex-resource-manager': {
        minReplicas: 1,          // Always available (critical path)
        maxReplicas: 3,
        scaleUpThreshold: 25,
        scaleDownThreshold: 5,
        queueDepthThreshold: 15,
        cooldownPeriod: 300,
        warmStandby: true        // Always 1 replica
      }
    };
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
   * Get MCP server metrics with caching
   */
  async getMCPMetrics(mcpServer) {
    const cacheKey = `mcp-metrics-${mcpServer}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Query request rate
      const requestRateQuery = `sum(rate(cortex_mcp_requests_total{mcp_server="${mcpServer}"}[2m])) or vector(0)`;
      const requestRate = await this.queryPrometheus(requestRateQuery);

      // Query queue depth
      const queueDepthQuery = `sum(cortex_mcp_request_queue_depth{mcp_server="${mcpServer}"}) or vector(0)`;
      const queueDepth = await this.queryPrometheus(queueDepthQuery);

      // Query current replicas
      const replicasQuery = `kube_deployment_status_replicas{deployment=~"${mcpServer}-mcp-server"}`;
      const replicas = await this.queryPrometheus(replicasQuery);

      const metrics = {
        requestRate: requestRate[0]?.value[1] || 0,
        queueDepth: queueDepth[0]?.value[1] || 0,
        currentReplicas: replicas[0]?.value[1] || 0,
        timestamp: Date.now()
      };

      this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error(`Failed to get metrics for ${mcpServer}:`, error.message);
      return {
        requestRate: 0,
        queueDepth: 0,
        currentReplicas: 0,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Calculate desired replica count based on metrics
   */
  calculateDesiredReplicas(mcpServer, metrics) {
    const policy = this.scalingPolicies[mcpServer];
    if (!policy) {
      console.warn(`No scaling policy found for ${mcpServer}`);
      return null;
    }

    const { requestRate, queueDepth, currentReplicas } = metrics;
    const { minReplicas, maxReplicas, scaleUpThreshold, scaleDownThreshold, queueDepthThreshold } = policy;

    // Scale up conditions
    if (requestRate > scaleUpThreshold || queueDepth > queueDepthThreshold) {
      // Calculate scale-up factor
      const requestFactor = Math.ceil(requestRate / scaleUpThreshold);
      const queueFactor = Math.ceil(queueDepth / queueDepthThreshold);
      const desired = Math.max(requestFactor, queueFactor, currentReplicas + 1);

      return Math.min(desired, maxReplicas);
    }

    // Scale down conditions
    if (requestRate < scaleDownThreshold && queueDepth === 0 && currentReplicas > minReplicas) {
      return Math.max(currentReplicas - 1, minReplicas);
    }

    // No change
    return currentReplicas;
  }

  /**
   * Get scaling recommendation for MCP server
   */
  async getScalingRecommendation(mcpServer) {
    const metrics = await this.getMCPMetrics(mcpServer);
    const desiredReplicas = this.calculateDesiredReplicas(mcpServer, metrics);
    const policy = this.scalingPolicies[mcpServer];

    return {
      mcpServer,
      metrics,
      currentReplicas: metrics.currentReplicas,
      desiredReplicas,
      policy,
      action: desiredReplicas > metrics.currentReplicas ? 'scale-up' :
              desiredReplicas < metrics.currentReplicas ? 'scale-down' : 'no-change',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get scaling recommendations for all MCP servers
   */
  async getAllScalingRecommendations() {
    const mcpServers = Object.keys(this.scalingPolicies);
    const recommendations = await Promise.all(
      mcpServers.map(server => this.getScalingRecommendation(server))
    );

    return recommendations;
  }

  /**
   * Monitor MCP scaling and log recommendations
   */
  async monitorScaling(intervalMs = 30000) {
    console.log(`Starting MCP scaler monitoring (interval: ${intervalMs}ms)`);

    const monitor = async () => {
      try {
        const recommendations = await this.getAllScalingRecommendations();

        recommendations.forEach(rec => {
          if (rec.action !== 'no-change') {
            console.log(JSON.stringify({
              timestamp: rec.timestamp,
              mcp_server: rec.mcpServer,
              action: rec.action,
              current_replicas: rec.currentReplicas,
              desired_replicas: rec.desiredReplicas,
              request_rate: rec.metrics.requestRate,
              queue_depth: rec.metrics.queueDepth
            }));
          }
        });
      } catch (error) {
        console.error('MCP scaling monitoring error:', error.message);
      }
    };

    // Initial run
    await monitor();

    // Schedule recurring runs
    setInterval(monitor, intervalMs);
  }

  /**
   * Export metrics for external monitoring
   */
  getMetricsExport() {
    const metrics = [];

    for (const [mcpServer, policy] of Object.entries(this.scalingPolicies)) {
      metrics.push({
        name: 'cortex_mcp_scaler_min_replicas',
        labels: { mcp_server: mcpServer },
        value: policy.minReplicas
      });

      metrics.push({
        name: 'cortex_mcp_scaler_max_replicas',
        labels: { mcp_server: mcpServer },
        value: policy.maxReplicas
      });

      metrics.push({
        name: 'cortex_mcp_scaler_scale_up_threshold',
        labels: { mcp_server: mcpServer },
        value: policy.scaleUpThreshold
      });

      metrics.push({
        name: 'cortex_mcp_scaler_warm_standby',
        labels: { mcp_server: mcpServer },
        value: policy.warmStandby ? 1 : 0
      });
    }

    return metrics;
  }
}

// CLI interface
if (require.main === module) {
  const config = {
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus.monitoring:9090',
    cacheTTL: parseInt(process.env.CACHE_TTL || '15000', 10)
  };

  const scaler = new MCPScaler(config);

  const command = process.argv[2];

  switch (command) {
    case 'monitor':
      const interval = parseInt(process.argv[3] || '30000', 10);
      scaler.monitorScaling(interval);
      break;

    case 'recommend':
      const mcpServer = process.argv[3];
      if (mcpServer) {
        scaler.getScalingRecommendation(mcpServer)
          .then(rec => console.log(JSON.stringify(rec, null, 2)))
          .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
          });
      } else {
        scaler.getAllScalingRecommendations()
          .then(recs => console.log(JSON.stringify(recs, null, 2)))
          .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
          });
      }
      break;

    case 'metrics':
      const metricsExport = scaler.getMetricsExport();
      console.log(JSON.stringify(metricsExport, null, 2));
      break;

    default:
      console.log(`
MCP Scaler - Dynamic scaling logic for MCP servers

Usage:
  mcp-scaler.js monitor [interval]     Monitor scaling and log recommendations (default: 30000ms)
  mcp-scaler.js recommend [server]     Get scaling recommendation for server (or all)
  mcp-scaler.js metrics                Export scaling policy metrics

Environment variables:
  PROMETHEUS_URL    Prometheus server URL (default: http://prometheus.monitoring:9090)
  CACHE_TTL         Metrics cache TTL in ms (default: 15000)

Examples:
  node mcp-scaler.js monitor
  node mcp-scaler.js recommend wazuh
  node mcp-scaler.js recommend
  node mcp-scaler.js metrics
      `.trim());
      process.exit(command ? 1 : 0);
  }
}

module.exports = MCPScaler;
