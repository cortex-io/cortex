# MCP Server + BeeAI Framework Migration Plan for commit-relay

**Created**: 2025-11-14
**Status**: Planning Phase
**Risk Level**: Medium (Hybrid Approach) / High (Full Migration)

## Executive Summary

This document outlines the strategic plan to modernize commit-relay by integrating:

1. **Model Context Protocol (MCP) Servers**: Standardized API layer for AI-tool interaction
2. **BeeAI Framework**: Open-source agent framework from IBM for structured multi-agent systems

**Recommendation**: **Hybrid approach** - MCP servers for API layer, BeeAI for master agents, keep bash workers.

## Current State Analysis

### Technology Stack (Current)

```
commit-relay v1.0
├── Language: 90% Bash, 10% JavaScript (dashboard)
├── Coordination: File-based JSON state
├── Agents: Bash scripts with Claude Code API
├── Tools: Custom bash commands
├── State: coordination/*.json files
└── Communication: File writes + daemon polling
```

### Strengths
- **Fast execution**: Bash is extremely performant
- **Simple**: Easy to understand and debug
- **Proven**: System works well for current use cases
- **Flexible**: Easy to modify and extend

### Limitations
- **No standard API**: Hard to integrate with external tools
- **Limited modularity**: Tight coupling between components
- **State management**: File-based state doesn't scale
- **Tool calling**: Custom implementation, not portable
- **Observability gaps**: Limited tracing and debugging
- **Onboarding**: Bash expertise required

## What is MCP (Model Context Protocol)?

**Source**: https://modelcontextprotocol.io/

**Definition**: Standardized protocol created by Anthropic for connecting AI models to external tools and data sources.

**Core Concepts**:
- **MCP Server**: Exposes tools, resources, and prompts via standardized protocol
- **MCP Client**: AI model or application that connects to servers
- **Transport**: Communication layer (stdio, HTTP, WebSocket)

**Example MCP Server**:
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'task-queue-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {}
  },
});

// Define tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_pending_tasks',
      description: 'Get all pending tasks from queue',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' }
        }
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_pending_tasks') {
    const queue = await readTaskQueue();
    const pending = queue.tasks.filter(t => t.status === 'pending');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(pending.slice(0, args.limit || 10))
      }]
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Benefits for commit-relay**:
1. **Standardization**: Industry-standard protocol, not custom implementation
2. **Portability**: MCP servers work with any MCP client (Claude Desktop, Claude Code, custom apps)
3. **Modularity**: Separate concerns - each server is independent
4. **Reusability**: Servers can be used by multiple agents
5. **Ecosystem**: Growing library of pre-built MCP servers
6. **Tool Validation**: Automatic input schema validation
7. **Discovery**: Tools/resources are self-documenting

## What is BeeAI Framework?

**Source**: https://github.com/i-am-bee/bee-agent-framework

**Definition**: Open-source AI agent framework from IBM Research, built for production multi-agent systems.

**Core Features**:

### 1. Agent Templates
Pre-built agent architectures:
- **BeeAgent**: General-purpose ReAct agent
- **PlanExecuteAgent**: Plans first, then executes
- **ReflectionAgent**: Self-critiques and improves

### 2. Memory Systems
- **UnconstrainedMemory**: Full conversation history
- **SlidingWindowMemory**: Last N messages
- **TokenMemory**: Token-limited context
- **SummarizationMemory**: Automatic summarization

### 3. Tool Ecosystem
Rich set of pre-built tools:
- **Web Search**: DuckDuckGo, Google
- **Code Execution**: Python, JavaScript
- **File Operations**: Read, write, search
- **API Calls**: HTTP requests
- **Database**: SQL queries
- **Git**: Repository operations

### 4. Multi-Agent Coordination
Built-in support for:
- **Agent-to-agent communication**: Structured message passing
- **Task delegation**: Higher-level agents delegate to specialists
- **Shared memory**: Agents can share context
- **Event bus**: Pub/sub between agents

