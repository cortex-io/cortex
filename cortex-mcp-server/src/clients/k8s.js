/**
 * Kubernetes Client
 *
 * Wrapper around kubectl for k8s operations
 */

const { spawn } = require('child_process');

class K8sClient {
  constructor() {
    this.kubectl = 'kubectl';
  }

  /**
   * Execute kubectl command
   * @param {string[]} args - kubectl arguments
   * @returns {Promise<object>} Command output
   */
  async exec(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.kubectl, args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            // Try to parse as JSON
            const output = JSON.parse(stdout);
            resolve(output);
          } catch {
            // Return raw output if not JSON
            resolve({ output: stdout.trim() });
          }
        } else {
          resolve({
            error: true,
            message: stderr.trim() || stdout.trim(),
            exitCode: code
          });
        }
      });
    });
  }

  /**
   * Query k8s resources
   * @param {string} query - Natural language query about k8s
   * @returns {Promise<object>} Query results
   */
  async query(query) {
    try {
      console.log(`[K8s Client] Executing query: ${query}`);

      // Simple keyword-based routing to kubectl commands
      const lowerQuery = query.toLowerCase();

      if (lowerQuery.includes('pod')) {
        return await this.getPods(this.extractNamespace(query));
      } else if (lowerQuery.includes('deployment')) {
        return await this.getDeployments(this.extractNamespace(query));
      } else if (lowerQuery.includes('service')) {
        return await this.getServices(this.extractNamespace(query));
      } else if (lowerQuery.includes('node')) {
        return await this.getNodes();
      } else if (lowerQuery.includes('namespace')) {
        return await this.getNamespaces();
      } else {
        // Default: get all resources in namespace
        return await this.getAllResources(this.extractNamespace(query));
      }
    } catch (error) {
      console.error(`[K8s Client] Error: ${error.message}`);
      return {
        error: true,
        message: `K8s query failed: ${error.message}`,
        query
      };
    }
  }

  /**
   * Extract namespace from query
   */
  extractNamespace(query) {
    const match = query.match(/namespace[:\s]+([a-z0-9-]+)/i);
    if (match) return match[1];

    // Default to cortex-system
    return 'cortex-system';
  }

  /**
   * Get pods
   */
  async getPods(namespace = 'cortex-system') {
    return await this.exec(['get', 'pods', '-n', namespace, '-o', 'json']);
  }

  /**
   * Get deployments
   */
  async getDeployments(namespace = 'cortex-system') {
    return await this.exec(['get', 'deployments', '-n', namespace, '-o', 'json']);
  }

  /**
   * Get services
   */
  async getServices(namespace = 'cortex-system') {
    return await this.exec(['get', 'services', '-n', namespace, '-o', 'json']);
  }

  /**
   * Get nodes
   */
  async getNodes() {
    return await this.exec(['get', 'nodes', '-o', 'json']);
  }

  /**
   * Get namespaces
   */
  async getNamespaces() {
    return await this.exec(['get', 'namespaces', '-o', 'json']);
  }

  /**
   * Get all resources in namespace
   */
  async getAllResources(namespace = 'cortex-system') {
    return await this.exec(['get', 'all', '-n', namespace, '-o', 'json']);
  }

  /**
   * Create resource from YAML
   */
  async create(yaml, namespace = 'cortex-system') {
    // Write YAML to temp file and apply
    const fs = require('fs').promises;
    const path = require('path');
    const tmpFile = path.join('/tmp', `k8s-create-${Date.now()}.yaml`);

    try {
      await fs.writeFile(tmpFile, yaml);
      const result = await this.exec(['apply', '-f', tmpFile, '-n', namespace]);
      await fs.unlink(tmpFile);
      return result;
    } catch (error) {
      return {
        error: true,
        message: `Failed to create resource: ${error.message}`
      };
    }
  }

  /**
   * Delete resource
   */
  async delete(resourceType, name, namespace = 'cortex-system') {
    return await this.exec(['delete', resourceType, name, '-n', namespace]);
  }

  /**
   * Scale deployment
   */
  async scale(deployment, replicas, namespace = 'cortex-system') {
    return await this.exec(['scale', 'deployment', deployment,
      '--replicas', String(replicas), '-n', namespace]);
  }

  /**
   * Check if kubectl is available
   */
  async healthCheck() {
    try {
      const result = await this.exec(['version', '--client=true', '-o', 'json']);
      return !result.error;
    } catch (error) {
      return false;
    }
  }
}

module.exports = K8sClient;
