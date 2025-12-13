/**
 * Wazuh API Client for Cortex Security Master
 * Provides authenticated access to Wazuh API endpoints
 *
 * Features:
 * - JWT token management
 * - Agent status monitoring
 * - Alert querying
 * - Vulnerability scanning
 * - Rule and decoder management
 */

const https = require('https');
const http = require('http');

class WazuhAPIClient {
  constructor(config = {}) {
    this.config = {
      api_url: config.api_url || process.env.WAZUH_API_URL || 'https://10.88.140.202:55000',
      username: config.username || process.env.WAZUH_USER || 'admin',
      password: config.password || process.env.WAZUH_PASSWORD,
      timeout: config.timeout || 10000,
      verify_ssl: config.verify_ssl !== false,
      ...config
    };

    this.token = null;
    this.token_expiry = null;
    this.request_id = 0;
  }

  /**
   * Make HTTPS request to Wazuh API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint path
   * @param {Object} headers - Additional headers
   * @param {Object|string} data - Request body
   * @returns {Promise<Object>} Response data
   */
  async request(method, endpoint, headers = {}, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.config.api_url);
      const request_id = ++this.request_id;

      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Cortex-Security-Master/1.0',
          ...headers
        },
        timeout: this.config.timeout,
        rejectUnauthorized: this.config.verify_ssl
      };

      console.log(`[${request_id}] ${method} ${endpoint}`);

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(url, options, (res) => {
        let response_data = '';

        res.on('data', (chunk) => {
          response_data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(response_data);

            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`[${request_id}] Status ${res.statusCode}`);
              resolve(parsed);
            } else {
              const error = new Error(parsed.detail || 'API Error');
              error.status_code = res.statusCode;
              error.response = parsed;
              reject(error);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', reject);

      if (data) {
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Authenticate and get JWT token
   * @returns {Promise<string>} JWT token
   */
  async authenticate() {
    try {
      if (this.token && this.token_expiry && Date.now() < this.token_expiry) {
        console.log('Using cached authentication token');
        return this.token;
      }

      const auth_header = 'Basic ' + Buffer.from(
        `${this.config.username}:${this.config.password}`
      ).toString('base64');

      const response = await this.request(
        'POST',
        '/security/user/authenticate',
        { 'Authorization': auth_header }
      );

      this.token = response.data?.token;
      // Token typically expires in 15 minutes, refresh at 14 minutes
      this.token_expiry = Date.now() + (14 * 60 * 1000);

      console.log(`Authenticated as ${this.config.username}`);
      return this.token;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Make authenticated request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} Response data
   */
  async authenticatedRequest(method, endpoint, data = null) {
    const token = await this.authenticate();
    return this.request(
      method,
      endpoint,
      { 'Authorization': `Bearer ${token}` },
      data
    );
  }

  /**
   * Get all agents
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of agents
   */
  async getAgents(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0,
      sort: options.sort || '-active_count',
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/agents?${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get specific agent details
   * @param {string|number} agent_id - Agent ID
   * @returns {Promise<Object>} Agent details
   */
  async getAgent(agent_id) {
    const response = await this.authenticatedRequest(
      'GET',
      `/agents/${agent_id}`
    );

    return response.data?.affected_items?.[0] || null;
  }

  /**
   * Get agent status summary
   * @returns {Promise<Object>} Status summary
   */
  async getAgentStatusSummary() {
    const response = await this.authenticatedRequest(
      'GET',
      '/agents/summary/status'
    );

    return response.data || {};
  }

  /**
   * Get agents for specific node
   * @param {string} node_ip - Node IP address
   * @returns {Promise<Array>} Agents from that node
   */
  async getAgentsByIP(node_ip) {
    const agents = await this.getAgents({
      params: { q: `ip=${node_ip}` }
    });

    return agents;
  }

  /**
   * Get recent alerts
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of alerts
   */
  async getAlerts(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 100,
      offset: options.offset || 0,
      sort: options.sort || '-timestamp',
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/alerts?${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get alerts for specific agent
   * @param {string|number} agent_id - Agent ID
   * @returns {Promise<Array>} Alerts from agent
   */
  async getAgentAlerts(agent_id, options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 100,
      offset: options.offset || 0,
      sort: options.sort || '-timestamp',
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/alerts?agent.id=${agent_id}&${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get alerts for specific rule
   * @param {number} rule_id - Rule ID
   * @returns {Promise<Array>} Alerts for rule
   */
  async getAlertsByRule(rule_id, options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 100,
      offset: options.offset || 0,
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/alerts?rule.id=${rule_id}&${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get vulnerabilities
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of vulnerabilities
   */
  async getVulnerabilities(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 100,
      offset: options.offset || 0,
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/vulnerability/agents?${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get vulnerabilities for specific agent
   * @param {string|number} agent_id - Agent ID
   * @returns {Promise<Array>} Vulnerabilities from agent
   */
  async getAgentVulnerabilities(agent_id) {
    const response = await this.authenticatedRequest(
      'GET',
      `/vulnerability/agents/${agent_id}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get all rules
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of rules
   */
  async getRules(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0,
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/rules?${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get specific rule details
   * @param {number} rule_id - Rule ID
   * @returns {Promise<Object>} Rule details
   */
  async getRule(rule_id) {
    const response = await this.authenticatedRequest(
      'GET',
      `/rules/${rule_id}`
    );

    return response.data?.affected_items?.[0] || null;
  }

  /**
   * Get all decoders
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of decoders
   */
  async getDecoders(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0,
      ...options.params
    });

    const response = await this.authenticatedRequest(
      'GET',
      `/decoders?${params.toString()}`
    );

    return response.data?.affected_items || [];
  }

  /**
   * Get cluster status
   * @returns {Promise<Object>} Cluster status
   */
  async getClusterStatus() {
    const response = await this.authenticatedRequest(
      'GET',
      '/cluster/status'
    );

    return response.data || {};
  }

  /**
   * Check system health
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await this.authenticatedRequest('GET', '/health');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        details: response.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get Wazuh system info
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    const response = await this.authenticatedRequest(
      'GET',
      '/manager/info'
    );

    return response.data || {};
  }

  /**
   * Create custom alert rule
   * @param {Object} rule - Rule definition
   * @returns {Promise<Object>} Created rule
   */
  async createRule(rule) {
    const response = await this.authenticatedRequest(
      'POST',
      '/rules',
      rule
    );

    return response.data || {};
  }

  /**
   * Update agent configuration
   * @param {string|number} agent_id - Agent ID
   * @param {Object} config - Configuration object
   * @returns {Promise<Object>} Update result
   */
  async updateAgentConfig(agent_id, config) {
    const response = await this.authenticatedRequest(
      'PUT',
      `/agents/${agent_id}/config`,
      config
    );

    return response.data || {};
  }

  /**
   * Restart agent
   * @param {string|number} agent_id - Agent ID
   * @returns {Promise<Object>} Restart result
   */
  async restartAgent(agent_id) {
    const response = await this.authenticatedRequest(
      'POST',
      `/agents/${agent_id}/restart`
    );

    return response.data || {};
  }

  /**
   * Batch restart agents
   * @param {Array<string|number>} agent_ids - List of agent IDs
   * @returns {Promise<Object>} Batch restart result
   */
  async restartAgents(agent_ids) {
    const response = await this.authenticatedRequest(
      'POST',
      '/agents/restart',
      { agents_list: agent_ids }
    );

    return response.data || {};
  }

  /**
   * Get agent log
   * @param {string|number} agent_id - Agent ID
   * @returns {Promise<string>} Agent log content
   */
  async getAgentLog(agent_id) {
    const response = await this.authenticatedRequest(
      'GET',
      `/agents/${agent_id}/log`
    );

    return response.data || '';
  }
}

module.exports = WazuhAPIClient;
