"""
Cortex Worker Performance Dashboard
Real-time worker metrics and performance analysis
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
        # ⚡ Cortex Worker Performance Dashboard

        Real-time worker metrics: token usage, latency, success rates with AI-powered optimization insights.
        """
    )
    return


@app.cell
def __(Path, pl):
    # Load worker events and metrics
    coordination_dir = Path(__file__).parent.parent / "coordination"
    worker_events_file = coordination_dir / "events" / "worker-events.jsonl"
    worker_metrics_file = coordination_dir / "metrics" / "worker-performance.jsonl"

    # Try to load from multiple sources
    worker_df = None
    if worker_metrics_file.exists():
        worker_df = pl.read_ndjson(worker_metrics_file)
    elif worker_events_file.exists():
        worker_df = pl.read_ndjson(worker_events_file)
    else:
        # Create sample data if files don't exist
        worker_df = pl.DataFrame({
            "timestamp": ["2025-12-01T10:00:00Z"],
            "worker_id": ["worker-001"],
            "task_id": ["task-001"],
            "duration_ms": [5000],
            "tokens_used": [1000],
            "status": ["completed"]
        })

    return worker_df, coordination_dir, worker_events_file, worker_metrics_file


@app.cell
def __(worker_df, mo, pl):
    # Calculate key metrics
    total_tasks = len(worker_df)
    completed_tasks = len(worker_df.filter(pl.col('status') == 'completed')) if 'status' in worker_df.columns else 0
    success_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

    avg_duration = worker_df.select('duration_ms').mean()[0, 0] if 'duration_ms' in worker_df.columns and len(worker_df) > 0 else 0
    total_tokens = worker_df.select('tokens_used').sum()[0, 0] if 'tokens_used' in worker_df.columns and len(worker_df) > 0 else 0

    mo.md(f"""
    ## 📊 Performance Overview

    - **Total Tasks**: {total_tasks:,}
    - **Success Rate**: {success_rate:.1f}%
    - **Avg Duration**: {avg_duration:.0f}ms
    - **Total Tokens Used**: {total_tokens:,}
    """)
    return total_tasks, completed_tasks, success_rate, avg_duration, total_tokens


@app.cell
def __(worker_df, px, pl, go):
    # Worker performance comparison
    if 'worker_id' in worker_df.columns and 'duration_ms' in worker_df.columns and len(worker_df) > 0:
        worker_stats = worker_df.group_by('worker_id').agg([
            pl.len().alias('task_count'),
            pl.col('duration_ms').mean().alias('avg_duration'),
            pl.col('tokens_used').sum().alias('total_tokens')
        ]).sort('task_count', descending=True).head(10)

        fig_worker_perf = px.bar(
            worker_stats.to_dict(),
            x='worker_id',
            y='avg_duration',
            title='Top 10 Workers by Average Duration',
            labels={'avg_duration': 'Avg Duration (ms)', 'worker_id': 'Worker ID'},
            hover_data=['task_count', 'total_tokens']
        )
        fig_worker_perf.update_layout(xaxis_tickangle=-45)
    else:
        fig_worker_perf = go.Figure()
        fig_worker_perf.add_annotation(
            text="No worker performance data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_worker_perf, worker_stats


@app.cell
def __(mo, fig_worker_perf):
    mo.ui.plotly(fig_worker_perf)
    return


@app.cell
def __(worker_df, px, pl, go):
    # Token usage over time
    if 'timestamp' in worker_df.columns and 'tokens_used' in worker_df.columns and len(worker_df) > 0:
        token_timeline = worker_df.with_columns(
            pl.col('timestamp').str.to_datetime(format="%Y-%m-%dT%H:%M:%S%z", strict=False).alias('datetime')
        ).with_columns(
            pl.col('datetime').dt.date().alias('date')
        ).group_by('date').agg(
            pl.col('tokens_used').sum().alias('total_tokens'),
            pl.len().alias('task_count')
        ).sort('date')

        fig_tokens = px.line(
            token_timeline.to_dict(),
            x='date',
            y='total_tokens',
            title='Token Usage Over Time',
            labels={'total_tokens': 'Total Tokens', 'date': 'Date'}
        )
    else:
        fig_tokens = go.Figure()
        fig_tokens.add_annotation(
            text="No token usage data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_tokens, token_timeline


@app.cell
def __(mo, fig_tokens):
    mo.ui.plotly(fig_tokens)
    return


@app.cell
def __(worker_df, px, pl, go):
    # Duration distribution
    if 'duration_ms' in worker_df.columns and len(worker_df) > 0:
        fig_duration_dist = px.histogram(
            worker_df.to_dict(),
            x='duration_ms',
            nbins=50,
            title='Task Duration Distribution',
            labels={'duration_ms': 'Duration (ms)'}
        )
    else:
        fig_duration_dist = go.Figure()
        fig_duration_dist.add_annotation(
            text="No duration data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_duration_dist,


@app.cell
def __(mo, fig_duration_dist):
    mo.ui.plotly(fig_duration_dist)
    return


@app.cell
def __(mo):
    mo.md("## 🤖 AI Performance Insights")
    return


@app.cell
def __(worker_df, Anthropic, os, mo):
    # AI analysis of worker performance
    def analyze_performance_with_ai():
        if len(worker_df) == 0:
            return "No worker performance data available for analysis."

        # Sample recent data for analysis
        recent_data = worker_df.tail(50).to_dict(as_series=False)

        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

        if not os.getenv("ANTHROPIC_API_KEY"):
            return "⚠️ ANTHROPIC_API_KEY not set. Please set it to enable AI insights."

        try:
            analysis = client.messages.create(
                model="claude-sonnet-4",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": f"""Analyze these worker performance metrics and provide:
1. Performance bottlenecks and slowest workers
2. Token usage optimization opportunities
3. Success rate trends and concerning patterns
4. Specific recommendations for improving efficiency

Recent performance data (last 50 tasks):
{recent_data}

Be concise and actionable. Format with markdown."""
                }]
            )
            return analysis.content[0].text
        except Exception as e:
            return f"Error generating AI insights: {str(e)}"

    perf_insights_button = mo.ui.button(label="Generate Performance Insights", on_click=lambda _: None)
    return analyze_performance_with_ai, perf_insights_button


@app.cell
def __(mo, perf_insights_button):
    mo.md(f"{perf_insights_button}")
    return


@app.cell
def __(mo, perf_insights_button, analyze_performance_with_ai):
    if perf_insights_button.value:
        perf_insights = analyze_performance_with_ai()
        mo.md(perf_insights)
    else:
        mo.md("*Click 'Generate Performance Insights' to analyze worker efficiency*")
    return


@app.cell
def __(mo):
    mo.md("""
    ## 💡 Optimization Tips

    - Monitor workers with consistently high latency
    - Identify token usage spikes for cost optimization
    - Review failed tasks for common error patterns
    - Consider scaling workers with high success rates
    """)
    return


if __name__ == "__main__":
    app.run()
