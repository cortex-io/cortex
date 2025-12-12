# Security Hardening - Quick Reference

**Phase:** 5a - Security Hardening
**Status:** ✅ COMPLETE
**Date:** 2025-12-07

## Quick Deploy Commands

### 1. Apply Pod Security Standards
```bash
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/pod-security-admission.yaml
```

### 2. Create Secrets
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export GITHUB_TOKEN="ghp_..."
/Users/ryandahlberg/Projects/cortex/scripts/security/create-secrets.sh
```

### 3. Apply RBAC
```bash
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/cortex-serviceaccount.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/cortex-roles.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/cortex-rolebindings.yaml
```

### 4. Apply Network Policies
```bash
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/default-deny-networkpolicy.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/masters-networkpolicy.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/workers-networkpolicy.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/security/monitoring-networkpolicy.yaml
```

### 5. Verify Deployment
```bash
kubectl get namespace cortex -o yaml | grep pod-security
kubectl get sa,role,rolebinding,networkpolicy,secrets -n cortex
```

## Security Files Overview

### RBAC (3 files)
- `cortex-serviceaccount.yaml` - 4 ServiceAccounts
- `cortex-roles.yaml` - 4 Roles with least-privilege
- `cortex-rolebindings.yaml` - Bindings

### Network Policies (4 files)
- `default-deny-networkpolicy.yaml` - Default deny all
- `masters-networkpolicy.yaml` - Master pod segmentation
- `workers-networkpolicy.yaml` - Worker pod isolation
- `monitoring-networkpolicy.yaml` - Prometheus/Grafana access

### Pod Security (2 files)
- `pod-security-admission.yaml` - Namespace enforcement
- `security-context-template.yaml` - Template for deployments

### Secrets (2 files)
- `cortex-secrets.yaml.template` - Template
- `create-secrets.sh` - Automated creation script

### Scanning (3 files)
- `container-scan.yml` - GitHub Actions workflow
- `scan-running-containers.sh` - Manual scan script
- `cortex-docker-image-scan.md` - Scan report template

### Audit (1 file)
- `audit-policy.yaml` - Kubernetes audit policy

### Documentation (5 files)
- `SECURITY.md` - Comprehensive security architecture
- `SECRETS-ROTATION.md` - Rotation procedures
- `security-audit-checklist.md` - Monthly audit
- `DEPLOYMENT-GUIDE.md` - Step-by-step deployment
- `PHASE-5A-SECURITY-SUMMARY.md` - Completion summary

## Verification Checklist

- [ ] Pod Security Standards enforced on namespace
- [ ] 4 ServiceAccounts created
- [ ] 4 Roles with least-privilege
- [ ] 5 Network Policies active
- [ ] 4 Secrets created
- [ ] All pods run as non-root (UID 1000)
- [ ] Default deny network policy active
- [ ] RBAC tested (can-i checks)

## Common Commands

### Check Pod Security
```bash
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext.runAsNonRoot}{"\n"}{end}'
```

### Check RBAC Permissions
```bash
kubectl auth can-i create configmaps --as=system:serviceaccount:cortex:cortex-master-sa -n cortex
```

### Test Network Policy
```bash
kubectl run test-pod --rm -it --image=alpine -n cortex -- wget -T 3 cortex-code-worker:8080
```

### Scan Containers
```bash
/Users/ryandahlberg/Projects/cortex/scripts/security/scan-running-containers.sh cortex
```

### View Audit Logs (K3s node)
```bash
sudo tail -f /var/log/kubernetes/audit.log | grep cortex
```

## Emergency Procedures

### Revoke Compromised Secret
```bash
# 1. Delete secret
kubectl delete secret cortex-secrets -n cortex

# 2. Revoke at source (Anthropic/GitHub console)

# 3. Restart pods
kubectl rollout restart statefulset -n cortex --all
kubectl rollout restart deployment -n cortex --all

# 4. Create new secret
export ANTHROPIC_API_KEY="new-key"
./scripts/security/create-secrets.sh
```

### Disable Network Policy (Emergency)
```bash
kubectl delete networkpolicy default-deny-all -n cortex
```

### Rollback Security Context
```bash
kubectl rollout undo statefulset cortex-coordinator -n cortex
```

## Next Steps

1. Review DEPLOYMENT-GUIDE.md for full deployment
2. Complete security-audit-checklist.md
3. Schedule secret rotation (90 days)
4. Set up automated scanning
5. Enable Kubernetes audit logging

## Support

- Deployment Guide: `/Users/ryandahlberg/Projects/cortex/k8s/security/DEPLOYMENT-GUIDE.md`
- Security Docs: `/Users/ryandahlberg/Projects/cortex/docs/security/SECURITY.md`
- Summary: `/Users/ryandahlberg/Projects/cortex/security/reports/PHASE-5A-SECURITY-SUMMARY.md`
- Handoff: `/Users/ryandahlberg/Projects/cortex/coordination/masters/security/handoffs/sec-to-coordinator-phase5-*.json`
