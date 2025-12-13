# Wazuh Integration Verification Report
**Date**: 2025-12-13
**Status**: REQUIRES CREDENTIAL VERIFICATION
**Version**: Wazuh 4.14.1 (API) / Dashboard (needs verification)

---

## Executive Summary

Wazuh security monitoring infrastructure is **partially verified**:
- ✓ Wazuh server is **accessible** at `https://10.88.140.202`
- ✓ API endpoint is **reachable** at `https://10.88.140.202:55000`
- ✓ Dashboard is **responding** (HTTP 302 redirect to login)
- ✓ SSL/TLS certificates are **valid** (CN=wazuh.com)
- ✓ Network connectivity from Cortex to Wazuh is **established**
- ✗ **Authentication credentials provided are INVALID**
  - Current credentials: `admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay`
  - Error: "Invalid credentials" (HTTP 401)
- ? K3s agent connectivity **CANNOT BE VERIFIED** without valid credentials
- ? Webhook integration **CANNOT BE VERIFIED** without valid credentials

---

## Task 1: Verify Wazuh is Accessible and Responding

### Result: ✓ PASS

**Connectivity Tests**:
```
Network ping: ✓ PASS (10.88.140.202 is reachable)
Port 443:     ✓ OPEN (Dashboard HTTPS)
Port 55000:   ✓ OPEN (API endpoint)
SSL/TLS:      ✓ VALID (CN=wazuh.com issued by Wazuh CA)
```

**HTTP Response Details**:
- Dashboard URL: `https://10.88.140.202`
  - Status: HTTP 302 Found (redirect to login page)
  - Server: `osd-name: wazuh-server`
  - Authentication: Required (cookie rejection)

- API URL: `https://10.88.140.202:55000`
  - Status: Operational
  - Auth Requirement: JWT Bearer token via `/security/user/authenticate`

**Conclusion**: Server infrastructure is healthy and reachable from Cortex environment.

---

## Task 2: Check K3s Node Agent Connectivity

### Result: ⚠ INCOMPLETE (Cannot verify without valid credentials)

**K3s Cluster Nodes**:
- K3s Master: `10.88.145.180` (VM 310)
- K3s Worker 1: `10.88.145.181` (VM 311)
- K3s Worker 2: `10.88.145.182` (VM 312)

**Wazuh Agent Configuration** (from K3s manifest):
```yaml
WAZUH_MANAGER: "10.88.140.202"
WAZUH_AGENT_NAME: "${spec.nodeName}"
WAZUH_REGISTRATION_PASSWORD: "cortex-k3s-cluster"
Image: wazuh/wazuh-agent:4.14.1
Protocol: TCP 1514 (agent communication)
```

**Network Connectivity to Wazuh Agent Port**:
- Agent communication port: TCP 1514
- Registration port: TCP 1515

**To Complete This Verification**:
1. Obtain valid Wazuh admin credentials
2. Authenticate to API
3. Query `/agents` endpoint to see registered agents
4. Verify agent status for 10.88.145.180-182

**Expected Response**:
```json
{
  "data": {
    "affected_items": [
      {
        "id": "001",
        "name": "k3s-master",
        "ip": "10.88.145.180",
        "status": "active",
        "version": "4.14.1"
      },
      {
        "id": "002",
        "name": "k3s-worker-1",
        "ip": "10.88.145.181",
        "status": "active",
        "version": "4.14.1"
      },
      {
        "id": "003",
        "name": "k3s-worker-2",
        "ip": "10.88.145.182",
        "status": "active",
        "version": "4.14.1"
      }
    ],
    "total_affected_items": 3
  }
}
```

---

## Task 3: Verify Security Master Webhook Reception

### Result: ⚠ INCOMPLETE (Configuration ready, testing deferred)

**Webhook Endpoint Configuration**:

Currently configured in `/k8s/cortex-k3s/07-wazuh-integration.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: wazuh-webhook
  namespace: cortex-system
spec:
  type: LoadBalancer
  ports:
  - name: webhook
    port: 9443
    targetPort: 9443
    protocol: TCP
  selector:
    app: security-master
```

**Expected Integration**:
1. Wazuh triggers alerts based on rules
2. Wazuh forwards webhooks to: `https://<cortex-external-ip>:9443/wazuh-webhook`
3. Security Master receives and processes alerts
4. Triggers autonomous remediation workflow

**Configuration Status**:
- ✓ Webhook service defined
- ✓ Port 9443 allocated
- ? Security Master webhook handler **UNTESTED** (needs deployment)
- ? Firewall rules **UNKNOWN** (verify inbound rules allow 9443)

