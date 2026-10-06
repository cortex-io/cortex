/**
 * Coordination Daemon Client
 * Client library for workers to connect to the coordination daemon
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Coordination client for workers
 */
class CoordinationClient extends EventEmitter {
  /**
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super();

    this.config = {
      httpUrl: config.httpUrl || 'http://localhost:9500',
      wsUrl: config.wsUrl || 'ws://localhost:9501',
      workerId: config.workerId,
      capabilities: config.capabilities || [],
      metadata: config.metadata || {},
      reconnect: config.reconnect !== false,
      reconnectInterval: config.reconnectInterval || 5000,
      heartbeatInterval: config.heartbeatInterval || 5000,
      apiKey: config.apiKey || process.env.COORDINATION_API_KEY,
      token: config.token, // Worker authentication token
      ...config
    };

    if (!this.config.workerId) {
      throw new Error('workerId is required');
    }

    this.ws = null;
    this.connected = false;
    this.reconnecting = false;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;

    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      tasksReceived: 0,
      reconnects: 0
    };
  }

  /**
   * Connect to the coordination daemon
   */
  async connect() {
    // If no token is provided, register via HTTP first to obtain one
    if (!this.config.token && this.config.apiKey) {
      await this._registerViaHttp();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnecting = false;

          // Register with daemon
          this._send({
            type: 'register',
            workerId: this.config.workerId,
            capabilities: this.config.capabilities,
            metadata: this.config.metadata,
            token: this.config.token // Include authentication token
          });

          // Start heartbeat
          this._startHeartbeat();

          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this._stopHeartbeat();
          this.emit('disconnected');

          if (this.config.reconnect && !this.reconnecting) {
            this._reconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Register via HTTP API to obtain authentication token
   */
  async _registerViaHttp() {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.config.httpUrl}/api/workers/register`);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        workerId: this.config.workerId,
        capabilities: this.config.capabilities,
        metadata: this.config.metadata
      });

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-API-Key': this.config.apiKey
        }
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP registration failed: ${result.error || result.message}`));
              return;
            }

            this.config.token = result.token;
            this.emit('registered_http', result);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse registration response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP registration request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Disconnect from the coordination daemon
   */
  disconnect() {
    this.config.reconnect = false;
    this._stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.ws) {
      this.ws.close();
    }

    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Handle reconnection
   */
  _reconnect() {
    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    this.metrics.reconnects++;

    this.emit('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.emit('reconnected');
      } catch (error) {
        this.emit('reconnect-failed', error);
        this._reconnect(); // Try again
      }
    }, this.config.reconnectInterval);
  }

  /**
   * Start heartbeat timer
   */
  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this._send({
          type: 'heartbeat',
          workerId: this.config.workerId
        });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  /**
   * Handle incoming message
   */
  _handleMessage(data) {
    this.metrics.messagesReceived++;

    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'registered':
          this.emit('registered', message);
          break;

        case 'heartbeat_ack':
          this.emit('heartbeat_ack', message);
          break;

        case 'task_assigned':
          this.metrics.tasksReceived++;
          this.emit('task_assigned', message.task);
          break;

        case 'state_change':
          this.emit('state_change', message.change);
          break;

        case 'error':
          this.emit('daemon_error', message);
          break;

        default:
          this.emit('unknown_message', message);
      }
    } catch (error) {
      this.emit('error', { type: 'parse_error', error: error.message });
    }
  }

  /**
   * Send message to daemon
   */
  _send(message) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to daemon');
    }

    this.ws.send(JSON.stringify(message));
    this.metrics.messagesSent++;
  }

  /**
   * Update task status
   */
  updateTask(taskId, status, data = {}) {
    this._send({
      type: 'task_update',
      taskId,
      status,
      ...data
    });
  }

  /**
   * Complete a task
   */
  completeTask(taskId, result = {}) {
    this.updateTask(taskId, 'completed', { result });
  }

  /**
   * Fail a task
   */
  failTask(taskId, error = {}) {
    this.updateTask(taskId, 'failed', { error });
  }

  /**
   * Update task progress
   */
  updateProgress(taskId, progress) {
    this.updateTask(taskId, 'in_progress', { progress });
  }

  /**
   * Subscribe to state changes
   */
  subscribe(topics = ['*']) {
    this._send({
      type: 'subscribe',
      topics
    });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      connected: this.connected,
      reconnecting: this.reconnecting
    };
  }

  /**
   * Make HTTP request to daemon API
   */
  async _httpRequest(method, path, body = null) {
    const url = `${this.config.httpUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Register worker via HTTP (alternative to WebSocket)
   */
  async registerHttp() {
    return this._httpRequest('POST', '/api/workers/register', {
      workerId: this.config.workerId,
      capabilities: this.config.capabilities,
      metadata: this.config.metadata
    });
  }

  /**
   * Unregister worker via HTTP
   */
  async unregisterHttp() {
    return this._httpRequest('POST', '/api/workers/unregister', {
      workerId: this.config.workerId
    });
  }

  /**
   * Complete task via HTTP
   */
  async completeTaskHttp(taskId, result = {}) {
    return this._httpRequest('POST', '/api/tasks/complete', {
      taskId,
      result
    });
  }

  /**
   * Fail task via HTTP
   */
  async failTaskHttp(taskId, error = {}) {
    return this._httpRequest('POST', '/api/tasks/fail', {
      taskId,
      error
    });
  }

  /**
   * Get daemon state via HTTP
   */
  async getState() {
    return this._httpRequest('GET', '/api/state');
  }

  /**
   * Get daemon metrics via HTTP
   */
  async getDaemonMetrics() {
    return this._httpRequest('GET', '/api/metrics');
  }
}

module.exports = { CoordinationClient };
