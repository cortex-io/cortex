#!/usr/bin/env bash
# Generate Sample Training Data for PyTorch Model
# Creates realistic sample data for demonstration and testing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

TRAINING_DATA_DIR="$CORTEX_HOME/llm-mesh/training-data"
mkdir -p "$TRAINING_DATA_DIR"

# Python for embeddings
if [ -f "$CORTEX_HOME/venv/bin/python" ]; then
  PYTHON="$CORTEX_HOME/venv/bin/python"
else
  PYTHON="python3"
fi

echo "🔧 Generating sample training data..."

# Create Python script to generate sample data with embeddings
cat > "$TRAINING_DATA_DIR/generate_samples.py" << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
import json
from sentence_transformers import SentenceTransformer

# Sample queries and labels
samples = [
    # Development queries
    {"query": "Fix bug in user authentication", "agent": "development-master", "label": 1},
    {"query": "Implement new REST API endpoint", "agent": "development-master", "label": 1},
    {"query": "Refactor database schema", "agent": "development-master", "label": 1},
    {"query": "Optimize SQL queries", "agent": "development-master", "label": 1},
    {"query": "Add new feature to dashboard", "agent": "development-master", "label": 1},

    # Security queries
    {"query": "Fix CVE-2024-1234 vulnerability", "agent": "security-master", "label": 1},
    {"query": "Scan repository for security issues", "agent": "security-master", "label": 1},
    {"query": "Audit authentication system", "agent": "security-master", "label": 1},
    {"query": "Patch SQL injection vulnerability", "agent": "security-master", "label": 1},
    {"query": "Review security compliance", "agent": "security-master", "label": 1},

    # Inventory queries
    {"query": "Document API endpoints", "agent": "inventory-master", "label": 1},
    {"query": "Catalog repository dependencies", "agent": "inventory-master", "label": 1},
    {"query": "Generate system documentation", "agent": "inventory-master", "label": 1},
    {"query": "Track package versions", "agent": "inventory-master", "label": 1},
    {"query": "Create architecture diagram", "agent": "inventory-master", "label": 1},

    # CI/CD queries
    {"query": "Build and deploy to production", "agent": "cicd-master", "label": 1},
    {"query": "Run automated test suite", "agent": "cicd-master", "label": 1},
    {"query": "Configure CI pipeline", "agent": "cicd-master", "label": 1},
    {"query": "Deploy to staging environment", "agent": "cicd-master", "label": 1},
    {"query": "Create release package", "agent": "cicd-master", "label": 1},
]

# Load embedding model
print("Loading sentence-transformers model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Generate embeddings
print(f"Generating embeddings for {len(samples)} samples...")
for sample in samples:
    embedding = model.encode(sample['query'])
    sample['query_embedding'] = embedding.tolist()

# Split into train/val (80/20)
split_idx = int(len(samples) * 0.8)
train_samples = samples[:split_idx]
val_samples = samples[split_idx:]

# Write training data
with open('routing-training-embeddings.jsonl', 'w') as f:
    for sample in train_samples:
        f.write(json.dumps(sample) + '\n')

# Write validation data
with open('routing-validation-embeddings.jsonl', 'w') as f:
    for sample in val_samples:
        f.write(json.dumps(sample) + '\n')

print(f"✅ Generated {len(train_samples)} training samples")
print(f"✅ Generated {len(val_samples)} validation samples")
PYTHON_SCRIPT

# Run the generation script
cd "$TRAINING_DATA_DIR"
$PYTHON generate_samples.py

echo ""
echo "✅ Sample training data generated!"
echo ""
echo "Files created:"
echo "  - $TRAINING_DATA_DIR/routing-training-embeddings.jsonl"
echo "  - $TRAINING_DATA_DIR/routing-validation-embeddings.jsonl"
echo ""
echo "Next: Train model with:"
echo "  python llm-mesh/lib/routing/train_routing_model.py \\"
echo "    --train-data llm-mesh/training-data/routing-training-embeddings.jsonl \\"
echo "    --val-data llm-mesh/training-data/routing-validation-embeddings.jsonl \\"
echo "    --output llm-mesh/models/routing-head.pt"
