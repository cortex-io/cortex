# GitHub Security Integration for Wazuh v4.7.0

## Overview

This is a custom GitHub security integration for Wazuh v4.7.0 that works as an alternative to the native GitHub wodle module (which is only available in Wazuh v4.14.1+).

Since upgrading to v4.14.1+ has proven problematic due to indexer security plugin initialization issues, this custom solution provides GitHub repository scanning capabilities without requiring a Wazuh upgrade.

## Architecture

The integration consists of:

1. **GitHub Security Scanner Script** - Polls GitHub API for security events
2. **Wazuh Custom Decoder** - Parses GitHub security events as JSON
3. **Wazuh Custom Rules** - Generates alerts based on GitHub security findings
4. **Cron Job** - Runs scanner every 30 minutes

## Features

The integration monitors:

- Repository security settings (branch protection, visibility, vulnerability alerts)
- Dependabot alerts (when token has appropriate permissions)
- Code scanning alerts (requires GitHub Advanced Security)
- Secret scanning alerts (requires GitHub Advanced Security)
- Security advisories
- Recent commit activity (last 24 hours)

## Components

### 1. GitHub Security Scanner

**Location:** `/usr/local/bin/github-security-scanner.sh` (inside Wazuh manager pod)

**What it does:**
- Fetches all repositories for the GitHub account (user or org)
- For each repository, checks:
  - Security settings (branch protection, vulnerability alerts enabled)
  - Dependabot alerts (if accessible)
  - Recent commit activity
- Writes events as single-line JSON to `/var/ossec/logs/github-security.log`
- Runs every 30 minutes via cron

**Configuration:**
- `GITHUB_TOKEN`: Personal access token with `repo` and `read:org` scopes
- `GITHUB_ACCOUNT`: GitHub username or organization name

### 2. Wazuh Decoder

**Location:** `/var/ossec/etc/decoders/github-decoder.xml`

**Purpose:** Identifies and parses GitHub security logs as JSON

```xml
<decoder name="github-security">
  <prematch>"source":"github_security"</prematch>
  <plugin_decoder>JSON_Decoder</plugin_decoder>
</decoder>
```

### 3. Wazuh Rules

**Location:** `/var/ossec/etc/rules/github-rules.xml`

**Alert Levels:**

| Rule ID | Level | Event Type | Description |
|---------|-------|------------|-------------|
| 110001  | 12 (Critical) | Dependabot - Critical | Critical vulnerabilities detected |
| 110002  | 10 (High) | Dependabot - High | High severity vulnerabilities |
| 110003  | 7 (Medium) | Dependabot - Medium | Medium severity vulnerabilities |
| 110004  | 13 (Critical) | Secret Scanning | Secrets detected in repository |
| 110005  | 10 (High) | Code Scanning | Code scanning errors |
| 110006  | 11 (High) | Security Advisory | Security advisory published |
| 110007  | 8 (High) | Config Issue | Unprotected default branch |
| 110008  | 8 (High) | Config Issue | Vulnerability alerts disabled |
| 110009  | 5 (Info) | Informational | Public repository |
| 110010  | 6 (Info) | Audit Log | Organization audit events |
| 110011  | 3 (Low) | Activity | Recent commit activity |

### 4. Cron Job

**Location:** Inside Wazuh manager pod crontab

**Schedule:** Every 30 minutes

```cron
*/30 * * * * GITHUB_TOKEN=ghp_... GITHUB_ACCOUNT=ry-ops /usr/local/bin/github-security-scanner.sh >> /var/ossec/logs/github-scanner.log 2>&1
```

## Installation

The integration is already installed and running. Components are located:

- **Scanner Script:** `/usr/local/bin/github-security-scanner.sh` (in wazuh-manager-0 pod)
- **Local Copy:** `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/github-security-scanner-simplified.sh`
- **Decoder:** `/var/ossec/etc/decoders/github-decoder.xml`
- **Rules:** `/var/ossec/etc/rules/github-rules.xml`
- **Log File:** `/var/ossec/logs/github-security.log`
- **Scanner Log:** `/var/ossec/logs/github-scanner.log`

## Configuration

### GitHub Token Requirements

The GitHub token needs the following scopes:

- `repo` - Access to repositories
- `read:org` - Read organization data (if scanning an organization)
- `read:security_events` - Access to Dependabot/code scanning (optional, but recommended)

### Current Configuration

- **Account:** ry-ops (GitHub user)
- **Token:** Stored in Kubernetes secret `github-wazuh-token` (namespace: wazuh-security)
- **Scan Frequency:** Every 30 minutes
- **Repositories Found:** 18 repositories

### Updating GitHub Token

If you need to update the GitHub token:

```bash
# Update Kubernetes secret
kubectl create secret generic github-wazuh-token \
  --from-literal=token=YOUR_NEW_TOKEN \
  --namespace=wazuh-security \
  --dry-run=client -o yaml | kubectl apply -f -

# Update cron job in Wazuh manager
kubectl exec -n wazuh-security wazuh-manager-0 -- bash -c 'crontab -l | sed "s/GITHUB_TOKEN=[^ ]*/GITHUB_TOKEN=YOUR_NEW_TOKEN/" | crontab -'
```

## Viewing Alerts

### In Wazuh Dashboard

