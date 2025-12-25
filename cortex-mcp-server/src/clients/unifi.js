/**
 * UniFi MCP Client
 *
 * Connects to the UniFi MCP Server and executes queries
 * Server: http://unifi-mcp-server.cortex-system.svc.cluster.local:3000
 */

const axios = require('axios');

const UNIFI_MCP_SERVER = process.env.UNIFI_MCP_SERVER ||
  'http://unifi-mcp-server.cortex-system.svc.cluster.local:3000';

class UniFiClient {
  constructor() {
    this.serverUrl = UNIFI_MCP_SERVER;
  }

  /**
   * Execute a query against the UniFi MCP server
   * @param {string} query - Natural language query about UniFi
   * @returns {Promise<object>} Query results
   */
  async query(query) {
    try {
      console.log(`[UniFi Client] Executing query: ${query}`);

      // Call the UniFi MCP server's unifi_query tool
      const response = await axios.post(`${this.serverUrl}/mcp`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'unifi_query',
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
      console.error(`[UniFi Client] Error: ${error.message}`);
      return {
        error: true,
        message: `UniFi query failed: ${error.message}`,
        query
      };
    }
  }

  /**
   * Get available tools from UniFi MCP server
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
      console.error(`[UniFi Client] Failed to list tools: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if UniFi MCP server is available
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

module.exports = UniFiClient;
