const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs').promises;
const Redis = require('ioredis');

const PORT = process.env.PORT || 8000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SELF_HEAL_WORKER_PATH = process.env.SELF_HEAL_WORKER_PATH || '/app/scripts/self-heal-worker.sh';
const TASK_DIR = process.env.TASK_DIR || '/app/tasks';
const TASK_POLL_INTERVAL = process.env.TASK_POLL_INTERVAL || 5000; // 5 seconds

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'redis-queue.cortex.svc.cluster.local';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false'; // Default enabled

// Priority queue names
const PRIORITY_QUEUES = {
  critical: 'cortex:queue:critical',
  high: 'cortex:queue:high',
  medium: 'cortex:queue:medium',
  low: 'cortex:queue:low'
};

// Initialize Redis client
let redisClient = null;
if (REDIS_ENABLED) {
  redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true // Don't connect immediately
  });

  redisClient.on('error', (error) => {
    console.error('[Redis] Connection error:', error.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  redisClient.on('ready', () => {
    console.log('[Redis] Ready for operations');
  });
}

// MCP Server endpoints
const MCP_SERVERS = {
  sandfly: process.env.SANDFLY_MCP_URL || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000',
  unifi: process.env.UNIFI_MCP_URL || 'http://unifi-mcp-server.cortex-system.svc.cluster.local:3000',
  proxmox: process.env.PROXMOX_MCP_URL || 'http://proxmox-mcp-server.cortex-system.svc.cluster.local:3000'
};

// Sandfly API configuration
const SANDFLY_CONFIG = {
  host: process.env.SANDFLY_HOST || '10.88.140.176',
  username: process.env.SANDFLY_USERNAME || 'admin',
  password: process.env.SANDFLY_PASSWORD || 'emphasize-art-nibble-arguable-paradox-flick-unpack',
  baseUrl: `https://${process.env.SANDFLY_HOST || '10.88.140.176'}/v4`
};

// Proxmox API configuration
const PROXMOX_CONFIG = {
  host: process.env.PROXMOX_HOST || 'proxmox.local',
  port: process.env.PROXMOX_PORT || '8006',
  username: process.env.PROXMOX_USERNAME || 'root@pam',
  password: process.env.PROXMOX_PASSWORD || '',
  baseUrl: `https://${process.env.PROXMOX_HOST || 'proxmox.local'}:${process.env.PROXMOX_PORT || '8006'}/api2/json`
};

// UniFi API configuration
const UNIFI_CONFIG = {
  host: process.env.UNIFI_HOST || 'unifi.local',
  port: process.env.UNIFI_PORT || '443',
  username: process.env.UNIFI_USERNAME || 'admin',
  password: process.env.UNIFI_PASSWORD || '',
  site: process.env.UNIFI_SITE || 'default',
  isUDM: process.env.UNIFI_IS_UDM === 'true',
  baseUrl: `https://${process.env.UNIFI_HOST || 'unifi.local'}:${process.env.UNIFI_PORT || '443'}`
};

let sandflyToken = null;
let sandflyTokenExpiry = null;
let sandflyHostsCache = null;
let sandflyHostsCacheExpiry = null;

let proxmoxTicket = null;
let proxmoxCSRFToken = null;
let proxmoxTicketExpiry = null;

let unifiCookie = null;
let unifiCookieExpiry = null;

/**
 * Get list of Sandfly hosts and cache for 5 minutes
 */
async function getSandflyHosts() {
  // Check cache
  if (sandflyHostsCache && sandflyHostsCacheExpiry && Date.now() < sandflyHostsCacheExpiry) {
    return sandflyHostsCache;
  }

  const token = await getSandflyToken();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: SANDFLY_CONFIG.host,
      port: 443,
      path: '/v4/hosts?summary=true',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          sandflyHostsCache = parsed;
          sandflyHostsCacheExpiry = Date.now() + (5 * 60 * 1000); // Cache 5 minutes
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Find host_id by hostname
 */
async function getHostIdByName(hostname) {
  try {
    const hostsResponse = await getSandflyHosts();
    const hosts = hostsResponse.data || [];

    // Match by hostname
    const host = hosts.find(h =>
      h.hostname === hostname ||
      h.hostname === hostname.toLowerCase() ||
      h.ip === hostname
    );

    return host ? host.id : null;
  } catch (error) {
    console.error('[Cortex] Error finding host_id:', error.message);
    return null;
  }
}

/**
 * Extract hostname from query
 */
function extractHostname(query) {
  const queryLower = query.toLowerCase();

  // Common patterns: "on k3s-worker01", "for k3s-worker01", "k3s-worker01 processes"
  const patterns = [
    /\bon\s+([\w\-\.]+)/i,
    /\bfor\s+([\w\-\.]+)/i,
    /\bhost\s+([\w\-\.]+)/i,
    /\bnode\s+([\w\-\.]+)/i,
    /\b([\w\-\.]+)\s+processes/i,
    /\b([\w\-\.]+)\s+users/i,
    /\b(k3s-[\w\-]+)/i  // Match k3s-* patterns specifically
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get Proxmox authentication ticket and CSRF token
 */
async function getProxmoxTicket() {
  // Check if ticket is still valid (tickets expire in 2 hours, refresh at 1 hour 50 min)
  if (proxmoxTicket && proxmoxCSRFToken && proxmoxTicketExpiry && Date.now() < proxmoxTicketExpiry) {
    return { ticket: proxmoxTicket, csrf: proxmoxCSRFToken };
  }

  if (!PROXMOX_CONFIG.password) {
    throw new Error('Proxmox password not configured');
  }

  // Get new ticket
  return new Promise((resolve, reject) => {
    const data = `username=${encodeURIComponent(PROXMOX_CONFIG.username)}&password=${encodeURIComponent(PROXMOX_CONFIG.password)}`;

    const options = {
      hostname: PROXMOX_CONFIG.host,
      port: parseInt(PROXMOX_CONFIG.port),
      path: '/api2/json/access/ticket',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.data && parsed.data.ticket && parsed.data.CSRFPreventionToken) {
            proxmoxTicket = parsed.data.ticket;
            proxmoxCSRFToken = parsed.data.CSRFPreventionToken;
            // Ticket valid for 2 hours, refresh at 1 hour 50 min
            proxmoxTicketExpiry = Date.now() + (110 * 60 * 1000);
            resolve({ ticket: proxmoxTicket, csrf: proxmoxCSRFToken });
          } else {
            reject(new Error('No ticket in Proxmox response'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Query Proxmox API with intelligent routing
 */
async function queryProxmox(query, sseWriter = null) {
  try {
    const queryLower = query.toLowerCase();
    const proxmoxMCP = MCP_SERVERS.proxmox;

    // Use MCP server /query endpoint for now
    // TODO: Map to specific Proxmox MCP tools when needed
    console.log(`[Cortex] Proxmox query via MCP: "${query}"`);

    return await queryMCPServer(proxmoxMCP, query, sseWriter);
  } catch (error) {
    console.error('[Cortex] Proxmox MCP error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Make authenticated Proxmox API request
 */
async function makeProxmoxRequest(endpoint, method, body, auth) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: PROXMOX_CONFIG.host,
      port: parseInt(PROXMOX_CONFIG.port),
      path: `/api2/json${endpoint}`,
      method: method,
      headers: {
        'Cookie': `PVEAuthCookie=${auth.ticket}`
      },
      rejectUnauthorized: false
    };

    // Add CSRF token for write operations
    if (method !== 'GET') {
      options.headers['CSRFPreventionToken'] = auth.csrf;
    }

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        // Check HTTP status code
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error(`[Cortex] Proxmox API returned ${res.statusCode}:`, responseData.substring(0, 200));
          resolve({
            success: false,
            error: `Proxmox API error (${res.statusCode}): ${responseData.substring(0, 200)}`
          });
          return;
        }

        try {
          const parsed = JSON.parse(responseData);
          resolve({
            success: true,
            output: JSON.stringify(parsed, null, 2)
          });
        } catch (error) {
          resolve({ success: true, output: responseData });
        }
      });
    });

    req.on('error', (error) => {
      console.error('[Cortex] Proxmox API error:', error.message);
      resolve({ success: false, error: error.message });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Get UniFi session cookie
 */
async function getUnifiCookie() {
  // Check if cookie is still valid (cookies expire in ~1 hour, refresh at 50 min)
  if (unifiCookie && unifiCookieExpiry && Date.now() < unifiCookieExpiry) {
    return unifiCookie;
  }

  if (!UNIFI_CONFIG.password) {
    throw new Error('UniFi password not configured');
  }

  // Login endpoint differs for UDM vs standard controller
  const loginPath = UNIFI_CONFIG.isUDM ? '/api/auth/login' : '/api/login';

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      username: UNIFI_CONFIG.username,
      password: UNIFI_CONFIG.password,
      remember: true
    });

    const options = {
      hostname: UNIFI_CONFIG.host,
      port: parseInt(UNIFI_CONFIG.port),
      path: loginPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        // Extract cookie from Set-Cookie header
        const cookies = res.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
          // Find unifises cookie
          const unifiCookieMatch = cookies.find(c => c.startsWith('unifises='));
          if (unifiCookieMatch) {
            unifiCookie = unifiCookieMatch.split(';')[0];  // Get just "unifises=..."
            unifiCookieExpiry = Date.now() + (50 * 60 * 1000);  // 50 minutes
            resolve(unifiCookie);
          } else {
            reject(new Error('No unifises cookie in UniFi response'));
          }
        } else {
          reject(new Error('No cookies in UniFi response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Call a specific UniFi MCP tool using proper MCP JSON-RPC protocol
 */
async function callUnifiMCPTool(toolName, args, sseWriter = null) {
  try {
    console.log(`[Cortex] Calling UniFi MCP tool: ${toolName}`);

    // Use proper MCP JSON-RPC protocol (Daryl fixed the HTTP wrapper to support this)
    const unifiMCPUrl = MCP_SERVERS.unifi.replace('/query', '');
    const url = new URL(unifiMCPUrl);

    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args || {}
      }
    };

    const data = JSON.stringify(mcpRequest);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 30000
    };

    return new Promise((resolve, reject) => {
      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);

            // Handle MCP JSON-RPC response
            if (parsed.result) {
              // Standard MCP response format
              if (parsed.result.content && Array.isArray(parsed.result.content)) {
                const content = parsed.result.content[0];
                if (content.type === 'text') {
                  // Try to parse the text as JSON (Site Manager API returns JSON strings)
                  try {
                    const jsonData = JSON.parse(content.text);
                    resolve({ success: true, output: JSON.stringify(jsonData) });
                  } catch (e) {
                    // Not JSON, return as-is
                    resolve({ success: true, output: content.text });
                  }
                } else {
                  resolve({ success: true, output: JSON.stringify(content) });
                }
              } else {
                resolve({ success: true, output: JSON.stringify(parsed.result) });
              }
            } else if (parsed.error) {
              // MCP JSON-RPC error
              resolve({
                success: false,
                error: `MCP Error ${parsed.error.code}: ${parsed.error.message}`
              });
            } else {
              resolve({ success: false, error: 'Invalid MCP response format' });
            }
          } catch (error) {
            resolve({ success: false, error: `Failed to parse MCP response: ${error.message}` });
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[Cortex] UniFi MCP error:`, error.message);
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'MCP request timeout' });
      });

      req.write(data);
      req.end();
    });
  } catch (error) {
    console.error('[Cortex] UniFi MCP tool call error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Query UniFi API with intelligent routing
 */
async function queryUnifi(query, sseWriter = null) {
  try {
    const queryLower = query.toLowerCase();
    const unifiMCP = MCP_SERVERS.unifi;

    // Use MCP server /query endpoint for now
    // TODO: Map to specific UniFi MCP tools when needed
    console.log(`[Cortex] UniFi query via MCP: "${query}"`);

    return await queryMCPServer(unifiMCP, query, sseWriter);
  } catch (error) {
    console.error('[Cortex] UniFi MCP error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Make authenticated UniFi API request
 */
async function makeUnifiRequest(endpoint, method, body, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: UNIFI_CONFIG.host,
      port: parseInt(UNIFI_CONFIG.port),
      path: endpoint,
      method: method,
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        // Check HTTP status code
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error(`[Cortex] UniFi API returned ${res.statusCode}:`, responseData.substring(0, 200));
          resolve({
            success: false,
            error: `UniFi API error (${res.statusCode}): ${responseData.substring(0, 200)}`
          });
          return;
        }

        try {
          const parsed = JSON.parse(responseData);
          // UniFi returns {data: [...], meta: {rc: "ok"}}
          if (parsed.meta && parsed.meta.rc === 'ok') {
            resolve({
              success: true,
              output: JSON.stringify(parsed.data, null, 2)
            });
          } else {
            resolve({
              success: false,
              error: `UniFi API error: ${parsed.meta ? parsed.meta.msg : 'Unknown error'}`
            });
          }
        } catch (error) {
          resolve({ success: true, output: responseData });
        }
      });
    });

    req.on('error', (error) => {
      console.error('[Cortex] UniFi API error:', error.message);
      resolve({ success: false, error: error.message });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Call Anthropic Claude API with error handling and retry logic
 */
async function callClaude(messages, tools, sseWriter = null, retryCount = 0) {
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 120000; // 2 minutes

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      tools: tools || [],
      messages: messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      timeout: TIMEOUT_MS
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        // Handle HTTP error status codes
        if (res.statusCode !== 200) {
          console.error(`[Cortex] Claude API returned status ${res.statusCode}: ${responseData.substring(0, 500)}`);

          // Handle rate limiting with exponential backoff
          if (res.statusCode === 429 && retryCount < MAX_RETRIES) {
            const backoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log(`[Cortex] Rate limited by Claude API, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

            if (sseWriter) {
              sseWriter(JSON.stringify({
                type: 'processing_delay',
                message: `Rate limited, retrying in ${backoffMs / 1000} seconds...`
              }));
            }

            setTimeout(() => {
              callClaude(messages, tools, sseWriter, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, backoffMs);
            return;
          }

          // Handle server errors with retry
          if (res.statusCode >= 500 && retryCount < MAX_RETRIES) {
            const backoffMs = Math.pow(2, retryCount) * 1000;
            console.log(`[Cortex] Claude API server error, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

            if (sseWriter) {
              sseWriter(JSON.stringify({
                type: 'processing_delay',
                message: `API temporarily unavailable, retrying in ${backoffMs / 1000} seconds...`
              }));
            }

            setTimeout(() => {
              callClaude(messages, tools, sseWriter, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, backoffMs);
            return;
          }

          reject(new Error(`Claude API error (${res.statusCode}): ${responseData.substring(0, 500)}`));
          return;
        }

        try {
          const parsed = JSON.parse(responseData);

          // Check for API errors in response body
          if (parsed.error) {
            console.error('[Cortex] Claude API returned error:', parsed.error);
            reject(new Error(`Claude API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }

          resolve(parsed);
        } catch (error) {
          console.error('[Cortex] Failed to parse Claude response:', error.message);
          console.error('[Cortex] Response data:', responseData.substring(0, 1000));
          reject(new Error(`Failed to parse Claude response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('[Cortex] Claude API request error:', error.message);

      // Retry on network errors
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount) * 1000;
        console.log(`[Cortex] Network error, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'processing_delay',
            message: `Network error, retrying in ${backoffMs / 1000} seconds...`
          }));
        }

        setTimeout(() => {
          callClaude(messages, tools, sseWriter, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, backoffMs);
        return;
      }

      reject(new Error(`Claude API network error after ${MAX_RETRIES} retries: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[Cortex] Claude API request timeout');

      // Retry on timeout
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount) * 1000;
        console.log(`[Cortex] Request timeout, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'processing_delay',
            message: `Request timeout, retrying in ${backoffMs / 1000} seconds...`
          }));
        }

        setTimeout(() => {
          callClaude(messages, tools, sseWriter, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, backoffMs);
        return;
      }

      reject(new Error(`Claude API timeout after ${MAX_RETRIES} retries`));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Get Sandfly authentication token
 */
async function getSandflyToken() {
  // Check if token is still valid
  if (sandflyToken && sandflyTokenExpiry && Date.now() < sandflyTokenExpiry) {
    return sandflyToken;
  }

  // Get new token
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      username: SANDFLY_CONFIG.username,
      password: SANDFLY_CONFIG.password
    });

    const options = {
      hostname: SANDFLY_CONFIG.host,
      port: 443,
      path: '/v4/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      rejectUnauthorized: false // Allow self-signed certs
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.access_token) {
            sandflyToken = parsed.access_token;
            // Token valid for 60 minutes, refresh at 50 minutes
            sandflyTokenExpiry = Date.now() + (50 * 60 * 1000);
            resolve(sandflyToken);
          } else {
            reject(new Error('No access_token in response'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Query Sandfly API with intelligent routing
 */
async function querySandfly(query, sseWriter = null) {
  try {
    const queryLower = query.toLowerCase();
    const sandflyMCP = MCP_SERVERS.sandfly || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000';

    // Parse query and determine which MCP tool to call
    let toolName = 'sandfly_list_hosts';  // Default
    let toolArgs = { summary: true, page: 1, size: 100 };

    // Security alerts and results
    if (queryLower.includes('alert') || queryLower.includes('result') ||
        queryLower.includes('security') || queryLower.includes('threat') ||
        queryLower.includes('violation') || queryLower.includes('critical')) {
      toolName = 'sandfly_get_results';
      toolArgs = {
        filter: {},
        page: 1,
        size: 100,
        summary: false  // Get individual results, not aggregated
      };
    }
    // Hosts
    else if (queryLower.includes('host') || queryLower.includes('node') ||
             queryLower.includes('server')) {
      toolName = 'sandfly_list_hosts';
      toolArgs = { summary: true, page: 1, size: 100 };
    }
    // Scanning
    else if (queryLower.includes('scan')) {
      if (queryLower.includes('start') || queryLower.includes('run') ||
          queryLower.includes('trigger') || queryLower.includes('initiate')) {
        toolName = 'sandfly_start_scan';
        toolArgs = { host_ids: [], sandfly_ids: [] };  // Empty = all
      } else {
        return {
          success: false,
          error: 'Scan status queries not yet implemented. Use "start a scan" to trigger scans.'
        };
      }
    }
    // Forensics - For now, return helpful message
    // TODO: Implement forensics tools (requires host_id lookup first)
    else if (queryLower.includes('process') || queryLower.includes('user') ||
             queryLower.includes('listen') || queryLower.includes('service')) {
      return {
        success: false,
        error: 'Forensics queries (processes, users, listeners, etc.) coming soon. For now, try "what security alerts do we have?" or "list all hosts".'
      };
    }

    console.log(`[Cortex] Sandfly query via MCP: "${query}" -> ${toolName}`, toolArgs);

    // Call MCP server with specific tool
    return await callMCPTool(sandflyMCP, toolName, toolArgs, sseWriter);

  } catch (error) {
    console.error('[Cortex] Sandfly MCP error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Execute kubectl command
 */
async function executeKubectl(command) {
  try {
    console.log(`[Cortex] Executing kubectl: ${command}`);
    const { stdout, stderr } = await execPromise(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || ''
    };
  }
}

/**
 * Query MCP server with self-healing
 */
async function queryMCPServer(serverUrl, query, sseWriter = null) {
  return new Promise(async (resolve, reject) => {
    const url = new URL(serverUrl);
    const data = JSON.stringify({ query });

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: '/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 30000
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (error) {
          resolve({ success: true, output: responseData });
        }
      });
    });

    req.on('error', async (error) => {
      console.error(`[Cortex] MCP server error (${serverUrl}):`, error.message);

      // Trigger self-healing
      const serviceName = extractServiceName(serverUrl);

      if (sseWriter) {
        sseWriter(JSON.stringify({
          type: 'healing_start',
          service: serviceName,
          issue: error.message
        }));
      }

      const healResult = await spawnHealingWorker({
        service: serviceName,
        error: error.message,
        serverUrl: serverUrl
      }, sseWriter);

      if (healResult.success) {
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_complete',
            service: serviceName,
            success: true,
            message: healResult.fix_applied
          }));
        }

        // Retry
        const retryReq = protocol.request(options, (retryRes) => {
          let retryData = '';
          retryRes.on('data', (chunk) => { retryData += chunk; });
          retryRes.on('end', () => {
            try {
              resolve(JSON.parse(retryData));
            } catch (e) {
              resolve({ success: true, output: retryData });
            }
          });
        });

        retryReq.on('error', (retryError) => {
          resolve({ success: false, error: `Retry failed: ${retryError.message}` });
        });

        retryReq.on('timeout', () => {
          retryReq.destroy();
          resolve({ success: false, error: 'Retry timeout' });
        });

        retryReq.write(data);
        retryReq.end();
      } else {
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_failed',
            service: serviceName,
            message: healResult.diagnosis
          }));
        }

        resolve({
          success: false,
          error: error.message,
          healing_attempted: true,
          healing_diagnosis: healResult.diagnosis
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(data);
    req.end();
  });
}

/**
 * Extract service name from server URL
 */
function extractServiceName(serverUrl) {
  try {
    const url = new URL(serverUrl);
    const hostname = url.hostname;
    // Extract service name from hostname like "sandfly-mcp-server.cortex-system.svc.cluster.local"
    const parts = hostname.split('.');
    return parts[0] || hostname;
  } catch (error) {
    return 'unknown-service';
  }
}

/**
 * Spawn self-healing worker to diagnose and fix service issues
 */
async function spawnHealingWorker(errorContext, sseWriter = null) {
  const { service, error, serverUrl } = errorContext;

  console.log(`[Cortex] Spawning healing worker for service: ${service}`);

  // Stream progress if SSE writer provided
  const streamProgress = (message) => {
    if (sseWriter) {
      sseWriter(JSON.stringify({
        type: 'healing_progress',
        service: service,
        message: message
      }));
    }
    console.log(`[Cortex] [HEAL] ${message}`);
  };

  try {
    streamProgress('Initializing diagnostic checks...');

    // Execute healing worker script
    const command = `bash "${SELF_HEAL_WORKER_PATH}" "${service}" "${error}" "${serverUrl}"`;

    console.log(`[Cortex] Executing: ${command}`);

    const childProcess = exec(command, {
      timeout: 120000,  // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024
    });

    // Stream progress from worker output
    childProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.startsWith('PROGRESS:')) {
          streamProgress(line.substring(9).trim());
        } else if (line.trim()) {
          console.log(`[Cortex] [HEAL-WORKER] ${line}`);
        }
      });
    });

    childProcess.stderr.on('data', (data) => {
      console.error(`[Cortex] [HEAL-WORKER-ERR] ${data}`);
    });

    // Wait for completion
    const result = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0 || stdout.trim()) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Healing worker exited with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });

    // Parse result JSON from last line
    const lines = result.stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    try {
      const healResult = JSON.parse(lastLine);

      if (healResult.success) {
        streamProgress(`Fix applied: ${healResult.fix_applied}`);
        console.log(`[Cortex] Healing successful: ${healResult.diagnosis}`);
      } else {
        streamProgress(`Unable to auto-fix: ${healResult.diagnosis}`);
        console.log(`[Cortex] Healing failed: ${healResult.diagnosis}`);
      }

      return healResult;
    } catch (parseError) {
      console.error(`[Cortex] Failed to parse healing result: ${parseError.message}`);
      console.error(`[Cortex] Raw output: ${lastLine}`);

      return {
        success: false,
        diagnosis: 'Healing worker completed but output format was invalid',
        raw_output: result.stdout
      };
    }

  } catch (error) {
    console.error(`[Cortex] Healing worker error: ${error.message}`);
    streamProgress(`Healing worker failed: ${error.message}`);

    return {
      success: false,
      diagnosis: `Healing worker execution failed: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Call specific MCP tool via /call-tool endpoint with self-healing
 */
async function callMCPTool(serverUrl, toolName, arguments, sseWriter = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(serverUrl);
    const data = JSON.stringify({ tool_name: toolName, arguments });

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: '/call-tool',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 60000  // 60 second timeout for MCP tools
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (error) {
          resolve({ success: true, output: responseData });
        }
      });
    });

    req.on('error', async (error) => {
      console.error(`[Cortex] MCP tool call error (${serverUrl}/${toolName}):`, error.message);

      // Trigger self-healing
      const serviceName = extractServiceName(serverUrl);

      if (sseWriter) {
        sseWriter(JSON.stringify({
          type: 'healing_start',
          service: serviceName,
          issue: error.message
        }));
      }

      console.log(`[Cortex] Attempting self-healing for ${serviceName}...`);

      const healResult = await spawnHealingWorker({
        service: serviceName,
        error: error.message,
        serverUrl: serverUrl
      }, sseWriter);

      if (healResult.success) {
        // Stream success
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_complete',
            service: serviceName,
            success: true,
            message: healResult.fix_applied
          }));
        }

        // Retry the original request
        console.log(`[Cortex] Retrying MCP call after successful healing...`);

        // Retry logic with recursion protection
        const retryReq = protocol.request(options, (retryRes) => {
          let retryData = '';

          retryRes.on('data', (chunk) => {
            retryData += chunk;
          });

          retryRes.on('end', () => {
            try {
              const parsed = JSON.parse(retryData);
              resolve(parsed);
            } catch (error) {
              resolve({ success: true, output: retryData });
            }
          });
        });

        retryReq.on('error', (retryError) => {
          console.error(`[Cortex] Retry failed: ${retryError.message}`);
          resolve({
            success: false,
            error: `Original error: ${error.message}. Healing succeeded but retry failed: ${retryError.message}`
          });
        });

        retryReq.on('timeout', () => {
          retryReq.destroy();
          resolve({ success: false, error: 'Retry timeout after healing' });
        });

        retryReq.write(data);
        retryReq.end();
      } else {
        // Stream failure
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_failed',
            service: serviceName,
            message: `Unable to fix automatically: ${healResult.diagnosis}`,
            recommendation: healResult.recommendation
          }));
        }

        resolve({
          success: false,
          error: error.message,
          healing_attempted: true,
          healing_diagnosis: healResult.diagnosis,
          healing_recommendation: healResult.recommendation
        });
      }
    });

    req.on('timeout', async () => {
      req.destroy();
      console.error(`[Cortex] MCP tool call timeout (${serverUrl}/${toolName})`);

      // Trigger self-healing on timeout
      const serviceName = extractServiceName(serverUrl);

      if (sseWriter) {
        sseWriter(JSON.stringify({
          type: 'healing_start',
          service: serviceName,
          issue: 'Request timeout'
        }));
      }

      console.log(`[Cortex] Attempting self-healing for timeout on ${serviceName}...`);

      const healResult = await spawnHealingWorker({
        service: serviceName,
        error: 'MCP tool call timeout',
        serverUrl: serverUrl
      }, sseWriter);

      if (healResult.success) {
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_complete',
            service: serviceName,
            success: true,
            message: healResult.fix_applied
          }));
        }

        // Retry the original request
        console.log(`[Cortex] Retrying MCP call after successful healing...`);

        const retryReq = protocol.request(options, (retryRes) => {
          let retryData = '';

          retryRes.on('data', (chunk) => {
            retryData += chunk;
          });

          retryRes.on('end', () => {
            try {
              const parsed = JSON.parse(retryData);
              resolve(parsed);
            } catch (error) {
              resolve({ success: true, output: retryData });
            }
          });
        });

        retryReq.on('error', (retryError) => {
          console.error(`[Cortex] Retry failed: ${retryError.message}`);
          resolve({
            success: false,
            error: `Timeout error. Healing succeeded but retry failed: ${retryError.message}`
          });
        });

        retryReq.on('timeout', () => {
          retryReq.destroy();
          resolve({ success: false, error: 'Retry timeout after healing' });
        });

        retryReq.write(data);
        retryReq.end();
      } else {
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'healing_failed',
            service: serviceName,
            message: `Unable to fix timeout: ${healResult.diagnosis}`,
            recommendation: healResult.recommendation
          }));
        }

        resolve({
          success: false,
          error: 'MCP tool call timeout',
          healing_attempted: true,
          healing_diagnosis: healResult.diagnosis,
          healing_recommendation: healResult.recommendation
        });
      }
    });

    req.write(data);
    req.end();
  });
}

/**
 * Execute tool call from Claude with SSE support
 */
async function executeTool(toolName, input, sseWriter = null) {
  console.log(`[Cortex] Executing tool: ${toolName}`, JSON.stringify(input));

  switch (toolName) {
    case 'kubectl':
      return await executeKubectl(input.command);

    case 'get_infrastructure_summary':
      return await getInfrastructureSummary(sseWriter);

    case 'unifi_list_active_clients':
      return await callUnifiMCPTool('list_active_clients', {}, sseWriter);

    case 'unifi_get_device_health':
      return await callUnifiMCPTool('get_device_health', {}, sseWriter);

    case 'unifi_get_client_activity':
      return await callUnifiMCPTool('get_client_activity', {}, sseWriter);

    case 'sandfly_query':
      return await querySandfly(input.query, sseWriter);

    case 'proxmox_query':
      // Use direct API instead of MCP wrapper
      return await queryProxmox(input.query, sseWriter);

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Get infrastructure summary by querying all systems
 */
async function getInfrastructureSummary(sseWriter = null) {
  const summary = {
    timestamp: new Date().toISOString(),
    kubernetes: null,
    unifi: null,
    proxmox: null,
    sandfly: null
  };

  try {
    // K8s cluster status
    if (sseWriter) {
      sseWriter(JSON.stringify({ type: 'summary_progress', service: 'kubernetes' }));
    }

    const k8sResult = await executeKubectl('kubectl get nodes -o json && kubectl get pods --all-namespaces -o json');
    if (k8sResult.success) {
      try {
        const parts = k8sResult.output.split('\n');
        const nodesData = JSON.parse(parts[0] || '{"items":[]}');
        const podsData = JSON.parse(parts[1] || '{"items":[]}');

        summary.kubernetes = {
          nodes: {
            total: nodesData.items?.length || 0,
            ready: nodesData.items?.filter(n => n.status?.conditions?.find(c => c.type === 'Ready' && c.status === 'True')).length || 0
          },
          pods: {
            total: podsData.items?.length || 0,
            running: podsData.items?.filter(p => p.status?.phase === 'Running').length || 0,
            pending: podsData.items?.filter(p => p.status?.phase === 'Pending').length || 0,
            failed: podsData.items?.filter(p => p.status?.phase === 'Failed').length || 0
          }
        };
      } catch (e) {
        summary.kubernetes = { error: 'Failed to parse kubectl output' };
      }
    } else {
      summary.kubernetes = { error: k8sResult.error };
    }

    // UniFi network health
    if (sseWriter) {
      sseWriter(JSON.stringify({ type: 'summary_progress', service: 'unifi' }));
    }

    const unifiResult = await callUnifiMCPTool('get_device_health', {}, sseWriter);
    if (unifiResult.success) {
      try {
        const devices = JSON.parse(unifiResult.output);
        summary.unifi = {
          devices: devices.length || 0,
          online: devices.filter(d => d.state === 1).length || 0,
          types: devices.reduce((acc, d) => {
            acc[d.type] = (acc[d.type] || 0) + 1;
            return acc;
          }, {})
        };
      } catch (e) {
        summary.unifi = { error: 'Failed to parse UniFi data' };
      }
    } else {
      summary.unifi = { error: unifiResult.error };
    }

    // Proxmox VMs
    if (sseWriter) {
      sseWriter(JSON.stringify({ type: 'summary_progress', service: 'proxmox' }));
    }

    const proxmoxResult = await queryProxmox('list all VMs and their status', sseWriter);
    if (proxmoxResult.success) {
      summary.proxmox = { status: 'available', raw: proxmoxResult.output };
    } else {
      summary.proxmox = { error: proxmoxResult.error };
    }

    // Sandfly security alerts
    if (sseWriter) {
      sseWriter(JSON.stringify({ type: 'summary_progress', service: 'sandfly' }));
    }

    const sandflyResult = await querySandfly('security alerts', sseWriter);
    if (sandflyResult.success) {
      try {
        const alerts = JSON.parse(sandflyResult.output);
        summary.sandfly = {
          total_alerts: alerts.count || alerts.data?.length || 0,
          status: 'monitored'
        };
      } catch (e) {
        summary.sandfly = { error: 'Failed to parse Sandfly data' };
      }
    } else {
      summary.sandfly = { error: sandflyResult.error };
    }

    return { success: true, output: JSON.stringify(summary, null, 2) };
  } catch (error) {
    console.error('[Cortex] Infrastructure summary error:', error.message);
    return { success: false, error: error.message, partial_summary: summary };
  }
}

/**
 * Process user query with Claude
 */
async function processUserQuery(userQuery, sseWriter = null) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  console.log(`[Cortex] Processing query: ${userQuery}`);

  // Define tools for Claude
  const tools = [
    {
      name: 'kubectl',
      description: 'Execute kubectl commands to query the Kubernetes cluster. Use this for pod status, deployments, services, namespaces, logs, and any k8s resources.',
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The kubectl command to run (e.g., "kubectl get pods -n cortex-system")'
          }
        },
        required: ['command']
      }
    },
    {
      name: 'get_infrastructure_summary',
      description: 'Get a comprehensive summary of all infrastructure in a single call: K8s cluster status, UniFi network health, Proxmox VMs, and Sandfly security alerts. This is the most efficient way to get an overview of the entire system.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'unifi_list_active_clients',
      description: 'List all active WiFi and wired clients connected to the UniFi network with details like hostname, IP, MAC, signal strength, and data usage.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'unifi_get_device_health',
      description: 'Get health status and details of all UniFi devices (access points, switches, gateways) including uptime, CPU, memory, and connectivity.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'unifi_get_client_activity',
      description: 'Get recent client connection activity, bandwidth usage, and network statistics.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'sandfly_query',
      description: 'Query Sandfly Security for Linux intrusion detection and forensics. Supports: security alerts/results, monitored hosts, processes, users, network listeners, services, scheduled tasks, kernel modules, and triggering scans. Use this for ANY security-related query about Linux hosts.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language security query (e.g., "security alerts", "processes on k3s-worker01", "network listeners", "start a scan")'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'proxmox_query',
      description: 'Query Proxmox for VM status, LXC containers, resource usage, node health, and virtual machine information.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What Proxmox information to query (e.g., "list all running VMs")'
          }
        },
        required: ['query']
      }
    }
  ];

  // Initial Claude request with error handling
  let response;
  try {
    response = await callClaude([{
      role: 'user',
      content: userQuery
    }], tools, sseWriter);

    console.log(`[Cortex] Claude response - stop_reason: ${response.stop_reason}`);
  } catch (error) {
    console.error('[Cortex] Claude API call failed:', error.message);
    throw new Error(`Claude API error: ${error.message}`);
  }

  // Check if response is valid
  if (!response || !response.content) {
    console.error('[Cortex] Invalid response from Claude:', JSON.stringify(response).substring(0, 500));
    return {
      answer: 'Error: Invalid response from Claude API',
      tools_used: [],
      raw_response: response
    };
  }

  // Check if Claude wants to use tools - multi-turn loop
  let toolUses = response.content.filter(block => block.type === 'tool_use');

  if (toolUses.length > 0) {
    // Initialize conversation history and tool tracking
    const conversationMessages = [
      { role: 'user', content: userQuery },
      { role: 'assistant', content: response.content }
    ];

    const allToolsUsed = [];
    let currentResponse = response;
    let iteration = 0;
    const MAX_ITERATIONS = 10; // Increased from 5 to handle complex queries

    // Multi-turn tool use loop
    while (toolUses.length > 0 && iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[Cortex] Iteration ${iteration}: Executing ${toolUses.length} tool(s)`);

      // Send progress update via SSE
      if (sseWriter) {
        sseWriter(JSON.stringify({
          type: 'tool_progress',
          iteration: iteration,
          max_iterations: MAX_ITERATIONS,
          tools: toolUses.map(t => t.name)
        }));
      }

      // Track tools used
      allToolsUsed.push(...toolUses.map(t => t.name));

      // Execute all tools in this turn
      const toolResults = [];
      for (const toolUse of toolUses) {
        // Send individual tool execution update
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'tool_execution',
            tool_name: toolUse.name,
            status: 'executing'
          }));
        }

        const result = await executeTool(toolUse.name, toolUse.input, sseWriter);

        // Send tool completion update
        if (sseWriter) {
          sseWriter(JSON.stringify({
            type: 'tool_execution',
            tool_name: toolUse.name,
            status: result.success ? 'completed' : 'failed',
            error: result.error
          }));
        }

        // Format result for Claude - include partial results even on failure
        let formattedResult;
        if (result.success && result.output) {
          // If MCP server returned output as JSON string, try to parse it
          try {
            const parsed = JSON.parse(result.output);
            formattedResult = JSON.stringify(parsed, null, 2);
          } catch (e) {
            // If not JSON, use as-is
            formattedResult = result.output;
          }
        } else if (result.partial_summary) {
          // Include partial results for infrastructure summary even if it failed
          formattedResult = JSON.stringify({
            status: 'partial',
            error: result.error,
            partial_data: result.partial_summary
          }, null, 2);
          console.log(`[Cortex] Tool ${toolUse.name} returned partial results despite error`);
        } else if (result.output) {
          // If there's output but success=false, include both
          formattedResult = JSON.stringify({
            status: 'error',
            error: result.error,
            output: result.output
          }, null, 2);
        } else {
          // For other results (kubectl, etc), stringify the whole object
          formattedResult = JSON.stringify(result);
        }

        console.log(`[Cortex] Tool result for ${toolUse.name}:`, formattedResult.substring(0, 500));

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: formattedResult
        });
      }

      // Add tool results to conversation
      conversationMessages.push({ role: 'user', content: toolResults });

      // Get Claude's next response
      try {
        currentResponse = await callClaude(conversationMessages, tools, sseWriter);
        console.log(`[Cortex] Iteration ${iteration} response - stop_reason: ${currentResponse.stop_reason}`);
      } catch (error) {
        console.error('[Cortex] Claude API call failed:', error.message);
        throw new Error(`Claude API error: ${error.message}`);
      }

      // Check if response is valid
      if (!currentResponse || !currentResponse.content) {
        console.error('[Cortex] Invalid response from Claude:', JSON.stringify(currentResponse).substring(0, 500));
        return {
          answer: 'Error: Invalid response from Claude API',
          tools_used: allToolsUsed,
          raw_response: currentResponse
        };
      }

      // Add assistant response to conversation
      conversationMessages.push({ role: 'assistant', content: currentResponse.content });

      // Check if Claude wants to use more tools
      toolUses = currentResponse.content.filter(block => block.type === 'tool_use');

      // If stop_reason is end_turn or stop_sequence, we're done
      if (currentResponse.stop_reason === 'end_turn' || currentResponse.stop_reason === 'stop_sequence') {
        break;
      }
    }

    // Check for max iterations exceeded
    if (iteration >= MAX_ITERATIONS) {
      console.warn(`[Cortex] Max iterations (${MAX_ITERATIONS}) reached, returning current response`);
    }

    // Extract final text answer
    const textBlock = currentResponse.content.find(b => b.type === 'text');
    return {
      answer: textBlock?.text || 'No response from Claude',
      tools_used: allToolsUsed,
      raw_response: currentResponse,
      iterations: iteration
    };
  }

  // No tools used, return direct answer
  if (!response || !response.content) {
    console.error('[Cortex] Invalid response from Claude:', JSON.stringify(response).substring(0, 500));
    return {
      answer: 'Error: Invalid response from Claude API',
      tools_used: [],
      raw_response: response
    };
  }

  const textBlock = response.content.find(b => b.type === 'text');
  return {
    answer: textBlock?.text || 'No response from Claude',
    tools_used: [],
    raw_response: response
  };
}