1. Navigate to Wazuh Dashboard: https://wazuh.DOMAIN
2. Go to **Security Events**
3. Filter by:
   - `rule.groups: github_security`
   - `data.source: github_security`

### Using CLI

```bash
# View recent GitHub alerts
kubectl exec -n wazuh-security wazuh-manager-0 -- \
  tail -100 /var/ossec/logs/alerts/alerts.json | \
  jq 'select(.data.source == "github_security")'

# View GitHub security log
kubectl exec -n wazuh-security wazuh-manager-0 -- \
  cat /var/ossec/logs/github-security.log | jq '.'

# View scanner execution log
kubectl exec -n wazuh-security wazuh-manager-0 -- \
  tail -50 /var/ossec/logs/github-scanner.log
```

## Event Examples

### Repository Security Status

```json
{
  "timestamp": "2025-12-22T16:43:10Z",
  "source": "github_security",
  "event_type": "repository_security_status",
  "account": "ry-ops",
  "repository": "cortex",
  "repository_full_name": "ry-ops/cortex",
  "security_settings": {
    "visibility": "public",
    "is_private": false,
    "vulnerability_alerts_enabled": true,
    "default_branch_protected": false,
    "default_branch": "main"
  }
}
```

### Dependabot Alerts

```json
{
  "timestamp": "2025-12-22T16:43:10Z",
  "source": "github_security",
  "event_type": "dependabot_alerts",
  "account": "ry-ops",
  "repository": "example-app",
  "repository_full_name": "ry-ops/example-app",
  "vulnerabilities": {
    "critical": 2,
    "high": 5,
    "medium": 3,
    "low": 1,
    "total": 11
  }
}
```

### Repository Activity

```json
{
  "timestamp": "2025-12-22T16:43:10Z",
  "source": "github_security",
  "event_type": "repository_activity",
  "account": "ry-ops",
  "repository": "cortex",
  "repository_full_name": "ry-ops/cortex",
  "activity": {
    "commits_last_24h": 15
  }
}
```

## Manual Scan

To run a manual scan:

```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- \
  bash -c "GITHUB_TOKEN='YOUR_TOKEN' GITHUB_ACCOUNT='ry-ops' \
  /usr/local/bin/github-security-scanner.sh"
```

## Troubleshooting

### No alerts appearing

1. Check if scanner is running:
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- tail -50 /var/ossec/logs/github-scanner.log
```

2. Check if events are being written:
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- tail -20 /var/ossec/logs/github-security.log
```

3. Check Wazuh is processing the log:
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- tail -50 /var/ossec/logs/ossec.log | grep github
```

4. Restart Wazuh:
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control restart
```

### Dependabot alerts not accessible

This is expected if your GitHub token doesn't have the `read:security_events` scope or if the repository doesn't have Dependabot enabled. To fix:

1. Generate a new token with required scopes
2. Update the token as shown above
3. Enable Dependabot in repository settings

### Cron job not running

Check cron is running and job is scheduled:

```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- service cron status
kubectl exec -n wazuh-security wazuh-manager-0 -- crontab -l
```

If cron stopped (pod restart), start it again:

```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- service cron start
```

## Limitations

1. **No Real-Time Events:** Scans run every 30 minutes, not real-time
2. **Token Permissions:** Some features require GitHub Advanced Security or specific token scopes
3. **Rate Limiting:** GitHub API has rate limits (5000 requests/hour for authenticated users)
4. **Pod Restarts:** Cron job needs to be restarted if Wazuh manager pod restarts

## Future Improvements

1. **Persistent Cron:** Use a sidecar container or systemd to ensure cron survives pod restarts
2. **Webhook Integration:** Add GitHub webhooks for real-time events
3. **Enhanced Scanning:** Add pull request scanning, workflow run monitoring
4. **Dashboard Widget:** Create custom Wazuh dashboard widget for GitHub metrics

## Files Reference

All files located in: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/`

- `github-security-scanner.sh` - Full-featured scanner (original)
- `github-security-scanner-simplified.sh` - Simplified scanner (currently deployed)
- `github-scanner-deployment.yaml` - Kubernetes manifests (ConfigMaps, not currently used)
- `GITHUB-INTEGRATION-README.md` - This documentation

## Support

For issues or questions:

1. Check scanner logs: `/var/ossec/logs/github-scanner.log`
2. Check GitHub events: `/var/ossec/logs/github-security.log`
3. Check Wazuh processing: `/var/ossec/logs/ossec.log`
4. Review decoder: `/var/ossec/etc/decoders/github-decoder.xml`
5. Review rules: `/var/ossec/etc/rules/github-rules.xml`

## Version Information

- **Wazuh Version:** 4.7.0
- **Integration Version:** 1.0
- **Date Deployed:** 2025-12-22
- **Maintained By:** Development Master (Cortex AI)

## Why Not Use Native GitHub Wodle?

The native GitHub wodle module (`<wodle name="github">`) was introduced in Wazuh v4.14.0+. However:

1. Upgrading to v4.14.x causes indexer security plugin initialization failures
2. Version v4.7.0 is stable and has all 7 agents connected
3. Custom integration provides similar functionality without upgrade risks
4. See `/Users/ryandahlberg/Projects/cortex/docs/knowledge-base/wazuh-version-management.md` for version compatibility rules

This custom integration is the recommended approach until Wazuh indexer issues are resolved in future versions.
