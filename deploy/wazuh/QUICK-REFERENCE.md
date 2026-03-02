# Wazuh Integration Quick Reference

Fast reference for common Wazuh operations with Cortex.

## Deployment

### Quick Start

```bash
# Deploy everything (interactive)
./deploy-wazuh-integration.sh

# Deploy with options
./deploy-wazuh-integration.sh \
  --wazuh-ip 10.88.140.202 \
  --namespace cortex-monitoring

# Dry run to see what would be deployed
./deploy-wazuh-integration.sh --dry-run

# Skip components
./deploy-wazuh-integration.sh \
  --skip-manager \
  --skip-webhook
```

### Manual Deployment

```bash
# 1. Deploy rules to Wazuh manager
scp wazuh-cortex-rules.xml root@10.88.140.202:/var/ossec/etc/rules/cortex-rules.xml
scp wazuh-cortex-decoders.xml root@10.88.140.202:/var/ossec/etc/decoders/cortex-decoders.xml
ssh root@10.88.140.202 'systemctl restart wazuh-manager'

# 2. Deploy agents
kubectl create namespace cortex-monitoring
kubectl apply -f wazuh-agent-daemonset.yaml

# 3. Deploy exporter
kubectl create secret generic wazuh-api-credentials \
  --from-literal=username=cortex-prometheus \
  --from-literal=password=YOUR_PASSWORD
kubectl apply -f prometheus-wazuh-exporter.yaml

# 4. Deploy webhook
kubectl apply -f alertmanager-wazuh-receiver.yaml
```

## Common Commands

### Agent Management

```bash
# List all Wazuh agents
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -l'

# Check specific agent
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -i AGENT_ID'

# View agent logs in k8s
kubectl logs -n cortex-monitoring -l app=wazuh-agent --tail=100

# Restart agents
kubectl rollout restart daemonset/wazuh-agent -n cortex-monitoring

# Check agent connectivity
kubectl exec -n cortex-monitoring -it <agent-pod> -- \
  /var/ossec/bin/wazuh-control info
```

### Rule Testing

```bash
# Test rule with sample log
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest' << EOF
{"component":"meta-agent","event_type":"authentication_failed","username":"testuser","source_ip":"192.168.1.100"}
EOF

# Test multiple logs
cat test-logs.json | ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest'

# Validate rule syntax
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest -t'

# Check rule in manager logs
ssh root@10.88.140.202 'grep "Rule: 100101" /var/ossec/logs/alerts/alerts.log | tail -20'
```

### Metrics & Monitoring

```bash
# Port-forward Prometheus exporter
kubectl port-forward -n cortex-monitoring svc/wazuh-exporter 9140:9140

# Check metrics
curl http://localhost:9140/metrics | grep wazuh_

# Key metrics to watch
curl -s http://localhost:9140/metrics | grep -E "wazuh_alerts_total|wazuh_agent_status|wazuh_rule_triggers"

# Check exporter health
curl http://localhost:9140/healthz

# View exporter logs
kubectl logs -n cortex-monitoring -l app=wazuh-exporter -f
```

### Alert Queries

```bash
# View recent critical alerts
ssh root@10.88.140.202 'grep "level: 15" /var/ossec/logs/alerts/alerts.log | tail -20'

# Count alerts by rule
ssh root@10.88.140.202 'grep "Rule:" /var/ossec/logs/alerts/alerts.log | sort | uniq -c | sort -rn | head -20'

# Search for specific alert type
ssh root@10.88.140.202 'grep "authentication_failed" /var/ossec/logs/alerts/alerts.json | jq .'

# View alerts from specific agent
ssh root@10.88.140.202 'grep "agent_name: cortex-k3s-node-1" /var/ossec/logs/alerts/alerts.log | tail -30'
```

## Rule ID Reference

Quick lookup for Cortex security rules (100100-100199):

| IDs | Category | Key Alerts |
|-----|----------|------------|
| 100100-100109 | Authentication | Failed logins, brute force, off-hours access |
| 100110-100119 | Privilege Escalation | Sudo abuse, role changes, unauthorized escalation |
| 100120-100129 | Config Changes | File modifications, secret changes, deletions |
| 100130-100139 | API Abuse | Destructive calls, rate limiting, unauthorized ops |
| 100140-100149 | K8s Audit | Resource deletion, secret access, exec commands |
| 100150-100159 | Container Escape | Privileged containers, mount attempts, namespaces |
| 100160-100169 | Secrets Access | Key access, credential enumeration, exports |
| 100170-100179 | Task Anomalies | Permission failures, token abuse, violations |
| 100180-100189 | Data Exfiltration | Large transfers, DNS tunneling, file sharing |
| 100190-100199 | System Integrity | FIM violations, malware, backdoors, miners |

