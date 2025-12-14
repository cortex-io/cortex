# K3s Operations Quick Reference Card

**For daily use by all Cortex masters and workers**

---

## 🚀 Quick Start

```bash
# Load credentials
source /coordination/config/proxmox-credentials.sh
source /coordination/config/anthropic-credentials.sh

# Verify loaded
echo "Proxmox: ${PROXMOX_TOKEN:0:30}..."
echo "K3s Master: VM $K3S_MASTER_VMID"
```

---

## 📋 Common Commands

### Deploy Manifest

```bash
VMID=310
MANIFEST_B64=$(base64 < /path/to/manifest.yaml | tr -d '\n')

# Write file
curl -k -s -X POST \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"command\":[\"bash\",\"-c\",\"echo '$MANIFEST_B64' | base64 -d > /tmp/deploy.yaml\"]}"

# Apply
curl -k -s -X POST \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["kubectl","apply","-f","/tmp/deploy.yaml"]}'
```

### Check Pod Status

```bash
VMID=310

response=$(curl -k -s -X POST \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["kubectl","get","pods","-n","cortex-system"]}')

pid=$(echo "$response" | jq -r '.data.pid')
sleep 3

curl -k -s -X GET \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec-status?pid=$pid" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  | jq -r '.data["out-data"]' | base64 -d
```

### Scale Deployment

```bash
VMID=310

curl -k -s -X POST \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["kubectl","scale","deployment","coordinator-master","-n","cortex-system","--replicas=3"]}'
```

### Get Logs

```bash
VMID=310
POD="coordinator-master-abc123"

response=$(curl -k -s -X POST \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"command\":[\"kubectl\",\"logs\",\"$POD\",\"-n\",\"cortex-system\",\"--tail=50\"]}")

pid=$(echo "$response" | jq -r '.data.pid')
sleep 3

curl -k -s -X GET \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/exec-status?pid=$pid" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  | jq -r '.data["out-data"]' | base64 -d
```

---

## 🔧 Helper Function

```bash
k3s_exec() {
    local cmd="$1"
    local vmid="${2:-$K3S_MASTER_VMID}"
    local wait="${3:-3}"

    response=$(curl -k -s -X POST \
        "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$vmid/agent/exec" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"command\":[\"bash\",\"-c\",\"$cmd\"]}")

    pid=$(echo "$response" | jq -r '.data.pid')
    [ -z "$pid" ] && echo "Error: No PID" && return 1

    sleep "$wait"

    result=$(curl -k -s -X GET \
        "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$vmid/agent/exec-status?pid=$pid" \
        -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN")

    exitcode=$(echo "$result" | jq -r '.data.exitcode')
    stdout=$(echo "$result" | jq -r '.data["out-data"]' | base64 -d 2>/dev/null)

    echo "$stdout"
    return "$exitcode"
}

# Usage
k3s_exec "kubectl get nodes"
k3s_exec "kubectl get pods -n cortex-system"
```

---

## 🎯 One-Liners

```bash
# Check cluster health
k3s_exec "kubectl get nodes"

# List all cortex pods
k3s_exec "kubectl get pods -n cortex-system"

# Get all deployments
k3s_exec "kubectl get deployments -n cortex-system"

# Check services
k3s_exec "kubectl get svc -n cortex-system"

# Get PVCs
k3s_exec "kubectl get pvc -n cortex-system"

# Describe pod
k3s_exec "kubectl describe pod POD_NAME -n cortex-system"

# Restart deployment
k3s_exec "kubectl rollout restart deployment/coordinator-master -n cortex-system"

# Delete pod
k3s_exec "kubectl delete pod POD_NAME -n cortex-system"
```

---

## 📊 VM Status

```bash
# Check VM status
curl -k -s -X GET \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$K3S_MASTER_VMID/status/current" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  | jq -r '.data.status'

# Get VM info
curl -k -s -X GET \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$K3S_MASTER_VMID/status/current" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  | jq '{status: .data.status, uptime: .data.uptime, cpus: .data.cpus}'
```

---

## ⚡ Variables Reference

```bash
# From proxmox-credentials.sh
$PROXMOX_TOKEN          # API token
$PROXMOX_HOST           # 10.88.140.164
$PROXMOX_PORT           # 8006
$PROXMOX_NODE           # pve01
$PROXMOX_API_BASE       # Full API URL

$K3S_MASTER_VMID        # 310
$K3S_WORKER1_VMID       # 311
$K3S_WORKER2_VMID       # 312

$K3S_MASTER_IP          # 10.88.145.180
$K3S_WORKER1_IP         # 10.88.145.181
$K3S_WORKER2_IP         # 10.88.145.182

# From anthropic-credentials.sh
$ANTHROPIC_API_KEY      # Claude API key
$ANTHROPIC_MODEL        # claude-sonnet-4-5-20250929
```

---

## 🚨 Troubleshooting

**No PID returned:**
```bash
# Check guest agent is running
curl -k -s -X GET \
  "$PROXMOX_API_BASE/nodes/$PROXMOX_NODE/qemu/$VMID/agent/info" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN"
```

**Base64 decode fails:**
```bash
# Always check if data exists first
stdout_b64=$(echo "$result" | jq -r '.data["out-data"] // empty')
[ -n "$stdout_b64" ] && echo "$stdout_b64" | base64 -d || echo "No output"
```

**Command timeout:**
```bash
# Increase wait time for long commands
sleep 10  # instead of 3
```

---

## 📚 Full Documentation

- **Complete Guide:** `/docs/infrastructure/K3S-CLUSTER-ACCESS-VIA-PROXMOX-API.md`
- **Credentials:** `/coordination/config/API-KEYS-AND-CREDENTIALS.md`
- **This Quick Reference:** `/docs/infrastructure/QUICK-REFERENCE-K3S-OPERATIONS.md`

---

**Print this reference and keep it handy - you'll use it every day!**
