# Larry Implementation Instructions
## K3s Cortex - Identity & Capability Integration

**Executor:** Larry (K3s Cortex instances)
**Timeline:** ~15 minutes
**Prerequisites:** K3s cluster healthy, resource-manager deployment ready

---

## Phase 1: Extend Resource Manager (5 min)

### Task 1.1: Database Schema Migration
**Execute on:** PostgreSQL in K3s cluster

Connect to database:
```bash
kubectl exec -it -n database postgresql-0 -- psql -U postgres resource_manager
```

Run migration:
```sql
-- Identity Layer Schema
-- Add tables for agent registry, capabilities, and relationships

CREATE TABLE IF NOT EXISTS cortex_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('orchestrator', 'worker', 'hybrid')),
    location TEXT,
    endpoint TEXT,
    status TEXT DEFAULT 'online' CHECK (status IN ('online', 'offline', 'degraded')),
    last_heartbeat TIMESTAMP DEFAULT NOW(),
    capabilities JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_capabilities (
    agent_id TEXT REFERENCES cortex_agents(id) ON DELETE CASCADE,
    capability TEXT NOT NULL,
    mcp_server TEXT,
    tool_name TEXT,
    PRIMARY KEY (agent_id, capability)
);

CREATE TABLE IF NOT EXISTS agent_relationships (
    from_agent TEXT REFERENCES cortex_agents(id) ON DELETE CASCADE,
    to_agent TEXT REFERENCES cortex_agents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('can_task', 'reports_to', 'peers_with')),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (from_agent, to_agent, relationship_type)
);

-- Indexes for performance
CREATE INDEX idx_capabilities_search ON agent_capabilities(capability);
CREATE INDEX idx_agent_status ON cortex_agents(status, last_heartbeat);
CREATE INDEX idx_agent_role ON cortex_agents(role);
CREATE INDEX idx_relationships_from ON agent_relationships(from_agent);
CREATE INDEX idx_relationships_to ON agent_relationships(to_agent);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cortex_agents_updated_at BEFORE UPDATE ON cortex_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify tables created
\dt cortex_agents agent_capabilities agent_relationships
```

### Task 1.2: Add New MCP Tools to Resource Manager
**File:** `src/cortex_resource_manager/__init__.py`

Add these new tools to the resource manager:

