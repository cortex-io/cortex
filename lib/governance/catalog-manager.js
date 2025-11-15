/**
 * Unified Catalog Manager
 *
 * Implements Databricks-proven governance patterns for unified data and AI asset management.
 * Provides centralized catalog, asset discovery, lineage tracking, and natural language search.
 *
 * Inspired by:
 * - Amgen: Reduced 120 roles to 1-2 using unified catalog
 * - Rivian: 50x user growth with centralized governance
 * - 98% of CIOs say unified data+AI governance is critical
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class CatalogManager {
  constructor(catalogPath = '/Users/ryandahlberg/Projects/commit-relay/coordination/catalog') {
    this.catalogPath = catalogPath;
    this.metastorePath = path.join(catalogPath, 'metastore.json');
    this.schemasPath = path.join(catalogPath, 'schemas');
    this.lineagePath = path.join(catalogPath, 'lineage');
    this.indexesPath = path.join(catalogPath, 'indexes');

    this.metastore = null;
    this.assetSchema = null;
  }

  /**
   * Initialize the catalog manager by loading metastore and schemas
   */
  async initialize() {
    try {
      // Load metastore
      const metastoreData = await fs.readFile(this.metastorePath, 'utf8');
      this.metastore = JSON.parse(metastoreData);

      // Load asset schema
      const schemaData = await fs.readFile(
        path.join(this.schemasPath, 'asset-schema.json'),
        'utf8'
      );
      this.assetSchema = JSON.parse(schemaData);

      console.log('[CatalogManager] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[CatalogManager] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Register a new asset in the catalog
   * @param {Object} asset - Asset object with required fields
   * @returns {Object} Registered asset with generated ID
   */
  async registerAsset(asset) {
    if (!this.metastore) {
      await this.initialize();
    }

    // Generate asset ID if not provided
    if (!asset.asset_id) {
      asset.asset_id = this._generateAssetId(asset);
    }

    // Add timestamps
    asset.created_at = asset.created_at || new Date().toISOString();
    asset.updated_at = new Date().toISOString();

    // Validate asset against schema
    this._validateAsset(asset);

    // Register in metastore
    this.metastore.assets[asset.asset_id] = asset;

    // Update statistics
    this._updateStatistics(asset, 'add');

    // Update indexes
    await this._updateIndexes(asset, 'add');

    // Save metastore
    await this._saveMetastore();

    console.log(`[CatalogManager] Registered asset: ${asset.asset_id}`);
    return asset;
  }

  /**
   * Discover and register all assets in the system
   * @returns {Object} Discovery results with statistics
   */
  async discoverAssets() {
    console.log('[CatalogManager] Starting asset discovery...');

    const results = {
      discovered: 0,
      registered: 0,
      errors: [],
      assets_by_type: { data: 0, ai: 0, model: 0 }
    };

    try {
      // Discover coordination data assets
      const coordinationAssets = await this._discoverCoordinationAssets();
      results.discovered += coordinationAssets.length;

      // Discover master agent AI assets
      const masterAssets = await this._discoverMasterAgents();
      results.discovered += masterAssets.length;

      // Discover worker specifications
      const workerAssets = await this._discoverWorkerSpecs();
      results.discovered += workerAssets.length;

      // Discover agent prompts
      const promptAssets = await this._discoverAgentPrompts();
      results.discovered += promptAssets.length;

      // Register all discovered assets
      const allAssets = [
        ...coordinationAssets,
        ...masterAssets,
        ...workerAssets,
        ...promptAssets
      ];

      for (const asset of allAssets) {
        try {
          await this.registerAsset(asset);
          results.registered++;
          results.assets_by_type[asset.asset_type]++;
        } catch (error) {
          results.errors.push({
            asset: asset.asset_name || 'unknown',
            error: error.message
          });
        }
      }

      // Update discovery timestamp
      this.metastore.statistics.last_discovery = new Date().toISOString();
      await this._saveMetastore();

      console.log(`[CatalogManager] Discovery complete: ${results.registered}/${results.discovered} assets registered`);
      return results;
    } catch (error) {
      console.error('[CatalogManager] Discovery failed:', error.message);
      throw error;
    }
  }

  /**
   * Search assets using natural language query
   * @param {string} query - Natural language search query
   * @returns {Array} Matching assets
   */
  async searchAssets(query) {
    if (!this.metastore) {
      await this.initialize();
    }

    console.log(`[CatalogManager] Searching: "${query}"`);

    // Parse query patterns
    const searchTerms = this._parseSearchQuery(query);

    // Filter assets based on search terms
    const allAssets = Object.values(this.metastore.assets);
    const results = allAssets.filter(asset => this._matchesSearch(asset, searchTerms));

    // Rank results by relevance
    const rankedResults = this._rankSearchResults(results, searchTerms);

    console.log(`[CatalogManager] Found ${rankedResults.length} matching assets`);
    return rankedResults;
  }

  /**
   * Get complete lineage for an asset
   * @param {string} assetId - Asset identifier
   * @returns {Object} Lineage graph with upstream and downstream dependencies
   */
  async getAssetLineage(assetId) {
    console.log(`[CatalogManager] Getting lineage for: ${assetId}`);

    const lineage = {
      asset_id: assetId,
      upstream: [],
      downstream: [],
      ai_usage: [],
      decisions: []
    };

    try {
      // Read data lineage
      const dataLineage = await this._readLineageFile('data-lineage.jsonl');
      lineage.upstream = dataLineage.filter(l => l.target_asset === assetId);
      lineage.downstream = dataLineage.filter(l => l.source_asset === assetId);

      // Read AI lineage
      const aiLineage = await this._readLineageFile('ai-lineage.jsonl');
      lineage.ai_usage = aiLineage.filter(l => l.data_asset === assetId);

      // Read decision lineage
      const decisionLineage = await this._readLineageFile('decision-lineage.jsonl');
      lineage.decisions = decisionLineage.filter(l =>
        l.input_data === assetId || l.decision_output === assetId
      );

      return lineage;
    } catch (error) {
      console.error('[CatalogManager] Lineage retrieval failed:', error.message);
      throw error;
    }
  }

  /**
   * Tag an asset with metadata
   * @param {string} assetId - Asset identifier
   * @param {Object} tags - Tags to apply
   * @returns {Object} Updated asset
   */
  async tagAsset(assetId, tags) {
    if (!this.metastore) {
      await this.initialize();
    }

    const asset = this.metastore.assets[assetId];
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Apply tags
    asset.tags = asset.tags || [];
    if (tags.tags && Array.isArray(tags.tags)) {
      asset.tags = [...new Set([...asset.tags, ...tags.tags])];
    }

    // Apply sensitivity level
    if (tags.sensitivity) {
      asset.sensitivity = tags.sensitivity;
      await this._updateIndexes(asset, 'update');
    }

    // Apply owner
    if (tags.owner) {
      asset.owner = tags.owner;
      await this._updateIndexes(asset, 'update');
    }

    // Apply compliance tags
    if (tags.compliance_tags) {
      asset.compliance_tags = tags.compliance_tags;
    }

    asset.updated_at = new Date().toISOString();
    await this._saveMetastore();

    console.log(`[CatalogManager] Tagged asset: ${assetId}`);
    return asset;
  }

  /**
   * Record data lineage
   * @param {string} sourceAsset - Source asset ID
   * @param {string} targetAsset - Target asset ID
   * @param {string} transformation - Transformation description
   */
  async recordDataLineage(sourceAsset, targetAsset, transformation) {
    const lineageRecord = {
      lineage_id: crypto.randomUUID(),
      source_asset: sourceAsset,
      target_asset: targetAsset,
      transformation: transformation,
      timestamp: new Date().toISOString()
    };

    await this._appendLineage('data-lineage.jsonl', lineageRecord);
    console.log(`[CatalogManager] Recorded data lineage: ${sourceAsset} -> ${targetAsset}`);
  }

  /**
   * Record AI lineage (which agent used which data)
   * @param {string} agentId - Agent identifier
   * @param {string} dataAsset - Data asset ID
   * @param {string} operation - Operation performed
   */
  async recordAILineage(agentId, dataAsset, operation) {
    const lineageRecord = {
      lineage_id: crypto.randomUUID(),
      agent_id: agentId,
      data_asset: dataAsset,
      operation: operation,
      timestamp: new Date().toISOString()
    };

    await this._appendLineage('ai-lineage.jsonl', lineageRecord);
    console.log(`[CatalogManager] Recorded AI lineage: ${agentId} used ${dataAsset}`);
  }

  /**
   * Record decision lineage (routing decisions)
   * @param {string} decisionId - Decision identifier
   * @param {string} inputData - Input data asset
   * @param {string} decisionOutput - Decision output
   * @param {number} confidence - Confidence score
   */
  async recordDecisionLineage(decisionId, inputData, decisionOutput, confidence) {
    const lineageRecord = {
      lineage_id: crypto.randomUUID(),
      decision_id: decisionId,
      input_data: inputData,
      decision_output: decisionOutput,
      confidence: confidence,
      timestamp: new Date().toISOString()
    };

    await this._appendLineage('decision-lineage.jsonl', lineageRecord);
    console.log(`[CatalogManager] Recorded decision lineage: ${decisionId}`);
  }

  /**
   * Get catalog statistics
   * @returns {Object} Catalog statistics
   */
  async getStatistics() {
    if (!this.metastore) {
      await this.initialize();
    }
    return this.metastore.statistics;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Discover coordination data assets
   */
  async _discoverCoordinationAssets() {
    const assets = [];
    const coordinationPath = '/Users/ryandahlberg/Projects/commit-relay/coordination';

    // Key coordination files
    const coordinationFiles = [
      { path: 'task-queue.json', name: 'Task Queue', schema: 'tasks', sensitivity: 'internal' },
      { path: 'pm-state.json', name: 'PM State', schema: 'tasks', sensitivity: 'internal' },
      { path: 'pm-activity.jsonl', name: 'PM Activity Log', schema: 'tasks', sensitivity: 'internal' },
      { path: 'workforce-streams.json', name: 'Workforce Streams', schema: 'tasks', sensitivity: 'internal' },
      { path: 'dashboard-events.jsonl', name: 'Dashboard Events', schema: 'history', sensitivity: 'internal' },
      { path: 'memory/working/pool-state.json', name: 'Worker Pool State', schema: 'memory', sensitivity: 'internal' },
      { path: 'memory/long-term/task-patterns.json', name: 'Task Patterns', schema: 'memory', sensitivity: 'internal' },
      { path: 'orchestrator/state/current.json', name: 'Orchestrator State', schema: 'tasks', sensitivity: 'internal' }
    ];

    for (const file of coordinationFiles) {
      const fullPath = path.join(coordinationPath, file.path);
      try {
        const stats = await fs.stat(fullPath);
        assets.push({
          asset_name: file.name,
          asset_type: 'data',
          namespace: `coordination.${file.schema}`,
          path: fullPath,
          format: file.path.endsWith('.jsonl') ? 'jsonl' : 'json',
          size_bytes: stats.size,
          last_modified: stats.mtime.toISOString(),
          sensitivity: file.sensitivity,
          owner: 'system',
          tags: ['coordination', file.schema]
        });
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Discover routing decisions
    const routingFiles = [
      'masters/coordinator/logs/routing-decisions.jsonl',
      'masters/coordinator/knowledge-base/routing-decisions.jsonl'
    ];

    for (const file of routingFiles) {
      const fullPath = path.join(coordinationPath, file);
      try {
        const stats = await fs.stat(fullPath);
        assets.push({
          asset_name: `Routing Decisions (${file.includes('logs') ? 'Logs' : 'Knowledge Base'})`,
          asset_type: 'data',
          namespace: 'coordination.routing',
          path: fullPath,
          format: 'jsonl',
          size_bytes: stats.size,
          last_modified: stats.mtime.toISOString(),
          sensitivity: 'internal',
          owner: 'coordinator-master',
          tags: ['routing', 'moe', 'decisions']
        });
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    return assets;
  }

  /**
   * Discover master agent AI assets
   */
  async _discoverMasterAgents() {
    const assets = [];
    const masterNames = ['coordinator', 'development', 'security', 'cicd', 'inventory', 'testing', 'monitoring'];

    for (const masterName of masterNames) {
      // Discover agent state
      const statePath = `/Users/ryandahlberg/Projects/commit-relay/coordination/masters/${masterName}/context/master-state.json`;
      try {
        const stateData = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateData);

        assets.push({
          asset_name: `${masterName.charAt(0).toUpperCase() + masterName.slice(1)} Master Agent`,
          asset_type: 'ai',
          namespace: `masters.${masterName}`,
          agent_type: 'master',
          capabilities: state.expertise?.specializations || [],
          prompt_path: `/.claude/agents/${masterName}-master.md`,
          state_path: statePath,
          status: state.status || 'unknown',
          sensitivity: 'internal',
          owner: 'system',
          tags: ['master-agent', masterName, 'ai']
        });
      } catch (error) {
        // Master doesn't exist or error reading, skip
      }

      // Discover knowledge bases
      const kbPath = `/Users/ryandahlberg/Projects/commit-relay/coordination/masters/${masterName}/knowledge-base`;
      try {
        const kbFiles = await fs.readdir(kbPath);
        for (const kbFile of kbFiles) {
          const fullPath = path.join(kbPath, kbFile);
          const stats = await fs.stat(fullPath);
          if (stats.isFile()) {
            assets.push({
              asset_name: `${masterName} Knowledge Base - ${kbFile}`,
              asset_type: 'data',
              namespace: `masters.${masterName}`,
              path: fullPath,
              format: kbFile.endsWith('.jsonl') ? 'jsonl' : 'json',
              size_bytes: stats.size,
              sensitivity: 'internal',
              owner: `${masterName}-master`,
              tags: ['knowledge-base', masterName, 'learning']
            });
          }
        }
      } catch (error) {
        // KB directory doesn't exist, skip
      }
    }

    return assets;
  }

  /**
   * Discover worker specifications
   */
  async _discoverWorkerSpecs() {
    const assets = [];
    const workerSpecPath = '/Users/ryandahlberg/Projects/commit-relay/coordination/worker-specs';

    try {
      const specDirs = await fs.readdir(workerSpecPath);
      for (const dir of specDirs) {
        const dirPath = path.join(workerSpecPath, dir);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          const files = await fs.readdir(dirPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const fullPath = path.join(dirPath, file);
              const fileStats = await fs.stat(fullPath);
              assets.push({
                asset_name: `Worker Spec - ${file}`,
                asset_type: 'data',
                namespace: 'workers.specs',
                path: fullPath,
                format: 'json',
                size_bytes: fileStats.size,
                sensitivity: 'internal',
                owner: 'system',
                tags: ['worker', 'spec', dir]
              });
            }
          }
        }
      }
    } catch (error) {
      // Worker specs directory doesn't exist or error, skip
    }

    return assets;
  }

  /**
   * Discover agent prompt definitions
   */
  async _discoverAgentPrompts() {
    const assets = [];
    const promptPath = '/Users/ryandahlberg/Projects/commit-relay/.claude/agents';

    try {
      const promptFiles = await fs.readdir(promptPath);
      for (const file of promptFiles) {
        if (file.endsWith('.md')) {
          const fullPath = path.join(promptPath, file);
          const stats = await fs.stat(fullPath);
          const agentName = file.replace('.md', '').replace('-', ' ');

          assets.push({
            asset_name: `Agent Prompt - ${agentName}`,
            asset_type: 'ai',
            namespace: 'prompts.agent_definitions',
            agent_type: file.includes('master') ? 'master' : 'worker',
            prompt_path: fullPath,
            size_bytes: stats.size,
            sensitivity: 'internal',
            owner: 'system',
            tags: ['prompt', 'agent-definition']
          });
        }
      }
    } catch (error) {
      // Prompt directory doesn't exist or error, skip
    }

    return assets;
  }

  /**
   * Generate a unique asset ID based on namespace and name
   */
  _generateAssetId(asset) {
    const namespace = asset.namespace || 'unknown';
    const name = (asset.asset_name || 'unnamed')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    return `${namespace}.${name}`;
  }

  /**
   * Validate asset against schema
   */
  _validateAsset(asset) {
    const assetType = asset.asset_type;
    if (!this.assetSchema.asset_types[assetType]) {
      throw new Error(`Invalid asset type: ${assetType}`);
    }

    const requiredFields = this.assetSchema.asset_types[assetType].required_fields;
    for (const field of requiredFields) {
      if (!asset[field]) {
        throw new Error(`Missing required field for ${assetType}: ${field}`);
      }
    }
  }

  /**
   * Update catalog statistics
   */
  _updateStatistics(asset, operation) {
    if (operation === 'add') {
      this.metastore.statistics.total_assets++;
      if (asset.asset_type === 'data') this.metastore.statistics.data_assets++;
      if (asset.asset_type === 'ai') this.metastore.statistics.ai_assets++;
      if (asset.asset_type === 'model') this.metastore.statistics.model_assets++;
    }
    this.metastore.statistics.last_updated = new Date().toISOString();
  }

  /**
   * Update all indexes with asset
   */
  async _updateIndexes(asset, operation) {
    // Update by-type index
    const byTypeIndex = await this._readIndex('by-type.json');
    if (operation === 'add') {
      byTypeIndex[asset.asset_type].push(asset.asset_id);
    }
    await this._saveIndex('by-type.json', byTypeIndex);

    // Update by-sensitivity index
    if (asset.sensitivity) {
      const bySensitivityIndex = await this._readIndex('by-sensitivity.json');
      if (operation === 'add') {
        bySensitivityIndex[asset.sensitivity].push(asset.asset_id);
      }
      await this._saveIndex('by-sensitivity.json', bySensitivityIndex);
    }

    // Update by-owner index
    if (asset.owner) {
      const byOwnerIndex = await this._readIndex('by-owner.json');
      if (!byOwnerIndex.owners[asset.owner]) {
        byOwnerIndex.owners[asset.owner] = [];
      }
      if (operation === 'add') {
        byOwnerIndex.owners[asset.owner].push(asset.asset_id);
      }
      await this._saveIndex('by-owner.json', byOwnerIndex);
    }

    // Update by-namespace index
    const byNamespaceIndex = await this._readIndex('by-namespace.json');
    const topLevel = asset.namespace.split('.')[0];
    if (!byNamespaceIndex.namespaces[topLevel]) {
      byNamespaceIndex.namespaces[topLevel] = {};
    }
    if (!byNamespaceIndex.namespaces[topLevel][asset.namespace]) {
      byNamespaceIndex.namespaces[topLevel][asset.namespace] = [];
    }
    if (operation === 'add') {
      byNamespaceIndex.namespaces[topLevel][asset.namespace].push(asset.asset_id);
    }
    await this._saveIndex('by-namespace.json', byNamespaceIndex);
  }

  /**
   * Parse natural language search query into search terms
   */
  _parseSearchQuery(query) {
    const terms = {
      keywords: [],
      master: null,
      confidence: null,
      sensitivity: null,
      type: null
    };

    query = query.toLowerCase();

    // Extract master mentions
    const masterMatch = query.match(/(?:assigned to|for|by) (\w+) master/);
    if (masterMatch) {
      terms.master = masterMatch[1];
    }

    // Extract confidence threshold
    const confidenceMatch = query.match(/confidence [<>] (0\.\d+)/);
    if (confidenceMatch) {
      terms.confidence = {
        operator: query.includes('<') ? '<' : '>',
        value: parseFloat(confidenceMatch[1])
      };
    }

    // Extract sensitivity
    if (query.includes('pii')) terms.sensitivity = 'pii';
    if (query.includes('confidential')) terms.sensitivity = 'confidential';

    // Extract asset type
    if (query.includes('task')) terms.type = 'task';
    if (query.includes('routing')) terms.type = 'routing';
    if (query.includes('agent')) terms.type = 'agent';

    // Extract general keywords
    const words = query.split(/\s+/).filter(w => w.length > 3);
    terms.keywords = words;

    return terms;
  }

  /**
   * Check if asset matches search terms
   */
  _matchesSearch(asset, terms) {
    // Check master assignment
    if (terms.master && asset.owner !== `${terms.master}-master`) {
      return false;
    }

    // Check sensitivity
    if (terms.sensitivity && asset.sensitivity !== terms.sensitivity) {
      return false;
    }

    // Check keywords in name, tags, description
    const searchableText = [
      asset.asset_name || '',
      asset.description || '',
      ...(asset.tags || [])
    ].join(' ').toLowerCase();

    for (const keyword of terms.keywords) {
      if (searchableText.includes(keyword)) {
        return true;
      }
    }

    return terms.keywords.length === 0; // If no keywords, match all
  }

  /**
   * Rank search results by relevance
   */
  _rankSearchResults(results, terms) {
    return results.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Boost exact name matches
      if (a.asset_name && terms.keywords.some(k => a.asset_name.toLowerCase().includes(k))) {
        scoreA += 10;
      }
      if (b.asset_name && terms.keywords.some(k => b.asset_name.toLowerCase().includes(k))) {
        scoreB += 10;
      }

      // Boost by update recency
      const ageA = new Date() - new Date(a.updated_at || a.created_at);
      const ageB = new Date() - new Date(b.updated_at || b.created_at);
      scoreA -= ageA / (1000 * 60 * 60 * 24); // Penalty for age in days
      scoreB -= ageB / (1000 * 60 * 60 * 24);

      return scoreB - scoreA;
    });
  }

  /**
   * Read an index file
   */
  async _readIndex(indexFile) {
    const indexPath = path.join(this.indexesPath, indexFile);
    const data = await fs.readFile(indexPath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Save an index file
   */
  async _saveIndex(indexFile, data) {
    const indexPath = path.join(this.indexesPath, indexFile);
    data.last_updated = new Date().toISOString();
    await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
  }

  /**
   * Read a lineage file
   */
  async _readLineageFile(lineageFile) {
    const lineagePath = path.join(this.lineagePath, lineageFile);
    const data = await fs.readFile(lineagePath, 'utf8');
    return data.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  /**
   * Append to a lineage file
   */
  async _appendLineage(lineageFile, record) {
    const lineagePath = path.join(this.lineagePath, lineageFile);
    await fs.appendFile(lineagePath, JSON.stringify(record) + '\n');
  }

  /**
   * Save metastore to disk
   */
  async _saveMetastore() {
    await fs.writeFile(
      this.metastorePath,
      JSON.stringify(this.metastore, null, 2)
    );
  }
}

module.exports = CatalogManager;
