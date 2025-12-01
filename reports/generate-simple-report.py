#!/usr/bin/env python3
"""
Generate a simple HTML weekly report without Quarto.
This is a lightweight alternative for quick reports.
"""

import polars as pl
import json
from pathlib import Path
from datetime import datetime, timedelta
import pytz
from anthropic import Anthropic
import os

# Configuration
coordination_dir = Path(__file__).parent.parent / "coordination"
output_file = Path(__file__).parent / "weekly-summary-simple.html"
week_start = datetime.now(pytz.UTC) - timedelta(days=7)

# Load event data
event_files = [
    "heartbeat-events.jsonl",
    "worker-restart-events.jsonl",
    "auto-fix-events.jsonl",
    "failure-pattern-events.jsonl",
    "daemon-supervisor-events.jsonl",
    "zombie-cleanup-events.jsonl",
    "learning-events.jsonl"
]

all_events = []
event_schemas = {}

for event_file in event_files:
    event_path = coordination_dir / "events" / event_file
    if event_path.exists() and event_path.stat().st_size > 0:
        try:
            df = pl.read_ndjson(event_path)
            if len(df) > 0 and 'timestamp' in df.columns and 'event_type' in df.columns:
                common_cols = ['timestamp', 'event_type']
                if 'worker_id' in df.columns:
                    common_cols.append('worker_id')
                if 'task_id' in df.columns:
                    common_cols.append('task_id')

                existing_cols = [col for col in common_cols if col in df.columns]
                df_subset = df.select(existing_cols)
                all_events.append(df_subset)
                event_schemas[event_file] = len(df)
        except Exception as e:
            pass

# Combine events
if all_events:
    combined_events = pl.concat(all_events, how="diagonal")
    combined_events = combined_events.with_columns(
        pl.col('timestamp').str.strptime(pl.Datetime(time_zone='UTC'), '%Y-%m-%dT%H:%M:%S%z', strict=False)
    ).filter(
        pl.col('timestamp') > week_start
    )
else:
    combined_events = pl.DataFrame()

# Load routing decisions
routing_file = coordination_dir / "routing" / "routing-decisions.jsonl"
if routing_file.exists() and routing_file.stat().st_size > 0:
    try:
        task_events = pl.read_ndjson(routing_file)
        if len(task_events) > 0 and 'timestamp' in task_events.columns:
            task_events = task_events.with_columns(
                pl.col('timestamp').str.strptime(pl.Datetime(time_zone='UTC'), '%Y-%m-%dT%H:%M:%SZ', strict=False)
            ).filter(
                pl.col('timestamp') > week_start
            )
        else:
            task_events = pl.DataFrame()
    except:
        task_events = pl.DataFrame()
else:
    task_events = pl.DataFrame()

# Calculate metrics
total_tasks = len(task_events)
total_events = len(combined_events)

worker_dead_count = 0
worker_restart_count = 0
auto_fix_count = 0

if len(combined_events) > 0 and 'event_type' in combined_events.columns:
    worker_dead_count = len(combined_events.filter(pl.col('event_type') == 'worker_presumed_dead'))
    worker_restart_count = len(combined_events.filter(pl.col('event_type') == 'worker_restarted'))
    auto_fix_count = len(combined_events.filter(pl.col('event_type').str.contains('auto_fix')))

success_rate = (worker_restart_count / worker_dead_count * 100) if worker_dead_count > 0 else 100

