/**
 * Cortex MCP Tools Index
 *
 * Comprehensive tool definitions for all 6 tiers of Cortex capabilities
 */

const UniFiClient = require('../clients/unifi');
const ProxmoxClient = require('../clients/proxmox');
const SandFlyClient = require('../clients/sandfly');
const K8sClient = require('../clients/k8s');
const WorkerPoolSpawner = require('../worker-pool/spawner');
const WorkerPoolMonitor = require('../worker-pool/monitor');
const MasterRegistry = require('../masters/registry');
const MasterInterface = require('../masters/interface');
const { routeQuery } = require('../moe-router');

// Initialize clients and components
const unifi = new UniFiClient();
const proxmox = new ProxmoxClient();
const sandfly = new SandFlyClient();
const k8s = new K8sClient();
const spawner = new WorkerPoolSpawner();
const monitor = new WorkerPoolMonitor();
const registry = new MasterRegistry();
const masterInterface = new MasterInterface(registry);

// Initialize registry on startup
registry.loadManifests().catch(err =>
  console.error(`[Tools] Failed to load master registry: ${err.message}`)
);

/**
 * Tool Definitions
 */
const toolDefinitions = [
  // TIER 1: Simple Queries
  {
    name: 'cortex_query',
    description: 'Query Cortex infrastructure (UniFi, Proxmox, Sandfly Security, k8s). Uses intelligent routing to select the best backend based on query content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about infrastructure (e.g., "show all UniFi access points", "list Proxmox VMs", "get Sandfly security findings", "show k8s pods in cortex-system")'
        },
        target: {
          type: 'string',
          enum: ['auto', 'unifi', 'proxmox', 'sandfly', 'k8s'],
          description: 'Target system (default: auto - uses MoE routing)'
        }
      },
      required: ['query']
    }
  },

  // Sandfly Security Operations
  {
    name: 'sandfly_scan_hosts',
    description: 'Scan Linux hosts for security threats, rootkits, and malware using Sandfly agentless security platform.',
    inputSchema: {
      type: 'object',
      properties: {
        hosts: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of host IDs to scan (optional - scans all K3s nodes if not provided)'
        },
        scan_type: {
          type: 'string',
          enum: ['comprehensive', 'quick', 'targeted'],
          description: 'Type of security scan to perform (default: comprehensive)'
        },
        scan_k3s: {
          type: 'boolean',
          description: 'If true, automatically scan all K3s cluster nodes (default: false)'
        }
      },
      required: []
    }
  },

  {
    name: 'sandfly_get_findings',
    description: 'Get security findings and alerts from Sandfly Security platform.',
    inputSchema: {
      type: 'object',
      properties: {
        severity: {
          type: 'string',
          enum: ['all', 'critical', 'high', 'medium', 'low'],
          description: 'Filter by severity level (default: all)'
        },
        host_id: {
          type: 'string',
          description: 'Get findings for specific host (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of findings to return (default: 100)'
        }
      },
      required: []
    }
  },

  {
    name: 'sandfly_manage_hosts',
    description: 'Manage hosts monitored by Sandfly Security (add, remove, update).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'update', 'list'],
          description: 'Host management action'
        },
        host_data: {
          type: 'object',
          description: 'Host configuration data (required for add/update actions)'
        },
        host_id: {
          type: 'string',
          description: 'Host ID (required for remove/update actions)'
        }
      },
      required: ['action']
    }
  },

  {
    name: 'sandfly_forensics',
    description: 'Get forensic data from hosts (processes, users, services, network listeners, kernel modules).',
    inputSchema: {
      type: 'object',
      properties: {
        host_id: {
          type: 'string',
          description: 'Host ID to collect forensics from'
        },
        data_type: {
          type: 'string',
          enum: ['processes', 'users', 'services', 'listeners', 'modules', 'scheduled-tasks', 'all'],
          description: 'Type of forensic data to collect (default: all)'
        }
      },
      required: ['host_id']
    }
  },

  // TIER 2: Infrastructure Management
  {
    name: 'cortex_manage_infrastructure',
    description: 'Manage infrastructure resources (VMs, containers, pods). Can create, delete, start, stop, and scale resources.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create_vm', 'delete_vm', 'start_vm', 'stop_vm', 'create_pod', 'delete_pod', 'scale_deployment'],
          description: 'Infrastructure operation to perform'
        },
        target_system: {
          type: 'string',
          enum: ['proxmox', 'k8s'],
          description: 'Target infrastructure system'
        },
        params: {
          type: 'object',
          description: 'Operation-specific parameters (e.g., vmid, deployment name, replicas, etc.)'
        }
      },
      required: ['operation', 'target_system']
    }
  },

  // TIER 3: Worker Swarms
  {
    name: 'cortex_spawn_workers',
    description: 'Spawn 1 to 10,000 workers for parallel task execution. Creates worker swarms for massive parallelization.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of workers to spawn (1-10,000)',
          minimum: 1,
          maximum: 10000
        },
        worker_type: {
          type: 'string',
          enum: ['implementation', 'fix', 'test', 'scan', 'security-fix', 'documentation', 'analysis'],
          description: 'Type of workers to spawn'
        },
        swarm_type: {
          type: 'string',
          description: 'Swarm identifier (e.g., "microservice-build", "security-scan")'
        },
        master: {
          type: 'string',
          enum: ['development', 'security', 'inventory', 'cicd'],
          description: 'Master agent that owns these workers'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          description: 'Worker priority level'
        }
      },
      required: ['count', 'worker_type']
    }
  },

  // TIER 4: Master Coordination
  {
    name: 'cortex_coordinate_masters',
    description: 'Coordinate master agents. Route tasks to appropriate masters, check master status, and manage task delegation.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['route_task', 'get_status', 'list_masters', 'get_capabilities'],
          description: 'Master coordination action'
        },
        task_description: {
          type: 'string',
          description: 'Task description for routing (required for route_task action)'
        },
        master_id: {
          type: 'string',
          description: 'Specific master ID (for get_status action)'
        },
        task_id: {
          type: 'string',
          description: 'Task ID (optional, auto-generated if not provided)'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          description: 'Task priority'
        }
      },
      required: ['action']
    }
  },

  // TIER 5: Full Project Builds
  {
    name: 'cortex_build_project',
    description: 'Build complete projects (e.g., "build 50 microservices in 4 hours"). Decomposes projects into tasks, spawns workers, and aggregates results.',
    inputSchema: {
      type: 'object',
      properties: {
        project_description: {
          type: 'string',
          description: 'High-level project description (e.g., "Build 50 REST API microservices with tests and documentation")'
        },
        target_count: {
          type: 'number',
          description: 'Number of deliverables to build (e.g., 50 microservices)',
          minimum: 1
        },
        time_limit: {
          type: 'string',
          description: 'Time limit for the build (e.g., "4 hours", "2 days")'
        },
        requirements: {
          type: 'object',
          description: 'Project requirements (technologies, patterns, quality criteria)'
        }
      },
      required: ['project_description', 'target_count']
    }
  },

  // TIER 6: Monitoring & Control
  {
    name: 'cortex_get_status',
    description: 'Get comprehensive system status including workers, masters, infrastructure, and operations.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'workers', 'masters', 'infrastructure', 'operations'],
          description: 'Status scope (default: all)'
        },
        details: {
          type: 'boolean',
          description: 'Include detailed metrics (default: true)'
        }
      },
      required: []
    }
  },

  {
    name: 'cortex_control',
    description: 'Control system operations. Can pause, resume, or cancel running operations.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['pause', 'resume', 'cancel', 'abort'],
          description: 'Control operation to perform'
        },
        target: {
          type: 'string',
          enum: ['all', 'workers', 'masters', 'specific'],
          description: 'Control target'
        },
        target_id: {
          type: 'string',
          description: 'Specific target ID (for specific target type)'
        },
        reason: {
          type: 'string',
          description: 'Reason for the control operation'
        }
      },
      required: ['operation', 'target']
    }
  }
];

