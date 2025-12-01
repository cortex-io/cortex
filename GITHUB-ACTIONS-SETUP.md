# GitHub Actions Automated Reports - Setup Summary

## Overview

GitHub Actions workflows have been configured for automated weekly and monthly reporting in Cortex. All workflows are ready to use and will automatically generate reports on schedule.

## Workflows Created/Updated

### 1. Weekly Report (`weekly-report.yml`)

**Status**: Enhanced with permissions and artifacts support

**Schedule**: Every Monday at 9 AM UTC

**Features**:
- Generates 3 reports: Weekly Summary, Security Audit, and Cost Report
- AI-powered insights using Claude API (optional)
- Deploys to GitHub Pages automatically
- Creates downloadable artifacts (90-day retention)
- Workflow summary with direct links to reports

**Configuration**:
```yaml
permissions:
  contents: write
  pages: write
  id-token: write
```

---

### 2. Monthly Security Audit (`monthly-security-audit.yml`)

**Status**: New workflow created

**Schedule**: First day of each month at 10 AM UTC

**Features**:
- Comprehensive security posture assessment
- Automated security scanning
- AI-powered vulnerability analysis
- Critical findings detection with warnings
- 365-day artifact retention
- PDF and HTML output formats

**Configuration**:
```yaml
permissions:
  contents: write
  pages: write
  id-token: write
  security-events: read
```

---

### 3. Monthly Cost Report (`monthly-cost-report.yml`)

**Status**: New workflow created

**Schedule**: Last day of each month at 11 AM UTC

**Features**:
- Token usage and cost analysis
- Monthly trend tracking
- Budget forecasting
- 365-day artifact retention
- PDF and HTML output formats

**Configuration**:
```yaml
permissions:
  contents: write
  pages: write
  id-token: write
```

---

## Quick Start

### 1. Enable GitHub Pages

1. Go to: **Settings > Pages**
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** / **root**
4. Click **Save**

After the first workflow run, reports will be available at:
```
https://<your-username>.github.io/cortex/reports/
```

### 2. Configure Secrets (Optional but Recommended)

For AI-powered insights, add your Anthropic API key:

1. Go to: **Settings > Secrets and variables > Actions**
2. Click: **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: Your Anthropic API key
5. Click: **Add secret**

Without this key, reports will still generate but without AI summaries.

### 3. Test Manually (Optional)

Trigger a workflow manually to test:

**Via GitHub UI**:
1. Go to: **Actions** tab
2. Select: **Generate Weekly Report** (or other workflow)
3. Click: **Run workflow**
4. Select branch: **main**
5. Click: **Run workflow**

**Via GitHub CLI**:
```bash
gh workflow run weekly-report.yml
gh workflow run monthly-security-audit.yml
gh workflow run monthly-cost-report.yml
```

---

## File Structure

```
cortex/
├── .github/
│   └── workflows/
│       ├── weekly-report.yml              # Enhanced - Weekly reports
│       ├── monthly-security-audit.yml     # New - Monthly security
│       ├── monthly-cost-report.yml        # New - Monthly costs
│       ├── security-scan.yml              # Existing - Security scanning
│       ├── security.yml                   # Existing - Security checks
│       └── README.md                      # New - Quick reference
├── reports/
│   ├── _quarto.yml                        # Quarto configuration
│   ├── weekly-summary.qmd                 # Weekly report template
│   ├── security-audit.qmd                 # Security report template
│   └── cost-report.qmd                    # Cost report template
├── scripts/
│   └── test-reports.sh                    # New - Local testing script
├── docs/
│   └── GITHUB-ACTIONS-REPORTS.md          # New - Complete documentation
└── GITHUB-ACTIONS-SETUP.md                # This file
```

---

## Local Testing

Test reports before they run in GitHub Actions:

```bash
# Make script executable (already done)
chmod +x scripts/test-reports.sh

# Run tests
bash scripts/test-reports.sh
```

Or manually:
```bash
# Install dependencies
cd reports
pip install polars anthropic plotly pandas

# Generate reports
quarto render weekly-summary.qmd
quarto render security-audit.qmd
quarto render cost-report.qmd

# View reports
open _site/index.html
```

---

## Monitoring Workflows

### Check Status

**GitHub UI**:
1. Go to **Actions** tab
2. View workflow runs and logs

**GitHub CLI**:
```bash
# List recent runs
gh run list

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log

# Watch live
gh run watch
```

### Enable Notifications

1. Go to: **Settings > Notifications**
2. Enable: **Actions**
3. Choose your notification preferences

---

## Report Access

### GitHub Pages URLs

After setup, access reports at:

