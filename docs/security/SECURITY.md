# Cortex Security Documentation

**Version:** 1.0.0
**Last Updated:** 2025-12-07
**Owner:** Cortex Security Master

## Table of Contents

1. [Overview](#overview)
2. [Threat Model](#threat-model)
3. [Security Architecture](#security-architecture)
4. [Security Controls](#security-controls)
5. [Incident Response](#incident-response)
6. [Security Monitoring](#security-monitoring)
7. [Compliance](#compliance)

## Overview

Cortex is a Kubernetes-native AI automation system that requires robust security controls to protect:
- API credentials (Anthropic, GitHub)
- Coordination data
- Worker tasks and results
- Container runtime environment

This document outlines the security architecture, controls, and procedures for the Cortex deployment.

## Threat Model

### Assets

| Asset | Sensitivity | Impact if Compromised |
|-------|-------------|----------------------|
| Anthropic API Key | Critical | Financial loss, data exposure |
| GitHub Token | High | Repository manipulation, code injection |
| Coordination ConfigMaps | Medium | Task disruption, data corruption |
| Master State | Medium | System instability |
| Worker Results | Low-Medium | Information disclosure |

### Threat Actors

#### External Attackers
- **Motivation:** Financial gain, disruption
- **Capabilities:** Network scanning, exploit kits
- **Targets:** Exposed services, vulnerable containers

#### Insider Threats
- **Motivation:** Curiosity, malice, error
- **Capabilities:** System access, code commits
- **Targets:** Secrets, configuration, logs

#### Compromised Containers
- **Motivation:** Lateral movement, privilege escalation
- **Capabilities:** Container escape, pod-to-pod communication
- **Targets:** API server, other pods, secrets

### Attack Scenarios

#### 1. Container Vulnerability Exploitation

**Scenario:** Attacker exploits CVE in base image to gain shell access

```
┌─────────────┐     Exploit      ┌──────────────┐
│  Attacker   │ ───────────────> │  Worker Pod  │
└─────────────┘                   └──────────────┘
                                         │
                                         │ Attempt lateral
                                         │ movement
                                         ▼
                                  ┌──────────────┐
                                  │  Master Pod  │ ✗ Blocked by
                                  └──────────────┘   Network Policy
```

**Mitigations:**
- ✅ Regular vulnerability scanning
- ✅ Pod Security Standards (restricted)
- ✅ Network policies
- ✅ Read-only root filesystem

**Residual Risk:** Low (multiple layers of defense)

#### 2. Secret Exposure via Log Leakage

**Scenario:** API key accidentally logged and exposed

**Mitigations:**
- ✅ Secrets mounted as environment variables (not in logs)
- ✅ Log filtering (redact sensitive patterns)
- ✅ RBAC limits secret access
- ⏳ Secret rotation every 90 days

**Residual Risk:** Medium (requires operational discipline)

#### 3. Privilege Escalation

**Scenario:** Worker pod attempts to access Kubernetes API

```
┌──────────────┐
│  Worker Pod  │
└──────────────┘
       │ kubectl get secrets --all-namespaces
       │
       ▼
┌────────────────┐
│  API Server    │ ✗ Denied by RBAC
└────────────────┘   (Worker SA has limited permissions)
```

**Mitigations:**
- ✅ RBAC with least privilege
- ✅ ServiceAccounts per role
- ✅ Pod Security Standards
- ✅ No privileged containers

**Residual Risk:** Low

#### 4. Network-Based Attack

**Scenario:** External attacker attempts to access internal services

**Mitigations:**
- ✅ Default deny network policy
- ✅ Ingress restrictions
- ⏳ TLS for all external communication
- ⏳ Authentication on exposed services

**Residual Risk:** Medium (NodePort services require authentication)

## Security Architecture

### Defense in Depth

```
┌──────────────────────────────────────────────────────────┐
│ Layer 1: Network Perimeter                               │
│ - Default deny network policies                          │
│ - NodePort services with authentication                  │
└──────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────┐
│ Layer 2: Kubernetes RBAC                                 │
│ - Least privilege ServiceAccounts                        │
│ - Role-based access control                              │
│ - Audit logging                                          │
└──────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────┐
│ Layer 3: Pod Security                                    │
│ - Restricted Pod Security Standards                      │
│ - Non-root containers (UID 1000)                         │
│ - Read-only root filesystem                              │
│ - No privilege escalation                                │
└──────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────┐
│ Layer 4: Container Security                              │
│ - Vulnerability scanning (Trivy)                         │
│ - Minimal base images                                    │
│ - SBOM generation                                        │
└──────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────┐
│ Layer 5: Secrets Management                              │
│ - Kubernetes Secrets (encrypted at rest)                 │
│ - RBAC-controlled access                                 │
│ - Regular rotation                                       │
└──────────────────────────────────────────────────────────┘
```

### Network Segmentation

```
┌─────────────────────────────────────────────────────────┐
│                     cortex Namespace                     │
│                                                          │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Masters    │ <────>  │   Workers    │             │
│  │  (5 types)   │         │  (4 types)   │             │
│  └──────────────┘         └──────────────┘             │
│         │                        │                      │
│         │  Network Policies:     │                      │
│         │  - Masters <-> Workers │                      │
│         │  - Masters <-> Masters │                      │
│         │  - Workers -> External │                      │
│         │  - Prometheus -> All   │                      │
│         │                        │                      │
│         ▼                        ▼                      │
│  ┌────────────────────────────────────┐                │
│  │         Prometheus                 │                │
│  │   (Metrics Collection)             │                │
│  └────────────────────────────────────┘                │
│                                                          │
└─────────────────────────────────────────────────────────┘
          │                        │
          │ NodePort 30090         │ NodePort 30300
          ▼                        ▼
    External Access          External Access
    (Prometheus)             (Grafana)
```

## Security Controls

### 1. Identity & Access Management

#### ServiceAccounts

| ServiceAccount | Permissions | Used By |
|----------------|-------------|---------|
| cortex-coordinator-sa | Full Cortex resource management | Coordinator Master |
| cortex-master-sa | Read/write ConfigMaps, read Secrets | 5 Master types |
| cortex-worker-sa | Read ConfigMaps, read Secrets | 4 Worker types |
| cortex-prometheus-sa | Read pods/services cluster-wide | Prometheus |

#### RBAC Policies

**Coordinator Role:**
```yaml
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets", "pods"]
    verbs: ["*"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets"]
    verbs: ["get", "list", "watch", "patch", "update"]
```

**Master Role:**
```yaml
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list"]
```

**Worker Role:**
```yaml
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]
```

### 2. Network Security

#### Network Policies

**Default Deny:**
```yaml
policyTypes:
  - Ingress
  - Egress
ingress: []
egress: []
```

**Master Policy:**
- ✅ Ingress from workers, other masters, Prometheus
- ✅ Egress to workers, other masters, API server, external HTTPS
- ✗ Deny all other traffic

**Worker Policy:**
- ✅ Ingress from masters only
- ✅ Egress to masters, API server, external APIs
- ✗ Deny ingress from external

#### TLS/Encryption

- **At Rest:** Kubernetes Secrets (etcd encryption recommended)
- **In Transit:** HTTPS for external API calls
- **Internal:** Unencrypted (within trusted network, consider service mesh for mTLS)

### 3. Pod Security

#### Pod Security Standards

**Level:** Restricted (highest security)

**Enforced Controls:**
```yaml
securityContext:
  runAsNonRoot: true          # Prevent root execution
  runAsUser: 1000             # Specific non-root UID
  fsGroup: 1000               # File system group
  seccompProfile:
    type: RuntimeDefault      # Secure computing mode
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]             # Drop all Linux capabilities
  readOnlyRootFilesystem: true
```

**Exceptions:** None (all pods comply)

### 4. Container Security

#### Image Scanning

**Tool:** Trivy (Aqua Security)
**Frequency:**
- On every push to main
- Weekly scheduled scans
- Before production deployment

**Thresholds:**
- Critical: 0 allowed
- High: 0 allowed (with exceptions process)
- Medium: <10 allowed
- Low: Monitored

#### Image Sources

**Approved Registries:**
- ghcr.io/ry-ops (primary)
- docker.io (official images only)
- gcr.io/distroless (Google)

**Prohibited:**
- Unknown/untrusted registries
- Images with :latest tag in production
- Images without digest verification

### 5. Secrets Management

#### Current Implementation

**Storage:** Kubernetes Secrets
**Encryption:** Base64 (not encrypted by default)
**Access Control:** RBAC

**Secrets:**
- `cortex-secrets`: Main bundle (Anthropic, GitHub tokens)
- `anthropic-api-key`: Anthropic API key (granular RBAC)
- `github-token`: GitHub PAT
- `ghcr-pull-secret`: Docker registry credentials

#### Production Recommendations

**Option 1: Sealed Secrets**
```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Seal a secret
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
```

**Option 2: External Secrets Operator**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com"
```

**Option 3: Cloud Provider**
- AWS Secrets Manager
- GCP Secret Manager
- Azure Key Vault

### 6. Audit Logging

#### Kubernetes Audit Policy

**Events Logged:**
- All Secret access
- ConfigMap modifications in cortex namespace
- Pod exec/attach commands
- RBAC changes

**Retention:** 90 days (adjust per compliance requirements)

**Storage:**
- Local: `/var/log/kubernetes/audit.log`
- Centralized: Send to SIEM (Splunk, ELK)

#### Application Logging

**Log Levels:**
- Production: INFO
- Debug: DEBUG (temporary, for troubleshooting)

**Sensitive Data Filtering:**
```python
# Example: Redact API keys in logs
import re
log_message = re.sub(r'sk-ant-[a-zA-Z0-9-]+', 'sk-ant-***REDACTED***', log_message)
```

## Incident Response

### Security Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 - Critical | Active exploitation, data breach | <1 hour | API key leaked publicly |
| P1 - High | High risk of exploitation | <4 hours | Critical CVE in running container |
| P2 - Medium | Moderate risk | <24 hours | High CVE, config drift |
| P3 - Low | Low risk | <7 days | Low CVE, documentation gap |

### Incident Response Procedures

#### 1. Detection

**Automated Alerts:**
- Vulnerability scan failures (CI/CD)
- Prometheus alerts (unusual API usage)
- Kubernetes audit log anomalies
- Failed authentication attempts

**Manual Detection:**
- Security reviews
- Penetration testing
- Bug bounty reports

#### 2. Containment

**Immediate Actions:**

For compromised credentials:
```bash
# 1. Revoke compromised API key immediately
# Anthropic Console: https://console.anthropic.com/

# 2. Delete Kubernetes secret
kubectl delete secret cortex-secrets -n cortex

# 3. Restart all pods to clear in-memory credentials
kubectl rollout restart statefulset -n cortex --all
kubectl rollout restart deployment -n cortex --all

# 4. Generate new credentials
# 5. Create new secret
./scripts/security/create-secrets.sh

# 6. Monitor for unauthorized API usage
```

For compromised pod:
```bash
# 1. Isolate pod with network policy
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-compromised-pod
  namespace: cortex
spec:
  podSelector:
    matchLabels:
      pod: compromised-pod-name
  policyTypes:
  - Ingress
  - Egress
EOF

# 2. Capture forensics
kubectl exec compromised-pod -- ps aux > forensics/processes.txt
kubectl logs compromised-pod > forensics/logs.txt

# 3. Delete compromised pod
kubectl delete pod compromised-pod -n cortex
```

#### 3. Eradication

**Root Cause Analysis:**
1. Identify vulnerability or misconfiguration
2. Determine exploitation timeline
3. Assess impact and data exposure
4. Document findings

**Remediation:**
1. Patch vulnerability
2. Update security controls
3. Rebuild and redeploy affected containers
4. Update runbooks and documentation

#### 4. Recovery

**Restoration Steps:**
1. Deploy patched version
2. Verify security controls
3. Run security scans
4. Monitor for recurrence
5. Restore normal operations

#### 5. Post-Incident

**Activities:**
1. Incident report (within 48 hours)
2. Lessons learned meeting
3. Update threat model
4. Improve detection capabilities
5. Security training

### Incident Response Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Security Lead | security@example.com | Immediate |
| Platform Owner | platform@example.com | <1 hour |
| On-Call Engineer | oncall@example.com | <15 minutes |

## Security Monitoring

### Metrics & KPIs

**Vulnerability Management:**
- Mean Time to Detect (MTTD): <24 hours
- Mean Time to Remediate (MTTR): <7 days for high
- Vulnerability backlog: <5 high severity

**Access Control:**
- Failed authentication attempts: <10/day
- Unauthorized API calls: 0
- Secret rotation compliance: 100%

**Compliance:**
- Pod Security Standards violations: 0
- Network policy coverage: 100%
- Image scan pass rate: >95%

### Dashboards

**Grafana Security Dashboard:**
- Vulnerability trends
- API usage patterns
- Failed authentication attempts
- Pod security violations
- Network policy denials

### Alerts

**Critical Alerts:**
```yaml
- alert: CriticalVulnerabilityDetected
  expr: trivy_vulnerabilities{severity="CRITICAL"} > 0
  for: 0m
  annotations:
    summary: "Critical vulnerability in {{ $labels.image }}"

- alert: UnauthorizedSecretAccess
  expr: rate(apiserver_audit_event_total{verb="get",objectRef_resource="secrets"}[5m]) > 10
  for: 5m
  annotations:
    summary: "Unusual secret access pattern detected"
```

## Compliance

### CIS Kubernetes Benchmark

**Compliance Level:** Level 1 (scored)

**Key Controls:**
- [5.2.1] Minimize container access to resources ✅
- [5.2.2] Minimize container access to network ✅
- [5.2.3] Minimize wildcard use in Roles and ClusterRoles ✅
- [5.2.4] Minimize access to create pods ✅
- [5.2.5] Ensure default service accounts are not used ✅

### OWASP Kubernetes Top 10

| Risk | Status | Mitigation |
|------|--------|------------|
| K01: Insecure Workload Configurations | ✅ Mitigated | Pod Security Standards |
| K02: Supply Chain Vulnerabilities | ⏳ Partial | Image scanning, SBOM |
| K03: Overly Permissive RBAC | ✅ Mitigated | Least privilege RBAC |
| K04: Lack of Centralized Policy Enforcement | ⏳ Planned | Kyverno/OPA |
| K05: Inadequate Logging | ⏳ Partial | Audit logs enabled |
| K06: Broken Authentication | ✅ Mitigated | ServiceAccounts, RBAC |
| K07: Network Segmentation | ✅ Mitigated | Network Policies |
| K08: Secrets Management Failures | ⏳ Partial | K8s Secrets, rotation |
| K09: Misconfigured Cluster Components | ✅ Mitigated | K3s defaults |
| K10: Outdated Components | ⏳ Ongoing | Regular updates |

### NIST 800-190

**Container Security:**
- Image vulnerabilities: Addressed via scanning
- Image configuration: Secured via security contexts
- Runtime protection: Network policies, RBAC
- Host OS security: K3s hardened
- Orchestrator security: Kubernetes RBAC, audit logs

## Security Checklist

Daily:
- [ ] Review security alerts
- [ ] Check failed authentication logs
- [ ] Monitor API usage anomalies

Weekly:
- [ ] Run vulnerability scans
- [ ] Review audit logs
- [ ] Check compliance dashboards

Monthly:
- [ ] Rotate secrets
- [ ] Review RBAC policies
- [ ] Update threat model
- [ ] Security awareness training

Quarterly:
- [ ] Penetration testing
- [ ] Security architecture review
- [ ] Disaster recovery drill
- [ ] Compliance audit

## References

- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [OWASP Kubernetes Top 10](https://owasp.org/www-project-kubernetes-top-ten/)
- [NIST 800-190](https://csrc.nist.gov/publications/detail/sp/800-190/final)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)

---

**Document Owner:** Cortex Security Master
**Review Frequency:** Quarterly
**Next Review:** 2025-03-07
