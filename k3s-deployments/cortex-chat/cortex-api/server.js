const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = process.env.PORT || 8000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// MCP Server endpoints
const MCP_SERVERS = {
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

let sandflyToken = null;
let sandflyTokenExpiry = null;

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
    const token = await getSandflyToken();
    const queryLower = query.toLowerCase();

    // Parse query and determine endpoint
    let endpoint = '/v4/hosts?summary=true';  // Default
    let method = 'GET';
    let body = null;

    // Security alerts and results
    if (queryLower.includes('alert') || queryLower.includes('result') ||
        queryLower.includes('security') || queryLower.includes('threat') ||
        queryLower.includes('violation') || queryLower.includes('critical')) {
      endpoint = '/v4/results?sort=-created_at&limit=100';
    }
    // Hosts
    else if (queryLower.includes('host') || queryLower.includes('node') ||
             queryLower.includes('server')) {
      endpoint = '/v4/hosts?summary=true';
    }
    // Forensics - processes
    else if (queryLower.includes('process')) {
      endpoint = '/v4/forensics/processes';
    }
    // Forensics - users
    else if (queryLower.includes('user') || queryLower.includes('account')) {
      endpoint = '/v4/forensics/users';
    }
    // Forensics - network
    else if (queryLower.includes('listen') || queryLower.includes('network') ||
             queryLower.includes('port') || queryLower.includes('connection')) {
      endpoint = '/v4/forensics/listeners';
    }
    // Forensics - services
    else if (queryLower.includes('service') || queryLower.includes('systemd')) {
      endpoint = '/v4/forensics/services';
    }
    // Forensics - scheduled tasks
    else if (queryLower.includes('cron') || queryLower.includes('scheduled') ||
             queryLower.includes('task')) {
      endpoint = '/v4/forensics/scheduled_tasks';
    }
    // Forensics - kernel modules
    else if (queryLower.includes('kernel') || queryLower.includes('module') ||
             queryLower.includes('driver')) {
      endpoint = '/v4/forensics/kernel_modules';
    }
    // Scanning
    else if (queryLower.includes('scan')) {
      if (queryLower.includes('start') || queryLower.includes('run') ||
          queryLower.includes('trigger') || queryLower.includes('initiate')) {
        endpoint = '/v4/scans';
        method = 'POST';
        body = JSON.stringify({ all: true });
      } else {
        endpoint = '/v4/scans';
      }
    }

    console.log(`[Cortex] Sandfly query: "${query}" -> ${method} ${endpoint}`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: SANDFLY_CONFIG.host,
        port: 443,
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
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
        console.error('[Cortex] Sandfly API error:', error.message);
        resolve({ success: false, error: error.message });
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  } catch (error) {
    console.error('[Cortex] Sandfly auth error:', error.message);
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
 * Execute tool call from Claude
 */
async function executeTool(toolName, input) {
  console.log(`[Cortex] Executing tool: ${toolName}`, JSON.stringify(input));

  switch (toolName) {
    case 'kubectl':
      return await executeKubectl(input.command);

    case 'unifi_query':
      return await queryMCPServer(MCP_SERVERS.unifi, input.query);

    case 'sandfly_query':
      return await querySandfly(input.query);

    case 'proxmox_query':
      return await queryMCPServer(MCP_SERVERS.proxmox, input.query);

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

    // Extract text answer
    const textBlock = finalResponse.content.find(b => b.type === 'text');
    return {
      answer: textBlock?.text || 'No response from Claude',
      tools_used: toolUses.map(t => t.name),
      raw_response: finalResponse
    };
  }

  // No tools used, return direct answer
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
  console.log('\nIntegrations:');
  console.log(`  UniFi MCP:    ${MCP_SERVERS.unifi}`);
  console.log(`  Sandfly API:  ${SANDFLY_CONFIG.baseUrl}`);
  console.log(`  Proxmox MCP:  ${MCP_SERVERS.proxmox}`);
  console.log('\nEndpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /api/tasks - Process intelligent queries');
  console.log('============================================================');
});
