# Cortex Security Audit Checklist

**Version:** 1.0.0
**Last Updated:** 2025-12-07
**Audit Frequency:** Monthly
**Next Audit:** 2026-01-07

## Overview

This checklist ensures comprehensive security coverage for the Cortex Kubernetes deployment. Complete this checklist monthly and after any significant infrastructure changes.

## Audit Metadata

**Audit Date:** _____________
**Auditor:** _____________
**Environment:** [ ] Production [ ] Staging [ ] Development
**Overall Status:** [ ] Pass [ ] Pass with Findings [ ] Fail

---

## 1. Pod Security Standards

**Objective:** Ensure all pods comply with restricted Pod Security Standards

### Namespace Configuration
- [ ] Cortex namespace has `pod-security.kubernetes.io/enforce: restricted` label
- [ ] Cortex namespace has `pod-security.kubernetes.io/audit: restricted` label
- [ ] Cortex namespace has `pod-security.kubernetes.io/warn: restricted` label

**Verification:**
```bash
kubectl get namespace cortex -o yaml | grep pod-security
```

### Pod Security Compliance
- [ ] All pods run as non-root (UID 1000)
- [ ] No pods have `privileged: true`
- [ ] No pods use host namespaces (hostNetwork, hostPID, hostIPC)
- [ ] All pods have `allowPrivilegeEscalation: false`
- [ ] All pods drop ALL capabilities
- [ ] All pods use `seccompProfile: RuntimeDefault`
- [ ] All pods have read-only root filesystem (where possible)

**Verification:**
```bash
# Check for privileged pods
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].securityContext.privileged}{"\n"}{end}'

# Check runAsNonRoot
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext.runAsNonRoot}{"\n"}{end}'

# Check allowPrivilegeEscalation
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].securityContext.allowPrivilegeEscalation}{"\n"}{end}'
```

**Findings:**
_Document any violations or exceptions_

---

## 2. RBAC & Identity

**Objective:** Verify least-privilege access controls

### ServiceAccounts
- [ ] cortex-coordinator-sa exists with appropriate permissions
- [ ] cortex-master-sa exists with read/write ConfigMap, read Secret permissions
- [ ] cortex-worker-sa exists with minimal read-only permissions
- [ ] cortex-prometheus-sa exists with cluster-wide read permissions
- [ ] No pods use the `default` ServiceAccount
- [ ] ServiceAccounts have `automountServiceAccountToken: true` only when needed

**Verification:**
```bash
# List ServiceAccounts
kubectl get sa -n cortex

# Check which pods use which ServiceAccounts
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.serviceAccountName}{"\n"}{end}'
```

### Roles & RoleBindings
- [ ] cortex-coordinator-role allows full resource management
- [ ] cortex-master-role allows ConfigMap read/write, Secret read
- [ ] cortex-worker-role allows ConfigMap read, Secret read
- [ ] No wildcard (*) permissions on sensitive resources
- [ ] No cluster-admin bindings to Cortex ServiceAccounts

**Verification:**
```bash
# Review role permissions
kubectl describe role cortex-master-role -n cortex
kubectl describe role cortex-worker-role -n cortex

# Check for cluster-admin bindings
kubectl get clusterrolebindings -o jsonpath='{range .items[?(@.subjects[*].namespace=="cortex")]}{.metadata.name}{"\t"}{.roleRef.name}{"\n"}{end}'
```

### Secrets Access Audit
- [ ] Review audit logs for Secret access patterns
- [ ] No unauthorized Secret access detected
- [ ] Secrets accessed only by authorized ServiceAccounts

**Verification:**
```bash
# Check recent Secret access (requires audit logging)
kubectl get events -n cortex --field-selector involvedObject.kind=Secret --sort-by='.lastTimestamp'
```

**Findings:**
_Document any RBAC violations or excessive permissions_

---

## 3. Network Policies

**Objective:** Verify network segmentation and deny-by-default

### Default Deny Policy
- [ ] `default-deny-all` NetworkPolicy exists in cortex namespace
- [ ] Policy denies all ingress by default
- [ ] Policy denies all egress by default