## Severity Levels

| Level | Severity | Action Required |
|-------|----------|-----------------|
| 15 | Critical | Immediate response (<15 min) |
| 12 | High | Urgent investigation (<1 hour) |
| 10 | High | Investigation required (<4 hours) |
| 8 | Medium | Review within 24 hours |
| 5-7 | Low | Weekly review |
| 0-4 | Info | Monthly audit |

## Prometheus Queries

### Alert Rate Queries

```promql
# Critical alerts rate (5min)
rate(wazuh_alerts_total{severity="critical"}[5m])

# Alerts by component
sum(rate(wazuh_alerts_total[5m])) by (component)

# Top 10 triggered rules
topk(10, sum(rate(wazuh_rule_triggers_total[5m])) by (rule_id))

# Authentication failure spike
rate(wazuh_alerts_total{rule_group=~".*authentication_failed.*"}[5m]) > 0.5
```

### Agent Health Queries

```promql
# Active agents count
count(wazuh_agent_status{status="active"})

# Disconnected agents
wazuh_agent_status{status="disconnected", group=~".*cortex.*"}

# Agent message rate
rate(wazuh_agent_messages_total[5m])
```

### Security Event Queries

```promql
# Privilege escalation events
rate(wazuh_alerts_total{rule_group=~".*privilege_escalation.*"}[5m])

# Container security events
rate(wazuh_alerts_total{rule_group=~".*container_security.*"}[5m])

# Secrets access rate
rate(wazuh_alerts_total{rule_group=~".*secrets.*"}[5m])

# FIM change rate
rate(wazuh_fim_events_total[5m])
```

## Troubleshooting Cheat Sheet

### Agent Not Connecting

```bash
# 1. Check agent logs
kubectl logs -n cortex-monitoring <agent-pod>

# 2. Verify network
kubectl exec -n cortex-monitoring <agent-pod> -- telnet 10.88.140.202 1514

# 3. Check manager firewall
ssh root@10.88.140.202 'iptables -L -n | grep 1514'

# 4. Force registration
kubectl exec -n cortex-monitoring <agent-pod> -- \
  /var/ossec/bin/agent-auth -m 10.88.140.202
```

### Rules Not Triggering

```bash
# 1. Test rule
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest' < test.json

# 2. Check rule loaded
ssh root@10.88.140.202 'grep "100100" /var/ossec/logs/ossec.log'

# 3. Verify decoder
ssh root@10.88.140.202 'grep "cortex-json" /var/ossec/logs/ossec.log'

# 4. Check manager errors
ssh root@10.88.140.202 'tail -100 /var/ossec/logs/ossec.log | grep -i error'
```

### High Alert Volume

```bash
# 1. Identify noisy rules
ssh root@10.88.140.202 'grep "Rule:" /var/ossec/logs/alerts/alerts.log | \
  sort | uniq -c | sort -rn | head -10'

# 2. Disable specific rule temporarily
ssh root@10.88.140.202 'echo "<overwrite>yes</overwrite>" >> \
  /var/ossec/etc/rules/local_rules.xml'

# 3. Adjust frequency threshold
# Edit wazuh-cortex-rules.xml, change frequency="5" to frequency="10"

# 4. Add exception rule
# See README.md Alert Tuning section
```

## Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `wazuh-cortex-rules.xml` | Security rules | `/var/ossec/etc/rules/` on manager |
| `wazuh-cortex-decoders.xml` | Log parsers | `/var/ossec/etc/decoders/` on manager |
| `wazuh-agent-config.yaml` | Agent config | ConfigMap in k8s |
| `prometheus-wazuh-exporter.yaml` | Metrics exporter | Deployed to k8s |
| `alertmanager-wazuh-receiver.yaml` | Alert forwarding | Deployed to k8s |

## Log Locations

### Wazuh Manager (10.88.140.202)

