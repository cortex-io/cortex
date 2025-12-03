# Quarto Installation Instructions

## Install Quarto on macOS

Quarto is required to render the weekly summary report. Install it using Homebrew:

```bash
brew install quarto
```

This will require sudo access to complete the installation.

## Alternative: Download Direct Installer

If you prefer not to use Homebrew, download the macOS installer directly:

1. Visit: https://quarto.org/docs/get-started/
2. Download the macOS .pkg installer
3. Run the installer (requires admin access)

## Verify Installation

After installation, verify Quarto is available:

```bash
quarto --version
```

## Generate Reports

Once installed, you can render reports:

```bash
# Generate weekly summary
cd /Users/ryandahlberg/Projects/cortex/reports
quarto render weekly-summary.qmd

# Generate all reports
quarto render

# Preview in browser
quarto preview weekly-summary.qmd
```

## Python Dependencies

The reports require these Python packages (already installed):
- polars
- plotly
- anthropic
- pytz

## Report Outputs

Quarto will generate:
- HTML reports in `reports/_site/`
- Interactive charts and visualizations
- AI-generated summaries (if ANTHROPIC_API_KEY is set)
