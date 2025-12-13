/**
 * K8s Health Monitor
 *
 * Monitors pod readiness, liveness, and service health in Kubernetes cluster
 * Logs health status and alerts on service degradation
 */

const fs = require('fs').promises;
const path = require('path');

class HealthMonitor {
  constructor(k8sClient, options = {}) {
    this.k8sClient = k8sClient;
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || process.cwd();
    this.healthLogPath = options.healthLogPath || path.join(
      this.cortexHome,
      'coordination/observability/health-checks.jsonl'
    );
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.checkTimer = null;

    // Health state
    this.healthStatus = new Map();
    this.lastCheck = null;
    this.alertThreshold = options.alertThreshold || 3; // Failed checks before alert
    this.failedChecks = new Map();

    // Namespaces to monitor
    this.monitoredNamespaces = options.monitoredNamespaces || ['cortex-system', 'default'];
  }

  /**
   * Start health monitoring
   */
  async start() {
    console.log('Starting K8s health monitoring...');

    // Ensure log directory exists
    await this._ensureLogDirectory();

    // Initial health check
    await this.checkHealth();

    // Schedule periodic checks
    this.checkTimer = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error(`Health check error: ${error.message}`);
      }
    }, this.checkInterval);

    console.log(`Health monitoring running (interval: ${this.checkInterval}ms)`);
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      console.log('Health monitoring stopped');
    }
  }

  /**
   * Perform health checks across cluster
   */
  async checkHealth() {
    console.log('Performing health checks...');
    const timestamp = new Date().toISOString();

    try {
      // Check cluster-level health
      const clusterHealth = await this.checkClusterHealth();

      // Check pods in monitored namespaces
      const podHealth = await this.checkPodHealth();

      // Check deployments
      const deploymentHealth = await this.checkDeploymentHealth();

      // Check services
      const serviceHealth = await this.checkServiceHealth();

      // Aggregate results
      const overallHealth = {
        timestamp,
        cluster: clusterHealth,
        pods: podHealth,
        deployments: deploymentHealth,
        services: serviceHealth,
        overall_status: this._determineOverallStatus(
          clusterHealth,
          podHealth,
          deploymentHealth,
          serviceHealth
        )
      };

      // Update health status
      this.lastCheck = timestamp;

      // Log health check
      await this.logHealthCheck(overallHealth);

      // Check for degradation and alert if necessary
      await this.checkForDegradation(overallHealth);

      return overallHealth;
    } catch (error) {
      console.error(`Health check failed: ${error.message}`);
      const errorHealth = {
        timestamp,
        status: 'error',
        error: error.message
      };
      await this.logHealthCheck(errorHealth);
      return errorHealth;
    }
  }

  /**
   * Check cluster node health
   */
  async checkClusterHealth() {
    try {
      const nodes = await this.k8sClient.getNodeStatus();

      const totalNodes = nodes.length;
      const readyNodes = nodes.filter(n => n.ready).length;
      const unhealthyNodes = nodes.filter(n => !n.ready);

      return {
        status: readyNodes === totalNodes ? 'healthy' : 'degraded',
        total_nodes: totalNodes,
        ready_nodes: readyNodes,
        unhealthy_nodes: unhealthyNodes.map(n => ({
          name: n.name,
          conditions: n.conditions
        }))
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check pod health in monitored namespaces
   */
  async checkPodHealth() {
    const results = {
      total: 0,
      running: 0,
      pending: 0,
      failed: 0,
      unhealthy: []
    };

    for (const namespace of this.monitoredNamespaces) {
      try {
        const pods = await this.k8sClient.listPods(namespace);

        results.total += pods.length;

        for (const pod of pods) {
          if (pod.phase === 'Running') {
            results.running++;
            if (!pod.ready) {
              results.unhealthy.push({
                name: pod.name,
                namespace: pod.namespace,
                phase: pod.phase,
                ready: pod.ready,
                node: pod.nodeName
              });
            }
          } else if (pod.phase === 'Pending') {
            results.pending++;
            results.unhealthy.push({
              name: pod.name,
              namespace: pod.namespace,
              phase: pod.phase
            });
          } else if (pod.phase === 'Failed') {
            results.failed++;
            results.unhealthy.push({
              name: pod.name,
              namespace: pod.namespace,
              phase: pod.phase
            });
          }
        }
      } catch (error) {
        console.error(`Failed to check pods in ${namespace}: ${error.message}`);
      }
    }

    results.status = results.unhealthy.length === 0 ? 'healthy' : 'degraded';
    return results;
  }

  /**
   * Check deployment health
   */
  async checkDeploymentHealth() {
    const results = {
      total: 0,
      ready: 0,
      degraded: []
    };

    for (const namespace of this.monitoredNamespaces) {
      try {
        const deployments = await this.k8sClient.listDeployments(namespace);

        results.total += deployments.length;

        for (const deployment of deployments) {
          if (deployment.readyReplicas === deployment.replicas) {
            results.ready++;
          } else {
            results.degraded.push({
              name: deployment.name,
              namespace: deployment.namespace,
              desired: deployment.replicas,
              ready: deployment.readyReplicas,
              available: deployment.availableReplicas
            });
          }
        }
      } catch (error) {
        console.error(`Failed to check deployments in ${namespace}: ${error.message}`);
      }
    }

    results.status = results.degraded.length === 0 ? 'healthy' : 'degraded';
    return results;
  }

  /**
   * Check service health
   */
  async checkServiceHealth() {
    const results = {
      total: 0,
      active: 0,
      issues: []
    };

    for (const namespace of this.monitoredNamespaces) {
      try {
        const services = await this.k8sClient.listServices(namespace);

        results.total += services.length;

        for (const service of services) {
          if (service.clusterIP && service.clusterIP !== 'None') {
            results.active++;
          } else {
            results.issues.push({
              name: service.name,
              namespace: service.namespace,
              type: service.type,
              issue: 'No cluster IP assigned'
            });
          }
        }
      } catch (error) {
        console.error(`Failed to check services in ${namespace}: ${error.message}`);
      }
    }

    results.status = results.issues.length === 0 ? 'healthy' : 'degraded';
    return results;
  }

  /**
   * Check specific service health by name
   */
  async checkServiceByName(namespace, serviceName) {
    try {
      // Get pods for service
      const pods = await this.k8sClient.listPods(namespace, `app=${serviceName}`);

      if (pods.length === 0) {
        return {
          service: serviceName,
          namespace,
          status: 'no_pods',
          healthy: false
        };
      }

      const runningPods = pods.filter(p => p.phase === 'Running');
      const readyPods = pods.filter(p => p.ready);

      return {
        service: serviceName,
        namespace,
        total_pods: pods.length,
        running_pods: runningPods.length,
        ready_pods: readyPods.length,
        healthy: readyPods.length > 0,
        status: readyPods.length > 0 ? 'healthy' : 'unhealthy',
        pods: pods.map(p => ({
          name: p.name,
          phase: p.phase,
          ready: p.ready,
          node: p.nodeName
        }))
      };
    } catch (error) {
      return {
        service: serviceName,
        namespace,
        status: 'error',
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Log health check to JSONL file
   */
  async logHealthCheck(healthData) {
    try {
      const logEntry = JSON.stringify(healthData) + '\n';
      await fs.appendFile(this.healthLogPath, logEntry, 'utf8');
    } catch (error) {
      console.error(`Failed to log health check: ${error.message}`);
    }
  }

  /**
   * Check for service degradation and alert
   */
  async checkForDegradation(healthData) {
    const issues = [];

    // Check cluster degradation
    if (healthData.cluster.status === 'degraded') {
      issues.push({
        type: 'cluster',
        severity: 'high',
        message: `${healthData.cluster.unhealthy_nodes.length} nodes unhealthy`,
        details: healthData.cluster.unhealthy_nodes
      });
    }

    // Check pod degradation
    if (healthData.pods.status === 'degraded') {
      issues.push({
        type: 'pods',
        severity: 'medium',
        message: `${healthData.pods.unhealthy.length} unhealthy pods`,
        details: healthData.pods.unhealthy
      });
    }

    // Check deployment degradation
    if (healthData.deployments.status === 'degraded') {
      issues.push({
        type: 'deployments',
        severity: 'high',
        message: `${healthData.deployments.degraded.length} degraded deployments`,
        details: healthData.deployments.degraded
      });
    }

    // Track failed checks for alerting
    for (const issue of issues) {
      const key = `${issue.type}:${issue.message}`;
      const currentCount = this.failedChecks.get(key) || 0;
      const newCount = currentCount + 1;
      this.failedChecks.set(key, newCount);

      // Alert if threshold exceeded
      if (newCount === this.alertThreshold) {
        await this.raiseAlert(issue, newCount);
      }
    }

    // Clear failed checks for resolved issues
    for (const [key, count] of this.failedChecks.entries()) {
      const issueStillPresent = issues.some(i => `${i.type}:${i.message}` === key);
      if (!issueStillPresent) {
        this.failedChecks.delete(key);
        console.log(`Issue resolved: ${key}`);
      }
    }

    return issues;
  }

  /**
   * Raise alert for degraded service
   */
  async raiseAlert(issue, failedCheckCount) {
    const alert = {
      timestamp: new Date().toISOString(),
      type: 'health_degradation',
      severity: issue.severity,
      component: issue.type,
      message: issue.message,
      failed_checks: failedCheckCount,
      details: issue.details
    };

    console.warn(`ALERT: ${alert.message} (failed checks: ${failedCheckCount})`);

    // Log alert
    const alertLogPath = path.join(
      this.cortexHome,
      'coordination/observability/alerts.jsonl'
    );

    try {
      const logEntry = JSON.stringify(alert) + '\n';
      await fs.appendFile(alertLogPath, logEntry, 'utf8');
    } catch (error) {
      console.error(`Failed to log alert: ${error.message}`);
    }

    // Could integrate with notification system here
    return alert;
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      last_check: this.lastCheck,
      monitoring_enabled: this.checkTimer !== null,
      check_interval: this.checkInterval,
      monitored_namespaces: this.monitoredNamespaces,
      active_issues: this.failedChecks.size
    };
  }

  /**
   * Get recent health checks
   */
  async getRecentHealthChecks(limit = 10) {
    try {
      const data = await fs.readFile(this.healthLogPath, 'utf8');
      const lines = data.trim().split('\n').filter(l => l.trim());
      const checks = lines.slice(-limit).map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(c => c !== null);

      return checks;
    } catch (error) {
      console.error(`Failed to read health checks: ${error.message}`);
      return [];
    }
  }

  /**
   * Get health statistics
   */
  async getStatistics() {
    const recentChecks = await this.getRecentHealthChecks(50);

    if (recentChecks.length === 0) {
      return {
        total_checks: 0,
        healthy_checks: 0,
        degraded_checks: 0,
        error_checks: 0
      };
    }

    const stats = {
      total_checks: recentChecks.length,
      healthy_checks: recentChecks.filter(c => c.overall_status === 'healthy').length,
      degraded_checks: recentChecks.filter(c => c.overall_status === 'degraded').length,
      error_checks: recentChecks.filter(c => c.overall_status === 'error').length,
      uptime_percentage: 0
    };

    stats.uptime_percentage = ((stats.healthy_checks / stats.total_checks) * 100).toFixed(2);

    return stats;
  }

  /**
   * Determine overall status from component statuses
   */
  _determineOverallStatus(cluster, pods, deployments, services) {
    const statuses = [cluster.status, pods.status, deployments.status, services.status];

    if (statuses.includes('error')) {
      return 'error';
    } else if (statuses.includes('degraded')) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Ensure log directory exists
   */
  async _ensureLogDirectory() {
    const logDir = path.dirname(this.healthLogPath);
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  /**
   * Force immediate health check
   */
  async forceCheck() {
    console.log('Forcing immediate health check...');
    return await this.checkHealth();
  }

  /**
   * Mark service as unhealthy in registry
   */
  async markServiceUnhealthy(namespace, serviceName) {
    console.log(`Marking service ${namespace}/${serviceName} as unhealthy`);

    const registryPath = path.join(this.cortexHome, 'coordination/mcp-server-registry.json');

    try {
      const data = await fs.readFile(registryPath, 'utf8');
      const registry = JSON.parse(data);

      for (const server of registry.servers) {
        if (server.namespace === namespace && server.name === serviceName) {
          server.status = 'unhealthy';
          server.last_health_check = new Date().toISOString();
          break;
        }
      }

      await fs.writeFile(
        registryPath,
        JSON.stringify(registry, null, 2),
        'utf8'
      );

      console.log(`Updated registry: ${namespace}/${serviceName} marked unhealthy`);
    } catch (error) {
      console.error(`Failed to update registry: ${error.message}`);
    }
  }
}

module.exports = HealthMonitor;
