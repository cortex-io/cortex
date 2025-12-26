import { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';

/**
 * Single tool that routes everything to Cortex orchestrator
 * Cortex already has kubectl, MCP servers, and all capabilities
 */
export const cortexTool: Tool = {
  name: 'cortex_ask',
  description: `Ask Cortex to perform ANY infrastructure task, security operation, or answer questions. Cortex is an intelligent orchestrator with full administrative access to:

**Security (Sandfly)**:
- Check security alerts and scan results
- List monitored hosts
- Get host forensics (processes, users, network listeners, kernel modules)
- Trigger security scans
- Investigate suspicious activity
- **TAKE ACTION**: Remediate security issues, kill processes, remove users, etc.

**Kubernetes (kubectl)**:
- Query pods, deployments, services, namespaces, logs
- Scale deployments, restart pods
- Apply manifests, update configs
- Debug cluster issues

**Network (UniFi)**:
- Check connected devices and clients
- Monitor network health
- View access points and switches

**Virtual Machines (Proxmox)**:
- List VMs and containers
- Check resource usage
- Start/stop VMs

Cortex can both READ information AND TAKE ACTIONS to resolve issues. Be specific about what you want done.`,
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'What you want Cortex to do or answer. Can be a question ("what pods are running?") or a command ("resolve the security alerts on k3s-worker01")'
      }
    },
    required: ['request']
  }
};