### 5. Observability
Native support for:
- **Tracing**: OpenTelemetry-compatible traces
- **Logging**: Structured logs with context
- **Metrics**: Agent performance metrics
- **Debugging**: Step-through agent execution

**Example BeeAI Agent**:
```typescript
import { BeeAgent } from 'bee-agent-framework/agents/bee';
import { ChatLLM } from 'bee-agent-framework/adapters/anthropic';
import { UnconstrainedMemory } from 'bee-agent-framework/memory/unconstrainedMemory';

const coordinatorMaster = new BeeAgent({
  llm: new ChatLLM({
    modelId: "claude-sonnet-4-5",
  }),
  memory: new UnconstrainedMemory(),
  tools: [
    new TaskQueueTool(),
    new WorkerPoolTool(),
    new MoERouterTool()
  ],
  meta: {
    name: "Coordinator Master",
    description: "Routes tasks to specialist masters using MoE pattern"
  }
});

// Run agent
const response = await coordinatorMaster.run({
  prompt: `
    Task ID: task-123
    Title: Implement user authentication
    Description: Add JWT-based authentication to API

    Route this task to the appropriate specialist master.
  `
});

console.log(response.result.text);
```

**Benefits for commit-relay**:
1. **Structure**: Well-defined agent architecture patterns
2. **Less code**: Framework handles boilerplate (loops, error handling, logging)
3. **Memory management**: Automatic context window management
4. **Tool validation**: Type-safe tool calling
5. **Multi-agent**: Built-in coordination primitives
6. **Testing**: Framework provides testing utilities
7. **Community**: Active development, IBM backing

## Integration Challenges

### 1. Technology Shift (Bash → TypeScript)

**Current**: 90% bash scripts
**Future**: TypeScript agents + bash execution

**Challenge**: Team learning curve, code rewrite cost

**Mitigation**:
- Phase 1: Wrap bash in MCP servers (no rewrite)
- Phase 2: Gradual migration, one component at a time
- Phase 3: Keep bash where it performs better
- Training: TypeScript/BeeAI workshops

**Estimated Effort**: 8-12 weeks for full migration

### 2. State Management Migration

**Current**: File-based JSON state
```
coordination/
├── task-queue.json          # 50-200 tasks
├── worker-specs/active/     # 5-20 workers
├── master-state.json        # Master state
└── memory/                  # MoE knowledge
```

**Future**: BeeAI memory + persistent storage

**Challenge**:
- Migrating existing state to new format
- Maintaining backward compatibility during transition
- Ensuring no data loss

**Migration Strategy**:
```typescript
// State adapter pattern
class TaskQueueAdapter {
  // Read from legacy JSON
  async getLegacyTasks(): Promise<Task[]> {
    const queue = JSON.parse(
      await fs.readFile('coordination/task-queue.json', 'utf8')
    );
    return queue.tasks;
  }

  // Write to both legacy and new format
  async createTask(task: Task): Promise<void> {
    // Write to legacy format (for backward compatibility)
    await this.updateLegacyQueue(task);

    // Write to new BeeAI memory
    await this.agent.memory.add({
      role: 'system',
      content: `Task created: ${JSON.stringify(task)}`
    });
  }
}
```

**Estimated Effort**: 2-3 weeks

### 3. Tool Compatibility

**Current**: Custom bash tools via Claude Code API
- Read/Write/Edit files
- Bash commands
- Git operations
- Task queue manipulation

**Future**: BeeAI tools + MCP servers

**Challenge**: Ensuring feature parity

**Solution**: Create BeeAI tool wrappers for existing bash
```typescript
import { Tool } from 'bee-agent-framework/tools/base';

class BashExecutionTool extends Tool {
  name = 'bash_execute';
  description = 'Execute bash commands (for legacy compatibility)';

  inputSchema() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to execute' }
      },
      required: ['command']
    };
  }

  async _run({ command }: { command: string }) {
    const { execSync } = require('child_process');
    const result = execSync(command, { encoding: 'utf8' });
    return { result };
  }
}
```

