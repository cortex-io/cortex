#!/usr/bin/env node
// lib/rag/context-manager.js
// Context Management for RAG-Enhanced AI Decisions
// Part of Enhancement Phase: Vector Database Integration
//
// Responsibilities:
// - Build context for AI decisions
// - Retrieve relevant knowledge from vector store
// - Combine multiple context sources
// - Context caching and optimization

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const VectorStore = require('./vector-store');
const { createEmbedder, createEmbedderFromConfig } = require('./embeddings');

class ContextManager {
  constructor(embedder = null) {
    // Pass embedder to vector store for consistent embedding generation
    this.vectorStore = new VectorStore(embedder);
    this.embedder = embedder;
    this.contextCachePath = 'coordination/vector-db/context-cache';
    this.cacheEnabled = true;
    this.cacheTTL = 3600000; // 1 hour

    // Enhancement #18: Adaptive strategy selection
    this.strategyHistoryPath = 'coordination/knowledge-base/strategy-history';
    this.strategyWeights = {
      success_weight: 1.5,
      recency_weight: 1.2,
      similarity_weight: 1.0
    };
  }

  /**
   * Create context manager with specific embedder provider
   * @param {string|Object} config - Provider name or config object
   * @returns {ContextManager} - Configured context manager
   */
  static withProvider(config) {
    const embedder = createEmbedder(config);
    return new ContextManager(embedder);
  }

  /**
   * Create context manager from configuration file
   * @param {string} configPath - Path to config file
   * @returns {Promise<ContextManager>} - Configured context manager
   */
  static async fromConfig(configPath) {
    const embedder = await createEmbedderFromConfig(configPath);
    return new ContextManager(embedder);
  }

  /**
   * Initialize context manager
   */
  async initialize() {
    try {
      await this.vectorStore.initialize();
      await fs.mkdir(this.contextCachePath, { recursive: true });
      await fs.mkdir(this.strategyHistoryPath, { recursive: true });

      // Update embedder reference from vector store (in case it was auto-created)
      if (!this.embedder) {
        this.embedder = this.vectorStore.getEmbedder();
      }

      const embedderInfo = this.embedder ? this.embedder.getInfo() : { name: 'none' };
      console.log('Context Manager initialized');
      console.log(`Using embedder: ${embedderInfo.name} (${embedderInfo.model || 'default'})`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Context Manager:', error.message);
      return false;
    }
  }

  /**
   * Get current embedder info
   */
  getEmbedderInfo() {
    return this.embedder ? this.embedder.getInfo() : null;
  }

  /**
   * Switch to a different embedder
   */
  setEmbedder(embedder) {
    this.embedder = embedder;
    this.vectorStore.setEmbedder(embedder);
  }

  /**
   * Enhancement #18: Query vector DB for similar past tasks
   * Find tasks similar to the current one for strategy extraction
   */
  async findSimilarPastTasks(taskDescription, options = {}) {
    const limit = options.limit || 5;
    const minSimilarity = options.min_similarity || 0.65;

    try {
      const similarTasks = await this.vectorStore.search(taskDescription, {
        collection: 'tasks',
        limit: limit,
        min_similarity: minSimilarity
      });

      // Sort by weighted score (similarity + success + recency)
      const scoredTasks = similarTasks.map(task => {
        let score = task.similarity * this.strategyWeights.similarity_weight;

        // Boost successful tasks
        if (task.metadata && task.metadata.status === 'completed') {
          score *= this.strategyWeights.success_weight;
        }

        // Boost recent tasks
        if (task.metadata && task.metadata.timestamp) {
          const age = Date.now() - new Date(task.metadata.timestamp).getTime();
          const ageDays = age / (1000 * 60 * 60 * 24);
          if (ageDays < 7) {
            score *= this.strategyWeights.recency_weight;
          }
        }

        return { ...task, weighted_score: score };
      });

      // Sort by weighted score
      scoredTasks.sort((a, b) => b.weighted_score - a.weighted_score);

      return scoredTasks;
    } catch (error) {
      console.error('Failed to find similar tasks:', error.message);
      return [];
    }
  }

  /**
   * Enhancement #18: Extract successful strategies from completed tasks
   */
  async extractStrategiesFromCompletions(similarTasks) {
    const strategies = [];

    for (const task of similarTasks) {
      if (!task.metadata) continue;

      // Only extract from successful completions
      if (task.metadata.status !== 'completed') continue;

      const strategy = {
        task_id: task.metadata.task_id || task.id,
        task_type: task.metadata.task_type,
        worker_type: task.metadata.worker_type,
        similarity: task.similarity,
        weighted_score: task.weighted_score,
        approach: this._extractApproachFromContent(task.content),
        duration: task.metadata.duration,
        lessons_learned: task.metadata.lessons_learned
      };

      strategies.push(strategy);
    }

    return strategies;
  }

  /**
   * Extract approach/strategy description from task content
   */
  _extractApproachFromContent(content) {
    if (!content) return null;

    // Look for strategy indicators in the content
    const approachPatterns = [
      /approach:\s*([^\n]+)/i,
      /strategy:\s*([^\n]+)/i,
      /method:\s*([^\n]+)/i,
      /solution:\s*([^\n]+)/i
    ];

    for (const pattern of approachPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no explicit approach, extract first meaningful sentence
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && trimmed.length < 200) {
        return trimmed;
      }
    }

    return null;
  }

