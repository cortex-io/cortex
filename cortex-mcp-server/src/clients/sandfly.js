/**
 * Sandfly Security Client
 *
 * Agentless intrusion detection and incident response for Linux systems.
 *
 * API Documentation: https://docs.sandflysecurity.com/reference/api-landing-page
 * API Version: 5.5.0+
 *
 * Features:
 * - Host management and scanning
 * - Security findings and alerts
 * - Forensic data collection
 * - Credential management
 * - Threat detection and response
 */

const https = require('https');
const http = require('http');

class SandFlyClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.SANDFLY_URL || 'http://sandfly-server:8080';
    this.username = config.username || process.env.SANDFLY_USERNAME;
    this.password = config.password || process.env.SANDFLY_PASSWORD;
    this.apiToken = config.apiToken || process.env.SANDFLY_API_TOKEN;
    this.tokenExpiry = null;
    this.refreshToken = null;

    // Parse base URL
    const url = new URL(this.baseUrl);
    this.hostname = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 8080);
    this.protocol = url.protocol === 'https:' ? https : http;
    this.basePath = url.pathname === '/' ? '' : url.pathname;
  }

  /**
   * Authenticate and obtain JWT bearer token
   */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('Sandfly credentials not configured');
    }

    const response = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        username: this.username,
        password: this.password
      },
      noAuth: true
    });

    this.apiToken = response.access_token;
    this.refreshToken = response.refresh_token;
    this.tokenExpiry = Date.now() + (55 * 60 * 1000); // 55 minutes (tokens valid for 60)

    return response;
  }

  /**
   * Refresh authentication token
   */
  async refreshAuth() {
    if (!this.refreshToken) {
      return this.login();
    }

    const response = await this.request('/api/v1/auth/refresh', {
      method: 'POST',
      body: {
        refresh_token: this.refreshToken
      },
      noAuth: true
    });

    this.apiToken = response.access_token;
    this.refreshToken = response.refresh_token;
    this.tokenExpiry = Date.now() + (55 * 60 * 1000);

    return response;
  }

  /**
   * Ensure we have a valid token
   */
  async ensureAuth() {
    if (!this.apiToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry)) {
      if (this.refreshToken) {
        await this.refreshAuth();
      } else {
        await this.login();
      }
    }
  }

  /**
   * Logout and revoke token
   */
  async logout() {
    if (!this.apiToken) return;

    await this.request('/api/v1/auth/logout', {
      method: 'POST'
    });

    this.apiToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Make authenticated API request
   */
  async request(path, options = {}) {
    const {
      method = 'GET',
      body = null,
      noAuth = false
    } = options;

    // Ensure authentication unless explicitly skipped
    if (!noAuth) {
      await this.ensureAuth();
    }

    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;

      const reqOptions = {
        hostname: this.hostname,
        port: this.port,
        path: `${this.basePath}${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      // Add authorization header if we have a token
      if (this.apiToken && !noAuth) {
        reqOptions.headers['Authorization'] = `Bearer ${this.apiToken}`;
      }

      if (postData) {
        reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = this.protocol.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`Sandfly API error: ${res.statusCode} - ${parsed.message || data}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse Sandfly response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Sandfly API request failed: ${err.message}`));
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }

  // =============================================================================
  // HOST MANAGEMENT
  // =============================================================================

  /**
   * Get all monitored hosts
   */
  async getHosts() {
    return this.request('/api/v1/hosts');
  }

  /**
   * Get specific host details
   */
  async getHost(hostId) {
    return this.request(`/api/v1/hosts/${hostId}`);
  }

  /**
   * Add a new host to monitor
   */
  async addHost(hostData) {
    return this.request('/api/v1/hosts', {
      method: 'POST',
      body: hostData
    });
  }

  /**
   * Update host configuration
   */
  async updateHost(hostId, hostData) {
    return this.request(`/api/v1/hosts/${hostId}`, {
      method: 'PUT',
      body: hostData
    });
  }

  /**
   * Delete a host
   */
  async deleteHost(hostId) {
    return this.request(`/api/v1/hosts/${hostId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get host rollup data (summary statistics)
   */
  async getHostRollup() {
    return this.request('/api/v1/hosts/rollup');
  }

  /**
   * Retry inactive hosts
   */
  async retryInactiveHosts() {
    return this.request('/api/v1/hosts/retry-inactive', {
      method: 'POST'
    });
  }

  // =============================================================================
  // SCANNING OPERATIONS
  // =============================================================================

  /**
   * Initiate a standard scan on hosts
   */
  async startScan(scanConfig) {
    return this.request('/api/v1/scans', {
      method: 'POST',
      body: scanConfig
    });
  }

  /**
   * Initiate an ad-hoc scan
   */
  async startAdHocScan(scanConfig) {
    return this.request('/api/v1/scans/adhoc', {
      method: 'POST',
      body: scanConfig
    });
  }

  /**
   * Get scan schedules
   */
  async getScanSchedules() {
    return this.request('/api/v1/scans/schedules');
  }

  /**
   * Get scan error logs
   */
  async getScanErrors(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/v1/scans/errors${query ? '?' + query : ''}`);
  }

  // =============================================================================
  // RESULTS & FINDINGS
  // =============================================================================

  /**
   * Query security findings
   */
  async getFindings(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/v1/results${query ? '?' + query : ''}`);
  }

  /**
   * Get findings for specific host
   */
  async getHostFindings(hostId) {
    return this.request(`/api/v1/results/host/${hostId}`);
  }

  /**
   * Create forensic timeline
   */
  async createTimeline(timelineConfig) {
    return this.request('/api/v1/results/timeline', {
      method: 'POST',
      body: timelineConfig
    });
  }

  /**
   * Delete results by host
   */
  async deleteResultsByHost(hostId) {
    return this.request(`/api/v1/results/host/${hostId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get result profiles
   */
  async getResultProfiles() {
    return this.request('/api/v1/results/profiles');
  }

  // =============================================================================
  // CREDENTIALS MANAGEMENT
  // =============================================================================

  /**
   * Get stored credentials
   */
  async getCredentials() {
    return this.request('/api/v1/credentials');
  }

  /**
   * Add new credential
   */
  async addCredential(credentialData) {
    return this.request('/api/v1/credentials', {
      method: 'POST',
      body: credentialData
    });
  }

  /**
   * Update credential
   */
  async updateCredential(credId, credentialData) {
    return this.request(`/api/v1/credentials/${credId}`, {
      method: 'PUT',
      body: credentialData
    });
  }

  /**
   * Delete credential
   */
  async deleteCredential(credId) {
    return this.request(`/api/v1/credentials/${credId}`, {
      method: 'DELETE'
    });
  }

  // =============================================================================
  // HOST INFORMATION (FORENSICS)
  // =============================================================================

  /**
   * Get processes running on host
   */
  async getHostProcesses(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/processes`);
  }

  /**
   * Get users on host
   */
  async getHostUsers(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/users`);
  }

  /**
   * Get services on host
   */
  async getHostServices(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/services`);
  }

  /**
   * Get network listeners on host
   */
  async getHostListeners(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/listeners`);
  }

  /**
   * Get kernel modules on host
   */
  async getHostKernelModules(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/modules`);
  }

  /**
   * Get scheduled tasks on host
   */
  async getHostScheduledTasks(hostId) {
    return this.request(`/api/v1/hosts/${hostId}/scheduled-tasks`);
  }

  // =============================================================================
  // NOTIFICATIONS & ALERTS
  // =============================================================================

  /**
   * Get notification configurations
   */
  async getNotifications() {
    return this.request('/api/v1/notifications');
  }

  /**
   * Create notification
   */
  async createNotification(notificationData) {
    return this.request('/api/v1/notifications', {
      method: 'POST',
      body: notificationData
    });
  }

  /**
   * Test notification
   */
  async testNotification(notificationId) {
    return this.request(`/api/v1/notifications/${notificationId}/test`, {
      method: 'POST'
    });
  }

  /**
   * Pause/unpause notifications
   */
  async toggleNotification(notificationId, paused) {
    return this.request(`/api/v1/notifications/${notificationId}`, {
      method: 'PATCH',
      body: { paused }
    });
  }

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  /**
   * Get server configuration
   */
  async getConfig() {
    return this.request('/api/v1/config');
  }

  /**
   * Update server configuration
   */
  async updateConfig(configData) {
    return this.request('/api/v1/config', {
      method: 'PUT',
      body: configData
    });
  }

  /**
   * Get threat feeds
   */
  async getThreatFeeds() {
    return this.request('/api/v1/config/threat-feeds');
  }

  /**
   * Get whitelist rules
   */
  async getWhitelist() {
    return this.request('/api/v1/config/whitelist');
  }

  /**
   * Get SSH zones
   */
  async getSSHZones() {
    return this.request('/api/v1/config/ssh-zones');
  }

  // =============================================================================
  // REPORTS
  // =============================================================================

  /**
   * Get host snapshot report
   */
  async getHostSnapshot(hostId) {
    return this.request(`/api/v1/reports/snapshot/${hostId}`);
  }

  /**
   * Get scan performance metrics
   */
  async getScanPerformance(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/v1/reports/performance${query ? '?' + query : ''}`);
  }

  // =============================================================================
  // SYSTEM STATUS
  // =============================================================================

  /**
   * Get current user information
   */
  async getCurrentUser() {
    return this.request('/api/v1/users/current');
  }

  /**
   * Get system status
   */
  async getStatus() {
    return this.request('/api/v1/status');
  }

  /**
   * Get license information
   */
  async getLicense() {
    return this.request('/api/v1/license');
  }

  // =============================================================================
  // TAGS
  // =============================================================================

  /**
   * Get all tags
   */
  async getTags() {
    return this.request('/api/v1/tags');
  }

  /**
   * Bulk tag hosts
   */
  async bulkTagHosts(hostIds, tags) {
    return this.request('/api/v1/hosts/bulk-tag', {
      method: 'POST',
      body: { host_ids: hostIds, tags }
    });
  }

  // =============================================================================
  // CONVENIENCE METHODS
  // =============================================================================

  /**
   * Scan K3s cluster nodes
   */
  async scanK3sNodes() {
    const hosts = await this.getHosts();
    const k3sNodes = hosts.filter(h => h.tags && h.tags.includes('k3s'));

    if (k3sNodes.length === 0) {
      return { message: 'No K3s nodes found. Add them with tag "k3s" first.' };
    }

    const scan = await this.startScan({
      host_ids: k3sNodes.map(n => n.id),
      scan_type: 'comprehensive'
    });

    return {
      scan_id: scan.id,
      nodes_scanned: k3sNodes.length,
      nodes: k3sNodes.map(n => n.hostname)
    };
  }

  /**
   * Get security summary for K3s cluster
   */
  async getK3sSecuritySummary() {
    const hosts = await this.getHosts();
    const k3sNodes = hosts.filter(h => h.tags && h.tags.includes('k3s'));

    const findings = await Promise.all(
      k3sNodes.map(node => this.getHostFindings(node.id))
    );

    const criticalCount = findings.flat().filter(f => f.severity === 'critical').length;
    const highCount = findings.flat().filter(f => f.severity === 'high').length;
    const mediumCount = findings.flat().filter(f => f.severity === 'medium').length;

    return {
      total_nodes: k3sNodes.length,
      findings: {
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        total: findings.flat().length
      },
      nodes: k3sNodes.map(n => ({
        hostname: n.hostname,
        status: n.status,
        last_scan: n.last_scan_time
      }))
    };
  }

  /**
   * Quick health check
   */
  async healthCheck() {
    try {
      await this.ensureAuth();
      const status = await this.getStatus();
      return {
        healthy: true,
        version: status.version,
        authenticated: !!this.apiToken
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = SandFlyClient;