**Estimated Effort**: 1-2 weeks

### 4. Performance Overhead

**Current**: Bash execution is extremely fast
- Script startup: <10ms
- File operations: <1ms
- Total task routing: <100ms

**Future**: Node.js + framework overhead
- Node.js startup: ~50-100ms
- Framework initialization: ~20-50ms
- LLM calls: 1-5 seconds
- Total overhead: +100-200ms per operation

**Challenge**: Maintaining sub-second response times

**Mitigation**:
- Keep Node.js processes running (don't restart per operation)
- Cache frequently used data
- Use streaming for LLM responses
- Optimize critical paths
- Consider keeping bash for hot paths

**Benchmark Target**: <500ms for task routing (vs current 100ms)

### 5. Debugging Complexity

**Current**: Bash scripts are easy to debug
- `set -x` shows every command
- Logs are simple text
- Stack traces are straightforward

**Future**: Framework abstraction layers
- Multiple levels of indirection
- Complex async flows
- Framework internals obscure errors

**Mitigation**:
- Use BeeAI's built-in tracing
- Implement comprehensive logging
- Create debugging dashboards
- Document common issues
- Provide debugging tools

**Estimated Effort**: Ongoing

### 6. Dependency Management

**Current**: Minimal dependencies (bash, jq, git, node)
**Future**: npm packages, framework updates, security patches

**Challenge**: Dependency hell, version conflicts, security vulnerabilities

**Mitigation**:
- Pin dependency versions
- Automated security scanning (Dependabot)
- Regular update cycles
- Minimal dependency philosophy

## Proposed Architecture: Hybrid Approach

**Philosophy**: Use the right tool for the job

```
commit-relay v2.0 (Hybrid)
│
├── MCP Servers (NEW)                    # Standard API layer
│   ├── task-queue-mcp/                  # Task CRUD operations
│   │   ├── server.ts                    # MCP server
│   │   └── lib/task-queue.sh            # Wraps existing bash
│   ├── worker-pool-mcp/                 # Worker management
│   ├── git-operations-mcp/              # Git commands
│   ├── observability-mcp/               # Metrics, logs, traces
│   └── governance-mcp/                  # Policy checks
│
├── Masters (NEW - BeeAI)                # High-level coordination
│   ├── coordinator-master.ts            # BeeAgent with MoE routing
│   ├── development-master.ts            # Development specialist
│   ├── security-master.ts               # Security specialist
│   └── inventory-master.ts              # Catalog specialist
│
├── Workers (HYBRID)                     # Task execution
│   ├── worker-agent.ts                  # BeeAgent wrapper
│   └── execution-engine/                # Bash scripts for actual work
│       ├── code-runner.sh
│       ├── implementation-worker.sh
│       └── analysis-worker.sh
│
├── Coordination (KEEP)                  # State storage
│   ├── task-queue.json                  # Legacy format (phase out)
│   ├── state-db/                        # NEW: SQLite or similar
│   └── observability/                   # Telemetry data
│
└── Daemons (KEEP - Bash)                # Background processes
    ├── worker-daemon.sh                 # Fast polling
    ├── task-completion-daemon.sh        # Monitor completions
    └── health-monitor.sh                # System health
```

### Component Decisions

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Masters** | BeeAI Agents | Complex reasoning, multi-agent coordination |
| **MCP Servers** | TypeScript | Standard API, reusable across agents |
| **Workers** | BeeAI wrapper + Bash | Best of both: structure + speed |
| **Daemons** | Bash | Fast, simple, working well |
| **State** | Hybrid (JSON + DB) | Gradual migration, no breaking changes |
| **Observability** | BeeAI + Custom | Built-in tracing + custom metrics |

## Implementation Roadmap

### Phase 1: MCP Server Foundation (Weeks 1-2)

**Goal**: Create MCP servers wrapping existing bash logic

**Deliverables**:
1. `task-queue-mcp` server
2. `worker-pool-mcp` server
3. `git-operations-mcp` server

**Example**: Task Queue MCP Server

```typescript
// mcp-servers/task-queue-mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const COMMIT_RELAY_HOME = process.env.COMMIT_RELAY_HOME || '/Users/ryandahlberg/commit-relay';
const TASK_QUEUE_FILE = path.join(COMMIT_RELAY_HOME, 'coordination/task-queue.json');

const server = new Server(
  {
    name: 'task-queue-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool: Get pending tasks
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_pending_tasks',
      description: 'Get all pending tasks from the task queue',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return',
            default: 10
          }
        }
      }
    },
    {
      name: 'get_task_by_id',
      description: 'Get a specific task by ID',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID' }
        },
        required: ['task_id']
      }
    },
    {
      name: 'create_task',
      description: 'Create a new task in the queue',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Task priority',
            default: 'medium'
          },
          type: {
            type: 'string',
            enum: ['development', 'security', 'inventory', 'investigation'],
            description: 'Task type'
          }
        },
        required: ['title', 'description']
      }
    },
    {
      name: 'update_task_status',
      description: 'Update the status of a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'assigned', 'worker_spawned', 'in_progress', 'completed', 'failed']
          }
        },
        required: ['task_id', 'status']
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_pending_tasks') {
      const queue = JSON.parse(await fs.readFile(TASK_QUEUE_FILE, 'utf8'));
      const pending = queue.tasks.filter(t => t.status === 'pending');
      const limited = pending.slice(0, args.limit || 10);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(limited, null, 2)
        }]
      };
    }

    if (name === 'get_task_by_id') {
      const queue = JSON.parse(await fs.readFile(TASK_QUEUE_FILE, 'utf8'));
      const task = queue.tasks.find(t => t.id === args.task_id);

      if (!task) {
        throw new Error(`Task not found: ${args.task_id}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(task, null, 2)
        }]
      };
    }

    if (name === 'create_task') {
      // Use existing bash script
      const createScript = path.join(COMMIT_RELAY_HOME, 'scripts/create-task.sh');
      const taskId = execSync(
        `"${createScript}" "${args.title}" "${args.description}" "${args.priority || 'medium'}" "${args.type || 'development'}"`,
        { encoding: 'utf8', cwd: COMMIT_RELAY_HOME }
      ).trim();

      return {
        content: [{
          type: 'text',
          text: `Task created successfully: ${taskId}`
        }]
      };
    }

    if (name === 'update_task_status') {
      const queue = JSON.parse(await fs.readFile(TASK_QUEUE_FILE, 'utf8'));
      const task = queue.tasks.find(t => t.id === args.task_id);

      if (!task) {
        throw new Error(`Task not found: ${args.task_id}`);
      }

      task.status = args.status;
      task.updated_at = new Date().toISOString();

      await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(queue, null, 2));

      return {
        content: [{
          type: 'text',
          text: `Task ${args.task_id} status updated to: ${args.status}`
        }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
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

// Resources: Expose task queue as a resource
server.setRequestHandler('resources/list', async () => ({
  resources: [
    {
      uri: 'task-queue://all',
      name: 'All Tasks',
      description: 'Complete task queue',
      mimeType: 'application/json'
    },
    {
      uri: 'task-queue://pending',
      name: 'Pending Tasks',
      description: 'Tasks waiting to be assigned',
      mimeType: 'application/json'
    }
  ]
}));

server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  const queue = JSON.parse(await fs.readFile(TASK_QUEUE_FILE, 'utf8'));

  if (uri === 'task-queue://all') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(queue.tasks, null, 2)
      }]
    };
  }

  if (uri === 'task-queue://pending') {
    const pending = queue.tasks.filter(t => t.status === 'pending');
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(pending, null, 2)
      }]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Task Queue MCP Server running on stdio');