  /**
   * Enhancement #18: Generate strategy recommendations for worker context
   */
  async generateStrategyRecommendations(taskDescription, taskType) {
    const recommendations = {
      generated_at: new Date().toISOString(),
      task_type: taskType,
      strategies: [],
      summary: '',
      confidence: 0
    };

    // Find similar past tasks
    const similarTasks = await this.findSimilarPastTasks(taskDescription, {
      limit: 5,
      min_similarity: 0.6
    });

    if (similarTasks.length === 0) {
      recommendations.summary = 'No similar past tasks found for strategy extraction';
      return recommendations;
    }

    // Extract strategies from completions
    const strategies = await this.extractStrategiesFromCompletions(similarTasks);
    recommendations.strategies = strategies;

    // Calculate confidence based on similarity and success
    if (strategies.length > 0) {
      const avgSimilarity = strategies.reduce((sum, s) => sum + s.similarity, 0) / strategies.length;
      const avgScore = strategies.reduce((sum, s) => sum + s.weighted_score, 0) / strategies.length;
      recommendations.confidence = Math.min(avgSimilarity * avgScore * 100, 100);
    }

    // Build summary
    if (strategies.length > 0) {
      const topStrategy = strategies[0];
      recommendations.summary = `Found ${strategies.length} similar successful task(s). ` +
        `Top strategy from ${topStrategy.task_type || 'similar task'}: ` +
        `${topStrategy.approach || 'See task details'}. ` +
        `Confidence: ${recommendations.confidence.toFixed(0)}%`;
    }

    return recommendations;
  }

  /**
   * Enhancement #18: Inject strategy recommendations into worker context
   */
  async injectStrategyIntoContext(context, taskDescription, taskType) {
    try {
      const recommendations = await this.generateStrategyRecommendations(taskDescription, taskType);

      // Add to context
      context.strategy_recommendations = recommendations;

      // Add formatted strategy guidance
      if (recommendations.strategies.length > 0) {
        context.strategy_guidance = this._formatStrategyGuidance(recommendations);
      }

      return context;
    } catch (error) {
      console.error('Failed to inject strategy:', error.message);
      return context;
    }
  }

  /**
   * Format strategy recommendations as guidance text
   */
  _formatStrategyGuidance(recommendations) {
    if (!recommendations.strategies || recommendations.strategies.length === 0) {
      return '';
    }

    let guidance = '## Recommended Strategies from Similar Tasks\n\n';

    for (let i = 0; i < Math.min(recommendations.strategies.length, 3); i++) {
      const strategy = recommendations.strategies[i];
      guidance += `### Strategy ${i + 1} (Similarity: ${(strategy.similarity * 100).toFixed(0)}%)\n`;

      if (strategy.approach) {
        guidance += `**Approach:** ${strategy.approach}\n`;
      }

      if (strategy.worker_type) {
        guidance += `**Worker Type:** ${strategy.worker_type}\n`;
      }

      if (strategy.lessons_learned) {
        guidance += `**Lessons Learned:** ${strategy.lessons_learned}\n`;
      }

      if (strategy.duration) {
        guidance += `**Duration:** ${strategy.duration} minutes\n`;
      }

      guidance += '\n';
    }

    guidance += `**Overall Confidence:** ${recommendations.confidence.toFixed(0)}%\n`;

    return guidance;
  }

  /**
   * Record task completion for future strategy learning
   */
  async recordTaskCompletion(task, outcome) {
    try {
      const historyPath = path.join(this.strategyHistoryPath, `${task.task_id}.json`);

      const completion = {
        task_id: task.task_id,
        task_type: task.task_type,
        description: task.description,
        outcome: outcome,
        recorded_at: new Date().toISOString()
      };

      await fs.writeFile(historyPath, JSON.stringify(completion, null, 2));

      // Also store in vector DB for future retrieval
      await this.learnFromTask(task, outcome);

      console.log(`Recorded completion for task ${task.task_id}`);
    } catch (error) {
      console.error('Failed to record task completion:', error.message);
    }
  }

