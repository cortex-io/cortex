import { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';

/**
 * Tool for creating tasks in Cortex
 * OPTIMIZED for parallel submission - call multiple times in one turn
 */
export const cortexCreateTaskTool: Tool = {
  name: 'cortex_create_task',
  description: `Create a new task in Cortex for processing by master agents. This tool is OPTIMIZED for parallel submission - you can call it multiple times in a single turn to create many tasks simultaneously. Returns immediately with task ID; tasks are processed asynchronously.

Use this when the user wants to:
- Deploy infrastructure changes
- Set up new services
- Run parallel operations
- Queue work for later processing

Categories route to specialized master agents:
- development: Code changes, features, bug fixes
- security: Security scans, compliance, threat analysis
- infrastructure: Deployments, monitoring, configuration
- inventory: Asset discovery, dependency mapping
- cicd: Build pipelines, testing, deployments
- general: Other tasks`,
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Brief title of the task (required)'
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done (required)'
      },
      category: {
        type: 'string',
        enum: ['development', 'security', 'infrastructure', 'inventory', 'cicd', 'general'],
        description: 'Task category - routes to appropriate master agent'
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Task priority level (default: medium)'
      },
      metadata: {
        type: 'object',
        description: 'Optional additional metadata'
      }
    },
    required: ['title', 'description']
  }
};

/**
 * Tool for checking task status
 */
export const cortexGetTaskStatusTool: Tool = {
  name: 'cortex_get_task_status',
  description: 'Check the status of a previously created Cortex task using its task_id. Returns current status, progress, and results if completed.',
  input_schema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'The task ID returned from cortex_create_task'
      }
    },
    required: ['task_id']
  }
};

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
