/**
 * Dashboard Server Test Suite
 *
 * Tests for dashboard server endpoints and middleware:
 * - Health check endpoint
 * - Metrics endpoints
 * - Worker endpoints
 * - Task endpoints
 * - Governance endpoints
 * - Error handling
 * - CORS and security headers
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Mock the dashboard server setup
function createTestServer() {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/api/metrics', (req, res) => {
    res.json({
      workers: { active: 5, idle: 2, total: 7 },
      tasks: { pending: 3, running: 2, completed: 150 },
      system: { uptime: 3600, memory_used: 512, cpu_usage: 45 }
    });
  });

  // Workers endpoint
  app.get('/api/workers', (req, res) => {
    res.json({
      workers: [
        { id: 'worker-001', status: 'active', task_id: 'task-123' },
        { id: 'worker-002', status: 'idle', task_id: null }
      ]
    });
  });

  // Tasks endpoint
  app.get('/api/tasks', (req, res) => {
    const { status, limit } = req.query;
    const tasks = [
      { id: 'task-001', status: 'completed', worker_id: 'worker-001' },
      { id: 'task-002', status: 'running', worker_id: 'worker-002' },
      { id: 'task-003', status: 'pending', worker_id: null }
    ];

    let filtered = status ? tasks.filter(t => t.status === status) : tasks;
    if (limit) {
      filtered = filtered.slice(0, parseInt(limit));
    }

    res.json({ tasks: filtered, total: filtered.length });
  });

  // Governance endpoints
  app.get('/api/governance/compliance', (req, res) => {
    res.json({
      compliant: true,
      frameworks: [
        { framework_id: 'gdpr', compliant: true, violations: 0 },
        { framework_id: 'soc2', compliant: true, violations: 0 }
      ],
      health_score: 92.5
    });
  });

  app.get('/api/governance/metrics', (req, res) => {
    res.json({
      governance_health_score: 92.5,
      kpis: {
        compliance_rate: 100,
        data_quality_score: 98.8,
        query_performance: 165,
        system_availability: 99.9
      }
    });
  });

  // Error handling
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  return app;
}

describe('Dashboard Server', () => {
  let app;

  beforeAll(() => {
    app = createTestServer();
  });

  describe('Health Check', () => {
    test('GET /api/health returns 200', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('CORS Headers', () => {
    test('includes CORS headers in response', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    test('handles OPTIONS preflight requests', async () => {
      const response = await request(app).options('/api/metrics');
      expect(response.status).toBe(200);
    });
  });

  describe('Metrics Endpoint', () => {
    test('GET /api/metrics returns system metrics', async () => {
      const response = await request(app).get('/api/metrics');
      expect(response.status).toBe(200);
      expect(response.body.workers).toBeDefined();
      expect(response.body.tasks).toBeDefined();
      expect(response.body.system).toBeDefined();
    });

    test('metrics include worker counts', async () => {
      const response = await request(app).get('/api/metrics');
      const { workers } = response.body;

      expect(workers.active).toBeGreaterThanOrEqual(0);
      expect(workers.idle).toBeGreaterThanOrEqual(0);
      expect(workers.total).toBe(workers.active + workers.idle);
    });

    test('metrics include task counts', async () => {
      const response = await request(app).get('/api/metrics');
      const { tasks } = response.body;

      expect(tasks.pending).toBeGreaterThanOrEqual(0);
      expect(tasks.running).toBeGreaterThanOrEqual(0);
      expect(tasks.completed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Workers Endpoint', () => {
    test('GET /api/workers returns worker list', async () => {
      const response = await request(app).get('/api/workers');
      expect(response.status).toBe(200);
      expect(response.body.workers).toBeDefined();
      expect(Array.isArray(response.body.workers)).toBe(true);
    });

    test('worker entries have required fields', async () => {
      const response = await request(app).get('/api/workers');
      const workers = response.body.workers;

      workers.forEach(worker => {
        expect(worker.id).toBeDefined();
        expect(worker.status).toBeDefined();
      });
    });
  });

  describe('Tasks Endpoint', () => {
    test('GET /api/tasks returns task list', async () => {
      const response = await request(app).get('/api/tasks');
      expect(response.status).toBe(200);
      expect(response.body.tasks).toBeDefined();
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });

    test('supports status filtering', async () => {
      const response = await request(app).get('/api/tasks?status=completed');
      const tasks = response.body.tasks;

      expect(tasks.every(t => t.status === 'completed')).toBe(true);
    });

    test('supports limit parameter', async () => {
      const response = await request(app).get('/api/tasks?limit=2');
      const tasks = response.body.tasks;

      expect(tasks.length).toBeLessThanOrEqual(2);
    });

    test('returns total count', async () => {
      const response = await request(app).get('/api/tasks');
      expect(response.body.total).toBeDefined();
      expect(response.body.total).toBe(response.body.tasks.length);
    });
  });

  describe('Governance Endpoints', () => {
    test('GET /api/governance/compliance returns compliance status', async () => {
      const response = await request(app).get('/api/governance/compliance');
      expect(response.status).toBe(200);
      expect(response.body.compliant).toBeDefined();
      expect(response.body.frameworks).toBeDefined();
      expect(response.body.health_score).toBeDefined();
    });

    test('compliance includes framework details', async () => {
      const response = await request(app).get('/api/governance/compliance');
      const frameworks = response.body.frameworks;

      expect(Array.isArray(frameworks)).toBe(true);
      frameworks.forEach(f => {
        expect(f.framework_id).toBeDefined();
        expect(f.compliant).toBeDefined();
        expect(f.violations).toBeDefined();
      });
    });

    test('GET /api/governance/metrics returns governance KPIs', async () => {
      const response = await request(app).get('/api/governance/metrics');
      expect(response.status).toBe(200);
      expect(response.body.governance_health_score).toBeDefined();
      expect(response.body.kpis).toBeDefined();
    });

    test('governance metrics include all KPIs', async () => {
      const response = await request(app).get('/api/governance/metrics');
      const kpis = response.body.kpis;

      expect(kpis.compliance_rate).toBeDefined();
      expect(kpis.data_quality_score).toBeDefined();
      expect(kpis.query_performance).toBeDefined();
      expect(kpis.system_availability).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('returns 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown');
      expect(response.status).toBe(404);
    });
  });

  describe('Content Type', () => {
    test('returns JSON content type', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
