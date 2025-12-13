# Ansible Automation - Quick Start Guide

Get up and running with Cortex automation in 5 minutes.

## Installation

```bash
# 1. Ensure Ansible is installed
which ansible-playbook || brew install ansible

# 2. Verify jq is installed
which jq || brew install jq

# 3. Make scripts executable (if not already)
chmod +x automation/ansible/tracking/*.sh
chmod +x automation/ansible/self-improvement/*.sh
```

## Your First Automated Task

### Example: Integrate a New MCP Server

Let's say you want to integrate `terraform-mcp-server` into Cortex.

**Manual Way** (45 minutes):
- Clone repository
- Create monitoring config
- Write health check script
- Create security scan
- Write documentation
- Update inventory
- Log events
- Commit changes

**Automated Way** (5 minutes):

```bash
# Run the MCP integration playbook
ansible-playbook automation/ansible/playbooks/mcp-server-integration.yml
```

**Prompts**:
```
Enter MCP repository name: terraform-mcp-server
Enter GitHub organization: ry-ops
Enter primary language: Python
Enter package manager: uv
Enter primary function: Terraform infrastructure management
Does this MCP server require API keys?: yes
```

**That's it!** The playbook will:
1. Clone the repository to `/Users/ryandahlberg/Projects/terraform-mcp-server`
2. Create monitoring configuration
3. Generate health check script
4. Create security scan task
5. Generate integration documentation
6. Update repository inventory
7. Log dashboard event

**Review the output**:
```bash
# Check generated files
ls -la coordination/monitoring/terraform-mcp-server.json
ls -la scripts/monitoring/check-terraform-mcp-server-health.sh
ls -la coordination/tasks/terraform-mcp-server-security-scan.json
ls -la docs/integrations/terraform-mcp-server-integration.md

# Run health check
./scripts/monitoring/check-terraform-mcp-server-health.sh
```

### Track Time Savings

```bash
# Log the automated execution
./automation/ansible/tracking/task-frequency-logger.sh \
  -t mcp-integration \
  -n terraform-mcp-server \
  -d 5 \
  --automated
```

## Build Your Automation Library

### Step 1: Start Logging Tasks (Week 1)

Every time you complete a task, log it:

```bash
# After manually integrating an MCP server (45 min)
./automation/ansible/tracking/task-frequency-logger.sh \
  -t mcp-integration \
  -n cloudflare-mcp-server \
  -d 45 \
  --manual

# After creating a health check script (30 min)
./automation/ansible/tracking/task-frequency-logger.sh \
  -t health-check-creation \
  -n unifi-health-check \
  -d 30 \
  --manual

# After logging a dashboard event (3 min)
./automation/ansible/tracking/task-frequency-logger.sh \
  -t dashboard-event-logging \
  -n integration-complete \
  -d 3 \
  --manual
```

### Step 2: Analyze Patterns (Week 2)

After logging 10+ tasks:

```bash
# Score automation candidates
./automation/ansible/tracking/automation-candidate-scorer.sh
```

**Output**:
```
Top Automation Candidates:

Rank 1: mcp-integration
  Occurrences: 7 times
  Total Time: 315 minutes (5h 15m)
  Avg Time: 45 minutes
  Automation Score: 95
  Time Savings Potential: ~21h/year
  Recent Tasks: cloudflare-mcp-server, unifi-mcp-server, n8n-mcp-server
```

### Step 3: Use Playbooks (Week 2-3)

Start automating high-ROI tasks:

```bash
# MCP Integration (ROI: 100)
ansible-playbook automation/ansible/playbooks/mcp-server-integration.yml

# Dashboard Event Logging (ROI: 97)
ansible-playbook automation/ansible/playbooks/log-dashboard-event.yml

# Security Scan Creation (ROI: 93)
ansible-playbook automation/ansible/playbooks/create-security-scan.yml
```

### Step 4: Track ROI (Week 3-4)

Monitor your automation effectiveness:

```bash
# Run the self-improvement loop
./automation/ansible/self-improvement/automation-feedback-loop.sh
```

