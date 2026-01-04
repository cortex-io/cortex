/**
 * Token Bucket Throttle for Claude API
 * Global throttle across ALL services using the same Anthropic organization
 * Prevents exceeding 30K input tokens per minute organization-wide rate limit
 */

const RATE_LIMIT_ITPM = 28000; // Conservative limit (30K with 2K buffer)
const WINDOW_MS = 60000; // 1 minute window
const REDIS_KEY = 'anthropic:global:token-usage'; // GLOBAL key shared across all services

class TokenThrottle {
  constructor(redisClient) {
    this.redis = redisClient;
    this.enabled = !!redisClient;
    console.log(`[TokenThrottle] GLOBAL throttle initialized with limit ${RATE_LIMIT_ITPM} tokens/minute (Redis: ${this.enabled ? 'enabled' : 'disabled'})`);
  }

  /**
   * Estimate token count for a request (rough approximation)
   * More accurate would use tiktoken, but this is good enough
   */
  estimateTokens(messages, tools = [], systemPrompt = null) {
    const text = JSON.stringify({ messages, tools, system: systemPrompt });
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if request can proceed, wait if needed
   * Returns: { allowed: boolean, waitMs: number, currentUsage: number }
   */
  async checkAndWait(estimatedTokens) {
    if (!this.enabled) {
      return { allowed: true, waitMs: 0, currentUsage: 0 };
    }

    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    try {
      // Get current usage from Redis sorted set (score = timestamp)
      const recentEntries = await this.redis.zrangebyscore(
        REDIS_KEY,
        windowStart,
        now,
        'WITHSCORES'
      );

      // Calculate current usage in window
      let currentUsage = 0;
      for (let i = 0; i < recentEntries.length; i += 2) {
        currentUsage += parseInt(recentEntries[i], 10);
      }

      // Check if adding this request would exceed limit
      if (currentUsage + estimatedTokens > RATE_LIMIT_ITPM) {
        // Calculate wait time until oldest entry expires
        const oldestTimestamp = recentEntries.length > 0 ? parseInt(recentEntries[1], 10) : now;
        const waitMs = Math.max(0, oldestTimestamp + WINDOW_MS - now);

        console.log(`[TokenThrottle] GLOBAL rate limit would be exceeded (${currentUsage + estimatedTokens}/${RATE_LIMIT_ITPM}), waiting ${waitMs}ms`);

        return {
          allowed: false,
          waitMs,
          currentUsage,
          estimatedTokens
        };
      }

      // Record this usage
      await this.redis.zadd(REDIS_KEY, now, `${estimatedTokens}:${now}`);

      // Clean up old entries (older than window)
      await this.redis.zremrangebyscore(REDIS_KEY, '-inf', windowStart);

      console.log(`[TokenThrottle] Request allowed (${currentUsage + estimatedTokens}/${RATE_LIMIT_ITPM} tokens used globally)`);

      return {
        allowed: true,
        waitMs: 0,
        currentUsage: currentUsage + estimatedTokens,
        estimatedTokens
      };

    } catch (error) {
      console.error(`[TokenThrottle] Redis error:`, error.message);
      // Fail open - allow request if Redis is down
      return { allowed: true, waitMs: 0, currentUsage: 0 };
    }
  }

  /**
   * Wait for rate limit to allow request, then proceed
   */
  async throttle(messages, tools = [], systemPrompt = null) {
    const estimatedTokens = this.estimateTokens(messages, tools, systemPrompt);

    while (true) {
      const check = await this.checkAndWait(estimatedTokens);

      if (check.allowed) {
        return check;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, check.waitMs));
    }
  }
}

module.exports = TokenThrottle;
