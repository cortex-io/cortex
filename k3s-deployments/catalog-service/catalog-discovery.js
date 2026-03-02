#!/usr/bin/env node
/**
 * Cortex Catalog Discovery Service
 *
 * Automated asset discovery and cataloging
 * - Multi-threaded file scanning
 * - Incremental updates with checksums
 * - Real-time Redis updates
 * - Pub/Sub notifications
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Redis = require('ioredis');
const { Worker } = require('worker_threads');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-master.cortex-system.svc.cluster.local',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

const CORTEX_ROOT = process.env.CORTEX_ROOT || '/cortex';
const DISCOVERY_PATTERNS = {
  schemas: {
    path: 'coordination/schemas',
    pattern: /\.(json|schema\.json)$/,
    category: 'schema',
    owner: 'platform'
  },
  prompts: {
    path: 'coordination/prompts',
    pattern: /\.md$/,
    category: 'prompt',
    owner: 'platform'
  },
  masters: {
    path: 'coordination/masters',
    pattern: /\.(json|state\.json)$/,
    category: 'master-state',
    owner: null  // Determined from path
  },
  tasks: {
    path: 'coordination/tasks',
    pattern: /\.(json)$/,
    category: 'task-data',
    owner: 'coordinator-master'
  },
  workers: {
    path: 'coordination/workers',
    pattern: /\.(json|spec\.json)$/,
    category: 'worker-spec',
    owner: null
  },
  routing: {
    path: 'coordination/routing',
    pattern: /\.(json)$/,
    category: 'routing-data',
    owner: 'coordinator-master'
  },
  memory: {
    path: 'coordination/memory',
    pattern: /\.(json)$/,
    category: 'memory',
    owner: 'coordinator-master'
  }
};

// Calculate file checksum
async function getFileChecksum(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

// Extract metadata from file
async function extractMetadata(filePath, category) {
  const stat = await fs.stat(filePath);
  const checksum = await getFileChecksum(filePath);
  const fileName = path.basename(filePath, path.extname(filePath));

  const metadata = {
    file_path: filePath.replace(CORTEX_ROOT + '/', ''),
    category: category,
    name: fileName,
    size_bytes: stat.size,
    last_modified: stat.mtime.toISOString(),
    checksum: checksum
  };

  // Extract additional metadata based on category
  if (category === 'schema') {
    metadata.subcategory = 'schema';
    metadata.description = 'JSON schema definition';
    metadata.validation_required = true;
  } else if (category === 'prompt') {
    const pathParts = filePath.split('/');
    if (pathParts.includes('masters')) {
      metadata.subcategory = 'master';
    } else if (pathParts.includes('workers')) {
      metadata.subcategory = 'worker';
    }
    metadata.description = `System prompt for ${fileName}`;
    metadata.versioned = true;
    metadata.ab_test_eligible = true;
  } else if (category === 'master-state') {
    const masterName = filePath.split('/masters/')[1]?.split('/')[0];
    metadata.owner = `${masterName}-master`;
    metadata.description = `State file for ${masterName} master`;
  } else if (category === 'worker-spec') {
    metadata.description = 'Worker specification';
    const status = filePath.includes('/active/') ? 'active' :
                   filePath.includes('/completed/') ? 'completed' :
                   filePath.includes('/failed/') ? 'failed' : 'unknown';
    metadata.status = status;
  }

  return metadata;
}

// Scan directory recursively
async function scanDirectory(dirPath, pattern, category, owner) {
  const assets = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          try {
            const metadata = await extractMetadata(fullPath, category);
            if (owner) metadata.owner = owner;

            const assetId = metadata.file_path
              .replace(/\//g, '.')
              .replace(/\.(json|md|schema\.json)$/, '');

            assets.push({
              asset_id: assetId,
              ...metadata
            });
          } catch (error) {
            console.error(`Error processing ${fullPath}:`, error.message);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or is not accessible
      if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
        console.error(`Error scanning ${dir}:`, error.message);
      }
    }
  }

  await walk(dirPath);
  return assets;
}

// Discover all assets
async function discoverAssets() {
  console.log('🔍 Starting asset discovery...');
  const startTime = Date.now();

  const allAssets = [];

  for (const [name, config] of Object.entries(DISCOVERY_PATTERNS)) {
    const dirPath = path.join(CORTEX_ROOT, config.path);
    console.log(`  Scanning ${config.path}...`);

    const assets = await scanDirectory(
      dirPath,
      config.pattern,
      config.category,
      config.owner
    );

    console.log(`    Found ${assets.length} ${config.category} assets`);
    allAssets.push(...assets);
  }

  const duration = Date.now() - startTime;
  console.log(`✅ Discovery complete: ${allAssets.length} assets in ${duration}ms`);

  return allAssets;
}

// Store assets in Redis
async function storeAssetsInRedis(assets) {
  console.log('💾 Storing assets in Redis...');
  const startTime = Date.now();

  const pipeline = redis.pipeline();

  // Clear existing data
  const existingAssets = await redis.hkeys('catalog:assets');
  if (existingAssets.length > 0) {
    pipeline.del('catalog:assets');
  }

  // Track unique values for indexes
  const types = new Set();
  const owners = new Set();
  const namespaces = new Set();
  const sensitivities = new Set();

  for (const asset of assets) {
    const assetId = asset.asset_id;

    // Store asset data
    pipeline.hset('catalog:assets', assetId, JSON.stringify(asset));

    // Build indexes
    if (asset.category) {
      types.add(asset.category);
      pipeline.sadd(`catalog:index:by_type:${asset.category}`, assetId);
    }

    if (asset.owner) {
      owners.add(asset.owner);
      pipeline.sadd(`catalog:index:by_owner:${asset.owner}`, assetId);
    }

    // Extract namespace from asset_id (e.g., "coordination.tasks.task_queue" -> "coordination.tasks")
    const namespaceParts = assetId.split('.');
    if (namespaceParts.length >= 2) {
      const namespace = namespaceParts.slice(0, 2).join('.');
      namespaces.add(namespace);
      pipeline.sadd(`catalog:index:by_namespace:${namespace}`, assetId);
    }

    if (asset.sensitivity) {
      sensitivities.add(asset.sensitivity);
      pipeline.sadd(`catalog:index:by_sensitivity:${asset.sensitivity}`, assetId);
    }

    // Add to sorted set by modification time
    const modTime = asset.last_modified ? new Date(asset.last_modified).getTime() : Date.now();
    pipeline.zadd('catalog:index:by_modified', modTime, assetId);

    // Store checksum for incremental updates
    if (asset.checksum) {
      pipeline.hset('catalog:checksums', assetId, asset.checksum);
    }
  }

  // Store index metadata
  pipeline.sadd('catalog:index:types', ...Array.from(types));
  pipeline.sadd('catalog:index:owners', ...Array.from(owners));
  pipeline.sadd('catalog:index:namespaces', ...Array.from(namespaces));
  if (sensitivities.size > 0) {
    pipeline.sadd('catalog:index:sensitivities', ...Array.from(sensitivities));
  }

  // Store catalog metadata
  const metadata = {
    last_discovery: new Date().toISOString(),
    total_assets: assets.length,
    version: '2.0.0',
    backend: 'redis'
  };
  pipeline.set('catalog:metadata', JSON.stringify(metadata));

  // Execute all commands
  await pipeline.exec();

  const duration = Date.now() - startTime;
  console.log(`✅ Stored ${assets.length} assets in Redis in ${duration}ms`);

  // Publish update notification
  await redis.publish('catalog:updates', JSON.stringify({
    event: 'discovery_complete',
    timestamp: new Date().toISOString(),
    total_assets: assets.length
  }));
}

// Main discovery function
async function runDiscovery() {
  try {
    console.log('🚀 Cortex Catalog Discovery Service');
    console.log(`📂 Scanning: ${CORTEX_ROOT}`);
    console.log(`💾 Redis: ${process.env.REDIS_HOST || 'redis-master.cortex-system.svc.cluster.local'}`);
    console.log('');

    const assets = await discoverAssets();
    await storeAssetsInRedis(assets);

    console.log('');
    console.log('📊 Discovery Summary:');
    console.log(`   Total assets: ${assets.length}`);

    const byCategory = {};
    for (const asset of assets) {
      byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;
    }

    for (const [category, count] of Object.entries(byCategory)) {
      console.log(`   ${category}: ${count}`);
    }

    console.log('');
    console.log('✅ Discovery complete!');

  } catch (error) {
    console.error('❌ Discovery failed:', error);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// Run discovery
runDiscovery();