```bash
# Manager logs
/var/ossec/logs/ossec.log

# Alert logs (JSON)
/var/ossec/logs/alerts/alerts.json

# Alert logs (formatted)
/var/ossec/logs/alerts/alerts.log

# Archive logs
/var/ossec/logs/archives/archives.log

# FIM logs
/var/ossec/logs/fim.log

# Agent logs
/var/ossec/logs/agent.log
```

### Cortex Nodes

```bash
# Cortex component logs
/var/log/cortex/meta-agent/*.log
/var/log/cortex/masters/**/*.log
/var/log/cortex/workers/**/*.log
/var/log/cortex/contractors/**/*.log

# K8s audit logs
/var/log/kubernetes/audit/audit.log

# Container logs
/var/log/containers/cortex-*.log

# Wazuh agent logs
kubectl logs -n cortex-monitoring -l app=wazuh-agent
```

## API Endpoints

### Wazuh Manager API

```bash
# Base URL
https://10.88.140.202:55000

# Get authentication token
curl -k -u cortex-prometheus:PASSWORD \
  https://10.88.140.202:55000/security/user/authenticate

# List agents
curl -k -H "Authorization: Bearer TOKEN" \
  https://10.88.140.202:55000/agents

# Get alerts
curl -k -H "Authorization: Bearer TOKEN" \
  https://10.88.140.202:55000/alerts

# Get rules
curl -k -H "Authorization: Bearer TOKEN" \
  https://10.88.140.202:55000/rules?rule_ids=100100-100199
```

### Prometheus Exporter

```bash
# Metrics endpoint
http://wazuh-exporter.cortex-monitoring.svc.cluster.local:9140/metrics

# Health check
http://wazuh-exporter.cortex-monitoring.svc.cluster.local:9140/healthz

# Readiness
http://wazuh-exporter.cortex-monitoring.svc.cluster.local:9140/ready
```

## Dashboard Access

```bash
# Wazuh Dashboard (Kibana)
https://10.88.140.202:5601

# Default credentials (change after first login)
# Username: admin
# Password: (check with Wazuh admin)

# Key views:
# - Security Events: Main dashboard
# - Security Configuration Assessment: Compliance scans
# - File Integrity Monitoring: FIM events
# - Vulnerability Detection: CVE findings
# - Agents: Agent health and inventory
```

## Maintenance Schedule

### Daily

- Check agent connectivity
- Review critical alerts (level 12+)
- Monitor alert volume trends

### Weekly

- Update Wazuh agents
- Review false positives
- Tune noisy rules
- Backup configurations

### Monthly

- Update custom rules
- Review compliance scans
- Archive old alerts
- Update documentation

## Useful One-Liners

```bash
# Count alerts by severity (last hour)
ssh root@10.88.140.202 'grep -E "level: (12|15)" \
  /var/ossec/logs/alerts/alerts.log | \
  awk "{print \$3}" | sort | uniq -c'

# Find slowest responding agents
kubectl exec -n cortex-monitoring -it wazuh-exporter-<pod> -- \
  curl -s http://localhost:9140/metrics | \
  grep wazuh_agent_last_keepalive | \
  awk '{print $2}' | sort -rn | head -5

# Export alerts to JSON (last 100)
ssh root@10.88.140.202 'tail -100 /var/ossec/logs/alerts/alerts.json' | \
  jq -s '.' > wazuh-alerts-$(date +%Y%m%d).json

# Check if specific rule ever triggered
ssh root@10.88.140.202 'grep -c "Rule: 100101" \
  /var/ossec/logs/alerts/alerts.log'

# Find agents with most alerts
ssh root@10.88.140.202 'grep "agent_name:" \
  /var/ossec/logs/alerts/alerts.log | \
  sort | uniq -c | sort -rn | head -10'

# Monitor live alerts (tail -f equivalent)
ssh root@10.88.140.202 'tail -f /var/ossec/logs/alerts/alerts.log | \
  grep --line-buffered "level: 1[0-5]"'
```

## Support & Documentation

- **Wazuh Docs**: https://documentation.wazuh.com/current/
- **Cortex Security Team**: security@cortex.local
- **On-Call**: PagerDuty integration for critical alerts
- **Slack Channels**:
  - `#cortex-security` - Security alerts and incidents
  - `#cortex-monitoring` - Monitoring and metrics
  - `#wazuh-alerts` - Automated alert notifications

## Version

- **Integration Version**: 1.0.0
- **Last Updated**: 2025-12-11
- **Wazuh Version**: 4.7.0
- **Compatible Cortex Versions**: >= 2.0.0