/**
 * Handle cortex_list_agents tool
 * Lists all master and worker agents in the Cortex system
 */
async function handleListAgents(input) {
  const { type = 'all', status = 'all' } = input;

  // For now, return the architecture definition
  // In future, this could query actual running agents from k8s
  const agents = {
    masters: [
      {
        id: 'development-master',
        type: 'master',
        category: 'development',
        status: 'active',
        capabilities: ['code_analysis', 'testing', 'documentation', 'code_generation']
      },
      {
        id: 'security-master',
        type: 'master',
        category: 'security',
        status: 'active',
        capabilities: ['vulnerability_scan', 'compliance_check', 'threat_analysis']
      },
      {
        id: 'infrastructure-master',
        type: 'master',
        category: 'infrastructure',
        status: 'active',
        capabilities: ['monitoring', 'deployment', 'configuration', 'optimization']
      },
      {
        id: 'inventory-master',
        type: 'master',
        category: 'inventory',
        status: 'active',
        capabilities: ['asset_discovery', 'dependency_mapping', 'license_management']
      },
      {
        id: 'cicd-master',
        type: 'master',
        category: 'cicd',
        status: 'active',
        capabilities: ['pipeline_orchestration', 'build', 'test_automation', 'deployment']
      }
    ],
    workers: [], // Will be populated as workers are spawned
    coordinator: {
      id: 'cortex-orchestrator',
      type: 'coordinator',
      status: 'active',
      uptime: process.uptime()
    }
  };

  // Filter by type if specified
  if (type === 'masters') {
    return { agents: agents.masters, count: agents.masters.length };
  } else if (type === 'workers') {
    return { agents: agents.workers, count: agents.workers.length };
  }

  return {
    masters: agents.masters,
    workers: agents.workers,
    coordinator: agents.coordinator,
    total_count: agents.masters.length + agents.workers.length + 1
  };
}