**Output**:
```
Automation ROI:
  Time saved: 12.5 hours
  Automation efficiency: 88%
  Automated executions: 15

Status: Excellent adoption rate!
```

### Step 5: Schedule Continuous Improvement (Week 4+)

Let Cortex monitor its own automation:

```bash
# Set up daily analysis at 8 AM
./automation/ansible/self-improvement/schedule-improvement-loop.sh
```

## Common Tasks - Quick Reference

### Log a Dashboard Event

```bash
ansible-playbook automation/ansible/playbooks/log-dashboard-event.yml
```
**Prompts**: event_type, severity, component, message, source
**Time**: <1 minute (vs 3 minutes manual)

### Create Security Scan

```bash
ansible-playbook automation/ansible/playbooks/create-security-scan.yml
```
**Prompts**: repo_name, repo_org, language, package_manager, priority, has_api_keys
**Time**: ~3 minutes (vs 15 minutes manual)

### Integrate MCP Server

```bash
ansible-playbook automation/ansible/playbooks/mcp-server-integration.yml
```
**Prompts**: repo_name, repo_org, language, package_manager, primary_function, api_keys_required
**Time**: ~5 minutes (vs 45 minutes manual)

## Tracking Your Progress

### View All Logged Tasks

```bash
cat automation/ansible/tracking/frequency/task-frequency.jsonl | jq
```

### View Automation Candidates

```bash
cat automation/ansible/tracking/candidates/automation-candidates.json | jq
```

### View Playbook Recommendations

```bash
cat automation/ansible/tracking/candidates/playbook-triggers.json | jq
```

### View ROI Metrics

```bash
cat automation/ansible/self-improvement/roi-tracker.json | jq
```

### View Feedback Log

```bash
cat automation/ansible/self-improvement/feedback-log.jsonl | jq
```

## Decision Points

### After 10 Tasks Logged
**Question**: Do I see repetitive patterns?
- **Yes** → Run automation-candidate-scorer.sh
- **No** → Keep logging, check again at 20 tasks

### After Seeing High-ROI Candidates
**Question**: Is the playbook development time worth it?
- **ROI > 80** → Definitely automate
- **ROI 50-80** → Probably automate
- **ROI < 50** → Monitor longer or stay manual

### After 30 Days
**Question**: Is automation helping?
- **Time saved > 5 hours** → Continue and expand
- **Time saved 2-5 hours** → Continue, monitor
- **Time saved < 2 hours** → Reassess or discontinue

## Troubleshooting

### Playbook won't run
```bash
# Check Ansible installation
ansible-playbook --version

# Verify playbook syntax
ansible-playbook --syntax-check automation/ansible/playbooks/mcp-server-integration.yml

# Run with verbose output
ansible-playbook -vvv automation/ansible/playbooks/mcp-server-integration.yml
```

### Templates not found
```bash
# Verify templates exist
ls -la automation/ansible/playbooks/templates/

# Check file paths in playbook
grep "template:" automation/ansible/playbooks/mcp-server-integration.yml
```

### No automation candidates
```bash
# Check how many tasks are logged
wc -l automation/ansible/tracking/frequency/task-frequency.jsonl

# Need at least 10 tasks for meaningful analysis
# Keep logging!
```

## Next Steps

1. **Log 10 tasks** → Build baseline data
2. **Analyze patterns** → Identify high-ROI opportunities
3. **Use playbooks** → Start saving time
4. **Track ROI** → Measure actual savings
5. **Schedule loop** → Automate the automation analysis

## Get Help

- **Full Documentation**: `automation/ansible/README.md`
- **Pattern Analysis**: `automation/ansible/tracking/repetitive-patterns.json`
- **Self-Improvement Logs**: `automation/ansible/self-improvement/loop-output.log`

## Success Metrics

Track these over 30 days:

- [ ] 20+ tasks logged
- [ ] 10+ automated executions
- [ ] 5+ hours time saved
- [ ] 50%+ automation adoption rate
- [ ] 3+ playbooks actively used

If you hit these metrics, automation is working. If not, reassess.

---

**Remember**: Track everything. Automate what makes sense. Choose your own adventure.
