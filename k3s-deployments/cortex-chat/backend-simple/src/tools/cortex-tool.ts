import { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';

/**
 * Single tool that routes everything to Cortex orchestrator
 * Cortex already has kubectl, MCP servers, and all capabilities
 */
export const cortexTool: Tool = {
  name: 'cortex_ask',
  description: 'Ask Cortex to perform any infrastructure task or answer questions about the k8s cluster, deployments, pods, services, logs, UniFi network, Proxmox VMs, security alerts, or any system management. Cortex has full kubectl access and all administrative capabilities.',
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'What you want Cortex to do or answer'
      }
    },
    required: ['request']
  }
};
