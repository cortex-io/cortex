/**
 * K8s Tools for Cortex MCP Server
 *
 * Proxies K8s operations to K3s MCP Server
 * Provides unified interface for masters to use K8s capabilities
 */

const K8sResourceManager = require('../../lib/resource-manager/k8s-client');
const ServiceDiscovery = require('../../lib/resource-manager/service-discovery');
const HealthMonitor = require('../../lib/resource-manager/health-monitor');

// Initialize K8s clients (lazy initialization)
let k8sClient = null;
let serviceDiscovery = null;
let healthMonitor = null;

/**
 * Initialize K8s Resource Manager
 */
async function initializeK8s() {
  if (k8sClient) {
    return { k8sClient, serviceDiscovery, healthMonitor };
  }

  console.log('Initializing K8s Resource Manager...');

  // Create K8s client
  k8sClient = new K8sResourceManager({
    mcpServerUrl: process.env.K3S_MCP_SERVER_URL || 'http://localhost:3001',
    mockMode: process.env.MOCK_K8S === 'true'
  });

  await k8sClient.initialize();

  // Create service discovery
  serviceDiscovery = new ServiceDiscovery(k8sClient, {
    cortexHome: process.env.CORTEX_HOME || process.cwd(),
    discoveryInterval: 60000 // 1 minute
  });

  // Create health monitor
  healthMonitor = new HealthMonitor(k8sClient, {
    cortexHome: process.env.CORTEX_HOME || process.cwd(),
    checkInterval: 30000 // 30 seconds
  });

  // Start background tasks
  await serviceDiscovery.start();
  await healthMonitor.start();

  console.log('K8s Resource Manager initialized successfully');

  return { k8sClient, serviceDiscovery, healthMonitor };
}

/**
 * Tool definitions for K8s operations
 */
