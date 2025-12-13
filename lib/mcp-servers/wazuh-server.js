#!/usr/bin/env node

/**
 * Wazuh MCP Server
 *
 * Provides Cortex integration with Wazuh SIEM for security monitoring,
 * agent management, and threat detection.
 *
 * Capabilities:
 * - Query security alerts and events
 * - Manage Wazuh agents
 * - Monitor vulnerabilities and compliance
 * - Trigger security scans
 * - Analyze threat intelligence
 * - Coordinate security exercises
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Configuration
const WAZUH_API_URL = process.env.WAZUH_API_URL || 'https://10.88.140.202';
const WAZUH_API_USER = process.env.WAZUH_API_USER || 'wazuh-api';
const WAZUH_API_PASSWORD = process.env.WAZUH_API_PASSWORD || '';

class WazuhMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'wazuh-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        },
      }
    );

    this.token = null;
    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async authenticate() {
    if (this.token) return this.token;

    try {
      const response = await axios.post(
        `${WAZUH_API_URL}/security/user/authenticate`,
        {},
        {
          auth: {
            username: WAZUH_API_USER,
            password: WAZUH_API_PASSWORD
          },
          httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false })
        }
      );

      this.token = response.data.data.token;
      return this.token;
    } catch (error) {
      throw new Error(`Wazuh authentication failed: ${error.message}`);
    }
  }

  async wazuhRequest(endpoint, method = 'GET', data = null) {
    const token = await this.authenticate();

    const config = {
      method,
      url: `${WAZUH_API_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false })
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      throw new Error(`Wazuh API error: ${error.response?.data?.detail || error.message}`);
    }
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_agents',
          description: 'List all Wazuh agents with their status. Returns agent information including ID, name, IP, OS, version, and connection status.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                description: 'Filter by agent status (active, disconnected, never_connected, pending)',
                enum: ['active', 'disconnected', 'never_connected', 'pending']
              },
              limit: {
                type: 'number',
                description: 'Maximum number of agents to return',
                default: 100
              }
            }
          }
        },
        {
          name: 'get_agent_details',
          description: 'Get detailed information about a specific Wazuh agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID (e.g., "001") or "000" for manager',
                required: true
              }
            },
            required: ['agent_id']
          }
        },
        {
          name: 'get_alerts',
          description: 'Query security alerts from Wazuh. Filter by time range, agent, rule level, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Filter alerts by agent ID'
              },
              rule_level: {
                type: 'number',
                description: 'Minimum rule level (0-15, higher = more severe)',
                minimum: 0,
                maximum: 15
              },
              time_range: {
                type: 'string',
                description: 'Time range for alerts (e.g., "1h", "24h", "7d")',
                default: '24h'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of alerts to return',
                default: 50
              },
              search: {
                type: 'string',
                description: 'Search term to filter alerts'
              }
            }
          }
        },
        {
          name: 'get_vulnerabilities',
          description: 'Get vulnerability scan results for agents. Shows CVEs and security issues.',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID to check vulnerabilities for'
              },
              severity: {
                type: 'string',
                description: 'Filter by severity level',
                enum: ['Critical', 'High', 'Medium', 'Low']
              },
              limit: {
                type: 'number',
                description: 'Maximum number of vulnerabilities to return',
                default: 100
              }
            }
          }
        },
        {
          name: 'get_sca_results',
          description: 'Get Security Configuration Assessment (SCA) results. Shows compliance and security hardening status.',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID to check SCA for',
                required: true
              },
              policy_id: {
                type: 'string',
                description: 'Specific policy ID to check'
              }
            },
            required: ['agent_id']
          }
        },
        {
          name: 'search_rules',
          description: 'Search Wazuh detection rules by keyword, ID, or level',
          inputSchema: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
                description: 'Search term (rule description, ID, or keyword)'
              },
              rule_id: {
                type: 'string',
                description: 'Specific rule ID to retrieve'
              },
              level: {
                type: 'number',
                description: 'Filter by rule level',
                minimum: 0,
                maximum: 15
              },
              limit: {
                type: 'number',
                description: 'Maximum number of rules to return',
                default: 50
              }
            }
          }
        },
        {
          name: 'get_agent_stats',
          description: 'Get statistics and metrics for Wazuh agents',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID to get stats for'
              }
            }
          }
        },
        {
          name: 'restart_agent',
          description: 'Restart a Wazuh agent remotely',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Agent ID to restart',
                required: true
              }
            },
            required: ['agent_id']
          }
        },
        {
          name: 'get_sentinel_forge_status',
          description: 'Get status of all Sentinel Forge Kali VMs (red/blue/purple/green teams)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'analyze_security_events',
          description: 'Analyze recent security events and provide threat intelligence summary',
          inputSchema: {
            type: 'object',
            properties: {
              time_range: {
                type: 'string',
                description: 'Time range to analyze (e.g., "1h", "24h")',
                default: '24h'
              },
              min_severity: {
                type: 'number',
                description: 'Minimum severity level to analyze',
                default: 7
              }
            }
          }
        }
      ]
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'wazuh://agents',
          name: 'Wazuh Agents',
          description: 'List of all Wazuh agents',
          mimeType: 'application/json'
        },
        {
          uri: 'wazuh://alerts/recent',
          name: 'Recent Alerts',
          description: 'Recent security alerts from Wazuh',
          mimeType: 'application/json'
        },
        {
          uri: 'wazuh://sentinel-forge',
          name: 'Sentinel Forge Status',
          description: 'Status of all Sentinel Forge Kali VMs',
          mimeType: 'application/json'
        }
      ]
    }));

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === 'wazuh://agents') {
        const data = await this.wazuhRequest('/agents');
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data.data, null, 2)
          }]
        };
      }

      if (uri === 'wazuh://alerts/recent') {
        const data = await this.wazuhRequest('/security/alerts?limit=50');
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data.data, null, 2)
          }]
        };
      }

      if (uri === 'wazuh://sentinel-forge') {
        const agents = await this.wazuhRequest('/agents?search=sentinel-forge');
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(agents.data, null, 2)
          }]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_agents': {
            let endpoint = '/agents';
            const params = new URLSearchParams();
            if (args.status) params.append('status', args.status);
            if (args.limit) params.append('limit', args.limit);
            if (params.toString()) endpoint += `?${params}`;

            const data = await this.wazuhRequest(endpoint);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'get_agent_details': {
            const data = await this.wazuhRequest(`/agents/${args.agent_id}`);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'get_alerts': {
            let endpoint = '/security/alerts';
            const params = new URLSearchParams();
            if (args.agent_id) params.append('agent.id', args.agent_id);
            if (args.rule_level) params.append('rule.level', args.rule_level);
            if (args.limit) params.append('limit', args.limit);
            if (args.search) params.append('q', args.search);
            if (params.toString()) endpoint += `?${params}`;

            const data = await this.wazuhRequest(endpoint);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'get_vulnerabilities': {
            let endpoint = '/vulnerability';
            const params = new URLSearchParams();
            if (args.agent_id) params.append('agent_id', args.agent_id);
            if (args.severity) params.append('severity', args.severity);
            if (args.limit) params.append('limit', args.limit);
            if (params.toString()) endpoint += `?${params}`;

            const data = await this.wazuhRequest(endpoint);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'get_sca_results': {
            const data = await this.wazuhRequest(`/sca/${args.agent_id}`);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'search_rules': {
            let endpoint = '/rules';
            const params = new URLSearchParams();
            if (args.search) params.append('search', args.search);
            if (args.rule_id) params.append('rule_ids', args.rule_id);
            if (args.level) params.append('level', args.level);
            if (args.limit) params.append('limit', args.limit);
            if (params.toString()) endpoint += `?${params}`;

            const data = await this.wazuhRequest(endpoint);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data.data, null, 2)
              }]
            };
          }

          case 'get_agent_stats': {
            const statsData = await this.wazuhRequest('/agents/stats');
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(statsData.data, null, 2)
              }]
            };
          }

          case 'restart_agent': {
            const data = await this.wazuhRequest(`/agents/${args.agent_id}/restart`, 'PUT');
            return {
              content: [{
                type: 'text',
                text: `Agent ${args.agent_id} restart initiated: ${JSON.stringify(data.data)}`
              }]
            };
          }

          case 'get_sentinel_forge_status': {
            // Get all agents with 'sentinel-forge' in the name
            const agents = await this.wazuhRequest('/agents?search=sentinel-forge');

            const summary = {
              total_agents: agents.data.affected_items?.length || 0,
              agents: agents.data.affected_items?.map(agent => ({
                id: agent.id,
                name: agent.name,
                ip: agent.ip,
                status: agent.status,
                os: agent.os?.name,
                version: agent.version,
                last_keep_alive: agent.lastKeepAlive,
                node_name: agent.node_name
              })) || []
            };

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(summary, null, 2)
              }]
            };
          }

          case 'analyze_security_events': {
            // Get recent high-severity alerts
            const alerts = await this.wazuhRequest(
              `/security/alerts?limit=100&rule.level>=${args.min_severity || 7}`
            );

            const analysis = {
              time_range: args.time_range || '24h',
              total_alerts: alerts.data.affected_items?.length || 0,
              severity_distribution: {},
              top_rules: {},
              affected_agents: new Set()
            };

            // Analyze alerts
            alerts.data.affected_items?.forEach(alert => {
              const level = alert.rule?.level || 0;
              const ruleId = alert.rule?.id;
              const agentId = alert.agent?.id;

              // Count by severity
              analysis.severity_distribution[level] = (analysis.severity_distribution[level] || 0) + 1;

              // Count by rule
              if (ruleId) {
                if (!analysis.top_rules[ruleId]) {
                  analysis.top_rules[ruleId] = {
                    count: 0,
                    description: alert.rule?.description,
                    level: level
                  };
                }
                analysis.top_rules[ruleId].count++;
              }

              // Track affected agents
              if (agentId) analysis.affected_agents.add(agentId);
            });

            analysis.affected_agents = Array.from(analysis.affected_agents);
            analysis.top_rules = Object.entries(analysis.top_rules)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 10)
              .reduce((obj, [id, data]) => ({ ...obj, [id]: data }), {});

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(analysis, null, 2)
              }]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Wazuh MCP Server running on stdio');
  }
}

const server = new WazuhMCPServer();
server.run().catch(console.error);