**Recommended Webhook Payload Handler**:
```javascript
// Security Master webhook handler (pseudo-code)
app.post('/wazuh-webhook', authenticate, (req, res) => {
  const alert = req.body;

  // Severity-based routing
  if (alert.rule.level >= 12) {
    // CRITICAL: Spawn fix-worker immediately
    spawnWorker('fix-worker', {
      alert_id: alert.id,
      severity: alert.rule.level,
      rule: alert.rule.description,
      affected_agent: alert.agent.id,
      timestamp: alert.timestamp
    });
  }

  // Log to knowledge base
  logVulnerability(alert);

  res.json({ status: 'processed' });
});
```

---

## Task 4: Test Wazuh API Integration

### Result: ✗ FAIL (Authentication required)

**API Endpoint Tests**:

| Endpoint | Status | Issue |
|----------|--------|-------|
| `/security/user/authenticate` | 401 | Invalid credentials |
| `/agents` | 401 | Requires authentication |
| `/alerts` | 401 | Requires authentication |
| `/vulnerabilities` | 401 | Requires authentication |
| `/rules` | 401 | Requires authentication |
| `/decoders` | 401 | Requires authentication |
| `/cluster/status` | 401 | Requires authentication |

**Authentication Failure Analysis**:

```
Credential Format: admin : *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
Base64 Encoded: YWRtaW46KkI5Nlk3YTB0OEVwOWN3K3owUlNldmRSSHdMbnNpYXk=
HTTP Method: POST
Endpoint: /security/user/authenticate
Result: {"title": "Unauthorized", "detail": "Invalid credentials"}
HTTP Status: 401
```

**Possible Causes**:
1. Password contains special character `*` - may need escaping/encoding
2. Password may have been changed since documentation was created
3. Wazuh user account may be locked or disabled
4. Credentials may require different encoding format

**Required Actions**:
1. Verify correct Wazuh admin credentials
2. Check if password contains URL-encoded characters
3. Verify admin user exists and is active in Wazuh
4. Consider using Wazuh API token instead of basic auth

---

## Task 5: Recommended Additional Configuration

### 5.1 Secure Credential Storage

**Current State**: Credentials stored in plaintext in `secrets.yaml`

**Recommended**: Implement secret rotation

```bash
# Generate new strong password
openssl rand -base64 32

# Update Wazuh admin password
curl -k -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"password": "<new_password>"}' \
  https://10.88.140.202:55000/security/users/admin
```

### 5.2 API Token Management

Instead of basic auth, use long-lived API tokens:

```bash
# Create API token endpoint
curl -k -X POST \
  -u "admin:<password>" \
  -H "Content-Type: application/json" \
  https://10.88.140.202:55000/security/user/authenticate

# Store token securely
kubectl create secret generic wazuh-api-token \
  --from-literal=token=<jwt_token> \
  -n cortex-system
```

### 5.3 Webhook Authentication

Add signature verification to webhook:

```javascript
// Verify Wazuh webhook signature
const crypto = require('crypto');

function verifyWazuhSignature(req, secret) {
  const signature = req.headers['x-wazuh-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return hash === signature;
}
```

### 5.4 Agent Registration Password

Wazuh agents use registration password: `cortex-k3s-cluster`

Recommendations:
```bash
# Rotate registration password
1. Stop all agents
2. Update Wazuh server config
3. Update agent configuration
4. Restart agents with new password
5. Verify agent-server handshake

# Monitor agent connections
curl -k -X GET \
  -H "Authorization: Bearer $TOKEN" \
  https://10.88.140.202:55000/agents/summary/status
```

### 5.5 Alert Rules Configuration

Create K3s-specific alert rules:

```xml
<!-- /var/ossec/etc/rules/k3s-alerts.xml -->
<group name="k3s,">
  <rule id="100000" level="3">
    <regex>^.*kubernetes.*</regex>
    <description>Kubernetes event detected</description>
  </rule>

  <rule id="100001" level="7">
    <regex>^.*unauthorized.*</regex>
    <description>Unauthorized K3s access attempt</description>
  </rule>

  <rule id="100002" level="12">
    <regex>^.*privilege.*escalation.*</regex>
    <description>Potential privilege escalation in K3s cluster</description>
  </rule>
</group>
```

### 5.6 Vulnerability Database Integration

Enable CVE correlation:

```bash
# Enable vulnerability detection
POST /vulnerability/dashboards/configure
{
  "enabled": true,
  "data_source": "feed:cve-feed",
  "update_interval": 3600,
  "severity_threshold": "medium"
}
```

### 5.7 Compliance Monitoring

Configure compliance modules:

```bash
# Enable compliance monitoring
POST /security/config
{
  "compliance_modules": [
    "cis_docker",
    "cis_kubernetes",
    "pci_dss",
    "gdpr"
  ],
  "scan_interval": 86400
}
```

### 5.8 Security Master Integration

**Handoff Pattern**:

