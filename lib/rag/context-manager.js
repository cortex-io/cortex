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

class ContextManager {
  constructor() {
    this.vectorStore = new VectorStore();
    this.contextCachePath = 'coordination/vector-db/context-cache';
    this.cacheEnabled = true;
    this.cacheTTL = 3600000; // 1 hour
  }

  /**
   * Initialize context manager
   */
  async initialize() {
    try {
      await this.vectorStore.initialize();
      await fs.mkdir(this.contextCachePath, { recursive: true });
      
      console.log('Context Manager initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Context Manager:', error.message);
      return false;
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

      case 'clear-cache':
        const cleared = await contextManager.clearExpiredCache();
        console.log(`\nCleared ${cleared} cache entries`);
        break;

      default:
        console.log('Usage: node context-manager.js <action>');
        console.log('Actions:');
        console.log('  build <description>   - Build task context');
        console.log('  debug <issue>         - Build debug context');
        console.log('  clear-cache           - Clear expired cache');
        break;
    }
  })();
}

module.exports = ContextManager;
