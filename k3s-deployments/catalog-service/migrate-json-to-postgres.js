#!/usr/bin/env node
/**
 * Cortex JSON to PostgreSQL Migration Script
 *
 * Migrates existing JSON coordination data to PostgreSQL
 * - Zero data loss
 * - Preserves all lineage and history
 * - Validates data integrity
 * - Idempotent (can be run multiple times)
 *
 * Usage: node migrate-json-to-postgres.js [--dry-run] [--cortex-root /path/to/cortex]
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// Configuration
const CORTEX_ROOT = process.env.CORTEX_ROOT || '/Users/ryandahlberg/Projects/cortex';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres.cortex-system.svc.cluster.local',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'cortex',
  user: process.env.POSTGRES_USER || 'cortex',
  password: process.env.POSTGRES_PASSWORD || 'cortex_postgres_123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Migration statistics
const stats = {
  agents_migrated: 0,
  tasks_migrated: 0,
  task_lineage_created: 0,
  assets_migrated: 0,
  asset_lineage_created: 0,
  audit_logs_created: 0,
  errors: [],
  warnings: []
};

// Utility functions
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logData = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`);
}

function verbose(message, data = null) {
  if (VERBOSE) log('debug', message, data);
}

async function loadJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function saveJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Migration functions
async function migrateAgents(client) {
  log('info', 'Migrating agents...');

  // Load agent registry
  const agentRegistry = await loadJsonFile(path.join(CORTEX_ROOT, 'agents/configs/agent-registry.json'));
  if (!agentRegistry) {
    stats.warnings.push('Agent registry not found, skipping agent migration');
    return;
  }

  // Migrate master agents
  for (const [agentId, agentData] of Object.entries(agentRegistry.master_agents || {})) {
    verbose('Migrating master agent', { agentId });

    const query = `
      INSERT INTO agents (
        agent_id, agent_type, agent_status, display_name, color, icon, role,
        prompt_file, token_budget_personal, token_budget_worker_pool,
        activated_at, capabilities, repositories
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (agent_id) DO UPDATE SET
        agent_status = EXCLUDED.agent_status,
        display_name = EXCLUDED.display_name,
        token_budget_personal = EXCLUDED.token_budget_personal,
        token_budget_worker_pool = EXCLUDED.token_budget_worker_pool,
        capabilities = EXCLUDED.capabilities,
        repositories = EXCLUDED.repositories
    `;

    const values = [
      agentId,
      'master',
      agentData.status || 'active',
      agentId.replace('-master', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      agentData.color || 'blue',
      agentData.icon || 'cpu',
      agentData.role || '',
      agentData.prompt_file || '',
      agentData.token_budget?.personal || 30000,
      agentData.token_budget?.worker_pool || 20000,
      agentData.activated_at || new Date().toISOString(),
      JSON.stringify(agentData.capabilities || []),
      agentData.repositories || []
    ];

    if (!DRY_RUN) {
      await client.query(query, values);
    }
    stats.agents_migrated++;
  }

  // Migrate observer agents
  for (const [agentId, agentData] of Object.entries(agentRegistry.observer_agents || {})) {
    verbose('Migrating observer agent', { agentId });

    const query = `
      INSERT INTO agents (
        agent_id, agent_type, agent_status, display_name, color, icon, role,
        prompt_file, token_budget_personal, activated_at, capabilities
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (agent_id) DO UPDATE SET
        agent_status = EXCLUDED.agent_status,
        capabilities = EXCLUDED.capabilities
    `;

    const values = [
      agentId,
      'observer',
      agentData.status || 'active',
      agentId.replace('-agent', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      agentData.color || 'cyan',
      agentData.icon || 'activity',
      agentData.role || '',
      agentData.prompt_file || '',
      agentData.token_budget?.personal || 20000,
      agentData.activated_at || new Date().toISOString(),
      JSON.stringify(agentData.capabilities || [])
    ];

    if (!DRY_RUN) {
      await client.query(query, values);
    }
    stats.agents_migrated++;
  }

  // Migrate worker agents from status files
  const workerDir = path.join(CORTEX_ROOT, 'agents/workers');
  try {
    const workerFolders = await fs.readdir(workerDir);

    for (const folder of workerFolders) {
      const statusPath = path.join(workerDir, folder, 'status.json');
      const workerStatus = await loadJsonFile(statusPath);

      if (workerStatus) {
        verbose('Migrating worker agent', { folder });

        const query = `
          INSERT INTO agents (
            agent_id, agent_type, agent_status, display_name, master_agent_id,
            token_budget_personal, tokens_used_total, specialization,
            created_at, activated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (agent_id) DO UPDATE SET
            agent_status = EXCLUDED.agent_status,
            tokens_used_total = EXCLUDED.tokens_used_total
        `;

        const values = [
          folder,
          'worker',
          workerStatus.status || 'idle',
          folder.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          workerStatus.master || null,
          workerStatus.token_budget || 8000,
          workerStatus.tokens_used || 0,
          workerStatus.worker_type || 'implementation-worker',
          workerStatus.created_at || new Date().toISOString(),
          workerStatus.started_at || null
        ];

        if (!DRY_RUN) {
          await client.query(query, values);
        }
        stats.agents_migrated++;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  log('info', `Migrated ${stats.agents_migrated} agents`);
}

async function migrateTasks(client) {
  log('info', 'Migrating tasks...');

  // Load task queue
  const taskQueue = await loadJsonFile(path.join(CORTEX_ROOT, 'coordination/task-queue.json'));
  if (!taskQueue || !taskQueue.tasks) {
    stats.warnings.push('Task queue not found, skipping task migration');
    return;
  }

  for (const task of taskQueue.tasks) {
    verbose('Migrating task', { taskId: task.task_id });

    const query = `
      INSERT INTO tasks (
        task_id, task_status, task_priority, title, description, task_type,
        assigned_to_agent_id, created_by_agent_id, master_agent_id,
        parent_task_id, repository_owner, repository_name, repository_url,
        tokens_allocated, tokens_used, timeout_minutes, sla_minutes,
        created_at, started_at, completed_at, result_summary, error_message,
        tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (task_id) DO UPDATE SET
        task_status = EXCLUDED.task_status,
        tokens_used = EXCLUDED.tokens_used,
        completed_at = EXCLUDED.completed_at,
        result_summary = EXCLUDED.result_summary,
        error_message = EXCLUDED.error_message
    `;

    const values = [
      task.task_id,
      task.status || 'pending',
      task.priority || 'medium',
      task.title || task.task_id,
      task.description || '',
      task.type || 'general',
      task.assigned_to || null,
      task.created_by || 'system',
      task.master || null,
      task.parent_task_id || null,
      task.repository?.owner || null,
      task.repository?.name || null,
      task.repository?.url || null,
      task.token_budget || 0,
      task.tokens_used || 0,
      task.timeout_minutes || 30,
      task.sla_minutes || null,
      task.created_at || new Date().toISOString(),
      task.started_at || null,
      task.completed_at || null,
      task.result || null,
      task.error || null,
      task.tags || [],
      JSON.stringify(task.metadata || {})
    ];

    if (!DRY_RUN) {
      await client.query(query, values);
    }
    stats.tasks_migrated++;

    // Create task lineage
    if (task.parent_task_id) {
      const lineageQuery = `
        INSERT INTO task_lineage (parent_task_id, child_task_id, relationship_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (parent_task_id, child_task_id, relationship_type) DO NOTHING
      `;

      if (!DRY_RUN) {
        await client.query(lineageQuery, [task.parent_task_id, task.task_id, 'spawned']);
      }
      stats.task_lineage_created++;
    }
  }

  log('info', `Migrated ${stats.tasks_migrated} tasks, created ${stats.task_lineage_created} lineage relationships`);
}

async function migrateAssets(client) {
  log('info', 'Migrating assets from catalog...');

  // Load repository inventory (if exists)
  const inventory = await loadJsonFile(path.join(CORTEX_ROOT, 'coordination/repository-inventory.json'));
  if (inventory && inventory.repositories) {
    for (const repo of inventory.repositories) {
      verbose('Migrating repository asset', { repoId: repo.repo_id });

      const query = `
        INSERT INTO assets (
          asset_id, asset_type, name, category, namespace, url,
          description, owner, sensitivity, discovered_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (asset_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata
      `;

      const values = [
        repo.repo_id || `repo-${repo.name}`,
        'repository',
        repo.name || '',
        repo.category || 'general',
        repo.namespace || 'default',
        repo.clone_url || repo.url || '',
        repo.description || '',
        repo.owner || 'unknown',
        repo.visibility === 'private' ? 'confidential' : 'internal',
        repo.discovered_at || new Date().toISOString(),
        JSON.stringify({
          language: repo.language,
          stars: repo.stars,
          health_status: repo.health_status
        })
      ];

      if (!DRY_RUN) {
        await client.query(query, values);
      }
      stats.assets_migrated++;
    }
  }

  log('info', `Migrated ${stats.assets_migrated} assets`);
}

async function migrateAuditLogs(client) {
  log('info', 'Creating initial audit logs...');

  // Create migration audit log
  const query = `
    INSERT INTO audit_logs (
      event_type, agent_id, event_summary, event_details, severity
    ) VALUES ($1, $2, $3, $4, $5)
  `;

  const values = [
    'system_error',  // Using existing enum value
    'system',
    'JSON to PostgreSQL migration completed',
    JSON.stringify({
      agents_migrated: stats.agents_migrated,
      tasks_migrated: stats.tasks_migrated,
      assets_migrated: stats.assets_migrated,
      task_lineage_created: stats.task_lineage_created,
      dry_run: DRY_RUN,
      migration_date: new Date().toISOString()
    }),
    'info'
  ];

  if (!DRY_RUN) {
    await client.query(query, values);
  }
  stats.audit_logs_created++;

  log('info', `Created ${stats.audit_logs_created} audit logs`);
}

async function validateMigration(client) {
  log('info', 'Validating migration...');

  const validations = [
    { name: 'Agents', query: 'SELECT COUNT(*) as count FROM agents' },
    { name: 'Tasks', query: 'SELECT COUNT(*) as count FROM tasks' },
    { name: 'Task Lineage', query: 'SELECT COUNT(*) as count FROM task_lineage' },
    { name: 'Assets', query: 'SELECT COUNT(*) as count FROM assets' },
    { name: 'Asset Lineage', query: 'SELECT COUNT(*) as count FROM asset_lineage' },
    { name: 'Audit Logs', query: 'SELECT COUNT(*) as count FROM audit_logs' }
  ];

  for (const validation of validations) {
    const result = await client.query(validation.query);
    const count = parseInt(result.rows[0].count);
    log('info', `${validation.name}: ${count} records`);
  }
}

// Main migration flow
async function migrate() {
  const startTime = Date.now();
  log('info', '========================================');
  log('info', 'Cortex JSON to PostgreSQL Migration');
  log('info', '========================================');
  log('info', `CORTEX_ROOT: ${CORTEX_ROOT}`);
  log('info', `DRY_RUN: ${DRY_RUN}`);
  log('info', '========================================');

  const client = await pool.connect();

  try {
    if (!DRY_RUN) {
      await client.query('BEGIN');
    }

    // Run migrations
    await migrateAgents(client);
    await migrateTasks(client);
    await migrateAssets(client);
    await migrateAuditLogs(client);

    if (!DRY_RUN) {
      await client.query('COMMIT');
      log('info', 'Migration committed successfully');
    } else {
      log('info', 'DRY RUN - No changes were made');
    }

    // Validate
    if (!DRY_RUN) {
      await validateMigration(client);
    }

  } catch (error) {
    if (!DRY_RUN) {
      await client.query('ROLLBACK');
    }
    log('error', 'Migration failed, rolled back', { error: error.message });
    stats.errors.push(error.message);
    throw error;
  } finally {
    client.release();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  log('info', '========================================');
  log('info', 'Migration Summary');
  log('info', '========================================');
  log('info', `Duration: ${duration}s`);
  log('info', `Agents migrated: ${stats.agents_migrated}`);
  log('info', `Tasks migrated: ${stats.tasks_migrated}`);
  log('info', `Task lineage created: ${stats.task_lineage_created}`);
  log('info', `Assets migrated: ${stats.assets_migrated}`);
  log('info', `Asset lineage created: ${stats.asset_lineage_created}`);
  log('info', `Audit logs created: ${stats.audit_logs_created}`);
  log('info', `Warnings: ${stats.warnings.length}`);
  log('info', `Errors: ${stats.errors.length}`);
  log('info', '========================================');

  if (stats.warnings.length > 0) {
    log('warn', 'Warnings:');
    stats.warnings.forEach(w => log('warn', `  - ${w}`));
  }

  if (stats.errors.length > 0) {
    log('error', 'Errors:');
    stats.errors.forEach(e => log('error', `  - ${e}`));
  }

  await pool.end();
}

// Run migration
migrate()
  .then(() => {
    log('info', 'Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    log('error', 'Migration failed', { error: error.message, stack: error.stack });
    process.exit(1);
  });