```json
{
  "handoff_id": "wazuh-alert-remediation-001",
  "from_master": "wazuh",
  "to_master": "security",
  "alert_id": "alert-12345",
  "alert_data": {
    "rule_id": 100002,
    "severity": "critical",
    "description": "Privilege escalation detected in K3s cluster",
    "affected_agent": "k3s-master",
    "timestamp": "2025-12-13T10:15:27Z"
  },
  "remediation_request": {
    "worker_type": "fix-worker",
    "priority": "critical",
    "sla_minutes": 240
  }
}
```

---

## Configuration Files Status

### Deployed/Configured:
- ✓ `/k8s/cortex-k3s/07-wazuh-integration.yaml` - DaemonSet + Webhook Service
- ✓ `/k8s/config/security-config.yaml` - Security Master configuration
- ✓ `/k8s/cortex-k3s/01-secrets.yaml` - Credential storage

### Pending Implementation:
- [ ] Webhook signature verification
- [ ] Alert rule customization for K3s
- [ ] Compliance module configuration
- [ ] Vulnerability feed integration
- [ ] Agent status monitoring dashboard
- [ ] Alert routing and remediation workflows

---

## Next Steps (Priority Order)

### CRITICAL (Before Production):
1. **Verify Wazuh Credentials**
   - Obtain correct admin credentials
   - Test API authentication
   - Document actual password in secure location

2. **Complete Agent Verification**
   - Query agents endpoint with valid credentials
   - Verify all 3 K3s nodes show as "active"
   - Check agent versions match 4.14.1

3. **Deploy Webhook Handler**
   - Implement Security Master webhook endpoint
   - Add signature verification
   - Test alert reception

### HIGH (Within 1 week):
4. **Configure Alert Rules**
   - Create K3s-specific rules
   - Set severity levels appropriately
   - Configure alert routing

5. **Enable Compliance Monitoring**
   - Configure CIS Kubernetes rules
   - Enable vulnerability scanning
   - Set up daily compliance reports

6. **Implement Alert Routing**
   - Create handoff from Wazuh to Security Master
   - Configure worker spawning for critical alerts
   - Set up SLA tracking

### MEDIUM (Within 2 weeks):
7. **Enable Autonomous Remediation**
   - Connect alerts to fix-worker
   - Implement auto-remediation for common issues
   - Add RLHF learning loop

8. **Dashboard Integration**
   - Expose Wazuh metrics in Cortex dashboard
   - Create alert summary panels
   - Track remediation success rate

---

## Technical Specifications

### API Endpoints Required
```
GET     /agents                        # List all agents
GET     /agents/{agent_id}             # Agent details
GET     /agents/summary/status         # Agent status summary
GET     /alerts                        # Get alerts
GET     /alerts/{alert_id}             # Alert details
GET     /rules                         # List rules
GET     /decoders                      # List decoders
GET     /vulnerabilities               # Get vulnerabilities
POST    /security/user/authenticate    # Get JWT token
```

### Performance Targets
- API Response Time: < 1s
- Agent Registration: < 30s
- Alert Delivery: < 5s
- Webhook Processing: < 2s

### Scaling Targets
- Support up to 100 agents per Wazuh instance
- Process 1000+ alerts per day
- Maintain < 5s webhook response time at scale

---

## Security Considerations

### Authentication & Authorization
- [ ] Replace basic auth with JWT tokens
- [ ] Implement webhook signature verification
- [ ] Enable RBAC for API access
- [ ] Rotate credentials quarterly

### Network Security
- [ ] Restrict API access to Cortex subnet only
- [ ] Enable firewall rules for agent ports (1514, 1515)
- [ ] Use TLS 1.3 for all communications
- [ ] Verify certificate pinning in agent configs

### Data Protection
- [ ] Encrypt alerts at rest
- [ ] Implement log retention policy
- [ ] Enable audit logging for API access
- [ ] Encrypt webhook communications

---

## Rollback Plan

If Wazuh integration fails:

```bash
# 1. Disable Wazuh DaemonSet
kubectl patch daemonset wazuh-agent -n cortex-system \
  -p '{"spec": {"template": {"spec": {"nodeSelector": {"non-existent": "true"}}}}}'

# 2. Remove webhook service
kubectl delete svc wazuh-webhook -n cortex-system

# 3. Restore previous security config
kubectl apply -f /backup/security-config-backup.yaml

# 4. Verify rollback
kubectl get daemonset,svc -n cortex-system
```

---

## Contact & Support

- **Wazuh Documentation**: https://documentation.wazuh.com/
- **API Reference**: https://documentation.wazuh.com/current/api/overview.html
- **Cortex Security Master**: `/Users/ryandahlberg/Projects/cortex/lib/masters/security-master.js`
- **Integration Status**: This report
- **Last Updated**: 2025-12-13 10:15:27 UTC

---

## Approval Sign-Off

- [x] Infrastructure verified (network, ports, SSL)
- [ ] Credentials verified
- [ ] Agents verified
- [ ] Webhooks verified
- [ ] API integration tested
- [ ] Ready for production deployment

**Status**: 🟡 BLOCKED ON CREDENTIALS
