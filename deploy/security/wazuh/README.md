# Wazuh SIEM Integration for Cortex Monitoring

Comprehensive Wazuh integration for Cortex automation system security monitoring and alerting.

## Overview

This integration connects Cortex monitoring with Wazuh SIEM to provide:

- **Security Event Detection**: Real-time monitoring of Cortex agent failures, unauthorized access, and configuration drift
- **File Integrity Monitoring**: Track changes to critical Cortex configuration and deployment files
- **Vulnerability Management**: Automated scanning and alerting for security vulnerabilities
- **Bidirectional Alert Flow**: Correlation between Prometheus infrastructure metrics and Wazuh security events
- **Unified Dashboard**: Single pane of glass for security and operational monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               Wazuh Server (10.88.140.202)              │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Manager    │  │   Indexer    │  │  Dashboard   │ │
│  │ Custom Rules │  │  Alert Store │  │  Cortex View │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
         ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
         │ k3s-m   │ │k3s-w-1 │ │k3s-w-2 │
         │Agent 003│ │Agent001│ │Agent002│
         │  FIM    │ │  FIM   │ │  FIM   │
         └─────────┘ └────────┘ └────────┘
              │           │           │
         ┌────▼───────────▼───────────▼────┐
         │    Cortex Coordination Files    │
         │  /coordination/masters/*/       │
         │  /deploy/monitoring/            │
         │  /deploy/security/              │
         └─────────────────────────────────┘
```

## Components

### 1. cortex-rules.xml
**Purpose**: Custom Wazuh detection rules for Cortex events

**Rule ID Range**: 100100-100199 (Reserved for Cortex)

**Rule Categories**:
- **100100-100109**: Agent failures and recovery
- **100110-100119**: Token management and exhaustion
- **100120-100129**: Worker timeouts and task failures
- **100130-100139**: MCP server connectivity
- **100140-100149**: Security events and unauthorized access
- **100150-100159**: Configuration drift detection
- **100160-100169**: Performance and error rates
- **100170-100179**: N8N workflow integration
- **100180-100189**: Dashboard and metrics
- **100190-100199**: General operations

**Severity Mapping**:
| Level | Severity | Response Time | Examples |
|-------|----------|---------------|----------|
| 0-4 | Informational | None | Startup, task completion |
| 5-7 | Low-Medium | Daily review | Token warnings, queue alerts |
| 8-11 | Medium-High | <1 hour | Worker timeouts, config drift |
| 12+ | Critical | Immediate | Unauthorized access, agent failures |

### 2. cortex-decoders.xml
**Purpose**: Parse and extract fields from Cortex JSON logs

**Extracted Fields**:
- `agent_type`: Master, worker, coordinator
- `task_id`: Unique task identifier
- `token_count`: Token consumption metrics
- `error_type`: Error classification
- `worker_id`, `worker_type`: Worker process details
- `workflow_id`, `execution_id`: N8N workflow tracking
- `mcp_server`, `connection_status`: MCP connectivity
- `cve_id`, `cvss_score`: Vulnerability details

### 3. fim-cortex.conf
**Purpose**: File Integrity Monitoring for critical Cortex files

**Monitored Paths**:
```
/Users/ryandahlberg/Projects/cortex/coordination/     # Master state, handoffs
/Users/ryandahlberg/Projects/cortex/deploy/           # K8s manifests
/Users/ryandahlberg/Projects/cortex/scripts/          # Automation scripts
/Users/ryandahlberg/Projects/cortex/agents/           # Agent definitions
```

**Scan Settings**:
- **Frequency**: Every 6 hours
- **Real-time**: Enabled for critical paths
- **Report Changes**: Yes (diff tracking)
- **Alert on**: New files, modifications, deletions, permission changes

**Exclusions**:
- `node_modules/`, `.git/`
- `*.log`, `*.tmp`, `*.swp`
- `package-lock.json`, `yarn.lock`
- Build artifacts (`dist/`, `build/`)

### 4. wazuh-prometheus-integration.yaml
**Purpose**: Export Wazuh alerts as Prometheus metrics

**Metrics Exported**:
```
wazuh_alerts_total{severity, rule_id, rule_group, agent_id}
wazuh_agent_status{agent_id, agent_name, status}
wazuh_fim_events_total{agent_id, event_type, path}
wazuh_vulnerabilities_total{agent_id, severity, cve_id}
```

**Components**:
- **wazuh-exporter**: Python service polling Wazuh API
- **ServiceMonitor**: Prometheus scrape configuration
- **PrometheusRules**: Alert rules based on Wazuh metrics

**Alert Examples**:
- `WazuhAgentDisconnected`: Agent offline >5 minutes
- `CortexAgentFailure`: Cortex agent errors detected
- `CortexMCPFailure`: MCP server connectivity issues
- `WazuhFileIntegrityViolation`: Unauthorized file changes

### 5. alertmanager-wazuh-webhook.yaml
**Purpose**: Send Prometheus alerts back to Wazuh for correlation

**Alert Routing**:
```
Critical Alerts    -> Wazuh + PagerDuty + Slack
Security Alerts    -> Wazuh + Security Team Email
Cortex Alerts      -> Wazuh + N8N Auto-Remediation
Wazuh Agent Alerts -> N8N Recovery Workflow
```

**Bidirectional Flow**:
1. Wazuh detects security event → Prometheus metric
2. Prometheus fires alert → Sent to Wazuh via webhook
3. Wazuh correlates: infrastructure + security events
4. Unified view in Wazuh dashboard

## Installation

### Prerequisites

1. **Wazuh Server**: Version 4.14.1+ running at `10.88.140.202`
2. **Wazuh Agents**: Installed on k3s nodes (001, 002, 003)
3. **Kubernetes Cluster**: k3s cluster with Prometheus/Grafana stack
4. **SSH Access**: To Wazuh server and k3s nodes
5. **Credentials**: Wazuh admin credentials (see `/infrastructure-docs/monitoring/wazuh-integration.md`)

### Step 1: Deploy Wazuh Rules and Decoders

```bash
# SSH to Wazuh server
ssh wazuh@10.88.140.202
# Password: WazuhServer2024!

# Backup existing rules
sudo cp /var/ossec/etc/rules/local_rules.xml /var/ossec/etc/rules/local_rules.xml.backup

# Copy cortex-rules.xml content to local_rules.xml
sudo nano /var/ossec/etc/rules/local_rules.xml
# Paste contents of cortex-rules.xml

# Copy cortex-decoders.xml to local_decoder.xml
sudo nano /var/ossec/etc/decoders/local_decoder.xml
# Paste contents of cortex-decoders.xml

# Test rule syntax
sudo /var/ossec/bin/wazuh-logtest
# Enter sample log: {"agent_type":"security","task_id":"task-001","error_type":"timeout"}
# Verify it matches cortex rules

# Restart Wazuh manager to apply rules
sudo systemctl restart wazuh-manager

# Verify rules loaded
sudo grep "Rules loaded" /var/ossec/logs/ossec.log
sudo grep "cortex" /var/ossec/logs/ossec.log
```

### Step 2: Configure File Integrity Monitoring

**On k3s-master (or node monitoring Cortex)**:

```bash
# SSH to k3s-master
ssh debian@10.88.145.170

# Backup existing agent config
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup

# Edit agent configuration
sudo nano /var/ossec/etc/ossec.conf

# Add or replace <syscheck> section with contents from fim-cortex.conf
# NOTE: Adjust paths if Cortex is on different mount point

# Test configuration
sudo /var/ossec/bin/wazuh-control check-config

# Restart Wazuh agent
sudo systemctl restart wazuh-agent

# Verify FIM is active
sudo grep "syscheck" /var/ossec/logs/ossec.log

# Trigger test alert
touch /Users/ryandahlberg/Projects/cortex/coordination/test-fim.json

# Check Wazuh dashboard for FIM alert (Rule 550/554)
```

### Step 3: Deploy Wazuh Prometheus Exporter

```bash
# From your local machine (where kubectl is configured)

# Create security-monitoring namespace
kubectl create namespace security-monitoring

# Deploy Wazuh exporter and ServiceMonitor
kubectl apply -f /Users/ryandahlberg/Projects/cortex/deploy/security/wazuh/wazuh-prometheus-integration.yaml

# Verify deployment
kubectl get pods -n security-monitoring
kubectl logs -n security-monitoring deployment/wazuh-exporter

# Check metrics endpoint
kubectl port-forward -n security-monitoring svc/wazuh-exporter 9100:9100
curl http://localhost:9100/metrics | grep wazuh_
```

### Step 4: Configure Prometheus Scraping

```bash
# Edit Prometheus values
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring

# Add to prometheus-values.yaml under additionalScrapeConfigs:
cat >> prometheus-values.yaml <<'EOF'
  additionalScrapeConfigs:
    - job_name: 'wazuh-exporter'
      static_configs:
        - targets: ['wazuh-exporter.security-monitoring.svc.cluster.local:9100']
      scrape_interval: 30s
      scrape_timeout: 10s
      metrics_path: /metrics
EOF

# Apply Prometheus rules for Wazuh metrics
kubectl apply -f wazuh-prometheus-integration.yaml

# Upgrade Prometheus to pick up new config
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -f prometheus-values.yaml \
  -n monitoring

# Verify scraping
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090/targets
# Look for wazuh-exporter target
```

### Step 5: Configure Alertmanager Webhook

```bash
# Deploy Wazuh webhook receiver
kubectl apply -f /Users/ryandahlberg/Projects/cortex/deploy/security/wazuh/alertmanager-wazuh-webhook.yaml

# Verify webhook receiver is running
kubectl get pods -n security-monitoring -l app=wazuh-webhook-receiver
kubectl logs -n security-monitoring deployment/wazuh-webhook-receiver

# Update Alertmanager configuration
kubectl edit configmap -n monitoring alertmanager-prometheus-kube-prometheus-alertmanager

# Add webhook receiver from alertmanager-wazuh-webhook.yaml
# Save and exit

# Reload Alertmanager config
kubectl delete pod -n monitoring -l app.kubernetes.io/name=alertmanager

# Test webhook
kubectl port-forward -n security-monitoring svc/wazuh-webhook-receiver 8080:8080

# Send test alert
curl -X POST http://localhost:8080/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "TestAlert",
        "severity": "warning"
      },
      "annotations": {
        "summary": "Test alert for Wazuh integration"
      }
    }]
  }'
```

### Step 6: Build Custom Docker Images (Optional)

If using custom exporter/webhook receiver:

```bash
# Build Wazuh Prometheus Exporter
cd /Users/ryandahlberg/Projects/cortex/deploy/security/wazuh/exporter
docker build -t ryops/wazuh-prometheus-exporter:latest .
docker push ryops/wazuh-prometheus-exporter:latest

# Build Wazuh Webhook Receiver
cd /Users/ryandahlberg/Projects/cortex/deploy/security/wazuh/webhook-receiver
docker build -t ryops/wazuh-webhook-receiver:latest .
docker push ryops/wazuh-webhook-receiver:latest

# Update deployments to use new images
kubectl rollout restart deployment/wazuh-exporter -n security-monitoring
kubectl rollout restart deployment/wazuh-webhook-receiver -n security-monitoring
```

## Testing

### Test 1: Verify Rules Are Active

```bash
# On Wazuh server
ssh wazuh@10.88.140.202

# Check rule loading
sudo grep "cortex" /var/ossec/ruleset/rules/*

# Test rule matching with wazuh-logtest
sudo /var/ossec/bin/wazuh-logtest

# Input test log (paste this at prompt):
{"agent_type":"security","task_id":"task-001","error_type":"agent_failure","severity":"critical"}

# Expected output should show:
# - Rule matched: 100100 (Cortex agent failure detected)
# - Level: 10
# - Group: cortex_errors, agent_failures
```

### Test 2: Trigger FIM Alert

```bash
# On k3s node with Cortex files
cd /Users/ryandahlberg/Projects/cortex/coordination/masters/security

# Modify a monitored file
echo "# Test FIM" >> context/master-state.json

# Wait 1-5 minutes, then check Wazuh dashboard:
# 1. Navigate to Security Events
# 2. Filter by agent_id: 003 (or appropriate agent)
# 3. Look for Rule 550 (File integrity checksum changed)
# 4. Verify file path is shown in alert details
```

### Test 3: Verify Prometheus Metrics

```bash
# Port forward to Wazuh exporter
kubectl port-forward -n security-monitoring svc/wazuh-exporter 9100:9100

# Check metrics are being exported
curl http://localhost:9100/metrics | grep wazuh_alerts_total
curl http://localhost:9100/metrics | grep wazuh_agent_status

# Expected output:
# wazuh_alerts_total{severity="critical",rule_id="100100",agent_id="003"} 2
# wazuh_agent_status{agent_id="003",agent_name="k3s-master",status="active"} 1
```

### Test 4: Verify Alertmanager Webhook

```bash
# Trigger a test Prometheus alert
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-alert-trigger
  namespace: default
  labels:
    app: test-alert
spec:
  containers:
  - name: test
    image: busybox
    command: ['sh', '-c', 'exit 1']
  restartPolicy: Never
EOF

# Check Alertmanager received the alert
kubectl port-forward -n monitoring svc/alertmanager-operated 9093:9093
# Open http://localhost:9093/#/alerts

# Check Wazuh webhook receiver logs
kubectl logs -n security-monitoring deployment/wazuh-webhook-receiver

# Expected: Log showing alert received and forwarded to Wazuh
```

### Test 5: End-to-End Workflow

```bash
# 1. Create a Cortex agent failure scenario
# (Simulate by creating a log entry or actual agent error)

# 2. Verify Wazuh detects it
# - Check Wazuh Dashboard → Security Events
# - Look for Rule 100100 (Cortex agent failure)

# 3. Verify Prometheus imports metric
# - Query: wazuh_alerts_total{rule_id="100100"}

# 4. Verify Prometheus alert fires
# - Check Alertmanager for CortexAgentFailure

# 5. Verify webhook sends back to Wazuh
# - Check Wazuh logs for incoming webhook event
# - Should see correlation between original event and Prometheus alert
```

## Integration Verification

### Wazuh Dashboard Verification

1. **Login to Wazuh Dashboard**:
   ```
   URL: https://10.88.140.202:443
   Username: admin
   Password: *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
   ```

2. **Check Agent Status**:
   - Navigate to **Agents** → **Overview**
   - Verify all k3s agents (001, 002, 003) are "Active"
   - Check last keep-alive timestamp

3. **View Cortex Alerts**:
   - Navigate to **Security Events**
   - Add filter: `rule.groups: cortex`
   - Verify Cortex-specific alerts are appearing

4. **Check File Integrity Monitoring**:
   - Navigate to **Integrity Monitoring**
   - Filter by agent: k3s-master (003)
   - Verify Cortex coordination files are being monitored

5. **Review Vulnerability Scans**:
   - Navigate to **Vulnerabilities**
   - Check CVE detection on all agents
   - Verify scan timestamps are recent

### Prometheus/Grafana Verification

1. **Check Wazuh Metrics in Prometheus**:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
   ```

   Open http://localhost:9090/graph and query:
   ```
   wazuh_alerts_total
   wazuh_agent_status
   wazuh_fim_events_total
   ```

2. **Verify Prometheus Alerts**:
   - Navigate to **Alerts** tab in Prometheus UI
   - Look for Wazuh-related alert rules
   - Check firing status

3. **Create Grafana Dashboard** (optional):
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
   ```

   - Import dashboard from `grafana-wazuh-dashboard.json` (if created)
   - Add panels for:
     - Wazuh agent status
     - Alert rate by severity
     - FIM events timeline
     - Cortex-specific metrics

### N8N Workflow Verification

1. **Check N8N Webhook Triggers**:
   - Navigate to N8N UI
   - Verify webhook workflows exist:
     - `cortex-alerts` (receives Cortex alerts from Alertmanager)
     - `wazuh-agent-recovery` (auto-remediation for agent issues)

2. **Test Webhook Execution**:
   ```bash
   curl -X POST http://n8n.n8n.svc.cluster.local:5678/webhook-test/cortex-alerts \
     -H 'Content-Type: application/json' \
     -d '{"alertname": "TestAlert", "severity": "warning"}'
   ```

3. **Verify Execution History**:
   - Check N8N execution logs
   - Verify workflows triggered correctly

## Troubleshooting

### Issue: Wazuh Rules Not Matching

**Symptoms**: Cortex logs not generating alerts in Wazuh

**Diagnosis**:
```bash
# SSH to Wazuh server
ssh wazuh@10.88.140.202

# Check if rules are loaded
sudo grep "100100\|100110\|100120" /var/ossec/logs/ossec.log

# Test rule matching manually
sudo /var/ossec/bin/wazuh-logtest
# Paste sample Cortex log
```

**Solutions**:
1. Verify rules are in correct XML format
2. Check rule syntax with `wazuh-logtest`
3. Ensure parent rules exist (if using `if_sid`)
4. Restart Wazuh manager: `sudo systemctl restart wazuh-manager`

### Issue: FIM Not Detecting Changes

**Symptoms**: File modifications not generating alerts

**Diagnosis**:
```bash
# On Wazuh agent
sudo grep "syscheck" /var/ossec/logs/ossec.log

# Check if paths are being scanned
sudo /var/ossec/bin/agent_control -i AGENT_ID
```

**Solutions**:
1. Verify paths exist and are accessible
2. Check file permissions (agent must be able to read)
3. Verify regex patterns in `<directories>` tags
4. Increase scan frequency if needed
5. Enable `realtime="yes"` for critical paths
6. Check `<ignore>` rules aren't excluding files

### Issue: Wazuh Exporter Not Collecting Metrics

**Symptoms**: No `wazuh_*` metrics in Prometheus

**Diagnosis**:
```bash
# Check exporter logs
kubectl logs -n security-monitoring deployment/wazuh-exporter

# Test API connectivity
kubectl exec -it -n security-monitoring deployment/wazuh-exporter -- sh
curl -k -u admin:PASSWORD https://10.88.140.202:55000/security/user/authenticate
```

**Solutions**:
1. Verify Wazuh API credentials in secret
2. Check network connectivity to Wazuh server (10.88.140.202:55000)
3. Ensure Wazuh API is enabled and accessible
4. Review exporter error logs
5. Verify ServiceMonitor is created correctly

### Issue: Alertmanager Webhook Not Sending to Wazuh

**Symptoms**: Prometheus alerts not appearing in Wazuh

**Diagnosis**:
```bash
# Check webhook receiver logs
kubectl logs -n security-monitoring deployment/wazuh-webhook-receiver

# Check Alertmanager config
kubectl get configmap -n monitoring alertmanager-prometheus-kube-prometheus-alertmanager -o yaml
```

**Solutions**:
1. Verify webhook receiver is running and accessible
2. Check Alertmanager route configuration
3. Test webhook endpoint manually with curl
4. Verify authentication credentials
5. Check Wazuh API accepts custom events

### Issue: Agent Disconnected

**Symptoms**: Wazuh agent shows "Disconnected" status

**Diagnosis**:
```bash
# On Wazuh server
sudo /var/ossec/bin/agent_control -i AGENT_ID

# On agent node
sudo systemctl status wazuh-agent
sudo tail -f /var/ossec/logs/ossec.log
```

**Solutions**:
1. Restart agent: `sudo systemctl restart wazuh-agent`
2. Check network connectivity: `telnet 10.88.140.202 1514`
3. Verify agent configuration: `/var/ossec/etc/ossec.conf`
4. Re-import agent key if corrupted
5. Check firewall rules on both server and agent

## Maintenance

### Regular Tasks

**Daily**:
- Review critical alerts (level 12+) in Wazuh dashboard
- Check agent status (all should be "Active")
- Verify FIM scans completed successfully

**Weekly**:
- Review vulnerability scan results
- Update vulnerable packages
- Review false positive alerts and tune rules
- Check disk space on Wazuh server (`/var/lib/wazuh-indexer/`)

**Monthly**:
- Backup Wazuh configuration and rules
- Review alert trends and adjust thresholds
- Update Wazuh rules based on new Cortex features
- Performance tuning (indexer heap, manager EPS limits)

### Backup Procedures

```bash
# SSH to Wazuh server
ssh wazuh@10.88.140.202

# Backup custom rules
sudo tar czf wazuh-cortex-rules-$(date +%Y%m%d).tar.gz \
  /var/ossec/etc/rules/local_rules.xml \
  /var/ossec/etc/decoders/local_decoder.xml

# Backup agent configurations
sudo tar czf wazuh-agent-configs-$(date +%Y%m%d).tar.gz \
  /var/ossec/etc/shared/

# Copy to safe location
scp wazuh-*.tar.gz backup-server:/backups/wazuh/
```

### Updating Rules

```bash
# 1. Test new rules locally with wazuh-logtest
sudo /var/ossec/bin/wazuh-logtest < test-logs.txt

# 2. Backup current rules
sudo cp /var/ossec/etc/rules/local_rules.xml \
  /var/ossec/etc/rules/local_rules.xml.$(date +%Y%m%d)

# 3. Edit rules
sudo nano /var/ossec/etc/rules/local_rules.xml

# 4. Validate syntax
sudo /var/ossec/bin/wazuh-logtest

# 5. Restart manager
sudo systemctl restart wazuh-manager

# 6. Monitor for issues
sudo tail -f /var/ossec/logs/ossec.log
```

## Performance Tuning

### Wazuh Manager

```xml
<!-- /var/ossec/etc/ossec.conf -->
<global>
  <!-- Limit events per second to prevent overload -->
  <limits>
    <eps>
      <maximum>2000</maximum>
      <timeframe>10</timeframe>
    </eps>
  </limits>

  <!-- Statistics interval -->
  <stats>2</stats>
</global>
```

### Wazuh Indexer

```bash
# Check current heap size
cat /etc/wazuh-indexer/jvm.options | grep Xms

# Set heap size (50% of RAM, max 32GB)
sudo nano /etc/wazuh-indexer/jvm.options
# -Xms4g
# -Xmx4g

sudo systemctl restart wazuh-indexer
```

### Prometheus Scraping

```yaml
# Adjust scrape interval based on alert sensitivity
scrape_configs:
  - job_name: 'wazuh-exporter'
    scrape_interval: 30s  # Increase to 60s if too frequent
    scrape_timeout: 10s
```

## Security Considerations

1. **API Credentials**:
   - Store Wazuh API credentials in Kubernetes secrets
   - Rotate credentials every 90 days
   - Use least-privilege API user

2. **Webhook Authentication**:
   - Enable basic auth on webhook receiver
   - Use HTTPS for webhook communication (if external)
   - Whitelist Alertmanager IP

3. **FIM Exclusions**:
   - Only exclude truly non-security-relevant files
   - Regularly review exclusion list
   - Never exclude `/etc/`, `/var/ossec/`, `/usr/bin/`

4. **Alert Fatigue**:
   - Tune rules to reduce false positives
   - Use `frequency` and `timeframe` to prevent spam
   - Set appropriate alert levels

## References

- [Wazuh Documentation](https://documentation.wazuh.com/)
- [Wazuh Rule Syntax](https://documentation.wazuh.com/current/user-manual/ruleset/custom.html)
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/configuration/)
- [Cortex Architecture](/Users/ryandahlberg/Projects/cortex/README.md)
- [Existing Wazuh Integration](/Users/ryandahlberg/Projects/ry-ops/infrastructure-docs/monitoring/wazuh-integration.md)

## Support

For issues or questions:
- **Wazuh Dashboard**: https://10.88.140.202:443
- **Wazuh Logs**: SSH to 10.88.140.202, check `/var/ossec/logs/ossec.log`
- **Prometheus Alerts**: Port-forward to Prometheus UI
- **Documentation**: `/Users/ryandahlberg/Projects/ry-ops/infrastructure-docs/`

## Changelog

### 2024-12-12
- Initial Wazuh integration configuration
- Created cortex-rules.xml (100100-100199 rule range)
- Created cortex-decoders.xml (JSON log parsing)
- Created fim-cortex.conf (FIM for Cortex files)
- Created wazuh-prometheus-integration.yaml (metrics export)
- Created alertmanager-wazuh-webhook.yaml (bidirectional alerts)
- Documentation and installation guide

---

**Last Updated**: 2024-12-12
**Maintained By**: Cortex Security Master
**Wazuh Server**: 10.88.140.202 (v4.14.1)
