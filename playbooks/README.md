# Cortex Ansible Playbooks Library

This directory contains Ansible playbooks used by the Cortex automation system through the ansible-mcp-server integration.

## Directory Structure

```
playbooks/
├── proxmox/          # Proxmox virtualization playbooks
├── k3s/              # K3s Kubernetes cluster playbooks
├── security/         # Security hardening playbooks
├── deployment/       # Application deployment playbooks
├── maintenance/      # System maintenance playbooks
├── backup/           # Backup automation playbooks
└── README.md         # This file
```

## Playbook Patterns

Playbooks in this library are tracked in the development master's knowledge base:
`/Users/ryandahlberg/Projects/cortex/coordination/masters/development/knowledge-base/ansible-patterns.jsonl`

## Integration with Cortex

These playbooks are executed via:
- **ansible-mcp-server**: MCP server providing Ansible automation
- **Development Master**: Infrastructure and configuration tasks
- **CI/CD Master**: Automated deployment pipelines
- **Security Master**: Security hardening and compliance

## Usage

### Via Development Master

The development master spawns workers that use ansible-mcp-server to execute playbooks:

```bash
# Example: Provision a new Proxmox VM
./scripts/run-development-master.sh --task="provision-vm" --playbook="proxmox/vm-provisioning.yml"
```

### Via ansible-mcp-server

Direct execution through the MCP server:

```json
{
  "tool": "run_playbook",
  "params": {
    "playbook_path": "/Users/ryandahlberg/Projects/cortex/playbooks/k3s/node-setup.yml",
    "inventory": "inventory/production",
    "check_mode": true
  }
}
```

## Playbook Standards

All playbooks should follow these standards:

1. **Safety First**: Include check mode support
2. **Idempotent**: Safe to run multiple times
3. **Documented**: Clear description and variable documentation
4. **Tagged**: Use tags for selective execution
5. **Tested**: Test in check mode before production
6. **Logged**: All executions are automatically logged

## Creating New Playbooks

1. Create playbook in appropriate subdirectory
2. Add entry to `ansible-patterns.jsonl`
3. Test with check mode: `ansible-playbook --check playbook.yml`
4. Document in playbook header
5. Tag appropriately for selective execution

## Example Playbook Template

```yaml
---
# Playbook: Description of what this does
# Tags: tag1, tag2, tag3
# Author: Cortex Development Team
# Integration: ansible-mcp-server

- name: Playbook Name
  hosts: target_hosts
  become: yes

  vars:
    # Variable definitions

  tasks:
    - name: Task description
      module:
        parameter: value
      tags:
        - tag1
```

## Testing Playbooks

Always test before production:

```bash
# Syntax check
ansible-playbook --syntax-check playbook.yml

# Lint check
ansible-lint playbook.yml

# Check mode (dry run)
ansible-playbook --check --diff playbook.yml

# Limited execution
ansible-playbook --limit staging playbook.yml
```

## Monitoring

Playbook executions are monitored via:
- **Execution Logs**: `~/.ansible-mcp-server/logs/`
- **Metrics**: `/Users/ryandahlberg/Projects/cortex/coordination/monitoring/ansible-metrics.json`
- **Health Checks**: Automated via `check-ansible-mcp-health.sh`
- **Dashboard**: Real-time metrics on Cortex dashboard

## Best Practices

1. **Use Check Mode**: Always test with `--check` first
2. **Tag Everything**: Enable selective execution
3. **Document Variables**: Clear variable descriptions
4. **Handle Errors**: Use `block/rescue` for error handling
5. **Verify State**: Include verification tasks
6. **Log Changes**: Let ansible-mcp-server handle logging

## Support

For issues or questions:
- Development Master: `/Users/ryandahlberg/Projects/cortex/scripts/run-development-master.sh`
- Integration Docs: `/Users/ryandahlberg/Projects/cortex/docs/integrations/ansible-mcp-server-integration.md`
- MCP Server Docs: `/Users/ryandahlberg/Projects/ansible-mcp-server/README.md`

---

Created: 2025-12-13
Part of the Cortex automation ecosystem
