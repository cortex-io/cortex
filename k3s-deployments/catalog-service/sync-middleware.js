#!/usr/bin/env node
/**
 * Cortex Hybrid Data Sync Middleware
 *
 * Orchestrates the Redis ↔ PostgreSQL hybrid architecture:
 * - PostgreSQL: Source of truth (permanent storage)
 * - Redis: Speed layer (cache + ephemeral state)
 *
 * Architecture Patterns:
 * 1. Write-Through Cache: Writes go to both Postgres and Redis
 * 2. Cache-Aside: Reads check Redis first, fall back to Postgres
 * 3. Pub/Sub: Changes broadcast to all instances
 * 4. Invalidation: Smart cache invalidation on updates
 *
 * Usage:
 *   const sync = require('./sync-middleware');
 *   await sync.initialize();
 *   await sync.tasks.create({ ... });
 *   const task = await sync.tasks.get('task-123');
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const EventEmitter = require('events');

class CortexSyncMiddleware extends EventEmitter {
  constructor(config = {}) {
    super();

    // PostgreSQL connection
    this.pg = new Pool({
      host: config.postgres?.host || process.env.POSTGRES_HOST || 'postgres.cortex-system.svc.cluster.local',
      port: config.postgres?.port || process.env.POSTGRES_PORT || 5432,
      database: config.postgres?.database || process.env.POSTGRES_DB || 'cortex',
      user: config.postgres?.user || process.env.POSTGRES_USER || 'cortex',
      password: config.postgres?.password || process.env.POSTGRES_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
    });

    // Redis connection (primary)
    this.redis = new Redis({
      host: config.redis?.host || process.env.REDIS_HOST || 'redis-master.cortex-system.svc.cluster.local',
      port: config.redis?.port || process.env.REDIS_PORT || 6379,
      password: config.redis?.password || process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Redis subscriber (for pub/sub)
    this.redisSub = this.redis.duplicate();

    // Configuration
    this.config = {
      cacheTTL: config.cacheTTL || 300, // 5 minutes default
      enableWriteThrough: config.enableWriteThrough !== false,
      enablePubSub: config.enablePubSub !== false,
      verbose: config.verbose || false,
    };

    // Initialize pub/sub
    if (this.config.enablePubSub) {
      this.setupPubSub();
    }

    this.log('Sync middleware initialized', this.config);
  }

  log(message, data = null) {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] SYNC: ${message}`, data || '');
    }
  }

  async initialize() {
    this.log('Testing connections...');

    // Test PostgreSQL
    const pgClient = await this.pg.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    this.log('PostgreSQL connection: OK');

    // Test Redis
    await this.redis.ping();
    this.log('Redis connection: OK');

    this.emit('ready');
    return true;
  }

  setupPubSub() {
    this.redisSub.subscribe('cortex:sync:invalidate', 'cortex:sync:update');

    this.redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.log(`Received ${channel}`, data);
        this.emit('sync-event', { channel, data });

        // Handle cache invalidation
        if (channel === 'cortex:sync:invalidate') {
          this.handleInvalidation(data);
        }
      } catch (error) {
        this.log('Error processing pub/sub message', error);
      }
    });
  }

  async handleInvalidation(data) {
    const { type, id, pattern } = data;

    if (pattern) {
      // Invalidate by pattern
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.log(`Invalidated ${keys.length} cache keys matching ${pattern}`);
      }
    } else if (type && id) {
      // Invalidate specific item
      const key = `${type}:${id}`;
      await this.redis.del(key);
      this.log(`Invalidated cache key: ${key}`);
    }
  }

  broadcastInvalidation(type, id, pattern = null) {
    if (this.config.enablePubSub) {
      this.redis.publish('cortex:sync:invalidate', JSON.stringify({ type, id, pattern }));
    }
  }

  // ============================================================================
  // TASKS API
  // ============================================================================

  tasks = {
    /**
     * Create a new task
     * Write-through: Writes to both Postgres and Redis
     */
    create: async (taskData) => {
      const taskId = taskData.task_id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Write to PostgreSQL (source of truth)
      const query = `
        INSERT INTO tasks (
          task_id, task_status, task_priority, title, description, task_type,
          assigned_to_agent_id, created_by_agent_id, master_agent_id,
          parent_task_id, tokens_allocated, timeout_minutes, tags, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const values = [
        taskId,
        taskData.status || 'pending',
        taskData.priority || 'medium',
        taskData.title,
        taskData.description || '',
        taskData.type || 'general',
        taskData.assigned_to || null,
        taskData.created_by || 'system',
        taskData.master || null,
        taskData.parent_task_id || null,
        taskData.tokens_allocated || 0,
        taskData.timeout_minutes || 30,
        taskData.tags || [],
        JSON.stringify(taskData.metadata || {})
      ];

      const result = await this.pg.query(query, values);
      const task = result.rows[0];

      // Write to Redis cache
      if (this.config.enableWriteThrough) {
        await this.redis.setex(`task:${taskId}`, this.config.cacheTTL, JSON.stringify(task));
        await this.redis.sadd('tasks:all', taskId);
        await this.redis.sadd(`tasks:status:${task.task_status}`, taskId);
        if (task.assigned_to_agent_id) {
          await this.redis.sadd(`tasks:agent:${task.assigned_to_agent_id}`, taskId);
        }
      }

      // Publish update
      this.redis.publish('cortex:sync:update', JSON.stringify({ type: 'task', action: 'created', id: taskId }));

      this.log(`Created task: ${taskId}`);
      return task;
    },

    /**
     * Get a task by ID
     * Cache-aside: Check Redis first, fall back to Postgres
     */
    get: async (taskId) => {
      // Try cache first
      const cached = await this.redis.get(`task:${taskId}`);
      if (cached) {
        this.log(`Cache HIT: task:${taskId}`);
        return JSON.parse(cached);
      }

      this.log(`Cache MISS: task:${taskId}`);

      // Fall back to Postgres
      const result = await this.pg.query('SELECT * FROM tasks WHERE task_id = $1', [taskId]);
      if (result.rows.length === 0) {
        return null;
      }

      const task = result.rows[0];

      // Populate cache
      await this.redis.setex(`task:${taskId}`, this.config.cacheTTL, JSON.stringify(task));

      return task;
    },

    /**
     * Update a task
     * Write-through with invalidation
     */
    update: async (taskId, updates) => {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
      for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      values.push(taskId); // WHERE clause

      const query = `
        UPDATE tasks
        SET ${setClauses.join(', ')}
        WHERE task_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.pg.query(query, values);
      const task = result.rows[0];

      // Invalidate cache
      await this.redis.del(`task:${taskId}`);
      this.broadcastInvalidation('task', taskId);

      // Update index sets if status changed
      if (updates.task_status) {
        await this.redis.srem(`tasks:status:*`, taskId);
        await this.redis.sadd(`tasks:status:${updates.task_status}`, taskId);
      }

      this.log(`Updated task: ${taskId}`);
      return task;
    },

    /**
     * List tasks by status
     * Redis for fast filtering, Postgres for source of truth
     */
    listByStatus: async (status) => {
      // Get task IDs from Redis index
      const taskIds = await this.redis.smembers(`tasks:status:${status}`);

      if (taskIds.length === 0) {
        return [];
      }

      // Batch fetch from cache or Postgres
      const pipeline = this.redis.pipeline();
      taskIds.forEach(id => pipeline.get(`task:${id}`));
      const results = await pipeline.exec();

      const tasks = [];
      const missingIds = [];

      results.forEach(([err, data], idx) => {
        if (data) {
          tasks.push(JSON.parse(data));
        } else {
          missingIds.push(taskIds[idx]);
        }
      });

      // Fetch missing from Postgres
      if (missingIds.length > 0) {
        const result = await this.pg.query(
          'SELECT * FROM tasks WHERE task_id = ANY($1)',
          [missingIds]
        );
        tasks.push(...result.rows);

        // Populate cache
        for (const task of result.rows) {
          await this.redis.setex(`task:${task.task_id}`, this.config.cacheTTL, JSON.stringify(task));
        }
      }

      return tasks;
    },

    /**
     * Get task hierarchy (uses Postgres function)
     */
    getHierarchy: async (rootTaskId) => {
      const result = await this.pg.query(
        'SELECT * FROM get_task_hierarchy($1)',
        [rootTaskId]
      );
      return result.rows;
    }
  };

  // ============================================================================
  // AGENTS API
  // ============================================================================

  agents = {
    /**
     * Create or update an agent
     */
    upsert: async (agentData) => {
      const query = `
        INSERT INTO agents (
          agent_id, agent_type, agent_status, display_name, master_agent_id,
          token_budget_personal, token_budget_worker_pool, specialization, capabilities
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (agent_id) DO UPDATE SET
          agent_status = EXCLUDED.agent_status,
          token_budget_personal = EXCLUDED.token_budget_personal,
          token_budget_worker_pool = EXCLUDED.token_budget_worker_pool
        RETURNING *
      `;

      const values = [
        agentData.agent_id,
        agentData.agent_type || 'worker',
        agentData.status || 'active',
        agentData.display_name || agentData.agent_id,
        agentData.master_agent_id || null,
        agentData.token_budget_personal || 0,
        agentData.token_budget_worker_pool || 0,
        agentData.specialization || null,
        JSON.stringify(agentData.capabilities || [])
      ];

      const result = await this.pg.query(query, values);
      const agent = result.rows[0];

      // Cache
      await this.redis.setex(`agent:${agent.agent_id}`, this.config.cacheTTL, JSON.stringify(agent));
      await this.redis.sadd('agents:all', agent.agent_id);
      await this.redis.sadd(`agents:type:${agent.agent_type}`, agent.agent_id);

      this.log(`Upserted agent: ${agent.agent_id}`);
      return agent;
    },

    get: async (agentId) => {
      const cached = await this.redis.get(`agent:${agentId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      const result = await this.pg.query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
      if (result.rows.length === 0) {
        return null;
      }

      const agent = result.rows[0];
      await this.redis.setex(`agent:${agentId}`, this.config.cacheTTL, JSON.stringify(agent));
      return agent;
    },

    listByType: async (agentType) => {
      const result = await this.pg.query(
        'SELECT * FROM agents WHERE agent_type = $1 AND agent_status = $2',
        [agentType, 'active']
      );
      return result.rows;
    },

    getUtilization: async (agentId) => {
      const result = await this.pg.query(
        'SELECT * FROM get_agent_utilization($1)',
        [agentId]
      );
      return result.rows[0];
    }
  };

  // ============================================================================
  // ASSETS API
  // ============================================================================

  assets = {
    create: async (assetData) => {
      const assetId = assetData.asset_id || `asset-${Date.now()}`;

      const query = `
        INSERT INTO assets (
          asset_id, asset_type, name, category, namespace, description,
          owner, sensitivity, url, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (asset_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata
        RETURNING *
      `;

      const values = [
        assetId,
        assetData.asset_type || 'repository',
        assetData.name,
        assetData.category || 'general',
        assetData.namespace || 'default',
        assetData.description || '',
        assetData.owner || 'unknown',
        assetData.sensitivity || 'internal',
        assetData.url || null,
        JSON.stringify(assetData.metadata || {})
      ];

      const result = await this.pg.query(query, values);
      const asset = result.rows[0];

      // Cache in Redis (using same structure as catalog-api)
      await this.redis.hset('catalog:assets', assetId, JSON.stringify(asset));
      await this.redis.sadd('catalog:index:types', asset.asset_type);
      await this.redis.sadd(`catalog:index:by_type:${asset.asset_type}`, assetId);
      if (asset.owner) {
        await this.redis.sadd('catalog:index:owners', asset.owner);
        await this.redis.sadd(`catalog:index:by_owner:${asset.owner}`, assetId);
      }
      if (asset.namespace) {
        await this.redis.sadd('catalog:index:namespaces', asset.namespace);
        await this.redis.sadd(`catalog:index:by_namespace:${asset.namespace}`, assetId);
      }

      this.log(`Created asset: ${assetId}`);
      return asset;
    },

    get: async (assetId) => {
      // Try Redis catalog cache first
      const cached = await this.redis.hget('catalog:assets', assetId);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fall back to Postgres
      const result = await this.pg.query('SELECT * FROM assets WHERE asset_id = $1', [assetId]);
      if (result.rows.length === 0) {
        return null;
      }

      const asset = result.rows[0];
      await this.redis.hset('catalog:assets', assetId, JSON.stringify(asset));
      return asset;
    },

    search: async (filters) => {
      // For complex searches, use Postgres
      let query = 'SELECT * FROM assets WHERE 1=1';
      const values = [];
      let paramIndex = 1;

      if (filters.type) {
        query += ` AND asset_type = $${paramIndex}`;
        values.push(filters.type);
        paramIndex++;
      }

      if (filters.owner) {
        query += ` AND owner = $${paramIndex}`;
        values.push(filters.owner);
        paramIndex++;
      }

      if (filters.namespace) {
        query += ` AND namespace = $${paramIndex}`;
        values.push(filters.namespace);
        paramIndex++;
      }

      if (filters.search) {
        query += ` AND search_vector @@ plainto_tsquery('english', $${paramIndex})`;
        values.push(filters.search);
        paramIndex++;
      }

      query += ' LIMIT 100';

      const result = await this.pg.query(query, values);
      return result.rows;
    }
  };

  // ============================================================================
  // AUDIT API
  // ============================================================================

  audit = {
    log: async (eventType, data) => {
      const query = `
        INSERT INTO audit_logs (
          event_type, agent_id, task_id, asset_id, event_summary,
          event_details, severity, security_impact
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const values = [
        eventType,
        data.agent_id || null,
        data.task_id || null,
        data.asset_id || null,
        data.summary,
        JSON.stringify(data.details || {}),
        data.severity || 'info',
        data.security_impact || null
      ];

      const result = await this.pg.query(query, values);
      this.log(`Audit log created: ${result.rows[0].id}`);
      return result.rows[0].id;
    },

    getRecent: async (limit = 100, filters = {}) => {
      let query = 'SELECT * FROM audit_logs WHERE 1=1';
      const values = [];
      let paramIndex = 1;

      if (filters.event_type) {
        query += ` AND event_type = $${paramIndex}`;
        values.push(filters.event_type);
        paramIndex++;
      }

      if (filters.severity) {
        query += ` AND severity = $${paramIndex}`;
        values.push(filters.severity);
        paramIndex++;
      }

      query += ` ORDER BY occurred_at DESC LIMIT $${paramIndex}`;
      values.push(limit);

      const result = await this.pg.query(query, values);
      return result.rows;
    }
  };

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async close() {
    await this.redis.quit();
    await this.redisSub.quit();
    await this.pg.end();
    this.log('Connections closed');
  }
}

// Singleton instance
let instance = null;

module.exports = {
  CortexSyncMiddleware,

  /**
   * Get or create singleton instance
   */
  getInstance: (config) => {
    if (!instance) {
      instance = new CortexSyncMiddleware(config);
    }
    return instance;
  },

  /**
   * Initialize and return instance
   */
  initialize: async (config) => {
    const sync = module.exports.getInstance(config);
    await sync.initialize();
    return sync;
  }
};
