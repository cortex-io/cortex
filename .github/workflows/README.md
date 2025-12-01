# GitHub Actions Workflows

This directory contains automated workflows for Cortex.

## Quick Reference

| Workflow | Schedule | Purpose | Duration |
|----------|----------|---------|----------|
| `weekly-report.yml` | Mon 9AM UTC | Weekly performance reports | ~5-10 min |
| `monthly-security-audit.yml` | 1st of month 10AM | Security assessment | ~10-15 min |
| `monthly-cost-report.yml` | Last day 11AM | Cost analysis | ~5-10 min |
| `security-scan.yml` | On push/PR | Security scanning | ~3-5 min |
| `security.yml` | On schedule | Routine security checks | ~2-3 min |

## Manual Triggers

All report workflows support manual triggering:

```bash
# Via GitHub CLI
gh workflow run weekly-report.yml
gh workflow run monthly-security-audit.yml
gh workflow run monthly-cost-report.yml

# Via GitHub UI
Actions > [Workflow Name] > Run workflow
```

## Setup Requirements

### 1. GitHub Pages

Enable GitHub Pages for report hosting:
- Settings > Pages
- Source: Deploy from a branch
- Branch: `gh-pages` / root

### 2. Secrets

Configure in Settings > Secrets and variables > Actions:

- `ANTHROPIC_API_KEY` (optional): For AI-powered insights

### 3. Permissions

Workflows already configured with required permissions:
- `contents: write` - Commit reports
- `pages: write` - Deploy to Pages
- `id-token: write` - GitHub Pages auth
- `security-events: read` - Security scanning

## Testing Locally

```bash
# Install dependencies
cd reports
pip install polars anthropic plotly pandas

# Test reports
bash scripts/test-reports.sh

# Or manually
cd reports
quarto render weekly-summary.qmd
```

## Report URLs

After setup, reports available at:
```
https://<username>.github.io/<repo>/reports/
```

## Documentation

See `/Users/ryandahlberg/Projects/cortex/docs/GITHUB-ACTIONS-REPORTS.md` for complete documentation.

## Troubleshooting

Common issues:

1. **Reports not deploying**: Check GitHub Pages settings
2. **AI insights failing**: Verify ANTHROPIC_API_KEY secret
3. **Permission errors**: Review workflow permissions
4. **Missing deps**: Check pip install step

View workflow logs:
```bash
gh run list
gh run view <run-id> --log
```

## Workflow Dependencies

```
weekly-report.yml
├── Python 3.11
├── Quarto
├── polars, anthropic, plotly, pandas
└── ANTHROPIC_API_KEY (optional)

monthly-security-audit.yml
├── Python 3.11
├── Quarto
├── polars, anthropic, plotly, pandas
├── security-events read permission
└── ANTHROPIC_API_KEY (optional)

monthly-cost-report.yml
├── Python 3.11
├── Quarto
├── polars, anthropic, plotly, pandas
└── ANTHROPIC_API_KEY (optional)
```

## Maintenance

- Review and update Python dependencies quarterly
- Monitor workflow execution times
- Adjust schedules based on needs
- Archive old reports as needed

---

**Last Updated**: 2025-12-01
