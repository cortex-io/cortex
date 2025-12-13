/**
 * K8s Resource Manager Client
 *
 * Connects to K3s cluster via K3s MCP Server for resource management
 * Provides unified interface for K8s operations with graceful fallback
 */

const http = require('http');
const https = require('https');

class K8sResourceManager {
  constructor(options = {}) {
    this.mcpServerUrl = options.mcpServerUrl || process.env.K3S_MCP_SERVER_URL || 'http://localhost:3001';
    this.mockMode = options.mockMode || process.env.MOCK_K8S === 'true';
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000; // ms
    this.timeout = options.timeout || 30000; // 30 seconds

    // Connection state
    this.connected = false;
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;

    console.log(`K8s Resource Manager initialized`);
    console.log(`  MCP Server URL: ${this.mcpServerUrl}`);
    console.log(`  Mock Mode: ${this.mockMode}`);
  }

  /**
   * Initialize connection to K3s MCP Server
   */
  async initialize() {
    console.log('Initializing K8s Resource Manager...');

    // Check health of K3s MCP Server
    const healthy = await this.checkHealth();

    if (healthy || this.mockMode) {
      this.connected = true;
      console.log('K8s Resource Manager connected successfully');

      // Start periodic health checks
      this.startHealthMonitoring();

      return true;
    } else {
      console.warn('K8s MCP Server is unreachable. Operating in degraded mode.');
      this.connected = false;
      return false;
    }
  }

  /**
   * Check health of K3s MCP Server
   */
  async checkHealth() {
    if (this.mockMode) {
      this.lastHealthCheck = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mock: true
      };
      return true;
    }

    try {
      const result = await this._httpRequest('GET', '/health', null, 5000);
      this.lastHealthCheck = {
        status: result.status,
        timestamp: new Date().toISOString(),
        service: result.service
      };
      return result.status === 'healthy';
    } catch (error) {
      console.error(`Health check failed: ${error.message}`);
      this.lastHealthCheck = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
      return false;
    }
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring(interval = 30000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.checkHealth();
      this.connected = healthy;
    }, interval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Discover MCP server deployments in K8s cluster
   */
  async discoverMCPServers(namespace = 'cortex-system') {
    if (this.mockMode) {
      return this._mockDiscoverMCPServers(namespace);
    }

    try {
      const services = await this.callMCPTool('list_services', {
        namespace,
        labelSelector: 'app.cortex.ai/component=mcp-server'
      });

      return services.map(svc => ({
        name: svc.name,
        namespace: svc.namespace,
        type: svc.type,
        clusterIP: svc.clusterIP,
        ports: svc.ports,
        labels: svc.labels || {},
        discovered_at: new Date().toISOString()
      }));
    } catch (error) {
      console.error(`Failed to discover MCP servers: ${error.message}`);
      return [];
    }
  }

  /**
   * List pods in namespace with optional label selector
   */
  async listPods(namespace, labelSelector) {
    if (this.mockMode) {
      return this._mockListPods(namespace, labelSelector);
    }

    return await this.callMCPTool('list_pods', {
      namespace,
      labelSelector
    });
  }

  /**
   * List deployments in namespace
   */
  async listDeployments(namespace) {
    if (this.mockMode) {
      return this._mockListDeployments(namespace);
    }

    return await this.callMCPTool('list_deployments', {
      namespace
    });
  }

  /**
   * List services in namespace
   */
  async listServices(namespace) {
    if (this.mockMode) {
      return this._mockListServices(namespace);
    }

    return await this.callMCPTool('list_services', {
      namespace
    });
  }

  /**
   * Get pod logs
   */
  async getPodLogs(namespace, podName, container, tailLines = 100) {
    if (this.mockMode) {
      return this._mockGetPodLogs(namespace, podName);
    }

    return await this.callMCPTool('get_pod_logs', {
      namespace,
      podName,
      container,
      tailLines
    });
  }

  /**
   * Scale deployment
   */
  async scaleDeployment(namespace, deploymentName, replicas) {
    if (this.mockMode) {
      return this._mockScaleDeployment(namespace, deploymentName, replicas);
    }

    return await this.callMCPTool('scale_deployment', {
      namespace,
      deploymentName,
      replicas
    });
  }

  /**
   * Get node status
   */
  async getNodeStatus() {
    if (this.mockMode) {
      return this._mockGetNodeStatus();
    }

    return await this.callMCPTool('get_node_status', {});
  }

