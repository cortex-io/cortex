# Agentstudio Management Platform Implementation for commit-relay

## Executive Summary

Based on Boomi's "Agentstudio" concept of managing agentic workflows for hyperproductivity while maintaining responsibility, this document outlines how to implement a centralized agent management platform for commit-relay.

**Core Principles**:
1. **Hyperproductivity**: Maximize agent output while minimizing overhead
2. **Responsible AI**: Ensure governance, safety, and accountability
3. **Lifecycle Management**: Manage agents from creation to retirement
4. **Observability**: Full visibility into agent behavior and performance
5. **Self-Service**: Enable masters to create and deploy agents independently

**Current Gap**: commit-relay has autonomous agents but lacks centralized management tooling for lifecycle, monitoring, and governance.

---

## What is an Agentstudio?

An **Agentstudio** is a comprehensive platform for managing the entire lifecycle of AI agents:

### Agent Lifecycle Stages
```
Design → Build → Test → Deploy → Monitor → Optimize → Retire
   ↓        ↓       ↓       ↓         ↓         ↓         ↓
 Templates Code  Validate Register  Track   Improve  Archive
```

### Core Capabilities
1. **Agent Design Studio**: Visual/code-based agent creation
2. **Template Library**: Reusable agent patterns
3. **Testing Framework**: Validate agents before deployment
4. **Deployment Automation**: Consistent, reliable agent launches
5. **Performance Monitoring**: Real-time agent health and metrics
6. **Governance Controls**: Policies, permissions, audit trails
7. **Optimization Engine**: Continuous improvement recommendations

---

## Current State: commit-relay Agent Management

### Existing Components
```
Scripts/
├── spawn-worker.sh              # Manual worker creation
├── claude-worker-launcher-v2.sh # Launch automation
├── worker-daemon.sh             # Basic monitoring
└── task-completion-daemon.sh    # Completion tracking

Coordination/
├── worker-specs/               # Worker definitions
├── task-queue.json            # Task assignments
└── masters/                   # Master agents
```

### Current Limitations
❌ **No Visual Interface**: All agent management via shell scripts
❌ **No Testing Framework**: Agents deployed without validation
❌ **Limited Observability**: Basic logs, no structured metrics
❌ **Manual Lifecycle**: No automated deployment pipelines
❌ **No Template System**: Each worker built from scratch
❌ **Minimal Governance**: No policy enforcement engine
❌ **No Optimization**: Manual performance tuning required

---

## Agentstudio Implementation Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Agentstudio UI                        │
│  (Dashboard for Agent Management)                       │
└──────────────────┬──────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌────────┐   ┌────────┐   ┌────────────┐
│Designer│   │Registry│   │  Monitor   │
│ Studio │   │ & Deploy│  │ & Optimize │
└────────┘   └────────┘   └────────────┘
    │              │              │
    └──────────────┼──────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  Governance      │
         │  Policy Engine   │
         └──────────────────┘
```

---

## Phase 1: Agent Registry & Catalog (Weeks 1-2)

**Goal**: Centralized repository of all agent definitions, templates, and deployed instances

### 1.1 Agent Registry Schema

Create `coordination/agentstudio/registry/schema.json`:

```json
{
  "version": "1.0.0",
  "registry": {
    "agent_definitions": {
      "description": "Master definitions for agent types",
      "storage": "coordination/agentstudio/registry/definitions/",
      "schema": {
        "agent_id": "string (unique identifier)",
        "agent_name": "string (human-readable name)",
        "agent_type": "enum [worker, master, daemon, code-runner]",
        "version": "semver (1.0.0)",
        "description": "string",
        "capabilities": "array of strings",
        "dependencies": "array of service names",
        "prompt_template": "file path to template",
        "config_schema": "JSON schema for configuration",
        "created_by": "string (master or user)",
        "created_at": "ISO 8601 timestamp",
        "status": "enum [draft, active, deprecated, retired]"
      }
    },
    "agent_instances": {
      "description": "Running agent instances",
      "storage": "coordination/worker-specs/active/",
      "schema": {
        "instance_id": "string (worker-id)",
        "agent_definition_id": "string (references definition)",
        "task_id": "string",
        "status": "enum [spawning, running, completed, failed]",
        "started_at": "ISO 8601 timestamp",
        "completed_at": "ISO 8601 timestamp (optional)",
        "resource_usage": {
          "cpu_time": "seconds",
          "memory_peak": "MB",
          "api_calls": "count"
        },
        "performance_metrics": {
          "task_completion_time": "minutes",
          "success_rate": "percentage",
          "quality_score": "0.0-1.0"
        }
      }
    },
    "agent_templates": {
      "description": "Reusable agent patterns",
      "storage": "agents/templates/",
      "categories": [
        "code-generation",
        "code-review",
        "security-scanning",
        "documentation",
        "testing",
        "refactoring",
        "investigation"
      ]
    }
  }
}
```

### 1.2 Registry Manager

Create `coordination/agentstudio/registry/manager.sh`:

```bash
#!/bin/bash
# Agent Registry Manager
set -euo pipefail

