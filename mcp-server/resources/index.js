/**
 * MCP Resources for Cortex
 *
 * Resources provide read-only access to cortex data
 * via the Model Context Protocol.
 */

const fs = require('fs').promises;
const path = require('path');

// Resource URI scheme: cortex://resource-type/path

const resourceDefinitions = [
  {
    uri: 'cortex://coordination/worker-pool',
    name: 'Worker Pool',
    description: 'Current worker pool state including active, completed, and failed workers',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://coordination/task-queue',
    name: 'Task Queue',
    description: 'Task queue with all pending, in-progress, and completed tasks',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://coordination/system-health',
    name: 'System Health',
    description: 'Overall system health status and daemon states',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://coordination/token-budget',
    name: 'Token Budget',
    description: 'Token usage and budget allocation across masters and workers',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://coordination/routing-patterns',
    name: 'Routing Patterns',
    description: 'MoE routing patterns and expert activation keywords',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://coordination/pool-state',
    name: 'Pool State',
    description: 'Sparse pool manager state with capacity and activation metrics',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://governance/access-policies',
    name: 'Access Policies',
    description: 'RBAC access policies and namespace permissions',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://masters/coordinator/state',
    name: 'Coordinator State',
    description: 'Coordinator master current state and routing statistics',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/index',
    name: 'Master Manifests Index',
    description: 'Index of all master agent capability manifests',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/coordinator',
    name: 'Coordinator Manifest',
    description: 'Capability manifest for the Coordinator Master',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/security',
    name: 'Security Manifest',
    description: 'Capability manifest for the Security Master',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/development',
    name: 'Development Manifest',
    description: 'Capability manifest for the Development Master',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/inventory',
    name: 'Inventory Manifest',
    description: 'Capability manifest for the Inventory Master',
    mimeType: 'application/json'
  },
  {
    uri: 'cortex://manifests/cicd',
    name: 'CI/CD Manifest',
    description: 'Capability manifest for the CI/CD Master',
    mimeType: 'application/json'
  }
];

// Map URIs to file paths
const uriToPath = {
  'cortex://coordination/worker-pool': 'coordination/worker-pool.json',
  'cortex://coordination/task-queue': 'coordination/task-queue.json',
  'cortex://coordination/system-health': 'coordination/system-health-check.json',
  'cortex://coordination/token-budget': 'coordination/token-budget.json',
  'cortex://coordination/routing-patterns': 'coordination/masters/coordinator/knowledge-base/routing-patterns.json',
  'cortex://coordination/pool-state': 'coordination/memory/working/pool-state.json',
  'cortex://governance/access-policies': 'coordination/governance/access-policies.json',
  'cortex://masters/coordinator/state': 'coordination/masters/coordinator/context/master-state.json',
  'cortex://manifests/index': 'mcp-server/manifests/index.json',
  'cortex://manifests/coordinator': 'mcp-server/manifests/coordinator-master.json',
  'cortex://manifests/security': 'mcp-server/manifests/security-master.json',
  'cortex://manifests/development': 'mcp-server/manifests/development-master.json',
  'cortex://manifests/inventory': 'mcp-server/manifests/inventory-master.json',
  'cortex://manifests/cicd': 'mcp-server/manifests/cicd-master.json'
};

module.exports = {
  getResourceDefinitions: (home) => {
    return resourceDefinitions;
  },

  readResource: async (uri, home) => {
    const relativePath = uriToPath[uri];

    if (!relativePath) {
      throw new Error(`Unknown resource URI: ${uri}`);
    }

    const fullPath = path.join(home, relativePath);

    try {
      const data = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Resource not found: ${uri}`);
      }
      throw new Error(`Failed to read resource: ${error.message}`);
    }
  }
};
