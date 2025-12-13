#!/usr/bin/env node

/**
 * Cortex Rollback Planner
 *
 * Creates rollback plans for production changes:
 * - Generates rollback steps based on change type
 * - Captures pre-change snapshots
 * - Defines trigger conditions
 * - Links to permits
 * - Validates rollback feasibility
 *
 * Required for union worker permits
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class RollbackPlanner {
  constructor(options = {}) {
    this.coordinationDir = options.coordinationDir || path.join(__dirname, '..');
    this.plansDir = path.join(this.coordinationDir, 'union', 'rollback-plans');
    this.snapshotsDir = path.join(this.coordinationDir, 'union', 'snapshots');

    // Rollback step templates
    this.templates = {
      deployment: {
        steps: [
          {
            step: 1,
            action: 'scale_deployment',
            params: {
              deployment: '{deployment_name}',
              replicas: '{previous_replicas}',
              namespace: '{namespace}'
            },
            timeout_seconds: 120,
            critical: true
          },
          {
            step: 2,
            action: 'restore_snapshot',
            params: {
              snapshot_id: '{config_snapshot_id}',
              resource_type: 'configmap'
            },
            timeout_seconds: 60,
            critical: true
          }
        ],
        verification: {
          checks: ['health_check', 'smoke_test'],
          timeout_seconds: 300
        }
      },
      configmap: {
        steps: [
          {
            step: 1,
            action: 'revert_configmap',
            params: {
              configmap: '{configmap_name}',
              snapshot_id: '{snapshot_id}',
              namespace: '{namespace}'
            },
            timeout_seconds: 30,
            critical: true
          }
        ],
        verification: {
          checks: ['health_check'],
          timeout_seconds: 60
        }
      },
      database: {
        steps: [
          {
            step: 1,
            action: 'rollback_database',
            params: {
              database: '{database_name}',
              snapshot_id: '{snapshot_id}',
              method: 'restore'
            },
            timeout_seconds: 600,
            critical: true
          }
        ],
        verification: {
          checks: ['database_check', 'integration_test'],
          timeout_seconds: 300
        }
      },
      code: {
        steps: [
          {
            step: 1,
            action: 'git_revert',
            params: {
              repository: '{repository}',
              commit_sha: '{previous_commit}',
              branch: '{branch}'
            },
            timeout_seconds: 60,
            critical: true
          },
          {
            step: 2,
            action: 'scale_deployment',
            params: {
              deployment: '{deployment_name}',
              replicas: 0,
              namespace: '{namespace}'
            },
            timeout_seconds: 60,
            critical: false
          },
          {
            step: 3,
            action: 'scale_deployment',
            params: {
              deployment: '{deployment_name}',
              replicas: '{previous_replicas}',
              namespace: '{namespace}'
            },
            timeout_seconds: 120,
            critical: true
          }
        ],
        verification: {
          checks: ['health_check', 'smoke_test', 'integration_test'],
          timeout_seconds: 600
        }
      }
    };

    // Default trigger conditions by environment
    this.defaultTriggers = {
      production: [
        'error_rate > 5%',
        'health_check_failed',
        'test_failure_rate > 10%',
        'manual_trigger'
      ],
      staging: [
        'error_rate > 15%',
        'health_check_failed',
        'manual_trigger'
      ],
      development: [
        'manual_trigger'
      ]
    };
  }

  async initialize() {
    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    console.log(`[RollbackPlanner] Initialized at ${this.plansDir}`);
  }

  /**
   * Create rollback plan for a permit
   */
  async createRollbackPlan(permitId, resource, creator, options = {}) {
    const planId = this.generatePlanId(resource.type);

    console.log(`[RollbackPlanner] Creating rollback plan ${planId} for permit ${permitId}`);

    // Capture pre-change snapshots
    const snapshots = await this.captureSnapshots(resource);

    // Generate rollback steps
    const steps = this.generateSteps(resource, snapshots, options);

    // Determine trigger conditions
    const triggers = options.trigger_conditions ||
      this.defaultTriggers[resource.environment] ||
      this.defaultTriggers.development;

    const plan = {
      plan_id: planId,
      linked_permit_id: permitId,
      created_at: new Date().toISOString(),
      created_by: creator,
      target_resource: resource,
      trigger_conditions: triggers,
      steps: steps,
      verification: this.getVerification(resource.type),
      snapshots: snapshots,
      status: 'ready',
      execution_log: [],
      metadata: {
        automated: options.automated !== false,
        ...options.metadata
      }
    };

    // Validate plan
    await this.validatePlan(plan);

    // Save plan
    await this.savePlan(plan);

    console.log(`[RollbackPlanner] Created rollback plan: ${planId}`);

    return plan;
  }

  /**
   * Capture pre-change snapshots
   */
  async captureSnapshots(resource) {
    const snapshotId = this.generateSnapshotId();
    const timestamp = new Date().toISOString();

    const snapshots = {
      config_snapshots: [],
      database_snapshots: [],
      git_commits: []
    };

    switch (resource.type) {
      case 'deployment':
      case 'configmap':
        // Capture Kubernetes resource snapshot
        const configSnapshot = {
          snapshot_id: snapshotId,
          resource: resource.identifier,
          namespace: resource.namespace || 'default',
          timestamp: timestamp,
          snapshot_type: resource.type
        };

        snapshots.config_snapshots.push(configSnapshot);

        // Save snapshot metadata
        await this.saveSnapshot(snapshotId, {
          resource: resource,
          captured_at: timestamp
        });

        break;

      case 'database':
        const dbSnapshot = {
          snapshot_id: snapshotId,
          database: resource.identifier,
          timestamp: timestamp
        };

        snapshots.database_snapshots.push(dbSnapshot);

        await this.saveSnapshot(snapshotId, {
          database: resource.identifier,
          captured_at: timestamp
        });

        break;

      case 'code':
        // Capture current git commit
        const gitSnapshot = {
          commit_sha: 'HEAD', // Would be actual commit SHA in real implementation
          repository: resource.identifier,
          branch: resource.branch || 'main'
        };

        snapshots.git_commits.push(gitSnapshot);

        break;
    }

    return snapshots;
  }

  /**
   * Generate rollback steps from template
   */
  generateSteps(resource, snapshots, options = {}) {
    const template = this.templates[resource.type];

    if (!template) {
      // Generic rollback for unknown types
      return [{
        step: 1,
        action: 'restore_snapshot',
        params: {
          snapshot_id: snapshots.config_snapshots?.[0]?.snapshot_id || 'unknown',
          resource_type: resource.type
        },
        timeout_seconds: 300,
        critical: true
      }];
    }

    // Clone and customize steps
    const steps = JSON.parse(JSON.stringify(template.steps));

    // Replace placeholders
    for (const step of steps) {
      const paramsStr = JSON.stringify(step.params);

      const replacements = {
        '{deployment_name}': resource.identifier,
        '{configmap_name}': resource.identifier,
        '{database_name}': resource.identifier,
        '{namespace}': resource.namespace || 'default',
        '{config_snapshot_id}': snapshots.config_snapshots?.[0]?.snapshot_id || '',
        '{snapshot_id}': snapshots.config_snapshots?.[0]?.snapshot_id ||
                        snapshots.database_snapshots?.[0]?.snapshot_id || '',
        '{previous_commit}': snapshots.git_commits?.[0]?.commit_sha || '',
        '{repository}': resource.identifier,
        '{branch}': resource.branch || 'main',
        '{previous_replicas}': options.previous_replicas || 3
      };

      let updatedParams = paramsStr;
      for (const [placeholder, value] of Object.entries(replacements)) {
        updatedParams = updatedParams.replace(
          new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
          value
        );
      }

      step.params = JSON.parse(updatedParams);
    }

    // Add custom steps if provided
    if (options.custom_steps) {
      steps.push(...options.custom_steps);
    }

    return steps;
  }

  /**
   * Get verification checks for resource type
   */
  getVerification(resourceType) {
    const template = this.templates[resourceType];
    return template?.verification || {
      checks: ['health_check'],
      timeout_seconds: 300
    };
  }

  /**
   * Validate rollback plan
   */
  async validatePlan(plan) {
    // Check required fields
    if (!plan.plan_id || !plan.linked_permit_id) {
      throw new Error('Missing required plan fields');
    }

    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Rollback plan must have at least one step');
    }

    // Validate steps are sequentially numbered
    const expectedSteps = plan.steps.length;
    const actualSteps = new Set(plan.steps.map(s => s.step));

    if (actualSteps.size !== expectedSteps) {
      throw new Error('Rollback steps must be uniquely numbered');
    }

    for (let i = 1; i <= expectedSteps; i++) {
      if (!actualSteps.has(i)) {
        throw new Error(`Missing step ${i} in rollback plan`);
      }
    }

    // Validate verification
    if (!plan.verification || !plan.verification.checks || plan.verification.checks.length === 0) {
      throw new Error('Rollback plan must include verification checks');
    }

    console.log(`[RollbackPlanner] Plan ${plan.plan_id} validated successfully`);
    return true;
  }

  /**
   * Load rollback plan
   */
  async loadPlan(planId) {
    const filePath = path.join(this.plansDir, `${planId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * List rollback plans
   */
  async listPlans(criteria = {}) {
    const files = await fs.readdir(this.plansDir);
    const plans = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const plan = await this.loadPlan(file.replace('.json', ''));

        // Filter by criteria
        if (criteria.status && plan.status !== criteria.status) continue;
        if (criteria.permit_id && plan.linked_permit_id !== criteria.permit_id) continue;

        plans.push(plan);
      }
    }

    return plans;
  }

  /**
   * Update plan status
   */
  async updatePlanStatus(planId, status, metadata = {}) {
    const plan = await this.loadPlan(planId);

    plan.status = status;

    if (status === 'executing') {
      plan.executed_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      plan.completed_at = new Date().toISOString();
    }

    Object.assign(plan.metadata, metadata);

    await this.savePlan(plan);

    return plan;
  }

  // Helper methods

  generatePlanId(resourceType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `rollback-${resourceType}-${timestamp}-${random}`;
  }

  generateSnapshotId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `snapshot-${timestamp}-${random}`;
  }

  async savePlan(plan) {
    const filePath = path.join(this.plansDir, `${plan.plan_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
  }

  async saveSnapshot(snapshotId, data) {
    const filePath = path.join(this.snapshotsDir, `${snapshotId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async loadSnapshot(snapshotId) {
    const filePath = path.join(this.snapshotsDir, `${snapshotId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }
}

// CLI interface
if (require.main === module) {
  const planner = new RollbackPlanner();

  const command = process.argv[2];

  (async () => {
    await planner.initialize();

    switch (command) {
      case 'create':
        const permitId = process.argv[3] || 'permit-test-001';
        const resourceType = process.argv[4] || 'deployment';

        const plan = await planner.createRollbackPlan(
          permitId,
          {
            type: resourceType,
            identifier: 'cortex-api',
            namespace: 'cortex-system',
            environment: 'production'
          },
          { type: 'master', id: 'development-master' }
        );

        console.log('Created rollback plan:', plan.plan_id);
        break;

      case 'list':
        const plans = await planner.listPlans();
        console.log(`Found ${plans.length} rollback plans`);
        plans.forEach(p => {
          console.log(`- ${p.plan_id}: ${p.status} (${p.target_resource.type})`);
        });
        break;

      case 'show':
        const planId = process.argv[3];
        const loadedPlan = await planner.loadPlan(planId);
        console.log('Rollback plan:', JSON.stringify(loadedPlan, null, 2));
        break;

      default:
        console.log('Usage: rollback-planner.js <command> [args]');
        console.log('Commands:');
        console.log('  create <permitId> <resourceType>');
        console.log('  list');
        console.log('  show <planId>');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = RollbackPlanner;