const k8sToolDefinitions = [
  {
    name: 'cortex_k8s_list_pods',
    description: 'List Kubernetes pods in a namespace with optional label filtering',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to list pods from (omit for all namespaces)'
        },
        label_selector: {
          type: 'string',
          description: 'Label selector to filter pods (e.g., "app=cortex")'
        }
      }
    }
  },
  {
    name: 'cortex_k8s_list_deployments',
    description: 'List Kubernetes deployments in a namespace',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to list deployments from (omit for all namespaces)'
        }
      }
    }
  },
  {
    name: 'cortex_k8s_scale_deployment',
    description: 'Scale a Kubernetes deployment to a specific replica count',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace of the deployment'
        },
        deployment_name: {
          type: 'string',
          description: 'Name of the deployment to scale'
        },
        replicas: {
          type: 'number',
          description: 'Target number of replicas'
        }
      },
      required: ['namespace', 'deployment_name', 'replicas']
    }
  },
  {
    name: 'cortex_k8s_get_pod_logs',
    description: 'Get logs from a Kubernetes pod container',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace of the pod'
        },
        pod_name: {
          type: 'string',
          description: 'Name of the pod'
        },
        container: {
          type: 'string',
          description: 'Container name (optional if pod has single container)'
        },
        tail_lines: {
          type: 'number',
          description: 'Number of lines to tail (default: 100)'
        }
      },
      required: ['namespace', 'pod_name']
    }
  },
  {
    name: 'cortex_k8s_create_job',
    description: 'Create a Kubernetes Job to run a containerized task',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to create the job in'
        },
        job_name: {
          type: 'string',
          description: 'Name for the job'
        },
        image: {
          type: 'string',
          description: 'Container image to run'
        },
        command: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command to run (optional)'
        },
        env: {
          type: 'object',
          description: 'Environment variables as key-value pairs'
        }
      },
      required: ['namespace', 'job_name', 'image']
    }
  },
  {
    name: 'cortex_k8s_get_cluster_health',
    description: 'Get Kubernetes cluster health status including node conditions',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'cortex_k8s_discover_mcp_servers',
    description: 'Discover MCP server deployments in Kubernetes cluster',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to discover MCP servers in (default: cortex-system)'
        }
      }
    }
  },
  {
    name: 'cortex_k8s_get_service_health',
    description: 'Get health status of a specific Kubernetes service',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace of the service'
        },
        service_name: {
          type: 'string',
          description: 'Name of the service'
        }
      },
      required: ['namespace', 'service_name']
    }
  },
  {
    name: 'cortex_k8s_watch_pod_status',
    description: 'Get detailed status of a specific pod including conditions and container states',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace of the pod'
        },
        pod_name: {
          type: 'string',
          description: 'Name of the pod'
        }
      },
      required: ['namespace', 'pod_name']
    }
  },
  {
    name: 'cortex_k8s_list_namespaces',
    description: 'List all Kubernetes namespaces in the cluster',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'cortex_k8s_get_discovery_status',
    description: 'Get status of service discovery including discovered MCP servers',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'cortex_k8s_get_health_status',
    description: 'Get overall health monitoring status including recent checks and alerts',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Tool implementations
 */
const k8sToolImplementations = {
  cortex_k8s_list_pods: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.listPods(args.namespace, args.label_selector);
  },

  cortex_k8s_list_deployments: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.listDeployments(args.namespace);
  },

  cortex_k8s_scale_deployment: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.scaleDeployment(
      args.namespace,
      args.deployment_name,
      args.replicas
    );
  },

  cortex_k8s_get_pod_logs: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.getPodLogs(
      args.namespace,
      args.pod_name,
      args.container,
      args.tail_lines
    );
  },

  cortex_k8s_create_job: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.createJob(
      args.namespace,
      args.job_name,
      args.image,
      args.command,
      args.env
    );
  },

  cortex_k8s_get_cluster_health: async () => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.getNodeStatus();
  },

  cortex_k8s_discover_mcp_servers: async (args) => {
    const { k8sClient } = await initializeK8s();
    const namespace = args.namespace || 'cortex-system';
    return await k8sClient.discoverMCPServers(namespace);
  },

  cortex_k8s_get_service_health: async (args) => {
    const { healthMonitor } = await initializeK8s();
    return await healthMonitor.checkServiceByName(
      args.namespace,
      args.service_name
    );
  },

  cortex_k8s_watch_pod_status: async (args) => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.watchPodStatus(
      args.namespace,
      args.pod_name
    );
  },

  cortex_k8s_list_namespaces: async () => {
    const { k8sClient } = await initializeK8s();
    return await k8sClient.listNamespaces();
  },

  cortex_k8s_get_discovery_status: async () => {
    const { serviceDiscovery } = await initializeK8s();
    return serviceDiscovery.getStatus();
  },

  cortex_k8s_get_health_status: async () => {
    const { healthMonitor } = await initializeK8s();
    const status = healthMonitor.getHealthStatus();
    const recentChecks = await healthMonitor.getRecentHealthChecks(5);
    const stats = await healthMonitor.getStatistics();

    return {
      ...status,
      recent_checks: recentChecks,
      statistics: stats
    };
  }
};

/**
 * Get all K8s tool definitions
 */
function getK8sToolDefinitions() {
  return k8sToolDefinitions;
}

/**
 * Get K8s tool by name
 */
function getK8sTool(name) {
  const definition = k8sToolDefinitions.find(t => t.name === name);
  if (!definition) return null;

  return {
    definition,
    execute: k8sToolImplementations[name]
  };
}

/**
 * Cleanup K8s resources on shutdown
 */
async function shutdownK8s() {
  if (serviceDiscovery) {
    serviceDiscovery.stop();
  }
  if (healthMonitor) {
    healthMonitor.stop();
  }
  if (k8sClient) {
    await k8sClient.shutdown();
  }
}

module.exports = {
  getK8sToolDefinitions,
  getK8sTool,
  initializeK8s,
  shutdownK8s
};