REGISTRY_HOME="${COMMIT_RELAY_HOME}/coordination/agentstudio/registry"
DEFINITIONS_DIR="${REGISTRY_HOME}/definitions"
INSTANCES_DIR="${COMMIT_RELAY_HOME}/coordination/worker-specs"
TEMPLATES_DIR="${COMMIT_RELAY_HOME}/agents/templates"

mkdir -p "${DEFINITIONS_DIR}" "${TEMPLATES_DIR}"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] REGISTRY: $1"
}

# Register new agent definition
register_agent_definition() {
    local agent_name="$1"
    local agent_type="$2"
    local description="$3"
    local prompt_template="$4"
    local created_by="${5:-system}"

    local agent_id="agent-$(echo "$agent_name" | tr '[:upper:] ' '[:lower:]-')-$(date +%s)"

    local definition=$(jq -n \
        --arg id "$agent_id" \
        --arg name "$agent_name" \
        --arg type "$agent_type" \
        --arg desc "$description" \
        --arg template "$prompt_template" \
        --arg creator "$created_by" \
        '{
            agent_id: $id,
            agent_name: $name,
            agent_type: $type,
            version: "1.0.0",
            description: $desc,
            capabilities: [],
            dependencies: [],
            prompt_template: $template,
            config_schema: {},
            created_by: $creator,
            created_at: (now | todate),
            status: "active",
            deployment_count: 0,
            success_rate: 0.0
        }')

    echo "$definition" > "${DEFINITIONS_DIR}/${agent_id}.json"

    log "Registered agent definition: ${agent_id}"
    echo "$agent_id"
}

# List all agent definitions
list_definitions() {
    local filter="${1:-active}"

    log "Listing agent definitions (filter: ${filter})"

    find "${DEFINITIONS_DIR}" -name "*.json" -exec jq -c \
        --arg filter "$filter" \
        'select(.status == $filter or $filter == "all")' {} \;
}

# Get agent definition by ID
get_definition() {
    local agent_id="$1"

    local def_file="${DEFINITIONS_DIR}/${agent_id}.json"

    if [ ! -f "$def_file" ]; then
        echo "ERROR: Agent definition not found: ${agent_id}" >&2
        return 1
    fi

    cat "$def_file"
}

# Register agent instance (worker deployment)
register_instance() {
    local worker_id="$1"
    local agent_definition_id="$2"
    local task_id="$3"

    # Update instance count in definition
    local def_file="${DEFINITIONS_DIR}/${agent_definition_id}.json"

    if [ -f "$def_file" ]; then
        local updated=$(jq '.deployment_count += 1' "$def_file")
        echo "$updated" > "$def_file"
    fi

    # Create instance record
    local instance_file="${INSTANCES_DIR}/active/${worker_id}.json"

    if [ -f "$instance_file" ]; then
        # Add agent_definition_id to existing worker spec
        jq --arg def_id "$agent_definition_id" \
            '.agent_definition_id = $def_id' \
            "$instance_file" > "${instance_file}.tmp" && \
            mv "${instance_file}.tmp" "$instance_file"

        log "Linked instance ${worker_id} to definition ${agent_definition_id}"
    fi
}

