#!/usr/bin/env python3
"""
Update repository inventory with Cloudflare MCP Server integration details
"""

import json
import sys
from pathlib import Path

CORTEX_ROOT = Path("/Users/ryandahlberg/Projects/cortex")
INVENTORY_FILE = CORTEX_ROOT / "coordination/repository-inventory.json"

cloudflare_integration = {
    "created_at": "2025-10-05T15:24:45Z",
    "default_branch": "main",
    "description": "A Model Context Protocol (MCP) server that provides seamless integration with the Cloudflare API. Manages DNS, zones, Workers KV storage, cache operations, and analytics.",
    "forks": 1,
    "health_status": "active",
    "is_archived": False,
    "language": "Python",
    "last_cataloged": "2025-12-13T08:19:00Z",
    "last_commit": "2025-10-05T20:40:56Z",
    "name": "ry-ops/cloudflare-mcp-server",
    "open_issues": 0,
    "stars": 0,
    "status": "active",
    "url": "https://github.com/ry-ops/cloudflare-mcp-server",
    "visibility": "public",
    "project_type": "mcp-server",
    "tech_stack": {
        "language": "Python",
        "version": "3.10+",
        "framework": "MCP",
        "package_manager": "uv",
        "key_dependencies": ["mcp>=1.1.2", "httpx>=0.27.0"]
    },
    "features": [
        "Zone management (list, get zone info)",
        "DNS management (list, create, update, delete records)",
        "Workers KV storage (CRUD operations)",
        "Cache management (purge operations)",
        "Zone analytics (requests, bandwidth, threats)",
        "A2A protocol support with agent card",
        "13 tools across 5 skill categories"
    ],
    "a2a_protocol": {
        "enabled": True,
        "agent_card": "agent-card.json",
        "capabilities": {
            "streaming": True,
            "tasks": True,
            "async": True,
            "batch_operations": False
        },
        "skills": [
            "zone_management",
            "dns_management",
            "kv_storage",
            "cache_management",
            "analytics"
        ]
    },
    "cortex_integration": {
        "security_scanning": True,
        "dependency_monitoring": True,
        "automated_updates": False,
        "integrated_at": "2025-12-13T08:19:00Z",
        "local_clone": True,
        "local_path": "/Users/ryandahlberg/Projects/cloudflare-mcp-server",
        "last_pulled": "2025-12-13T08:19:00Z",
        "monitoring": {
            "enabled": True,
            "config_file": "coordination/monitoring/cloudflare-mcp-server.json",
            "health_check_script": "scripts/monitoring/cloudflare-health-check.sh",
            "metrics_collection": True,
            "check_interval": 300,
            "dashboard_endpoints": [
                "/api/cloudflare/status",
                "/api/cloudflare/metrics",
                "/api/cloudflare/health-checks",
                "/api/cloudflare/zones",
                "/api/cloudflare/analytics"
            ]
        },
        "security": {
            "scan_config": "coordination/tasks/cloudflare-mcp-security-scan.json",
            "scan_schedule": "daily",
            "vulnerability_tracking": True,
            "secrets_detection": True,
            "dependency_scanning": True,
            "api_security_checks": True,
            "compliance_frameworks": ["OWASP", "CIS", "NIST"]
        },
        "features_integrated": [
            "Health monitoring and alerting",
            "Cloudflare API connectivity checks",
            "DNS/CDN metrics tracking",
            "Zone analytics monitoring",
            "Security vulnerability scanning",
            "Dashboard widgets for DNS and CDN metrics",
            "API performance monitoring",
            "KV storage operations tracking"
        ],
        "security_considerations": [
            "API tokens stored in environment variables only",
            "Tokens require scoped permissions (minimum: Zone-Read, DNS-Edit)",
            "Account ID optional but required for KV operations",
            "Regular token rotation recommended",
            "TLS certificate verification enforced",
            "API timeout configurations validated",
            "Error handling prevents sensitive data leakage"
        ],
        "integration_files": {
            "monitoring_config": "coordination/monitoring/cloudflare-mcp-server.json",
            "health_check": "scripts/monitoring/cloudflare-health-check.sh",
            "security_task": "coordination/tasks/cloudflare-mcp-security-scan.json",
            "dashboard_endpoints": "eui-dashboard/server/index.js",
            "documentation": "docs/integrations/cloudflare-mcp-server-integration.md"
        }
    }
}

def main():
    # Read current inventory
    with open(INVENTORY_FILE, 'r') as f:
        inventory = json.load(f)

    # Find and update cloudflare-mcp-server entry
    updated = False
    for i, repo in enumerate(inventory['repositories']):
        if repo['name'] == 'ry-ops/cloudflare-mcp-server':
            inventory['repositories'][i] = cloudflare_integration
            updated = True
            print(f"Updated cloudflare-mcp-server entry at index {i}")
            break

    if not updated:
        print("Error: cloudflare-mcp-server not found in inventory", file=sys.stderr)
        sys.exit(1)

    # Update metadata
    inventory['last_integration_update'] = "2025-12-13T08:19:00Z"

    # Write back to file
    with open(INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f, indent=2)

    print(f"Successfully updated {INVENTORY_FILE}")
    print("Integration details added for cloudflare-mcp-server")

if __name__ == '__main__':
    main()