**Verification:**
```bash
kubectl get networkpolicy default-deny-all -n cortex
kubectl describe networkpolicy default-deny-all -n cortex
```

### Master Network Policy
- [ ] `cortex-masters-netpol` exists
- [ ] Allows ingress from workers, other masters, Prometheus
- [ ] Allows egress to workers, masters, external HTTPS (443)
- [ ] Denies all other traffic

**Verification:**
```bash
kubectl describe networkpolicy cortex-masters-netpol -n cortex
```

### Worker Network Policy
- [ ] `cortex-workers-netpol` exists
- [ ] Allows ingress from masters only
- [ ] Allows egress to masters, external APIs
- [ ] Denies ingress from external sources

**Verification:**
```bash
kubectl describe networkpolicy cortex-workers-netpol -n cortex
```

### Monitoring Network Policy
- [ ] `cortex-prometheus-netpol` and `cortex-grafana-netpol` exist
- [ ] Prometheus can scrape all Cortex pods
- [ ] Grafana can query Prometheus
- [ ] External access allowed on NodePorts only

### Network Policy Testing
- [ ] Test: Worker cannot directly access another worker
- [ ] Test: External pod cannot access Cortex masters
- [ ] Test: Master can communicate with worker
- [ ] Test: Prometheus can scrape metrics

**Test Commands:**
```bash
# Test worker-to-worker denial (should fail)
kubectl exec cortex-code-worker-0 -n cortex -- curl -m 3 cortex-scan-worker:8080

# Test master-to-worker (should succeed)
kubectl exec cortex-coordinator-0 -n cortex -- curl -m 3 cortex-code-worker:8080/health
```

**Findings:**
_Document any network policy gaps or violations_

---

## 4. Container & Image Security

**Objective:** Ensure containers are free of critical vulnerabilities

### Image Scanning
- [ ] Trivy scan completed in last 7 days
- [ ] Zero critical vulnerabilities detected
- [ ] High vulnerabilities < 5
- [ ] SBOM generated for all images
- [ ] GitHub Security tab shows no critical alerts

**Verification:**
```bash
# Run Trivy scan
trivy image --severity CRITICAL,HIGH ghcr.io/ry-ops/cortex-docker:latest

# Check GitHub Security tab
gh api repos/ry-ops/cortex/security-advisories
```

### Base Image Review
- [ ] Base image is from trusted source (official, distroless, etc.)
- [ ] Base image is up-to-date (< 30 days old)
- [ ] No use of `:latest` tag in production
- [ ] Image digest pinning enabled

**Verification:**
```bash
# Check image tags in deployments
kubectl get deployments -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[*].image}{"\n"}{end}'
```

### Dockerfile Security
- [ ] Hadolint scan passed (Dockerfile best practices)
- [ ] Multi-stage build used
- [ ] No secrets in image layers
- [ ] Health checks defined
- [ ] Minimal installed packages

**Verification:**
```bash
# Run Hadolint
hadolint Dockerfile

# Scan for secrets in image
trivy image --scanners secret ghcr.io/ry-ops/cortex-docker:latest
```

**Findings:**
_Document vulnerabilities and remediation plan_

---

## 5. Secrets Management

**Objective:** Ensure secrets are properly managed and rotated

### Secret Existence & Configuration
- [ ] `cortex-secrets` exists and contains required keys
- [ ] `anthropic-api-key` secret exists
- [ ] `github-token` secret exists
- [ ] `ghcr-pull-secret` exists
- [ ] No secrets stored in ConfigMaps
- [ ] No hardcoded secrets in code or manifests

**Verification:**
```bash
# List secrets
kubectl get secrets -n cortex

# Check for secrets in ConfigMaps (should be none)
kubectl get configmaps -n cortex -o json | grep -i "api.?key\|password\|token"
```

### Secret Access Control
- [ ] Secrets accessible only to authorized ServiceAccounts
- [ ] Secret access logged in audit logs
- [ ] No base64-decoded secrets in pod logs

**Verification:**
```bash
# Check which pods mount secrets
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.volumes[?(@.secret)].secret.secretName}{"\n"}{end}'
```

