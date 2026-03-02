/**
 * Proxmox MCP Client
 *
 * Connects to the Proxmox MCP Server and executes queries
 * Server: http://proxmox-mcp-server.cortex-system.svc.cluster.local:3000
 */

const axios = require('axios');

const PROXMOX_MCP_SERVER = process.env.PROXMOX_MCP_SERVER ||
  'http://proxmox-mcp-server.cortex-system.svc.cluster.local:3000';

class ProxmoxClient {
  constructor() {
    this.serverUrl = PROXMOX_MCP_SERVER;
  }

  /**
   * Execute a query against the Proxmox MCP server
   * @param {string} query - Natural language query about Proxmox
   * @returns {Promise<object>} Query results
   */
  async query(query) {
    try {
      console.log(`[Proxmox Client] Executing query: ${query}`);

      const response = await axios.post(`${this.serverUrl}/mcp`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'proxmox_query',
          arguments: { query }
        }
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    } catch (error) {
      console.error(`[Proxmox Client] Error: ${error.message}`);
      return {
        error: true,
        message: `Proxmox query failed: ${error.message}`,
        query
      };
    }
  }

  /**
   * Manage VM operations (create, delete, start, stop)
   */
  async manageVM(operation, vmid, params = {}) {
    try {
      console.log(`[Proxmox Client] VM operation: ${operation} on ${vmid}`);

      const response = await axios.post(`${this.serverUrl}/mcp`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'proxmox_manage_vm',
          arguments: { operation, vmid, ...params }
        }
      }, {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    } catch (error) {
      console.error(`[Proxmox Client] VM operation failed: ${error.message}`);
      return {
        error: true,
        message: `VM operation failed: ${error.message}`,
        operation,
        vmid
      };
    }
  }

  /**
   * Get available tools from Proxmox MCP server
   */
  async listTools() {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list'
      });

      return response.data.result.tools;
    } catch (error) {
      console.error(`[Proxmox Client] Failed to list tools: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if Proxmox MCP server is available
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

module.exports = ProxmoxClient;