# Update instance metrics
update_instance_metrics() {
    local worker_id="$1"
    local metrics_json="$2"

    local instance_file="${INSTANCES_DIR}/active/${worker_id}.json"

    if [ -f "$instance_file" ]; then
        jq --argjson metrics "$metrics_json" \
            '.performance_metrics = $metrics' \
            "$instance_file" > "${instance_file}.tmp" && \
            mv "${instance_file}.tmp" "$instance_file"

        log "Updated metrics for instance ${worker_id}"
    fi
}

# Get instances for agent definition
get_instances() {
    local agent_definition_id="$1"
    local status_filter="${2:-all}"

    find "${INSTANCES_DIR}/active" -name "*.json" -exec jq -c \
        --arg def_id "$agent_definition_id" \
        --arg status "$status_filter" \
        'select(.agent_definition_id == $def_id) | select(.status == $status or $status == "all")' {} \;
}

# Generate agent definition from template
create_from_template() {
    local template_name="$1"
    local agent_name="$2"
    local customizations="${3:-{}}"

    local template_file="${TEMPLATES_DIR}/${template_name}.json"

    if [ ! -f "$template_file" ]; then
        echo "ERROR: Template not found: ${template_name}" >&2
        return 1
    fi

    # Merge template with customizations
    local definition=$(jq -s \
        --arg name "$agent_name" \
        '.[0] * .[1] | .agent_name = $name' \
        "$template_file" \
        <(echo "$customizations"))

    # Register new definition
    local agent_id=$(register_agent_definition \
        "$agent_name" \
        "$(echo "$definition" | jq -r '.agent_type')" \
        "$(echo "$definition" | jq -r '.description')" \
        "$(echo "$definition" | jq -r '.prompt_template')" \
        "template:${template_name}")

    log "Created agent from template ${template_name}: ${agent_id}"
    echo "$agent_id"
}

# Main CLI
case "${1:-help}" in
    register)
        register_agent_definition "$2" "$3" "$4" "$5" "${6:-system}"
        ;;
    list)
        list_definitions "${2:-active}"
        ;;
    get)
        get_definition "$2"
        ;;
    register-instance)
        register_instance "$2" "$3" "$4"
        ;;
    update-metrics)
        update_instance_metrics "$2" "$3"
        ;;
    get-instances)
        get_instances "$2" "${3:-all}"
        ;;
    from-template)
        create_from_template "$2" "$3" "${4:-{}}"
        ;;
    *)
        echo "Usage: $0 {register|list|get|register-instance|update-metrics|get-instances|from-template}"
        echo ""
        echo "Examples:"
        echo "  $0 register 'Security Scanner' worker 'Scans code for vulnerabilities' agents/prompts/security-scanner.md"
        echo "  $0 list active"
        echo "  $0 get agent-security-scanner-1234567890"
        echo "  $0 register-instance dev-worker-ABC123 agent-security-scanner-1234567890 task-456"
        echo "  $0 from-template code-review-template 'PR Reviewer'"
        ;;
esac
```

### 1.3 Agent Templates

Create reusable templates in `agents/templates/`:

**Code Review Template** (`agents/templates/code-review-template.json`):
```json
{
  "agent_type": "worker",
  "description": "Reviews code changes for quality, security, and best practices",
  "capabilities": [
    "static_code_analysis",
    "security_scanning",
    "style_checking",
    "complexity_analysis"
  ],
  "dependencies": ["code-runner", "security-master"],
  "prompt_template": "agents/prompts/code-review-worker.md",
  "config_schema": {
    "type": "object",
    "properties": {
      "languages": {
        "type": "array",
        "items": {"type": "string"},
        "default": ["bash", "javascript", "python"]
      },
      "severity_threshold": {
        "type": "string",
        "enum": ["low", "medium", "high", "critical"],
        "default": "medium"
      },
      "auto_fix": {
        "type": "boolean",
        "default": false
      }
    }
  },
  "default_config": {
    "languages": ["bash", "javascript", "python"],
    "severity_threshold": "medium",
    "auto_fix": false
  }
}
```

---

## Phase 2: Agent Designer Studio (Weeks 3-4)

**Goal**: Self-service agent creation interface integrated with dashboard

### 2.1 Designer API Endpoints

Add to `dashboard/server/index.js`:

```javascript
// Agent Registry API
app.get('/api/agentstudio/definitions', (req, res) => {
  const { status = 'active' } = req.query;

  exec(`${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh list ${status}`,
    (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({ error: stderr });
      } else {
        const definitions = stdout.trim().split('\n')
          .filter(line => line)
          .map(line => JSON.parse(line));
        res.json(definitions);
      }
    }
  );
});

