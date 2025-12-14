# K3s Cluster Access via Proxmox API

**CRITICAL: This is the ONLY way to interact with the K3s cluster (VMs 310-312)**

All Cortex masters, workers, and automated processes MUST use the Proxmox API guest agent to execute commands on the K3s VMs. Direct SSH, kubectl from external systems, or network-based access is NOT available.

---

## Architecture Overview

### K3s Cluster Configuration

**Cluster VMs:**
- **VM 310** - K3s Master (10.88.145.180) - VLAN 145
- **VM 311** - K3s Worker 1 (10.88.145.181) - VLAN 145
- **VM 312** - K3s Worker 2 (10.88.145.182) - VLAN 145

**Network Isolation:**
- VMs are on VLAN 145 (10.88.145.0/24)
- No direct network connectivity from external systems
- VMs cannot reach external networks (GitHub, Docker registries, etc.)
- All interaction MUST go through Proxmox guest agent API

**Why Proxmox API Only:**
1. Network isolation for security
2. Centralized access control via Proxmox tokens
3. Audit trail of all operations
4. No SSH key management needed
5. Works regardless of VM network state

---

## Authentication

### API Token

```bash
PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
```

**Token Permissions:**
- Role: `PVEAdmin` (full access)
- Scope: All VMs and resources
- Includes: `VM.GuestAgent.Audit` and `VM.GuestAgent.Unrestricted`

**Security Notes:**
- Token is stored in Cortex coordination config
- Never commit tokens to public repositories
- Token has full Proxmox access - use carefully
- All operations are logged by Proxmox

---

## Core Operations

### 1. Execute Commands

**Pattern:**
```bash
# Step 1: Execute command and get PID
response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"command":["kubectl","get","pods","-n","cortex-system"]}')

pid=$(echo "$response" | jq -r '.data.pid')

# Step 2: Wait for command to complete
sleep 3

# Step 3: Get results
result=$(curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$pid" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

exitcode=$(echo "$result" | jq -r '.data.exitcode')
stdout_b64=$(echo "$result" | jq -r '.data["out-data"]')
stderr_b64=$(echo "$result" | jq -r '.data["err-data"]')

# Step 4: Decode output
echo "$stdout_b64" | base64 -d
```

**Important Notes:**
- Commands run asynchronously - you get a PID immediately
- Poll `exec-status` with the PID to get results
- Output is base64-encoded in `out-data` and `err-data`
- Wait time depends on command complexity (3-10 seconds typical)
- Exit code in `.data.exitcode` (0 = success)

### 2. Write Files to VM

**Pattern (using exec with base64):**
```bash
# Encode file content
FILE_B64=$(base64 < /path/to/local/file | tr -d '\n')

# Write file via exec
response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"command\":[\"bash\",\"-c\",\"echo '$FILE_B64' | base64 -d > /tmp/destination.yaml\"]}")

pid=$(echo "$response" | jq -r '.data.pid')
sleep 2

# Verify write succeeded
result=$(curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$pid" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

exitcode=$(echo "$result" | jq -r '.data.exitcode')
```

**Why Not file-open/file-write API:**
- These endpoints are NOT implemented in qemu-guest-agent on our VMs
- Use exec with base64 encoding instead
- This is the supported pattern for file operations

### 3. Check VM Status

```bash
curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/status/current" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" | jq -r '.data.status'
```

Returns: `running`, `stopped`, or other status

---

## Common Tasks

### Deploy Kubernetes Manifests

```bash
#!/bin/bash
VMID=310  # K3s master

# 1. Create combined manifest locally
cat k8s/*.yaml > /tmp/combined.yaml

# 2. Base64 encode
MANIFEST_B64=$(base64 < /tmp/combined.yaml | tr -d '\n')

# 3. Write to VM
exec_response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"command\":[\"bash\",\"-c\",\"echo '$MANIFEST_B64' | base64 -d > /tmp/deploy.yaml\"]}")

pid=$(echo "$exec_response" | jq -r '.data.pid')
sleep 2

# 4. Apply with kubectl
exec_response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"command":["kubectl","apply","-f","/tmp/deploy.yaml"]}')

pid=$(echo "$exec_response" | jq -r '.data.pid')
sleep 5

# 5. Check result
result=$(curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$pid" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

exitcode=$(echo "$result" | jq -r '.data.exitcode')
echo "Deployment exit code: $exitcode"
```

### Check Cluster Health

