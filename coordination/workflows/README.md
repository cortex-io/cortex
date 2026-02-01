# Cortex Workflow Orchestration System

Autonomous workflow management for Cortex, integrating with n8n for infrastructure automation, code validation, and remediation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CORTEX WORKFLOW SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Alert/Event     │────>│   Orchestrator   │────>│  n8n Integration │    │
│  │  (Prometheus,    │     │  (Intent Match)  │     │  (MCP/API)       │    │
│  │   GitHub, etc)   │     └────────┬─────────┘     └────────┬─────────┘    │
│  └──────────────────┘              │                        │              │
│                                    │                        │              │
│                         ┌──────────▼──────────┐             │              │
│                         │  Workflow Registry  │             │              │
│                         │  (Intent Mapping)   │             │              │
│                         └──────────┬──────────┘             │              │
│                                    │                        │              │
│                         ┌──────────▼──────────┐             │              │
│                         │  Workflow Templates │             │              │
│                         │  (JSON Definitions) │─────────────┘              │
│                         └─────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               N8N SERVER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Workflows:                                                                  │
│  • K3S Storage Expansion    • Code Validation    • MCP Lifecycle           │
│  • K3S Node Scaling         • Code Fix           • Certificate Renewal     │
│  • Proxmox VM Provision     • Backup/Restore     • Auto-Remediation        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Configure Environment

```bash
export N8N_URL="http://your-n8n-server:5678"
export N8N_API_KEY="your-api-key"
export CORTEX_ROOT="/path/to/cortex"
```

### 2. Test Connectivity

```bash
./coordination/workflows/lib/n8n-integration.sh health
./coordination/workflows/lib/workflow-orchestrator.sh test-connection
```

### 3. Trigger a Workflow

```bash
# Validate a repository
./coordination/workflows/lib/workflow-orchestrator.sh validate \
    https://github.com/ry-ops/n8n-mcp-server main fix-and-pr

# Expand storage on a k3s node
./coordination/workflows/lib/workflow-orchestrator.sh expand-storage \
    k3s-worker-01 100 105 pve01 false

# Process an alert
./coordination/workflows/lib/workflow-orchestrator.sh process-alert '{
    "labels": {
        "alertname": "K3sNodeStorageLow",
        "node": "k3s-worker-01",
        "vm_id": "105"
    },
    "status": "firing"
}'
```

## Directory Structure

```
coordination/workflows/
├── README.md              # This file
├── registry.json          # Intent-to-template mapping
├── alert-rules.json       # Alert-to-intent mapping
├── templates/             # n8n workflow JSON templates
│   ├── k3s-storage-expansion.json
│   ├── code-validation.json
│   ├── code-fix.json
│   └── ...
├── lib/                   # Shell libraries
│   ├── n8n-integration.sh     # Core n8n API functions
│   └── workflow-orchestrator.sh  # Autonomous orchestrator
├── state/                 # Runtime state
│   └── orchestrator-state.json
└── audit/                 # Audit logs
    └── YYYY-MM-DD.jsonl
```

## Workflow Registry

The registry maps **intents** to workflow templates with autonomy controls:

| Intent | Description | Auto-Execute |
|--------|-------------|--------------|
| `k3s_storage_expansion` | Expand storage on k3s nodes | Yes |
| `k3s_node_scale` | Add/remove k3s worker nodes | Yes |
| `proxmox_vm_provision` | Provision new VMs | Yes |
| `code_validation` | Lint, test, security scan | Yes |
| `code_fix` | Auto-fix code issues | Yes |
| `mcp_server_lifecycle` | Manage MCP servers | Yes |
| `backup_restore` | Backup/restore operations | Yes |
| `certificate_renewal` | Renew TLS certificates | Yes |

## Alert-to-Intent Mapping

| Alert | Intent |
|-------|--------|
| `K3sNodeStorageLow` | `k3s_storage_expansion` |
| `K3sHighCPU` | `k3s_node_scale` |
| `MCPServerDown` | `mcp_server_lifecycle` |
| `CertExpiringSoon` | `certificate_renewal` |
| `CodeQualityFailed` | `code_validation` |
| `BackupFailed` | `backup_restore` |

## Code Validation Pipeline

```bash
# Just report issues
./workflow-orchestrator.sh validate https://github.com/user/repo main report

# Fix and create PR
./workflow-orchestrator.sh validate https://github.com/user/repo main fix-and-pr
```

## n8n MCP Server Tools

When using n8n-mcp-server, these tools are available:
- `list_workflows` - Query existing workflows
- `create_workflow` - Create from JSON
- `execute_workflow` - Trigger execution
- `activate_workflow` / `deactivate_workflow`

## Security

- All actions logged to audit trail
- Autonomy limits configurable per intent
- Approval gates for destructive operations
- API keys stored via environment variables