```python
from mcp.server import Server
from mcp.types import Tool, TextContent
from datetime import datetime
import json

# ... existing imports and setup ...

# Identity Management Tools

@server.list_tools()
async def list_tools() -> list[Tool]:
    """List all available tools including new identity tools"""
    return [
        # ... existing tools ...

        # New Identity Tools
        Tool(
            name="register_agent",
            description="Register or update a Cortex agent's identity and capabilities",
            inputSchema={
                "type": "object",
                "properties": {
                    "manifest": {
                        "type": "object",
                        "description": "Agent manifest with id, name, role, capabilities, etc.",
                        "required": ["id", "name", "role", "capabilities"]
                    }
                },
                "required": ["manifest"]
            }
        ),
        Tool(
            name="heartbeat",
            description="Update agent's last heartbeat timestamp",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["online", "offline", "degraded"]}
                },
                "required": ["agent_id"]
            }
        ),
        Tool(
            name="get_agents",
            description="List all registered Cortex agents",
            inputSchema={
                "type": "object",
                "properties": {
                    "role": {"type": "string", "enum": ["orchestrator", "worker", "hybrid"]},
                    "status": {"type": "string", "enum": ["online", "offline", "degraded"]}
                }
            }
        ),
        Tool(
            name="get_agent",
            description="Get detailed information for a specific agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"}
                },
                "required": ["agent_id"]
            }
        ),
        Tool(
            name="who_can",
            description="Find which agents have a specific capability",
            inputSchema={
                "type": "object",
                "properties": {
                    "capability": {"type": "string", "description": "Capability to search for (e.g., 'proxmox.create_vm')"}
                },
                "required": ["capability"]
            }
        ),
        Tool(
            name="get_capabilities",
            description="Get all capabilities for a specific agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"}
                },
                "required": ["agent_id"]
            }
        ),
        Tool(
            name="can_task",
            description="Check if one agent can task another",
            inputSchema={
                "type": "object",
                "properties": {
                    "from_agent": {"type": "string"},
                    "to_agent": {"type": "string"}
                },
                "required": ["from_agent", "to_agent"]
            }
        ),
        Tool(
            name="execute_task",
            description="Execute a task on behalf of an agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "from_agent": {"type": "string"},
                    "to_agent": {"type": "string"},
                    "tool": {"type": "string"},
                    "params": {"type": "object"}
                },
                "required": ["from_agent", "to_agent", "tool", "params"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls including new identity tools"""

    if name == "register_agent":
        manifest = arguments["manifest"]

        # Insert or update agent
        agent_id = manifest["id"]
        query = """
            INSERT INTO cortex_agents (id, name, role, location, endpoint, capabilities)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                location = EXCLUDED.location,
                endpoint = EXCLUDED.endpoint,
                capabilities = EXCLUDED.capabilities,
                updated_at = NOW()
            RETURNING *
        """

        result = await db.execute(query,
            agent_id,
            manifest["name"],
            manifest["role"],
            manifest.get("location"),
            manifest.get("endpoint"),
            json.dumps(manifest["capabilities"])
        )

        # Index capabilities
        # Delete old capabilities
        await db.execute("DELETE FROM agent_capabilities WHERE agent_id = $1", agent_id)

        # Insert new capabilities
        for mcp_server, tools in manifest["capabilities"].get("mcp_servers", {}).items():
            for tool in tools:
                capability = f"{mcp_server}.{tool}"
                await db.execute(
                    "INSERT INTO agent_capabilities (agent_id, capability, mcp_server, tool_name) VALUES ($1, $2, $3, $4)",
                    agent_id, capability, mcp_server, tool
                )

        # Handle relationships
        if "can_task" in manifest:
            for target in manifest["can_task"]:
                await db.execute(
                    """INSERT INTO agent_relationships (from_agent, to_agent, relationship_type)
                       VALUES ($1, $2, 'can_task') ON CONFLICT DO NOTHING""",
                    agent_id, target
                )

        return [TextContent(
            type="text",
            text=json.dumps({"status": "registered", "agent_id": agent_id})
        )]

    elif name == "heartbeat":
        agent_id = arguments["agent_id"]
        status = arguments.get("status", "online")

        await db.execute(
            "UPDATE cortex_agents SET last_heartbeat = NOW(), status = $1 WHERE id = $2",
            status, agent_id
        )

        return [TextContent(
            type="text",
            text=json.dumps({"status": "ok", "timestamp": datetime.utcnow().isoformat()})
        )]

    elif name == "get_agents":
        role = arguments.get("role")
        status = arguments.get("status")

        query = "SELECT * FROM cortex_agents WHERE 1=1"
        params = []

        if role:
            params.append(role)
            query += f" AND role = ${len(params)}"
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"

        agents = await db.fetch(query, *params)

        return [TextContent(
            type="text",
            text=json.dumps([dict(agent) for agent in agents], default=str)
        )]

    elif name == "get_agent":
        agent_id = arguments["agent_id"]

        agent = await db.fetchrow("SELECT * FROM cortex_agents WHERE id = $1", agent_id)

        if not agent:
            return [TextContent(type="text", text=json.dumps({"error": "Agent not found"}))]

        return [TextContent(type="text", text=json.dumps(dict(agent), default=str))]

    elif name == "who_can":
        capability = arguments["capability"]

        agents = await db.fetch(
            """SELECT DISTINCT a.id, a.name, a.role, a.endpoint
               FROM cortex_agents a
               JOIN agent_capabilities c ON a.id = c.agent_id
               WHERE c.capability LIKE $1 AND a.status = 'online'""",
            f"%{capability}%"
        )

        return [TextContent(
            type="text",
            text=json.dumps([dict(agent) for agent in agents], default=str)
        )]

    elif name == "get_capabilities":
        agent_id = arguments["agent_id"]

        caps = await db.fetch(
            "SELECT capability, mcp_server, tool_name FROM agent_capabilities WHERE agent_id = $1",
            agent_id
        )

        return [TextContent(
            type="text",
            text=json.dumps([dict(cap) for cap in caps], default=str)
        )]

    elif name == "can_task":
        from_agent = arguments["from_agent"]
        to_agent = arguments["to_agent"]

        rel = await db.fetchrow(
            """SELECT * FROM agent_relationships
               WHERE from_agent = $1 AND to_agent = $2 AND relationship_type = 'can_task'""",
            from_agent, to_agent
        )

        return [TextContent(
            type="text",
            text=json.dumps({"can_task": rel is not None})
        )]

    # ... existing tool handlers ...
```

