# Security Hardening Deployment Guide

**Version:** 1.0.0
**Date:** 2025-12-07
**Phase:** 5a - Security Hardening

## Overview

This guide provides step-by-step instructions for deploying comprehensive security hardening to the Cortex Kubernetes cluster.

## Prerequisites

- K3s cluster running
- kubectl configured with admin access
- Cortex namespace exists
- Required environment variables set (ANTHROPIC_API_KEY, GITHUB_TOKEN)

## Deployment Order

Security components must be deployed in this order to avoid conflicts:

1. Pod Security Standards (Namespace)
2. Secrets
3. RBAC (ServiceAccounts, Roles, RoleBindings)
4. Network Policies
5. Update Deployments with Security Contexts
6. Enable Audit Logging
7. Verification & Testing

## Step-by-Step Deployment

### Step 1: Apply Pod Security Standards

```bash
# Apply namespace with Pod Security Standards
kubectl apply -f k8s/security/pod-security-admission.yaml

# Verify
kubectl get namespace cortex -o yaml | grep pod-security
```

**Expected Output:**
```
pod-security.kubernetes.io/enforce: restricted
pod-security.kubernetes.io/audit: restricted
pod-security.kubernetes.io/warn: restricted
```

### Step 2: Create Secrets

```bash
# Export required environment variables
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export GITHUB_TOKEN="ghp_..."
export GHCR_TOKEN="$GITHUB_TOKEN"

# Run secret creation script
./scripts/security/create-secrets.sh

# Verify secrets created
kubectl get secrets -n cortex
```

**Expected Secrets:**
- cortex-secrets
- anthropic-api-key
- github-token
- ghcr-pull-secret

### Step 3: Apply RBAC Configuration

```bash
# Apply ServiceAccounts
kubectl apply -f k8s/security/cortex-serviceaccount.yaml

# Apply Roles
kubectl apply -f k8s/security/cortex-roles.yaml

# Apply RoleBindings
kubectl apply -f k8s/security/cortex-rolebindings.yaml

# Verify RBAC
kubectl get sa,role,rolebinding -n cortex
```

**Verification:**
```bash
# Test coordinator SA permissions (should succeed)
kubectl auth can-i create configmaps --as=system:serviceaccount:cortex:cortex-coordinator-sa -n cortex

# Test worker SA permissions (should fail - read-only)
kubectl auth can-i delete configmaps --as=system:serviceaccount:cortex:cortex-worker-sa -n cortex
```

### Step 4: Apply Network Policies

```bash
# Apply default deny policy FIRST
kubectl apply -f k8s/security/default-deny-networkpolicy.yaml

# Apply master network policy
kubectl apply -f k8s/security/masters-networkpolicy.yaml

# Apply worker network policy
kubectl apply -f k8s/security/workers-networkpolicy.yaml

# Apply monitoring network policy
kubectl apply -f k8s/security/monitoring-networkpolicy.yaml

# Verify network policies
kubectl get networkpolicies -n cortex
```

**Expected Policies:**
- default-deny-all
- cortex-masters-netpol
- cortex-workers-netpol
- cortex-prometheus-netpol
- cortex-grafana-netpol

### Step 5: Update Deployments with Security Contexts

**Option A: Manual Update**

For each StatefulSet and Deployment, add security contexts as shown in `k8s/security/security-context-template.yaml`.

Example for cortex-coordinator:
```bash
kubectl edit statefulset cortex-coordinator -n cortex
```

Add:
```yaml
spec:
  template:
    spec:
      serviceAccountName: cortex-coordinator-sa  # Add this
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        fsGroupChangePolicy: "OnRootMismatch"
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: cortex
        securityContext:
          allowPrivilegeEscalation: false
          runAsNonRoot: true
          runAsUser: 1000
          runAsGroup: 1000
          readOnlyRootFilesystem: true
          capabilities:
            drop:
              - ALL
          seccompProfile:
            type: RuntimeDefault
        volumeMounts:
          - name: tmp
            mountPath: /tmp
          - name: cache
            mountPath: /home/cortex/.cache
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
```

**Option B: Automated Script (Recommended)**

