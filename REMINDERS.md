# Cortex Maintenance Reminders

## Weekly Tasks

### ML Validation (Every Monday)
Run the ML validation framework to track ML feature performance:

```bash
cd /Users/ryandahlberg/Projects/cortex
./llm-mesh/validation/ml-validator.sh
```

**What it does:**
- A/B tests keyword vs semantic routing
- Measures routing accuracy
- Generates reports in `llm-mesh/validation/reports/`

**Review the results:**
```bash
# View latest summary
cat llm-mesh/validation/reports/ab-test-summary-$(date +%Y%m%d).json | jq

# Or via API
curl http://localhost:3000/api/ml-validation
```

**Action items based on results:**
- If semantic routing accuracy < keyword: Consider disabling semantic routing
- If semantic routing accuracy > keyword by 5%+: Keep it enabled
- If no significant difference: Consider disabling to reduce complexity

---

## Monthly Tasks

### Review Governance Metrics
Check governance compliance and system health:
```bash
curl http://localhost:3000/api/governance/metrics
```

### Token Budget Review
Check if token budgets need adjustment:
```bash
cat coordination/token-budget.json | jq
```

---

## As-Needed Tasks

### After Major Changes
Run ML validation after any changes to:
- Routing logic
- Keyword patterns
- Semantic routing configuration
- PyTorch model updates

### Before Disabling ML Features
Validate with at least 2 weeks of data before making decisions.

---

## Optional: Automate with Cron

To run ML validation automatically every Monday at 9 AM:

```bash
# Edit your crontab
crontab -e

# Add this line:
0 9 * * 1 /Users/ryandahlberg/Projects/cortex/scripts/weekly-ml-validation.sh

# Or run validation every Monday at 9 AM and email results:
0 9 * * 1 /Users/ryandahlberg/Projects/cortex/scripts/weekly-ml-validation.sh | mail -s "Cortex ML Validation Results" you@example.com
```

Check logs in: `/Users/ryandahlberg/Projects/cortex/logs/ml-validation-*.log`
