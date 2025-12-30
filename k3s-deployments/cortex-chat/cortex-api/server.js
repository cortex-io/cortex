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
async function callClaude(messages, tools, sseWriter = null, retryCount = 0, systemPrompt = null) {
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 120000; // 2 minutes

  return new Promise((resolve, reject) => {
    const requestBody = {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      tools: tools || [],
      messages: messages
    };

    // Add system prompt if provided
    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    const data = JSON.stringify(requestBody);

    // Debug: Log request size and structure
    console.log(`[Cortex] Claude API request - size: ${data.length} bytes`);
    console.log(`[Cortex] Claude API request - messages: ${messages.length}, tools: ${(tools || []).length}`);
    if (data.length > 10000) {
      console.log(`[Cortex] WARNING: Large request (${data.length} bytes) - may be truncated`);
      console.log(`[Cortex] Request preview (first 500 chars):`, data.substring(0, 500));
      console.log(`[Cortex] Request preview (last 500 chars):`, data.substring(data.length - 500));
    }

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8'),
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
 * Get Sandfly alerts with filtering
 */
async function getSandflyAlerts(filters, sseWriter = null) {
  try {
    const sandflyMCP = MCP_SERVERS.sandfly || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000';

    const toolArgs = {
      filter: {},
      page: 1,
      size: filters.limit || 50,
      summary: false
    };

    // Apply filters if provided
    if (filters.severity) {
      toolArgs.filter.severity = filters.severity;
    }
    if (filters.resolved !== undefined) {
      toolArgs.filter.resolved = filters.resolved;
    }
    if (filters.hostname) {
      toolArgs.filter.hostname = filters.hostname;
    }

    console.log('[Cortex] Getting Sandfly alerts with filters:', toolArgs);
    return await callMCPTool(sandflyMCP, 'sandfly_get_results', toolArgs, sseWriter);
  } catch (error) {
    console.error('[Cortex] Sandfly get_alerts error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get Sandfly monitored hosts
 */
async function getSandflyHosts(filters, sseWriter = null) {
  try {
    const sandflyMCP = MCP_SERVERS.sandfly || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000';

    const toolArgs = {
      summary: true,
      page: 1,
      size: filters.limit || 100
    };

    console.log('[Cortex] Getting Sandfly hosts with filters:', toolArgs);
    return await callMCPTool(sandflyMCP, 'sandfly_list_hosts', toolArgs, sseWriter);
  } catch (error) {
    console.error('[Cortex] Sandfly get_hosts error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get processes for a specific host
 */
async function getSandflyProcesses(input, sseWriter = null) {
  try {
    const sandflyMCP = MCP_SERVERS.sandfly || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000';

    // First, get host_id from hostname
    const hostId = await getHostIdByName(input.hostname);
    if (!hostId) {
      return {
        success: false,
        error: `Host "${input.hostname}" not found in Sandfly. Try "sandfly_get_hosts" to see available hosts.`
      };
    }

    const toolArgs = {
      host_id: hostId,
      page: 1,
      size: input.limit || 100
    };

    console.log(`[Cortex] Getting processes for host ${input.hostname} (ID: ${hostId})`);
    return await callMCPTool(sandflyMCP, 'sandfly_get_processes', toolArgs, sseWriter);
  } catch (error) {
    console.error('[Cortex] Sandfly get_processes error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger security scan on host
 */
async function triggerSandflyScan(input, sseWriter = null) {
  try {
    const sandflyMCP = MCP_SERVERS.sandfly || 'http://sandfly-mcp-server.cortex-system.svc.cluster.local:3000';

    let toolArgs = {
      host_ids: [],
      sandfly_ids: []
    };

    // If specific hostname provided, look up host_id
    if (input.hostname && input.hostname.toLowerCase() !== 'all') {
      const hostId = await getHostIdByName(input.hostname);
      if (!hostId) {
        return {
          success: false,
          error: `Host "${input.hostname}" not found in Sandfly. Try "all" to scan all hosts.`
        };
      }
      toolArgs.host_ids = [hostId];
    }
    // Otherwise scan all hosts (empty arrays = all)

    console.log(`[Cortex] Triggering Sandfly scan for: ${input.hostname || 'all hosts'}`);
    return await callMCPTool(sandflyMCP, 'sandfly_start_scan', toolArgs, sseWriter);
  } catch (error) {
    console.error('[Cortex] Sandfly trigger_scan error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Query Sandfly documentation via Documentation Master
 */
async function querySandflyDocs(query, sseWriter = null) {
  try {
    const docMasterUrl = 'http://documentation-master.cortex.svc.cluster.local:8080';

    console.log(`[Cortex] Querying Documentation Master for: "${query}"`);

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        query: query,
        filters: {
          product: 'sandfly',
          max_results: 5
        }
      });

      const options = {
        hostname: 'documentation-master.cortex.svc.cluster.local',
        port: 8080,
        path: '/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(responseData);
              resolve({
                success: true,
                output: JSON.stringify(parsed.results || [], null, 2)
              });
            } else {
              // Documentation Master not fully ready yet - return helpful message
              resolve({
                success: true,
                output: JSON.stringify({
                  message: 'Documentation Master is indexing Sandfly documentation. Check back soon for contextual help.',
                  query: query,
                  status: 'indexing'
                }, null, 2)
              });
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        // Documentation Master not available - graceful fallback
        console.warn('[Cortex] Documentation Master not available:', error.message);
        resolve({
          success: true,
          output: JSON.stringify({
            message: 'Documentation Master is not yet available. Sandfly documentation will be accessible once the system completes its first crawl.',
            query: query,
            tip: 'You can still use other Sandfly tools to get alerts, hosts, and processes.'
          }, null, 2)
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: true,
          output: JSON.stringify({
            message: 'Documentation Master query timed out. The service may still be initializing.',
            query: query
          }, null, 2)
        });
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('[Cortex] Documentation Master error:', error.message);
    return {
      success: true,
      output: JSON.stringify({
        message: 'Documentation query failed, but you can still use other Sandfly tools.',
        error: error.message
      }, null, 2)
    };
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

    case 'sandfly_get_alerts':
      return await getSandflyAlerts(input, sseWriter);

    case 'sandfly_get_hosts':
      return await getSandflyHosts(input, sseWriter);

    case 'sandfly_get_processes':
      return await getSandflyProcesses(input, sseWriter);

    case 'sandfly_trigger_scan':
      return await triggerSandflyScan(input, sseWriter);

    case 'sandfly_query_docs':
      return await querySandflyDocs(input.query, sseWriter);

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

  // Enhanced system prompt for pretty responses
  const systemPrompt = `You are Cortex, an AI assistant for infrastructure management.

When responding to queries:
- Use clear section headers with markdown (##)
- Use bullet points for lists
- Use emojis sparingly (only for status: ✅ ❌ ⚠️)
- Format numbers nicely (e.g., "5 pods" not just "5")
- Group related information
- Highlight important items in **bold**
- Use code blocks for technical details
- Keep responses concise but informative

For canned button queries, provide a well-organized summary with:
1. Status overview at top
2. Key metrics
3. Any issues or warnings
4. Detailed breakdown if requested`;

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
      name: 'sandfly_get_alerts',
      description: 'Get security alerts from Sandfly with filtering by severity (critical/high/medium/low), resolved status, or hostname. More efficient than sandfly_query for getting alerts.',
      input_schema: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: 'Filter by alert severity'
          },
          resolved: {
            type: 'boolean',
            description: 'Filter by resolved status (true=resolved, false=active)'
          },
          hostname: {
            type: 'string',
            description: 'Filter by specific hostname'
          },
          limit: {
            type: 'number',
            description: 'Maximum alerts to return (default: 50)'
          }
        },
        required: []
      }
    },
    {
      name: 'sandfly_get_hosts',
      description: 'Get all monitored hosts from Sandfly with optional filtering by status (online/offline) or operating system.',
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['online', 'offline', 'unknown'],
            description: 'Filter by host status'
          },
          os: {
            type: 'string',
            description: 'Filter by operating system'
          },
          limit: {
            type: 'number',
            description: 'Maximum hosts to return (default: 100)'
          }
        },
        required: []
      }
    },
    {
      name: 'sandfly_get_processes',
      description: 'Get running processes for a specific host. Can filter to show only suspicious processes.',
      input_schema: {
        type: 'object',
        properties: {
          hostname: {
            type: 'string',
            description: 'Hostname to query processes for'
          },
          suspicious_only: {
            type: 'boolean',
            description: 'Only return suspicious processes (default: false)'
          },
          limit: {
            type: 'number',
            description: 'Maximum processes to return (default: 100)'
          }
        },
        required: ['hostname']
      }
    },
    {
      name: 'sandfly_trigger_scan',
      description: 'Trigger an on-demand security scan on a specific host or all hosts.',
      input_schema: {
        type: 'object',
        properties: {
          hostname: {
            type: 'string',
            description: 'Hostname to scan (or "all" for all hosts)'
          },
          policy_id: {
            type: 'string',
            description: 'Optional policy ID to use for the scan'
          }
        },
        required: ['hostname']
      }
    },
    {
      name: 'sandfly_query_docs',
      description: 'Query Sandfly documentation via Documentation Master for alert explanations, remediation steps, or best practices. Returns relevant documentation with context.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to search for in Sandfly documentation (e.g., "lateral movement alert remediation")'
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

  // Initial Claude request with error handling (inject system prompt)
  let response;
  try {
    response = await callClaude([{
      role: 'user',
      content: `${systemPrompt}\n\nUser query: ${userQuery}`
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
    const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS) || 50;

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

  // Handle /api/chat POST endpoint for streaming chat with Claude
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { message, sessionId, history = [] } = JSON.parse(body);

        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No message provided' }));
          return;
        }

        console.log(`\n[CortexChat] ========================================`);
        console.log(`[CortexChat] New chat message from session: ${sessionId}`);
        console.log(`[CortexChat] Message: ${message}`);
        console.log(`[CortexChat] History length: ${history.length}`);
        console.log(`[CortexChat] ========================================\n`);

        // Set up SSE streaming
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const sseWriter = (data) => {
          res.write(`data: ${data}\n\n`);
        };

        // Technical system prompt - no superlatives
        const systemPrompt = `You are Cortex, an AI assistant for infrastructure management.

When responding to queries:
- Use clear section headers with markdown (##)
- Use bullet points for lists
- Use emojis sparingly (only for status: ✅ ❌ ⚠️)
- Format numbers appropriately (e.g., "5 pods")
- Group related information
- Highlight important items in **bold**
- Use code blocks for technical details
- Keep responses concise and informative
- Maintain a technical, professional tone

For infrastructure queries:
1. Status overview at top
2. Key metrics
3. Any issues or warnings
4. Detailed breakdown if requested`;

        // Define all available tools including Cortex introspection tools
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
            name: 'sandfly_get_alerts',
            description: 'Get security alerts from Sandfly with filtering by severity (critical/high/medium/low), resolved status, or hostname. More efficient than sandfly_query for getting alerts.',
            input_schema: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  enum: ['critical', 'high', 'medium', 'low'],
                  description: 'Filter by alert severity'
                },
                resolved: {
                  type: 'boolean',
                  description: 'Filter by resolved status (true=resolved, false=active)'
                },
                hostname: {
                  type: 'string',
                  description: 'Filter by specific hostname'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum alerts to return (default: 50)'
                }
              },
              required: []
            }
          },
          {
            name: 'sandfly_get_hosts',
            description: 'Get all monitored hosts from Sandfly with optional filtering by status (online/offline) or operating system.',
            input_schema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['online', 'offline', 'unknown'],
                  description: 'Filter by host status'
                },
                os: {
                  type: 'string',
                  description: 'Filter by operating system'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum hosts to return (default: 100)'
                }
              },
              required: []
            }
          },
          {
            name: 'sandfly_get_processes',
            description: 'Get running processes for a specific host. Can filter to show only suspicious processes.',
            input_schema: {
              type: 'object',
              properties: {
                hostname: {
                  type: 'string',
                  description: 'Hostname to query processes for'
                },
                suspicious_only: {
                  type: 'boolean',
                  description: 'Only return suspicious processes (default: false)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum processes to return (default: 100)'
                }
              },
              required: ['hostname']
            }
          },
          {
            name: 'sandfly_trigger_scan',
            description: 'Trigger an on-demand security scan on a specific host or all hosts.',
            input_schema: {
              type: 'object',
              properties: {
                hostname: {
                  type: 'string',
                  description: 'Hostname to scan (or "all" for all hosts)'
                },
                policy_id: {
                  type: 'string',
                  description: 'Optional policy ID to use for the scan'
                }
              },
              required: ['hostname']
            }
          },
          {
            name: 'sandfly_query_docs',
            description: 'Query Sandfly documentation via Documentation Master for alert explanations, remediation steps, or best practices. Returns relevant documentation with context.',
            input_schema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'What to search for in Sandfly documentation (e.g., "lateral movement alert remediation")'
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
          },
          {
            name: 'cortex_list_agents',
            description: 'List all master and worker agents in the Cortex automation system. Shows agent capabilities, status, and specializations.',
            input_schema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['all', 'masters', 'workers'],
                  description: 'Filter by agent type (default: all)'
                },
                status: {
                  type: 'string',
                  enum: ['all', 'active', 'idle', 'busy'],
                  description: 'Filter by agent status (default: all)'
                }
              },
              required: []
            }
          },
          {
            name: 'cortex_get_tasks',
            description: 'Get current and historical tasks in the Cortex system. Shows task status, priority, and metadata.',
            input_schema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['all', 'queued', 'in_progress', 'completed', 'failed'],
                  description: 'Filter by task status (default: all)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum tasks to return (default: 20)'
                }
              },
              required: []
            }
          },
          {
            name: 'cortex_get_metrics',
            description: 'Get Cortex system metrics and performance data including orchestrator uptime, memory usage, and MCP server status.',
            input_schema: {
              type: 'object',
              properties: {
                time_range: {
                  type: 'string',
                  description: 'Time range for metrics (e.g., "1h", "24h", "7d")'
                }
              },
              required: []
            }
          },
          {
            name: 'cortex_create_task',
            description: 'Create a new task in Cortex for processing by master agents. Use this to delegate work to specialized agents.',
            input_schema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Brief title for the task'
                },
                description: {
                  type: 'string',
                  description: 'Detailed task description'
                },
                category: {
                  type: 'string',
                  enum: ['development', 'security', 'infrastructure', 'inventory', 'general'],
                  description: 'Task category for routing to appropriate master'
                },
                priority: {
                  type: 'string',
                  enum: ['critical', 'high', 'medium', 'low'],
                  description: 'Task priority (default: medium)'
                }
              },
              required: ['title', 'description']
            }
          },
          {
            name: 'cortex_get_task_status',
            description: 'Get detailed status and results for a specific task by task ID.',
            input_schema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'The task ID to query'
                }
              },
              required: ['task_id']
            }
          }
        ];

        // Build conversation messages
        const conversationMessages = [];

        // Add history if provided
        if (history && history.length > 0) {
          conversationMessages.push(...history);
        }

        // Add current user message (WITHOUT system prompt - pass separately)
        conversationMessages.push({
          role: 'user',
          content: message
        });

        // Initial Claude request
        let response;
        try {
          sseWriter(JSON.stringify({
            type: 'processing_start',
            message: 'Processing your query...'
          }));

          response = await callClaude(conversationMessages, tools, sseWriter, 0, systemPrompt);

          console.log(`[CortexChat] Claude response - stop_reason: ${response.stop_reason}`);
        } catch (error) {
          console.error('[CortexChat] Claude API call failed:', error.message);
          sseWriter(JSON.stringify({
            type: 'error',
            error: `Claude API error: ${error.message}`
          }));
          res.end();
          return;
        }

        // Check if response is valid
        if (!response || !response.content) {
          console.error('[CortexChat] Invalid response from Claude:', JSON.stringify(response).substring(0, 500));
          sseWriter(JSON.stringify({
            type: 'error',
            error: 'Invalid response from Claude API'
          }));
          res.end();
          return;
        }

        // Stream initial content
        const textContent = response.content.filter(block => block.type === 'text');
        if (textContent.length > 0) {
          for (const block of textContent) {
            sseWriter(JSON.stringify({
              type: 'content_block_delta',
              delta: { type: 'text', text: block.text }
            }));
          }
        }

        // Check if Claude wants to use tools - multi-turn loop
        let toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length > 0) {
          // Add assistant's response to conversation
          conversationMessages.push({
            role: 'assistant',
            content: response.content
          });

          const allToolsUsed = [];
          let currentResponse = response;
          let iteration = 0;
          const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS) || 50;

          // Multi-turn tool use loop
          while (toolUses.length > 0 && iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[CortexChat] Iteration ${iteration}: Executing ${toolUses.length} tool(s)`);

            // Send progress update via SSE
            sseWriter(JSON.stringify({
              type: 'tool_progress',
              iteration: iteration,
              max_iterations: MAX_ITERATIONS,
              tools: toolUses.map(t => t.name)
            }));

            // Track tools used
            allToolsUsed.push(...toolUses.map(t => t.name));

            // Execute all tools in this turn
            const toolResults = [];
            for (const toolUse of toolUses) {
              // Send individual tool execution update
              sseWriter(JSON.stringify({
                type: 'tool_execution',
                tool_name: toolUse.name,
                tool_id: toolUse.id,
                status: 'executing',
                input: toolUse.input
              }));

              let result;
              // Route Cortex tools to their handlers
              if (toolUse.name === 'cortex_list_agents') {
                result = await handleListAgents(toolUse.input);
                result = { success: true, output: JSON.stringify(result, null, 2) };
              } else if (toolUse.name === 'cortex_get_tasks') {
                result = await handleGetTasks(toolUse.input);
                result = { success: true, output: JSON.stringify(result, null, 2) };
              } else if (toolUse.name === 'cortex_get_metrics') {
                result = await handleGetMetrics(toolUse.input);
                result = { success: true, output: JSON.stringify(result, null, 2) };
              } else if (toolUse.name === 'cortex_create_task') {
                result = await handleCreateTask(toolUse.input);
                result = { success: true, output: JSON.stringify(result, null, 2) };
              } else if (toolUse.name === 'cortex_get_task_status') {
                result = await handleGetTaskStatus(toolUse.input);
                result = { success: true, output: JSON.stringify(result, null, 2) };
              } else {
                // Standard infrastructure tools
                result = await executeTool(toolUse.name, toolUse.input, sseWriter);
              }

              // Send tool completion update
              sseWriter(JSON.stringify({
                type: 'tool_execution',
                tool_name: toolUse.name,
                tool_id: toolUse.id,
                status: result.success ? 'completed' : 'failed',
                error: result.error
              }));

              // Format result for Claude
              let formattedResult;
              if (result.success && result.output) {
                try {
                  const parsed = JSON.parse(result.output);
                  formattedResult = JSON.stringify(parsed, null, 2);
                } catch (e) {
                  formattedResult = result.output;
                }
              } else if (result.partial_summary) {
                formattedResult = JSON.stringify({
                  status: 'partial',
                  error: result.error,
                  partial_data: result.partial_summary
                }, null, 2);
              } else if (result.output) {
                formattedResult = JSON.stringify({
                  status: 'error',
                  error: result.error,
                  output: result.output
                }, null, 2);
              } else {
                formattedResult = JSON.stringify(result);
              }

              console.log(`[CortexChat] Tool result for ${toolUse.name}:`, formattedResult.substring(0, 500));

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: formattedResult
              });
            }

            // Add tool results to conversation
            conversationMessages.push({
              role: 'user',
              content: toolResults
            });

            // Get Claude's next response
            try {
              currentResponse = await callClaude(conversationMessages, tools, sseWriter, 0, systemPrompt);
              console.log(`[CortexChat] Iteration ${iteration} - Claude response - stop_reason: ${currentResponse.stop_reason}`);

              // Stream content from this iteration
              const iterationTextContent = currentResponse.content.filter(block => block.type === 'text');
              if (iterationTextContent.length > 0) {
                for (const block of iterationTextContent) {
                  sseWriter(JSON.stringify({
                    type: 'content_block_delta',
                    delta: { type: 'text', text: block.text }
                  }));
                }
              }

              // Add assistant's response to conversation
              conversationMessages.push({
                role: 'assistant',
                content: currentResponse.content
              });

              // Check for more tool uses
              toolUses = currentResponse.content.filter(block => block.type === 'tool_use');

            } catch (error) {
              console.error(`[CortexChat] Claude API call failed on iteration ${iteration}:`, error.message);
              sseWriter(JSON.stringify({
                type: 'error',
                error: `Error during tool processing: ${error.message}`
              }));
              res.end();
              return;
            }
          }

          if (iteration >= MAX_ITERATIONS) {
            console.warn(`[CortexChat] Max iterations (${MAX_ITERATIONS}) reached`);
            sseWriter(JSON.stringify({
              type: 'warning',
              message: `Reached maximum iteration limit (${MAX_ITERATIONS}). Response may be incomplete.`
            }));
          }
        }

        // Send completion event
        sseWriter(JSON.stringify({
          type: 'message_stop',
          stop_reason: response.stop_reason
        }));

        res.end();

      } catch (error) {
        console.error('[CortexChat] Error:', error);
        try {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
          })}\n\n`);
        } catch (writeError) {
          console.error('[CortexChat] Failed to write error to response:', writeError);
        }
        res.end();
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
