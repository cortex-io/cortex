#!/usr/bin/env bash
# PyTorch Training Data Collection Script
# Collects and labels routing decisions for model training

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

# Data collection configuration
ROUTING_LOG="$CORTEX_HOME/coordination/logs/routing-decisions.jsonl"
TRAINING_DATA_DIR="$CORTEX_HOME/llm-mesh/training-data"
TRAINING_DATA_FILE="$TRAINING_DATA_DIR/routing-training-dataset.jsonl"
VALIDATION_DATA_FILE="$TRAINING_DATA_DIR/routing-validation-dataset.jsonl"

# Collection parameters
MIN_TRAINING_SAMPLES="${MIN_TRAINING_SAMPLES:-500}"
VALIDATION_SPLIT="${VALIDATION_SPLIT:-0.2}"  # 20% validation set

mkdir -p "$TRAINING_DATA_DIR"

##############################################################################
# collect_routing_data: Extract routing decisions from logs
##############################################################################
collect_routing_data() {
  echo "📊 Collecting routing data from logs..."

  if [ ! -f "$ROUTING_LOG" ]; then
    echo "❌ No routing log found at: $ROUTING_LOG"
    echo "   Run routing cascade first to generate data"
    exit 1
  fi

  local total_decisions=$(wc -l < "$ROUTING_LOG" | tr -d ' ')

  echo "   Found $total_decisions routing decisions"

  if [ "$total_decisions" -lt "$MIN_TRAINING_SAMPLES" ]; then
    echo "⚠️  Only $total_decisions samples (need $MIN_TRAINING_SAMPLES for training)"
    echo "   Continue collecting data..."
    return 1
  fi

  echo "✅ Sufficient data for training ($total_decisions samples)"
  return 0
}

##############################################################################
# label_routing_outcomes: Label routing decisions with outcomes
#
# This script helps label routing decisions, but requires manual review
# or integration with task outcome tracking
##############################################################################
label_routing_outcomes() {
  echo "🏷️  Labeling routing outcomes..."

  # For now, create template for manual labeling
  # TODO: Integrate with task outcome tracking to auto-label

  local labeled_data="$TRAINING_DATA_DIR/routing-labeled-temp.jsonl"

  while IFS= read -r line; do
    local query=$(echo "$line" | jq -r '.query')
    local agent=$(echo "$line" | jq -r '.selected_agent')
    local method=$(echo "$line" | jq -r '.routing_method')
    local confidence=$(echo "$line" | jq -r '.confidence')

    # Create training example format
    # Label: 1 = successful routing, 0 = failed routing
    # Default to 1 (needs manual review for accuracy)
    local training_example=$(jq -n \
      --arg query "$query" \
      --arg agent "$agent" \
      --arg method "$method" \
      --argjson confidence "$confidence" \
      '{
        query: $query,
        agent: $agent,
        method: $method,
        confidence: $confidence,
        label: 1,
        needs_review: true
      }')

    echo "$training_example" >> "$labeled_data"
  done < "$ROUTING_LOG"

  echo "✅ Created labeled dataset: $labeled_data"
  echo "   ⚠️  Manual review required - update 'label' field based on task outcomes"
}

##############################################################################
# split_train_validation: Split data into training and validation sets
##############################################################################
split_train_validation() {
  local input_file="${1:-$TRAINING_DATA_DIR/routing-labeled-temp.jsonl}"

  echo "📂 Splitting data into training and validation sets..."

  local total_samples=$(wc -l < "$input_file" | tr -d ' ')
  local validation_size=$(echo "scale=0; $total_samples * $VALIDATION_SPLIT" | bc)
  local training_size=$((total_samples - validation_size))

  echo "   Total samples: $total_samples"
  echo "   Training: $training_size ($(echo "scale=0; 100 - $VALIDATION_SPLIT * 100" | bc)%)"
  echo "   Validation: $validation_size ($(echo "scale=0; $VALIDATION_SPLIT * 100" | bc)%)"

  # Shuffle and split
  shuf "$input_file" > "$TRAINING_DATA_DIR/shuffled.jsonl"

  # Training set (first 80%)
  head -n "$training_size" "$TRAINING_DATA_DIR/shuffled.jsonl" > "$TRAINING_DATA_FILE"

  # Validation set (last 20%)
  tail -n "$validation_size" "$TRAINING_DATA_DIR/shuffled.jsonl" > "$VALIDATION_DATA_FILE"

  # Cleanup
  rm "$TRAINING_DATA_DIR/shuffled.jsonl"

  echo "✅ Training set: $TRAINING_DATA_FILE ($training_size samples)"
  echo "✅ Validation set: $VALIDATION_DATA_FILE ($validation_size samples)"
}