```bash
exec_cmd() {
    local vmid="$1"
    local cmd="$2"

    response=$(curl -k -s -X POST \
        "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$vmid/agent/exec" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"command\":[\"bash\",\"-c\",\"$cmd\"]}")

    pid=$(echo "$response" | jq -r '.data.pid')
    sleep 3

    result=$(curl -k -s -X GET \
        "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$vmid/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    echo "$result" | jq -r '.data.exitcode'
}

# Check K3s nodes
exit_code=$(exec_cmd 310 "kubectl get nodes")
if [ "$exit_code" = "0" ]; then
    echo "✓ Cluster healthy"
else
    echo "✗ Cluster issue"
fi
```

### Scale Deployments

```bash
VMID=310

# Scale deployment
exec_response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"command":["kubectl","scale","deployment","coordinator-master","-n","cortex-system","--replicas=3"]}')

pid=$(echo "$exec_response" | jq -r '.data.pid')
sleep 3

# Verify scaling
result=$(curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$pid" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

exitcode=$(echo "$result" | jq -r '.data.exitcode')
echo "Scale operation exit code: $exitcode"
```

### Get Pod Logs

```bash
VMID=310
POD_NAME="coordinator-master-abc123"

exec_response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"command\":[\"kubectl\",\"logs\",\"$POD_NAME\",\"-n\",\"cortex-system\",\"--tail=50\"]}")

pid=$(echo "$exec_response" | jq -r '.data.pid')
sleep 3

result=$(curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$pid" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

# Decode logs
echo "$result" | jq -r '.data["out-data"]' | base64 -d
```

---

## Best Practices

### 1. Always Check Exit Codes

```bash
exitcode=$(echo "$result" | jq -r '.data.exitcode')
if [ "$exitcode" != "0" ]; then
    echo "Command failed with exit code: $exitcode"
    stderr=$(echo "$result" | jq -r '.data["err-data"]' | base64 -d)
    echo "Error: $stderr"
    exit 1
fi
```

### 2. Use Appropriate Wait Times

- Simple commands (echo, ls): 2 seconds
- kubectl get: 3 seconds
- kubectl apply: 5-10 seconds
- Large file operations: 10-15 seconds

### 3. Handle Base64 Encoding Properly

```bash
# Single-line base64 for file content
FILE_B64=$(base64 < file.txt | tr -d '\n')

# Decode with error handling
echo "$b64_data" | base64 -d 2>/dev/null || echo "Decode failed"
```

### 4. Target the Right VM

- **VM 310 (Master)**: All kubectl commands, cluster-wide operations
- **VM 311/312 (Workers)**: Node-specific operations, debugging

### 5. Escape Special Characters in JSON

```bash
# Bad - will break JSON
-d '{"command":["echo","$VAR"]}'

# Good - proper escaping
-d "{\"command\":[\"echo\",\"$VAR\"]}"
```

### 6. Use Heredocs for Complex Commands

```bash
CMD=$(cat <<'EOF'
kubectl get pods -n cortex-system | \
grep Running | \
awk '{print $1}'
EOF
)

response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"command\":[\"bash\",\"-c\",\"$CMD\"]}")
```

---

## Troubleshooting

### Issue: PID is Empty

```bash
pid=$(echo "$response" | jq -r '.data.pid')
if [ -z "$pid" ] || [ "$pid" = "null" ]; then
    echo "Failed to execute command"
    echo "$response" | jq .
    exit 1
fi
```

**Causes:**
- Guest agent not running on VM
- Permission denied (check token permissions)
- Malformed command JSON

### Issue: Base64 Decode Produces Garbage

**Symptom:** Garbled output like `4I0Q$N,D�EDE"`

**Causes:**
1. Data isn't actually base64 encoded
2. Output field is empty
3. Incorrect field name (`out-data` vs `outData`)

**Solution:**
```bash
# Check if data exists first
stdout_b64=$(echo "$result" | jq -r '.data["out-data"] // empty')
if [ -n "$stdout_b64" ]; then
    echo "$stdout_b64" | base64 -d 2>/dev/null || echo "Decode failed"
else
    echo "No output data"
fi
```

### Issue: Command Timeouts

**Symptom:** Exit code -1 or command never completes

**Solutions:**
1. Increase wait time
2. Break into smaller commands
3. Run in background and poll longer

```bash
# For long-running commands
response=$(curl -k -s -X POST \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"command":["bash","-c","nohup long-command > /tmp/output.log 2>&1 &"]}')

# Poll result file later
```

### Issue: Cannot Reach GitHub/External Networks

**This is expected behavior** - VMs are network isolated.