app.get('/api/agentstudio/definitions/:agentId', (req, res) => {
  const { agentId } = req.params;

  exec(`${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh get ${agentId}`,
    (error, stdout, stderr) => {
      if (error) {
        res.status(404).json({ error: 'Agent definition not found' });
      } else {
        res.json(JSON.parse(stdout));
      }
    }
  );
});

app.post('/api/agentstudio/definitions', (req, res) => {
  const { agent_name, agent_type, description, prompt_template, created_by = 'dashboard-user' } = req.body;

  if (!agent_name || !agent_type || !description || !prompt_template) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cmd = `${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh register "${agent_name}" "${agent_type}" "${description}" "${prompt_template}" "${created_by}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: stderr });
    } else {
      const agentId = stdout.trim();
      res.status(201).json({ agent_id: agentId, message: 'Agent definition created' });
    }
  });
});

app.post('/api/agentstudio/definitions/:agentId/deploy', (req, res) => {
  const { agentId } = req.params;
  const { task_id, config = {} } = req.body;

  if (!task_id) {
    return res.status(400).json({ error: 'task_id required' });
  }

  // Get agent definition
  exec(`${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh get ${agentId}`,
    (error, stdout, stderr) => {
      if (error) {
        return res.status(404).json({ error: 'Agent definition not found' });
      }

      const definition = JSON.parse(stdout);

      // Deploy worker using agent definition
      const deployCmd = `${COMMIT_RELAY_HOME}/scripts/spawn-worker.sh ${task_id} ${definition.agent_type}`;

      exec(deployCmd, (deployError, deployStdout, deployStderr) => {
        if (deployError) {
          res.status(500).json({ error: deployStderr });
        } else {
          const workerId = deployStdout.trim().match(/dev-worker-[A-Z0-9]+/)?.[0];

          if (workerId) {
            // Register instance
            exec(`${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh register-instance ${workerId} ${agentId} ${task_id}`,
              (regError) => {
                if (regError) {
                  console.error('Failed to register instance:', regError);
                }
              }
            );
          }

          res.json({
            message: 'Agent deployed successfully',
            worker_id: workerId,
            agent_id: agentId
          });
        }
      });
    }
  );
});

app.get('/api/agentstudio/instances', (req, res) => {
  const instances = readJSONFromDir(`${COMMIT_RELAY_HOME}/coordination/worker-specs/active`);
  res.json(instances.filter(inst => inst.agent_definition_id));
});

app.get('/api/agentstudio/templates', (req, res) => {
  const templates = readJSONFromDir(`${COMMIT_RELAY_HOME}/agents/templates`);
  res.json(templates);
});

app.post('/api/agentstudio/from-template', (req, res) => {
  const { template_name, agent_name, customizations = {} } = req.body;

  if (!template_name || !agent_name) {
    return res.status(400).json({ error: 'template_name and agent_name required' });
  }

  const cmd = `${COMMIT_RELAY_HOME}/coordination/agentstudio/registry/manager.sh from-template "${template_name}" "${agent_name}" '${JSON.stringify(customizations)}'`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: stderr });
    } else {
      const agentId = stdout.trim();
      res.status(201).json({ agent_id: agentId, message: 'Agent created from template' });
    }
  });
});

// Helper function
function readJSONFromDir(dir) {
  try {
    const files = require('fs').readdirSync(dir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(require('fs').readFileSync(`${dir}/${f}`, 'utf8'));
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}
```

### 2.2 Designer UI Components

Create React components in `dashboard/src/components/Agentstudio/`:

**AgentList.jsx**:
```jsx
import React, { useEffect, useState } from 'react';

export function AgentList() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agentstudio/definitions')
      .then(res => res.json())
      .then(data => {
        setAgents(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading agents...</div>;

  return (
    <div className="agent-list">
      <h2>Agent Definitions</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Version</th>
            <th>Deployments</th>
            <th>Success Rate</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.agent_id}>
              <td>{agent.agent_name}</td>
              <td>{agent.agent_type}</td>
              <td>{agent.version}</td>
              <td>{agent.deployment_count || 0}</td>
              <td>{((agent.success_rate || 0) * 100).toFixed(1)}%</td>
              <td>
                <span className={`status-badge status-${agent.status}`}>
                  {agent.status}
                </span>
              </td>
              <td>
                <button onClick={() => deployAgent(agent.agent_id)}>
                  Deploy
                </button>
                <button onClick={() => viewDetails(agent.agent_id)}>
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  function deployAgent(agentId) {
    const taskId = prompt('Enter task ID:');
    if (!taskId) return;

    fetch(`/api/agentstudio/definitions/${agentId}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId })
    })
      .then(res => res.json())
      .then(data => {
        alert(`Agent deployed: ${data.worker_id}`);
      });
  }

  function viewDetails(agentId) {
    window.location.href = `/agentstudio/agents/${agentId}`;
  }
}
```

**AgentDesigner.jsx**:
```jsx
import React, { useState } from 'react';

