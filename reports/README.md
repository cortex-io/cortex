# Cortex Reports

Automated reporting system for the Cortex autonomous agent framework.

## Available Reports

### 1. Weekly Summary
**Purpose**: System performance, health, and self-healing metrics

**Files**:
- `weekly-summary.qmd` - Quarto template with interactive visualizations
- `generate-simple-report.py` - Lightweight HTML generator (no Quarto required)

**Metrics**:
- Total events processed
- Worker failures and auto-restarts
- Auto-fix events
- Recovery rate
- Event type distribution
- Worker health trends

### 2. Security Audit
**Purpose**: Security scanning and vulnerability tracking

**File**: `security-audit.qmd`

### 3. Cost Report
**Purpose**: Token usage and operational cost tracking

**File**: `cost-report.qmd`

## Quick Start

### Option 1: Simple HTML Report (Fastest)
No installation required, generates basic HTML report:

```bash
cd /Users/ryandahlberg/Projects/cortex/reports
python3 generate-simple-report.py
open weekly-summary-simple.html
```

### Option 2: Full Quarto Reports (Recommended)
Requires Quarto installation, provides interactive charts:

```bash
# Install Quarto (one-time)
brew install quarto

# Generate reports
cd /Users/ryandahlberg/Projects/cortex/reports
quarto render weekly-summary.qmd

# View in browser
open _site/weekly-summary.html
```

### Option 3: Preview Mode
Live preview with auto-reload:

```bash
cd /Users/ryandahlberg/Projects/cortex/reports
quarto preview weekly-summary.qmd
```

## Data Sources

Reports pull data from:

- `coordination/events/*.jsonl` - System event logs
  - heartbeat-events.jsonl
  - worker-restart-events.jsonl
  - auto-fix-events.jsonl
  - failure-pattern-events.jsonl
  - daemon-supervisor-events.jsonl
  - zombie-cleanup-events.jsonl
  - learning-events.jsonl

- `coordination/metrics/*.json` - Aggregated metrics
  - auto-fix-daemon-metrics.json
  - failure-pattern-metrics.json
  - heartbeat-monitor-metrics.json
  - learning-monitor-metrics.json
  - worker-restart-metrics.json
  - routing-stats.json
  - security-stats.json

- `coordination/routing/routing-decisions.jsonl` - Task routing history

## Configuration

### Environment Variables

```bash
# Required for AI-generated summaries
export ANTHROPIC_API_KEY="your-key-here"
```

### Report Settings

Edit `_quarto.yml` to customize:
- Output formats (HTML, PDF)
- Themes
- Navigation
- Code folding

## Automation

### GitHub Actions
Weekly reports are automatically generated every Monday at 9 AM UTC via GitHub Actions.

**Workflow**: `.github/workflows/weekly-report.yml`

To trigger manually:
1. Go to GitHub repository
2. Actions tab
3. "Generate Weekly Report" workflow
4. Click "Run workflow"

### Cron Job (Local)
Add to crontab for local automation:

```bash
# Simple HTML report every Monday at 9 AM
0 9 * * 1 cd /Users/ryandahlberg/Projects/cortex/reports && python3 generate-simple-report.py

# Full Quarto report (requires Quarto installed)
0 9 * * 1 cd /Users/ryandahlberg/Projects/cortex/reports && quarto render
```

## Dependencies

### Python Packages
All required packages should be installed:

```bash
pip install polars anthropic plotly pandas pytz
```

### System Requirements
- **Quarto**: For full reports with interactive visualizations
  ```bash
  brew install quarto
  ```

- **Python 3.9+**: Required for Polars and other libraries

## Output Files

### Simple Report
- `weekly-summary-simple.html` - Standalone HTML file

### Quarto Reports
- `_site/` - Rendered HTML files
  - `weekly-summary.html`
  - `security-audit.html`
  - `cost-report.html`
- PDF versions (if configured)

## Troubleshooting

### Issue: "Module not found" errors
```bash
pip install polars anthropic plotly pandas pytz
```

### Issue: "Quarto not found"
```bash
brew install quarto
# or download from https://quarto.org
```

### Issue: No data in reports
Check that event files exist and contain data:
```bash
ls -lh /Users/ryandahlberg/Projects/cortex/coordination/events/*.jsonl
```

### Issue: Timezone parsing errors
Ensure pytz is installed:
```bash
pip install pytz
```

### Issue: AI summary not generated
Set ANTHROPIC_API_KEY:
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

## Development

### Adding New Visualizations
Edit the `.qmd` files to add Python code blocks with Plotly/Matplotlib charts:

```python
```{python}
import plotly.express as px

# Your visualization code here
fig = px.line(data, x='date', y='value')
fig.show()
```
```

### Custom Metrics
Add new metric calculations in the Python code blocks within `.qmd` files.

### Styling
- HTML: Edit CSS in `_quarto.yml` or individual `.qmd` files
- Simple reports: Edit CSS in `generate-simple-report.py`

## File Structure

```
reports/
├── _quarto.yml                      # Quarto configuration
├── README.md                        # This file
├── REPORT-STATUS.md                 # Implementation status
├── QUARTO-INSTALLATION.md           # Installation guide
├── weekly-summary.qmd               # Weekly report template
├── security-audit.qmd               # Security report template
├── cost-report.qmd                  # Cost report template
├── generate-simple-report.py        # Simple HTML generator
├── weekly-summary-simple.html       # Generated simple report
└── _site/                           # Quarto output directory
    ├── weekly-summary.html
    ├── security-audit.html
    └── cost-report.html
```

## Next Steps

1. **Install Quarto**: For full report features
   ```bash
   brew install quarto
   ```

2. **Set API Key**: Enable AI summaries
   ```bash
   export ANTHROPIC_API_KEY="your-key"
   ```

3. **Test Reports**: Generate and review
   ```bash
   quarto render weekly-summary.qmd
   ```

4. **Enable Automation**: Set up GitHub Actions or cron jobs

5. **Customize**: Adjust metrics and visualizations as needed

## Support

For issues or questions:
1. Check this README
2. Review REPORT-STATUS.md for implementation details
3. See QUARTO-INSTALLATION.md for setup help
4. Check Quarto docs: https://quarto.org

## Links

- Quarto Documentation: https://quarto.org/docs/
- Polars Documentation: https://docs.pola.rs/
- Plotly Documentation: https://plotly.com/python/
- Anthropic API: https://docs.anthropic.com/