  /**
   * Build comprehensive context for task
   */
  async buildTaskContext(task) {
    const context = {
      task_id: task.task_id,
      task_type: task.task_type,
      description: task.description,
      built_at: new Date().toISOString(),
      sources: {
        similar_tasks: [],
        relevant_code: [],
        documentation: [],
        past_decisions: [],
        failure_patterns: []
      },
      summary: ''
    };

    // Check cache first
    if (this.cacheEnabled) {
      const cached = await this._getFromCache(task.description);
      if (cached) {
        console.log('Context retrieved from cache');
        return cached;
      }
    }

    // 1. Find similar past tasks
    const similarTasks = await this.vectorStore.search(task.description, {
      collection: 'tasks',
      limit: 3,
      min_similarity: 0.7
    });
    context.sources.similar_tasks = similarTasks;

    // 2. Find relevant code
    const relevantCode = await this.vectorStore.search(task.description, {
      collection: 'code',
      limit: 5,
      min_similarity: 0.6
    });
    context.sources.relevant_code = relevantCode;

    // 3. Find relevant documentation
    const relevantDocs = await this.vectorStore.search(task.description, {
      collection: 'documentation',
      limit: 3,
      min_similarity: 0.65
    });
    context.sources.documentation = relevantDocs;

    // 4. Find relevant past AI decisions
    const pastDecisions = await this.vectorStore.search(task.description, {
      collection: 'decisions',
      limit: 3,
      min_similarity: 0.7
    });
    context.sources.past_decisions = pastDecisions;

    // 5. Check for related failure patterns
    const patterns = await this.vectorStore.search(task.description, {
      collection: 'patterns',
      limit: 2,
      min_similarity: 0.65
    });
    context.sources.failure_patterns = patterns;

    // Enhancement #18: Add strategy recommendations from similar successful tasks
    await this.injectStrategyIntoContext(context, task.description, task.task_type);

    // Build context summary
    context.summary = this._buildContextSummary(context.sources);

    // Cache the context
    if (this.cacheEnabled) {
      await this._saveToCache(task.description, context);
    }

    return context;
  }

  /**
   * Build context for debugging/troubleshooting
   */
  async buildDebugContext(issue) {
    const context = {
      issue: issue.description,
      built_at: new Date().toISOString(),
      sources: {
        similar_issues: [],
        known_patterns: [],
        solutions: [],
        documentation: []
      }
    };

    // Find similar issues
    const similarIssues = await this.vectorStore.search(issue.description, {
      collection: 'patterns',
      limit: 5,
      min_similarity: 0.65
    });
    context.sources.similar_issues = similarIssues;

    // Find known failure patterns
    const patterns = await this.vectorStore.search(issue.description, {
      collection: 'patterns',
      limit: 3,
      min_similarity: 0.7
    });
    context.sources.known_patterns = patterns;

    // Find past solutions
    const solutions = await this.vectorStore.search(issue.description, {
      collection: 'decisions',
      limit: 3,
      min_similarity: 0.6
    });
    context.sources.solutions = solutions;

    // Find relevant docs
    const docs = await this.vectorStore.search(issue.description, {
      collection: 'documentation',
      limit: 2,
      min_similarity: 0.6
    });
    context.sources.documentation = docs;

    return context;
  }

  /**
   * Build context for code implementation
   */
  async buildCodeContext(requirement) {
    const context = {
      requirement: requirement,
      built_at: new Date().toISOString(),
      sources: {
        similar_implementations: [],
        relevant_code: [],
        documentation: [],
        best_practices: []
      }
    };

    // Find similar implementations
    const similar = await this.vectorStore.search(requirement, {
      collection: 'code',
      limit: 5,
      min_similarity: 0.65
    });
    context.sources.similar_implementations = similar;

    // Find relevant existing code
    const existingCode = await this.vectorStore.search(requirement, {
      collection: 'code',
      limit: 8,
      min_similarity: 0.6
    });
    context.sources.relevant_code = existingCode;

    // Find relevant documentation
    const docs = await this.vectorStore.search(requirement, {
      collection: 'documentation',
      limit: 3,
      min_similarity: 0.6
    });
    context.sources.documentation = docs;

    return context;
  }

  /**
   * Enrich AI decision with RAG context
   */
  async enrichDecision(decision, contextType = 'task') {
    let context;

    if (contextType === 'task') {
      context = await this.buildTaskContext(decision);
    } else if (contextType === 'debug') {
      context = await this.buildDebugContext(decision);
    } else if (contextType === 'code') {
      context = await this.buildCodeContext(decision.description);
    } else {
      // Generic context
      context = await this.vectorStore.getContext(decision.description, 'all');
    }

    // Attach context to decision
    decision.rag_context = context;
    decision.context_sources = context.sources ? Object.keys(context.sources).length : 0;

    return decision;
  }

