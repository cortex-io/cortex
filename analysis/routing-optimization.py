"""
Cortex Routing Optimization Analysis
AI-powered analysis of MoE routing decisions
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
        # 🎯 Cortex Routing Optimization Dashboard

        Real-time analysis of MoE (Mixture of Experts) routing decisions with AI-powered insights.
        """
    )
    return


@app.cell
def __(Path, pl):
    # Load routing decisions
    coordination_dir = Path(__file__).parent.parent / "coordination"
    routing_file = coordination_dir / "routing" / "routing-decisions.jsonl"

    if routing_file.exists():
        routing_df = pl.read_ndjson(routing_file)
    else:
        # Create sample data if file doesn't exist
        routing_df = pl.DataFrame({
            "timestamp": ["2025-12-01T10:00:00Z"],
            "task_id": ["sample-001"],
            "master": ["coordinator-master"],
            "confidence": [0.85],
            "routing_reason": ["High confidence match"]
        })

    return routing_df, coordination_dir, routing_file


@app.cell
def __(routing_df, mo):
    mo.md(f"""
    ## 📊 Overview

    - **Total Routing Decisions**: {len(routing_df):,}
    - **Unique Masters**: {routing_df.select('master').n_unique() if 'master' in routing_df.columns else 0}
    - **Date Range**: {routing_df.select('timestamp').min()[0, 0] if len(routing_df) > 0 and 'timestamp' in routing_df.columns else 'N/A'} to {routing_df.select('timestamp').max()[0, 0] if len(routing_df) > 0 and 'timestamp' in routing_df.columns else 'N/A'}
    """)
    return


@app.cell
def __(routing_df, px):
    # Routing distribution by master
    if 'master' in routing_df.columns and len(routing_df) > 0:
        master_counts = routing_df.group_by('master').agg(
            pl.count().alias('count')
        ).sort('count', descending=True)

        fig_distribution = px.bar(
            master_counts.to_pandas(),
            x='master',
            y='count',
            title='Routing Distribution by Master',
            labels={'count': 'Number of Tasks', 'master': 'Master'}
        )
        fig_distribution.update_layout(xaxis_tickangle=-45)
    else:
        fig_distribution = go.Figure()
        fig_distribution.add_annotation(
            text="No routing data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_distribution, master_counts


@app.cell
def __(mo, fig_distribution):
    mo.ui.plotly(fig_distribution)
    return


@app.cell
def __(routing_df, px, pl):
    # Confidence trends over time
    if 'timestamp' in routing_df.columns and 'confidence' in routing_df.columns and len(routing_df) > 0:
        # Parse timestamps and add date column
        confidence_trends = routing_df.with_columns(
            pl.col('timestamp').str.to_datetime().alias('datetime')
        ).with_columns(
            pl.col('datetime').dt.date().alias('date')
        ).group_by(['date', 'master']).agg(
            pl.col('confidence').mean().alias('avg_confidence'),
            pl.count().alias('count')
        ).sort('date')

        fig_confidence = px.line(
            confidence_trends.to_pandas(),
            x='date',
            y='avg_confidence',
            color='master',
            title='Routing Confidence Trends Over Time',
            labels={'avg_confidence': 'Average Confidence', 'date': 'Date'}
        )
        fig_confidence.update_yaxes(range=[0, 1])
    else:
        fig_confidence = go.Figure()
        fig_confidence.add_annotation(
            text="No confidence data available",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False
        )

    return fig_confidence, confidence_trends


@app.cell
def __(mo, fig_confidence):
    mo.ui.plotly(fig_confidence)
    return


@app.cell
def __(mo):
    mo.md("## 🤖 AI-Powered Insights")
    return


@app.cell
def __(routing_df, Anthropic, os, mo):
    # AI analysis of routing patterns
    def analyze_routing_with_ai():
        if len(routing_df) == 0:
            return "No routing data available for analysis."

        # Sample recent data for analysis
        recent_data = routing_df.tail(50).to_dict(as_series=False)

        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

        if not os.getenv("ANTHROPIC_API_KEY"):
            return "⚠️ ANTHROPIC_API_KEY not set. Please set it to enable AI insights."

        try:
            analysis = client.messages.create(
                model="claude-sonnet-4",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": f"""Analyze these MoE routing decisions and provide:
1. Key patterns indicating suboptimal routing
2. Masters with improving/declining confidence
3. Specific recommendations for threshold tuning
4. Any anomalies or concerns

Recent routing data (last 50 decisions):
{recent_data}

Be concise and actionable. Format with markdown."""
                }]
            )
            return analysis.content[0].text
        except Exception as e:
            return f"Error generating AI insights: {str(e)}"

    insights_button = mo.ui.button(label="Generate AI Insights", on_click=lambda _: None)
    return analyze_routing_with_ai, insights_button


@app.cell
def __(mo, insights_button):
    mo.md(f"{insights_button}")
    return


@app.cell
def __(mo, insights_button, analyze_routing_with_ai):
    if insights_button.value:
        insights = analyze_routing_with_ai()
        mo.md(insights)
    else:
        mo.md("*Click 'Generate AI Insights' to analyze routing patterns*")
    return


@app.cell
def __(mo):
    mo.md("""
    ## 💡 Recommendations

    Based on the data above:
    - Monitor masters with declining confidence trends
    - Consider adjusting routing thresholds for underutilized masters
    - Review high-confidence masters for potential over-routing
    - Check for correlation between task types and routing decisions
    """)
    return


@app.cell
def __(mo, routing_df):
    # Export functionality
    export_button = mo.ui.button(label="Export Data as CSV")

    if export_button.value:
        csv_data = routing_df.write_csv()
        mo.download(csv_data, filename="routing-decisions.csv")

    mo.md(f"{export_button}")
    return export_button,


if __name__ == "__main__":
    app.run()