```

**Package.json**:
```json
{
  "name": "task-queue-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "bin": {
    "task-queue-mcp": "./server.ts"
  }
}
```

**Testing**:
```bash
# Install MCP CLI tool
npm install -g @modelcontextprotocol/inspector

# Test server
npx @modelcontextprotocol/inspector mcp-servers/task-queue-mcp/server.ts
```

**Success Criteria**:
- [ ] 3 MCP servers operational
- [ ] All existing bash functionality accessible via MCP
- [ ] Tests pass
- [ ] Documentation complete

### Phase 2: BeeAI Master Prototype (Weeks 3-4)

**Goal**: Convert coordinator-master to BeeAI agent

**Deliverables**:
1. Coordinator master as BeeAgent
2. MCP tool adapters for BeeAI
3. Side-by-side comparison with bash version

**Example**: Coordinator Master as BeeAI Agent

```typescript
// agents/masters/coordinator-master.ts
import { BeeAgent } from 'bee-agent-framework/agents/bee';
import { OllamaChatLLM } from 'bee-agent-framework/adapters/ollama';
import { UnconstrainedMemory } from 'bee-agent-framework/memory/unconstrainedMemory';
import { createMCPTool } from '../lib/mcp-tool-adapter';
import { readFile, writeFile } from 'fs/promises';