### Task 1.3: Update Resource Manager Deployment
**File:** `deploy/helm/values/resource-manager.yaml`

Add new environment variables:
```yaml
configMap:
  data:
    # ... existing config ...

    # Identity layer settings
    IDENTITY_ENABLED: "true"
    AGENT_HEARTBEAT_TIMEOUT: "300"  # 5 minutes
    CAPABILITY_CACHE_TTL: "60"      # 1 minute
```

Redeploy:
```bash
helm upgrade resource-manager ./deploy/helm/mcp-server \
  -f deploy/helm/values/resource-manager.yaml \
  -n cortex
```

---

## Phase 2: K3s Cortex Agent Registration (5 min)

### Task 2.1: Create K3s Cortex Manifest
**File:** ConfigMap in K3s

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cortex-k3s-manifest
  namespace: cortex
data:
  manifest.json: |
    {
      "id": "cortex-k3s",
      "name": "Cortex K3s (Larry)",
      "role": "worker",
      "location": "proxmox/k3s-cluster",
      "endpoint": "http://cortex.cortex.svc.cluster.local:8080",
      "capabilities": {
        "mcp_servers": {
          "proxmox": [
            "list_vms",
            "create_vm",
            "start_vm",
            "stop_vm",
            "reboot_vm",
            "create_snapshot",
            "delete_snapshot",
            "clone_vm"
          ],
          "wazuh": [
            "get_alerts",
            "get_agents",
            "run_query",
            "manage_agent"
          ],
          "unifi": [
            "list_clients",
            "block_client",
            "unblock_client",
            "get_traffic_stats",
            "list_networks"
          ],
          "k3s": [
            "list_pods",
            "get_pod_logs",
            "scale_deployment",
            "create_deployment",
            "delete_pod"
          ],
          "github": [
            "create_pr",
            "create_commit",
            "list_issues",
            "create_issue"
          ]
        },
        "system": [
          "kubernetes_access",
          "network_access",
          "can_execute_bash",
          "has_persistent_storage"
        ]
      },
      "accepts_tasks_from": ["cortex-desktop"],
      "credentials": {
        "proxmox": "k8s-secret:proxmox-creds",
        "wazuh": "k8s-secret:wazuh-creds",
        "unifi": "k8s-secret:unifi-creds",
        "github": "k8s-secret:github-creds"
      }
    }
```

Apply:
```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: cortex-k3s-manifest
  namespace: cortex
data:
  manifest.json: |
    # ... paste manifest from above ...
EOF
```

### Task 2.2: Create Registration Init Container
**File:** Add to cortex deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex
  namespace: cortex
spec:
  template:
    spec:
      initContainers:
      - name: register-agent
        image: curlimages/curl:latest
        command:
        - sh
        - -c
        - |
          # Wait for resource-manager to be ready
          until curl -sf http://resource-manager.cortex.svc.cluster.local:8080/health; do
            echo "Waiting for resource-manager..."
            sleep 5
          done

          # Register this agent
          curl -X POST http://resource-manager.cortex.svc.cluster.local:8080/agents/register \
            -H "Content-Type: application/json" \
            -d @/etc/cortex/manifest.json
        volumeMounts:
        - name: manifest
          mountPath: /etc/cortex

      containers:
      - name: cortex
        # ... existing container spec ...

        # Add sidecar for heartbeat
      - name: heartbeat
        image: curlimages/curl:latest
        command:
        - sh
        - -c
        - |
          while true; do
            curl -X POST http://resource-manager.cortex.svc.cluster.local:8080/agents/cortex-k3s/heartbeat \
              -H "Content-Type: application/json" \
              -d '{"status": "online"}'
            sleep 60
          done

      volumes:
      - name: manifest
        configMap:
          name: cortex-k3s-manifest
```

