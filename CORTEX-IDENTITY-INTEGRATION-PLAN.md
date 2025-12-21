# Cortex Identity & Capability Integration Plan

## Current State Analysis

### ✅ What You Have

**Resource Manager (K3s)**:
- Deployed as MCP server in K3s cluster
- Manages: MCP server lifecycle, worker provisioning, resource allocation
- Has: PostgreSQL backend, Redis cache
- Endpoints: Proxmox MCP, N8N MCP, Talos MCP
- **Currently operational in K3s only**

**Desktop Cortex**:
- Running via Claude Code on your Mac
- **NOT currently using resource-manager**
- Direct file system access, local execution

**K3s Cortex**:
- Running in K3s cluster
- Has access to all MCPs (Proxmox, Wazuh, UniFi, K3s, GitHub)
- **May or may not be using resource-manager** (cluster is rebooting)

### ❌ What's Missing

**Identity Layer**:
- No agent registry (who am I? who is the other cortex?)
- No capability discovery (what can each do?)
- No relationship management (who can task whom?)
- No persistent state sharing between instances

## Integration Approach: Extend Resource Manager

### Phase 1: Add Identity Layer to Resource Manager

#### 1.1 Database Schema Extension

Add to existing PostgreSQL database:

```sql
-- New table: Cortex Agents
CREATE TABLE cortex_agents (
    id TEXT PRIMARY KEY,                    -- 'cortex-desktop', 'cortex-k3s'
    name TEXT NOT NULL,
    role TEXT NOT NULL,                     -- 'orchestrator', 'worker'
    location TEXT,                          -- 'ryan-mbp', 'k3s-cluster'
    endpoint TEXT,                          -- HTTP endpoint or null for local
    status TEXT DEFAULT 'online',           -- 'online', 'offline', 'degraded'
    last_heartbeat TIMESTAMP,
    capabilities JSONB,                     -- Full capability manifest
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- New table: Agent Capabilities (denormalized for fast lookup)
CREATE TABLE agent_capabilities (
    agent_id TEXT REFERENCES cortex_agents(id),
    capability TEXT,                        -- 'proxmox.create_vm', 'wazuh.get_alerts'
    mcp_server TEXT,                        -- 'proxmox', 'wazuh', etc.
    tool_name TEXT,
    PRIMARY KEY (agent_id, capability)
);

-- New table: Agent Relationships
CREATE TABLE agent_relationships (
    from_agent TEXT REFERENCES cortex_agents(id),
    to_agent TEXT REFERENCES cortex_agents(id),
    relationship_type TEXT,                -- 'can_task', 'reports_to'
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (from_agent, to_agent, relationship_type)
);

-- Index for fast capability lookups
CREATE INDEX idx_capabilities_search ON agent_capabilities(capability);
CREATE INDEX idx_agent_status ON cortex_agents(status, last_heartbeat);
```

#### 1.2 New MCP Tools for Resource Manager

Add these tools to the resource-manager MCP server:

```python
# Identity tools
@tool
def register_agent(manifest: AgentManifest) -> Dict:
    """Register or update a Cortex agent's identity and capabilities"""

@tool
def heartbeat(agent_id: str) -> Dict:
    """Update agent's last_heartbeat (keepalive)"""

@tool
def get_agents(role: Optional[str] = None, status: Optional[str] = None) -> List[Dict]:
    """List all registered agents"""

@tool
def get_agent(agent_id: str) -> Dict:
    """Get detailed info for a specific agent"""

@tool
def who_can(capability: str) -> List[str]:
    """Find which agents have a specific capability"""
    # Example: who_can("proxmox.create_vm") → ["cortex-k3s"]

@tool
def get_capabilities(agent_id: str) -> List[str]:
    """Get all capabilities for an agent"""

@tool
def can_task(from_agent: str, to_agent: str) -> bool:
    """Check if from_agent can task to_agent"""

@tool
def update_status(agent_id: str, status: str, details: Optional[Dict] = None) -> Dict:
    """Update agent status"""
```

### Phase 2: Desktop Cortex Integration

#### 2.1 Desktop Cortex Bootstrap Script

Create: `desktop-cortex-bootstrap.sh`

```bash
#!/usr/bin/env bash
# Bootstrap desktop Cortex with identity

# Resource Manager endpoint (your K3s cluster)
export RESOURCE_MANAGER_URL="http://10.88.145.192:8080"  # or k3s-master02 IP
export CORTEX_AGENT_ID="cortex-desktop"

# Create desktop manifest
cat > /tmp/desktop-cortex-manifest.json <<'EOF'
{
  "id": "cortex-desktop",
  "name": "Cortex Desktop",
  "role": "orchestrator",
  "location": "ryan-mbp",
  "endpoint": null,
  "capabilities": {
    "mcp_servers": ["filesystem", "github"],
    "system": ["has_gui", "can_prompt_user", "local_file_access"],
    "tools": [
      "read_file",
      "write_file",
      "github.create_pr",
      "github.commit"
    ]
  },
  "can_task": ["cortex-k3s"],
  "credentials": {
    "github": "keychain:github-token"
  }
}
EOF

# Register with resource manager
curl -X POST "$RESOURCE_MANAGER_URL/agents/register" \
  -H "Content-Type: application/json" \
  -d @/tmp/desktop-cortex-manifest.json

# Discover peers
curl "$RESOURCE_MANAGER_URL/agents?role=worker" > /tmp/cortex-peers.json

echo "Desktop Cortex registered and discovered peers"
cat /tmp/cortex-peers.json
```

