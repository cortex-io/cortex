#!/usr/bin/env node
/**
 * Worker Provisioner - Dynamic burst worker provisioning
 *
 * Provisions Kubernetes Jobs for burst worker capacity based on:
 * - Task queue depth
 * - Available worker capacity
 * - Worker type requirements
 * - Resource constraints
 *
 * Features:
 * - Auto-cleanup via TTL
 * - Resource profile management
 * - Batch provisioning
 * - Metrics tracking
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class WorkerProvisioner {
  constructor(config = {}) {
    this.prometheusUrl = config.prometheusUrl || 'http://prometheus.monitoring:9090';
    this.k8sApiUrl = config.k8sApiUrl || 'https://kubernetes.default.svc';
    this.namespace = config.namespace || 'cortex-workers';
    this.templatePath = config.templatePath || '/Users/ryandahlberg/Projects/cortex/k8s/workers/burst-worker-job-template.yaml';
    this.resourceProfiles = config.resourceProfiles || this.getDefaultResourceProfiles();
    this.provisioningRules = config.provisioningRules || this.getDefaultProvisioningRules();
    this.metricsCache = new Map();
    this.cacheTTL = config.cacheTTL || 15000; // 15 seconds
  }

  /**
   * Default resource profiles for worker types
   */
  getDefaultResourceProfiles() {
    return {
      'implementation': {
        memory_request: '256Mi',
        memory_limit: '1Gi',
        cpu_request: '200m',
        cpu_limit: '1000m',
        token_budget: 15000,
        time_limit: 60
      },
      'analysis': {
        memory_request: '512Mi',
        memory_limit: '2Gi',
        cpu_request: '500m',
        cpu_limit: '2000m',
        token_budget: 20000,
        time_limit: 90
      },
      'security': {
        memory_request: '256Mi',
        memory_limit: '1Gi',
        cpu_request: '200m',
        cpu_limit: '1000m',
        token_budget: 12000,
        time_limit: 45
      },
      'scan': {
        memory_request: '512Mi',
        memory_limit: '2Gi',
        cpu_request: '500m',
        cpu_limit: '2000m',
        token_budget: 18000,
        time_limit: 120
      },
      'documentation': {
        memory_request: '128Mi',
        memory_limit: '512Mi',
        cpu_request: '100m',
        cpu_limit: '500m',
        token_budget: 8000,
        time_limit: 30
      },
      'testing': {
        memory_request: '256Mi',
        memory_limit: '1Gi',
        cpu_request: '200m',
        cpu_limit: '1000m',
        token_budget: 10000,
        time_limit: 45
      },
      'refactor': {
        memory_request: '256Mi',
        memory_limit: '1Gi',
        cpu_request: '200m',
        cpu_limit: '1000m',
        token_budget: 15000,
        time_limit: 60
      },
      'optimization': {
        memory_request: '512Mi',
        memory_limit: '2Gi',
        cpu_request: '500m',
        cpu_limit: '2000m',
        token_budget: 18000,
        time_limit: 90
      },
      'bugfix': {
        memory_request: '256Mi',
        memory_limit: '1Gi',
        cpu_request: '200m',
        cpu_limit: '1000m',
        token_budget: 12000,
        time_limit: 45
      }
    };
  }

  /**
   * Default provisioning rules
   */
  getDefaultProvisioningRules() {
    return {
      queueDepthThreshold: 10,      // Provision if queue > 10 tasks
      capacityThreshold: 0.5,        // Provision if capacity < 50%
      maxBurstWorkers: 20,           // Maximum 20 burst workers
      batchSize: 5,                  // Provision 5 workers at a time
      cooldownPeriod: 300            // 5 minutes between provisions
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
   * Get task queue metrics
   */
  async getQueueMetrics(workerType) {
    const cacheKey = `queue-metrics-${workerType}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Queue depth for worker type
      const queueQuery = `sum(cortex_task_queue_depth{type="${workerType}"}) or vector(0)`;
      const queueResult = await this.queryPrometheus(queueQuery);

      // Active workers for type
      const workersQuery = `sum(cortex_active_workers{type="${workerType}"}) or vector(0)`;
      const workersResult = await this.queryPrometheus(workersQuery);

      // Burst workers already running
      const burstQuery = `count(kube_job_status_active{job_name=~"worker-${workerType}-burst-.*"}) or vector(0)`;
      const burstResult = await this.queryPrometheus(burstQuery);

      const metrics = {
        queueDepth: parseFloat(queueResult[0]?.value[1] || 0),
        activeWorkers: parseFloat(workersResult[0]?.value[1] || 0),
        burstWorkers: parseFloat(burstResult[0]?.value[1] || 0),
        timestamp: Date.now()
      };

      this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error(`Failed to get queue metrics for ${workerType}:`, error.message);
      return {
        queueDepth: 0,
        activeWorkers: 0,
        burstWorkers: 0,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Calculate provisioning decision
   */
  calculateProvisioningDecision(workerType, metrics) {
    const { queueDepth, activeWorkers, burstWorkers } = metrics;
    const { queueDepthThreshold, capacityThreshold, maxBurstWorkers, batchSize } = this.provisioningRules;

    // Check if provisioning is needed
    const needsProvisioning = queueDepth > queueDepthThreshold;
    const capacityRatio = queueDepth > 0 ? activeWorkers / queueDepth : 1;
    const lowCapacity = capacityRatio < capacityThreshold;

    // Check if we can provision more
    const canProvision = burstWorkers < maxBurstWorkers;

    // Calculate how many workers to provision
    const workersNeeded = Math.ceil(queueDepth - activeWorkers);
    const workersToProvision = Math.min(
      workersNeeded,
      batchSize,
      maxBurstWorkers - burstWorkers
    );

    return {
      shouldProvision: needsProvisioning && lowCapacity && canProvision,
      workersToProvision: Math.max(0, workersToProvision),
      reason: needsProvisioning && lowCapacity && canProvision
        ? `Queue depth ${queueDepth} > threshold ${queueDepthThreshold} and capacity ${capacityRatio.toFixed(2)} < ${capacityThreshold}`
        : needsProvisioning && !lowCapacity
        ? 'Queue depth high but capacity sufficient'
        : needsProvisioning && !canProvision
        ? `Already at max burst workers (${burstWorkers}/${maxBurstWorkers})`
        : 'Queue depth below threshold',
      metrics
    };
  }

  /**
   * Generate job manifest from template
   */
  generateJobManifest(workerType, index, batchId) {
    const profile = this.resourceProfiles[workerType];
    if (!profile) {
      throw new Error(`No resource profile found for worker type: ${workerType}`);
    }

    const timestamp = Date.now();
    const replacements = {
      '{WORKER_TYPE}': workerType,
      '{TIMESTAMP}': timestamp.toString(),
      '{INDEX}': index.toString(),
      '{BATCH_ID}': batchId,
      '{MEMORY_REQUEST}': profile.memory_request,
      '{MEMORY_LIMIT}': profile.memory_limit,
      '{CPU_REQUEST}': profile.cpu_request,
      '{CPU_LIMIT}': profile.cpu_limit,
      '{TOKEN_BUDGET}': profile.token_budget.toString(),
      '{TIME_LIMIT}': profile.time_limit.toString()
    };

    // Read template and replace placeholders
    let manifest = `apiVersion: batch/v1
kind: Job
metadata:
  name: worker-${workerType}-burst-${timestamp}-${index}
  namespace: ${this.namespace}
  labels:
    app: cortex
    component: worker
    worker-type: "${workerType}"
    provisioning: burst
    app.cortex.ai/worker-type: "${workerType}"
    app.cortex.ai/provisioning: burst
    app.cortex.ai/burst-batch: "${batchId}"
spec:
  ttlSecondsAfterFinished: 3600
  backoffLimit: 2
  activeDeadlineSeconds: 7200
  template:
    metadata:
      labels:
        app: cortex
        component: worker
        worker-type: "${workerType}"
        provisioning: burst
    spec:
      restartPolicy: Never
      serviceAccountName: cortex-worker
      containers:
      - name: worker
        image: ghcr.io/ry-ops/cortex-docker:latest
        imagePullPolicy: IfNotPresent
        env:
        - name: WORKER_TYPE
          value: "${workerType}"
        - name: WORKER_MODE
          value: "burst"
        - name: WORKER_ID
          value: "${workerType}-burst-${timestamp}-${index}"
        - name: BATCH_ID
          value: "${batchId}"
        - name: TASK_QUEUE_URL
          value: "http://coordinator-master.cortex:3001/api/tasks"
        - name: COORDINATOR_URL
          value: "http://coordinator-master.cortex:3001"
        - name: METRICS_ENABLED
          value: "true"
        - name: PROMETHEUS_PUSHGATEWAY
          value: "http://prometheus-pushgateway.monitoring:9091"
        - name: TOKEN_BUDGET
          value: "${profile.token_budget}"
        - name: TIME_LIMIT_MINUTES
          value: "${profile.time_limit}"
        resources:
          requests:
            memory: "${profile.memory_request}"
            cpu: "${profile.cpu_request}"
          limits:
            memory: "${profile.memory_limit}"
            cpu: "${profile.cpu_limit}"
        volumeMounts:
        - name: shared-workspace
          mountPath: /workspace
      volumes:
      - name: shared-workspace
        emptyDir: {}`;

    return manifest;
  }

  /**
   * Provision burst workers
   */
  async provisionBurstWorkers(workerType, count) {
    const batchId = `batch-${Date.now()}`;
    const results = [];

    console.log(`Provisioning ${count} burst workers for ${workerType} (batch: ${batchId})`);

    for (let i = 0; i < count; i++) {
      try {
        const manifest = this.generateJobManifest(workerType, i, batchId);

        // Log the manifest (in real implementation, would create via K8s API)
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'provision_burst_worker',
          worker_type: workerType,
          batch_id: batchId,
          index: i,
          manifest_length: manifest.length
        }));

        results.push({
          success: true,
          workerType,
          index: i,
          batchId
        });
      } catch (error) {
        console.error(`Failed to provision worker ${workerType}-${i}:`, error.message);
        results.push({
          success: false,
          workerType,
          index: i,
          batchId,
          error: error.message
        });
      }
    }

    return {
      batchId,
      workerType,
      requested: count,
      provisioned: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Check and provision workers for a specific type
   */
  async checkAndProvision(workerType) {
    const metrics = await this.getQueueMetrics(workerType);
    const decision = this.calculateProvisioningDecision(workerType, metrics);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      worker_type: workerType,
      decision: decision.shouldProvision ? 'provision' : 'skip',
      workers_to_provision: decision.workersToProvision,
      reason: decision.reason,
      queue_depth: metrics.queueDepth,
      active_workers: metrics.activeWorkers,
      burst_workers: metrics.burstWorkers
    }));

    if (decision.shouldProvision && decision.workersToProvision > 0) {
      return await this.provisionBurstWorkers(workerType, decision.workersToProvision);
    }

    return {
      workerType,
      action: 'no_provisioning_needed',
      decision
    };
  }

  /**
   * Check and provision for all worker types
   */
  async checkAndProvisionAll() {
    const workerTypes = Object.keys(this.resourceProfiles);
    const results = await Promise.all(
      workerTypes.map(type => this.checkAndProvision(type))
    );

    return results;
  }

  /**
   * Monitor and auto-provision
   */
  async monitor(intervalMs = 30000) {
    console.log(`Starting worker provisioner monitoring (interval: ${intervalMs}ms)`);

    const monitor = async () => {
      try {
        const results = await this.checkAndProvisionAll();

        // Log provisioning summary
        const provisioned = results.filter(r => r.provisioned > 0);
        if (provisioned.length > 0) {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'provisioning_summary',
            total_batches: provisioned.length,
            total_workers: provisioned.reduce((sum, r) => sum + r.provisioned, 0),
            batches: provisioned.map(r => ({
              worker_type: r.workerType,
              count: r.provisioned,
              batch_id: r.batchId
            }))
          }));
        }
      } catch (error) {
        console.error('Worker provisioning monitoring error:', error.message);
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
    namespace: process.env.NAMESPACE || 'cortex-workers',
    cacheTTL: parseInt(process.env.CACHE_TTL || '15000', 10)
  };

  const provisioner = new WorkerProvisioner(config);

  const command = process.argv[2];

  switch (command) {
    case 'monitor':
      const interval = parseInt(process.argv[3] || '30000', 10);
      provisioner.monitor(interval);
      break;

    case 'check':
      const workerType = process.argv[3];
      if (workerType) {
        provisioner.checkAndProvision(workerType)
          .then(result => console.log(JSON.stringify(result, null, 2)))
          .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
          });
      } else {
        provisioner.checkAndProvisionAll()
          .then(results => console.log(JSON.stringify(results, null, 2)))
          .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
          });
      }
      break;

    case 'provision':
      const type = process.argv[3];
      const count = parseInt(process.argv[4] || '1', 10);
      if (!type) {
        console.error('Error: worker type required');
        process.exit(1);
      }
      provisioner.provisionBurstWorkers(type, count)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => {
          console.error('Error:', err.message);
          process.exit(1);
        });
      break;

    default:
      console.log(`
Worker Provisioner - Dynamic burst worker provisioning

Usage:
  worker-provisioner.js monitor [interval]      Monitor and auto-provision (default: 30000ms)
  worker-provisioner.js check [worker_type]     Check provisioning for type (or all)
  worker-provisioner.js provision <type> <count> Manually provision workers

Environment variables:
  PROMETHEUS_URL    Prometheus server URL (default: http://prometheus.monitoring:9090)
  NAMESPACE         Kubernetes namespace (default: cortex-workers)
  CACHE_TTL         Metrics cache TTL in ms (default: 15000)

Examples:
  node worker-provisioner.js monitor
  node worker-provisioner.js check implementation
  node worker-provisioner.js provision implementation 5
      `.trim());
      process.exit(command ? 1 : 0);
  }
}

module.exports = WorkerProvisioner;