const COMMIT_RELAY_HOME = process.env.COMMIT_RELAY_HOME || '/Users/ryandahlberg/commit-relay';

// Create MCP-backed tools
const taskQueueTool = await createMCPTool('task-queue-server');
const workerPoolTool = await createMCPTool('worker-pool-server');
const observabilityTool = await createMCPTool('observability-server');

// Initialize coordinator master agent
const coordinatorMaster = new BeeAgent({
  llm: new OllamaChatLLM({
    modelId: "claude-sonnet-4-5",
    config: {
      temperature: 0.7,
    }
  }),
  memory: new UnconstrainedMemory(),
  tools: [
    taskQueueTool,
    workerPoolTool,
    observabilityTool
  ],
  meta: {
    name: "Coordinator Master",
    description: "Routes tasks to specialist masters using Mixture of Experts (MoE) pattern"
  }
});

// MoE routing function
async function routeTaskWithMoE(taskId: string) {
  // Load task
  const task = await taskQueueTool.execute({
    tool: 'get_task_by_id',
    arguments: { task_id: taskId }
  });

  // Load routing knowledge
  const routingKnowledge = await readFile(
    `${COMMIT_RELAY_HOME}/coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`,
    'utf8'
  );

  // Prepare MoE prompt
  const moePrompt = `
You are the Coordinator Master for commit-relay, responsible for routing tasks to specialist masters.

# Specialist Masters

1. **Development Master**: Handles code implementation, refactoring, feature development
2. **Security Master**: Handles vulnerability scanning, security audits, CVE remediation
3. **Inventory Master**: Handles repository cataloging, documentation, dependency tracking

# Current Task

${JSON.stringify(JSON.parse(task), null, 2)}

# Historical Routing Decisions (for learning)

${routingKnowledge.split('\n').slice(-50).join('\n')}

# Your Task

Analyze this task and determine which specialist master should handle it.
Use the Mixture of Experts (MoE) routing strategy:

1. **Single Expert (High Confidence)**: Route to one master if clearly in their domain
2. **Dual Expert (Collaborative)**: Route to two masters for cross-domain tasks
3. **Multi-Expert (Consensus)**: Route to all masters for complex, ambiguous tasks

Return your routing decision in this format:
{
  "strategy": "single_expert_high_confidence" | "dual_expert_collaborative" | "multi_expert_consensus",
  "experts": ["development" | "security" | "inventory"],
  "confidence": 0.0-1.0,
  "reasoning": "Why this routing decision"
}
`;

  // Run agent
  const response = await coordinatorMaster.run({
    prompt: moePrompt
  });

  // Parse routing decision
  const decision = JSON.parse(response.result.text);

  // Log routing decision
  const routingRecord = {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    strategy: decision.strategy,
    experts: decision.experts,
    confidence: decision.confidence,
    reasoning: decision.reasoning
  };

  await writeFile(
    `${COMMIT_RELAY_HOME}/coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`,
    JSON.stringify(routingRecord) + '\n',
    { flag: 'a' }
  );

  // Emit observability event
  await observabilityTool.execute({
    tool: 'emit_event',
    arguments: {
      event_type: 'moe_routing_decision',
      service: 'coordinator-master',
      details: routingRecord
    }
  });

  return decision;
}