/**
 * Handle cortex_get_tasks tool
 * Gets current and historical tasks
 */
async function handleGetTasks(input) {
  const { status = 'all', limit = 20 } = input;

  // Check if task storage exists
  try {
    const { stdout } = await execPromise('ls -la /app/tasks 2>/dev/null || echo "none"');

    if (stdout.includes('none')) {
      return {
        tasks: [],
        count: 0,
        message: 'No task storage directory found yet'
      };
    }

    // List task files
    const { stdout: taskFiles } = await execPromise(`ls -t /app/tasks/*.json 2>/dev/null | head -${limit} || echo ""`);

    if (!taskFiles.trim()) {
      return {
        tasks: [],
        count: 0,
        message: 'No tasks found'
      };
    }

    const files = taskFiles.trim().split('\n');
    const tasks = [];

    for (const file of files) {
      if (!file) continue;
      try {
        const { stdout: content } = await execPromise(`cat "${file}"`);
        const task = JSON.parse(content);

        // Filter by status if specified
        if (status === 'all' || task.status === status) {
          tasks.push({
            id: task.id,
            type: task.type,
            status: task.status,
            priority: task.priority,
            created_at: task.metadata?.created_at,
            updated_at: task.metadata?.updated_at
          });
        }
      } catch (err) {
        console.error('[handleGetTasks] Error reading task file:', file, err);
      }
    }

    return {
      tasks,
      count: tasks.length,
      filtered_by: status
    };

  } catch (error) {
    console.error('[handleGetTasks] Error:', error);
    return {
      tasks: [],
      count: 0,
      error: error.message
    };
  }
}

