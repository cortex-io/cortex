// lib/observability/api/server.js
// Observability Search API Server
// Weeks 7-8 Implementation
//
// REST API for querying events from the Observability Pipeline
// Supports filtering, aggregation, and real-time queries

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

class ObservabilityAPIServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.OBS_API_PORT || 3001,
      host: config.host || '0.0.0.0',
      corsOrigins: config.corsOrigins || ['http://localhost:3000', 'http://localhost:3001'],
      rateLimit: config.rateLimit !== false,
      rateLimitMax: config.rateLimitMax || 100, // requests per window
      rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
      ...config
    };

    this.app = express();
    this.server = null;
    this.dataSource = config.dataSource || null; // PostgreSQL, JSONL, etc.

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    if (this.config.rateLimit) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimitWindow,
        max: this.config.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again later.'
      });
      this.app.use('/api/', limiter);
    }

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // API routes
    const router = express.Router();

    // Events endpoints (search must come before :id to avoid conflicts)
    router.get('/events/search', this.searchEvents.bind(this));
    router.get('/events', this.getEvents.bind(this));
    router.get('/events/:id', this.getEventById.bind(this));

    // Aggregation endpoints
    router.get('/stats', this.getStats.bind(this));
    router.get('/stats/summary', this.getSummary.bind(this));
    router.get('/stats/timeline', this.getTimeline.bind(this));
    router.get('/stats/by-type', this.getStatsByType.bind(this));
    router.get('/stats/by-level', this.getStatsByLevel.bind(this));
    router.get('/stats/costs', this.getCostStats.bind(this));

    // Master/Worker endpoints
    router.get('/masters', this.getMasters.bind(this));
    router.get('/masters/:name/events', this.getMasterEvents.bind(this));
    router.get('/workers/:id/events', this.getWorkerEvents.bind(this));

    this.app.use('/api', router);

    // Serve dashboard (static files)
    if (this.config.serveDashboard !== false) {
      this.app.use(express.static('lib/observability/dashboard/public'));
    }
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString()
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('API Error:', err);

      const statusCode = err.statusCode || 500;
      const message = err.message || 'Internal Server Error';

      res.status(statusCode).json({
        error: err.name || 'Error',
        message: message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });
  }

  // Event endpoints

  async getEvents(req, res, next) {
    try {
      const {
        page = 1,
        limit = 50,
        type,
        level,
        master,
        worker,
        startTime,
        endTime,
        hasError,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      // Build filters
      const filters = {};
      if (type) filters.event_type = type;
      if (level) filters.event_level = level;
      if (master) filters.master_type = master;
      if (worker) filters.worker_type = worker;
      if (hasError !== undefined) filters.has_error = hasError === 'true';
      if (startTime) filters.start_time = new Date(startTime);
      if (endTime) filters.end_time = new Date(endTime);

      // Query data source
      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const result = await this.dataSource.queryEvents({
        filters,
        limit: limitNum,
        offset,
        sortBy,
        sortOrder
      });

      res.json({
        data: result.events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        },
        meta: {
          filters: filters,
          sortBy,
          sortOrder
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventById(req, res, next) {
    try {
      const { id } = req.params;

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const event = await this.dataSource.getEventById(id);

      if (!event) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Event with id ${id} not found`
        });
      }

      res.json({ data: event });
    } catch (error) {
      next(error);
    }
  }

  async searchEvents(req, res, next) {
    try {
      const {
        q,
        page = 1,
        limit = 50
      } = req.query;

      if (!q) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Query parameter "q" is required'
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const result = await this.dataSource.searchEvents({
        query: q,
        limit: limitNum,
        offset
      });

      res.json({
        data: result.events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        },
        meta: {
          query: q
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Aggregation endpoints

  async getStats(req, res, next) {
    try {
      const { startTime, endTime } = req.query;

      const filters = {};
      if (startTime) filters.start_time = new Date(startTime);
      if (endTime) filters.end_time = new Date(endTime);

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const stats = await this.dataSource.getStats(filters);

      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req, res, next) {
    try {
      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const summary = await this.dataSource.getSummary();

      res.json({ data: summary });
    } catch (error) {
      next(error);
    }
  }

  async getTimeline(req, res, next) {
    try {
      const {
        interval = 'hour', // 'minute', 'hour', 'day'
        startTime,
        endTime
      } = req.query;

      const filters = {};
      if (startTime) filters.start_time = new Date(startTime);
      if (endTime) filters.end_time = new Date(endTime);

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const timeline = await this.dataSource.getTimeline({
        interval,
        ...filters
      });

      res.json({ data: timeline });
    } catch (error) {
      next(error);
    }
  }

  async getStatsByType(req, res, next) {
    try {
      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const stats = await this.dataSource.getStatsByType();

      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getStatsByLevel(req, res, next) {
    try {
      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const stats = await this.dataSource.getStatsByLevel();

      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getCostStats(req, res, next) {
    try {
      const { startTime, endTime, groupBy = 'master' } = req.query;

      const filters = {};
      if (startTime) filters.start_time = new Date(startTime);
      if (endTime) filters.end_time = new Date(endTime);

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const costs = await this.dataSource.getCostStats({
        groupBy,
        ...filters
      });

      res.json({ data: costs });
    } catch (error) {
      next(error);
    }
  }

  // Master/Worker endpoints

  async getMasters(req, res, next) {
    try {
      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const masters = await this.dataSource.getMasters();

      res.json({ data: masters });
    } catch (error) {
      next(error);
    }
  }

  async getMasterEvents(req, res, next) {
    try {
      const { name } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const result = await this.dataSource.queryEvents({
        filters: { master_type: name },
        limit: limitNum,
        offset
      });

      res.json({
        data: result.events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkerEvents(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      if (!this.dataSource) {
        throw new Error('No data source configured');
      }

      const result = await this.dataSource.queryEvents({
        filters: { worker_id: id },
        limit: limitNum,
        offset
      });

      res.json({
        data: result.events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Server lifecycle

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Observability API Server listening on http://${this.config.host}:${this.config.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Observability API Server stopped');
          resolve();
        });
      });
    }
  }

  getApp() {
    return this.app;
  }
}

module.exports = ObservabilityAPIServer;