# Get AI summary if available
ai_summary = "AI summary not available (ANTHROPIC_API_KEY not set)"
if os.getenv("ANTHROPIC_API_KEY") and total_events > 0:
    try:
        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        summary_data = {
            "total_events": total_events,
            "routing_decisions": total_tasks,
            "worker_failures": worker_dead_count,
            "auto_restarts": worker_restart_count,
            "auto_fixes": auto_fix_count,
            "recovery_rate": f"{success_rate:.1f}%"
        }

        response = client.messages.create(
            model="claude-sonnet-4",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": f"""Summarize this week's Cortex autonomous system activity in 3-5 concise bullet points.
Focus on system health, self-healing capabilities, and operational trends.

Weekly metrics:
{json.dumps(summary_data, indent=2)}

Be concise and executive-friendly."""
            }]
        )
        ai_summary = response.content[0].text
    except Exception as e:
        ai_summary = f"Error generating AI summary: {str(e)}"

# Event type distribution
event_type_html = ""
if len(combined_events) > 0:
    event_counts = combined_events.group_by('event_type').agg(
        pl.len().alias('count')
    ).sort('count', descending=True)

    for row in event_counts.iter_rows(named=True):
        event_type_html += f"<tr><td>{row['event_type']}</td><td>{row['count']:,}</td></tr>\n"

# Generate HTML
html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Cortex Weekly Summary - {datetime.now().strftime('%Y-%m-%d')}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            max-width: 1000px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }}
        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #34495e;
            margin-top: 30px;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 5px;
        }}
        .metric-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }}
        .metric-card {{
            background: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            border-radius: 4px;
        }}
        .metric-card h3 {{
            margin: 0 0 5px 0;
            font-size: 0.9em;
            color: #7f8c8d;
            text-transform: uppercase;
        }}
        .metric-card .value {{
            font-size: 2em;
            font-weight: bold;
            color: #2c3e50;
        }}
        .success {{ border-left-color: #27ae60; }}
        .warning {{ border-left-color: #f39c12; }}
        .danger {{ border-left-color: #e74c3c; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }}
        th {{
            background: #34495e;
            color: white;
            font-weight: 600;
        }}
        tr:hover {{
            background: #f8f9fa;
        }}
        .ai-summary {{
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ecf0f1;
            color: #7f8c8d;
            font-size: 0.9em;
            text-align: center;
        }}
    </style>
</head>
<body>
    <h1>Cortex Weekly Summary</h1>
    <p><strong>Report Period:</strong> {week_start.strftime('%Y-%m-%d')} to {datetime.now().strftime('%Y-%m-%d')}</p>

    <h2>Executive Summary</h2>
    <div class="ai-summary">
        {ai_summary.replace(chr(10), '<br>')}
    </div>

    <h2>Key Metrics</h2>
    <div class="metric-grid">
        <div class="metric-card">
            <h3>Total Events</h3>
            <div class="value">{total_events:,}</div>
        </div>
        <div class="metric-card">
            <h3>Routing Decisions</h3>
            <div class="value">{total_tasks:,}</div>
        </div>
        <div class="metric-card warning">
            <h3>Worker Failures</h3>
            <div class="value">{worker_dead_count:,}</div>
        </div>
        <div class="metric-card success">
            <h3>Auto Restarts</h3>
            <div class="value">{worker_restart_count:,}</div>
        </div>
        <div class="metric-card">
            <h3>Auto Fixes</h3>
            <div class="value">{auto_fix_count:,}</div>
        </div>
        <div class="metric-card {'success' if success_rate >= 80 else 'warning' if success_rate >= 50 else 'danger'}">
            <h3>Recovery Rate</h3>
            <div class="value">{success_rate:.1f}%</div>
        </div>
    </div>

    <h2>Event Type Distribution</h2>
    <table>
        <thead>
            <tr>
                <th>Event Type</th>
                <th>Count</th>
            </tr>
        </thead>
        <tbody>
            {event_type_html if event_type_html else '<tr><td colspan="2">No events in this period</td></tr>'}
        </tbody>
    </table>

    <h2>System Health</h2>
    <p>
        {'<strong style="color: #e74c3c;">Warning:</strong> System showing recovery issues. Investigate unrecovered workers.' if success_rate < 80 and worker_dead_count > 0 else '<strong style="color: #27ae60;">Healthy:</strong> Self-healing system performing well.' if worker_dead_count > 0 else '<strong style="color: #27ae60;">Excellent:</strong> No worker failures detected this week.'}
    </p>

    <div class="footer">
        <p>Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S %Z')} by Cortex Event-Driven Architecture</p>
        <p>For interactive visualizations, install Quarto and render weekly-summary.qmd</p>
    </div>
</body>
</html>
"""

# Write HTML file
output_file.write_text(html_content)
print(f"Report generated: {output_file}")
print(f"\nTo view: open {output_file}")
print(f"\nMetrics Summary:")
print(f"  Total Events: {total_events:,}")
print(f"  Worker Failures: {worker_dead_count:,}")
print(f"  Recovery Rate: {success_rate:.1f}%")