  /**
   * Learn from completed task
   */
  async learnFromTask(task, outcome) {
    // Store task in vector database for future retrieval
    await this.vectorStore.storeVector('tasks', {
      content: `${task.description}\nOutcome: ${outcome.status}\nLessons: ${outcome.lessons_learned || 'N/A'}`,
      metadata: {
        task_id: task.task_id,
        task_type: task.task_type,
        status: outcome.status,
        duration: outcome.duration,
        worker_type: outcome.worker_type
      }
    });

    console.log(`Learned from task ${task.task_id}`);
  }

  /**
   * Build context summary from sources
   */
  _buildContextSummary(sources) {
    const summary = [];

    if (sources.similar_tasks && sources.similar_tasks.length > 0) {
      summary.push(`Found ${sources.similar_tasks.length} similar past tasks`);
    }

    if (sources.relevant_code && sources.relevant_code.length > 0) {
      summary.push(`${sources.relevant_code.length} relevant code examples`);
    }

    if (sources.documentation && sources.documentation.length > 0) {
      summary.push(`${sources.documentation.length} documentation references`);
    }

    if (sources.past_decisions && sources.past_decisions.length > 0) {
      summary.push(`${sources.past_decisions.length} related AI decisions`);
    }

    if (sources.failure_patterns && sources.failure_patterns.length > 0) {
      summary.push(`${sources.failure_patterns.length} known failure patterns`);
    }

    return summary.join(', ');
  }

  /**
   * Get context from cache
   */
  async _getFromCache(key) {
    const cacheKey = crypto.createHash('md5').update(key).digest('hex');
    const cachePath = path.join(this.contextCachePath, `${cacheKey}.json`);

    try {
      const stats = await fs.stat(cachePath);
      const age = Date.now() - stats.mtimeMs;

      if (age > this.cacheTTL) {
        // Cache expired
        await fs.unlink(cachePath);
        return null;
      }

      const content = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save context to cache
   */
  async _saveToCache(key, context) {
    const cacheKey = crypto.createHash('md5').update(key).digest('hex');
    const cachePath = path.join(this.contextCachePath, `${cacheKey}.json`);

    await fs.writeFile(cachePath, JSON.stringify(context, null, 2));
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      const files = await fs.readdir(this.contextCachePath);
      let cleared = 0;

      for (const file of files) {
        const filePath = path.join(this.contextCachePath, file);
        const stats = await fs.stat(filePath);
        const age = Date.now() - stats.mtimeMs;

        if (age > this.cacheTTL) {
          await fs.unlink(filePath);
          cleared++;
        }
      }

      console.log(`Cleared ${cleared} expired cache entries`);
      return cleared;
    } catch (error) {
      console.error('Failed to clear cache:', error.message);
      return 0;
    }
  }
}

// CLI interface
if (require.main === module) {
  const action = process.argv[2];
  const contextManager = new ContextManager();

  (async () => {
    await contextManager.initialize();

    switch (action) {
      case 'build':
        const description = process.argv[3];
        const context = await contextManager.buildTaskContext({
          task_id: 'test-001',
          description: description,
          task_type: 'development'
        });
        console.log('\nTask Context:');
        console.log(JSON.stringify(context, null, 2));
        break;

      case 'debug':
        const issue = process.argv[3];
        const debugContext = await contextManager.buildDebugContext({
          description: issue
        });
        console.log('\nDebug Context:');
        console.log(JSON.stringify(debugContext, null, 2));
        break;

      case 'strategy':
        // Enhancement #18: Get strategy recommendations
        const strategyDesc = process.argv[3];
        const taskType = process.argv[4] || 'development';
        const recommendations = await contextManager.generateStrategyRecommendations(strategyDesc, taskType);
        console.log('\nStrategy Recommendations:');
        console.log(JSON.stringify(recommendations, null, 2));
        if (recommendations.strategies.length > 0) {
          console.log('\nFormatted Guidance:');
          console.log(contextManager._formatStrategyGuidance(recommendations));
        }
        break;

      case 'similar':
        // Enhancement #18: Find similar past tasks
        const similarQuery = process.argv[3];
        const similarTasks = await contextManager.findSimilarPastTasks(similarQuery);
        console.log('\nSimilar Past Tasks:');
        console.log(JSON.stringify(similarTasks, null, 2));
        break;

      case 'clear-cache':
        const cleared = await contextManager.clearExpiredCache();
        console.log(`\nCleared ${cleared} cache entries`);
        break;

      default:
        console.log('Usage: node context-manager.js <action>');
        console.log('Actions:');
        console.log('  build <description>          - Build task context');
        console.log('  debug <issue>                - Build debug context');
        console.log('  strategy <desc> [type]       - Get strategy recommendations');
        console.log('  similar <query>              - Find similar past tasks');
        console.log('  clear-cache                  - Clear expired cache');
        break;
    }
  })();
}

module.exports = ContextManager;
