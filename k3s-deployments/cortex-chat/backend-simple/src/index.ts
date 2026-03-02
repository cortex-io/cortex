import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createChatRoutes } from './routes/chat-simple';
import { createAuthRoutes } from './routes/auth';
import { authMiddleware } from './middleware/auth';

// Configuration
const PORT = parseInt(process.env.PORT || '8080');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CORTEX_URL = process.env.CORTEX_URL || 'http://cortex-orchestrator.cortex.svc.cluster.local:8000';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors({
  origin: CORS_ORIGIN,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${c.req.method} ${c.req.path}`);
  await next();
  const duration = Date.now() - start;
  const timestamp2 = new Date().toISOString();
  console.log(`[${timestamp2}] ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
});

console.log('[Server] Mode: Simple Proxy to Cortex');
console.log(`[Server] Cortex URL: ${CORTEX_URL}`);

// Mount auth routes under /api/auth
const authRoutes = createAuthRoutes();
app.route('/api/auth', authRoutes);

// Mount chat routes
const chatRoutes = createChatRoutes();
app.route('/api', chatRoutes);

// Root endpoint (PUBLIC)
app.get('/', (c) => {
  return c.json({
    name: 'Cortex Chat Backend',
    version: '3.0.0',
    mode: 'simple-proxy',
    framework: 'Hono',
    runtime: 'Bun',
    status: 'running',
    cortexUrl: CORTEX_URL,
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        verify: 'POST /api/auth/verify'
      },
      chat: {
        chat: 'POST /api/chat (proxies to Cortex)',
        health: 'GET /api/health'
      }
    }
  });
});

// Global health check (PUBLIC)
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    path: c.req.path
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('[Server] Error:', err);
  return c.json({
    error: 'Internal server error',
    message: err.message
  }, 500);
});

// Start server
console.log('============================================================');
console.log('Cortex Chat Backend (Simple Proxy)');
console.log('============================================================');
console.log(`Server starting on port ${PORT}`);
console.log(`CORS enabled for: ${CORS_ORIGIN}`);
console.log(`Cortex URL: ${CORTEX_URL}`);
console.log('');
console.log('Mode: SIMPLE PROXY - All queries forwarded to Cortex');
console.log('');
console.log('Available endpoints:');
console.log('  PUBLIC:');
console.log(`    POST   http://localhost:${PORT}/api/auth/login`);
console.log(`    POST   http://localhost:${PORT}/api/auth/verify`);
console.log(`    GET    http://localhost:${PORT}/health`);
console.log(`    GET    http://localhost:${PORT}/api/health`);
console.log(`    POST   http://localhost:${PORT}/api/chat`);
console.log('');
console.log('Authentication:');
console.log(`  Username: ${process.env.AUTH_USERNAME || 'ryan'}`);
console.log(`  Password: ${process.env.AUTH_PASSWORD ? '***' : '7vuzjzuN9! (default)'}`);
console.log('');
console.log('Note: All intelligence is in Cortex orchestrator');
console.log('      This backend just forwards queries');
console.log('============================================================');

export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 120, // 120 seconds for long-running Cortex requests
};
