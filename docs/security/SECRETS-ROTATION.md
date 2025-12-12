# Secrets Rotation Procedures

**Version:** 1.0.0
**Last Updated:** 2025-12-07
**Rotation Policy:** Every 90 days
**Next Rotation Due:** 2025-03-07

## Overview

This document provides procedures for rotating sensitive credentials used by the Cortex system. Regular secret rotation is critical for:
- Limiting exposure window if credentials are compromised
- Compliance with security policies
- Reducing attack surface

## Rotation Schedule

| Secret | Frequency | Last Rotated | Next Rotation | Owner |
|--------|-----------|--------------|---------------|-------|
| Anthropic API Key | 90 days | 2025-12-07 | 2025-03-07 | Security Team |
| GitHub Token | 90 days | 2025-12-07 | 2025-03-07 | DevOps Team |
| GHCR Token | 90 days | 2025-12-07 | 2025-03-07 | DevOps Team |
| Proxmox API Token | 90 days | N/A | As needed | Infrastructure |

## Emergency Rotation

**Trigger Immediately If:**
- Secret appears in public repository
- Secret found in logs or error messages
- Suspicious API usage detected
- Team member with access leaves
- Security breach suspected

**SLA:** <1 hour for emergency rotation

## Rotation Procedures

### 1. Anthropic API Key

#### Pre-Rotation Checklist
- [ ] Verify current key is working
- [ ] Check API usage/quota
- [ ] Schedule maintenance window (5 minutes)
- [ ] Notify team of rotation

#### Rotation Steps

**Step 1: Generate New Key**
```bash
# 1. Log in to Anthropic Console
open https://console.anthropic.com/settings/keys

# 2. Create new API key
#    Name: cortex-prod-$(date +%Y%m%d)
#    Permissions: Full access
#    Copy new key to secure location

# 3. Export new key
export NEW_ANTHROPIC_API_KEY="sk-ant-api03-..."
```

**Step 2: Update Kubernetes Secret**
```bash
# Create backup of current secret
kubectl get secret anthropic-api-key -n cortex -o yaml > \
  backups/anthropic-api-key-$(date +%Y%m%d).yaml

# Update secret
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=$NEW_ANTHROPIC_API_KEY \
  --namespace=cortex \
  --dry-run=client -o yaml | kubectl apply -f -

# Also update in main cortex-secrets
kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key=$NEW_ANTHROPIC_API_KEY \
  --from-literal=github-token=$GITHUB_TOKEN \
  --from-literal=ghcr-token=$GHCR_TOKEN \
  --namespace=cortex \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Step 3: Restart Pods**
```bash
# Restart all masters (rolling restart)
kubectl rollout restart statefulset -n cortex -l app.kubernetes.io/component=master

# Restart all workers
kubectl rollout restart deployment -n cortex -l app.kubernetes.io/component=worker

# Wait for rollout to complete
kubectl rollout status statefulset -n cortex --all --timeout=5m
kubectl rollout status deployment -n cortex --all --timeout=5m
```

**Step 4: Verify**
```bash
# Check that pods are running
kubectl get pods -n cortex

# Test API access from a master pod
kubectl exec -it cortex-coordinator-0 -n cortex -- \
  python3 -c "
import os
import anthropic
client = anthropic.Client(api_key=os.environ['ANTHROPIC_API_KEY'])
msg = client.messages.create(
    model='claude-3-5-sonnet-20241022',
    max_tokens=10,
    messages=[{'role': 'user', 'content': 'test'}]
)
print('API test successful')
"
```

**Step 5: Revoke Old Key**
```bash
# WAIT 24 hours to ensure all pods restarted

# 1. Log in to Anthropic Console
open https://console.anthropic.com/settings/keys

# 2. Delete old key
#    Verify last used date
#    Click "Delete" on old key
```

#### Post-Rotation Checklist
- [ ] All pods restarted successfully
- [ ] API calls working (check logs)
- [ ] Old key revoked (after 24h grace period)
- [ ] Update rotation tracking table
- [ ] Document any issues encountered

### 2. GitHub Personal Access Token

#### Pre-Rotation Checklist
- [ ] Verify current token scopes
- [ ] Check token usage
- [ ] Schedule maintenance window
- [ ] Notify team

#### Rotation Steps

**Step 1: Generate New Token**
```bash
# 1. Navigate to GitHub
open https://github.com/settings/tokens

# 2. Click "Generate new token (classic)"
#    Name: cortex-prod-$(date +%Y%m%d)
#    Scopes:
#      - repo (full control)
#      - workflow
#      - write:packages
#      - read:org
#    Expiration: 90 days
#    Click "Generate token"

