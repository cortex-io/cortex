# Wazuh Integration for Cortex Security Monitoring

Comprehensive security monitoring integration between Wazuh SIEM (10.88.140.202) and Cortex automation system.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Installation](#installation)
- [Configuration](#configuration)
- [Alert Tuning](#alert-tuning)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Overview

This integration provides enterprise-grade security monitoring for Cortex by:

- Collecting and analyzing logs from all Cortex components (meta-agent, masters, workers, contractors)
- Detecting security threats (authentication failures, privilege escalation, container escapes)
- Monitoring Kubernetes audit logs for the Cortex namespace
- Tracking file integrity for critical Cortex configurations
- Correlating Prometheus metrics with security events
- Providing compliance reporting (PCI-DSS, GDPR)

### Key Features

- **95 Custom Security Rules** (IDs 100100-100199) for Cortex-specific threats
- **Real-time File Integrity Monitoring** for `/etc/cortex` and coordination directories
- **Container Security** monitoring with escape detection
- **Kubernetes Audit Log** analysis for namespace `cortex`
- **Secrets Access Monitoring** with unauthorized access detection
- **Prometheus Integration** via custom exporter and Alertmanager webhook
- **Automated Compliance** scanning (CIS Kubernetes, PCI-DSS, GDPR)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cortex K3s Cluster                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Meta Agent   │  │   Masters    │  │   Workers    │          │
│  │  + Wazuh     │  │  + Wazuh     │  │  + Wazuh     │          │
│  │   Agent      │  │   Agent      │  │   Agent      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                     │
│         ┌─────────────────┴─────────────────┐                   │
│         │                                   │                   │
│  ┌──────▼───────┐                  ┌────────▼────────┐          │
│  │  Prometheus  │                  │  Alertmanager   │          │
│  │   + Wazuh    │                  │   + Wazuh       │          │
│  │   Exporter   │                  │   Webhook       │          │
│  └──────┬───────┘                  └────────┬────────┘          │
│         │                                   │                   │
└─────────┼───────────────────────────────────┼───────────────────┘
          │                                   │
          │         External Network          │
          │                                   │
     ┌────▼───────────────────────────────────▼────┐
     │    Wazuh Manager (10.88.140.202)            │
     │                                              │
     │  ┌──────────────┐  ┌──────────────┐         │
     │  │   Manager    │  │  Indexer     │         │
     │  │   + Rules    │  │  (OpenSearch)│         │
     │  │   + Decoders │  │              │         │
     │  └──────────────┘  └──────────────┘         │
     │                                              │
     │  ┌──────────────┐                           │
     │  │  Dashboard   │  (SIEM UI)                │
     │  │  (Kibana)    │                           │
     │  └──────────────┘                           │
     └──────────────────────────────────────────────┘
```

## Components

### 1. Custom Rules (`wazuh-cortex-rules.xml`)

95 security rules organized into categories:

| Category | Rule IDs | Description |
|----------|----------|-------------|
| Authentication & Access | 100100-100109 | Failed logins, brute force, off-hours access |
| Privilege Escalation | 100110-100119 | Sudo abuse, role changes, unauthorized escalation |
| Configuration Changes | 100120-100129 | File modifications, secret changes, state updates |
| API Abuse | 100130-100139 | Destructive calls, DoS, unauthorized operations |
| Kubernetes Audit | 100140-100149 | Resource deletion, secret access, exec commands |
| Container Escape | 100150-100159 | Privileged containers, namespace manipulation |
| Secrets Access | 100160-100169 | Credential access, key exposure, enumeration |
| Task Anomalies | 100170-100179 | Permission failures, token abuse, policy violations |
| Data Exfiltration | 100180-100189 | Large transfers, DNS tunneling, file sharing |
| System Integrity | 100190-100199 | FIM violations, malware, backdoors, cryptominers |

### 2. Custom Decoders (`wazuh-cortex-decoders.xml`)

JSON-based log parsers for:

- **Cortex Agent Logs**: Meta-agent, masters, workers, contractors
- **Task Execution**: Task lifecycle events and metrics
- **MCP Servers**: Tool calls, requests, responses
- **N8N Workflows**: Workflow execution and webhooks
- **Kubernetes Audit**: Cluster events in Cortex namespace
- **Container Runtime**: Security events and lifecycle
- **Network Activity**: Connections, DNS queries, data transfers
- **Secrets Access**: Credential and API key access
- **File Integrity**: File system changes and integrity checks

### 3. Agent Configuration (`wazuh-agent-config.yaml`)

Deployed to all k3s nodes running Cortex:

- **Log Collection**: 11+ log sources including agents, k8s audit, containers
- **File Integrity Monitoring**: Real-time monitoring of critical paths
- **Rootcheck**: System audit and rootkit detection
- **SCA**: Compliance scanning (CIS, PCI-DSS, GDPR)
- **Vulnerability Detection**: OS, package, and container scanning
- **Syscollector**: Hardware, OS, network, process inventory

### 4. Prometheus Exporter (`prometheus-wazuh-exporter.yaml`)

Exposes Wazuh metrics to Prometheus:

**Metrics Categories**:
- Agent health status (active/disconnected counts)
- Alert counts by severity and rule group
- Rule trigger rates (top 50 rules)
- Security event rates (auth failures, privilege escalation, etc.)
- FIM change rates
- Vulnerability counts by severity
- SCA compliance status
- API latency

**Recording Rules**:
```promql
wazuh:alerts:total_by_severity
wazuh:alerts:rate_by_agent
wazuh:security:auth_failures_rate
wazuh:security:container_events_rate
wazuh:vulnerabilities:count_by_severity
```

**Alerting Rules**:
- Critical alerts from Wazuh
- High authentication failure rates
- Privilege escalation detection
- Agent disconnections
- Container security events
- Secrets access anomalies
- File integrity violations
- Critical vulnerabilities

### 5. Alertmanager Receiver (`alertmanager-wazuh-receiver.yaml`)

Bidirectional integration:

- **Prometheus → Wazuh**: Forwards Prometheus alerts to Wazuh SIEM
- **Alert Transformation**: Maps Prometheus severity to Wazuh levels
- **Enrichment**: Adds context and labels to forwarded alerts
- **Rate Limiting**: Prevents alert flooding (100/min)

## Installation

### Prerequisites

- Wazuh Manager running at 10.88.140.202
- K3s cluster with Cortex deployed
- Prometheus and Alertmanager installed
- Access to Wazuh API (credentials required)

### Step 1: Deploy Custom Rules and Decoders to Wazuh Manager

SSH to Wazuh Manager (10.88.140.202):

```bash
# Copy rules to Wazuh manager
scp wazuh-cortex-rules.xml root@10.88.140.202:/var/ossec/etc/rules/cortex-rules.xml

# Copy decoders to Wazuh manager
scp wazuh-cortex-decoders.xml root@10.88.140.202:/var/ossec/etc/decoders/cortex-decoders.xml

# Set correct permissions
ssh root@10.88.140.202 'chown wazuh:wazuh /var/ossec/etc/rules/cortex-rules.xml'
ssh root@10.88.140.202 'chown wazuh:wazuh /var/ossec/etc/decoders/cortex-decoders.xml'
ssh root@10.88.140.202 'chmod 640 /var/ossec/etc/rules/cortex-rules.xml'
ssh root@10.88.140.202 'chmod 640 /var/ossec/etc/decoders/cortex-decoders.xml'

# Restart Wazuh manager to load new rules
ssh root@10.88.140.202 'systemctl restart wazuh-manager'

# Verify rules loaded
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest' << EOF
{"component":"meta-agent","event_type":"authentication_failed","username":"testuser"}
EOF
```

### Step 2: Deploy Wazuh Agents to K3s Nodes

Deploy as DaemonSet (recommended):

```bash
# Create namespace
kubectl create namespace cortex-monitoring

# Create ConfigMap from agent config
kubectl create configmap wazuh-agent-config \
  -n cortex-monitoring \
  --from-file=ossec.conf=wazuh-agent-config.yaml

# Deploy DaemonSet (create this file)
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: wazuh-agent
  namespace: cortex-monitoring
spec:
  selector:
    matchLabels:
      app: wazuh-agent
  template:
    metadata:
      labels:
        app: wazuh-agent
    spec:
      hostNetwork: true
      hostPID: true
      containers:
      - name: wazuh-agent
        image: wazuh/wazuh-agent:4.7.0
        env:
        - name: WAZUH_MANAGER
          value: "10.88.140.202"
        - name: WAZUH_AGENT_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: WAZUH_AGENT_GROUP
          value: "cortex,kubernetes"
        volumeMounts:
        - name: config
          mountPath: /var/ossec/etc/ossec.conf
          subPath: ossec.conf
        - name: cortex-logs
          mountPath: /var/log/cortex
          readOnly: true
        - name: k8s-audit
          mountPath: /var/log/kubernetes
          readOnly: true
        - name: host-root
          mountPath: /host
          readOnly: true
        securityContext:
          privileged: true
      volumes:
      - name: config
        configMap:
          name: wazuh-agent-config
      - name: cortex-logs
        hostPath:
          path: /var/log/cortex
      - name: k8s-audit
        hostPath:
          path: /var/log/kubernetes
      - name: host-root
        hostPath:
          path: /
EOF

# Verify agents connected
kubectl logs -n cortex-monitoring -l app=wazuh-agent --tail=50
```

### Step 3: Deploy Prometheus Wazuh Exporter

```bash
# Create Wazuh API credentials secret
kubectl create secret generic wazuh-api-credentials \
  -n cortex-monitoring \
  --from-literal=username='cortex-prometheus' \
  --from-literal=password='YOUR_WAZUH_API_PASSWORD'

# Deploy exporter
kubectl apply -f prometheus-wazuh-exporter.yaml

# Verify deployment
kubectl get pods -n cortex-monitoring -l app=wazuh-exporter
kubectl logs -n cortex-monitoring -l app=wazuh-exporter

# Check metrics endpoint
kubectl port-forward -n cortex-monitoring svc/wazuh-exporter 9140:9140
curl http://localhost:9140/metrics | grep wazuh_
```

### Step 4: Configure Alertmanager Webhook

```bash
# Create webhook credentials
kubectl create secret generic wazuh-webhook-credentials \
  -n cortex-monitoring \
  --from-literal=password='STRONG_WEBHOOK_PASSWORD'

# Build and push webhook forwarder image (if needed)
# Extract scripts from alertmanager-wazuh-receiver.yaml ConfigMap
# Build Docker image and push to registry

# Deploy webhook forwarder
kubectl apply -f alertmanager-wazuh-receiver.yaml

# Verify deployment
kubectl get pods -n cortex-monitoring -l app=wazuh-webhook-forwarder
kubectl logs -n cortex-monitoring -l app=wazuh-webhook-forwarder

# Update Alertmanager configuration
# Add Wazuh receiver from alertmanager-wazuh-receiver.yaml
kubectl edit configmap alertmanager-config -n cortex-monitoring

# Reload Alertmanager
kubectl rollout restart statefulset alertmanager -n cortex-monitoring
```

### Step 5: Verify Integration

```bash
# Check Wazuh agent status on manager
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -l'

# Trigger test alert
kubectl exec -it -n cortex <cortex-pod> -- \
  logger -t cortex-meta-agent '{"component":"meta-agent","event_type":"authentication_failed","username":"testuser"}'

# Check alert in Wazuh dashboard
# Navigate to: https://10.88.140.202:5601

# Check Prometheus metrics
kubectl port-forward -n cortex-monitoring svc/prometheus 9090:9090
# Query: wazuh_alerts_total{rule_group="cortex"}

# Test Alertmanager webhook
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d @test-alert.json
```

## Configuration

### Adjusting Log Collection

Edit agent config for additional log paths:

```yaml
log_collection:
  - name: custom-cortex-logs
    location: /custom/path/*.log
    log_format: json
    labels:
      component: custom
```

### Tuning File Integrity Monitoring

Add/remove monitored paths:

```yaml
file_integrity_monitoring:
  - path: /etc/cortex/custom
    recursive: yes
    check_all: yes
    report_changes: yes
    realtime: yes
    tags:
      - custom-config
```

### Customizing Security Rules

Modify rule thresholds in `wazuh-cortex-rules.xml`:

```xml
<!-- Adjust frequency threshold for brute force -->
<rule id="100102" level="10" frequency="3" timeframe="180">
  <!-- Changed from 5 in 300s to 3 in 180s -->
</rule>
```

### Adding Custom Decoders

Extend decoders for custom log formats:

```xml
<decoder name="cortex-custom">
  <parent>cortex-json</parent>
  <use_own_name>true</use_own_name>
  <plugin_decoder offset="after_parent">JSON_Decoder</plugin_decoder>
  <field name="custom_field" />
</decoder>
```

## Alert Tuning

### Reducing False Positives

#### 1. Authentication Failures

If legitimate services cause authentication failures:

```xml
<!-- Add exception for service accounts -->
<rule id="100106" level="0">
  <if_sid>100101</if_sid>
  <field name="username">^service-account-</field>
  <description>Ignore service account auth failures</description>
</rule>
```

#### 2. Configuration Changes

Whitelist automated configuration management:

```xml
<rule id="100125" level="0">
  <if_sid>100121</if_sid>
  <field name="changed_by">argocd|flux</field>
  <description>Ignore GitOps config changes</description>
</rule>
```

#### 3. API Requests

Adjust rate thresholds for API abuse:

```xml
<!-- Change from 20 to 50 requests in 60s -->
<rule id="100132" level="10" frequency="50" timeframe="60">
```

### Increasing Sensitivity

For high-security environments:

```xml
<!-- Detect ANY privilege escalation immediately -->
<rule id="100111" level="15">
  <!-- Increased from level 12 to 15 (critical) -->
</rule>

<!-- Lower token consumption threshold -->
<rule id="100173" level="12">
  <!-- Changed pattern to detect >10k tokens instead of >20k -->
  <field name="token_consumption">^([1-9][0-9]{4,})$</field>
</rule>
```

### Custom Alert Routing

Route specific Cortex components to different teams:

```yaml
# In alertmanager-config.yaml
routes:
  - match:
      component: meta-agent
      severity: critical
    receiver: 'oncall-team-alpha'

  - match:
      component: master
      master_type: security
    receiver: 'security-team'
```

## Troubleshooting

### Wazuh Agents Not Connecting

**Symptoms**: Agents show as "never connected" in Wazuh dashboard

**Solutions**:

```bash
# Check agent logs
kubectl logs -n cortex-monitoring -l app=wazuh-agent

# Verify network connectivity
kubectl exec -n cortex-monitoring -it <agent-pod> -- \
  telnet 10.88.140.202 1514

# Check firewall rules on Wazuh manager
ssh root@10.88.140.202 'iptables -L -n | grep 1514'

# Verify agent registration
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -l'

# Force agent registration
kubectl exec -n cortex-monitoring -it <agent-pod> -- \
  /var/ossec/bin/agent-auth -m 10.88.140.202
```

### Rules Not Triggering

**Symptoms**: No alerts appearing in Wazuh dashboard

**Solutions**:

```bash
# Test decoder with sample log
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest' << EOF
{"component":"meta-agent","event_type":"authentication_failed","username":"test"}
EOF

# Check rule syntax
ssh root@10.88.140.202 '/var/ossec/bin/wazuh-logtest -t'

# Verify rules loaded
ssh root@10.88.140.202 'grep "100100" /var/ossec/logs/ossec.log'

# Check manager logs for errors
ssh root@10.88.140.202 'tail -f /var/ossec/logs/ossec.log'

# Restart manager to reload rules
ssh root@10.88.140.202 'systemctl restart wazuh-manager'
```

### Prometheus Exporter Not Scraping

**Symptoms**: No `wazuh_*` metrics in Prometheus

**Solutions**:

```bash
# Check exporter logs
kubectl logs -n cortex-monitoring -l app=wazuh-exporter

# Verify Wazuh API connectivity
kubectl exec -n cortex-monitoring -it <exporter-pod> -- \
  curl -k -u cortex-prometheus:PASSWORD \
  https://10.88.140.202:55000/security/user/authenticate

# Check ServiceMonitor
kubectl get servicemonitor -n cortex-monitoring wazuh-exporter -o yaml

# Verify Prometheus target
kubectl port-forward -n cortex-monitoring svc/prometheus 9090:9090
# Navigate to: http://localhost:9090/targets
# Look for: wazuh-exporter

# Manual metrics check
kubectl port-forward -n cortex-monitoring svc/wazuh-exporter 9140:9140
curl http://localhost:9140/metrics
```

### Alertmanager Webhook Failing

**Symptoms**: Alerts not appearing in Wazuh from Prometheus

**Solutions**:

```bash
# Check webhook forwarder logs
kubectl logs -n cortex-monitoring -l app=wazuh-webhook-forwarder

# Verify webhook receiver in Alertmanager
kubectl exec -n cortex-monitoring -it alertmanager-0 -- \
  cat /etc/alertmanager/alertmanager.yml

# Test webhook manually
kubectl port-forward -n cortex-monitoring svc/wazuh-webhook-forwarder 8080:8080

curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {"alertname": "Test", "severity": "warning"},
      "annotations": {"summary": "Test alert"}
    }]
  }'

# Check Alertmanager status
kubectl exec -n cortex-monitoring -it alertmanager-0 -- \
  amtool config show
```

### High Alert Volume

**Symptoms**: Too many alerts, noise drowning signal

**Solutions**:

1. **Increase frequency thresholds**:
```xml
<!-- Require more occurrences before alerting -->
<rule id="100102" level="10" frequency="10" timeframe="600">
```

2. **Add time-based filters**:
```xml
<!-- Only alert during business hours -->
<rule id="100121" level="8">
  <time>09:00-17:00</time>
</rule>
```

3. **Whitelist known patterns**:
```xml
<!-- Ignore health checks -->
<rule id="100136" level="0">
  <if_sid>100130</if_sid>
  <field name="api_endpoint">/health|/ready|/metrics</field>
</rule>
```

4. **Use Prometheus recording rules**:
```yaml
# Aggregate before alerting
- record: wazuh:alerts:critical_rate_5m
  expr: rate(wazuh_alerts_total{severity="critical"}[5m])

- alert: WazuhCriticalAlertSpike
  expr: wazuh:alerts:critical_rate_5m > 0.5
  for: 5m
```

## Maintenance

### Regular Tasks

#### Daily

```bash
# Check agent health
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -l | grep -v Active'

# Review critical alerts
# Wazuh Dashboard → Security Events → Filter: severity:critical
```

#### Weekly

```bash
# Update Wazuh agents
kubectl set image daemonset/wazuh-agent \
  -n cortex-monitoring \
  wazuh-agent=wazuh/wazuh-agent:latest

# Review false positives
# Identify rules triggering unnecessarily and tune

# Backup Wazuh configuration
ssh root@10.88.140.202 'tar czf /tmp/wazuh-backup-$(date +%Y%m%d).tar.gz \
  /var/ossec/etc/rules/cortex-rules.xml \
  /var/ossec/etc/decoders/cortex-decoders.xml'
```

#### Monthly

```bash
# Review and update custom rules
# Add new threat patterns learned from incidents

# Update SCA policies
ssh root@10.88.140.202 'wazuh-manager update-sca'

# Audit compliance status
# Review SCA scan results for CIS, PCI-DSS, GDPR

# Archive old alerts
# Wazuh Dashboard → Management → Index Management
```

### Updating Rules

1. Edit `wazuh-cortex-rules.xml` locally
2. Test changes:
```bash
/var/ossec/bin/wazuh-logtest < test-log.json
```
3. Deploy to manager:
```bash
scp wazuh-cortex-rules.xml root@10.88.140.202:/var/ossec/etc/rules/cortex-rules.xml
ssh root@10.88.140.202 'systemctl restart wazuh-manager'
```
4. Verify in production for 24 hours
5. Commit to version control

### Scaling Considerations

For large Cortex deployments (>50 nodes):

1. **Dedicated Wazuh Indexer Cluster**:
```bash
# Add more OpenSearch nodes
# Increase heap size
```

2. **Load Balancing**:
```yaml
# Use multiple Wazuh managers
agent:
  server:
    address: wazuh-lb.example.com  # Load balancer VIP
```

3. **Sharding and Replication**:
```bash
# Configure OpenSearch index sharding
# Increase replica count
```

4. **Agent Resource Limits**:
```yaml
# In DaemonSet
resources:
  limits:
    cpu: 500m
    memory: 512Mi
```

## Compliance Reporting

### PCI-DSS v4

Key requirements covered:

- **10.2.2**: Privileged user actions (rules 100110-100119)
- **10.2.4**: Invalid access attempts (rules 100101-100105)
- **10.2.5**: Authentication mechanism usage (rule 100104)
- **10.2.7**: Creation/deletion of objects (rules 100131, 100141)
- **10.5.5**: File integrity monitoring (rules 100120-100124)
- **11.4**: Intrusion detection (all rules)
- **11.5**: File integrity monitoring (FIM configuration)

### GDPR

Key articles covered:

- **Article 32.2**: Security measures (all security controls)
- **Article 35.7.d**: Data protection impact assessment (security monitoring)

### CIS Kubernetes Benchmark

Automated scanning via SCA:

```bash
# View CIS compliance results
# Wazuh Dashboard → Security Configuration Assessment → CIS Kubernetes
```

## Support

For issues or questions:

1. Check logs: `kubectl logs -n cortex-monitoring -l app=wazuh-agent`
2. Review Wazuh documentation: https://documentation.wazuh.com
3. Consult Cortex security team
4. Open issue in Cortex repository

## Additional Resources

- [Wazuh Documentation](https://documentation.wazuh.com/current/)
- [Prometheus Monitoring](https://prometheus.io/docs/)
- [Kubernetes Audit Logging](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [MITRE ATT&CK Framework](https://attack.mitre.org/)

## Version History

- **v1.0.0** (2025-12-11): Initial release
  - 95 custom security rules
  - Full Cortex component coverage
  - Prometheus integration
  - Kubernetes audit monitoring
  - Container security detection
