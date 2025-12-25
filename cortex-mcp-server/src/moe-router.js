/**
 * MoE (Mixture of Experts) Router for Cortex MCP Server
 *
 * Intelligently routes queries to the appropriate tool/client based on
 * keyword matching, confidence scoring, and priority-based expert selection.
 *
 * Based on /tmp/cortex-moe-router.js with enhancements for MCP server integration.
 */

const MoE_ROUTES = {
  // Infrastructure Clients (Tier 1)
  unifi: {
    keywords: ['unifi', 'network', 'wifi', 'wireless', 'ssid', 'access point', 'ap', 'client', 'device connected'],
    tool: 'cortex_query',
    client: 'unifi',
    priority: 100,
    tier: 1
  },
  proxmox: {
    keywords: ['proxmox', 'vm', 'virtual machine', 'container', 'lxc', 'pve', 'hypervisor', 'node resource'],
    tool: 'cortex_query',
    client: 'proxmox',
    priority: 100,
    tier: 1
  },
  sandfly: {
    keywords: ['sandfly', 'security', 'alert', 'vulnerability', 'threat', 'intrusion', 'rootkit', 'malware', 'forensic', 'security scan'],
    tool: 'cortex_query',
    client: 'sandfly',
    priority: 100,
    tier: 1
  },
  kubernetes: {
    keywords: ['k8s', 'kubernetes', 'pod', 'deployment', 'service', 'namespace', 'kubectl', 'container', 'cluster'],
    tool: 'cortex_query',
    client: 'k8s',
    priority: 100,
    tier: 1
  },

  // Infrastructure Management (Tier 2)
  infrastructure_manage: {
    keywords: ['create vm', 'delete vm', 'manage container', 'scale deployment', 'create pod'],
    tool: 'cortex_manage_infrastructure',
    priority: 90,
    tier: 2
  },

  // Worker Swarms (Tier 3)
  worker_spawn: {
    keywords: ['spawn worker', 'create worker', 'worker swarm', 'parallel workers', 'worker pool'],
    tool: 'cortex_spawn_workers',
    priority: 95,
    tier: 3
  },

  // Master Coordination (Tier 4)
  master_coordinate: {
    keywords: ['coordinate master', 'route task', 'master agent', 'handoff', 'delegate task'],
    tool: 'cortex_coordinate_masters',
    priority: 95,
    tier: 4
  },

  // Project Builds (Tier 5)
  project_build: {
    keywords: ['build project', 'create microservice', 'build application', 'full build', 'project'],
    tool: 'cortex_build_project',
    priority: 85,
    tier: 5
  },

  // Control & Monitoring (Tier 6)
  system_control: {
    keywords: ['pause', 'resume', 'cancel', 'stop operation', 'abort'],
    tool: 'cortex_control',
    priority: 100,
    tier: 6
  },
  system_status: {
    keywords: ['status', 'health', 'metrics', 'monitoring', 'system state'],
    tool: 'cortex_get_status',
    priority: 80,
    tier: 6
  }
};

/**
 * Analyze query and suggest best tool/client
 * @param {string} query - Natural language query
 * @returns {object} Routing decision with tool, client, confidence, reason
 */
function routeQuery(query) {
  const lowerQuery = query.toLowerCase();
  const scores = {};

  // Score each route
  for (const [name, route] of Object.entries(MoE_ROUTES)) {
    let score = 0;
    const matchedKeywords = [];

    for (const keyword of route.keywords) {
      if (lowerQuery.includes(keyword)) {
        score += route.priority;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      scores[name] = {
        tool: route.tool,
        client: route.client,
        tier: route.tier,
        score,
        confidence: Math.min(score / 100, 1.0),
        matchedKeywords
      };
    }
  }

  // Find highest scoring route
  const routes = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);

  if (routes.length === 0) {
    return {
      tool: null,
      client: null,
      tier: null,
      confidence: 0,
      reason: 'No matching routes found. Use default cortex_query with k8s client.'
    };
  }

  const [topName, topRoute] = routes[0];

  return {
    tool: topRoute.tool,
    client: topRoute.client,
    tier: topRoute.tier,
    confidence: topRoute.confidence,
    reason: `Matched keywords: ${topRoute.matchedKeywords.join(', ')}`,
    routeName: topName,
    allMatches: routes.map(([name, r]) => ({ name, ...r }))
  };
}

/**
 * Determine if routing should force tool selection
 * @param {string} query - Natural language query
 * @returns {object} Force decision with forceTool, forceClient, systemHint
 */
function shouldForceRoute(query) {
  const routing = routeQuery(query);

  // If confidence >= 100% (exact keyword match), force the tool
  if (routing.confidence >= 1.0) {
    console.log(`[MoE Router] FORCING ${routing.tool} (confidence: ${routing.confidence})`);
    console.log(`[MoE Router] Client: ${routing.client || 'N/A'}, Tier: ${routing.tier}`);
    console.log(`[MoE Router] Reason: ${routing.reason}`);

    return {
      forceTool: routing.tool,
      forceClient: routing.client,
      tier: routing.tier,
      routing
    };
  }

  // If confidence is moderate (50-99%), add hint to system message
  if (routing.confidence >= 0.5) {
    console.log(`[MoE Router] HINTING ${routing.tool} (confidence: ${routing.confidence})`);
    console.log(`[MoE Router] Client: ${routing.client || 'N/A'}, Tier: ${routing.tier}`);
    console.log(`[MoE Router] Reason: ${routing.reason}`);

    return {
      forceTool: null,
      forceClient: null,
      systemHint: `The query appears to be about ${routing.routeName}. Consider using the ${routing.tool} tool${routing.client ? ` with the ${routing.client} client` : ''}.`,
      routing
    };
  }

  // Low confidence, let MCP server decide
  console.log(`[MoE Router] No strong routing (confidence: ${routing.confidence})`);
  return { forceTool: null, forceClient: null, routing };
}

/**
 * Get routing statistics
 */
function getRoutingStats() {
  const stats = {
    total_routes: Object.keys(MoE_ROUTES).length,
    tiers: {},
    routes_by_tier: {}
  };

  for (const [name, route] of Object.entries(MoE_ROUTES)) {
    if (!stats.tiers[route.tier]) {
      stats.tiers[route.tier] = 0;
      stats.routes_by_tier[route.tier] = [];
    }
    stats.tiers[route.tier]++;
    stats.routes_by_tier[route.tier].push({
      name,
      tool: route.tool,
      client: route.client,
      keywords: route.keywords.length
    });
  }

  return stats;
}

module.exports = {
  routeQuery,
  shouldForceRoute,
  getRoutingStats,
  MoE_ROUTES
};