// Main loop
async function main() {
  console.log('Coordinator Master (BeeAI) starting...');

  while (true) {
    try {
      // Get pending tasks
      const pendingTasks = await taskQueueTool.execute({
        tool: 'get_pending_tasks',
        arguments: { limit: 1 }
      });

      const tasks = JSON.parse(pendingTasks);

      if (tasks.length > 0) {
        const task = tasks[0];
        console.log(`Routing task: ${task.id}`);

        // Route with MoE
        const decision = await routeTaskWithMoE(task.id);

        console.log(`Routed to: ${decision.experts.join(', ')} (${decision.strategy}, confidence: ${decision.confidence})`);

        // Hand off to specialist masters
        for (const expert of decision.experts) {
          await createHandoff(task.id, expert, decision);
        }

        // Update task status
        await taskQueueTool.execute({
          tool: 'update_task_status',
          arguments: {
            task_id: task.id,
            status: 'assigned'
          }
        });
      }

      // Sleep
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    } catch (error) {
      console.error('Coordinator error:', error);
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds on error
    }
  }
}

async function createHandoff(taskId: string, expert: string, decision: any) {
  const handoff = {
    task_id: taskId,
    assigned_to: expert,
    strategy: decision.strategy,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    created_at: new Date().toISOString()
  };

  await writeFile(
    `${COMMIT_RELAY_HOME}/coordination/masters/coordinator/handoffs/to-${expert}-${taskId}.json`,
    JSON.stringify(handoff, null, 2)
  );
}

// MCP Tool Adapter
// agents/lib/mcp-tool-adapter.ts
async function createMCPTool(serverName: string) {
  // Simplified MCP tool adapter for BeeAI
  return {
    async execute({ tool, arguments: args }: { tool: string, arguments: any }) {
      // Call MCP server via subprocess
      const { spawn } = require('child_process');

      const mcpServer = spawn('node', [
        `${COMMIT_RELAY_HOME}/mcp-servers/${serverName}/server.ts`
      ]);

      // Send MCP request
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args
        }
      };

      mcpServer.stdin.write(JSON.stringify(request) + '\n');

      // Read response
      return new Promise((resolve, reject) => {
        mcpServer.stdout.on('data', (data) => {
          const response = JSON.parse(data.toString());
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result.content[0].text);
          }
        });

        mcpServer.stderr.on('data', (data) => {
          console.error(`MCP Server Error: ${data}`);
        });
      });
    }
  };
}

// Run
main().catch(console.error);
```

**Success Criteria**:
- [ ] Coordinator master runs as BeeAI agent
- [ ] MoE routing decisions match bash version quality
- [ ] Performance within acceptable range (<5 seconds per routing)
- [ ] Observability integration working

### Phase 3: Side-by-Side Testing (Week 5)

**Goal**: Run BeeAI and bash masters in parallel, compare results

**Approach**:
1. Duplicate task queue
2. Route same tasks through both systems
3. Compare routing decisions
4. Measure performance
5. Identify gaps

**Metrics**:
| Metric | Bash | BeeAI | Target |
|--------|------|-------|--------|
| Routing Time | 100ms | TBD | <500ms |
| Memory Usage | 50MB | TBD | <200MB |
| CPU Usage | 5% | TBD | <20% |
| Routing Accuracy | Baseline | TBD | >=Baseline |

**Success Criteria**:
- [ ] BeeAI routing quality >= bash
- [ ] Performance acceptable
- [ ] No major bugs
- [ ] Team comfortable with new system

### Phase 4: Gradual Rollout (Weeks 6-8)

**Goal**: Replace bash masters with BeeAI incrementally

**Schedule**:
- Week 6: Coordinator master (lowest risk)
- Week 7: Development master + Security master
- Week 8: Inventory master + monitoring

**Rollback Plan**:
- Keep bash scripts intact
- Feature flag to switch between implementations
- Automated tests to catch regressions

**Success Criteria**:
- [ ] All masters migrated to BeeAI
- [ ] System stability maintained
- [ ] No increase in failure rates
- [ ] Performance acceptable

### Phase 5: Worker Hybrid Approach (Weeks 9-10)

**Goal**: Create BeeAI wrapper for workers, keep bash execution engine

**Architecture**:
```typescript
// agents/workers/worker-agent.ts
import { BeeAgent } from 'bee-agent-framework/agents/bee';
import { execSync } from 'child_process';