### Secret Rotation
- [ ] Last rotation date documented
- [ ] Rotation schedule followed (90 days)
- [ ] Old secrets revoked after rotation
- [ ] Rotation process tested

**Verification:**
```bash
# Check secret age
kubectl get secret cortex-secrets -n cortex -o jsonpath='{.metadata.creationTimestamp}'

# Review rotation log
cat security/rotation-log.jsonl
```

### Encryption at Rest
- [ ] Kubernetes etcd encryption enabled (optional but recommended)
- [ ] Sealed Secrets or External Secrets Operator considered for production

**Verification:**
```bash
# Check if etcd encryption is enabled
kubectl get pods -n kube-system -l component=etcd -o yaml | grep -A5 encryption-provider-config
```

**Findings:**
_Document secret management issues and rotation status_

---

## 6. Audit Logging

**Objective:** Ensure security events are logged and monitored

### Kubernetes Audit Logs
- [ ] Audit logging enabled on API server
- [ ] Audit policy captures Secret access
- [ ] Audit policy captures ConfigMap modifications
- [ ] Audit policy captures RBAC changes
- [ ] Audit policy captures exec/attach commands
- [ ] Logs retained for 90 days

**Verification:**
```bash
# Check if audit logging is enabled (K3s)
ps aux | grep kube-apiserver | grep audit

# Check audit logs exist
ls -lh /var/log/kubernetes/audit.log 2>/dev/null || echo "Audit logs not found - verify K3s config"
```

### Application Logging
- [ ] Pods emit structured logs
- [ ] Sensitive data redacted from logs
- [ ] Log levels appropriate (INFO in prod)
- [ ] Centralized log aggregation configured (optional)

**Verification:**
```bash
# Sample pod logs for sensitive data
kubectl logs cortex-coordinator-0 -n cortex --tail=100 | grep -iE 'api.?key|password|token|secret'
```

### Audit Log Review
- [ ] Review logs for unauthorized access attempts
- [ ] Review logs for Secret access patterns
- [ ] Review logs for unusual API calls

**Findings:**
_Document audit logging gaps or suspicious activity_

---

## 7. Compliance & Standards

**Objective:** Verify compliance with security frameworks

### CIS Kubernetes Benchmark
- [ ] Run `kube-bench` on cluster
- [ ] Score > 90% on Level 1 controls
- [ ] Critical findings remediated
- [ ] Results documented

**Verification:**
```bash
# Run kube-bench
docker run --rm --pid=host aquasec/kube-bench:latest run --targets node,policies,managedservices
```

### OWASP Kubernetes Top 10
- [ ] K01: Insecure Workload Configurations - Mitigated via Pod Security Standards
- [ ] K02: Supply Chain Vulnerabilities - Mitigated via image scanning
- [ ] K03: Overly Permissive RBAC - Mitigated via least privilege
- [ ] K04: Policy Enforcement - Partial (manual review)
- [ ] K05: Inadequate Logging - Partial (audit logs enabled)
- [ ] K06: Broken Authentication - Mitigated via ServiceAccounts
- [ ] K07: Network Segmentation - Mitigated via NetworkPolicies
- [ ] K08: Secrets Management - Partial (K8s Secrets, rotation)
- [ ] K09: Misconfigured Cluster - Mitigated via K3s defaults
- [ ] K10: Outdated Components - Ongoing (regular updates)

### NIST 800-190
- [ ] Image vulnerabilities addressed
- [ ] Image configuration secured
- [ ] Runtime protection implemented
- [ ] Host OS secured
- [ ] Orchestrator security controls applied

**Findings:**
_Document compliance gaps and remediation plan_

---

## 8. Monitoring & Alerting

**Objective:** Ensure security events trigger alerts

### Prometheus Alerts
- [ ] `CriticalVulnerabilityDetected` alert configured
- [ ] `UnauthorizedSecretAccess` alert configured
- [ ] `PodSecurityViolation` alert configured
- [ ] Alerts route to appropriate channels (email, Slack, PagerDuty)

**Verification:**
```bash
# Check Prometheus alerts
kubectl exec -it prometheus-0 -n cortex -- wget -qO- localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.type=="alerting")'
```

