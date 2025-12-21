# Desktop Cortex Implementation Plan
## Identity & Capability Integration - Mac Side

**Executor:** Desktop Cortex (this instance)
**Timeline:** ~15 minutes
**Prerequisites:** K3s cluster running, resource-manager deployed

---

## Phase 1: Desktop Identity Setup (5 min)

### Task 1.1: Create Desktop Agent Manifest
**File:** `~/.cortex/agent-manifest.yaml`

```yaml
agent:
  id: cortex-desktop
  name: "Cortex Desktop"
  role: orchestrator
  location: ryan-mbp
  endpoint: null  # Local only, no network endpoint

capabilities:
  mcp_servers:
    - name: filesystem
      tools:
        - read_file
        - write_file
        - list_directory
        - search_files
    - name: github
      tools:
        - create_pr
        - create_commit
        - list_issues
        - create_issue

  system:
    - has_gui
    - can_prompt_user
    - local_file_access
    - git_access

  credentials:
    github: keychain:github-token

relationships:
  can_task:
    - cortex-k3s
  reports_to: []
```

### Task 1.2: Create Bootstrap Script
**File:** `~/.cortex/bootstrap.sh`

```bash
#!/usr/bin/env bash
# Desktop Cortex Bootstrap - Register with Resource Manager

set -euo pipefail

# Configuration
export CORTEX_AGENT_ID="cortex-desktop"
export RESOURCE_MANAGER_URL="http://10.88.145.192:8080"  # Larry-2
export MANIFEST_PATH="$HOME/.cortex/agent-manifest.yaml"

echo "=== Desktop Cortex Bootstrap ==="
echo ""

# Convert YAML to JSON
MANIFEST_JSON=$(python3 -c "
import yaml, json, sys
with open('$MANIFEST_PATH') as f:
    print(json.dumps(yaml.safe_load(f)))
")

# Register with resource manager
echo "Registering with resource manager at $RESOURCE_MANAGER_URL..."
curl -X POST "$RESOURCE_MANAGER_URL/agents/register" \
  -H "Content-Type: application/json" \
  -d "$MANIFEST_JSON" \
  -o /tmp/register-response.json

if [ $? -eq 0 ]; then
    echo "✓ Registration successful"
    cat /tmp/register-response.json | jq .
else
    echo "✗ Registration failed"
    exit 1
fi

# Discover peers
echo ""
echo "Discovering peers..."
curl -s "$RESOURCE_MANAGER_URL/agents?role=worker" \
  -o ~/.cortex/peers.json

echo "✓ Found peers:"
cat ~/.cortex/peers.json | jq -r '.[] | "  - \(.id) at \(.endpoint // "local")"'

# Store resource manager connection info
cat > ~/.cortex/connection.json <<EOF
{
  "resource_manager_url": "$RESOURCE_MANAGER_URL",
  "agent_id": "$CORTEX_AGENT_ID",
  "registered_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "✓ Desktop Cortex ready!"
```

### Task 1.3: Create Helper Functions
**File:** `~/.cortex/helpers.sh`

```bash
#!/usr/bin/env bash
# Desktop Cortex Helper Functions

source ~/.cortex/connection.json 2>/dev/null || {
    echo "Error: Not bootstrapped. Run ~/.cortex/bootstrap.sh first"
    exit 1
}

# Who can perform a capability?
who_can() {
    local capability="$1"
    curl -s "$resource_manager_url/capabilities/search?q=$capability" | jq -r '.agents[]'
}

# Get agent details
get_agent() {
    local agent_id="$1"
    curl -s "$resource_manager_url/agents/$agent_id" | jq .
}

# Task another agent
task_agent() {
    local agent_id="$1"
    local tool="$2"
    local params="$3"

    local task_payload=$(cat <<EOF
{
  "from": "$CORTEX_AGENT_ID",
  "to": "$agent_id",
  "tool": "$tool",
  "params": $params,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

    curl -X POST "$resource_manager_url/tasks/execute" \
      -H "Content-Type: application/json" \
      -d "$task_payload"
}

# Send heartbeat
heartbeat() {
    curl -X POST "$resource_manager_url/agents/$CORTEX_AGENT_ID/heartbeat" \
      -H "Content-Type: application/json" \
      -d "{\"status\": \"online\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
}
```

---

## Phase 2: Integration with Claude Code (5 min)

### Task 2.1: Create Claude Code Hook
**File:** `~/.config/claude-code/hooks/on-startup.sh`

```bash
#!/usr/bin/env bash
# Claude Code Startup Hook - Bootstrap Desktop Cortex

if [ -f ~/.cortex/bootstrap.sh ]; then
    echo "Bootstrapping Desktop Cortex..."
    ~/.cortex/bootstrap.sh

    # Start heartbeat in background
    (
        while true; do
            source ~/.cortex/helpers.sh
            heartbeat > /dev/null 2>&1
            sleep 60
        done
    ) &

    echo $! > ~/.cortex/heartbeat.pid
fi
```

### Task 2.2: Create Task Delegation Wrapper
**File:** `~/.cortex/task-larry.sh`

```bash
#!/usr/bin/env bash
# Quick wrapper to task Larry (K3s Cortex)

source ~/.cortex/helpers.sh

TOOL="$1"
PARAMS="${2:-{}}"

echo "Tasking Larry (cortex-k3s) to execute: $TOOL"
echo "Parameters: $PARAMS"
echo ""

task_agent "cortex-k3s" "$TOOL" "$PARAMS"
```