```bash
# Create update script
cat > scripts/security/apply-security-contexts.sh <<'EOF'
#!/bin/bash
set -euo pipefail

NAMESPACE="cortex"

echo "Applying security contexts to all deployments and statefulsets..."

# List of resources to update
STATEFULSETS=(
  "cortex-coordinator"
  "cortex-security-master"
  "cortex-development-master"
  "cortex-cicd-master"
  "cortex-cleanup-master"
  "cortex-orchestrator-master"
)

DEPLOYMENTS=(
  "cortex-code-worker"
  "cortex-pr-worker"
  "cortex-scan-worker"
  "cortex-audit-worker"
)

# Update StatefulSets
for sts in "${STATEFULSETS[@]}"; do
  echo "Updating StatefulSet: $sts"
  kubectl patch statefulset "$sts" -n "$NAMESPACE" --type='json' -p='[
    {
      "op": "add",
      "path": "/spec/template/spec/securityContext",
      "value": {
        "runAsNonRoot": true,
        "runAsUser": 1000,
        "runAsGroup": 1000,
        "fsGroup": 1000,
        "fsGroupChangePolicy": "OnRootMismatch",
        "seccompProfile": {"type": "RuntimeDefault"}
      }
    },
    {
      "op": "add",
      "path": "/spec/template/spec/containers/0/securityContext",
      "value": {
        "allowPrivilegeEscalation": false,
        "runAsNonRoot": true,
        "runAsUser": 1000,
        "runAsGroup": 1000,
        "readOnlyRootFilesystem": true,
        "capabilities": {"drop": ["ALL"]},
        "seccompProfile": {"type": "RuntimeDefault"}
      }
    }
  ]' || echo "  Warning: Patch may have partially failed"
done

# Update Deployments
for deploy in "${DEPLOYMENTS[@]}"; do
  echo "Updating Deployment: $deploy"
  kubectl patch deployment "$deploy" -n "$NAMESPACE" --type='json' -p='[
    {
      "op": "add",
      "path": "/spec/template/spec/securityContext",
      "value": {
        "runAsNonRoot": true,
        "runAsUser": 1000,
        "runAsGroup": 1000,
        "fsGroup": 1000,
        "fsGroupChangePolicy": "OnRootMismatch",
        "seccompProfile": {"type": "RuntimeDefault"}
      }
    },
    {
      "op": "add",
      "path": "/spec/template/spec/containers/0/securityContext",
      "value": {
        "allowPrivilegeEscalation": false,
        "runAsNonRoot": true,
        "runAsUser": 1000,
        "runAsGroup": 1000,
        "readOnlyRootFilesystem": true,
        "capabilities": {"drop": ["ALL"]},
        "seccompProfile": {"type": "RuntimeDefault"}
      }
    }
  ]' || echo "  Warning: Patch may have partially failed"
done

echo "Security contexts applied. Pods will restart automatically."
EOF

chmod +x scripts/security/apply-security-contexts.sh
./scripts/security/apply-security-contexts.sh
```

### Step 6: Enable Kubernetes Audit Logging

**For K3s:**

```bash
# SSH to K3s node
ssh user@proxmox-node

# Create audit policy directory
sudo mkdir -p /var/lib/rancher/k3s/server

# Copy audit policy
sudo cp k8s/security/audit-policy.yaml /var/lib/rancher/k3s/server/audit-policy.yaml

# Create log directory
sudo mkdir -p /var/log/kubernetes

# Edit K3s config
sudo nano /etc/rancher/k3s/config.yaml
```

Add:
```yaml
kube-apiserver-arg:
  - audit-policy-file=/var/lib/rancher/k3s/server/audit-policy.yaml
  - audit-log-path=/var/log/kubernetes/audit.log
  - audit-log-maxage=30
  - audit-log-maxbackup=10
  - audit-log-maxsize=100
```

```bash
# Restart K3s
sudo systemctl restart k3s

# Verify audit logs
sudo tail -f /var/log/kubernetes/audit.log
```

### Step 7: Verification & Testing

#### 7.1 Verify Pod Security

```bash
# Check all pods are running as non-root
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext.runAsNonRoot}{"\n"}{end}'

# Check no privileged pods
kubectl get pods -n cortex -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].securityContext.privileged}{"\n"}{end}'
```

#### 7.2 Verify RBAC

