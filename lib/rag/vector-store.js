#!/usr/bin/env node
// lib/rag/vector-store.js
// Vector Database for RAG (Retrieval-Augmented Generation)
// Part of Enhancement Phase: Vector Database Integration
//
// Responsibilities:
// - Store and retrieve embeddings for code, docs, and knowledge
// - Semantic search for context retrieval
// - Knowledge graph construction
// - Context-aware AI decision support

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class VectorStore {
  constructor() {
    this.vectorDbPath = 'coordination/vector-db';
    this.indexPath = path.join(this.vectorDbPath, 'index.json');
    this.embeddingsPath = path.join(this.vectorDbPath, 'embeddings');
    
    // In-memory index for fast lookup
    this.index = {
      version: '1.0.0',
      created_at: null,
      last_updated: null,
      total_vectors: 0,
      collections: {}
    };
    
    // Collection types
    this.collections = {
      'code': { dimension: 1536, description: 'Code snippets and implementations' },
      'documentation': { dimension: 1536, description: 'Documentation and runbooks' },
      'decisions': { dimension: 1536, description: 'AI decision history and reasoning' },
      'patterns': { dimension: 1536, description: 'Failure patterns and solutions' },
      'tasks': { dimension: 1536, description: 'Task descriptions and outcomes' }
    };
  }

  /**
   * Initialize vector store
   */
  async initialize() {
    try {
      await fs.mkdir(this.vectorDbPath, { recursive: true });
      await fs.mkdir(this.embeddingsPath, { recursive: true });

      // Load existing index
      try {
        const indexContent = await fs.readFile(this.indexPath, 'utf8');
        this.index = JSON.parse(indexContent);
      } catch (error) {
        // Initialize new index
        this.index.created_at = new Date().toISOString();
        this.index.last_updated = new Date().toISOString();
        
        // Initialize collections
        for (const [name, config] of Object.entries(this.collections)) {
          this.index.collections[name] = {
            name: name,
            dimension: config.dimension,
            description: config.description,
            count: 0,
            vectors: []
          };
        }
        
        await this._saveIndex();
      }

      console.log('Vector Store initialized');
      console.log(`Collections: ${Object.keys(this.index.collections).join(', ')}`);
      console.log(`Total vectors: ${this.index.total_vectors}`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Vector Store:', error.message);
      return false;
    }
  }

  /**
   * Store vector embedding
   */
  async storeVector(collection, document) {
    if (!this.index.collections[collection]) {
      throw new Error(`Collection not found: ${collection}`);
    }

    const vectorId = crypto.randomUUID();
    
    // Generate embedding (using simple hash-based mock for now)
    // In production, this would call an embedding API (OpenAI, etc.)
    const embedding = await this._generateEmbedding(document.content);

    const vector = {
      id: vectorId,
      collection: collection,
      content: document.content,
      metadata: document.metadata || {},
      embedding: embedding,
      created_at: new Date().toISOString()
    };

    // Save vector to disk
    await this._saveVector(collection, vector);

    // Update index
    this.index.collections[collection].vectors.push({
      id: vectorId,
      metadata: document.metadata || {},
      created_at: vector.created_at
    });
    this.index.collections[collection].count++;
    this.index.total_vectors++;
    this.index.last_updated = new Date().toISOString();

    await this._saveIndex();

    console.log(`Stored vector ${vectorId} in collection '${collection}'`);

    return vectorId;
  }

  /**
   * Semantic search across vectors
   */
  async search(query, options = {}) {
    const collection = options.collection || null;
    const limit = options.limit || 10;
    const minSimilarity = options.min_similarity || 0.7;

    // Generate query embedding
    const queryEmbedding = await this._generateEmbedding(query);

    const results = [];

    // Search in specified collection or all collections
    const collectionsToSearch = collection 
      ? [collection]
      : Object.keys(this.index.collections);

    for (const collectionName of collectionsToSearch) {
      const collectionVectors = this.index.collections[collectionName].vectors;

      for (const vectorMeta of collectionVectors) {
        // Load vector from disk
        const vector = await this._loadVector(collectionName, vectorMeta.id);

        // Calculate similarity
        const similarity = this._cosineSimilarity(queryEmbedding, vector.embedding);

        if (similarity >= minSimilarity) {
          results.push({
            id: vector.id,
            collection: collectionName,
            content: vector.content,
            metadata: vector.metadata,
            similarity: similarity
          });
        }
      }
    }

    // Sort by similarity (highest first)
    results.sort((a, b) => b.similarity - a.similarity);

    // Apply limit
    return results.slice(0, limit);
  }

  /**
   * Get context for AI decision
   */
  async getContext(query, contextType = 'all', options = {}) {
    const limit = options.limit || 5;

    const context = {
      query: query,
      context_type: contextType,
      retrieved_at: new Date().toISOString(),
      sources: []
    };

    // Search relevant collections based on context type
    let collections = [];
    if (contextType === 'code') {
      collections = ['code'];
    } else if (contextType === 'documentation') {
      collections = ['documentation'];
    } else if (contextType === 'decisions') {
      collections = ['decisions', 'patterns'];
    } else {
      collections = Object.keys(this.index.collections);
    }

    for (const collection of collections) {
      const results = await this.search(query, { 
        collection, 
        limit: Math.ceil(limit / collections.length),
        min_similarity: 0.6
      });

      context.sources.push(...results.map(r => ({
        collection: r.collection,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata
      })));
    }

    // Sort all sources by similarity
    context.sources.sort((a, b) => b.similarity - a.similarity);

    // Apply overall limit
    context.sources = context.sources.slice(0, limit);

    return context;
  }

  /**
   * Index code repository
   */
  async indexCodeRepository(repoPath, patterns = ['**/*.js', '**/*.sh', '**/*.md']) {
    const indexed = {
      repository: repoPath,
      indexed_at: new Date().toISOString(),
      files_indexed: 0,
      vectors_created: 0
    };

    // Simplified implementation - in production would use glob patterns
    const files = [
      { path: 'lib/governance/catalog-manager.js', type: 'code' },
      { path: 'docs/runbooks/worker-failure.md', type: 'documentation' },
      { path: 'scripts/wizards/create-worker.sh', type: 'code' }
    ];

    for (const file of files) {
      try {
        const content = `Sample content from ${file.path}`;
        
        const collection = file.type === 'code' ? 'code' : 'documentation';
        
        await this.storeVector(collection, {
          content: content,
          metadata: {
            file_path: file.path,
            file_type: file.type,
            indexed_at: new Date().toISOString()
          }
        });

        indexed.files_indexed++;
        indexed.vectors_created++;
      } catch (error) {
        console.error(`Failed to index ${file.path}:`, error.message);
      }
    }

    return indexed;
  }

  /**
   * Index AI decisions for learning
   */
  async indexDecision(decision) {
    return await this.storeVector('decisions', {
      content: `${decision.type}: ${decision.description}\nReasoning: ${decision.reasoning || 'N/A'}`,
      metadata: {
        decision_id: decision.id,
        agent: decision.agent,
        confidence: decision.confidence,
        outcome: decision.outcome,
        timestamp: decision.timestamp
      }
    });
  }

  /**
   * Index failure pattern
   */
  async indexPattern(pattern) {
    return await this.storeVector('patterns', {
      content: `${pattern.category}/${pattern.type}: ${pattern.signature.error_pattern || 'N/A'}\nSolution: ${pattern.auto_fix_action || 'Manual intervention'}`,
      metadata: {
        pattern_id: pattern.pattern_id,
        category: pattern.category,
        severity: pattern.severity,
        frequency: pattern.frequency.total_occurrences
      }
    });
  }

  /**
   * Get collection statistics
   */
  async getStatistics() {
    const stats = {
      total_vectors: this.index.total_vectors,
      collections: {},
      index_size: 0
    };

    for (const [name, collection] of Object.entries(this.index.collections)) {
      stats.collections[name] = {
        count: collection.count,
        dimension: collection.dimension,
        description: collection.description
      };
    }

    return stats;
  }

  /**
   * Generate embedding from text
   * Mock implementation using simple hash-based vectors
   * In production, would use OpenAI embeddings API or similar
   */
  async _generateEmbedding(text) {
    const dimension = 1536; // Standard OpenAI embedding dimension
    const embedding = new Array(dimension).fill(0);

    // Simple hash-based mock embedding
    // Creates consistent but simple vectors for demonstration
    const hash = crypto.createHash('sha256').update(text).digest();
    
    for (let i = 0; i < dimension; i++) {
      const byteIndex = i % hash.length;
      embedding[i] = (hash[byteIndex] / 255) * 2 - 1; // Normalize to [-1, 1]
    }

    return embedding;
  }

  /**
   * Calculate cosine similarity between vectors
   */
  _cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Save vector to disk
   */
  async _saveVector(collection, vector) {
    const collectionPath = path.join(this.embeddingsPath, collection);
    await fs.mkdir(collectionPath, { recursive: true });

    const vectorPath = path.join(collectionPath, `${vector.id}.json`);
    await fs.writeFile(vectorPath, JSON.stringify(vector, null, 2));
  }

  /**
   * Load vector from disk
   */
  async _loadVector(collection, vectorId) {
    const vectorPath = path.join(this.embeddingsPath, collection, `${vectorId}.json`);
    const content = await fs.readFile(vectorPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Save index to disk
   */
  async _saveIndex() {
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
  }
}

// CLI interface
if (require.main === module) {
  const action = process.argv[2];
  const vectorStore = new VectorStore();

  (async () => {
    await vectorStore.initialize();

    switch (action) {
      case 'search':
        const query = process.argv[3];
        const results = await vectorStore.search(query);
        console.log('\nSearch Results:');
        console.log(JSON.stringify(results, null, 2));
        break;

      case 'context':
        const contextQuery = process.argv[3];
        const contextType = process.argv[4] || 'all';
        const context = await vectorStore.getContext(contextQuery, contextType);
        console.log('\nContext Retrieved:');
        console.log(JSON.stringify(context, null, 2));
        break;

      case 'index-repo':
        const repoPath = process.argv[3] || '.';
        const indexResult = await vectorStore.indexCodeRepository(repoPath);
        console.log('\nRepository Indexing:');
        console.log(JSON.stringify(indexResult, null, 2));
        break;

      case 'stats':
        const stats = await vectorStore.getStatistics();
        console.log('\nVector Store Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      default:
        console.log('Usage: node vector-store.js <action>');
        console.log('Actions:');
        console.log('  search <query>              - Search vectors');
        console.log('  context <query> [type]      - Get context for query');
        console.log('  index-repo [path]           - Index code repository');
        console.log('  stats                       - Show statistics');
        break;
    }
  })();
}

module.exports = VectorStore;
