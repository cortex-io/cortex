# Wazuh + n8n + MCP Deployment Verification Report

**Generated:** 2025-12-14 13:38:15 UTC
**K3s Cluster:** 10.88.145.180
**Deployment Location:** /Users/ryandahlberg/Projects/cortex/k8s/wazuh-n8n-deployment

---

## Executive Summary

## Namespace: wazuh
```

```

**Status:** ⚠️ Some pods not running (/)

## Namespace: n8n
```

```

**Status:** ⚠️ Some pods not running (/)

## Namespace: mcp
```

```

**Status:** ⚠️ Some pods not running (/)

## StatefulSets Status
### wazuh/wazuh-indexer
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ Not ready (0/1)

### n8n/n8n-postgres
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ Not ready (0/1)

## Services Status
### wazuh/wazuh-indexer
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### wazuh/wazuh-manager
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### wazuh/wazuh-dashboard
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### n8n/n8n-postgres
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### n8n/n8n
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### mcp/wazuh-mcp-server
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

### mcp/n8n-mcp-server
```
ssh: connect to host 10.88.145.180 port 22: Network is unreachable
```
**Status:** ⚠️ No endpoints

## Service Connectivity Tests
### Wazuh MCP Server Health
- **URL:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health
- **Status:** ⚠️ Failed: ssh: connect to host 10.88.145.180 port 22: Network is unreachable
FAILED

### n8n MCP Server Health
- **URL:** http://n8n-mcp-server.mcp.svc.cluster.local:3001/health
- **Status:** ⚠️ Failed: ssh: connect to host 10.88.145.180 port 22: Network is unreachable
FAILED

### n8n Health Check
- **URL:** http://n8n.n8n.svc.cluster.local:5678/healthz
- **Status:** ⚠️ Failed: ssh: connect to host 10.88.145.180 port 22: Network is unreachable
FAILED

## Wazuh API Verification
- **Status:** ✅ API authentication successful
- **Token obtained:** Yes

## Access Information

### Wazuh Dashboard
- **Status:** ⚠️ NodePort not available

### n8n
- **Internal URL:** http://n8n.n8n.svc.cluster.local:5678
- **Webhook URL:** http://n8n.n8n.svc.cluster.local:5678/webhook/
- **Note:** Requires port-forward or ingress for external access

### MCP Servers
- **Wazuh MCP:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000
- **n8n MCP:** http://n8n-mcp-server.mcp.svc.cluster.local:3001

## Resource Usage

### Namespace: wazuh
```