# 3. Copy token
export NEW_GITHUB_TOKEN="ghp_..."
```

**Step 2: Update Secrets**
```bash
# Backup current secret
kubectl get secret github-token -n cortex -o yaml > \
  backups/github-token-$(date +%Y%m%d).yaml

# Update github-token secret
kubectl create secret generic github-token \
  --from-literal=token=$NEW_GITHUB_TOKEN \
  --namespace=cortex \
  --dry-run=client -o yaml | kubectl apply -f -

# Update cortex-secrets
kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key=$ANTHROPIC_API_KEY \
  --from-literal=github-token=$NEW_GITHUB_TOKEN \
  --from-literal=ghcr-token=$NEW_GITHUB_TOKEN \
  --namespace=cortex \
  --dry-run=client -o yaml | kubectl apply -f -

# Update GHCR pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --namespace=cortex \
  --docker-server=ghcr.io \
  --docker-username=$(git config user.name) \
  --docker-password=$NEW_GITHUB_TOKEN \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Step 3: Restart Pods**
```bash
# Restart development and PR workers (use GitHub token)
kubectl rollout restart deployment cortex-pr-worker -n cortex
kubectl rollout restart deployment cortex-code-worker -n cortex

# Restart masters that use GitHub
kubectl rollout restart statefulset cortex-development-master -n cortex
kubectl rollout restart statefulset cortex-cicd-master -n cortex

# Verify rollout
kubectl rollout status deployment cortex-pr-worker -n cortex --timeout=5m
```

**Step 4: Verify**
```bash
# Test GitHub API access
kubectl exec -it cortex-development-master-0 -n cortex -- \
  curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user

# Test GHCR access
kubectl exec -it cortex-pr-worker-0 -n cortex -- \
  docker pull ghcr.io/ry-ops/cortex-docker:latest
```

**Step 5: Revoke Old Token**
```bash
# WAIT 24 hours

# 1. Navigate to GitHub tokens
open https://github.com/settings/tokens

# 2. Find old token, click "Delete"
```

### 3. GHCR Token (Docker Registry)

**Note:** This is typically the same as the GitHub token. If using a separate token, follow the same procedure as GitHub token rotation.

### 4. Proxmox API Token

#### Rotation Steps

**Step 1: Generate New Token**
```bash
# SSH to Proxmox host
ssh root@proxmox.local

# Create new API token
pveum user token add cortex@pve cortex-prod-$(date +%Y%m%d) --privsep 0

# Copy token ID and secret
# Format: username@realm!tokenid=secret
```

**Step 2: Update Secret**
```bash
export NEW_PROXMOX_TOKEN="cortex@pve!cortex-prod-20251207=..."

kubectl create secret generic cortex-secrets \
  --from-literal=anthropic-api-key=$ANTHROPIC_API_KEY \
  --from-literal=github-token=$GITHUB_TOKEN \
  --from-literal=ghcr-token=$GHCR_TOKEN \
  --from-literal=proxmox-api-token=$NEW_PROXMOX_TOKEN \
  --namespace=cortex \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Step 3: Restart Affected Pods**
```bash
# Only restart pods that use Proxmox MCP
kubectl rollout restart deployment cortex-infrastructure-worker -n cortex
```

**Step 4: Revoke Old Token**
```bash
# SSH to Proxmox
ssh root@proxmox.local

# List tokens
pveum user token list cortex@pve

# Delete old token
pveum user token remove cortex@pve cortex-prod-old-tokenid
```

## Automated Rotation (Future Enhancement)

### External Secrets Operator

For automated rotation, consider deploying External Secrets Operator:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cortex-secrets
  namespace: cortex
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: cortex-secrets
  data:
  - secretKey: anthropic-api-key
    remoteRef:
      key: cortex/anthropic-api-key
```

### Sealed Secrets

For GitOps-friendly secret management:

```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Seal a secret
kubeseal --format yaml < cortex-secrets.yaml > cortex-secrets-sealed.yaml

# Commit sealed secret to Git (safe - encrypted)
git add cortex-secrets-sealed.yaml
git commit -m "Update sealed secrets"
```

## Rotation Tracking

### Rotation History Log

**Format:** `/Users/ryandahlberg/Projects/cortex/security/rotation-log.jsonl`

```jsonl
{"date": "2025-12-07", "secret": "anthropic-api-key", "rotated_by": "security-master", "reason": "scheduled", "success": true}
{"date": "2025-12-07", "secret": "github-token", "rotated_by": "security-master", "reason": "scheduled", "success": true}
```

### Audit Trail

