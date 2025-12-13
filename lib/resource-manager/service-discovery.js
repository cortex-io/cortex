/**
 * K8s Service Discovery
 *
 * Auto-discovers MCP server deployments in Kubernetes cluster
 * Tracks service endpoints and updates registry dynamically
 */

const fs = require('fs').promises;
const path = require('path');

class ServiceDiscovery {
  constructor(k8sClient, options = {}) {
    this.k8sClient = k8sClient;
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || process.cwd();
    this.registryPath = options.registryPath || path.join(this.cortexHome, 'coordination/mcp-server-registry.json');
    this.discoveryInterval = options.discoveryInterval || 60000; // 1 minute
    this.discoveryTimer = null;

    // Discovery state
    this.discoveredServices = new Map();
    this.lastDiscovery = null;
  }

  /**
   * Start service discovery
   */
  async start() {
    console.log('Starting K8s service discovery...');

    // Initial discovery
    await this.discoverServices();

    // Schedule periodic discovery
    this.discoveryTimer = setInterval(async () => {
      try {
        await this.discoverServices();
      } catch (error) {
        console.error(`Service discovery error: ${error.message}`);
      }
    }, this.discoveryInterval);

    console.log(`Service discovery running (interval: ${this.discoveryInterval}ms)`);
  }