Apply:
```bash
kubectl apply -f cortex-deployment.yaml
```

---

## Phase 3: Task Execution Handler (5 min)

### Task 3.1: Create Task Listener
**File:** Add to K3s Cortex application

```python
# task_listener.py
import asyncio
import httpx
from typing import Dict, Any

RESOURCE_MANAGER_URL = "http://resource-manager.cortex.svc.cluster.local:8080"
AGENT_ID = "cortex-k3s"

async def poll_tasks():
    """Poll for new tasks from resource manager"""
    while True:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RESOURCE_MANAGER_URL}/tasks/pending",
                    params={"agent_id": AGENT_ID}
                )

                if response.status_code == 200:
                    tasks = response.json()

                    for task in tasks:
                        await execute_task(task)

        except Exception as e:
            print(f"Error polling tasks: {e}")

        await asyncio.sleep(5)  # Poll every 5 seconds

async def execute_task(task: Dict[str, Any]):
    """Execute a task"""
    tool = task["tool"]
    params = task["params"]
    task_id = task["id"]

    try:
        # Route to appropriate MCP server
        if tool.startswith("proxmox."):
            result = await execute_proxmox_tool(tool, params)
        elif tool.startswith("wazuh."):
            result = await execute_wazuh_tool(tool, params)
        elif tool.startswith("unifi."):
            result = await execute_unifi_tool(tool, params)
        elif tool.startswith("k3s."):
            result = await execute_k3s_tool(tool, params)
        elif tool.startswith("github."):
            result = await execute_github_tool(tool, params)
        else:
            result = {"error": f"Unknown tool: {tool}"}

        # Report result back
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{RESOURCE_MANAGER_URL}/tasks/{task_id}/result",
                json={"status": "completed", "result": result}
            )

    except Exception as e:
        # Report error
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{RESOURCE_MANAGER_URL}/tasks/{task_id}/result",
                json={"status": "failed", "error": str(e)}
            )

# Start task listener
if __name__ == "__main__":
    asyncio.run(poll_tasks())
```

---

## Phase 4: Verification & Testing

### Task 4.1: Verify Registration
```bash
# Check agent registered
kubectl exec -it -n cortex deployment/cortex -- \
  curl -s http://resource-manager:8080/agents/cortex-k3s | jq .

# Expected output:
# {
#   "id": "cortex-k3s",
#   "name": "Cortex K3s (Larry)",
#   "role": "worker",
#   "status": "online",
#   ...
# }
```

### Task 4.2: Verify Capabilities Indexed
```bash
# Check capabilities
kubectl exec -it -n cortex deployment/cortex -- \
  curl -s http://resource-manager:8080/agents/cortex-k3s/capabilities | jq .

# Should show all proxmox.*, wazuh.*, unifi.*, k3s.*, github.* tools
```

### Task 4.3: Test from Desktop
From desktop Cortex:
```bash
# Who can create Proxmox snapshots?
curl -s http://10.88.145.192:8080/capabilities/search?q=proxmox.create_snapshot | jq .

# Expected: ["cortex-k3s"]
```

---

## Execution Checklist

- [ ] Run database migration
- [ ] Update resource-manager code with new tools
- [ ] Redeploy resource-manager
- [ ] Create K3s Cortex manifest ConfigMap
- [ ] Update cortex deployment with init container
- [ ] Verify registration
- [ ] Verify capabilities indexed
- [ ] Test task execution
- [ ] Monitor heartbeat

---

## Troubleshooting

**Database migration fails:**
- Check PostgreSQL is running: `kubectl get pods -n database`
- Verify credentials
- Check for existing tables: `\dt` in psql

**Registration fails:**
- Check resource-manager logs: `kubectl logs -n cortex deployment/resource-manager`
- Verify manifest JSON is valid
- Check network policy allows cortex → resource-manager

**Capabilities not indexed:**
- Check agent_capabilities table: `SELECT * FROM agent_capabilities WHERE agent_id = 'cortex-k3s';`
- Verify manifest.json format
- Check resource-manager logs

---

**Ready to execute in parallel with Desktop Cortex implementation!**