**Solutions:**
1. Upload files via Proxmox API (as shown above)
2. Use local Docker registry
3. Pre-pull images during VM provisioning
4. Bundle dependencies in deployment manifests

---

## Integration with Cortex

### Master Integration

All masters should use this pattern in their `lib/` scripts:

```bash
# /coordination/masters/[master-name]/lib/k3s-exec.sh

source /coordination/config/proxmox-credentials.sh

k3s_exec() {
    local cmd="$1"
    local vmid="${2:-310}"  # Default to master

    response=$(curl -k -s -X POST \
        "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$vmid/agent/exec" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"command\":[\"bash\",\"-c\",\"$cmd\"]}")

    pid=$(echo "$response" | jq -r '.data.pid')
    [ -z "$pid" ] && return 1

    sleep 3

    result=$(curl -k -s -X GET \
        "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/$vmid/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    echo "$result" | jq -r '.data.exitcode'
}

# Usage in master scripts
if [ "$(k3s_exec 'kubectl get nodes')" = "0" ]; then
    echo "Cluster operational"
fi
```

### Worker Integration

Workers should use MCP tools that wrap the Proxmox API:

**MCP Tool: `k3s_execute_command`**

```json
{
  "name": "k3s_execute_command",
  "description": "Execute command on K3s cluster via Proxmox API",
  "parameters": {
    "command": "kubectl get pods -n cortex-system",
    "vm_id": "310",
    "wait_seconds": 5
  }
}
```

Implementation in `/mcp-server/tools/k3s.js`

---

## Security Considerations

### Token Management

- Store token in `/coordination/config/proxmox-credentials.sh`
- Never log full token in output
- Rotate token every 90 days
- Use separate tokens for different access levels (future)

### Audit Trail

All operations are logged by Proxmox:
```bash
# Check Proxmox logs
grep "guest-exec" /var/log/pve/tasks/active
```

### Principle of Least Privilege

- Masters: Full kubectl access via VM 310
- Workers: Limited commands via exec restrictions
- Read-only operations: Can use any VM
- Write operations: VM 310 only

---

## Performance Optimization

### Batch Operations

```bash
# Instead of multiple API calls
k3s_exec "kubectl get pods"
k3s_exec "kubectl get services"
k3s_exec "kubectl get deployments"

# Combine into single call
k3s_exec "kubectl get pods,services,deployments -n cortex-system"
```

### Parallel Execution

```bash
# Execute on multiple VMs in parallel
for vmid in 310 311 312; do
    k3s_exec "kubectl get nodes" "$vmid" &
done
wait
```

### Caching

```bash
# Cache cluster state for 60 seconds
CACHE_FILE="/tmp/k3s-cluster-state.cache"
CACHE_TTL=60

if [ -f "$CACHE_FILE" ] && [ $(( $(date +%s) - $(stat -f %m "$CACHE_FILE") )) -lt $CACHE_TTL ]; then
    cat "$CACHE_FILE"
else
    k3s_exec "kubectl get all -A" > "$CACHE_FILE"
    cat "$CACHE_FILE"
fi
```

---

## Reference Scripts

### Complete Deployment Script

See: `/tmp/deploy-via-exec.sh` - Reference implementation

### Health Check Script

See: `/tmp/verify-deployment.sh` - Cluster validation

### Network Diagnostics

See: `/tmp/test-network.sh` - Network troubleshooting

---

## Quick Reference

**Execute Command:**
```bash
curl -k -s -X POST "https://$HOST:$PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["cmd","arg1","arg2"]}'
```

**Get Result:**
```bash
curl -k -s -X GET "https://$HOST:$PORT/api2/json/nodes/pve01/qemu/$VMID/agent/exec-status?pid=$PID" \
  -H "Authorization: PVEAPIToken=$TOKEN"
```

**Check VM Status:**
```bash
curl -k -s -X GET "https://$HOST:$PORT/api2/json/nodes/pve01/qemu/$VMID/status/current" \
  -H "Authorization: PVEAPIToken=$TOKEN"
```

---

## Support and Updates

**Questions or Issues:**
- Check this document first
- Review `/tmp/*.sh` example scripts
- Test with simple commands before complex operations
- Verify token permissions if access denied

**Updates to This Document:**
- Location: `/docs/infrastructure/K3S-CLUSTER-ACCESS-VIA-PROXMOX-API.md`
- Version: 1.0.0
- Last Updated: 2025-12-14
- Maintained by: Cortex Coordinator Master

---

**Remember: This is the ONLY way to interact with the K3s cluster. No SSH, no direct network access, only Proxmox API. This pattern will be used every day by all masters and workers.**
