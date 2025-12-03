"""
Cortex Security Dashboard
Real-time security scan analysis and vulnerability tracking
"""

import marimo

__generated_with = "0.9.0"
app = marimo.App(width="full")


@app.cell
def __():
    import marimo as mo
    import polars as pl
    import plotly.express as px
    import plotly.graph_objects as go
    from anthropic import Anthropic
    import os
    from pathlib import Path
    from datetime import datetime, timedelta
    return mo, pl, px, go, Anthropic, os, Path, datetime, timedelta


@app.cell
def __(mo):
    mo.md(
        """
        # 🔒 Cortex Security Dashboard

        Real-time security scan analysis with AI-powered vulnerability insights.
        """
    )
    return


@app.cell
def __(Path, pl):
    # Load security events
    coordination_dir = Path(__file__).parent.parent / "coordination"
    security_file = coordination_dir / "events" / "security-events.jsonl"

    if security_file.exists():
        security_df = pl.read_ndjson(security_file)
    else:
        # Create sample data if file doesn't exist
        security_df = pl.DataFrame({
            "timestamp": ["2025-12-01T10:00:00Z"],
            "event_type": ["security.scan_completed"],
            "payload": [{"scan_id": "sample-001", "severity": "low", "finding_count": 0}]
        })

    return security_df, coordination_dir, security_file


@app.cell
def __(security_df, pl):
    # Extract payload fields
    if len(security_df) > 0 and 'payload' in security_df.columns:
        # Flatten payload for easier analysis
        security_enriched = security_df.with_columns([
            pl.col('payload').struct.field('severity').alias('severity'),
            pl.col('payload').struct.field('finding_count').alias('finding_count'),
            pl.col('payload').struct.field('scan_id').alias('scan_id')
        ])
    else:
        security_enriched = security_df

    return security_enriched,


@app.cell
def __(security_enriched, mo):
    # Calculate key metrics
    total_scans = len(security_enriched)
    total_findings = security_enriched.select('finding_count').sum()[0, 0] if 'finding_count' in security_enriched.columns and len(security_enriched) > 0 else 0

    critical_count = len(security_enriched.filter(pl.col('severity') == 'critical')) if 'severity' in security_enriched.columns else 0
    high_count = len(security_enriched.filter(pl.col('severity') == 'high')) if 'severity' in security_enriched.columns else 0

    mo.md(f"""
    ## 📊 Security Overview

    - **Total Scans**: {total_scans:,}
    - **Total Findings**: {total_findings:,}
    - **Critical Alerts**: {critical_count} 🔴
    - **High Priority**: {high_count} 🟠
    """)
    return total_scans, total_findings, critical_count, high_count


@app.cell
def __(security_enriched, px, pl, go):
    # Severity distribution
    if 'severity' in security_enriched.columns and len(security_enriched) > 0:
        severity_counts = security_enriched.group_by('severity').agg(
            pl.len().alias('count')
        ).sort('count', descending=True)

        color_map = {
            'critical': 'red',
            'high': 'orange',
            'medium': 'yellow',
            'low': 'green'
        }

        fig_severity = px.pie(
            severity_counts.to_dict(),
            values='count',
            names='severity',
            title='Findings by Severity',
            color='severity',
            color_discrete_map=color_map
        )
    else:
        fig_severity = go.Figure()
        fig_severity.add_annotation(
            text="No security data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_severity, severity_counts, color_map


@app.cell
def __(mo, fig_severity):
    mo.ui.plotly(fig_severity)
    return


@app.cell
def __(security_enriched, px, pl, go):
    # Findings over time
    if 'timestamp' in security_enriched.columns and 'finding_count' in security_enriched.columns and len(security_enriched) > 0:
        findings_timeline = security_enriched.with_columns(
            pl.col('timestamp').str.to_datetime(format="%Y-%m-%dT%H:%M:%S%z", strict=False).alias('datetime')
        ).with_columns(
            pl.col('datetime').dt.date().alias('date')
        ).group_by('date').agg(
            pl.col('finding_count').sum().alias('total_findings'),
            pl.len().alias('scan_count')
        ).sort('date')

        fig_timeline = px.line(
            findings_timeline.to_dict(),
            x='date',
            y='total_findings',
            title='Security Findings Over Time',
            labels={'total_findings': 'Total Findings', 'date': 'Date'}
        )
    else:
        fig_timeline = go.Figure()
        fig_timeline.add_annotation(
            text="No timeline data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_timeline, findings_timeline


@app.cell
def __(mo, fig_timeline):
    mo.ui.plotly(fig_timeline)
    return


@app.cell
def __(mo):
    mo.md("## 🤖 AI Security Analysis")
    return


@app.cell
def __(security_enriched, Anthropic, os, mo):
    # AI analysis of security posture
    def analyze_security_with_ai():
        if len(security_enriched) == 0:
            return "No security data available for analysis."

        # Sample recent data for analysis
        recent_data = security_enriched.tail(30).to_dict(as_series=False)

        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

        if not os.getenv("ANTHROPIC_API_KEY"):
            return "⚠️ ANTHROPIC_API_KEY not set. Please set it to enable AI insights."

        try:
            analysis = client.messages.create(
                model="claude-sonnet-4",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": f"""Analyze these security scan results and provide:
1. Overall security posture assessment
2. Trending vulnerabilities or patterns
3. Priority areas requiring immediate attention
4. Recommendations for improving security stance

Recent security data (last 30 scans):
{recent_data}

Be concise and actionable. Format with markdown."""
                }]
            )
            return analysis.content[0].text
        except Exception as e:
            return f"Error generating AI insights: {str(e)}"

    security_insights_button = mo.ui.button(label="Generate Security Insights", on_click=lambda _: None)
    return analyze_security_with_ai, security_insights_button


@app.cell
def __(mo, security_insights_button):
    mo.md(f"{security_insights_button}")
    return


@app.cell
def __(mo, security_insights_button, analyze_security_with_ai):
    if security_insights_button.value:
        sec_insights = analyze_security_with_ai()
        mo.md(sec_insights)
    else:
        mo.md("*Click 'Generate Security Insights' to analyze security posture*")
    return


@app.cell
def __(mo, security_enriched, pl):
    # Critical findings table
    if 'severity' in security_enriched.columns and len(security_enriched) > 0:
        critical_findings = security_enriched.filter(
            pl.col('severity').is_in(['critical', 'high'])
        ).select(['timestamp', 'severity', 'scan_id', 'finding_count']).tail(10)

        if len(critical_findings) > 0:
            mo.md("## ⚠️ Recent Critical/High Severity Findings")
            mo.ui.table(critical_findings.to_pandas())
        else:
            mo.md("## ✅ No recent critical or high severity findings")
    return


if __name__ == "__main__":
    app.run()
