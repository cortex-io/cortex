// lib/observability/api/datasources/postgresql.js
// PostgreSQL Data Source for Observability API
// Weeks 7-8 Implementation
//
// Implements query interface for PostgreSQL backend

// Optional dependency - gracefully handle if not installed
let Pool;
try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (error) {
  Pool = null;
}

class PostgreSQLDataSource {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.POSTGRES_HOST || 'localhost',
      port: config.port || process.env.POSTGRES_PORT || 5432,
      database: config.database || process.env.POSTGRES_DB || 'cortex_observability',
      user: config.user || process.env.POSTGRES_USER,
      password: config.password || process.env.POSTGRES_PASSWORD,
      max: config.poolSize || 10,
      ...config
    };

    this.tableName = config.tableName || 'events';
    this.schemaName = config.schemaName || 'public';
    this.fullTableName = `${this.schemaName}.${this.tableName}`;
    this.pool = null;
  }

  async initialize() {
    if (!Pool) {
      throw new Error('PostgreSQLDataSource requires the "pg" package. Install it with: npm install pg');
    }

    if (!this.config.user || !this.config.password) {
      throw new Error('PostgreSQLDataSource requires user and password configuration');
    }

    try {
      this.pool = new Pool(this.config);

      // Test connection
      const client = await this.pool.connect();
      try {
        await client.query('SELECT NOW()');
        console.log(`PostgreSQLDataSource: Connected to ${this.config.database}`);
      } finally {
        client.release();
      }

      return true;
    } catch (error) {
      console.error('PostgreSQLDataSource: Failed to connect', error);
      throw error;
    }
  }

  async queryEvents(options = {}) {
    const {
      filters = {},
      limit = 50,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = options;

    // Build WHERE clause
    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (filters.event_type) {
      whereClauses.push(`event_type = $${paramIndex++}`);
      params.push(filters.event_type);
    }

    if (filters.event_level) {
      whereClauses.push(`event_level = $${paramIndex++}`);
      params.push(filters.event_level);
    }

    if (filters.master_type) {
      whereClauses.push(`master_type = $${paramIndex++}`);
      params.push(filters.master_type);
    }

    if (filters.worker_type) {
      whereClauses.push(`worker_type = $${paramIndex++}`);
      params.push(filters.worker_type);
    }

    if (filters.worker_id) {
      whereClauses.push(`data->>'worker_id' = $${paramIndex++}`);
      params.push(filters.worker_id);
    }

    if (filters.has_error) {
      whereClauses.push('error IS NOT NULL');
    }

    if (filters.start_time) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.start_time);
    }

    if (filters.end_time) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.end_time);
    }

    const whereClause = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    // Validate sort column
    const validSortColumns = ['timestamp', 'event_type', 'event_level', 'duration_ms', 'cost_usd'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'timestamp';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Query events
    const eventsQuery = `
      SELECT *
      FROM ${this.fullTableName}
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${this.fullTableName}
      ${whereClause}
    `;
    const countParams = params.slice(0, paramIndex - 3); // Exclude limit and offset

    try {
      const client = await this.pool.connect();
      try {
        const [eventsResult, countResult] = await Promise.all([
          client.query(eventsQuery, params),
          client.query(countQuery, countParams)
        ]);

        return {
          events: eventsResult.rows.map(row => this.formatEvent(row)),
          total: parseInt(countResult.rows[0].total, 10)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Query failed', error);
      throw error;
    }
  }

  async getEventById(id) {
    const query = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE id = $1
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query, [id]);
        return result.rows.length > 0 ? this.formatEvent(result.rows[0]) : null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get by ID failed', error);
      throw error;
    }
  }

  async searchEvents(options = {}) {
    const { query, limit = 50, offset = 0 } = options;

    // Full-text search on JSONB data
    const searchQuery = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE data::text ILIKE $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${this.fullTableName}
      WHERE data::text ILIKE $1
    `;

    const searchPattern = `%${query}%`;

    try {
      const client = await this.pool.connect();
      try {
        const [eventsResult, countResult] = await Promise.all([
          client.query(searchQuery, [searchPattern, limit, offset]),
          client.query(countQuery, [searchPattern])
        ]);

        return {
          events: eventsResult.rows.map(row => this.formatEvent(row)),
          total: parseInt(countResult.rows[0].total, 10)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Search failed', error);
      throw error;
    }
  }

  async getStats(filters = {}) {
    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (filters.start_time) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.start_time);
    }

    if (filters.end_time) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.end_time);
    }

    const whereClause = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const query = `
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT event_type) as unique_types,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
        COUNT(*) FILTER (WHERE event_level = 'error') as error_level_count,
        COUNT(*) FILTER (WHERE event_level = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE event_level = 'info') as info_count,
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(cost_usd) as total_cost_usd,
        MIN(timestamp) as earliest_event,
        MAX(timestamp) as latest_event
      FROM ${this.fullTableName}
      ${whereClause}
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query, params);
        const row = result.rows[0];

        return {
          total_events: parseInt(row.total_events, 10),
          unique_types: parseInt(row.unique_types, 10),
          error_count: parseInt(row.error_count, 10),
          error_level_count: parseInt(row.error_level_count, 10),
          warning_count: parseInt(row.warning_count, 10),
          info_count: parseInt(row.info_count, 10),
          avg_duration_ms: parseFloat(row.avg_duration_ms) || 0,
          max_duration_ms: parseInt(row.max_duration_ms) || 0,
          total_cost_usd: parseFloat(row.total_cost_usd) || 0,
          earliest_event: row.earliest_event,
          latest_event: row.latest_event
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get stats failed', error);
      throw error;
    }
  }

  async getSummary() {
    const query = `
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours') as events_24h,
        COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 hour') as events_1h,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as total_errors,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND timestamp > NOW() - INTERVAL '24 hours') as errors_24h,
        COUNT(DISTINCT master_type) as active_masters,
        SUM(cost_usd) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours') as cost_24h
      FROM ${this.fullTableName}
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query);
        const row = result.rows[0];

        return {
          total_events: parseInt(row.total_events, 10),
          events_24h: parseInt(row.events_24h, 10),
          events_1h: parseInt(row.events_1h, 10),
          total_errors: parseInt(row.total_errors, 10),
          errors_24h: parseInt(row.errors_24h, 10),
          active_masters: parseInt(row.active_masters, 10),
          cost_24h: parseFloat(row.cost_24h) || 0
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get summary failed', error);
      throw error;
    }
  }

  async getTimeline(options = {}) {
    const { interval = 'hour', start_time, end_time } = options;

    // Map interval to PostgreSQL interval
    const intervalMap = {
      'minute': '1 minute',
      'hour': '1 hour',
      'day': '1 day'
    };
    const pgInterval = intervalMap[interval] || '1 hour';

    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (start_time) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      params.push(start_time);
    }

    if (end_time) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      params.push(end_time);
    }

    const whereClause = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const query = `
      SELECT
        date_trunc('${interval}', timestamp) as time_bucket,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
        AVG(duration_ms) as avg_duration_ms,
        SUM(cost_usd) as cost_usd
      FROM ${this.fullTableName}
      ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query, params);

        return result.rows.map(row => ({
          timestamp: row.time_bucket,
          count: parseInt(row.count, 10),
          error_count: parseInt(row.error_count, 10),
          avg_duration_ms: parseFloat(row.avg_duration_ms) || 0,
          cost_usd: parseFloat(row.cost_usd) || 0
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get timeline failed', error);
      throw error;
    }
  }

  async getStatsByType() {
    const query = `
      SELECT
        event_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
        AVG(duration_ms) as avg_duration_ms,
        SUM(cost_usd) as total_cost_usd
      FROM ${this.fullTableName}
      WHERE event_type IS NOT NULL
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 50
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query);

        return result.rows.map(row => ({
          event_type: row.event_type,
          count: parseInt(row.count, 10),
          error_count: parseInt(row.error_count, 10),
          avg_duration_ms: parseFloat(row.avg_duration_ms) || 0,
          total_cost_usd: parseFloat(row.total_cost_usd) || 0
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get stats by type failed', error);
      throw error;
    }
  }

  async getStatsByLevel() {
    const query = `
      SELECT
        event_level,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count
      FROM ${this.fullTableName}
      WHERE event_level IS NOT NULL
      GROUP BY event_level
      ORDER BY count DESC
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query);

        return result.rows.map(row => ({
          event_level: row.event_level,
          count: parseInt(row.count, 10),
          error_count: parseInt(row.error_count, 10)
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get stats by level failed', error);
      throw error;
    }
  }

  async getCostStats(options = {}) {
    const { groupBy = 'master', start_time, end_time } = options;

    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (start_time) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      params.push(start_time);
    }

    if (end_time) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      params.push(end_time);
    }

    const whereClause = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const groupByColumn = groupBy === 'master' ? 'master_type' : 'event_type';

    const query = `
      SELECT
        ${groupByColumn} as group_key,
        SUM(cost_usd) as total_cost_usd,
        COUNT(*) as event_count,
        AVG(cost_usd) as avg_cost_usd
      FROM ${this.fullTableName}
      ${whereClause}
      AND ${groupByColumn} IS NOT NULL
      AND cost_usd IS NOT NULL
      GROUP BY ${groupByColumn}
      ORDER BY total_cost_usd DESC
      LIMIT 50
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query, params);

        return result.rows.map(row => ({
          [groupBy]: row.group_key,
          total_cost_usd: parseFloat(row.total_cost_usd) || 0,
          event_count: parseInt(row.event_count, 10),
          avg_cost_usd: parseFloat(row.avg_cost_usd) || 0
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get cost stats failed', error);
      throw error;
    }
  }

  async getMasters() {
    const query = `
      SELECT
        master_type,
        COUNT(*) as event_count,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
        MAX(timestamp) as last_event_at,
        SUM(cost_usd) as total_cost_usd
      FROM ${this.fullTableName}
      WHERE master_type IS NOT NULL
      GROUP BY master_type
      ORDER BY event_count DESC
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(query);

        return result.rows.map(row => ({
          name: row.master_type,
          event_count: parseInt(row.event_count, 10),
          error_count: parseInt(row.error_count, 10),
          last_event_at: row.last_event_at,
          total_cost_usd: parseFloat(row.total_cost_usd) || 0
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('PostgreSQLDataSource: Get masters failed', error);
      throw error;
    }
  }

  formatEvent(row) {
    // Parse JSONB data field
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;

    return {
      id: row.id,
      event_id: row.event_id,
      event_type: row.event_type,
      event_level: row.event_level,
      timestamp: row.timestamp,
      source_name: row.source_name,
      master_type: row.master_type,
      worker_type: row.worker_type,
      error: row.error,
      duration_ms: row.duration_ms,
      cost_usd: row.cost_usd ? parseFloat(row.cost_usd) : null,
      created_at: row.created_at,
      ...data // Spread full event data
    };
  }

  async shutdown() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = PostgreSQLDataSource;
