const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = process.env.PORT || 8000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
async function queryProxmox(query) {
  try {
    const queryLower = query.toLowerCase();
    const proxmoxMCP = MCP_SERVERS.proxmox;

    // Use MCP server /query endpoint for now
    // TODO: Map to specific Proxmox MCP tools when needed
    console.log(`[Cortex] Proxmox query via MCP: "${query}"`);

    return await queryMCPServer(proxmoxMCP, query);
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
 * Query UniFi API with intelligent routing
 */
async function queryUnifi(query) {
  try {
    const queryLower = query.toLowerCase();
    const unifiMCP = MCP_SERVERS.unifi;

    // Use MCP server /query endpoint for now
    // TODO: Map to specific UniFi MCP tools when needed
    console.log(`[Cortex] UniFi query via MCP: "${query}"`);

    return await queryMCPServer(unifiMCP, query);
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
 * Call Anthropic Claude API
 */
async function callClaude(messages, tools) {
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
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse Claude response: ${error.message}`));
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
async function querySandfly(query) {
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
    return await callMCPTool(sandflyMCP, toolName, toolArgs);

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
 * Query MCP server
 */
async function queryMCPServer(serverUrl, query) {
  return new Promise((resolve, reject) => {
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

    req.on('error', (error) => {
      console.error(`[Cortex] MCP server error (${serverUrl}):`, error.message);
      resolve({ success: false, error: error.message });
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
 * Call specific MCP tool via /call-tool endpoint
 */
async function callMCPTool(serverUrl, toolName, arguments) {
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

    req.on('error', (error) => {
      console.error(`[Cortex] MCP tool call error (${serverUrl}/${toolName}):`, error.message);
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'MCP tool call timeout' });
    });

    req.write(data);
    req.end();
  });
}

/**
 * Execute tool call from Claude
 */
async function executeTool(toolName, input) {
  console.log(`[Cortex] Executing tool: ${toolName}`, JSON.stringify(input));

  switch (toolName) {
    case 'kubectl':
      return await executeKubectl(input.command);

    case 'unifi_query':
      // Use direct API instead of MCP wrapper
      return await queryUnifi(input.query);

    case 'sandfly_query':
      return await querySandfly(input.query);

    case 'proxmox_query':
      // Use direct API instead of MCP wrapper
      return await queryProxmox(input.query);

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Process user query with Claude
 */
async function processUserQuery(userQuery) {
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
      name: 'unifi_query',
      description: 'Query UniFi network controller for network status, connected devices, access points, WiFi clients, network health, and performance metrics.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What information to get from UniFi (e.g., "get network status and connected devices")'
          }
        },
        required: ['query']
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

  // Initial Claude request
  const response = await callClaude([{
    role: 'user',
    content: userQuery
  }], tools);

  console.log(`[Cortex] Claude response - stop_reason: ${response.stop_reason}`);

  // Check if Claude wants to use tools
  const toolUses = response.content.filter(block => block.type === 'tool_use');

  if (toolUses.length > 0) {
    console.log(`[Cortex] Executing ${toolUses.length} tool(s)`);

    // Execute all tools
    const toolResults = [];
    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      });
    }

    // Get Claude's final answer with tool results
    const finalResponse = await callClaude([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    ], tools);

    console.log(`[Cortex] Final response - stop_reason: ${finalResponse.stop_reason}`);

    // Check if response is valid
    if (!finalResponse || !finalResponse.content) {
      console.error('[Cortex] Invalid final response from Claude:', JSON.stringify(finalResponse).substring(0, 500));
      return {
        answer: 'Error: Invalid response from Claude API',
        tools_used: toolUses.map(t => t.name),
        raw_response: finalResponse
      };
    }

    // Extract text answer
    const textBlock = finalResponse.content.find(b => b.type === 'text');
    return {
      answer: textBlock?.text || 'No response from Claude',
      tools_used: toolUses.map(t => t.name),
      raw_response: finalResponse
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

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      intelligence: ANTHROPIC_API_KEY ? 'enabled' : 'disabled'
    }));
    return;
  }

  // Main API endpoint
  if (req.url === '/api/tasks' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const query = data.payload?.query || data.query || '';

        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No query provided' }));
          return;
        }

        console.log(`\n[CortexAPI] ========================================`);
        console.log(`[CortexAPI] Received query: ${query}`);
        console.log(`[CortexAPI] ========================================\n`);

        const result = await processUserQuery(query);

        console.log(`\n[CortexAPI] ========================================`);
        console.log(`[CortexAPI] Returning answer to chat app`);
        console.log(`[CortexAPI] ========================================\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: data.id,
          status: 'completed',
          result: result
        }));
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

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('============================================================');
  console.log('Cortex Intelligent Orchestrator');
  console.log('============================================================');
  console.log(`Listening on port ${PORT}`);
  console.log(`Intelligence: ${ANTHROPIC_API_KEY ? 'ENABLED ✓' : 'DISABLED ✗'}`);
  console.log('\nDirect API Integrations:');
  console.log(`  Sandfly API:  ${SANDFLY_CONFIG.baseUrl}`);
  console.log(`  Proxmox API:  ${PROXMOX_CONFIG.baseUrl}`);
  console.log(`  UniFi API:    ${UNIFI_CONFIG.baseUrl} (${UNIFI_CONFIG.isUDM ? 'UDM Pro' : 'Standard'})`);
  console.log(`  Kubernetes:   kubectl (native)`);
  console.log('\nEndpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /api/tasks - Process intelligent queries');
  console.log('============================================================');
});
