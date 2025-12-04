// lib/observability/pipeline/destinations/webhook.js
// Webhook Destination - forwards events to external webhooks
// Weeks 5-6 Implementation
//
// Functionality:
// - Send events to HTTP/HTTPS webhooks
// - Batch support for efficiency
// - Custom headers and authentication
// - Retry with exponential backoff
// - Rate limiting
// - Request signing (HMAC)
// - Flexible payload formatting

const { Destination } = require('../base');
const crypto = require('crypto');

class WebhookDestination extends Destination {
  constructor(config = {}) {
    super({
      name: config.name || 'WebhookDestination',
      bufferSize: config.bufferSize || 10,
      flushInterval: config.flushInterval || 5000,
      ...config
    });

    // Webhook configuration
    this.url = config.url || process.env.WEBHOOK_URL;
    this.method = config.method || 'POST';
    this.headers = config.headers || {};

    // Authentication
    this.authType = config.authType || null; // 'bearer', 'basic', 'hmac', 'api-key'
    this.authToken = config.authToken || process.env.WEBHOOK_AUTH_TOKEN;
    this.apiKey = config.apiKey || process.env.WEBHOOK_API_KEY;
    this.apiKeyHeader = config.apiKeyHeader || 'X-API-Key';
    this.username = config.username;
    this.password = config.password;

    // HMAC signing
    this.hmacSecret = config.hmacSecret || process.env.WEBHOOK_HMAC_SECRET;
    this.hmacAlgorithm = config.hmacAlgorithm || 'sha256';
    this.hmacHeader = config.hmacHeader || 'X-Signature';

    // Payload configuration
    this.payloadFormat = config.payloadFormat || 'array'; // 'array', 'object', 'individual'
    this.payloadKey = config.payloadKey || 'events';
    this.includeMetadata = config.includeMetadata !== false;

    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000; // Initial delay in ms
    this.retryBackoff = config.retryBackoff || 2; // Exponential backoff multiplier

    // Rate limiting
    this.rateLimit = config.rateLimit || null; // requests per second
    this.rateLimitWindow = 1000; // 1 second
    this.requestCount = 0;
    this.windowStart = Date.now();

    // Timeout
    this.timeout = config.timeout || 30000; // 30 seconds

    // Stats
    this.destinationStats = {
      total_events_sent: 0,
      total_requests_sent: 0,
      total_requests_succeeded: 0,
      total_requests_failed: 0,
      total_retries: 0,
      total_rate_limited: 0,
      last_success_at: null,
      last_error_at: null
    };
  }

  async initialize() {
    // Validate configuration
    if (!this.url) {
      throw new Error('WebhookDestination requires url configuration');
    }

    // Validate URL
    try {
      new URL(this.url);
    } catch (error) {
      throw new Error(`Invalid webhook URL: ${this.url}`);
    }

    console.log(`${this.name}: Initialized webhook destination (${this.url})`);

    // Start auto-flushing
    this.startAutoFlush();

    return true;
  }

  async send(event) {
    // For single events, add to buffer and let flush handle it
    // This is more efficient than sending one event at a time
    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async sendBatch(events) {
    if (events.length === 0) return;

    // Check rate limit
    if (this.rateLimit && !this.checkRateLimit()) {
      this.destinationStats.total_rate_limited++;
      console.warn(`${this.name}: Rate limit exceeded, delaying request`);
      await this.waitForRateLimit();
    }

    // Format payload
    const payload = this.formatPayload(events);

    // Send with retry
    await this.sendWithRetry(payload, events.length);
  }

  checkRateLimit() {
    if (!this.rateLimit) return true;

    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart >= this.rateLimitWindow) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    return this.requestCount < this.rateLimit;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeToWait = this.rateLimitWindow - (now - this.windowStart);

    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    this.requestCount = 0;
    this.windowStart = Date.now();
  }

  formatPayload(events) {
    let payload;

    switch (this.payloadFormat) {
      case 'array':
        // Simple array of events
        payload = events;
        break;

      case 'object':
        // Object with events under a key
        payload = {
          [this.payloadKey]: events
        };

        if (this.includeMetadata) {
          payload.metadata = {
            count: events.length,
            destination: this.name,
            timestamp: new Date().toISOString()
          };
        }
        break;

      case 'individual':
        // Each event is its own request (handled by sendIndividual)
        payload = events[0];
        break;

      default:
        payload = events;
    }

    return payload;
  }

  async sendWithRetry(payload, eventCount, attempt = 1) {
    try {
      await this.sendRequest(payload);

      this.destinationStats.total_events_sent += eventCount;
      this.destinationStats.total_requests_sent++;
      this.destinationStats.total_requests_succeeded++;
      this.destinationStats.last_success_at = new Date().toISOString();

      this.emit('request_success', { count: eventCount, attempt });
    } catch (error) {
      if (attempt < this.maxRetries) {
        // Retry with exponential backoff
        this.destinationStats.total_retries++;
        const delay = this.retryDelay * Math.pow(this.retryBackoff, attempt - 1);

        console.warn(`${this.name}: Request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms`, error.message);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWithRetry(payload, eventCount, attempt + 1);
      } else {
        // Max retries exceeded
        this.destinationStats.total_requests_sent++;
        this.destinationStats.total_requests_failed++;
        this.destinationStats.last_error_at = new Date().toISOString();

        this.emit('error', { destination: this.name, eventCount, error, attempts: attempt });
        throw error;
      }
    }
  }

  async sendRequest(payload) {
    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Cortex-Observability-Pipeline/1.0',
      ...this.headers
    };

    // Add authentication
    this.addAuthentication(headers, payload);

    // Convert payload to JSON
    const body = JSON.stringify(payload);

    // Add HMAC signature if configured
    if (this.hmacSecret) {
      const signature = this.generateHmacSignature(body);
      headers[this.hmacHeader] = signature;
    }

    // Track rate limit
    if (this.rateLimit) {
      this.requestCount++;
    }

    // Send request using fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers: headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  addAuthentication(headers, payload) {
    switch (this.authType) {
      case 'bearer':
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        break;

      case 'basic':
        if (this.username && this.password) {
          const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'api-key':
        if (this.apiKey) {
          headers[this.apiKeyHeader] = this.apiKey;
        }
        break;

      case 'hmac':
        // HMAC signature added separately in sendRequest
        break;
    }
  }

  generateHmacSignature(payload) {
    const hmac = crypto.createHmac(this.hmacAlgorithm, this.hmacSecret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  async shutdown() {
    // Stop auto-flush and flush remaining events
    await super.shutdown();
  }

  getHealth() {
    const total = this.destinationStats.total_requests_sent;
    const successRate = total > 0
      ? (this.destinationStats.total_requests_succeeded / total)
      : 0;

    return {
      ...super.getHealth(),
      url: this.url,
      method: this.method,
      authType: this.authType,
      payloadFormat: this.payloadFormat,
      rateLimit: this.rateLimit,
      maxRetries: this.maxRetries,
      stats: {
        ...this.destinationStats,
        success_rate: successRate,
        average_events_per_request: total > 0
          ? Math.round(this.destinationStats.total_events_sent / total)
          : 0
      }
    };
  }

  getDestinationStats() {
    const total = this.destinationStats.total_requests_sent;
    const successRate = total > 0
      ? (this.destinationStats.total_requests_succeeded / total)
      : 0;

    return {
      ...this.destinationStats,
      success_rate: successRate,
      failure_rate: 1 - successRate,
      average_events_per_request: total > 0
        ? Math.round(this.destinationStats.total_events_sent / total)
        : 0
    };
  }
}

module.exports = WebhookDestination;
