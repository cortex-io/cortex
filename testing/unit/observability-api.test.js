// testing/unit/observability-api.test.js
// Unit tests for Observability API (Weeks 7-8)

const request = require('supertest');
const { ObservabilityAPIServer, PostgreSQLDataSource } = require('../../lib/observability/api');

// Mock data source
class MockDataSource {
  async initialize() {
    return true;
  }

  async queryEvents(options) {
    return {
      events: [
        {
          id: 1,
          event_type: 'test_event',
          event_level: 'info',
          timestamp: '2025-01-15T10:00:00.000Z',
          master_type: 'development',
          duration_ms: 1500,
          cost_usd: 0.005
        },
        {
          id: 2,
          event_type: 'error_event',
          event_level: 'error',
          timestamp: '2025-01-15T10:05:00.000Z',
          master_type: 'security',
          error: 'Test error',
          duration_ms: 500
        }
      ],
      total: 2
    };
  }

  async getEventById(id) {
    if (id === '1') {
      return {
        id: 1,
        event_type: 'test_event',
        event_level: 'info',
        timestamp: '2025-01-15T10:00:00.000Z'
      };
    }
    return null;
  }

  async searchEvents(options) {
    return {
      events: [
        {
          id: 1,
          event_type: 'test_event',
          message: options.query
        }
      ],
      total: 1
    };
  }

  async getStats() {
    return {
      total_events: 1000,
      error_count: 50,
      warning_count: 100,
      info_count: 850,
      avg_duration_ms: 1200,
      total_cost_usd: 5.50
    };
  }

  async getSummary() {
    return {
      total_events: 1000,
      events_24h: 500,
      events_1h: 50,
      total_errors: 25,
      errors_24h: 10,
      active_masters: 5,
      cost_24h: 2.50
    };
  }

  async getTimeline(options) {
    return [
      {
        timestamp: '2025-01-15T10:00:00.000Z',
        count: 100,
        error_count: 5,
        avg_duration_ms: 1000,
        cost_usd: 0.50
      },
      {
        timestamp: '2025-01-15T11:00:00.000Z',
        count: 150,
        error_count: 3,
        avg_duration_ms: 1200,
        cost_usd: 0.75
      }
    ];
  }

  async getStatsByType() {
    return [
      {
        event_type: 'task_completed',
        count: 500,
        error_count: 10,
        avg_duration_ms: 1500
      },
      {
        event_type: 'task_started',
        count: 300,
        error_count: 5,
        avg_duration_ms: 500
      }
    ];
  }

  async getStatsByLevel() {
    return [
      { event_level: 'info', count: 850, error_count: 0 },
      { event_level: 'warning', count: 100, error_count: 20 },
      { event_level: 'error', count: 50, error_count: 50 }
    ];
  }

  async getCostStats(options) {
    if (options.groupBy === 'master') {
      return [
        { master: 'development', total_cost_usd: 2.50, event_count: 500 },
        { master: 'security', total_cost_usd: 1.50, event_count: 300 }
      ];
    }
    return [];
  }

  async getMasters() {
    return [
      {
        name: 'development',
        event_count: 500,
        error_count: 10,
        last_event_at: '2025-01-15T10:00:00.000Z'
      },
      {
        name: 'security',
        event_count: 300,
        error_count: 5,
        last_event_at: '2025-01-15T09:00:00.000Z'
      }
    ];
  }

  async shutdown() {}
}

describe('ObservabilityAPIServer', () => {
  let server;
  let app;

  beforeAll(async () => {
    const dataSource = new MockDataSource();
    await dataSource.initialize();

    server = new ObservabilityAPIServer({
      dataSource,
      rateLimit: false, // Disable for testing
      serveDashboard: false // Don't serve static files in tests
    });

    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Endpoint', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Events Endpoints', () => {
    test('should get events list', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toBeDefined();
    });

    test('should get events with filters', async () => {
      const response = await request(app)
        .get('/api/events?type=test_event&level=info')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta.filters).toBeDefined();
    });

    test('should get event by ID', async () => {
      const response = await request(app)
        .get('/api/events/1')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(1);
    });

    test('should return 404 for non-existent event', async () => {
      const response = await request(app)
        .get('/api/events/999')
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });

    test('should search events', async () => {
      const response = await request(app)
        .get('/api/events/search?q=test')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta.query).toBe('test');
    });

    test('should require query parameter for search', async () => {
      const response = await request(app)
        .get('/api/events/search')
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('Stats Endpoints', () => {
    test('should get general stats', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.total_events).toBeDefined();
      expect(response.body.data.error_count).toBeDefined();
    });

    test('should get summary', async () => {
      const response = await request(app)
        .get('/api/stats/summary')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.total_events).toBe(1000);
      expect(response.body.data.events_24h).toBe(500);
    });

    test('should get timeline', async () => {
      const response = await request(app)
        .get('/api/stats/timeline?interval=hour')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should get stats by type', async () => {
      const response = await request(app)
        .get('/api/stats/by-type')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get stats by level', async () => {
      const response = await request(app)
        .get('/api/stats/by-level')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get cost stats', async () => {
      const response = await request(app)
        .get('/api/stats/costs?groupBy=master')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Masters Endpoints', () => {
    test('should get masters list', async () => {
      const response = await request(app)
        .get('/api/masters')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should get master events', async () => {
      const response = await request(app)
        .get('/api/masters/development/events')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('should get worker events', async () => {
      const response = await request(app)
        .get('/api/workers/worker-001/events')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoint', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('Pagination', () => {
    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/events?page=1&limit=10')
        .expect(200);

      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    test('should limit maximum page size', async () => {
      const response = await request(app)
        .get('/api/events?limit=10000')
        .expect(200);

      expect(response.body.pagination.limit).toBeLessThanOrEqual(1000);
    });
  });
});

describe('PostgreSQLDataSource', () => {
  test('should create data source with configuration', () => {
    const dataSource = new PostgreSQLDataSource({
      host: 'localhost',
      database: 'test_db',
      user: 'test_user',
      password: 'test_pass',
      tableName: 'custom_events'
    });

    expect(dataSource.config.host).toBe('localhost');
    expect(dataSource.config.database).toBe('test_db');
    expect(dataSource.tableName).toBe('custom_events');
    expect(dataSource.fullTableName).toBe('public.custom_events');
  });

  test('should format event correctly', () => {
    const dataSource = new PostgreSQLDataSource({
      user: 'test',
      password: 'test'
    });

    const row = {
      id: 1,
      event_id: 'evt-123',
      event_type: 'test',
      event_level: 'info',
      timestamp: '2025-01-15T10:00:00.000Z',
      data: JSON.stringify({ message: 'Test event', custom_field: 'value' }),
      error: null,
      duration_ms: 1500,
      cost_usd: '0.005'
    };

    const formatted = dataSource.formatEvent(row);

    expect(formatted.id).toBe(1);
    expect(formatted.event_type).toBe('test');
    expect(formatted.message).toBe('Test event');
    expect(formatted.custom_field).toBe('value');
    expect(formatted.cost_usd).toBe(0.005);
  });
});