##############################################################################
# generate_embeddings: Pre-compute embeddings for training data
##############################################################################
generate_embeddings() {
  echo "🧮 Generating embeddings for training data..."

  local python_script="$CORTEX_HOME/llm-mesh/lib/routing/generate_training_embeddings.py"

  if [ -f "$CORTEX_HOME/venv/bin/python" ]; then
    PYTHON="$CORTEX_HOME/venv/bin/python"
  else
    PYTHON="python3"
  fi

  # Create embedding generation script
  cat > "$python_script" << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
"""Generate embeddings for PyTorch training data"""

import json
import sys
from pathlib import Path
from sentence_transformers import SentenceTransformer

def generate_embeddings(input_file, output_file):
    model = SentenceTransformer('all-MiniLM-L6-v2')

    with open(input_file, 'r') as f_in, open(output_file, 'w') as f_out:
        for line in f_in:
            example = json.loads(line)

            # Generate query embedding
            query_emb = model.encode(example['query']).tolist()

            # Add embedding to example
            example['query_embedding'] = query_emb

            # Write to output
            f_out.write(json.dumps(example) + '\n')

    print(f"✅ Generated embeddings: {output_file}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: generate_training_embeddings.py <input> <output>")
        sys.exit(1)

    generate_embeddings(sys.argv[1], sys.argv[2])
PYTHON_SCRIPT

  chmod +x "$python_script"

  # Generate embeddings for training set
  "$PYTHON" "$python_script" \
    "$TRAINING_DATA_FILE" \
    "$TRAINING_DATA_DIR/routing-training-embeddings.jsonl"

  # Generate embeddings for validation set
  "$PYTHON" "$python_script" \
    "$VALIDATION_DATA_FILE" \
    "$TRAINING_DATA_DIR/routing-validation-embeddings.jsonl"

  echo "✅ Embeddings generated"
}

##############################################################################
# show_collection_stats: Display collection statistics
##############################################################################
show_collection_stats() {
  echo ""
  echo "=========================================="
  echo "Training Data Collection Summary"
  echo "=========================================="
  echo ""

  if [ -f "$ROUTING_LOG" ]; then
    local total=$(wc -l < "$ROUTING_LOG" | tr -d ' ')
    echo "Routing Decisions Logged: $total"
    echo ""

    echo "Distribution by Method:"
    jq -r '.routing_method' "$ROUTING_LOG" 2>/dev/null | sort | uniq -c | sort -rn || echo "  (no data)"
    echo ""

    echo "Distribution by Agent:"
    jq -r '.selected_agent' "$ROUTING_LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -10 || echo "  (no data)"
  else
    echo "No routing log found"
  fi

  echo ""

  if [ -f "$TRAINING_DATA_FILE" ]; then
    local train_samples=$(wc -l < "$TRAINING_DATA_FILE" | tr -d ' ')
    local val_samples=$(wc -l < "$VALIDATION_DATA_FILE" | tr -d ' ')
    echo "Training Set: $train_samples samples"
    echo "Validation Set: $val_samples samples"
    echo ""
    echo "Ready for PyTorch model training! 🚀"
  else
    echo "Training data not yet prepared"
    echo ""
    echo "Run: $0 prepare"
  fi

  echo ""
  echo "=========================================="
}

##############################################################################
# Main execution
##############################################################################
case "${1:-}" in
  collect)
    collect_routing_data
    ;;

  label)
    label_routing_outcomes
    ;;

  split)
    split_train_validation "${2:-}"
    ;;

  embeddings)
    generate_embeddings
    ;;

  prepare)
    echo "🚀 Preparing PyTorch training data..."
    echo ""

    if collect_routing_data; then
      label_routing_outcomes
      split_train_validation "$TRAINING_DATA_DIR/routing-labeled-temp.jsonl"
      generate_embeddings

      echo ""
      echo "✅ Training data preparation complete!"
      echo ""
      echo "Next steps:"
      echo "  1. Review and update labels in: $TRAINING_DATA_DIR/routing-labeled-temp.jsonl"
      echo "  2. Train PyTorch model: python llm-mesh/lib/routing/train_routing_model.py"
      echo "  3. Evaluate on validation set"
      echo "  4. Deploy trained model"
    else
      echo ""
      echo "⏳ Not enough data yet. Continue running routing cascade."
      echo "   Target: $MIN_TRAINING_SAMPLES samples"
      echo "   Current: $(wc -l < "$ROUTING_LOG" 2>/dev/null | tr -d ' ' || echo 0) samples"
    fi
    ;;

  stats)
    show_collection_stats
    ;;

  *)
    echo "Usage: $0 {collect|label|split|embeddings|prepare|stats}"
    echo ""
    echo "Commands:"
    echo "  collect     - Check if enough routing data collected"
    echo "  label       - Create labeled dataset (requires manual review)"
    echo "  split       - Split into training/validation sets"
    echo "  embeddings  - Generate query embeddings"
    echo "  prepare     - Run full preparation pipeline"
    echo "  stats       - Show collection statistics"
    echo ""
    echo "Quick start:"
    echo "  $0 prepare  - Prepare all training data"
    echo "  $0 stats    - Check collection progress"
    exit 1
    ;;
esac