/**
 * Handle cortex_get_metrics tool
 * Gets system metrics and performance data
 */
async function handleGetMetrics(input) {
  const { time_range = '24h' } = input;

  return {
    orchestrator: {
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      node_version: process.version,
      platform: process.platform
    },
    mcp_servers: {
      sandfly: MCP_SERVERS.sandfly,
      unifi: MCP_SERVERS.unifi,
      proxmox: MCP_SERVERS.proxmox
    },
    time_range,
    collected_at: new Date().toISOString()
  };
}

/**
 * Handle cortex_create_task tool
 * Creates a new task in Cortex for processing by master agents
 * DESIGNED FOR PARALLEL SUBMISSION - returns immediately
 * DUAL PERSISTENCE: Writes to BOTH Redis queue AND filesystem
 */
async function handleCreateTask(input) {
  const {
    title,
    description,
    category = 'general',
    priority = 'medium',
    metadata = {}
  } = input;

  // Generate unique task ID
  const taskId = `task-chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Map priority names to both numbers and queue names
  const priorityMap = {
    'critical': 1,
    'high': 3,
    'medium': 5,
    'low': 7
  };
  const numericPriority = typeof priority === 'string' ? priorityMap[priority] || 5 : priority;
  const priorityName = typeof priority === 'string' ? priority : 'medium';

  // Create task object matching Cortex task schema
  const task = {
    id: taskId,
    type: 'user_query',
    priority: priorityName, // Use string priority for Redis queue selection
    status: 'queued',
    payload: {
      query: description,
      title: title,
      category: category
    },
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: 'chat',
      original_input: input,
      ...metadata
    },
    // Additional fields for worker execution
    messages: [
      {
        role: 'user',
        content: description
      }
    ],
    estimatedTokens: 2000
  };

  try {
    // Ensure tasks directory exists
    await fs.mkdir('/app/tasks', { recursive: true });

    // DUAL PERSISTENCE 1: Write to filesystem (for backwards compatibility)
    const taskPath = `/app/tasks/${taskId}.json`;
    await fs.writeFile(taskPath, JSON.stringify(task, null, 2));

    console.log(`[CortexAPI] Task created: ${taskId} (${category}, priority ${priorityName})`);
    console.log(`[CortexAPI] Task title: ${title}`);
    console.log(`[CortexAPI] Saved to filesystem: ${taskPath}`);

    // DUAL PERSISTENCE 2: Push to Redis queue (if enabled)
    if (redisClient && REDIS_ENABLED) {
      try {
        const queueName = PRIORITY_QUEUES[priorityName] || PRIORITY_QUEUES.medium;

        // LPUSH to add task to queue (workers use BRPOP from the other end)
        await redisClient.lpush(queueName, JSON.stringify(task));

        console.log(`[CortexAPI] Task pushed to Redis queue: ${queueName}`);

        // Update queue depth metric
        const queueDepth = await redisClient.llen(queueName);
        await redisClient.set(`cortex:queue:depth:${priorityName}`, queueDepth);

        return {
          task_id: taskId,
          status: 'queued',
          message: 'Task created and queued for processing (dual persistence: Redis + filesystem)',
          created_at: task.metadata.created_at,
          estimated_start: 'Immediate - workers are monitoring the queue',
          queue: queueName,
          queue_depth: queueDepth,
          persistence_mode: 'dual'
        };

      } catch (redisError) {
        console.error(`[CortexAPI] Redis push failed (fallback to filesystem only):`, redisError.message);

        return {
          task_id: taskId,
          status: 'queued',
          message: 'Task created (filesystem only - Redis unavailable)',
          created_at: task.metadata.created_at,
          estimated_start: 'Will be picked up by next orchestrator cycle (polling mode)',
          persistence_mode: 'filesystem_only',
          warning: 'Redis queue unavailable'
        };
      }
    } else {
      // Redis disabled, filesystem only
      return {
        task_id: taskId,
        status: 'queued',
        message: 'Task created (filesystem only - Redis disabled)',
        created_at: task.metadata.created_at,
        estimated_start: 'Will be picked up by next orchestrator cycle',
        persistence_mode: 'filesystem_only'
      };
    }

  } catch (error) {
    console.error(`[CortexAPI] Error creating task:`, error);
    throw new Error(`Failed to create task: ${error.message}`);
  }
}

/**
 * Handle cortex_get_task_status tool
 * Check the status of a previously created task
 */
async function handleGetTaskStatus(input) {
  const { task_id } = input;

  if (!task_id) {
    throw new Error('task_id is required');
  }

  const taskPath = `/app/tasks/${task_id}.json`;

  try {
    const fs = require('fs').promises;
    const content = await fs.readFile(taskPath, 'utf8');
    const task = JSON.parse(content);

    return {
      task_id: task.id,
      status: task.status,
      type: task.type,
      priority: task.priority,
      title: task.payload?.title,
      created_at: task.metadata?.created_at,
      updated_at: task.metadata?.updated_at,
      result: task.result || null
    };

  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        task_id,
        status: 'not_found',
        message: 'Task not found - may have been completed and archived'
      };
    }
    throw new Error(`Failed to get task status: ${error.message}`);
  }
}

/**
 * Task Processing Infrastructure
 */

// Task processing state
const taskProcessingState = {
  isProcessing: false,
  currentTask: null,
  lastCheck: null,
  processedCount: 0,
  failedCount: 0
};

/**
 * Scan task directory for queued tasks
 */
async function scanForTasks() {
  try {
    // Ensure task directory exists
    await fs.mkdir(TASK_DIR, { recursive: true });

    // Read all files in task directory
    const files = await fs.readdir(TASK_DIR);
    const taskFiles = files.filter(f => f.startsWith('task-') && f.endsWith('.json'));

    const tasks = [];
    for (const file of taskFiles) {
      try {
        const filePath = path.join(TASK_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const task = JSON.parse(content);

        // Only include queued tasks
        if (task.status === 'queued') {
          tasks.push({ ...task, filePath });
        }
      } catch (err) {
        console.error(`[TaskProcessor] Error reading task file ${file}:`, err.message);
      }
    }

    // Sort by priority (lower number = higher priority)
    tasks.sort((a, b) => a.priority - b.priority);

    return tasks;
  } catch (error) {
    console.error('[TaskProcessor] Error scanning for tasks:', error.message);
    return [];
  }
}

/**
 * Update task status
 */
async function updateTaskStatus(task, status, updates = {}) {
  try {
    const updatedTask = {
      ...task,
      status,
      metadata: {
        ...task.metadata,
        updated_at: new Date().toISOString(),
        ...updates.metadata
      },
      ...updates
    };

    // Remove filePath from saved data
    const { filePath, ...taskData } = updatedTask;

    await fs.writeFile(task.filePath, JSON.stringify(taskData, null, 2));

    console.log(`[TaskProcessor] Task ${task.id} updated to status: ${status}`);

    return updatedTask;
  } catch (error) {
    console.error(`[TaskProcessor] Error updating task ${task.id}:`, error.message);
    throw error;
  }
}

/**
 * Route task to appropriate master agent
 */
function routeTaskToMaster(task) {
  const category = task.payload?.category || 'general';

  const masterMap = {
    'development': 'development-master',
    'security': 'security-master',
    'infrastructure': 'infrastructure-master',
    'inventory': 'inventory-master',
    'cicd': 'cicd-master',
    'ci/cd': 'cicd-master',
    'general': 'infrastructure-master' // Default to infrastructure
  };

  return masterMap[category.toLowerCase()] || 'infrastructure-master';
}

/**
 * Process a single task
 */
async function processTask(task) {
  console.log(`\n[TaskProcessor] ========================================`);
  console.log(`[TaskProcessor] Processing task: ${task.id}`);
  console.log(`[TaskProcessor] Title: ${task.payload?.title || 'No title'}`);
  console.log(`[TaskProcessor] Category: ${task.payload?.category || 'general'}`);
  console.log(`[TaskProcessor] Priority: ${task.priority}`);
  console.log(`[TaskProcessor] ========================================\n`);

  try {
    // Update status to in_progress
    const inProgressTask = await updateTaskStatus(task, 'in_progress', {
      metadata: {
        started_at: new Date().toISOString(),
        assigned_to: routeTaskToMaster(task)
      }
    });

    taskProcessingState.currentTask = inProgressTask;

    // Execute the task query using Claude
    const query = task.payload?.query || task.payload?.description || '';

    if (!query) {
      throw new Error('No query found in task payload');
    }

    console.log(`[TaskProcessor] Executing query via Claude...`);
    const result = await processUserQuery(query, null);

    // Task completed successfully
    const completedTask = await updateTaskStatus(inProgressTask, 'completed', {
      result: {
        answer: result.answer,
        tools_used: result.tools_used || [],
        iterations: result.iterations || 0,
        completed_at: new Date().toISOString()
      },
      metadata: {
        completed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - new Date(inProgressTask.metadata.started_at).getTime()
      }
    });

    taskProcessingState.processedCount++;
    taskProcessingState.currentTask = null;

    console.log(`[TaskProcessor] Task ${task.id} completed successfully`);

    return completedTask;

  } catch (error) {
    console.error(`[TaskProcessor] Task ${task.id} failed:`, error.message);

    // Mark task as failed
    await updateTaskStatus(task, 'failed', {
      error: {
        message: error.message,
        stack: error.stack,
        failed_at: new Date().toISOString()
      },
      metadata: {
        failed_at: new Date().toISOString()
      }
    });

    taskProcessingState.failedCount++;
    taskProcessingState.currentTask = null;

    throw error;
  }
}

/**
 * Task processing loop
 */
async function taskProcessingLoop() {
  if (taskProcessingState.isProcessing) {
    return; // Already processing
  }

  try {
    taskProcessingState.isProcessing = true;
    taskProcessingState.lastCheck = new Date().toISOString();

    // Scan for queued tasks
    const queuedTasks = await scanForTasks();

    if (queuedTasks.length > 0) {
      console.log(`[TaskProcessor] Found ${queuedTasks.length} queued task(s)`);

      // Process tasks one at a time
      for (const task of queuedTasks) {
        try {
          await processTask(task);

          // Small delay between tasks to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`[TaskProcessor] Error processing task ${task.id}:`, error.message);
          // Continue to next task
        }
      }
    }

  } catch (error) {
    console.error('[TaskProcessor] Error in task processing loop:', error.message);
  } finally {
    taskProcessingState.isProcessing = false;
  }
}

/**
 * Start task processing daemon
 */
function startTaskProcessor() {
  console.log(`[TaskProcessor] Starting task processor daemon`);
  console.log(`[TaskProcessor] Task directory: ${TASK_DIR}`);
  console.log(`[TaskProcessor] Poll interval: ${TASK_POLL_INTERVAL}ms`);

  // Run initial scan
  taskProcessingLoop();

  // Set up polling interval
  setInterval(() => {
    taskProcessingLoop();
  }, TASK_POLL_INTERVAL);
}

/**
 * HTTP request handler
 */
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Queue status endpoint
  if (req.url === '/api/queue/status' && req.method === 'GET') {
    try {
      let queueStatus = {
        redis_enabled: REDIS_ENABLED,
        queues: {}
      };

      if (redisClient && REDIS_ENABLED) {
        for (const [priority, queueName] of Object.entries(PRIORITY_QUEUES)) {
          const depth = await redisClient.llen(queueName);
          queueStatus.queues[priority] = {
            name: queueName,
            depth: depth
          };
        }
      } else {
        queueStatus.message = 'Redis queue system disabled';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(queueStatus));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Workers status endpoint
  if (req.url === '/api/workers/status' && req.method === 'GET') {
    try {
      // Query Kubernetes for worker pod count
      const { stdout } = await execPromise('kubectl get pods -n cortex -l app=cortex-queue-worker -o json');
      const podsData = JSON.parse(stdout);

      const workers = podsData.items.map(pod => ({
        name: pod.metadata.name,
        status: pod.status.phase,
        ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        started: pod.status.startTime
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        total: workers.length,
        ready: workers.filter(w => w.ready).length,
        workers: workers
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message, total: 0 }));
    }
    return;
  }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      intelligence: ANTHROPIC_API_KEY ? 'enabled' : 'disabled',
      redis: REDIS_ENABLED && redisClient ? (redisClient.status === 'ready' ? 'connected' : redisClient.status) : 'disabled',
      taskProcessor: {
        enabled: true,
        processedCount: taskProcessingState.processedCount,
        failedCount: taskProcessingState.failedCount,
        isProcessing: taskProcessingState.isProcessing,
        lastCheck: taskProcessingState.lastCheck,
        currentTask: taskProcessingState.currentTask?.id || null
      }
    }));
    return;
  }

  // Task processor status
  if (req.url === '/api/task-processor/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: true,
      state: taskProcessingState,
      config: {
        taskDir: TASK_DIR,
        pollInterval: TASK_POLL_INTERVAL
      }
    }));
    return;
  }

  // Main API endpoint with SSE support
  if (req.url === '/api/tasks' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const query = data.payload?.query || data.query || '';
        const streaming = data.streaming !== false;  // Default to true

        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No query provided' }));
          return;
        }

        console.log(`\n[CortexAPI] ========================================`);
        console.log(`[CortexAPI] Received query: ${query}`);
        console.log(`[CortexAPI] Streaming: ${streaming}`);
        console.log(`[CortexAPI] ========================================\n`);

        // SSE writer for streaming healing events
        let sseWriter = null;
        if (streaming) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });

          sseWriter = (data) => {
            res.write(`data: ${data}\n\n`);
          };

          // Send initial message
          sseWriter(JSON.stringify({
            type: 'processing_start',
            query: query
          }));
        }

        const result = await processUserQuery(query, sseWriter);

        console.log(`\n[CortexAPI] ========================================`);
        console.log(`[CortexAPI] Returning answer to chat app`);
        console.log(`[CortexAPI] ========================================\n`);

        if (streaming) {
          // Send final result via SSE
          sseWriter(JSON.stringify({
            type: 'processing_complete',
            id: data.id,
            status: 'completed',
            result: result
          }));
          res.end();
        } else {
          // Legacy JSON response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: data.id,
            status: 'completed',
            result: result
          }));
        }
      } catch (error) {
        console.error('[CortexAPI] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error.message,
          answer: `I encountered an error processing your request: ${error.message}`
        }));
      }
    });

    return;
  }

  // Handle /execute-tool endpoint for chat integration
  if (req.url === '/execute-tool' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { tool_name, tool_input } = JSON.parse(body);

        console.log('[CortexAPI] Tool execution request:', tool_name, tool_input);

        let result;
        switch (tool_name) {
          case 'cortex_list_agents':
            result = await handleListAgents(tool_input);
            break;
          case 'cortex_get_tasks':
            result = await handleGetTasks(tool_input);
            break;
          case 'cortex_get_metrics':
            result = await handleGetMetrics(tool_input);
            break;
          case 'cortex_create_task':
            result = await handleCreateTask(tool_input);
            break;
          case 'cortex_get_task_status':
            result = await handleGetTaskStatus(tool_input);
            break;
          default:
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unknown tool: ${tool_name}` }));
            return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ result, success: true }));

      } catch (error) {
        console.error('[CortexAPI] Error executing tool:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error.message,
          success: false
        }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Global error handlers for unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('============================================================');
  console.error('[Cortex] UNCAUGHT EXCEPTION - System may be unstable');
  console.error('============================================================');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('============================================================');

  // Log to file for investigation
  const fs = require('fs');
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: 'uncaughtException',
    error: error.message,
    stack: error.stack
  };

  fs.appendFileSync('/tmp/cortex-errors.log', JSON.stringify(errorLog) + '\n');

  // Don't exit - attempt to continue
  console.error('[Cortex] Continuing operation despite uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('============================================================');
  console.error('[Cortex] UNHANDLED PROMISE REJECTION');
  console.error('============================================================');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('============================================================');

  // Log to file for investigation
  const fs = require('fs');
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: 'unhandledRejection',
    reason: reason ? reason.toString() : 'Unknown',
    stack: reason && reason.stack ? reason.stack : 'No stack trace'
  };

  fs.appendFileSync('/tmp/cortex-errors.log', JSON.stringify(errorLog) + '\n');
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('\n[Cortex] Received SIGTERM, shutting down gracefully...');

  server.close(() => {
    console.log('[Cortex] Server closed, exiting process');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Cortex] Forced shutdown after 10 second timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n[Cortex] Received SIGINT, shutting down gracefully...');

  server.close(() => {
    console.log('[Cortex] Server closed, exiting process');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Cortex] Forced shutdown after 10 second timeout');
    process.exit(1);
  }, 10000);
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log('============================================================');
  console.log('Cortex Intelligent Orchestrator v2.0 - Redis Queue Edition');
  console.log('============================================================');
  console.log(`Listening on port ${PORT}`);
  console.log(`Intelligence: ${ANTHROPIC_API_KEY ? 'ENABLED ✓' : 'DISABLED ✗'}`);
  console.log(`Self-Healing: ENABLED ✓`);
  console.log(`Healing Worker: ${SELF_HEAL_WORKER_PATH}`);
  console.log(`Task Processor: ENABLED ✓`);
  console.log(`Task Directory: ${TASK_DIR}`);
  console.log(`Poll Interval: ${TASK_POLL_INTERVAL}ms`);

  // Connect to Redis
  if (redisClient && REDIS_ENABLED) {
    try {
      await redisClient.connect();
      console.log(`Redis Queue: ENABLED ✓ (${REDIS_HOST}:${REDIS_PORT})`);
      console.log('Queue System: DUAL PERSISTENCE (Redis + Filesystem)');
    } catch (error) {
      console.error(`Redis Queue: FAILED ✗ (${error.message})`);
      console.log('Queue System: FILESYSTEM ONLY (fallback mode)');
    }
  } else {
    console.log('Redis Queue: DISABLED (filesystem only)');
    console.log('Queue System: FILESYSTEM ONLY');
  }

  console.log('\nDirect API Integrations:');
  console.log(`  Sandfly API:  ${SANDFLY_CONFIG.baseUrl}`);
  console.log(`  Proxmox API:  ${PROXMOX_CONFIG.baseUrl}`);
  console.log(`  UniFi API:    ${UNIFI_CONFIG.baseUrl} (${UNIFI_CONFIG.isUDM ? 'UDM Pro' : 'Standard'})`);
  console.log(`  Kubernetes:   kubectl (native)`);
  console.log('\nEndpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /api/queue/status - Queue depths and status');
  console.log('  GET  /api/workers/status - Active worker count');
  console.log('  GET  /api/task-processor/status - Task processor status');
  console.log('  POST /api/tasks - Process intelligent queries');
  console.log('  POST /execute-tool - Execute Cortex introspection tools (chat integration)');
  console.log('\nError Handling:');
  console.log('  Uncaught exceptions: Logged and continued');
  console.log('  Unhandled rejections: Logged and continued');
  console.log('  MCP failures: Self-healing attempted');
  console.log('  Claude API errors: Retry with exponential backoff');
  console.log('  Redis failures: Automatic fallback to filesystem');
  console.log('============================================================');

  // Start task processor daemon
  startTaskProcessor();
});
