const Redis = require('ioredis');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || 'redis-queue.cortex.svc.cluster.local';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WORKER_ID = process.env.HOSTNAME || 'worker-unknown';
const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT_MS || '300000'); // 5 minutes
const TASKS_DIR = process.env.TASKS_DIR || '/app/tasks';

// Priority queues (in order of priority)
const PRIORITY_QUEUES = [
  'cortex:queue:critical',
  'cortex:queue:high',
  'cortex:queue:medium',
  'cortex:queue:low'
];

// Rate limiting constants
const MAX_TOKENS_PER_MINUTE = 40000;
const TOKENS_KEY = 'cortex:tokens:minute';

class QueueWorker {
  constructor() {
    this.redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });

    this.isShuttingDown = false;
    this.lastTaskTime = Date.now();
    this.idleCheckInterval = null;
  }

  async initialize() {
    console.log(`[${WORKER_ID}] Starting worker...`);
    console.log(`[${WORKER_ID}] Redis: ${REDIS_HOST}:${REDIS_PORT}`);
    console.log(`[${WORKER_ID}] Priority queues: ${PRIORITY_QUEUES.length}`);

    await this.redis.ping();
    console.log(`[${WORKER_ID}] Redis connection established`);

    // Start idle timeout checker
    this.idleCheckInterval = setInterval(() => this.checkIdleTimeout(), 30000);
  }

  checkIdleTimeout() {
    const idleTime = Date.now() - this.lastTaskTime;
    if (idleTime > IDLE_TIMEOUT) {
      console.log(`[${WORKER_ID}] Idle for ${Math.round(idleTime/1000)}s, shutting down...`);
      this.shutdown();
    }
  }

  async checkRateLimit(estimatedTokens = 2000) {
    try {
      const currentTokens = await this.redis.get(TOKENS_KEY);
      const tokensUsed = parseInt(currentTokens || '0');

      if (tokensUsed + estimatedTokens > MAX_TOKENS_PER_MINUTE) {
        const waitTime = 60 - Math.floor((Date.now() % 60000) / 1000);
        console.log(`[${WORKER_ID}] Rate limit reached (${tokensUsed}/${MAX_TOKENS_PER_MINUTE} tokens), waiting ${waitTime}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        return this.checkRateLimit(estimatedTokens);
      }

      return true;
    } catch (error) {
      console.error(`[${WORKER_ID}] Rate limit check failed:`, error.message);
      return true; // Fail open
    }
  }

  async trackTokenUsage(tokensUsed) {
    try {
      const pipe = this.redis.pipeline();
      pipe.incrby(TOKENS_KEY, tokensUsed);
      pipe.expire(TOKENS_KEY, 60);
      await pipe.exec();

      console.log(`[${WORKER_ID}] Tracked ${tokensUsed} tokens`);
    } catch (error) {
      console.error(`[${WORKER_ID}] Token tracking failed:`, error.message);
    }
  }

  async saveToDisk(task, result) {
    try {
      const taskFile = path.join(TASKS_DIR, `${task.id}.json`);
      const taskData = {
        ...task,
        status: 'completed',
        result: result,
        completedAt: new Date().toISOString(),
        completedBy: WORKER_ID
      };

      await fs.mkdir(TASKS_DIR, { recursive: true });
      await fs.writeFile(taskFile, JSON.stringify(taskData, null, 2));

      console.log(`[${WORKER_ID}] Saved task ${task.id} to disk`);
    } catch (error) {
      console.error(`[${WORKER_ID}] Failed to save task to disk:`, error.message);
    }
  }

  async executeTask(task) {
    console.log(`[${WORKER_ID}] Executing task ${task.id} (priority: ${task.priority})`);

    try {
      // Check rate limits before execution
      await this.checkRateLimit(task.estimatedTokens || 2000);

      // Execute with Claude
      const response = await this.anthropic.messages.create({
        model: task.model || 'claude-sonnet-4-5-20250929',
        max_tokens: task.maxTokens || 4096,
        messages: task.messages || [
          {
            role: 'user',
            content: task.prompt || task.description || 'Execute task'
          }
        ]
      });

      // Track token usage
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      await this.trackTokenUsage(tokensUsed);

      const result = {
        success: true,
        response: response.content[0].text,
        tokensUsed: tokensUsed,
        model: response.model,
        completedAt: new Date().toISOString()
      };

      // Dual persistence: Save to disk AND update Redis
      await this.saveToDisk(task, result);

      // Store result in Redis (with 24h expiry)
      await this.redis.setex(
        `cortex:result:${task.id}`,
        86400,
        JSON.stringify(result)
      );

      console.log(`[${WORKER_ID}] Task ${task.id} completed successfully (${tokensUsed} tokens)`);
      return result;

    } catch (error) {
      console.error(`[${WORKER_ID}] Task ${task.id} failed:`, error.message);

      const errorResult = {
        success: false,
        error: error.message,
        errorType: error.type || 'unknown',
        failedAt: new Date().toISOString()
      };

      // Save failed task to disk
      await this.saveToDisk(task, errorResult);

      // Store error in Redis
      await this.redis.setex(
        `cortex:result:${task.id}`,
        86400,
        JSON.stringify(errorResult)
      );

      return errorResult;
    }
  }

  async processNextTask() {
    try {
      // BRPOP from priority queues (blocks for 5 seconds)
      const result = await this.redis.brpop(...PRIORITY_QUEUES, 5);

      if (!result) {
        // No tasks available
        return null;
      }

      const [queueName, taskJson] = result;
      const task = JSON.parse(taskJson);

      this.lastTaskTime = Date.now();
      console.log(`[${WORKER_ID}] Picked up task ${task.id} from ${queueName}`);

      // Execute the task
      await this.executeTask(task);

      return task;

    } catch (error) {
      if (error.message.includes('Connection is closed')) {
        console.error(`[${WORKER_ID}] Redis connection lost, reconnecting...`);
        await this.redis.connect();
      } else {
        console.error(`[${WORKER_ID}] Error processing task:`, error.message);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      return null;
    }
  }

  async start() {
    await this.initialize();

    console.log(`[${WORKER_ID}] Worker ready, waiting for tasks...`);

    while (!this.isShuttingDown) {
      await this.processNextTask();
    }

    console.log(`[${WORKER_ID}] Worker stopped`);
  }

  async shutdown() {
    console.log(`[${WORKER_ID}] Shutting down gracefully...`);
    this.isShuttingDown = true;

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    await this.redis.quit();
    process.exit(0);
  }
}

// Handle shutdown signals
const worker = new QueueWorker();

process.on('SIGTERM', () => worker.shutdown());
process.on('SIGINT', () => worker.shutdown());

// Start the worker
worker.start().catch(error => {
  console.error(`[${WORKER_ID}] Fatal error:`, error);
  process.exit(1);
});