/**
 * Tool Implementations
 */
const toolImplementations = {
  // TIER 1: cortex_query
  cortex_query: async (args) => {
    const { query, target = 'auto' } = args;

    try {
      // Use MoE router if target is auto
      let selectedTarget = target;
      if (target === 'auto') {
        const routing = routeQuery(query);
        selectedTarget = routing.client || 'k8s';
        console.log(`[cortex_query] MoE routing: ${selectedTarget} (confidence: ${routing.confidence})`);
      }

      // Execute query against selected target
      let result;
      switch (selectedTarget) {
        case 'unifi':
          result = await unifi.query(query);
          break;
        case 'proxmox':
          result = await proxmox.query(query);
          break;
        case 'sandfly':
          result = await sandfly.healthCheck();
          break;
        case 'k8s':
          result = await k8s.query(query);
          break;
        default:
          throw new Error(`Unknown target: ${selectedTarget}`);
      }

      return {
        query,
        target: selectedTarget,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Query failed: ${error.message}`,
        query,
        target
      };
    }
  },

  // TIER 2: cortex_manage_infrastructure
  cortex_manage_infrastructure: async (args) => {
    const { operation, target_system, params = {} } = args;

    try {
      console.log(`[cortex_manage_infrastructure] ${operation} on ${target_system}`);

      let result;
      switch (target_system) {
        case 'proxmox':
          if (operation.includes('vm')) {
            const vmOp = operation.replace('_vm', '');
            result = await proxmox.manageVM(vmOp, params.vmid, params);
          } else {
            throw new Error(`Unsupported Proxmox operation: ${operation}`);
          }
          break;

        case 'k8s':
          if (operation === 'create_pod') {
            result = await k8s.create(params.yaml, params.namespace);
          } else if (operation === 'delete_pod') {
            result = await k8s.delete('pod', params.name, params.namespace);
          } else if (operation === 'scale_deployment') {
            result = await k8s.scale(params.deployment, params.replicas, params.namespace);
          } else {
            throw new Error(`Unsupported k8s operation: ${operation}`);
          }
          break;

        default:
          throw new Error(`Unknown target system: ${target_system}`);
      }

      return {
        operation,
        target_system,
        params,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Infrastructure management failed: ${error.message}`,
        operation,
        target_system
      };
    }
  },

  // TIER 3: cortex_spawn_workers
  cortex_spawn_workers: async (args) => {
    const {
      count,
      worker_type,
      swarm_type = `swarm-${Date.now()}`,
      master = 'development',
      priority = 'normal'
    } = args;

    try {
      console.log(`[cortex_spawn_workers] Spawning ${count} ${worker_type} workers`);

      // Check capacity
      const capacity = await spawner.getAvailableCapacity();
      if (capacity.available < count) {
        return {
          error: true,
          message: `Insufficient capacity. Available: ${capacity.available}, Requested: ${count}`,
          capacity
        };
      }

      // Spawn swarm
      const result = await spawner.spawnSwarm(swarm_type, count, {
        worker_type,
        master: `${master}-master`,
        priority
      });

      return {
        swarm_type,
        worker_count: count,
        worker_type,
        master,
        priority,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Worker spawning failed: ${error.message}`,
        count,
        worker_type
      };
    }
  },

  // TIER 4: cortex_coordinate_masters
  cortex_coordinate_masters: async (args) => {
    const { action, task_description, master_id, task_id, priority = 'normal' } = args;

    try {
      console.log(`[cortex_coordinate_masters] Action: ${action}`);

      let result;
      switch (action) {
        case 'route_task':
          if (!task_description) {
            throw new Error('task_description required for route_task action');
          }
          result = await masterInterface.coordinateTask(task_description, {
            task_id,
            priority
          });
          break;

        case 'get_status':
          if (!master_id) {
            throw new Error('master_id required for get_status action');
          }
          result = await masterInterface.getMasterStatus(master_id);
          break;

        case 'list_masters':
          result = registry.getAllMasters().map(m => ({
            master_id: m.master_id,
            master_name: m.master_name,
            domain: m.domain,
            capabilities: m.capabilities.length
          }));
          break;

        case 'get_capabilities':
          result = registry.getStats();
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        action,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Master coordination failed: ${error.message}`,
        action
      };
    }
  },

  // TIER 5: cortex_build_project
  cortex_build_project: async (args) => {
    const {
      project_description,
      target_count,
      time_limit,
      requirements = {}
    } = args;

    try {
      console.log(`[cortex_build_project] Building: ${project_description} (${target_count} deliverables)`);

      // Step 1: Decompose project into tasks
      const tasks = [];
      for (let i = 0; i < target_count; i++) {
        tasks.push({
          task_id: `build-${i + 1}`,
          description: `${project_description} - deliverable ${i + 1}`,
          type: 'implementation',
          requirements
        });
      }

      // Step 2: Route tasks to appropriate master
      const routing = registry.findBestMaster(project_description);

      // Step 3: Create handoffs for all tasks
      const handoffs = [];
      for (const task of tasks) {
        const handoff = await masterInterface.createHandoff(routing.master_id, task);
        handoffs.push(handoff);
      }

      // Step 4: Spawn workers (1 per task)
      const workers = await spawner.spawnSwarm(`project-${Date.now()}`, target_count, {
        worker_type: 'implementation',
        master: routing.master_id,
        priority: 'high'
      });

      return {
        project_description,
        target_count,
        time_limit,
        routed_to: routing.master_name,
        confidence: routing.confidence,
        tasks_created: tasks.length,
        handoffs_created: handoffs.filter(h => h.success).length,
        workers_spawned: workers.successful,
        status: 'in_progress',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Project build failed: ${error.message}`,
        project_description
      };
    }
  },

  // TIER 6: cortex_get_status
  cortex_get_status: async (args) => {
    const { scope = 'all', details = true } = args;

    try {
      console.log(`[cortex_get_status] Scope: ${scope}, Details: ${details}`);

      const status = {
        timestamp: new Date().toISOString(),
        scope
      };

      if (scope === 'all' || scope === 'workers') {
        status.workers = await monitor.getWorkerStats();
        if (details) {
          status.workers.pool_state = await monitor.getPoolState();
          status.workers.health_metrics = await monitor.getHealthMetrics();
        }
      }

      if (scope === 'all' || scope === 'masters') {
        status.masters = registry.getStats();
        if (details) {
          status.masters.all_masters = registry.getAllMasters();
        }
      }

      if (scope === 'all' || scope === 'infrastructure') {
        const healthChecks = await Promise.all([
          unifi.healthCheck().then(h => ({ unifi: h })),
          proxmox.healthCheck().then(h => ({ proxmox: h })),
          sandfly.healthCheck().then(h => ({ sandfly: h })),
          k8s.healthCheck().then(h => ({ k8s: h }))
        ]);

        status.infrastructure = healthChecks.reduce((acc, h) => ({ ...acc, ...h }), {});
      }

      if (scope === 'all' || scope === 'operations') {
        status.operations = {
          pending_handoffs: (await masterInterface.listPendingHandoffs()).length,
          worker_pool_health: await monitor.isHealthy()
        };
      }

      return status;
    } catch (error) {
      return {
        error: true,
        message: `Status check failed: ${error.message}`,
        scope
      };
    }
  },

  // TIER 6: cortex_control
  cortex_control: async (args) => {
    const { operation, target, target_id, reason = 'User requested' } = args;

    try {
      console.log(`[cortex_control] ${operation} on ${target}${target_id ? ` (${target_id})` : ''}`);

      // This is a placeholder - actual implementation would need control mechanisms
      const result = {
        operation,
        target,
        target_id,
        reason,
        status: 'acknowledged',
        message: `Control operation ${operation} on ${target} has been acknowledged. Implementation depends on target control mechanisms.`,
        timestamp: new Date().toISOString()
      };

      // Log control operation
      console.log(`[cortex_control] ${operation} ${target}: ${reason}`);

      return result;
    } catch (error) {
      return {
        error: true,
        message: `Control operation failed: ${error.message}`,
        operation,
        target
      };
    }
  },

  // SANDFLY SECURITY TOOLS
  sandfly_scan_hosts: async (args) => {
    const { hosts = [], scan_type = 'comprehensive', scan_k3s = false } = args;

    try {
      console.log(`[sandfly_scan_hosts] Scan type: ${scan_type}, K3s: ${scan_k3s}`);

      let result;
      if (scan_k3s) {
        // Scan all K3s nodes
        result = await sandfly.scanK3sNodes();
      } else if (hosts.length > 0) {
        // Scan specific hosts
        result = await sandfly.startScan({
          host_ids: hosts,
          scan_type
        });
      } else {
        // Get all hosts and scan them
        const allHosts = await sandfly.getHosts();
        result = await sandfly.startScan({
          host_ids: allHosts.map(h => h.id),
          scan_type
        });
      }

      return {
        scan_type,
        scan_k3s,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Sandfly scan failed: ${error.message}`,
        scan_type
      };
    }
  },

  sandfly_get_findings: async (args) => {
    const { severity = 'all', host_id, limit = 100 } = args;

    try {
      console.log(`[sandfly_get_findings] Severity: ${severity}, Host: ${host_id || 'all'}`);

      let findings;
      if (host_id) {
        findings = await sandfly.getHostFindings(host_id);
      } else {
        findings = await sandfly.getFindings({ limit });
      }

      // Filter by severity if specified
      if (severity !== 'all' && Array.isArray(findings)) {
        findings = findings.filter(f => f.severity === severity);
      }

      return {
        severity,
        host_id,
        count: Array.isArray(findings) ? findings.length : 0,
        findings,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Failed to get Sandfly findings: ${error.message}`,
        severity
      };
    }
  },

  sandfly_manage_hosts: async (args) => {
    const { action, host_data, host_id } = args;

    try {
      console.log(`[sandfly_manage_hosts] Action: ${action}`);

      let result;
      switch (action) {
        case 'add':
          if (!host_data) {
            throw new Error('host_data required for add action');
          }
          result = await sandfly.addHost(host_data);
          break;

        case 'remove':
          if (!host_id) {
            throw new Error('host_id required for remove action');
          }
          result = await sandfly.deleteHost(host_id);
          break;

        case 'update':
          if (!host_id || !host_data) {
            throw new Error('host_id and host_data required for update action');
          }
          result = await sandfly.updateHost(host_id, host_data);
          break;

        case 'list':
          result = await sandfly.getHosts();
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        action,
        host_id,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Sandfly host management failed: ${error.message}`,
        action
      };
    }
  },

  sandfly_forensics: async (args) => {
    const { host_id, data_type = 'all' } = args;

    try {
      console.log(`[sandfly_forensics] Host: ${host_id}, Type: ${data_type}`);

      const forensics = {};

      if (data_type === 'all' || data_type === 'processes') {
        forensics.processes = await sandfly.getHostProcesses(host_id);
      }
      if (data_type === 'all' || data_type === 'users') {
        forensics.users = await sandfly.getHostUsers(host_id);
      }
      if (data_type === 'all' || data_type === 'services') {
        forensics.services = await sandfly.getHostServices(host_id);
      }
      if (data_type === 'all' || data_type === 'listeners') {
        forensics.listeners = await sandfly.getHostListeners(host_id);
      }
      if (data_type === 'all' || data_type === 'modules') {
        forensics.modules = await sandfly.getHostKernelModules(host_id);
      }
      if (data_type === 'all' || data_type === 'scheduled-tasks') {
        forensics.scheduled_tasks = await sandfly.getHostScheduledTasks(host_id);
      }

      return {
        host_id,
        data_type,
        forensics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: true,
        message: `Sandfly forensics collection failed: ${error.message}`,
        host_id,
        data_type
      };
    }
  }
};

/**
 * Export functions
 */
module.exports = {
  getToolDefinitions: () => toolDefinitions,

  getTool: (name) => {
    const definition = toolDefinitions.find(t => t.name === name);
    if (!definition) return null;

    return {
      definition,
      execute: toolImplementations[name]
    };
  }
};
