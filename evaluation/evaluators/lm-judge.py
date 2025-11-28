#!/usr/bin/env python3
"""
LM-as-Judge Evaluator for Cortex

Uses Claude API to evaluate task outcomes against expected results.
Provides structured scoring across multiple quality dimensions.
"""

import os
import sys
import json
import anthropic
from datetime import datetime
from typing import Dict, List, Any, Optional


class LMJudge:
    """Claude-based evaluator for Cortex task outcomes."""

    # Evaluation dimensions and their descriptions
    DIMENSIONS = {
        "correctness": "Did the solution correctly solve the task requirements?",
        "completeness": "Were all requirements and criteria addressed?",
        "efficiency": "Was the approach efficient in terms of resources and time?",
        "code_quality": "Is the implementation clean, maintainable, and well-structured?",
        "best_practices": "Does it follow industry best practices and conventions?"
    }

    def __init__(self, model: str = "claude-3-5-sonnet-20241022"):
        """Initialize LM Judge with Claude API client."""
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")

        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def evaluate(
        self,
        task: Dict[str, Any],
        outcome: Dict[str, Any],
        expected_outcome: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a task outcome using Claude as judge.

        Args:
            task: Task definition with description and criteria
            outcome: Actual outcome from Cortex execution
            expected_outcome: Expected results (optional, can be in task definition)

        Returns:
            Dictionary with scores, reasoning, and overall evaluation
        """
        # Build evaluation prompt
        prompt = self._build_evaluation_prompt(task, outcome, expected_outcome)

        # Call Claude API
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                temperature=0.0,  # Deterministic for consistent evaluation
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )

            # Parse Claude's response
            evaluation_text = response.content[0].text
            evaluation = self._parse_evaluation_response(evaluation_text)

            # Add metadata
            evaluation["metadata"] = {
                "task_id": task.get("task_id"),
                "evaluated_at": datetime.utcnow().isoformat() + "Z",
                "model": self.model,
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens
            }

            return evaluation

        except Exception as e:
            return {
                "error": str(e),
                "task_id": task.get("task_id"),
                "evaluated_at": datetime.utcnow().isoformat() + "Z"
            }

    def _build_evaluation_prompt(
        self,
        task: Dict[str, Any],
        outcome: Dict[str, Any],
        expected_outcome: Optional[Dict[str, Any]]
    ) -> str:
        """Build the evaluation prompt for Claude."""

        # Use expected_outcome from parameter or task definition
        expected = expected_outcome or task.get("expected_outcome", {})

        prompt = f"""You are an expert evaluator for a multi-agent AI system called Cortex. Your job is to evaluate how well the system completed a given task.

# Task Definition
{json.dumps(task, indent=2)}

# Expected Outcome
{json.dumps(expected, indent=2)}

# Actual Outcome
{json.dumps(outcome, indent=2)}

# Evaluation Instructions

Evaluate the actual outcome against the task requirements and expected outcome across these dimensions:

"""

        # Add dimension descriptions
        for dimension, description in self.DIMENSIONS.items():
            prompt += f"**{dimension.title()}** (1-5 scale): {description}\n"

        prompt += """
For each dimension, provide:
1. A score from 1-5 where:
   - 5: Excellent - Exceeds expectations
   - 4: Good - Meets expectations with minor gaps
   - 3: Acceptable - Meets minimum requirements
   - 2: Poor - Significant gaps or issues
   - 1: Failed - Does not meet requirements

2. Brief reasoning (1-2 sentences) explaining the score

# Response Format

Respond with a JSON object in this exact format:

```json
{
  "overall_score": <average of all dimension scores, rounded to 1 decimal>,
  "overall_assessment": "<brief 2-3 sentence summary>",
  "dimensions": {
    "correctness": {
      "score": <1-5>,
      "reasoning": "<explanation>"
    },
    "completeness": {
      "score": <1-5>,
      "reasoning": "<explanation>"
    },
    "efficiency": {
      "score": <1-5>,
      "reasoning": "<explanation>"
    },
    "code_quality": {
      "score": <1-5>,
      "reasoning": "<explanation>"
    },
    "best_practices": {
      "score": <1-5>,
      "reasoning": "<explanation>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}
```

Provide ONLY the JSON object, no additional text before or after.
"""

        return prompt

    def _parse_evaluation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Claude's evaluation response."""
        try:
            # Remove markdown code blocks if present
            text = response_text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]

            # Parse JSON
            evaluation = json.loads(text.strip())

            # Validate structure
            required_keys = ["overall_score", "overall_assessment", "dimensions"]
            for key in required_keys:
                if key not in evaluation:
                    raise ValueError(f"Missing required key: {key}")

            return evaluation

        except json.JSONDecodeError as e:
            # Fallback if JSON parsing fails
            return {
                "error": f"Failed to parse evaluation response: {str(e)}",
                "raw_response": response_text
            }

    def evaluate_batch(
        self,
        evaluations: List[tuple]
    ) -> List[Dict[str, Any]]:
        """
        Evaluate multiple task outcomes.

        Args:
            evaluations: List of (task, outcome, expected_outcome) tuples

        Returns:
            List of evaluation results
        """
        results = []
        for i, (task, outcome, expected) in enumerate(evaluations):
            print(f"Evaluating {i+1}/{len(evaluations)}: {task.get('task_id')}...",
                  file=sys.stderr)
            result = self.evaluate(task, outcome, expected)
            results.append(result)

        return results


def main():
    """CLI interface for LM-as-Judge evaluator."""
    import argparse

    parser = argparse.ArgumentParser(description="LM-as-Judge Evaluator")
    parser.add_argument("--task", required=True, help="Path to task JSON file")
    parser.add_argument("--outcome", required=True, help="Path to outcome JSON file")
    parser.add_argument("--expected", help="Path to expected outcome JSON file (optional)")
    parser.add_argument("--model", default="claude-3-5-sonnet-20241022",
                       help="Claude model to use")
    parser.add_argument("--output", help="Path to save evaluation result")

    args = parser.parse_args()

    # Load input files
    with open(args.task, 'r') as f:
        task = json.load(f)

    with open(args.outcome, 'r') as f:
        outcome = json.load(f)

    expected = None
    if args.expected:
        with open(args.expected, 'r') as f:
            expected = json.load(f)

    # Run evaluation
    judge = LMJudge(model=args.model)
    evaluation = judge.evaluate(task, outcome, expected)

    # Output result
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(evaluation, f, indent=2)
        print(f"Evaluation saved to {args.output}")
    else:
        print(json.dumps(evaluation, indent=2))


if __name__ == "__main__":
    main()
