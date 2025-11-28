#!/usr/bin/env python3
"""
Metrics calculation and analysis for Cortex evaluation results.

Aggregates evaluation results and computes quality metrics.
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict
import statistics


class MetricsCalculator:
    """Calculate and analyze evaluation metrics."""

    def __init__(self, results_file: str):
        """Initialize with path to evaluation results JSONL file."""
        self.results_file = Path(results_file)
        self.evaluations = self._load_evaluations()

    def _load_evaluations(self) -> List[Dict[str, Any]]:
        """Load evaluation results from JSONL file."""
        if not self.results_file.exists():
            return []

        evaluations = []
        with open(self.results_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    evaluations.append(json.loads(line))

        return evaluations

    def calculate_overall_metrics(self) -> Dict[str, Any]:
        """Calculate overall system metrics."""
        if not self.evaluations:
            return {"error": "No evaluations found"}

        # Filter out error evaluations
        valid_evals = [e for e in self.evaluations if "error" not in e]

        if not valid_evals:
            return {"error": "No valid evaluations found"}

        # Overall scores
        overall_scores = [e["overall_score"] for e in valid_evals]

        # Dimension scores
        dimension_scores = defaultdict(list)
        for eval in valid_evals:
            for dim, data in eval.get("dimensions", {}).items():
                dimension_scores[dim].append(data.get("score", 0))

        # Success rate (score >= 3.0 considered passing)
        passing_threshold = 3.0
        passed = sum(1 for s in overall_scores if s >= passing_threshold)
        success_rate = (passed / len(overall_scores)) * 100

        metrics = {
            "total_evaluations": len(valid_evals),
            "overall_metrics": {
                "average_score": round(statistics.mean(overall_scores), 2),
                "median_score": round(statistics.median(overall_scores), 2),
                "min_score": round(min(overall_scores), 2),
                "max_score": round(max(overall_scores), 2),
                "std_dev": round(statistics.stdev(overall_scores), 2) if len(overall_scores) > 1 else 0
            },
            "success_rate": {
                "percentage": round(success_rate, 1),
                "passed": passed,
                "failed": len(overall_scores) - passed,
                "threshold": passing_threshold
            },
            "dimension_averages": {
                dim: round(statistics.mean(scores), 2)
                for dim, scores in dimension_scores.items()
            }
        }

        return metrics

    def calculate_master_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Calculate metrics broken down by master type."""
        master_evals = defaultdict(list)

        for eval in self.evaluations:
            if "error" in eval:
                continue
            task_id = eval.get("metadata", {}).get("task_id", "")
            # Extract master from task_id (e.g., "security-001" -> "security")
            if "-" in task_id:
                master = task_id.split("-")[0]
                master_evals[master].append(eval)

        master_metrics = {}
        for master, evals in master_evals.items():
            if not evals:
                continue

            scores = [e["overall_score"] for e in evals]
            passed = sum(1 for s in scores if s >= 3.0)

            master_metrics[master] = {
                "count": len(evals),
                "average_score": round(statistics.mean(scores), 2),
                "success_rate": round((passed / len(scores)) * 100, 1),
                "passed": passed,
                "failed": len(scores) - passed
            }

        return master_metrics

    def identify_weaknesses(self, threshold: float = 3.0) -> List[Dict[str, Any]]:
        """Identify tasks and dimensions with low scores."""
        weaknesses = []

        for eval in self.evaluations:
            if "error" in eval:
                continue

            task_id = eval.get("metadata", {}).get("task_id", "unknown")
            overall = eval.get("overall_score", 0)

            # Check overall score
            if overall < threshold:
                weaknesses.append({
                    "type": "overall",
                    "task_id": task_id,
                    "score": overall,
                    "assessment": eval.get("overall_assessment", "")
                })

            # Check dimension scores
            for dim, data in eval.get("dimensions", {}).items():
                score = data.get("score", 0)
                if score < threshold:
                    weaknesses.append({
                        "type": "dimension",
                        "task_id": task_id,
                        "dimension": dim,
                        "score": score,
                        "reasoning": data.get("reasoning", "")
                    })

        return sorted(weaknesses, key=lambda x: x["score"])

    def calculate_trends(self, last_n: int = 5) -> Optional[Dict[str, Any]]:
        """Calculate trends over the last N evaluation runs."""
        if len(self.evaluations) < 2:
            return None

        # Group evaluations by timestamp (assuming batch evaluations)
        runs = defaultdict(list)
        for eval in self.evaluations:
            if "error" in eval:
                continue
            timestamp = eval.get("metadata", {}).get("evaluated_at", "")
            # Group by date (ignore time)
            date = timestamp.split("T")[0] if timestamp else "unknown"
            runs[date].append(eval)

        # Get last N runs
        sorted_dates = sorted(runs.keys())[-last_n:]

        if len(sorted_dates) < 2:
            return None

        trends = []
        for date in sorted_dates:
            evals = runs[date]
            scores = [e["overall_score"] for e in evals]
            trends.append({
                "date": date,
                "average_score": round(statistics.mean(scores), 2),
                "count": len(scores)
            })

        # Calculate trend direction
        recent_avg = statistics.mean([t["average_score"] for t in trends[-2:]])
        older_avg = statistics.mean([t["average_score"] for t in trends[:-2]]) if len(trends) > 2 else trends[0]["average_score"]

        trend_direction = "improving" if recent_avg > older_avg else "declining" if recent_avg < older_avg else "stable"

        return {
            "runs": trends,
            "trend_direction": trend_direction,
            "recent_average": round(recent_avg, 2),
            "change": round(recent_avg - older_avg, 2)
        }

    def generate_report(self) -> str:
        """Generate a comprehensive metrics report."""
        report = []
        report.append("=" * 70)
        report.append("CORTEX EVALUATION METRICS REPORT")
        report.append("=" * 70)
        report.append("")

        # Overall metrics
        overall = self.calculate_overall_metrics()
        if "error" in overall:
            report.append(f"Error: {overall['error']}")
            return "\n".join(report)

        report.append("## Overall Performance")
        report.append(f"Total evaluations: {overall['total_evaluations']}")
        report.append(f"Average score: {overall['overall_metrics']['average_score']}/5.0")
        report.append(f"Success rate: {overall['success_rate']['percentage']}% " +
                     f"({overall['success_rate']['passed']} passed, {overall['success_rate']['failed']} failed)")
        report.append("")

        # Dimension breakdown
        report.append("## Dimension Averages")
        for dim, score in overall['dimension_averages'].items():
            report.append(f"  {dim.title():20s}: {score}/5.0")
        report.append("")

        # Master-specific metrics
        master_metrics = self.calculate_master_metrics()
        if master_metrics:
            report.append("## Performance by Master")
            for master, metrics in sorted(master_metrics.items()):
                report.append(f"  {master.title()}:")
                report.append(f"    Evaluations: {metrics['count']}")
                report.append(f"    Average: {metrics['average_score']}/5.0")
                report.append(f"    Success rate: {metrics['success_rate']}%")
            report.append("")

        # Weaknesses
        weaknesses = self.identify_weaknesses()
        if weaknesses:
            report.append(f"## Areas for Improvement (score < 3.0)")
            report.append(f"Found {len(weaknesses)} weakness(es):")
            for w in weaknesses[:10]:  # Show top 10
                if w["type"] == "overall":
                    report.append(f"  - {w['task_id']}: Overall score {w['score']}/5.0")
                else:
                    report.append(f"  - {w['task_id']}: {w['dimension']} = {w['score']}/5.0")
            report.append("")

        # Trends
        trends = self.calculate_trends()
        if trends:
            report.append("## Trends (Last 5 Runs)")
            report.append(f"Direction: {trends['trend_direction'].upper()}")
            report.append(f"Recent average: {trends['recent_average']}/5.0")
            report.append(f"Change: {trends['change']:+.2f}")
            report.append("")

        report.append("=" * 70)
        return "\n".join(report)


def main():
    """CLI interface for metrics calculation."""
    import argparse

    parser = argparse.ArgumentParser(description="Calculate evaluation metrics")
    parser.add_argument("--results", default="evaluation/results/evaluation-runs.jsonl",
                       help="Path to evaluation results JSONL file")
    parser.add_argument("--format", choices=["text", "json"], default="text",
                       help="Output format")

    args = parser.parse_args()

    calculator = MetricsCalculator(args.results)

    if args.format == "json":
        # Output structured JSON
        output = {
            "overall": calculator.calculate_overall_metrics(),
            "by_master": calculator.calculate_master_metrics(),
            "weaknesses": calculator.identify_weaknesses(),
            "trends": calculator.calculate_trends()
        }
        print(json.dumps(output, indent=2))
    else:
        # Output text report
        print(calculator.generate_report())


if __name__ == "__main__":
    main()
