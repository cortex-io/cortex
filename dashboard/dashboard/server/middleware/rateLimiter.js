/**
 * Rate Limiting Middleware
 * Protects API from abuse and DoS attacks
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 'Check Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health check
  skip: (req) => req.path === '/api/health'
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
  legacyHeaders: false
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

module.exports = {
  apiLimiter,
  controlLimiter,
  expensiveLimiter
};
