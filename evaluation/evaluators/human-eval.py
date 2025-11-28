#!/usr/bin/env python3
"""
Human Evaluation Tool for Cortex

Interactive CLI tool for human annotation of Cortex task outcomes.
Used for calibrating LM-as-Judge and finding edge cases.
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class HumanEvaluator:
    """Interactive human evaluation tool."""

    def __init__(self, annotations_file: str = "evaluation/results/human-annotations.jsonl"):
        """Initialize human evaluator."""
        self.annotations_file = Path(annotations_file)
        self.annotations_file.parent.mkdir(parents=True, exist_ok=True)

    def evaluate(
        self,
        task: Dict[str, Any],
        outcome: Dict[str, Any],
        lm_evaluation: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Collect human evaluation for a task outcome.

        Args:
            task: Task definition
            outcome: Actual outcome
            lm_evaluation: LM-as-Judge evaluation (optional, for comparison)

        Returns:
            Human evaluation with scores and feedback
        """
        print("\n" + "=" * 70)
        print("HUMAN EVALUATION")
        print("=" * 70)
        print()

        # Display task
        print("TASK:")
        print(f"  ID: {task.get('task_id', 'unknown')}")
        print(f"  Master: {task.get('master', 'unknown')}")
        print(f"  Description: {task.get('description', 'N/A')}")
        print()

        # Display expected outcome
        if "expected_outcome" in task:
            print("EXPECTED OUTCOME:")
            for key, value in task["expected_outcome"].items():
                print(f"  {key}: {value}")
            print()

        # Display actual outcome
        print("ACTUAL OUTCOME:")
        print(json.dumps(outcome, indent=2))
        print()

        # Display LM evaluation if available
        if lm_evaluation and "error" not in lm_evaluation:
            print("LM-AS-JUDGE EVALUATION:")
            print(f"  Overall score: {lm_evaluation.get('overall_score', 'N/A')}/5.0")
            print(f"  Assessment: {lm_evaluation.get('overall_assessment', 'N/A')}")
            print()

        # Collect human ratings
        print("=" * 70)
        print("HUMAN EVALUATION")
        print("=" * 70)
        print()

        annotation = {
            "task_id": task.get("task_id"),
            "evaluated_at": datetime.utcnow().isoformat() + "Z",
            "evaluator": self._get_evaluator_name()
        }

        # Overall assessment
        print("Overall Assessment:")
        print("  How well did Cortex complete this task?")
        print("  1 = Failed, 2 = Poor, 3 = Acceptable, 4 = Good, 5 = Excellent")
        overall_score = self._get_score_input("Overall score (1-5)")
        annotation["overall_score"] = overall_score

        # Correctness
        print("\nCorrectness:")
        print("  Did it solve the task correctly?")
        correctness = self._get_score_input("Correctness (1-5)")
        annotation["correctness"] = correctness

        # Completeness
        print("\nCompleteness:")
        print("  Were all requirements addressed?")
        completeness = self._get_score_input("Completeness (1-5)")
        annotation["completeness"] = completeness

        # Efficiency
        print("\nEfficiency:")
        print("  Was the approach efficient?")
        efficiency = self._get_score_input("Efficiency (1-5)")
        annotation["efficiency"] = efficiency

        # Free-form feedback
        print("\nFeedback:")
        print("  What went well? What could be improved?")
        feedback = input("  > ").strip()
        annotation["feedback"] = feedback

        # Agreement with LM judge
        if lm_evaluation and "error" not in lm_evaluation:
            lm_score = lm_evaluation.get("overall_score", 0)
            diff = abs(overall_score - lm_score)
            annotation["lm_agreement"] = {
                "lm_score": lm_score,
                "human_score": overall_score,
                "difference": round(diff, 2),
                "agree": diff <= 1.0  # Within 1 point
            }

        # Additional notes
        print("\nAdditional notes (optional):")
        notes = input("  > ").strip()
        if notes:
            annotation["notes"] = notes

        print()
        print("Thank you! Annotation saved.")

        return annotation

    def _get_evaluator_name(self) -> str:
        """Get evaluator name (cached after first input)."""
        cache_file = self.annotations_file.parent / ".evaluator_name"

        if cache_file.exists():
            with open(cache_file, 'r') as f:
                return f.read().strip()

        print("First time setup:")
        name = input("Your name (for attribution): ").strip()

        with open(cache_file, 'w') as f:
            f.write(name)

        return name

    def _get_score_input(self, prompt: str) -> int:
        """Get score input with validation."""
        while True:
            try:
                value = input(f"  {prompt}: ").strip()
                score = int(value)
                if 1 <= score <= 5:
                    return score
                print("  Error: Score must be between 1 and 5")
            except ValueError:
                print("  Error: Please enter a number between 1 and 5")
            except KeyboardInterrupt:
                print("\nEvaluation cancelled")
                sys.exit(1)

    def save_annotation(self, annotation: Dict[str, Any]):
        """Save annotation to JSONL file."""
        with open(self.annotations_file, 'a') as f:
            f.write(json.dumps(annotation) + "\n")

    def evaluate_batch(
        self,
        tasks: list,
        outcomes: list,
        lm_evaluations: Optional[list] = None
    ):
        """Evaluate multiple tasks interactively."""
        lm_evals = lm_evaluations or [None] * len(tasks)

        for i, (task, outcome, lm_eval) in enumerate(zip(tasks, outcomes, lm_evals)):
            print(f"\nTask {i+1}/{len(tasks)}")

            annotation = self.evaluate(task, outcome, lm_eval)
            self.save_annotation(annotation)

            if i < len(tasks) - 1:
                cont = input("\nContinue to next task? (y/n): ").strip().lower()
                if cont != 'y':
                    print("Stopping evaluation session.")
                    break

    def analyze_agreement(self) -> Dict[str, Any]:
        """Analyze agreement between human and LM evaluations."""
        if not self.annotations_file.exists():
            return {"error": "No annotations found"}

        annotations = []
        with open(self.annotations_file, 'r') as f:
            for line in f:
                if line.strip():
                    annotations.append(json.loads(line))

        # Filter annotations with LM agreement data
        with_lm = [a for a in annotations if "lm_agreement" in a]

        if not with_lm:
            return {"error": "No annotations with LM comparisons"}

        # Calculate agreement stats
        agree_count = sum(1 for a in with_lm if a["lm_agreement"]["agree"])
        total = len(with_lm)

        differences = [a["lm_agreement"]["difference"] for a in with_lm]
        avg_diff = sum(differences) / len(differences)

        return {
            "total_comparisons": total,
            "agreements": agree_count,
            "agreement_rate": round((agree_count / total) * 100, 1),
            "average_difference": round(avg_diff, 2),
            "disagreements": total - agree_count
        }


