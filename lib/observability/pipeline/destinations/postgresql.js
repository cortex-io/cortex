// lib/observability/pipeline/destinations/postgresql.js
// PostgreSQL Destination - stores events in PostgreSQL for querying
// Weeks 5-6 Implementation
//
// Functionality:
// - Store events in PostgreSQL database
// - Batch inserts for performance
// - Automatic table creation with schema
// - Indexing for common queries
// - Connection pooling
// - Configurable retention policies

const { Destination } = require('../base');

// Optional dependency - gracefully handle if not installed
let Pool;
try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (error) {
  // pg module not installed - will throw helpful error in initialize()
  Pool = null;
}

class PostgreSQLDestination extends Destination {
  constructor(config = {}) {
    super({
      name: config.name || 'PostgreSQLDestination',
      bufferSize: config.bufferSize || 100,
      flushInterval: config.flushInterval || 5000,
      ...config
    });

    // PostgreSQL connection configuration
    this.connectionConfig = {
      host: config.host || process.env.POSTGRES_HOST || 'localhost',
      port: config.port || process.env.POSTGRES_PORT || 5432,
      database: config.database || process.env.POSTGRES_DB || 'cortex_observability',
      user: config.user || process.env.POSTGRES_USER,
      password: config.password || process.env.POSTGRES_PASSWORD,
      max: config.poolSize || 10, // Connection pool size
      idleTimeoutMillis: config.idleTimeout || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 2000
    };

    // Table configuration
    this.tableName = config.tableName || 'events';
    this.createTableIfNotExists = config.createTableIfNotExists !== false;
    this.schemaName = config.schemaName || 'public';

    // Retention policy
    this.retentionDays = config.retentionDays || null; // null = keep forever

    // Connection pool
    this.pool = null;

    // Stats
    this.destinationStats = {
      total_events_written: 0,
      total_batches_written: 0,
      total_errors: 0,
      last_write_at: null
    };
  }