  /**
   * Stop service discovery
   */
  stop() {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
      console.log('Service discovery stopped');
    }
  }

  /**
   * Discover MCP services in K8s cluster
   */
  async discoverServices() {
    console.log('Discovering MCP services in K8s cluster...');

    try {
      // Discover services with MCP server label
      const mcpServices = await this.k8sClient.discoverMCPServers('cortex-system');

      // Also check default namespace
      const defaultServices = await this.k8sClient.discoverMCPServers('default');

      // Combine and deduplicate
      const allServices = [...mcpServices, ...defaultServices];

      console.log(`Discovered ${allServices.length} MCP services`);

      // Update discovered services map
      for (const service of allServices) {
        const key = `${service.namespace}/${service.name}`;
        this.discoveredServices.set(key, {
          ...service,
          last_seen: new Date().toISOString()
        });
      }

      this.lastDiscovery = new Date().toISOString();

      // Update registry
      await this.updateRegistry(allServices);

      return allServices;
    } catch (error) {
      console.error(`Failed to discover services: ${error.message}`);
      return [];
    }
  }

  /**
   * Update MCP server registry with discovered services
   */
  async updateRegistry(services) {
    try {
      // Load existing registry
      let registry;
      try {
        const data = await fs.readFile(this.registryPath, 'utf8');
        registry = JSON.parse(data);
      } catch (error) {
        // Create new registry if doesn't exist
        registry = {
          version: '1.0.0',
          last_updated: new Date().toISOString(),
          servers: []
        };
      }

      // Track existing servers by URL
      const existingServers = new Map(
        registry.servers.map(s => [s.url, s])
      );

      // Add/update discovered services
      for (const service of services) {
        const url = this._buildServiceURL(service);
        const serverType = this._inferServerType(service);

        const serverEntry = {
          name: service.name,
          url,
          type: serverType,
          namespace: service.namespace,
          transport: 'sse',
          status: 'active',
          discovered: true,
          k8s_service: {
            cluster_ip: service.clusterIP,
            ports: service.ports,
            labels: service.labels
          },
          last_discovered: service.discovered_at,
          capabilities: this._inferCapabilities(serverType)
        };

        // Preserve existing metadata if present
        if (existingServers.has(url)) {
          const existing = existingServers.get(url);
          serverEntry.created_at = existing.created_at || service.discovered_at;
          serverEntry.last_health_check = existing.last_health_check;
        } else {
          serverEntry.created_at = service.discovered_at;
        }

        existingServers.set(url, serverEntry);
      }

      // Update registry
      registry.servers = Array.from(existingServers.values());
      registry.last_updated = new Date().toISOString();
      registry.discovery_enabled = true;
      registry.last_discovery = this.lastDiscovery;

      // Write registry
      await fs.writeFile(
        this.registryPath,
        JSON.stringify(registry, null, 2),
        'utf8'
      );

      console.log(`Updated registry with ${registry.servers.length} servers`);
    } catch (error) {
      console.error(`Failed to update registry: ${error.message}`);
    }
  }

  /**
   * Get discovered services
   */
  getDiscoveredServices() {
    return Array.from(this.discoveredServices.values());
  }

  /**
   * Get service by name
   */
  getService(namespace, name) {
    const key = `${namespace}/${name}`;
    return this.discoveredServices.get(key);
  }

  /**
   * Check if service exists
   */
  hasService(namespace, name) {
    const key = `${namespace}/${name}`;
    return this.discoveredServices.has(key);
  }

  /**
   * Get services by type
   */
  getServicesByType(type) {
    return Array.from(this.discoveredServices.values())
      .filter(s => this._inferServerType(s) === type);
  }

  /**
   * Get discovery status
   */
  getStatus() {
    return {
      enabled: this.discoveryTimer !== null,
      interval: this.discoveryInterval,
      last_discovery: this.lastDiscovery,
      services_count: this.discoveredServices.size,
      services: Array.from(this.discoveredServices.keys())
    };
  }

  /**
   * Build service URL from K8s service info
   */
  _buildServiceURL(service) {
    // In-cluster service URL format
    const port = service.ports && service.ports[0] ? service.ports[0].port : 3000;
    return `http://${service.name}.${service.namespace}.svc.cluster.local:${port}`;
  }

  /**
   * Infer server type from service metadata
   */
  _inferServerType(service) {
    const labels = service.labels || {};
    const typeLabel = labels['app.cortex.ai/type'];

    if (typeLabel) {
      return typeLabel;
    }

    // Infer from name
    const name = service.name.toLowerCase();
    if (name.includes('k3s') || name.includes('kubernetes')) {
      return 'k3s';
    } else if (name.includes('n8n')) {
      return 'n8n';
    } else if (name.includes('proxmox')) {
      return 'proxmox';
    } else if (name.includes('docker')) {
      return 'docker';
    } else if (name.includes('github')) {
      return 'github';
    }

    return 'unknown';
  }

  /**
   * Infer capabilities from server type
   */
  _inferCapabilities(serverType) {
    const capabilities = {
      k3s: [
        'kubernetes_management',
        'pod_operations',
        'deployment_scaling',
        'job_creation',
        'log_retrieval',
        'resource_monitoring'
      ],
      n8n: [
        'workflow_automation',
        'workflow_execution',
        'webhook_management',
        'integration_orchestration'
      ],
      proxmox: [
        'vm_management',
        'container_operations',
        'resource_allocation',
        'storage_management'
      ],
      docker: [
        'container_management',
        'image_operations',
        'network_management'
      ],
      github: [
        'repository_operations',
        'pull_request_management',
        'issue_tracking',
        'workflow_automation'
      ],
      unknown: []
    };

    return capabilities[serverType] || [];
  }

  /**
   * Remove stale services (not seen in last N discoveries)
   */
  async cleanupStaleServices(maxAge = 5 * 60 * 1000) { // 5 minutes
    const now = Date.now();
    const staleKeys = [];

    for (const [key, service] of this.discoveredServices.entries()) {
      const lastSeen = new Date(service.last_seen).getTime();
      if (now - lastSeen > maxAge) {
        staleKeys.push(key);
      }
    }

    for (const key of staleKeys) {
      this.discoveredServices.delete(key);
      console.log(`Removed stale service: ${key}`);
    }

    if (staleKeys.length > 0) {
      // Update registry to reflect removals
      const currentServices = this.getDiscoveredServices();
      await this.updateRegistry(currentServices);
    }

    return staleKeys.length;
  }

  /**
   * Force immediate discovery
   */
  async forceDiscovery() {
    console.log('Forcing immediate service discovery...');
    return await this.discoverServices();
  }

  /**
   * Export discovered services to file
   */
  async exportToFile(filePath) {
    const data = {
      discovery_timestamp: this.lastDiscovery,
      services_count: this.discoveredServices.size,
      services: this.getDiscoveredServices()
    };

    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    console.log(`Exported ${data.services_count} services to ${filePath}`);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const services = this.getDiscoveredServices();
    const typeCount = {};

    for (const service of services) {
      const type = this._inferServerType(service);
      typeCount[type] = (typeCount[type] || 0) + 1;
    }

    return {
      total_services: services.length,
      by_type: typeCount,
      by_namespace: services.reduce((acc, s) => {
        acc[s.namespace] = (acc[s.namespace] || 0) + 1;
        return acc;
      }, {}),
      last_discovery: this.lastDiscovery,
      discovery_enabled: this.discoveryTimer !== null
    };
  }
}

module.exports = ServiceDiscovery;