def main():
    """CLI interface for human evaluation."""
    import argparse

    parser = argparse.ArgumentParser(description="Human evaluation tool")
    parser.add_argument("--task", help="Path to task JSON file")
    parser.add_argument("--outcome", help="Path to outcome JSON file")
    parser.add_argument("--lm-eval", help="Path to LM evaluation JSON file (optional)")
    parser.add_argument("--annotations", default="evaluation/results/human-annotations.jsonl",
                       help="Path to annotations file")
    parser.add_argument("--analyze", action="store_true",
                       help="Analyze agreement between human and LM evaluations")

    args = parser.parse_args()

    evaluator = HumanEvaluator(annotations_file=args.annotations)

    if args.analyze:
        # Analyze agreement
        analysis = evaluator.analyze_agreement()
        print("\n" + "=" * 70)
        print("HUMAN-LM AGREEMENT ANALYSIS")
        print("=" * 70)
        print()

        if "error" in analysis:
            print(f"Error: {analysis['error']}")
        else:
            print(f"Total comparisons: {analysis['total_comparisons']}")
            print(f"Agreements: {analysis['agreements']}")
            print(f"Agreement rate: {analysis['agreement_rate']}%")
            print(f"Average difference: {analysis['average_difference']}")
            print()
        return

    if not args.task or not args.outcome:
        parser.error("--task and --outcome are required (or use --analyze)")

    # Load files
    with open(args.task, 'r') as f:
        task = json.load(f)

    with open(args.outcome, 'r') as f:
        outcome = json.load(f)

    lm_eval = None
    if args.lm_eval:
        with open(args.lm_eval, 'r') as f:
            lm_eval = json.load(f)

    # Run evaluation
    annotation = evaluator.evaluate(task, outcome, lm_eval)
    evaluator.save_annotation(annotation)

    print(f"\nAnnotation saved to: {args.annotations}")


if __name__ == "__main__":
    main()