### Grafana Dashboards
- [ ] Security dashboard exists
- [ ] Vulnerability trends visible
- [ ] Failed authentication attempts tracked
- [ ] Network policy denials visible

**Verification:**
```bash
# Access Grafana and verify dashboards
open http://proxmox:30300
```

### Alert Testing
- [ ] Test critical alert triggers (simulate vulnerability)
- [ ] Verify alert delivery
- [ ] Verify on-call escalation

**Findings:**
_Document monitoring gaps or alert configuration issues_

---

## 9. Incident Response

**Objective:** Verify incident response readiness

### Procedures & Documentation
- [ ] Incident response plan documented
- [ ] Emergency contacts defined
- [ ] Escalation procedures clear
- [ ] Secret revocation procedure tested
- [ ] Backup and recovery procedures documented

### Incident Response Tools
- [ ] Emergency revocation script available
- [ ] Backup secrets stored securely
- [ ] Forensics tools available (kubectl, logs)
- [ ] Communication channels established

### Incident Response Drills
- [ ] Last tabletop exercise date: _____________
- [ ] Last full incident simulation: _____________
- [ ] Lessons learned documented

**Findings:**
_Document incident response gaps_

---

## 10. Operational Security

**Objective:** Ensure secure operations and maintenance

### Access Control
- [ ] Only authorized users have cluster access
- [ ] kubectl access requires authentication
- [ ] kubeconfig files protected (chmod 600)
- [ ] No shared credentials

**Verification:**
```bash
# List users with cluster access
kubectl config view -o jsonpath='{.users[*].name}'
```

### Patch Management
- [ ] Kubernetes version is supported (< 1 year old)
- [ ] K3s up-to-date with security patches
- [ ] Container images rebuilt in last 30 days
- [ ] OS packages up-to-date on nodes

**Verification:**
```bash
# Check Kubernetes version
kubectl version --short

# Check node OS versions
kubectl get nodes -o wide
```

### Backup & Recovery
- [ ] etcd backups scheduled
- [ ] Backup restore tested in last 90 days
- [ ] Disaster recovery runbook documented
- [ ] RTO/RPO defined

### Security Training
- [ ] Team trained on security best practices
- [ ] Security awareness training completed
- [ ] Incident response training completed

**Findings:**
_Document operational security gaps_

---

## 11. Third-Party Dependencies

**Objective:** Ensure third-party components are secure

### External Dependencies
- [ ] Anthropic API - Trusted provider
- [ ] GitHub API - Trusted provider
- [ ] Proxmox API - Trusted, internal
- [ ] Python packages - Scanned for vulnerabilities
- [ ] npm packages - Scanned for vulnerabilities

**Verification:**
```bash
# Scan Python dependencies
pip install safety
safety check --file requirements.txt

# Scan npm dependencies
npm audit
```

### Supply Chain Security
- [ ] SBOM generated for container images
- [ ] Dependency provenance verified
- [ ] Image signatures verified (Cosign, Notary)
- [ ] Trusted registry sources only

**Findings:**
_Document third-party risks_

---

## Summary & Recommendations

### Overall Compliance Score

**Total Checks:** _____ / _____
**Pass Rate:** _____%

**Status:**
- [ ] **PASS:** All critical controls in place, minor findings only
- [ ] **PASS WITH FINDINGS:** Most controls in place, remediation plan required
- [ ] **FAIL:** Critical gaps identified, immediate action required

### Critical Findings

1. _Finding 1_
   - Severity: [ ] Critical [ ] High [ ] Medium [ ] Low
   - Remediation: _____________
   - Due Date: _____________

2. _Finding 2_
   - Severity: [ ] Critical [ ] High [ ] Medium [ ] Low
   - Remediation: _____________
   - Due Date: _____________

### Recommendations

1. _Recommendation 1_
2. _Recommendation 2_
3. _Recommendation 3_

### Next Audit Date

**Scheduled:** _____________
**Frequency:** Monthly
**Special Audit Triggers:**
- After significant infrastructure changes
- After security incidents
- After major version upgrades

---

## Approval

**Auditor Signature:** _____________
**Date:** _____________

**Security Lead Approval:** _____________
**Date:** _____________

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-07
**Next Review:** Monthly
