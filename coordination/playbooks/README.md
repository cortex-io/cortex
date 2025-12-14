# Cortex Playbooks

**Operational knowledge and standard procedures for infrastructure automation**

---

## What Are Playbooks?

Playbooks are standardized procedures that codify best practices, lessons learned, and operational knowledge. They guide Cortex agents (and humans) through complex infrastructure tasks with:

- Step-by-step instructions
- Validation checks
- Rollback procedures
- Common mistake detection
- Troubleshooting guides

## Available Playbooks

### Infrastructure

#### [vlan-provisioning.json](./vlan-provisioning.json)
**Standard VLAN Provisioning across UniFi and Proxmox**

Creates new VLANs with proper configuration to avoid common pitfalls:
- Explicit VLAN IDs (not "Auto")
- Valid bridge IPs (not network addresses)
- Physical uplinks (not empty bridge-ports)
- Zone-based firewall configuration
- Inter-VLAN routing verification

**Created:** 2025-12-14
**Based on:** K3s cluster VLAN 145 deployment lessons learned
**Use Cases:**
- Creating isolated networks for k3s clusters
- Separating security zones (DMZ, management, etc.)
- Multi-tenant network isolation

**Quick Start:**
```bash
# Use with infrastructure-contractor agent
cortex execute-playbook vlan-provisioning \
  --vlan-id 150 \
  --name "Sentinel-Forge" \
  --subnet "10.88.150.0/29" \
  --gateway "10.88.150.1" \
  --bridge-ip "10.88.150.2/29"
```

---

## Playbook Structure

Each playbook follows this structure:

```json
{
  "playbook_id": "unique-identifier",
  "name": "Human-readable name",
  "version": "1.0.0",
  "description": "What this playbook does",
  "prerequisites": { ... },
  "variables": { ... },
  "steps": [ ... ],
  "common_mistakes": [ ... ],
  "testing_checklist": [ ... ],
  "troubleshooting_flowchart": { ... },
  "lessons_learned": [ ... ]
}
```

### Key Sections

**Prerequisites:** What access and knowledge are required
**Variables:** Configurable parameters with validation rules
**Steps:** Sequential actions with rollback procedures
**Common Mistakes:** Known failure modes and how to detect/fix them
**Testing Checklist:** Verification steps to confirm success
**Troubleshooting:** Decision trees for debugging failures
**Lessons Learned:** Operational wisdom captured from real deployments

---

## Using Playbooks

### For AI Agents

Agents can reference playbooks via the MCP resource-manager:

```javascript
const playbook = await mcp.getResource('playbooks/vlan-provisioning');
const result = await agent.execute(playbook, {
  vlan_id: 145,
  vlan_name: "K3S-Cluster",
  subnet: "10.88.145.0/24"
});
```

### For Humans

Playbooks serve as checklists and troubleshooting guides:

1. Read the playbook for your task
2. Follow steps sequentially
3. Run validation commands
4. Consult troubleshooting section if issues arise

### For Documentation

Playbooks capture institutional knowledge:
- Why decisions were made
- What mistakes to avoid
- How to debug common issues
- When to escalate

---

## Creating New Playbooks

When you solve a complex infrastructure problem:

1. **Document the solution** as a playbook
2. **Include the failure modes** you encountered
3. **Add validation steps** to detect those failures
4. **Provide rollback procedures** for each step
5. **Link to related resources** (blog posts, docs, etc.)

**Template:**

```json
{
  "playbook_id": "your-playbook-id",
  "name": "Descriptive Name",
  "version": "1.0.0",
  "author": "Your Name",
  "created": "YYYY-MM-DD",
  "description": "What problem this solves",
  "category": "infrastructure|security|deployment|monitoring",

  "steps": [
    {
      "step": 1,
      "action": "what_to_do",
      "description": "Why and how",
      "commands": [ ... ],
      "verification": [ ... ],
      "rollback": "how to undo",
      "critical": true
    }
  ],

  "common_mistakes": [
    {
      "mistake": "What people typically do wrong",
      "symptom": "How it manifests",
      "fix": "Correct approach",
      "detection": "How to detect this mistake",
      "severity": "critical|high|medium|low"
    }
  ]
}
```

---

## Playbook Lifecycle

1. **Draft:** Initial creation from recent experience
2. **Review:** Validation by running through the procedure
3. **Active:** In production use, referenced by agents
4. **Refined:** Updated as new edge cases are discovered
5. **Archived:** Deprecated when infrastructure changes

---

## Integration with Cortex

Playbooks are referenced by:

- **Infrastructure Contractor:** VLAN, network, VM provisioning
- **Development Master:** Deployment procedures, environment setup
- **Security Master:** Hardening checklists, audit procedures
- **CICD Master:** Release workflows, deployment pipelines

Agents check playbooks before starting complex tasks and follow the documented procedures.

---

## Best Practices

### Writing Playbooks

- **Be explicit:** Don't assume knowledge (e.g., "Set VLAN ID to MANUAL, not AUTO")
- **Include the 'why':** Explain rationale for each step
- **Capture failures:** Document what goes wrong and how to detect it
- **Provide rollback:** Every critical step should have undo instructions
- **Test thoroughly:** Run through the playbook before committing

### Using Playbooks

- **Follow sequentially:** Don't skip validation steps
- **Document deviations:** If you need to diverge, note why
- **Update on failure:** If you find a new failure mode, add it
- **Share learnings:** Turn your experience into playbook improvements

### Maintaining Playbooks

- **Version incrementally:** Update version on significant changes
- **Link to related docs:** Connect to blog posts, case studies, official docs
- **Keep current:** Update when infrastructure patterns change
- **Archive obsolete:** Move deprecated playbooks to archive/

---

## Contributing

Found a mistake in a playbook? Discovered a new failure mode? Have a better approach?

1. Update the playbook JSON
2. Increment the version (patch for fixes, minor for additions)
3. Add to `lessons_learned` or `common_mistakes`
4. Document your contribution in git commit

---

## Future Playbooks

Planned playbooks based on upcoming work:

- `k3s-cluster-deployment.json` - Complete k3s setup
- `vm-provisioning-standard.json` - Proxmox VM creation
- `tls-certificate-deployment.json` - cert-manager setup
- `monitoring-stack-deployment.json` - Prometheus + Grafana
- `backup-strategy-implementation.json` - Backup procedures
- `disaster-recovery-plan.json` - Recovery procedures

---

**Remember:** The best playbook is the one that prevents the next person from experiencing the same pain you did. Document generously.