Every rotation should be logged:
```bash
echo "{\"date\": \"$(date -u +%Y-%m-%d)\", \"secret\": \"anthropic-api-key\", \"rotated_by\": \"$USER\", \"reason\": \"scheduled\", \"success\": true}" >> \
  /Users/ryandahlberg/Projects/cortex/security/rotation-log.jsonl
```

## Emergency Revocation

### Compromised Secret Response

**If a secret is compromised (e.g., leaked to GitHub):**

```bash
#!/bin/bash
# emergency-revoke.sh

SECRET_TYPE=$1  # anthropic, github, proxmox

echo "EMERGENCY SECRET REVOCATION"
echo "==========================="
echo "Secret type: $SECRET_TYPE"
echo ""

# 1. Immediately revoke at source
case $SECRET_TYPE in
  anthropic)
    echo "1. Go to https://console.anthropic.com/settings/keys"
    echo "2. DELETE the exposed key immediately"
    echo "3. Press Enter when done..."
    read
    ;;
  github)
    echo "1. Go to https://github.com/settings/tokens"
    echo "2. DELETE the exposed token immediately"
    echo "3. Press Enter when done..."
    read
    ;;
esac

# 2. Delete Kubernetes secret
kubectl delete secret cortex-secrets -n cortex
kubectl delete secret $SECRET_TYPE-token -n cortex 2>/dev/null || true

# 3. Restart all pods (zero-downtime)
kubectl rollout restart statefulset -n cortex --all
kubectl rollout restart deployment -n cortex --all

# 4. Generate new credentials
echo ""
echo "Secret revoked. Now generate NEW credentials and run:"
echo "  ./scripts/security/create-secrets.sh"
echo ""
echo "Incident logged to: security/incidents/$(date +%Y%m%d)-revocation.log"

# 5. Log incident
mkdir -p security/incidents
cat > security/incidents/$(date +%Y%m%d)-revocation.log <<EOF
SECURITY INCIDENT: Secret Revocation
=====================================
Date: $(date -u)
Secret Type: $SECRET_TYPE
Action Taken: Emergency revocation
Revoked By: $USER
Next Steps: Generate new credentials, investigate leak source
EOF
```

### Make script executable
```bash
chmod +x emergency-revoke.sh
```

## Compliance & Auditing

### Audit Questions
- [ ] When was each secret last rotated?
- [ ] Are rotations documented?
- [ ] Are old secrets revoked?
- [ ] Is rotation schedule followed?

### Compliance Evidence

Store in: `/Users/ryandahlberg/Projects/cortex/security/compliance/`

1. **Rotation Logs** (`rotation-log.jsonl`)
2. **Backup Secrets** (encrypted, for audit trail)
3. **Verification Screenshots** (proving old keys revoked)

## Monitoring & Alerts

### Rotation Reminders

Set calendar reminders:
```bash
# Add to cron for reminder emails
0 0 1 * * [ $(date +\%d -d "+7 days") -eq 7 ] && echo "Secret rotation due in 7 days" | mail -s "Cortex: Rotate Secrets" security@example.com
```

### Metrics

Track in Prometheus:
```promql
# Days since last rotation
(time() - cortex_secret_rotation_timestamp) / 86400

# Alert if > 90 days
(time() - cortex_secret_rotation_timestamp) / 86400 > 90
```

## Troubleshooting

### Pods Not Starting After Rotation

**Symptoms:** Pods stuck in `CrashLoopBackOff`

**Cause:** Secret not mounted correctly

**Fix:**
```bash
# Check if secret exists
kubectl get secret cortex-secrets -n cortex

# Describe secret (verify keys)
kubectl describe secret cortex-secrets -n cortex

# Check pod events
kubectl describe pod <pod-name> -n cortex

# Verify environment variable injection
kubectl exec -it <pod-name> -n cortex -- env | grep ANTHROPIC
```

### API Authentication Failures

**Symptoms:** 401 Unauthorized errors in logs

**Cause:** New key not yet active or old key still in use

**Fix:**
```bash
# Verify new key is active at source
# Anthropic: Check console for key status
# GitHub: Test with curl

# Force pod restart
kubectl delete pod <pod-name> -n cortex

# Check logs
kubectl logs <pod-name> -n cortex
```

### Partial Rotation (Some Pods Using Old Key)

**Cause:** Rolling restart not complete

**Fix:**
```bash
# Force restart all pods
kubectl delete pods -n cortex --all

# Wait for recreation
kubectl wait --for=condition=ready pod -n cortex --all --timeout=5m
```

## References

- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [External Secrets Operator](https://external-secrets.io/)
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
- [Anthropic API Keys](https://console.anthropic.com/docs/api/authentication)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

---

**Document Owner:** Cortex Security Master
**Review Frequency:** After each rotation
**Next Review:** 2025-03-07