  async initialize() {
    // Check if pg module is available
    if (!Pool) {
      throw new Error('PostgreSQLDestination requires the "pg" package. Install it with: npm install pg');
    }

    // Validate configuration
    if (!this.connectionConfig.user || !this.connectionConfig.password) {
      throw new Error('PostgreSQLDestination requires user and password configuration');
    }

    try {
      // Create connection pool
      this.pool = new Pool(this.connectionConfig);

      // Test connection
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT NOW()');
        console.log(`${this.name}: Connected to PostgreSQL at ${this.connectionConfig.host}:${this.connectionConfig.port}`);
      } finally {
        client.release();
      }

      // Create table if needed
      if (this.createTableIfNotExists) {
        await this.ensureTable();
      }

      // Start auto-flushing
      this.startAutoFlush();

      return true;
    } catch (error) {
      console.error(`${this.name}: Failed to connect to PostgreSQL`, error);
      throw error;
    }
  }

  async ensureTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.schemaName}.${this.tableName} (
        id BIGSERIAL PRIMARY KEY,
        event_id VARCHAR(255),
        event_type VARCHAR(100),
        event_level VARCHAR(50),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_name VARCHAR(255),
        master_type VARCHAR(100),
        worker_type VARCHAR(100),
        data JSONB NOT NULL,
        error TEXT,
        duration_ms INTEGER,
        cost_usd NUMERIC(12, 8),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Create indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp
        ON ${this.schemaName}.${this.tableName}(timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_event_type
        ON ${this.schemaName}.${this.tableName}(event_type);

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_event_level
        ON ${this.schemaName}.${this.tableName}(event_level);

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_error
        ON ${this.schemaName}.${this.tableName}(error)
        WHERE error IS NOT NULL;

      -- GIN index for JSONB queries
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_data_gin
        ON ${this.schemaName}.${this.tableName} USING GIN(data);
    `;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(createTableSQL);
        console.log(`${this.name}: Table ${this.schemaName}.${this.tableName} ready`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`${this.name}: Failed to create table`, error);
      throw error;
    }
  }

  async send(event) {
    // Extract fields from event
    const row = this.extractRowData(event);

    const insertSQL = `
      INSERT INTO ${this.schemaName}.${this.tableName}
      (event_id, event_type, event_level, timestamp, source_name, master_type, worker_type, data, error, duration_ms, cost_usd)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(insertSQL, [
          row.event_id,
          row.event_type,
          row.event_level,
          row.timestamp,
          row.source_name,
          row.master_type,
          row.worker_type,
          row.data,
          row.error,
          row.duration_ms,
          row.cost_usd
        ]);

        this.destinationStats.total_events_written++;
        this.destinationStats.last_write_at = new Date().toISOString();
      } finally {
        client.release();
      }
    } catch (error) {
      this.destinationStats.total_errors++;
      this.emit('error', { destination: this.name, event, error });
      throw error;
    }
  }

  async sendBatch(events) {
    if (events.length === 0) return;

    // Build batch insert query
    const rows = events.map(event => this.extractRowData(event));

    // Generate parameterized query for batch insert
    const valuesClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const row of rows) {
      valuesClauses.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`
      );
      params.push(
        row.event_id,
        row.event_type,
        row.event_level,
        row.timestamp,
        row.source_name,
        row.master_type,
        row.worker_type,
        row.data,
        row.error,
        row.duration_ms,
        row.cost_usd
      );
      paramIndex += 11;
    }

    const insertSQL = `
      INSERT INTO ${this.schemaName}.${this.tableName}
      (event_id, event_type, event_level, timestamp, source_name, master_type, worker_type, data, error, duration_ms, cost_usd)
      VALUES ${valuesClauses.join(', ')}
    `;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(insertSQL, params);

        this.destinationStats.total_events_written += events.length;
        this.destinationStats.total_batches_written++;
        this.destinationStats.last_write_at = new Date().toISOString();

        this.emit('batch_written', { count: events.length });
      } finally {
        client.release();
      }
    } catch (error) {
      this.destinationStats.total_errors++;
      this.emit('error', { destination: this.name, eventCount: events.length, error });
      throw error;
    }
  }

  extractRowData(event) {
    // Extract structured fields from event
    const timestamp = event.timestamp || event.created_at || new Date().toISOString();
    const eventType = event.type || event.event_type || 'unknown';
    const eventLevel = event.level || event.severity || 'info';

    // Extract IDs and metadata
    const eventId = event.id || event.event_id || event._id || null;
    const sourceName = event._source?.name || event.source || null;

    // Extract context
    const masterType = event.master_type || event.master || null;
    const workerType = event.worker_type || event.worker || null;

    // Extract error
    const error = event.error || event.error_message || null;

    // Extract performance metrics
    const durationMs = event.duration_ms || event.duration || null;
    const costUsd = event.cost_estimate?.total_cost_usd || event.cost || null;

    // Store entire event as JSONB for flexible querying
    const data = JSON.stringify(event);

    return {
      event_id: eventId,
      event_type: eventType,
      event_level: eventLevel,
      timestamp: timestamp,
      source_name: sourceName,
      master_type: masterType,
      worker_type: workerType,
      data: data,
      error: error,
      duration_ms: durationMs,
      cost_usd: costUsd
    };
  }

  async applyRetentionPolicy() {
    if (!this.retentionDays) return;

    const deleteSQL = `
      DELETE FROM ${this.schemaName}.${this.tableName}
      WHERE timestamp < NOW() - INTERVAL '${this.retentionDays} days'
    `;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(deleteSQL);
        console.log(`${this.name}: Deleted ${result.rowCount} old events (retention: ${this.retentionDays} days)`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`${this.name}: Failed to apply retention policy`, error);
    }
  }

  async getEventCount() {
    const countSQL = `SELECT COUNT(*) FROM ${this.schemaName}.${this.tableName}`;

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(countSQL);
        return parseInt(result.rows[0].count, 10);
      } finally {
        client.release();
      }
    } catch (error) {
      return 0;
    }
  }

  async shutdown() {
    // Stop auto-flush and flush remaining events
    await super.shutdown();

    // Close connection pool
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getHealth() {
    return {
      ...super.getHealth(),
      database: this.connectionConfig.database,
      host: this.connectionConfig.host,
      port: this.connectionConfig.port,
      tableName: `${this.schemaName}.${this.tableName}`,
      retentionDays: this.retentionDays,
      poolConnections: this.pool ? {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount
      } : null,
      stats: this.destinationStats
    };
  }

  getDestinationStats() {
    return {
      ...this.destinationStats
    };
  }
}

module.exports = PostgreSQLDestination;
