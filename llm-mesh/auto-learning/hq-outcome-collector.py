#!/usr/bin/env python3
"""
High-Quality Task Outcome Collector
Automatically identifies and collects high-quality task outcomes for training
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
import hashlib

# Configuration
HQ_OUTCOMES_DIR = Path("llm-mesh/auto-learning/hq-outcomes")
MEDALLION_SILVER = Path("coordination/medallion/silver/processed-tasks")
MIN_QUALITY_SCORE = 4.0  # Minimum quality score (1-5)
MIN_DURATION_SECONDS = 10  # Filter out trivially short tasks
MAX_DURATION_SECONDS = 600  # Filter out stuck/timeout tasks

# Quality criteria
QUALITY_CRITERIA = {
    "must_be_successful": True,
    "must_have_output": True,
    "min_quality_score": MIN_QUALITY_SCORE,
    "duration_range": (MIN_DURATION_SECONDS, MAX_DURATION_SECONDS),
    "no_errors": True,
    "no_retries": True,
}

def init_hq_collection():
    """Initialize HQ outcomes directory"""
    HQ_OUTCOMES_DIR.mkdir(parents=True, exist_ok=True)
    (HQ_OUTCOMES_DIR / "training").mkdir(exist_ok=True)
    (HQ_OUTCOMES_DIR / "validation").mkdir(exist_ok=True)
    (HQ_OUTCOMES_DIR / "metadata.jsonl").touch()

def is_high_quality(task):
    """
    Determine if a task outcome is high quality

    Criteria:
    - Task completed successfully
    - Has meaningful output
    - Quality score >= 4.0
    - Duration in reasonable range (not too fast, not timeout)
    - No errors
    - No retries
    """
    # Must be successful
    if not task.get("is_success"):
        return False, "Not successful"

    # Must have output
    if not task.get("output_data") or len(task.get("output_data", [])) == 0:
        return False, "No output"

    # Quality score check
    quality_score = task.get("quality_score", 0)
    if quality_score < MIN_QUALITY_SCORE:
        return False, f"Quality score too low: {quality_score}"

    # Duration check
    duration = task.get("duration_seconds", 0)
    if duration < MIN_DURATION_SECONDS:
        return False, f"Too fast (trivial): {duration}s"
    if duration > MAX_DURATION_SECONDS:
        return False, f"Too slow (timeout?): {duration}s"

    # No errors
    if task.get("has_error") or task.get("error"):
        return False, "Has errors"

    # No retries (indicates reliability)
    if task.get("retry_count", 0) > 0:
        return False, "Required retries"

    return True, "Meets all quality criteria"

def extract_training_example(task):
    """
    Extract training example from high-quality task

    Format:
    {
        "input": task description,
        "output": successful outcome,
        "metadata": {master, worker_type, duration, quality_score}
    }
    """
    return {
        "task_id": task["task_id"],
        "input": {
            "description": task.get("description", ""),
            "task_type": task.get("task_type", "unknown"),
            "context": task.get("context", {})
        },
        "output": {
            "result": task.get("output_data", []),
            "approach": task.get("approach", ""),
            "reasoning": task.get("reasoning", "")
        },
        "metadata": {
            "master": task.get("master", ""),
            "worker_type": task.get("worker_type", ""),
            "duration_seconds": task.get("duration_seconds", 0),
            "quality_score": task.get("quality_score", 0),
            "tokens_used": task.get("tokens_used", 0),
            "created_at": task.get("created_at", ""),
            "completed_at": task.get("completed_at", "")
        }
    }

def hash_task(task_id):
    """Generate hash for train/val split determinism"""
    return int(hashlib.md5(task_id.encode()).hexdigest(), 16)

def collect_from_silver(date_filter=None):
    """
    Collect high-quality outcomes from medallion silver layer

    Args:
        date_filter: YYYYMMDD string, or None for today
    """
    if date_filter is None:
        date_filter = datetime.now().strftime("%Y%m%d")

    silver_file = MEDALLION_SILVER / f"{date_filter}.jsonl"

    if not silver_file.exists():
        print(f"No silver data for {date_filter}")
        return {
            "total_tasks": 0,
            "hq_tasks": 0,
            "training": 0,
            "validation": 0
        }

    stats = {
        "total_tasks": 0,
        "hq_tasks": 0,
        "training": 0,
        "validation": 0,
        "rejection_reasons": {}
    }

    with open(silver_file, 'r') as f:
        for line in f:
            if not line.strip():
                continue

            task = json.loads(line)
            stats["total_tasks"] += 1

            # Check quality
            is_hq, reason = is_high_quality(task)

            if is_hq:
                stats["hq_tasks"] += 1

                # Extract training example
                example = extract_training_example(task)

                # 80/20 train/val split (deterministic based on task_id)
                task_hash = hash_task(task["task_id"])
                is_training = (task_hash % 100) < 80

                if is_training:
                    output_file = HQ_OUTCOMES_DIR / "training" / f"{date_filter}.jsonl"
                    stats["training"] += 1
                else:
                    output_file = HQ_OUTCOMES_DIR / "validation" / f"{date_filter}.jsonl"
                    stats["validation"] += 1

                # Append example
                with open(output_file, 'a') as out:
                    out.write(json.dumps(example) + '\n')

                # Log metadata
                metadata = {
                    "task_id": task["task_id"],
                    "collected_at": datetime.utcnow().isoformat() + "Z",
                    "date": date_filter,
                    "split": "training" if is_training else "validation",
                    "quality_score": task.get("quality_score", 0),
                    "master": task.get("master", "")
                }

                with open(HQ_OUTCOMES_DIR / "metadata.jsonl", 'a') as meta:
                    meta.write(json.dumps(metadata) + '\n')
            else:
                # Track rejection reasons
                stats["rejection_reasons"][reason] = stats["rejection_reasons"].get(reason, 0) + 1

    return stats

def get_collection_stats():
    """Get statistics on collected HQ outcomes"""
    training_count = 0
    validation_count = 0

    # Count training examples
    training_dir = HQ_OUTCOMES_DIR / "training"
    if training_dir.exists():
        for file in training_dir.glob("*.jsonl"):
            with open(file, 'r') as f:
                training_count += sum(1 for _ in f)

    # Count validation examples
    validation_dir = HQ_OUTCOMES_DIR / "validation"
    if validation_dir.exists():
        for file in validation_dir.glob("*.jsonl"):
            with open(file, 'r') as f:
                validation_count += sum(1 for _ in f)

    return {
        "training_examples": training_count,
        "validation_examples": validation_count,
        "total_examples": training_count + validation_count,
        "ready_for_training": training_count >= 1000,
        "collection_status": {
            "stage": "collecting" if training_count < 1000 else "ready",
            "progress_percent": min(100, int(training_count / 1000 * 100)),
            "examples_needed": max(0, 1000 - training_count)
        }
    }

if __name__ == "__main__":
    import sys

    # Initialize
    init_hq_collection()

    # Collect from yesterday (silver is typically processed daily)
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")

    print(f"Collecting high-quality outcomes from {yesterday}...")
    stats = collect_from_silver(yesterday)

    print(f"\n=== Collection Results ===")
    print(f"Total tasks processed: {stats['total_tasks']}")
    print(f"High-quality tasks: {stats['hq_tasks']}")
    print(f"  - Training: {stats['training']}")
    print(f"  - Validation: {stats['validation']}")

    if stats["rejection_reasons"]:
        print(f"\nRejection reasons:")
        for reason, count in sorted(stats["rejection_reasons"].items(), key=lambda x: x[1], reverse=True):
            print(f"  {reason}: {count}")

    # Overall stats
    overall = get_collection_stats()
    print(f"\n=== Overall Collection Status ===")
    print(json.dumps(overall, indent=2))

    if overall["ready_for_training"]:
        print(f"\n✅ Ready for fine-tuning! ({overall['training_examples']} training examples)")
    else:
        print(f"\n📊 Progress: {overall['collection_status']['progress_percent']}% "
              f"({overall['collection_status']['examples_needed']} more examples needed)")
