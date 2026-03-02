#!/usr/bin/env node
/**
 * Cortex MCP Server
 *
 * Complete Model Context Protocol server that exposes the entire Cortex
 * construction company as a unified MCP interface.
 *
 * Tier 1: Simple queries (UniFi, Proxmox, Sandfly Security, k8s)
 * Tier 2: Infrastructure management (VMs, containers, pods)
 * Tier 3: Worker swarms (1-10,000 workers)
 * Tier 4: Master coordination (Development, Security, Infrastructure, CICD)
 * Tier 5: Full project builds (e.g., "build 50 microservices in 4 hours")
 * Tier 6: Monitoring & control (status, pause/resume/cancel operations)
 *
 * Protocol: JSON-RPC 2.0 over stdio
 * Spec: https://modelcontextprotocol.io
 */

const readline = require('readline');
const http = require('http');
const tools = require('./tools');
const { shouldForceRoute, getRoutingStats } = require('./moe-router');

// Server configuration
const SERVER_NAME = 'cortex-mcp';
const SERVER_VERSION = '1.0.0';
const CORTEX_HOME = process.env.CORTEX_HOME || '/Users/ryandahlberg/Projects/cortex';
const STATUS_PORT = process.env.STATUS_PORT || 8080;

class MCPServer {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.initialized = false;
    this.requestCount = 0;
    this.startTime = Date.now();
  }

  async start() {
    console.error(`[Cortex MCP] Starting server v${SERVER_VERSION}`);
    console.error(`[Cortex MCP] CORTEX_HOME: ${CORTEX_HOME}`);
    console.error(`[Cortex MCP] Status server on port ${STATUS_PORT}`);

    // Start status HTTP server
    this.startStatusServer();

    this.rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        this.requestCount++;
        const response = await this.handleRequest(request);
        if (response) {
          this.send(response);
        }
      } catch (error) {
        console.error(`[Cortex MCP] Parse error: ${error.message}`);
        this.sendError(null, -32700, 'Parse error', error.message);
      }
    });

    this.rl.on('close', () => {
      console.error('[Cortex MCP] Shutting down');
      process.exit(0);
    });

    console.error('[Cortex MCP] Server ready');
  }

  startStatusServer() {
    const server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'healthy',
          version: SERVER_VERSION,
          uptime: (Date.now() - this.startTime) / 1000,
          requests: this.requestCount
        }));
      } else if (req.url === '/status') {
        try {
          // Get comprehensive status using cortex_get_status tool
          const statusTool = tools.getTool('cortex_get_status');
          const status = await statusTool.execute({ scope: 'all', details: false });

          res.writeHead(200);
          res.end(JSON.stringify({
            server: {
              version: SERVER_VERSION,
              uptime: (Date.now() - this.startTime) / 1000,
              requests: this.requestCount
            },
            cortex: status
          }, null, 2));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      } else if (req.url === '/routing') {
        res.writeHead(200);
        res.end(JSON.stringify(getRoutingStats(), null, 2));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(STATUS_PORT, () => {
      console.error(`[Cortex MCP] Status server listening on http://localhost:${STATUS_PORT}`);
    });
  }

  send(message) {
    console.log(JSON.stringify(message));
  }

  sendError(id, code, message, data = null) {
    const error = { code, message };
    if (data) error.data = data;
    this.send({
      jsonrpc: '2.0',
      id,
      error
    });
  }

  sendResult(id, result) {
    this.send({
      jsonrpc: '2.0',
      id,
      result
    });
  }

  async handleRequest(request) {
    const { id, method, params } = request;

    // Handle notifications (no id)
    if (id === undefined) {
      await this.handleNotification(method, params);
      return null;
    }

    try {
      let result;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;
        case 'tools/list':
          result = await this.handleToolsList();
          break;
        case 'tools/call':
          result = await this.handleToolCall(params);
          break;
        case 'resources/list':
          result = await this.handleResourcesList();
          break;
        case 'resources/read':
          result = await this.handleResourceRead(params);
          break;
        case 'prompts/list':
          result = await this.handlePromptsList();
          break;
        default:
          this.sendError(id, -32601, 'Method not found', `Unknown method: ${method}`);
          return null;
      }

      this.sendResult(id, result);
    } catch (error) {
      console.error(`[Cortex MCP] Error handling ${method}: ${error.message}`);
      this.sendError(id, -32603, 'Internal error', error.message);
    }

    return null;
  }

  async handleNotification(method, params) {
    switch (method) {
      case 'notifications/initialized':
        this.initialized = true;
        console.error('[Cortex MCP] Client initialized');
        break;
      case 'notifications/cancelled':
        console.error('[Cortex MCP] Request cancelled');
        break;
    }
  }

  async handleInitialize(params) {
    console.error(`[Cortex MCP] Initialize request from: ${params?.clientInfo?.name || 'unknown'}`);

    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    };
  }

  async handleToolsList() {
    const toolDefs = tools.getToolDefinitions();
    console.error(`[Cortex MCP] Listing ${toolDefs.length} tools`);

    return {
      tools: toolDefs
    };
  }

  async handleToolCall(params) {
    const { name, arguments: args } = params;

    console.error(`[Cortex MCP] Tool call: ${name}`);

    const tool = tools.getTool(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Check if we should apply MoE routing hints
    if (name === 'cortex_query' && args.query && args.target === 'auto') {
      const routing = shouldForceRoute(args.query);
      if (routing.forceClient) {
        console.error(`[Cortex MCP] MoE forced client: ${routing.forceClient}`);
        args.target = routing.forceClient;
      }
    }

    const result = await tool.execute(args);

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async handleResourcesList() {
    // Resources are read-only access to Cortex data
    return {
      resources: []
    };
  }

  async handleResourceRead(params) {
    const { uri } = params;

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Resources not implemented yet' })
        }
      ]
    };
  }

  async handlePromptsList() {
    return {
      prompts: []
    };
  }
}

// Start server
const server = new MCPServer();
server.start().catch(err => {
  console.error(`[Cortex MCP] Fatal error: ${err.message}`);
  process.exit(1);
});