```bash
# Test coordinator permissions
kubectl auth can-i create deployments --as=system:serviceaccount:cortex:cortex-coordinator-sa -n cortex
# Expected: yes

# Test worker cannot delete secrets
kubectl auth can-i delete secrets --as=system:serviceaccount:cortex:cortex-worker-sa -n cortex
# Expected: no
```

#### 7.3 Verify Network Policies

```bash
# Deploy test pod
kubectl run test-pod --rm -it --image=alpine --namespace=cortex -- sh

# Inside test pod, try to access another pod (should fail due to network policy)
wget -T 3 cortex-code-worker:8080
# Expected: timeout (network policy blocking)
```

#### 7.4 Run Security Scan

```bash
# Scan container image
./scripts/security/scan-running-containers.sh cortex

# Review report
cat security/reports/scan-summary-*.md
```

#### 7.5 Verify Secrets

```bash
# Check secrets exist
kubectl get secrets -n cortex

# Verify pods can access secrets
kubectl exec cortex-coordinator-0 -n cortex -- env | grep ANTHROPIC_API_KEY
# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

### Step 8: Security Audit

```bash
# Run full security audit
docs/security/security-audit-checklist.md

# Expected: All checkboxes should be checked
```

## Rollback Procedure

If security hardening causes issues:

```bash
# 1. Remove network policies (restores connectivity)
kubectl delete networkpolicy --all -n cortex

# 2. Remove Pod Security Standards from namespace
kubectl label namespace cortex pod-security.kubernetes.io/enforce- pod-security.kubernetes.io/audit- pod-security.kubernetes.io/warn-

# 3. Revert security contexts (requires manual edit or redeployment)
kubectl rollout undo statefulset cortex-coordinator -n cortex
kubectl rollout undo deployment cortex-code-worker -n cortex
# Repeat for all deployments/statefulsets

# 4. Restore from backup manifests
kubectl apply -f backups/pre-security-hardening/
```

## Monitoring Post-Deployment

```bash
# Monitor pod restarts
kubectl get pods -n cortex --watch

# Check for security violations
kubectl get events -n cortex | grep -i "security\|violation\|denied"

# Review audit logs
ssh user@proxmox-node
sudo tail -f /var/log/kubernetes/audit.log | grep cortex
```

## Troubleshooting

### Issue: Pods stuck in CrashLoopBackOff

**Cause:** Container cannot run as non-root or read-only filesystem

**Fix:**
```bash
# Check pod logs
kubectl logs <pod-name> -n cortex

# Common fix: Add writable volumes
kubectl edit statefulset <name> -n cortex
# Add volumes for /tmp, /home/cortex/.cache
```

### Issue: Network connectivity lost

**Cause:** Network policies too restrictive

**Fix:**
```bash
# Temporarily remove network policies
kubectl delete networkpolicy <policy-name> -n cortex

# Review and adjust policy
kubectl edit networkpolicy <policy-name> -n cortex
```

### Issue: RBAC permission denied

**Cause:** ServiceAccount lacks required permissions

**Fix:**
```bash
# Check current permissions
kubectl describe role cortex-worker-role -n cortex

# Update role with required permissions
kubectl edit role cortex-worker-role -n cortex
```

## Success Criteria

- [ ] All pods running with security contexts
- [ ] No privileged containers
- [ ] Network policies enforcing segmentation
- [ ] RBAC limiting access per role
- [ ] Secrets encrypted and rotated
- [ ] Audit logging enabled
- [ ] Container scans show no critical vulnerabilities
- [ ] Security audit checklist 100% complete

## Next Steps

1. Schedule monthly security audits
2. Set up automated vulnerability scanning (GitHub Actions)
3. Configure secret rotation reminders (90 days)
4. Implement centralized logging (ELK/Splunk)
5. Consider Sealed Secrets or External Secrets Operator for production

## References

- Security Documentation: `docs/security/SECURITY.md`
- Secrets Rotation: `docs/security/SECRETS-ROTATION.md`
- Audit Checklist: `docs/security/security-audit-checklist.md`
- Container Scan Report: `security/reports/cortex-docker-image-scan.md`

---

**Deployment Owner:** Cortex Security Master
**Support:** security@example.com