  /**
   * List namespaces
   */
  async listNamespaces() {
    if (this.mockMode) {
      return this._mockListNamespaces();
    }

    return await this.callMCPTool('list_namespaces', {});
  }

  /**
   * Watch pod status
   */
  async watchPodStatus(namespace, podName) {
    if (this.mockMode) {
      return this._mockWatchPodStatus(namespace, podName);
    }

    return await this.callMCPTool('watch_pod_status', {
      namespace,
      podName
    });
  }

  /**
   * Create Kubernetes job
   */
  async createJob(namespace, name, image, command, env, ttlSecondsAfterFinished = 3600) {
    if (this.mockMode) {
      return this._mockCreateJob(namespace, name, image);
    }

    return await this.callMCPTool('create_job', {
      namespace,
      name,
      image,
      command,
      env,
      ttlSecondsAfterFinished
    });
  }

  /**
   * Call K3s MCP Server tool with retry logic
   */
  async callMCPTool(toolName, args) {
    if (!this.connected && !this.mockMode) {
      throw new Error('K8s Resource Manager is not connected to K3s MCP Server');
    }

    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Send MCP tool call request
        const result = await this._sendMCPToolCall(toolName, args);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt}/${this.retryAttempts} failed: ${error.message}`);

        if (attempt < this.retryAttempts) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await this._sleep(delay);
        }
      }
    }

    throw new Error(`Failed to call MCP tool ${toolName} after ${this.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Send MCP tool call via HTTP to K3s MCP Server
   */
  async _sendMCPToolCall(toolName, args) {
    // For K3s MCP Server, we need to use the MCP protocol over SSE
    // This is a simplified HTTP-based implementation
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: Date.now()
    };

    try {
      const response = await this._httpRequest('POST', '/mcp', requestBody);

      if (response.error) {
        throw new Error(response.error.message || 'MCP tool call failed');
      }

      // Parse MCP response
      if (response.result && response.result.content && response.result.content.length > 0) {
        const textContent = response.result.content[0].text;
        try {
          return JSON.parse(textContent);
        } catch {
          return textContent;
        }
      }

      return response.result;
    } catch (error) {
      console.error(`Failed to send MCP tool call: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make HTTP request with timeout
   */
  async _httpRequest(method, path, body = null, timeout = null) {
    const url = new URL(path, this.mcpServerUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    const requestTimeout = timeout || this.timeout;

    return new Promise((resolve, reject) => {
      const options = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: requestTimeout
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== MOCK IMPLEMENTATIONS ====================

  _mockDiscoverMCPServers(namespace) {
    return [
      {
        name: 'k3s-mcp-server',
        namespace: 'cortex-system',
        type: 'ClusterIP',
        clusterIP: '10.43.100.50',
        ports: [{ port: 3001, targetPort: 3001, protocol: 'TCP' }],
        labels: {
          'app.cortex.ai/component': 'mcp-server',
          'app.cortex.ai/type': 'k3s'
        },
        discovered_at: new Date().toISOString()
      },
      {
        name: 'n8n-mcp-server',
        namespace: 'cortex-system',
        type: 'ClusterIP',
        clusterIP: '10.43.100.51',
        ports: [{ port: 3002, targetPort: 3002, protocol: 'TCP' }],
        labels: {
          'app.cortex.ai/component': 'mcp-server',
          'app.cortex.ai/type': 'n8n'
        },
        discovered_at: new Date().toISOString()
      }
    ];
  }

  _mockListPods(namespace, labelSelector) {
    const allPods = [
      {
        name: 'k3s-mcp-server-5d8f6b7c9d-x4k2m',
        namespace: 'cortex-system',
        phase: 'Running',
        podIP: '10.42.1.50',
        nodeName: 'k3s-node-1',
        containers: ['k3s-mcp-server'],
        ready: true
      },
      {
        name: 'cortex-worker-feature-abc123',
        namespace: 'cortex-system',
        phase: 'Running',
        podIP: '10.42.1.51',
        nodeName: 'k3s-node-2',
        containers: ['worker'],
        ready: true
      },
      {
        name: 'cortex-worker-bugfix-def456',
        namespace: 'cortex-system',
        phase: 'Running',
        podIP: '10.42.1.52',
        nodeName: 'k3s-node-3',
        containers: ['worker'],
        ready: true
      }
    ];

    if (namespace) {
      return allPods.filter(p => p.namespace === namespace);
    }

    return allPods;
  }

  _mockListDeployments(namespace) {
    const deployments = [
      {
        name: 'k3s-mcp-server',
        namespace: 'cortex-system',
        replicas: 1,
        readyReplicas: 1,
        availableReplicas: 1,
        image: 'ghcr.io/cortex-ai/k3s-mcp-server:latest'
      },
      {
        name: 'cortex-dashboard',
        namespace: 'cortex-system',
        replicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        image: 'ghcr.io/cortex-ai/dashboard:latest'
      }
    ];

    if (namespace) {
      return deployments.filter(d => d.namespace === namespace);
    }

    return deployments;
  }

  _mockListServices(namespace) {
    const services = [
      {
        name: 'k3s-mcp-server',
        namespace: 'cortex-system',
        type: 'ClusterIP',
        clusterIP: '10.43.100.50',
        ports: [{ port: 3001, targetPort: 3001, protocol: 'TCP' }]
      },
      {
        name: 'cortex-dashboard',
        namespace: 'cortex-system',
        type: 'LoadBalancer',
        clusterIP: '10.43.100.100',
        ports: [{ port: 80, targetPort: 3000, protocol: 'TCP' }]
      }
    ];

    if (namespace) {
      return services.filter(s => s.namespace === namespace);
    }

    return services;
  }

  _mockGetPodLogs(namespace, podName) {
    return {
      logs: `[2025-12-13T16:00:00Z] Starting ${podName}\n[2025-12-13T16:00:01Z] Initialized successfully\n[2025-12-13T16:00:02Z] Ready to receive requests`
    };
  }

  _mockScaleDeployment(namespace, deploymentName, replicas) {
    return {
      success: true,
      message: `Scaled ${deploymentName} in ${namespace} to ${replicas} replicas (MOCK)`
    };
  }

  _mockGetNodeStatus() {
    return [
      {
        name: 'k3s-node-1',
        ready: true,
        kubeletVersion: 'v1.28.5+k3s1',
        osImage: 'Ubuntu 22.04.3 LTS',
        capacity: { cpu: '4', memory: '8Gi', pods: '110' },
        allocatable: { cpu: '4', memory: '7.5Gi', pods: '110' },
        conditions: [
          { type: 'Ready', status: 'True', reason: 'KubeletReady' },
          { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' }
        ]
      },
      {
        name: 'k3s-node-2',
        ready: true,
        kubeletVersion: 'v1.28.5+k3s1',
        osImage: 'Ubuntu 22.04.3 LTS',
        capacity: { cpu: '4', memory: '8Gi', pods: '110' },
        allocatable: { cpu: '4', memory: '7.5Gi', pods: '110' },
        conditions: [
          { type: 'Ready', status: 'True', reason: 'KubeletReady' }
        ]
      }
    ];
  }

  _mockListNamespaces() {
    return [
      { name: 'default', status: 'Active', creationTimestamp: '2025-12-01T00:00:00Z', labels: {} },
      { name: 'kube-system', status: 'Active', creationTimestamp: '2025-12-01T00:00:00Z', labels: {} },
      { name: 'cortex-system', status: 'Active', creationTimestamp: '2025-12-05T10:00:00Z', labels: { 'app.cortex.ai/managed': 'true' } }
    ];
  }

  _mockWatchPodStatus(namespace, podName) {
    return {
      name: podName,
      namespace,
      phase: 'Running',
      conditions: [
        { type: 'Initialized', status: 'True', reason: 'PodCompleted' },
        { type: 'Ready', status: 'True', reason: 'ContainersReady' },
        { type: 'ContainersReady', status: 'True', reason: 'ContainersReady' },
        { type: 'PodScheduled', status: 'True', reason: 'PodScheduled' }
      ],
      containerStatuses: [
        {
          name: 'main-container',
          ready: true,
          restartCount: 0,
          state: 'running'
        }
      ]
    };
  }

  _mockCreateJob(namespace, name, image) {
    return {
      success: true,
      jobName: name,
      namespace,
      message: '(MOCK) Job created successfully'
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown() {
    console.log('Shutting down K8s Resource Manager...');
    this.stopHealthMonitoring();
    this.connected = false;
  }
}

module.exports = K8sResourceManager;
