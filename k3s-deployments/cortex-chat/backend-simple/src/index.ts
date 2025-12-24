import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClaudeService } from './services/claude';
import { createChatRoutes } from './routes/chat';
import { createAuthRoutes } from './routes/auth';
import { authMiddleware } from './middleware/auth';

// Configuration
const PORT = parseInt(process.env.PORT || '8080');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Validate required configuration
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

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

// Initialize Claude service
console.log('[Server] Initializing Claude service...');
const claudeService = createClaudeService(ANTHROPIC_API_KEY, CLAUDE_MODEL, MAX_TOKENS);
console.log('[Server] Claude service initialized');
console.log(`[Server] Using model: ${CLAUDE_MODEL}`);
console.log(`[Server] Max tokens: ${MAX_TOKENS}`);

// Mount auth routes (PUBLIC - no auth required)
const authRoutes = createAuthRoutes();
app.route('/api/auth', authRoutes);

// Mount chat routes with auth middleware (PROTECTED)
const chatRoutes = createChatRoutes(claudeService);
app.use('/api/chat', authMiddleware);
app.use('/api/tools', authMiddleware);
app.route('/api', chatRoutes);

// Root endpoint (PUBLIC)
app.get('/', (c) => {
  return c.json({
    name: 'Cortex Chat Backend',
    version: '2.0.0',
    framework: 'Hono',
    runtime: 'Bun',
    status: 'running',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        verify: 'POST /api/auth/verify'
      },
      chat: {
        chat: 'POST /api/chat (protected)',
        tools: 'GET /api/tools (protected)',
        health: 'GET /api/health (public)'
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
console.log('Cortex Chat Backend (Hono + Tool Execution + Auth)');
console.log('============================================================');
console.log(`Server starting on port ${PORT}`);
console.log(`CORS enabled for: ${CORS_ORIGIN}`);
console.log(`Claude Model: ${CLAUDE_MODEL}`);
console.log('');
console.log('Available endpoints:');
console.log('  PUBLIC:');
console.log(`    POST   http://localhost:${PORT}/api/auth/login`);
console.log(`    POST   http://localhost:${PORT}/api/auth/verify`);
console.log(`    GET    http://localhost:${PORT}/health`);
console.log(`    GET    http://localhost:${PORT}/api/health`);
console.log('  PROTECTED (requires JWT token):');
console.log(`    POST   http://localhost:${PORT}/api/chat`);
console.log(`    GET    http://localhost:${PORT}/api/tools`);
console.log('');
console.log('Authentication:');
console.log(`  Username: ${process.env.AUTH_USERNAME || 'ryan'}`);
console.log(`  Password: ${process.env.AUTH_PASSWORD ? '***' : '7vuzjzuN9! (default)'}`);
console.log('');
console.log('MCP Servers:');
console.log('  - Wazuh:   http://wazuh-mcp.cortex-system.svc.cluster.local:3000');
console.log('  - UniFi:   http://unifi-mcp.cortex-system.svc.cluster.local:3000');
console.log('  - Proxmox: http://proxmox-mcp.cortex-system.svc.cluster.local:3000');
console.log('  - Cortex:  http://cortex-orchestrator.cortex.svc.cluster.local:8000');
console.log('============================================================');

export default {
  port: PORT,
  fetch: app.fetch,
};
