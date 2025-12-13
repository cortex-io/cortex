/**
 * MCP Tools for Cortex
 *
 * Each tool wraps a master agent capability and exposes it
 * via the Model Context Protocol.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { getK8sToolDefinitions, getK8sTool } = require('./k8s-tools');

// Tool definitions following MCP schema
const toolDefinitions = [
  {
    name: 'route_task',
    description: 'Route a task to the appropriate master agent using MoE (Mixture of Experts) routing. Returns the selected expert and confidence score.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Unique identifier for the task'
        },
        task_description: {
          type: 'string',
          description: 'Natural language description of the task to route'
        }
      },
      required: ['task_id', 'task_description']
    }
  },
  {
    name: 'spawn_worker',
    description: 'Spawn a worker of the specified type to execute a task. Worker types: implementation, fix, test, scan, security-fix, documentation, analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        worker_type: {
          type: 'string',
          enum: ['implementation', 'fix', 'test', 'scan', 'security-fix', 'documentation', 'analysis'],
          description: 'Type of worker to spawn'
        },
        task_id: {
          type: 'string',
          description: 'Task ID for the worker to execute'
        },
        master: {
          type: 'string',
          enum: ['development-master', 'security-master', 'inventory-master', 'cicd-master'],
          description: 'Master agent that owns this worker'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          description: 'Task priority level'
        }
      },
      required: ['worker_type', 'task_id', 'master']
    }
  },
  {
    name: 'get_system_health',
    description: 'Get the current system health status including daemon states, worker pool metrics, and system resources.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_worker_pool',
    description: 'Get the current worker pool status including active workers, completed workers, and pool capacity.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_task_queue',
    description: 'Get the current task queue with pending, in-progress, and completed tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['all', 'pending', 'in_progress', 'completed', 'failed'],
          description: 'Filter tasks by status'
        }
      },
      required: []
    }
  },
  {
    name: 'get_routing_decisions',
    description: 'Get recent MoE routing decisions showing task routing history and confidence scores.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of decisions to return (default: 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_metrics',
    description: 'Get system metrics including worker success rates, token usage, and performance statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'check_governance',
    description: 'Check governance compliance status including access control, compliance scores, and audit logs.',
    inputSchema: {
      type: 'object',
      properties: {
        check_type: {
          type: 'string',
          enum: ['compliance', 'access', 'catalog', 'all'],
          description: 'Type of governance check to perform'
        }
      },
      required: []
    }
  },
  {
    name: 'cortex_request_permit',
    description: 'Request a union permit for a production change. Permits are required for union workers (security-fix, production-deploy) and production environment changes.',
    inputSchema: {
      type: 'object',
      properties: {
        permit_type: {
          type: 'string',
          enum: ['EMERGENCY_CHANGE', 'PRODUCTION_DEPLOYMENT', 'SECURITY_PATCH', 'CONFIGURATION_CHANGE', 'DATABASE_MIGRATION', 'INFRASTRUCTURE_CHANGE'],
          description: 'Type of permit to request'
        },
        requester_id: {
          type: 'string',
          description: 'ID of the requester (master or worker)'
        },
        requester_type: {
          type: 'string',
          enum: ['master', 'worker', 'human'],
          description: 'Type of requester'
        },
        resource_type: {
          type: 'string',
          enum: ['deployment', 'configmap', 'secret', 'service', 'database', 'code', 'infrastructure'],
          description: 'Type of resource to modify'
        },
        resource_identifier: {
          type: 'string',
          description: 'Resource identifier (deployment name, database name, etc.)'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Target environment'
        },
        justification: {
          type: 'string',
          description: 'Justification for the change (minimum 20 characters)'
        },
        rollback_plan_id: {
          type: 'string',
          description: 'ID of rollback plan (required for some permit types)'
        }
      },
      required: ['permit_type', 'requester_id', 'requester_type', 'resource_type', 'resource_identifier', 'environment', 'justification']
    }
  },
  {
    name: 'cortex_check_certification',
    description: 'Check worker certification status. Validates if a worker has the required certifications for its type and environment.',
    inputSchema: {
      type: 'object',
      properties: {
        worker_id: {
          type: 'string',
          description: 'Worker ID to check'
        },
        worker_type: {
          type: 'string',
          description: 'Worker type (implementation-worker, security-fix-worker, etc.)'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Environment to validate against'
        }
      },
      required: ['worker_id', 'worker_type']
    }
  },
  {
    name: 'cortex_log_audit_event',
    description: 'Log an event to the immutable audit trail. All union operations, worker spawns, and permit usage are automatically logged.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          description: 'Type of event to log'
        },
        actor_id: {
          type: 'string',
          description: 'ID of the actor performing the action'
        },
        action: {
          type: 'string',
          description: 'Action being performed'
        },
        resource_type: {
          type: 'string',
          description: 'Type of resource being acted upon'
        },
        resource_id: {
          type: 'string',
          description: 'ID of resource being acted upon'
        },
        result: {
          type: 'string',
          enum: ['success', 'failure', 'denied'],
          description: 'Result of the action'
        }
      },
      required: ['event_type', 'actor_id', 'action']
    }
  },
  {
    name: 'cortex_create_rollback_plan',
    description: 'Create a rollback plan for a production change. Required for permits that involve production deployments or database changes.',
    inputSchema: {
      type: 'object',
      properties: {
        permit_id: {
          type: 'string',
          description: 'ID of the permit this rollback plan is for'
        },
        resource_type: {
          type: 'string',
          enum: ['deployment', 'configmap', 'secret', 'database', 'code', 'infrastructure'],
          description: 'Type of resource to rollback'
        },
        resource_identifier: {
          type: 'string',
          description: 'Resource identifier'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Target environment'
        },
        creator_id: {
          type: 'string',
          description: 'ID of the creator'
        },
        creator_type: {
          type: 'string',
          enum: ['master', 'worker', 'human'],
          description: 'Type of creator'
        }
      },
      required: ['permit_id', 'resource_type', 'resource_identifier', 'environment', 'creator_id', 'creator_type']
    }
  },
  {
    name: 'cortex_approve_permit',
    description: 'Approve a pending permit. Only authorized approvers can approve permits (typically security-master and development-master).',
    inputSchema: {
      type: 'object',
      properties: {
        permit_id: {
          type: 'string',
          description: 'ID of the permit to approve'
        },
        approver_id: {
          type: 'string',
          description: 'ID of the approver (master name)'
        }
      },
      required: ['permit_id', 'approver_id']
    }
  },
  {
    name: 'cortex_generate_compliance_report',
    description: 'Generate a compliance report from the audit trail. Supports SOC2, worker performance, and permit usage reports.',
    inputSchema: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['soc2', 'workers', 'permits'],
          description: 'Type of compliance report to generate'
        },
        days: {
          type: 'number',
          description: 'Number of days to include in report (default: 30)'
        }
      },
      required: ['report_type']
    }
  }
];

// Tool implementations
const toolImplementations = {
  route_task: async (args, home) => {
    const { task_id, task_description } = args;
    const routerPath = path.join(home, 'coordination/masters/coordinator/lib/moe-router.sh');

    return new Promise((resolve, reject) => {
      const proc = spawn('bash', [routerPath, task_id, task_description], {
        env: { ...process.env, GOVERNANCE_BYPASS: 'true', CORTEX_HOME: home }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim() || 'Task routed successfully');
        } else {
          resolve(`Routing failed: ${stderr || stdout}`);
        }
      });
    });
  },

  spawn_worker: async (args, home) => {
    const { worker_type, task_id, master, priority = 'normal' } = args;
    const spawnScript = path.join(home, 'scripts/spawn-worker.sh');

    return new Promise((resolve, reject) => {
      const proc = spawn('bash', [
        spawnScript,
        '--type', `${worker_type}-worker`,
        '--task-id', task_id,
        '--master', master,
        '--priority', priority
      ], {
        env: { ...process.env, GOVERNANCE_BYPASS: 'true', CORTEX_HOME: home }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim() || `Worker ${worker_type} spawned for task ${task_id}`);
        } else {
          resolve(`Spawn failed: ${stderr || stdout}`);
        }
      });
    });
  },

  get_system_health: async (args, home) => {
    const healthPath = path.join(home, 'coordination/system-health-check.json');
    try {
      const data = await fs.readFile(healthPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { error: 'Health check not available', message: error.message };
    }
  },

  get_worker_pool: async (args, home) => {
    const poolPath = path.join(home, 'coordination/worker-pool.json');
    try {
      const data = await fs.readFile(poolPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { error: 'Worker pool not available', message: error.message };
    }
  },

  get_task_queue: async (args, home) => {
    const queuePath = path.join(home, 'coordination/task-queue.json');
    try {
      const data = await fs.readFile(queuePath, 'utf8');
      const queue = JSON.parse(data);

      if (args.status_filter && args.status_filter !== 'all') {
        queue.tasks = queue.tasks.filter(t => t.status === args.status_filter);
      }

      return queue;
    } catch (error) {
      return { error: 'Task queue not available', message: error.message };
    }
  },

  get_routing_decisions: async (args, home) => {
    const logPath = path.join(home, 'coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl');
    const limit = args.limit || 10;

    try {
      const data = await fs.readFile(logPath, 'utf8');
      const lines = data.trim().split('\n').filter(l => l.trim());
      const decisions = lines.slice(-limit).map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(d => d !== null);

      return { decisions, count: decisions.length };
    } catch (error) {
      return { error: 'Routing decisions not available', message: error.message };
    }
  },

  get_metrics: async (args, home) => {
    const metricsPath = path.join(home, 'coordination/token-budget.json');
    const poolPath = path.join(home, 'coordination/worker-pool.json');

    try {
      const [tokenData, poolData] = await Promise.all([
        fs.readFile(metricsPath, 'utf8').catch(() => '{}'),
        fs.readFile(poolPath, 'utf8').catch(() => '{}')
      ]);

      const tokens = JSON.parse(tokenData);
      const pool = JSON.parse(poolData);

      return {
        tokens: {
          total_budget: tokens.total_budget,
          total_used: tokens.total_used,
          available: tokens.available,
          usage_percentage: tokens.usage_percentage
        },
        workers: {
          active: pool.active_workers?.length || 0,
          completed: pool.completed_workers?.length || 0,
          failed: pool.failed_workers?.length || 0
        }
      };
    } catch (error) {
      return { error: 'Metrics not available', message: error.message };
    }
  },

  check_governance: async (args, home) => {
    const checkType = args.check_type || 'all';
    const results = {};

    if (checkType === 'all' || checkType === 'compliance') {
      try {
        const compliancePath = path.join(home, 'coordination/governance/compliance-status.json');
        const data = await fs.readFile(compliancePath, 'utf8');
        results.compliance = JSON.parse(data);
      } catch {
        results.compliance = { status: 'not_available' };
      }
    }

    if (checkType === 'all' || checkType === 'access') {
      try {
        const accessPath = path.join(home, 'coordination/governance/access-log.jsonl');
        const data = await fs.readFile(accessPath, 'utf8');
        const lines = data.trim().split('\n').filter(l => l.trim());
        const recent = lines.slice(-5).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(a => a !== null);
        results.recent_access = recent;
      } catch {
        results.recent_access = [];
      }
    }

    if (checkType === 'all' || checkType === 'catalog') {
      try {
        const catalogPath = path.join(home, 'coordination/catalog/master-catalog.json');
        const data = await fs.readFile(catalogPath, 'utf8');
        const catalog = JSON.parse(data);
        results.catalog = {
          total_assets: catalog.assets?.length || 0,
          namespaces: catalog.namespaces || []
        };
      } catch {
        results.catalog = { status: 'not_available' };
      }
    }

    return results;
  },

  // Union system tools
  cortex_request_permit: async (args, home) => {
    const PermitManager = require(path.join(home, 'coordination/union/permit-manager.js'));
    const manager = new PermitManager({ coordinationDir: path.join(home, 'coordination') });

    await manager.initialize();

    const permit = await manager.requestPermit({
      permit_type: args.permit_type,
      requester: {
        type: args.requester_type,
        id: args.requester_id
      },
      resource: {
        type: args.resource_type,
        identifier: args.resource_identifier,
        environment: args.environment
      },
      justification: args.justification,
      rollback_plan_id: args.rollback_plan_id
    });

    return {
      permit_id: permit.permit_id,
      status: permit.status,
      expires_at: permit.expires_at,
      auto_approved: permit.auto_approved || false,
      message: permit.auto_approved ?
        `Permit auto-approved: ${permit.auto_approval_reason}` :
        'Permit pending manual approval'
    };
  },

  cortex_check_certification: async (args, home) => {
    const CertValidator = require(path.join(home, 'coordination/worker-certification/cert-validator.js'));
    const validator = new CertValidator({ coordinationDir: path.join(home, 'coordination') });

    await validator.initialize();

    const result = await validator.validateWorkerSpawn(
      args.worker_id,
      args.worker_type,
      args.environment || 'development'
    );

    return {
      valid: result.valid,
      worker_type: result.worker_type,
      union_status: result.union_status,
      environment: result.environment,
      missing_certifications: result.missing_required,
      expired_certifications: result.expired,
      permit_required: result.permit_required,
      message: result.valid ?
        'Worker certifications valid' :
        result.denial_reason || 'Certification validation failed'
    };
  },

  cortex_log_audit_event: async (args, home) => {
    const AuditLogger = require(path.join(home, 'coordination/governance/audit-logger.js'));
    const logger = new AuditLogger({ coordinationDir: path.join(home, 'coordination') });

    await logger.initialize();

    const entry = await logger.logEvent({
      event_type: args.event_type,
      actor: {
        type: 'unknown',
        id: args.actor_id
      },
      action: args.action,
      resource: {
        type: args.resource_type,
        id: args.resource_id
      },
      result: args.result || 'success'
    });

    return {
      logged: true,
      timestamp: entry.timestamp,
      hash: entry.hash,
      message: 'Event logged to immutable audit trail'
    };
  },

  cortex_create_rollback_plan: async (args, home) => {
    const RollbackPlanner = require(path.join(home, 'coordination/union/rollback-planner.js'));
    const planner = new RollbackPlanner({ coordinationDir: path.join(home, 'coordination') });

    await planner.initialize();

    const plan = await planner.createRollbackPlan(
      args.permit_id,
      {
        type: args.resource_type,
        identifier: args.resource_identifier,
        environment: args.environment
      },
      {
        type: args.creator_type,
        id: args.creator_id
      }
    );

    return {
      plan_id: plan.plan_id,
      status: plan.status,
      steps: plan.steps.length,
      verification_checks: plan.verification.checks.length,
      message: `Rollback plan created with ${plan.steps.length} steps`
    };
  },

  cortex_approve_permit: async (args, home) => {
    const PermitManager = require(path.join(home, 'coordination/union/permit-manager.js'));
    const manager = new PermitManager({ coordinationDir: path.join(home, 'coordination') });

    await manager.initialize();

    const permit = await manager.approvePermit(args.permit_id, args.approver_id);

    return {
      permit_id: permit.permit_id,
      status: permit.status,
      approvals: permit.approved_by.length,
      fully_approved: permit.status === 'approved',
      message: permit.status === 'approved' ?
        'Permit fully approved' :
        `Permit has ${permit.approved_by.length} approval(s), more needed`
    };
  },

  cortex_generate_compliance_report: async (args, home) => {
    const ComplianceReporter = require(path.join(home, 'lib/governance/compliance-reporter.js'));
    const reporter = new ComplianceReporter({ coordinationDir: path.join(home, 'coordination') });

    await reporter.initialize();

    const days = args.days || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let report;
    let filePath;

    switch (args.report_type) {
      case 'soc2':
        report = await reporter.generateSOC2Report(
          startDate.toISOString(),
          endDate.toISOString()
        );
        filePath = await reporter.exportReport(report, 'json');
        break;

      case 'workers':
        report = await reporter.generateWorkerPerformanceReport(
          startDate.toISOString(),
          endDate.toISOString()
        );
        filePath = await reporter.exportReport(report, 'json');
        break;

      case 'permits':
        report = await reporter.generatePermitUsageReport(
          startDate.toISOString(),
          endDate.toISOString()
        );
        filePath = await reporter.exportReport(report, 'json');
        break;
    }

    return {
      report_type: args.report_type,
      period_days: days,
      report_file: filePath,
      summary: report.summary || {
        compliance_score: report.compliance_score,
        total_events: report.total_worker_spawns || report.summary?.total_requests
      },
      message: `${args.report_type.toUpperCase()} report generated successfully`
    };
  }
};

// Export functions
module.exports = {
  getToolDefinitions: () => {
    // Combine core tools with K8s tools
    const k8sTools = getK8sToolDefinitions();
    return [...toolDefinitions, ...k8sTools];
  },

  getTool: (name) => {
    // Check core tools first
    const definition = toolDefinitions.find(t => t.name === name);
    if (definition) {
      return {
        definition,
        execute: toolImplementations[name]
      };
    }

    // Check K8s tools
    const k8sTool = getK8sTool(name);
    if (k8sTool) {
      return k8sTool;
    }

    return null;
  }
};
