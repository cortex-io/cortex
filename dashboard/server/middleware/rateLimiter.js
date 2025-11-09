/**
 * Rate Limiting Middleware
 * Protects API from abuse and DoS attacks
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500, // Increased from 100 to 500
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 'Check Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health check and daemon status
  skip: (req) => {
    const exemptPaths = [
      '/api/health',
      '/api/daemon/status',
      '/api/daemons/all',
      '/api/health-monitor/status',
      '/api/metrics-snapshot/status'
    ];
    return exemptPaths.includes(req.path);
  }
});

// Strict rate limiter for control endpoints (daemon control, server restart, etc.)
const controlLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.CONTROL_RATE_LIMIT_MAX) || 10,
  message: {
    error: 'Too many control requests',
    message: 'You are making too many control requests. Please wait before trying again.',
    retryAfter: 'Check Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for daemon management operations
  skip: (req) => {
    // Exempt daemon-related endpoints from rate limiting
    const exemptPaths = [
      '/api/daemon/start',
      '/api/daemon/stop',
      '/api/daemon/restart',
      '/api/daemons/all',
      '/api/pm-daemon/start',
      '/api/pm-daemon/stop',
      '/api/health-monitor/start',
      '/api/health-monitor/stop',
      '/api/metrics-snapshot/start',
      '/api/metrics-snapshot/stop'
    ];
    return exemptPaths.includes(req.path);
  }
});

// Very strict limiter for expensive operations (DDQD tests, bulk operations)
const expensiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3,
  message: {
    error: 'Too many expensive operations',
    message: 'This operation is resource-intensive. Maximum 3 requests per 5 minutes.',
    retryAfter: 'Check Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Lenient rate limiter for GET requests (read operations)
const getLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute for read operations
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 'Check Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for critical status endpoints
  skip: (req) => {
    const exemptPaths = [
      '/api/health',
      '/api/daemon/status',
      '/api/daemons/all',
      '/api/health-monitor/status',
      '/api/metrics-snapshot/status'
    ];
    return exemptPaths.includes(req.path);
  }
});

module.exports = {
  apiLimiter,
  controlLimiter,
  expensiveLimiter,
  getLimiter
};
