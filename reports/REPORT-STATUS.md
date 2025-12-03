# Cortex Weekly Report Generation - Status

## Summary

First weekly report successfully generated for Cortex autonomous system.

## What Was Done

### 1. Template Updates
Updated `/Users/ryandahlberg/Projects/cortex/reports/weekly-summary.qmd` to work with actual Cortex data:

- **Data Sources**: Modified to load from actual event files:
  - `coordination/events/heartbeat-events.jsonl`
  - `coordination/events/daemon-supervisor-events.jsonl`
  - `coordination/events/zombie-cleanup-events.jsonl`
  - `coordination/events/learning-events.jsonl`
  - `coordination/routing/routing-decisions.jsonl`

- **Schema Alignment**: Fixed to handle different event file schemas by:
  - Extracting only common columns (timestamp, event_type, worker_id, task_id)
  - Using `pl.concat(how="diagonal")` for safe merging
  - Skipping empty or malformed files

- **Timezone Handling**: Updated timestamp parsing to handle timezone-aware datetimes:
  - Changed from `str.to_datetime()` to `str.strptime()` with explicit format
  - Made `week_start` timezone-aware using `pytz.UTC`

- **API Updates**: Replaced deprecated `pl.count()` with `pl.len()` throughout

- **Metrics Realignment**: Changed from generic task metrics to Cortex-specific metrics:
  - Total events processed
  - Worker failures detected
  - Auto-restart count
  - Auto-fix events
  - Recovery rate (worker restart success rate)

### 2. Alternative Report Generator
Created `/Users/ryandahlberg/Projects/cortex/reports/generate-simple-report.py`:

- Lightweight Python script that generates HTML reports without Quarto
- Uses same data sources as Quarto template
- Produces clean, styled HTML with:
  - Metric cards with color-coded status
  - Event type distribution table
  - AI-generated executive summary (if ANTHROPIC_API_KEY set)
  - System health assessment

### 3. Documentation
Created `/Users/ryandahlberg/Projects/cortex/reports/QUARTO-INSTALLATION.md`:

- Installation instructions for Quarto
- Verification steps
- Report generation commands

## First Report Results

### Data Summary (Last 7 Days)
```
Total Events Processed: 12
Routing Decisions: 1
Worker Failures Detected: 4
Automatic Restarts: 0
Auto-Fix Events: 0
Recovery Rate: 0.0%
```

### Event Type Distribution
```
worker_presumed_dead: 4
zombie_process_terminated: 4
zombie_cleanup_completed: 4
```

### Files Generated
1. **Simple HTML Report**: `/Users/ryandahlberg/Projects/cortex/reports/weekly-summary-simple.html`
   - Can be opened directly in browser
   - No Quarto required

2. **Quarto Template**: `/Users/ryandahlberg/Projects/cortex/reports/weekly-summary.qmd`
   - Ready for rendering once Quarto is installed
   - Includes interactive visualizations with Plotly

## How to Use

### Option 1: Simple HTML Report (No Installation Required)
```bash
cd /Users/ryandahlberg/Projects/cortex/reports
python3 generate-simple-report.py
open weekly-summary-simple.html
```

### Option 2: Full Quarto Report (Requires Installation)
```bash
# Install Quarto first
brew install quarto

# Generate report
cd /Users/ryandahlberg/Projects/cortex/reports
quarto render weekly-summary.qmd

# View in browser
open _site/weekly-summary.html
```

## Quarto Installation Blocker

Quarto installation via Homebrew requires sudo access (password prompt). The installation was attempted but requires user interaction:

```bash
brew install quarto
# Requires password for sudo
```

## Recommendations

1. **Install Quarto**: For interactive charts and full-featured reports
   ```bash
   brew install quarto
   ```

2. **Set ANTHROPIC_API_KEY**: Enable AI-generated summaries
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```

3. **Automate Report Generation**: Add to weekly workflow
   ```bash
   # Simple version (cron job)
   0 9 * * 1 cd /Users/ryandahlberg/Projects/cortex/reports && python3 generate-simple-report.py

   # Full Quarto version
   0 9 * * 1 cd /Users/ryandahlberg/Projects/cortex/reports && quarto render weekly-summary.qmd
   ```

4. **GitHub Actions Integration**: Set up weekly report generation
   - See `.github/workflows/weekly-report.yml` (already created)

## Technical Details

### Template Fixes Applied

1. **Event Loading**:
   - Before: Looked for non-existent `task-events.jsonl` and `worker-events.jsonl`
   - After: Loads all actual event files with schema alignment

2. **Timestamp Parsing**:
   - Before: `pl.col('timestamp').str.to_datetime()` (failed on timezone data)
   - After: `pl.col('timestamp').str.strptime(pl.Datetime(time_zone='UTC'), '%Y-%m-%dT%H:%M:%S%z')`

3. **Polars API**:
   - Before: Used deprecated `pl.count()`
   - After: Uses `pl.len()`

4. **Metrics Focus**:
   - Before: Generic "tasks completed/failed"
   - After: Cortex-specific "worker failures/recoveries"

### Python Dependencies (All Installed)
- polars: DataFrame operations
- plotly: Interactive charts
- anthropic: AI summaries
- pytz: Timezone handling

## Next Steps

1. Install Quarto to unlock full report features
2. Set ANTHROPIC_API_KEY for AI-generated insights
3. Review first report and adjust metrics if needed
4. Set up automated weekly generation
5. Consider adding more visualizations:
   - Worker failure trends over time
   - Recovery rate trends
   - Event volume patterns

## Files Modified
- `/Users/ryandahlberg/Projects/cortex/reports/weekly-summary.qmd`

## Files Created
- `/Users/ryandahlberg/Projects/cortex/reports/generate-simple-report.py`
- `/Users/ryandahlberg/Projects/cortex/reports/QUARTO-INSTALLATION.md`
- `/Users/ryandahlberg/Projects/cortex/reports/REPORT-STATUS.md`
- `/Users/ryandahlberg/Projects/cortex/reports/weekly-summary-simple.html`

## Success Criteria Met

- Template updated to work with actual data sources
- Schema mismatches resolved
- Timezone parsing fixed
- First report successfully generated
- Alternative non-Quarto option provided
- Documentation complete