#### 2.2 Desktop Cortex Claude Code Integration

Add to your Claude Code configuration:

```json
{
  "cortex": {
    "agent_id": "cortex-desktop",
    "resource_manager_url": "http://10.88.145.192:8080",
    "auto_register": true,
    "heartbeat_interval": 60
  }
}
```

### Phase 3: K3s Cortex Integration

#### 3.1 K3s Cortex Manifest

Deploy as ConfigMap:

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
      "name": "Cortex K3s",
      "role": "worker",
      "location": "proxmox/k3s-cluster",
      "endpoint": "http://cortex-k3s.cortex.svc.cluster.local:8080",
      "capabilities": {
        "mcp_servers": ["proxmox", "wazuh", "unifi", "k3s", "github"],
        "system": ["kubernetes_access", "network_access", "can_execute_bash"],
        "tools": [
          "proxmox.*",
          "wazuh.*",
          "unifi.*",
          "k3s.*",
          "github.*"
        ]
      },
      "accepts_tasks_from": ["cortex-desktop"],
      "credentials": {
        "proxmox": "k8s-secret:proxmox-creds",
        "wazuh": "k8s-secret:wazuh-creds",
        "unifi": "k8s-secret:unifi-creds"
      }
    }
```

#### 3.2 K3s Cortex Startup Hook

Add init container or startup script:

```python
# k3s-cortex-init.py
import requests
import json

def register_with_resource_manager():
    with open('/etc/cortex/manifest.json') as f:
        manifest = json.load(f)

    # Register self with resource manager
    requests.post(
        'http://resource-manager.cortex.svc.cluster.local:8080/agents/register',
        json=manifest
    )

    # Start heartbeat
    # (send heartbeat every 60s)

if __name__ == "__main__":
    register_with_resource_manager()
```

### Phase 4: Task Delegation Protocol

#### 4.1 Desktop Tasks K3s

From desktop Cortex:

```python
# Example: Task k3s to snapshot a VM

# 1. Find who can do it
capable_agents = await resource_manager.who_can("proxmox.create_snapshot")
# Returns: ["cortex-k3s"]

# 2. Check permission
if await resource_manager.can_task("cortex-desktop", "cortex-k3s"):

    # 3. Get k3s endpoint
    k3s_agent = await resource_manager.get_agent("cortex-k3s")

    # 4. Send task
    task = {
        "from": "cortex-desktop",
        "tool": "proxmox.create_snapshot",
        "params": {"vm_id": 306, "name": "pre-upgrade"}
    }

    # Option A: Direct HTTP
    response = await httpx.post(
        f"{k3s_agent['endpoint']}/tasks",
        json=task
    )

    # Option B: Via resource manager (delegated execution)
    response = await resource_manager.execute_task(
        agent_id="cortex-k3s",
        tool="proxmox.create_snapshot",
        params={"vm_id": 306, "name": "pre-upgrade"}
    )
```

## Implementation Roadmap

### Week 1: Database & API Layer
- [ ] Add database schema to resource-manager
- [ ] Implement new MCP tools (register_agent, who_can, etc.)
- [ ] Deploy updated resource-manager to K3s

### Week 2: Desktop Integration
- [ ] Create desktop-cortex-bootstrap script
- [ ] Test registration with resource-manager
- [ ] Verify capability discovery

### Week 3: K3s Integration
- [ ] Create k3s-cortex manifest
- [ ] Add startup registration
- [ ] Test bidirectional discovery

### Week 4: Task Delegation
- [ ] Implement task execution protocol
- [ ] Test desktop → k3s tasking
- [ ] Add monitoring/observability

## Quick Start (This Weekend)

### Step 1: Check Resource Manager Deployment

```bash
ssh k3s@10.88.145.192 "kubectl get pods -n cortex | grep resource-manager"
```

### Step 2: Extend Database Schema

```bash
# Connect to PostgreSQL in K3s
kubectl exec -it -n database postgresql-0 -- psql -U postgres resource_manager

# Run the SQL from section 1.1 above
```

### Step 3: Update Resource Manager Code

Add the new tools to: `cortex-resource-manager/src/cortex_resource_manager/__init__.py`

### Step 4: Test from Desktop

```bash
./desktop-cortex-bootstrap.sh
```

## Benefits

Once implemented, you'll be able to:

1. **Desktop Cortex knows**: "k3s-cortex can snapshot VMs, query Wazuh, manage UniFi"
2. **K3s Cortex knows**: "desktop-cortex can task me, has GitHub access, needs my help"
3. **Automatic routing**: "User wants Wazuh alerts → route to k3s-cortex"
4. **Persistent state**: Both remember their relationship across restarts
5. **Observable**: Track which agent did what via resource-manager logs

## Next Steps

Which would you like to tackle first?

1. Add database schema to resource-manager
2. Create desktop bootstrap script
3. Test if resource-manager is even running in K3s (once cluster recovers)
4. Something else?