export function AgentDesigner() {
  const [formData, setFormData] = useState({
    agent_name: '',
    agent_type: 'worker',
    description: '',
    prompt_template: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    fetch('/api/agentstudio/definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })
      .then(res => res.json())
      .then(data => {
        alert(`Agent created: ${data.agent_id}`);
        window.location.href = '/agentstudio/agents';
      })
      .catch(err => {
        alert('Error creating agent: ' + err.message);
      });
  };

  return (
    <div className="agent-designer">
      <h2>Design New Agent</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Agent Name</label>
          <input
            type="text"
            value={formData.agent_name}
            onChange={e => setFormData({...formData, agent_name: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Agent Type</label>
          <select
            value={formData.agent_type}
            onChange={e => setFormData({...formData, agent_type: e.target.value})}
          >
            <option value="worker">Worker</option>
            <option value="master">Master</option>
            <option value="daemon">Daemon</option>
            <option value="code-runner">Code Runner</option>
          </select>
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Prompt Template Path</label>
          <input
            type="text"
            value={formData.prompt_template}
            onChange={e => setFormData({...formData, prompt_template: e.target.value})}
            placeholder="agents/prompts/my-agent.md"
            required
          />
        </div>

        <button type="submit">Create Agent Definition</button>
      </form>
    </div>
  );
}
```

---

## Phase 3: Testing & Validation Framework (Week 5)

**Goal**: Validate agents before production deployment

### 3.1 Agent Test Runner

Create `coordination/agentstudio/testing/test-runner.sh`:

```bash
#!/bin/bash
# Agent Testing Framework
set -euo pipefail

TEST_DIR="${COMMIT_RELAY_HOME}/coordination/agentstudio/testing"
TEST_RESULTS_DIR="${TEST_DIR}/results"

mkdir -p "${TEST_RESULTS_DIR}"

# Run test suite for agent
test_agent() {
    local agent_id="$1"
    local test_mode="${2:-smoke}"  # smoke, integration, performance

    log "Running ${test_mode} tests for agent ${agent_id}"

    case "$test_mode" in
        smoke)
            run_smoke_tests "$agent_id"
            ;;
        integration)
            run_integration_tests "$agent_id"
            ;;
        performance)
            run_performance_tests "$agent_id"
            ;;
        all)
            run_smoke_tests "$agent_id" && \
            run_integration_tests "$agent_id" && \
            run_performance_tests "$agent_id"
            ;;
    esac
}

# Smoke tests: basic functionality
run_smoke_tests() {
    local agent_id="$1"

    # Get agent definition
    local definition=$(./coordination/agentstudio/registry/manager.sh get "$agent_id")

    # Test 1: Prompt template exists
    local prompt_template=$(echo "$definition" | jq -r '.prompt_template')

    if [ ! -f "$prompt_template" ]; then
        log "❌ FAIL: Prompt template not found: ${prompt_template}"
        return 1
    fi

    log "✓ Prompt template exists"

    # Test 2: Template is valid markdown
    if ! grep -q "^#" "$prompt_template"; then
        log "❌ FAIL: Prompt template appears invalid"
        return 1
    fi

    log "✓ Prompt template is valid"

    # Test 3: Dependencies available
    local deps=$(echo "$definition" | jq -r '.dependencies[]?')

    while IFS= read -r dep; do
        if ! command -v "$dep" >/dev/null 2>&1; then
            log "⚠️  WARNING: Dependency not found: ${dep}"
        fi
    done <<< "$deps"

    log "✓ Smoke tests passed for ${agent_id}"
}

# Integration tests: deploy and run with test task
run_integration_tests() {
    local agent_id="$1"

    # Create test task
    local test_task_id="test-task-$(date +%s)"

    jq --arg id "$test_task_id" \
       '.tasks += [{
           "id": $id,
           "title": "Integration test task",
           "description": "This is a test task for agent validation",
           "priority": "low",
           "status": "pending",
           "type": "test",
           "created_at": (now | todate)
       }]' /Users/ryandahlberg/commit-relay/coordination/task-queue.json > /tmp/task-queue-test.json && \
    mv /tmp/task-queue-test.json /Users/ryandahlberg/commit-relay/coordination/task-queue.json

    # Deploy agent for test task
    local definition=$(./coordination/agentstudio/registry/manager.sh get "$agent_id")
    local agent_type=$(echo "$definition" | jq -r '.agent_type')

    ./scripts/spawn-worker.sh "$test_task_id" "$agent_type"

    # Wait for completion (timeout 5 minutes)
    local timeout=300
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        local task_status=$(jq -r --arg id "$test_task_id" '.tasks[] | select(.id == $id) | .status' \
            /Users/ryandahlberg/commit-relay/coordination/task-queue.json)

        if [ "$task_status" = "completed" ]; then
            log "✓ Integration test passed: agent completed task"
            return 0
        elif [ "$task_status" = "failed" ]; then
            log "❌ Integration test failed: agent failed task"
            return 1
        fi

        sleep 10
        elapsed=$((elapsed + 10))
    done

    log "❌ Integration test failed: timeout"
    return 1
}