- **All Reports**: `https://<username>.github.io/cortex/reports/`
- **Weekly Summary**: `https://<username>.github.io/cortex/reports/weekly-summary.html`
- **Security Audit**: `https://<username>.github.io/cortex/reports/security-audit.html`
- **Cost Report**: `https://<username>.github.io/cortex/reports/cost-report.html`

### Workflow Artifacts

Download reports as artifacts:

1. **Actions** > Select workflow run
2. Scroll to **Artifacts** section
3. Download report archive

**Retention**:
- Weekly reports: 90 days
- Monthly reports: 365 days

---

## Customization

### Change Schedule

Edit the `cron` expression in workflow files:

```yaml
on:
  schedule:
    - cron: '0 9 * * MON'  # Every Monday at 9 AM UTC
```

**Format**: `minute hour day month day-of-week`

**Examples**:
- Daily at 8 AM: `'0 8 * * *'`
- Twice daily: `'0 8,20 * * *'`
- Every Friday: `'0 9 * * FRI'`
- First of month: `'0 10 1 * *'`

### Add Custom Reports

1. Create new `.qmd` file in `reports/` directory
2. Add to `reports/_quarto.yml` navigation
3. Add render step to appropriate workflow:

```yaml
- name: Render custom report
  run: |
    cd reports
    quarto render custom-report.qmd
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Reports not deploying | Check GitHub Pages settings, ensure gh-pages branch exists |
| AI insights not working | Verify ANTHROPIC_API_KEY secret is set correctly |
| Permission denied | Check workflow permissions in .yml files |
| Missing dependencies | Verify pip install step includes all packages |
| Workflow not triggering | Check cron syntax and timezone (UTC) |

### Debug Mode

Enable verbose logging:

1. **Settings > Secrets and variables > Actions > Variables**
2. New variable: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run workflow

### View Error Logs

```bash
# Get failed run ID
gh run list --workflow=weekly-report.yml --status=failure

# View logs
gh run view <run-id> --log
```

---

## Cost Considerations

### GitHub Actions Minutes

- Free tier: 2,000 minutes/month for private repos
- Public repos: Unlimited

### Estimated Usage

| Workflow | Frequency | Duration | Monthly Minutes |
|----------|-----------|----------|-----------------|
| Weekly Report | 4x/month | 10 min | 40 min |
| Monthly Security | 1x/month | 15 min | 15 min |
| Monthly Cost | 1x/month | 10 min | 10 min |
| **Total** | - | - | **~65 min/month** |

### Anthropic API Costs

- Claude Sonnet 4: ~$0.003-0.015 per request
- Weekly reports: 3 reports × $0.01 = $0.03/week
- Monthly cost: ~$0.15-0.30/month

**Optimization**:
- Disable AI insights if not needed
- Reduce report frequency if desired
- Use smaller models for summaries

---

## Security Best Practices

1. **Never commit API keys** - Always use GitHub Secrets
2. **Review permissions** - Each workflow has minimal required permissions
3. **Monitor artifacts** - Clean up old artifacts to save storage
4. **Secure Pages** - Consider making GitHub Pages private if needed
5. **Audit workflows** - Review workflow files for unauthorized changes

---

## Next Steps

1. **Enable GitHub Pages** (if not already enabled)
2. **Add ANTHROPIC_API_KEY secret** (optional)
3. **Test a workflow manually** to verify setup
4. **Review first report** when it's generated
5. **Customize schedules** if needed
6. **Share report URLs** with your team

---

## Documentation

- **Complete Guide**: `/Users/ryandahlberg/Projects/cortex/docs/GITHUB-ACTIONS-REPORTS.md`
- **Workflow Reference**: `/Users/ryandahlberg/Projects/cortex/.github/workflows/README.md`
- **Quarto Docs**: https://quarto.org/docs/
- **GitHub Actions**: https://docs.github.com/en/actions

---

## Support

For issues or questions:

1. Check workflow run logs
2. Test reports locally: `bash scripts/test-reports.sh`
3. Review documentation in `/Users/ryandahlberg/Projects/cortex/docs/GITHUB-ACTIONS-REPORTS.md`
4. Check GitHub Actions status: https://www.githubstatus.com/

---

## Summary

All GitHub Actions workflows are configured and ready to use:

- **Weekly Report**: Runs every Monday at 9 AM UTC
- **Monthly Security Audit**: Runs first of each month at 10 AM UTC
- **Monthly Cost Report**: Runs last day of month at 11 AM UTC

All reports will be automatically published to GitHub Pages and saved as artifacts.

**Next**: Enable GitHub Pages and optionally add ANTHROPIC_API_KEY for AI insights.

---

**Created**: 2025-12-01
**Status**: Ready for production use
**Version**: 1.0