**Usage Examples:**
```bash
# Snapshot a VM via Proxmox
~/.cortex/task-larry.sh "proxmox.create_snapshot" '{"vm_id": 306, "name": "backup"}'

# Get Wazuh alerts
~/.cortex/task-larry.sh "wazuh.get_alerts" '{"severity": "high"}'

# List UniFi clients
~/.cortex/task-larry.sh "unifi.list_clients" '{}'
```

---

## Phase 3: Testing & Validation (5 min)

### Task 3.1: Bootstrap Test
```bash
# Create directories
mkdir -p ~/.cortex
mkdir -p ~/.config/claude-code/hooks

# Copy manifest
# (Created in Task 1.1)

# Run bootstrap
~/.cortex/bootstrap.sh
```

**Expected Output:**
```
=== Desktop Cortex Bootstrap ===

Registering with resource manager at http://10.88.145.192:8080...
✓ Registration successful
{
  "agent_id": "cortex-desktop",
  "status": "registered",
  "capabilities_indexed": 8
}

Discovering peers...
✓ Found peers:
  - cortex-k3s at http://cortex-k3s.cortex.svc.cluster.local:8080

✓ Desktop Cortex ready!
```

### Task 3.2: Capability Query Test
```bash
source ~/.cortex/helpers.sh

# Who can snapshot VMs?
who_can "proxmox.create_snapshot"
# Expected: ["cortex-k3s"]

# Who can create GitHub PRs?
who_can "github.create_pr"
# Expected: ["cortex-desktop", "cortex-k3s"]
```

### Task 3.3: Task Delegation Test
```bash
# Test tasking Larry to list Proxmox VMs
~/.cortex/task-larry.sh "proxmox.list_vms" '{}'

# Expected: JSON response with VM list
```

---

## Phase 4: Monitoring & Maintenance

### Task 4.1: Create Status Check Script
**File:** `~/.cortex/status.sh`

```bash
#!/usr/bin/env bash
source ~/.cortex/connection.json

echo "=== Desktop Cortex Status ==="
echo ""
echo "Agent ID: $agent_id"
echo "Resource Manager: $resource_manager_url"
echo ""

# Check connection
echo "Connection Status:"
if curl -s -o /dev/null -w "%{http_code}" "$resource_manager_url/health" | grep -q "200"; then
    echo "  ✓ Resource Manager reachable"
else
    echo "  ✗ Resource Manager unreachable"
fi

# Check registration
echo ""
echo "Registration Status:"
curl -s "$resource_manager_url/agents/$agent_id" | jq -r '
  "  Agent: \(.name)",
  "  Role: \(.role)",
  "  Status: \(.status)",
  "  Last Heartbeat: \(.last_heartbeat)"
'

# Check peers
echo ""
echo "Known Peers:"
curl -s "$resource_manager_url/agents" | jq -r '.[] |
  select(.id != "cortex-desktop") |
  "  - \(.id) (\(.role)) - \(.status)"
'
```

### Task 4.2: Create Cleanup Script
**File:** `~/.cortex/cleanup.sh`

```bash
#!/usr/bin/env bash
# Cleanup Desktop Cortex

source ~/.cortex/connection.json

echo "Cleaning up Desktop Cortex..."

# Stop heartbeat
if [ -f ~/.cortex/heartbeat.pid ]; then
    kill $(cat ~/.cortex/heartbeat.pid) 2>/dev/null
    rm ~/.cortex/heartbeat.pid
fi

# Unregister
curl -X DELETE "$resource_manager_url/agents/$agent_id"

echo "✓ Cleaned up"
```

---

## Quick Reference

### Directory Structure
```
~/.cortex/
├── agent-manifest.yaml    # Identity definition
├── bootstrap.sh           # Registration script
├── helpers.sh             # Utility functions
├── task-larry.sh          # Quick task delegation
├── status.sh              # Status checker
├── cleanup.sh             # Cleanup/unregister
├── connection.json        # Runtime connection info
└── peers.json             # Discovered peers
```

### Common Operations

**Bootstrap:**
```bash
~/.cortex/bootstrap.sh
```

**Check Status:**
```bash
~/.cortex/status.sh
```

**Task Larry:**
```bash
~/.cortex/task-larry.sh "tool.name" '{"param": "value"}'
```

**Manual Heartbeat:**
```bash
source ~/.cortex/helpers.sh && heartbeat
```

**Cleanup:**
```bash
~/.cortex/cleanup.sh
```

---

## Dependencies

- `curl` - HTTP requests
- `jq` - JSON processing
- `python3` - YAML to JSON conversion
- `yq` or PyYAML - YAML parsing

Install if missing:
```bash
brew install jq yq
pip3 install pyyaml
```

---

## Execution Checklist

- [ ] Create `~/.cortex/` directory
- [ ] Create agent manifest
- [ ] Create bootstrap script
- [ ] Create helper functions
- [ ] Create task wrapper
- [ ] Create status checker
- [ ] Run bootstrap
- [ ] Test capability queries
- [ ] Test task delegation
- [ ] Verify heartbeat working

---

## Troubleshooting

**Bootstrap fails:**
- Check resource-manager is running: `curl http://10.88.145.192:8080/health`
- Check network connectivity to K3s
- Verify manifest YAML is valid

**Peers not discovered:**
- Check Larry has registered: `curl http://10.88.145.192:8080/agents`
- Verify resource-manager API is accessible

**Task delegation fails:**
- Confirm capability exists: `who_can "tool.name"`
- Check Larry's endpoint is reachable
- Verify permission: Should see relationship in resource-manager

---

**Ready to execute in parallel with Larry's implementation!**