# Performance tests: measure resource usage
run_performance_tests() {
    local agent_id="$1"

    # Similar to integration but measure metrics
    log "⏱️  Performance testing not yet implemented"
}

# Main CLI
test_agent "$1" "${2:-smoke}"
```

---

## Phase 4: Hyperproductivity Features (Week 6)

**Goal**: Maximize agent output through automation and optimization

### 4.1 Auto-Scaling Agent Pool

Create `coordination/agentstudio/autoscaler.sh`:

```bash
#!/bin/bash
# Auto-scaling based on task queue depth
set -euo pipefail

# Scale workers based on queue metrics
autoscale() {
    local pending_count=$(jq '[.tasks[] | select(.status == "pending")] | length' \
        /Users/ryandahlberg/commit-relay/coordination/task-queue.json)

    local active_workers=$(ls -1 /Users/ryandahlberg/commit-relay/coordination/worker-specs/active/*.json 2>/dev/null | wc -l | tr -d ' ')

    local target_capacity=$(calculate_target_capacity "$pending_count" "$active_workers")

    if [ "$target_capacity" -gt "$active_workers" ]; then
        scale_up $((target_capacity - active_workers))
    elif [ "$target_capacity" -lt "$active_workers" ]; then
        scale_down $((active_workers - target_capacity))
    fi
}

calculate_target_capacity() {
    local pending="$1"
    local current="$2"

    # Scale formula: 1 worker per 3 pending tasks, max 20 workers
    local target=$((pending / 3))
    [ "$target" -lt 1 ] && target=1
    [ "$target" -gt 20 ] && target=20

    echo "$target"
}

scale_up() {
    local count="$1"
    log "Scaling up: launching ${count} new workers"

    # Launch workers for pending tasks
    # Implementation depends on specific strategy
}

scale_down() {
    local count="$1"
    log "Scaling down: retiring ${count} idle workers"

    # Mark idle workers for retirement
    # Implementation depends on specific strategy
}

# Run autoscaler in loop
while true; do
    autoscale
    sleep 60  # Check every minute
done
```

### 4.2 Agent Performance Optimizer

Create `coordination/agentstudio/optimizer.sh`:

```bash
#!/bin/bash
# Analyzes agent performance and suggests optimizations
set -euo pipefail

analyze_agent_performance() {
    local agent_id="$1"

    # Get all instances for this agent
    local instances=$(./coordination/agentstudio/registry/manager.sh get-instances "$agent_id" "completed")

    # Calculate aggregate metrics
    local total_time=0
    local total_success=0
    local total_count=0

    while IFS= read -r instance; do
        local completion_time=$(echo "$instance" | jq -r '.performance_metrics.task_completion_time // 0')
        local success=$(echo "$instance" | jq -r '.status == "completed" and .performance_metrics.success_rate > 0.7')

        total_time=$((total_time + completion_time))
        [ "$success" = "true" ] && total_success=$((total_success + 1))
        total_count=$((total_count + 1))
    done <<< "$instances"

    # Generate recommendations
    local avg_time=$((total_time / total_count))
    local success_rate=$(echo "scale=2; ($total_success * 100) / $total_count" | bc)

    echo "Agent Performance Report: ${agent_id}"
    echo "  Deployments: ${total_count}"
    echo "  Avg Completion Time: ${avg_time} minutes"
    echo "  Success Rate: ${success_rate}%"
    echo ""

    # Recommendations
    if [ "$avg_time" -gt 60 ]; then
        echo "⚠️  Recommendation: Agent is slow (avg ${avg_time}min). Consider optimization."
    fi

    if (( $(echo "$success_rate < 70" | bc -l) )); then
        echo "⚠️  Recommendation: Low success rate (${success_rate}%). Review prompt template."
    fi
}

# Main CLI
analyze_agent_performance "$1"
```

---

## Phase 5: Responsible AI Governance (Week 7)

**Goal**: Ensure agents operate safely, ethically, and compliantly

### 5.1 Agent Policy Engine

Create `coordination/agentstudio/governance/policy-engine.sh`:

```bash
#!/bin/bash
# Enforces governance policies on agent deployments
set -euo pipefail

POLICIES_DIR="${COMMIT_RELAY_HOME}/coordination/agentstudio/governance/policies"

# Evaluate agent against all policies before deployment
evaluate_policies() {
    local agent_id="$1"
    local context="${2:-{}}"

    log "Evaluating policies for agent ${agent_id}"

    # Load all active policies
    local violations=()

    for policy_file in "${POLICIES_DIR}"/*.json; do
        [ -f "$policy_file" ] || continue

        local policy_name=$(basename "$policy_file" .json)
        local policy=$(cat "$policy_file")

        if ! evaluate_policy "$agent_id" "$policy" "$context"; then
            violations+=("$policy_name")
        fi
    done

    if [ ${#violations[@]} -gt 0 ]; then
        log "❌ Policy violations: ${violations[*]}"
        return 1
    fi

    log "✓ All policies passed"
    return 0
}

# Evaluate single policy
evaluate_policy() {
    local agent_id="$1"
    local policy="$2"
    local context="$3"

    local policy_type=$(echo "$policy" | jq -r '.type')

    case "$policy_type" in
        max_deployments)
            evaluate_max_deployments "$agent_id" "$policy"
            ;;
        required_approvals)
            evaluate_required_approvals "$agent_id" "$policy" "$context"
            ;;
        resource_limits)
            evaluate_resource_limits "$agent_id" "$policy"
            ;;
        *)
            log "Unknown policy type: ${policy_type}"
            return 0
            ;;
    esac
}

# Policy implementations
evaluate_max_deployments() {
    local agent_id="$1"
    local policy="$2"

    local max_allowed=$(echo "$policy" | jq -r '.max_deployments')
    local current_count=$(./coordination/agentstudio/registry/manager.sh get "$agent_id" | jq -r '.deployment_count // 0')

    if [ "$current_count" -ge "$max_allowed" ]; then
        log "Policy violation: max deployments exceeded (${current_count} >= ${max_allowed})"
        return 1
    fi

    return 0
}

evaluate_required_approvals() {
    local agent_id="$1"
    local policy="$2"
    local context="$3"

    local required_approvers=$(echo "$policy" | jq -r '.required_approvers[]?')
    local approvals=$(echo "$context" | jq -r '.approvals[]?')

    # Check if all required approvers have approved
    while IFS= read -r approver; do
        if ! echo "$approvals" | grep -q "$approver"; then
            log "Policy violation: missing approval from ${approver}"
            return 1
        fi
    done <<< "$required_approvers"

    return 0
}

evaluate_resource_limits() {
    local agent_id="$1"
    local policy="$2"

    # Check current resource usage across all instances
    local instances=$(./coordination/agentstudio/registry/manager.sh get-instances "$agent_id" "running")

    local total_cpu=0
    local total_memory=0

    while IFS= read -r instance; do
        local cpu=$(echo "$instance" | jq -r '.resource_usage.cpu_time // 0')
        local mem=$(echo "$instance" | jq -r '.resource_usage.memory_peak // 0')

        total_cpu=$((total_cpu + cpu))
        total_memory=$((total_memory + mem))
    done <<< "$instances"

    local max_cpu=$(echo "$policy" | jq -r '.max_cpu_seconds')
    local max_memory=$(echo "$policy" | jq -r '.max_memory_mb')

    if [ "$total_cpu" -gt "$max_cpu" ]; then
        log "Policy violation: CPU limit exceeded"
        return 1
    fi

    if [ "$total_memory" -gt "$max_memory" ]; then
        log "Policy violation: Memory limit exceeded"
        return 1
    fi

    return 0
}

# Main CLI
evaluate_policies "$1" "${2:-{}}"
```

Example policy (`coordination/agentstudio/governance/policies/production-limits.json`):
```json
{
  "name": "production-limits",
  "description": "Limits for production agent deployments",
  "type": "resource_limits",
  "max_cpu_seconds": 3600,
  "max_memory_mb": 2048,
  "enabled": true
}
```

---

## Success Metrics

1. **Hyperproductivity**:
   - Agent deployment time: <2 minutes (from design to running)
   - Template reuse rate: >60% of new agents use templates
   - Auto-scaling efficiency: <5 minute response to queue changes

2. **Responsible AI**:
   - Policy compliance: 100% of deployments pass governance checks
   - Audit trail completeness: 100% of agent actions logged
   - Incident response time: <1 hour to identify and remediate issues

3. **Adoption**:
   - Self-service agent creation: >50% of agents created via designer UI
   - Agent registry coverage: 100% of running agents cataloged
   - Testing compliance: >80% of agents tested before production

---

## Implementation Roadmap Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1-2  | Registry | Agent catalog, templates, instance tracking |
| 3-4  | Designer | UI for agent creation, template library |
| 5    | Testing | Automated validation framework |
| 6    | Hyperproductivity | Auto-scaling, performance optimization |
| 7    | Governance | Policy engine, compliance monitoring |
| 8    | Integration | Full dashboard integration, documentation |

---

## Conclusion

By implementing an Agentstudio platform, commit-relay will transform from a script-based agent system to a managed, governed, and optimized autonomous workforce. This enables:

- **Faster innovation**: Self-service agent creation reduces time-to-deployment
- **Better quality**: Testing and validation catch issues before production
- **Higher productivity**: Auto-scaling and optimization maximize agent output
- **Responsible AI**: Governance policies ensure safe, compliant operation

**Next Steps**: Start with Phase 1 (Agent Registry) to establish the foundation, then progressively add designer, testing, and governance capabilities.
