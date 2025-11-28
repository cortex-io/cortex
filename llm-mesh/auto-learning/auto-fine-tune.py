#!/usr/bin/env python3
"""
Automated Fine-Tuning System
Automatically fine-tunes models when enough high-quality data is collected
"""

import json
import os
from pathlib import Path
from datetime import datetime
import anthropic
import time

# Configuration
HQ_OUTCOMES_DIR = Path("llm-mesh/auto-learning/hq-outcomes")
MODELS_DIR = Path("llm-mesh/auto-learning/models")
MIN_TRAINING_EXAMPLES = 1000
FINE_TUNE_TRIGGER_FILE = Path("llm-mesh/auto-learning/.fine_tune_trigger")

def check_training_readiness():
    """Check if we have enough data to fine-tune"""
    training_dir = HQ_OUTCOMES_DIR / "training"

    if not training_dir.exists():
        return False, 0, "No training data directory"

    # Count training examples
    total_examples = 0
    for file in training_dir.glob("*.jsonl"):
        with open(file, 'r') as f:
            total_examples += sum(1 for _ in f)

    is_ready = total_examples >= MIN_TRAINING_EXAMPLES

    return is_ready, total_examples, "Ready for training" if is_ready else f"Need {MIN_TRAINING_EXAMPLES - total_examples} more examples"

def prepare_training_data():
    """
    Prepare training data in Claude fine-tuning format

    Format:
    [
        {"messages": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ]},
        ...
    ]
    """
    training_dir = HQ_OUTCOMES_DIR / "training"
    output_file = MODELS_DIR / "training_data.jsonl"

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    formatted_examples = []

    # Read all training files
    for file in training_dir.glob("*.jsonl"):
        with open(file, 'r') as f:
            for line in f:
                if not line.strip():
                    continue

                example = json.loads(line)

                # Format for Claude fine-tuning
                formatted = {
                    "messages": [
                        {
                            "role": "user",
                            "content": example["input"]["description"]
                        },
                        {
                            "role": "assistant",
                            "content": json.dumps({
                                "result": example["output"]["result"],
                                "approach": example["output"].get("approach", ""),
                                "reasoning": example["output"].get("reasoning", "")
                            })
                        }
                    ]
                }

                formatted_examples.append(formatted)

    # Write formatted data
    with open(output_file, 'w') as out:
        for example in formatted_examples:
            out.write(json.dumps(example) + '\n')

    return output_file, len(formatted_examples)

def trigger_fine_tuning():
    """
    Trigger automated fine-tuning

    Note: This uses Claude API's fine-tuning capabilities
    In practice, you would:
    1. Upload training data
    2. Create fine-tuning job
    3. Monitor progress
    4. Download fine-tuned model

    This is a placeholder implementation
    """
    # Check readiness
    is_ready, count, message = check_training_readiness()

    if not is_ready:
        return {
            "status": "not_ready",
            "message": message,
            "training_examples": count,
            "min_required": MIN_TRAINING_EXAMPLES
        }

    # Prepare training data
    print("Preparing training data...")
    training_file, example_count = prepare_training_data()

    print(f"Prepared {example_count} training examples")

    # Create fine-tuning configuration
    config = {
        "model_base": "claude-3-haiku-20240307",  # Start with smallest/cheapest
        "training_file": str(training_file),
        "training_examples": example_count,
        "hyperparameters": {
            "n_epochs": 3,
            "batch_size": 32,
            "learning_rate_multiplier": 1.0
        },
        "validation_split": 0.2,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    # Save configuration
    config_file = MODELS_DIR / f"fine_tune_config_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(config_file, 'w') as f:
        json.dumps(config, f, indent=2)

    print(f"\n📋 Fine-tuning configuration:")
    print(json.dumps(config, indent=2))

    print(f"\n⚠️  Note: Automated fine-tuning requires API integration")
    print(f"Training data ready at: {training_file}")
    print(f"Configuration saved to: {config_file}")

    # Placeholder for actual fine-tuning
    # In production, this would call Claude API:
    # client = anthropic.Anthropic()
    # job = client.fine_tuning.create(training_file=training_file, **config)

    return {
        "status": "configured",
        "message": "Fine-tuning configuration created",
        "training_file": str(training_file),
        "config_file": str(config_file),
        "training_examples": example_count,
        "next_steps": [
            "Integrate with Claude API for fine-tuning",
            "Monitor fine-tuning job progress",
            "Validate fine-tuned model",
            "Deploy with A/B testing"
        ]
    }

def estimate_training_cost(example_count):
    """
    Estimate fine-tuning cost

    Note: Pricing is approximate and subject to change
    """
    # Approximate costs (as of 2024)
    COST_PER_1K_TOKENS = 0.001  # Training cost per 1k tokens
    AVG_TOKENS_PER_EXAMPLE = 500  # Estimate

    total_tokens = example_count * AVG_TOKENS_PER_EXAMPLE
    estimated_cost = (total_tokens / 1000) * COST_PER_1K_TOKENS

    return {
        "example_count": example_count,
        "estimated_tokens": total_tokens,
        "estimated_cost_usd": round(estimated_cost, 2),
        "note": "Estimate only - actual costs may vary"
    }

def get_fine_tuning_status():
    """Get status of fine-tuning pipeline"""
    is_ready, count, message = check_training_readiness()

    # Check if fine-tuning has been triggered
    has_triggered = FINE_TUNE_TRIGGER_FILE.exists()

    # Get model files
    models = []
    if MODELS_DIR.exists():
        for model_dir in MODELS_DIR.glob("model_*"):
            if model_dir.is_dir():
                metadata_file = model_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        models.append(json.load(f))

    return {
        "data_collection": {
            "training_examples": count,
            "min_required": MIN_TRAINING_EXAMPLES,
            "ready": is_ready,
            "message": message,
            "progress_percent": min(100, int(count / MIN_TRAINING_EXAMPLES * 100))
        },
        "fine_tuning": {
            "has_triggered": has_triggered,
            "models_trained": len(models),
            "latest_model": models[-1] if models else None
        },
        "cost_estimate": estimate_training_cost(count)
    }

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "status":
        # Show status
        status = get_fine_tuning_status()
        print(json.dumps(status, indent=2))

    elif len(sys.argv) > 1 and sys.argv[1] == "trigger":
        # Trigger fine-tuning
        result = trigger_fine_tuning()
        print(json.dumps(result, indent=2))

        if result["status"] == "configured":
            # Mark as triggered
            FINE_TUNE_TRIGGER_FILE.touch()

    else:
        print("Usage:")
        print("  python auto-fine-tune.py status   - Show fine-tuning status")
        print("  python auto-fine-tune.py trigger  - Trigger fine-tuning")