const worker = new BeeAgent({
  llm: new OllamaChatLLM({ modelId: "claude-sonnet-4-5" }),
  memory: new SlidingWindowMemory({ size: 10 }),
  tools: [
    new BashExecutionTool(),      // Execute bash scripts
    new FileOperationsTool(),     // File read/write
    new GitOperationsTool(),      // Git commands via MCP
  ]
});

// Worker still executes bash for heavy lifting
async function executeTask(taskId: string) {
  const task = await loadTask(taskId);

  // BeeAI agent plans the work
  const plan = await worker.run({
    prompt: `Plan how to complete this task: ${task.description}`
  });

  // Execute plan using existing bash scripts
  const result = execSync(
    `./agents/workers/execution-engine/implementation-worker.sh "${taskId}"`,
    { encoding: 'utf8' }
  );

  return result;
}
```

**Benefits**:
- Structured planning (BeeAI)
- Fast execution (bash)
- Best of both worlds

**Success Criteria**:
- [ ] Workers use BeeAI for planning
- [ ] Bash execution engine remains
- [ ] Performance maintained
- [ ] Task completion rates unchanged

## Risk Assessment

### High Risk Items

1. **Performance degradation**: Node.js overhead
   - **Mitigation**: Keep critical paths in bash
   - **Monitoring**: Benchmark continuously

2. **State migration bugs**: Data loss during transition
   - **Mitigation**: Dual-write strategy, extensive testing
   - **Backup**: Daily backups, rollback capability

3. **Framework lock-in**: BeeAI dependency
   - **Mitigation**: Abstraction layer, exit strategy
   - **Alternative**: Can fall back to bash

### Medium Risk Items

1. **Learning curve**: Team adaptation to TypeScript/BeeAI
   - **Mitigation**: Training, documentation, pair programming

2. **Debugging complexity**: Framework abstractions
   - **Mitigation**: Comprehensive logging, debugging tools

3. **Dependency management**: npm ecosystem
   - **Mitigation**: Dependabot, version pinning, minimal deps

### Low Risk Items

1. **MCP server issues**: Protocol changes
   - **Mitigation**: Pin SDK version, monitor updates

2. **Tool compatibility**: Missing features in BeeAI
   - **Mitigation**: Custom tool development, bash fallback

## Success Metrics

### Technical Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **MTTR** | Unknown | <15 min | Time to fix issues |
| **Code Reduction** | Baseline | -20% | Lines of code |
| **Test Coverage** | 0% | 70% | Unit + integration tests |
| **API Standardization** | 0% | 100% | All tools via MCP |
| **Observability** | 30% | 90% | Traces, metrics, logs |

### Business Metrics

| Metric | Current | Target |
|--------|---------|--------|
| **Worker Success Rate** | 70% | 85% |
| **Task Completion Time** | 45 min | 35 min |
| **System Uptime** | 95% | 99% |
| **Onboarding Time** | 1 week | 2 days |

## Decision Points

### Week 2: Continue with MCP?
- **If YES**: Proceed to BeeAI prototype
- **If NO**: Keep bash, improve existing system

### Week 5: Adopt BeeAI?
- **If YES**: Full migration to BeeAI masters
- **If NO**: Use MCP servers, keep bash agents

### Week 8: Migrate Workers?
- **If YES**: Hybrid BeeAI wrapper approach
- **IF NO**: Keep pure bash workers

## Cost-Benefit Analysis

### Costs

**Development Time**: 8-10 weeks
**Team Learning**: 2-3 weeks
**Risk**: Medium (hybrid approach mitigates)
**Ongoing Maintenance**: Similar to bash

### Benefits

**Short-term** (Months 1-3):
- Standardized API (MCP)
- Better debugging (BeeAI tracing)
- Easier testing (framework support)

**Medium-term** (Months 3-6):
- Faster development (less boilerplate)
- Better coordination (multi-agent primitives)
- Improved observability

**Long-term** (6+ months):
- Easier onboarding (TypeScript vs bash)
- Community ecosystem (MCP servers, BeeAI tools)
- Future-proof architecture

## Conclusion

**Recommendation**: Proceed with **hybrid approach**

1. **Phase 1**: Build MCP servers (low risk, high value)
2. **Phase 2**: Prototype BeeAI master (prove value)
3. **Phase 3**: Evaluate and decide on full migration
4. **Keep bash where it performs better** (daemons, workers)

This approach:
- Minimizes risk (incremental migration)
- Maximizes learning (evaluate each phase)
- Provides exit strategy (can revert)
- Balances innovation with stability

**Next Steps**:
1. Review this plan with team
2. Begin Phase 1 (MCP servers) if approved
3. Re-evaluate after each phase
4. Adjust based on learnings

## References

- **MCP Protocol**: https://modelcontextprotocol.io/
- **BeeAI Framework**: https://github.com/i-am-bee/bee-agent-framework
- **BeeAI Docs**: https://i-am-bee.github.io/bee-agent-framework/
- **MCP SDK**: https://github.com/anthropics/modelcontextprotocol/tree/main/packages/sdk
- **Example MCP Servers**: https://github.com/modelcontextprotocol/servers

## Appendix A: MCP Server List (Planned)

1. **task-queue-mcp**: Task CRUD operations
2. **worker-pool-mcp**: Worker lifecycle management
3. **git-operations-mcp**: Git commands (clone, commit, push, etc.)
4. **observability-mcp**: Metrics, logs, traces
5. **governance-mcp**: Policy checks, compliance validation
6. **file-operations-mcp**: File read/write/search
7. **moe-routing-mcp**: MoE routing logic
8. **knowledge-base-mcp**: Access to routing decisions, patterns

## Appendix B: BeeAI Agent List (Planned)

1. **Coordinator Master**: MoE routing
2. **Development Master**: Development task handling
3. **Security Master**: Security task handling
4. **Inventory Master**: Catalog task handling
5. **Worker Agent** (wrapper): Task execution planning

## Appendix C: Comparison Matrix

| Aspect | Current (Bash) | MCP Only | BeeAI Full | Hybrid (Recommended) |
|--------|---------------|----------|------------|---------------------|
| **API Standardization** | ❌ Custom | ✅ MCP | ✅ MCP | ✅ MCP |
| **Multi-Agent Coordination** | ⚠️ File-based | ⚠️ File-based | ✅ Built-in | ✅ Built-in (masters) |
| **Performance** | ✅ Excellent | ✅ Good | ⚠️ Medium | ✅ Good |
| **Debugging** | ✅ Simple | ✅ Good | ⚠️ Complex | ✅ Moderate |
| **Code Volume** | ⚠️ High | ✅ Reduced | ✅ Minimal | ✅ Reduced |
| **Learning Curve** | ✅ Low | ⚠️ Medium | ❌ High | ⚠️ Medium |
| **Observability** | ⚠️ Custom | ✅ Good | ✅ Excellent | ✅ Excellent |
| **Maintenance** | ⚠️ Manual | ✅ Framework | ✅ Framework | ✅ Framework |
| **Risk** | ✅ Low | ✅ Low | ❌ High | ✅ Medium |
| **Time to Implement** | N/A | 2 weeks | 10 weeks | 8 weeks |

✅ = Strong positive
⚠️ = Moderate/Mixed
❌ = Negative
