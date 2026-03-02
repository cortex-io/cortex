/**
 * Prometheus Metrics for Claude API Usage & Cost Tracking
 */

const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// === Claude API Metrics ===

// Request counter
const claudeRequests = new promClient.Counter({
  name: 'claude_requests_total',
  help: 'Total number of Claude API requests',
  labelNames: ['status', 'model'],
  registers: [register]
});

// Token counters
const claudeTokensInput = new promClient.Counter({
  name: 'claude_tokens_input_total',
  help: 'Total input tokens consumed',
  labelNames: ['model'],
  registers: [register]
});

const claudeTokensOutput = new promClient.Counter({
  name: 'claude_tokens_output_total',
  help: 'Total output tokens generated',
  labelNames: ['model'],
  registers: [register]
});

const claudeTokensCacheRead = new promClient.Counter({
  name: 'claude_tokens_cache_read_total',
  help: 'Total cache read tokens',
  labelNames: ['model'],
  registers: [register]
});

const claudeTokensCacheCreation = new promClient.Counter({
  name: 'claude_tokens_cache_creation_total',
  help: 'Total cache creation tokens',
  labelNames: ['model'],
  registers: [register]
});

// Cost tracking
const claudeCostEstimated = new promClient.Counter({
  name: 'claude_cost_estimated_usd_total',
  help: 'Estimated cumulative cost in USD',
  labelNames: ['model', 'token_type'],
  registers: [register]
});

// Request duration histogram
const claudeRequestDuration = new promClient.Histogram({
  name: 'claude_request_duration_seconds',
  help: 'Claude API request duration in seconds',
  labelNames: ['model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register]
});

// Cache hit ratio gauge
const claudeCacheHitRatio = new promClient.Gauge({
  name: 'claude_cache_hit_ratio',
  help: 'Cache hit ratio (0-1)',
  registers: [register]
});

// API status gauge
const claudeApiUp = new promClient.Gauge({
  name: 'claude_api_up',
  help: 'Claude API availability (1=up, 0=down)',
  registers: [register]
});

// Service tier distribution
const claudeServiceTier = new promClient.Counter({
  name: 'claude_service_tier_requests',
  help: 'Requests by service tier',
  labelNames: ['tier'],
  registers: [register]
});

// Web search tool usage
const claudeWebSearchRequests = new promClient.Counter({
  name: 'claude_web_search_requests_total',
  help: 'Web search tool invocations',
  labelNames: ['model'],
  registers: [register]
});

// === Throttle Metrics ===

const throttleWaitTime = new promClient.Histogram({
  name: 'claude_throttle_wait_seconds',
  help: 'Time spent waiting for rate limit',
  buckets: [0, 1, 5, 10, 30, 60],
  registers: [register]
});

const throttleTokensUsed = new promClient.Gauge({
  name: 'claude_throttle_tokens_current',
  help: 'Current token usage in rate limit window',
  registers: [register]
});

const throttleTokensLimit = new promClient.Gauge({
  name: 'claude_throttle_tokens_limit',
  help: 'Rate limit threshold (tokens/minute)',
  registers: [register]
});

// Set initial values
claudeApiUp.set(1);
throttleTokensLimit.set(28000);

// === Pricing Table (as of January 2025) ===
const PRICING = {
  'claude-sonnet-4-5-20250929': {
    input: 0.003,        // $3 per 1M tokens
    output: 0.015,       // $15 per 1M tokens
    cache_write: 0.00375, // $3.75 per 1M tokens
    cache_read: 0.0003    // $0.30 per 1M tokens
  },
  'claude-opus-4-5-20251101': {
    input: 0.015,        // $15 per 1M tokens
    output: 0.075,       // $75 per 1M tokens
    cache_write: 0.01875,
    cache_read: 0.0015
  }
};

/**
 * Calculate cost for a request
 */
function calculateCost(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0) {
  const pricing = PRICING[model] || PRICING['claude-sonnet-4-5-20250929'];

  const inputCost = (inputTokens / 1000000) * pricing.input;
  const outputCost = (outputTokens / 1000000) * pricing.output;
  const cacheReadCost = (cacheReadTokens / 1000000) * pricing.cache_read;
  const cacheWriteCost = (cacheCreationTokens / 1000000) * pricing.cache_write;

  return {
    input: inputCost,
    output: outputCost,
    cache_read: cacheReadCost,
    cache_write: cacheWriteCost,
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost
  };
}

/**
 * Record a Claude API request completion
 */
function recordRequest(params) {
  const {
    model = 'claude-sonnet-4-5-20250929',
    status = 'success',
    inputTokens = 0,
    outputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    durationSeconds = 0,
    tier = 'unknown'
  } = params;

  // Increment request counter
  claudeRequests.inc({ status, model });

  if (status === 'success') {
    // Record token usage
    claudeTokensInput.inc({ model }, inputTokens);
    claudeTokensOutput.inc({ model }, outputTokens);

    if (cacheReadTokens > 0) {
      claudeTokensCacheRead.inc({ model }, cacheReadTokens);
    }

    if (cacheCreationTokens > 0) {
      claudeTokensCacheCreation.inc({ model }, cacheCreationTokens);
    }

    // Calculate and record costs
    const costs = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

    if (costs.input > 0) {
      claudeCostEstimated.inc({ model, token_type: 'input' }, costs.input);
    }
    if (costs.output > 0) {
      claudeCostEstimated.inc({ model, token_type: 'output' }, costs.output);
    }
    if (costs.cache_read > 0) {
      claudeCostEstimated.inc({ model, token_type: 'cache_read' }, costs.cache_read);
    }
    if (costs.cache_write > 0) {
      claudeCostEstimated.inc({ model, token_type: 'cache_write' }, costs.cache_write);
    }

    // Record duration
    claudeRequestDuration.observe({ model }, durationSeconds);

    // Update cache hit ratio
    const totalTokens = inputTokens + cacheReadTokens;
    if (totalTokens > 0) {
      const hitRatio = cacheReadTokens / totalTokens;
      claudeCacheHitRatio.set(hitRatio);
    }

    // Record service tier
    claudeServiceTier.inc({ tier });

    // Set API as up
    claudeApiUp.set(1);
  } else {
    // API call failed
    claudeApiUp.set(0);
  }
}

/**
 * Record throttle wait time
 */
function recordThrottleWait(waitSeconds, currentUsage) {
  throttleWaitTime.observe(waitSeconds);
  throttleTokensUsed.set(currentUsage);
}

/**
 * Record web search usage
 */
function recordWebSearch(model) {
  claudeWebSearchRequests.inc({ model });
}

/**
 * Get metrics in Prometheus format
 */
async function getMetrics() {
  return register.metrics();
}

module.exports = {
  register,
  recordRequest,
  recordThrottleWait,
  recordWebSearch,
  getMetrics,
  calculateCost
};
