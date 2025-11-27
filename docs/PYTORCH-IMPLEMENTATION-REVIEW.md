# PyTorch Neural Routing - Implementation Review

**Status**: ⚠️ **Code Complete, But Not Operational (No Trained Model)**
**Last Updated**: 2025-11-27
**Priority**: HIGH (User requested activation)

---

## Executive Summary

**Good News**: PyTorch neural routing infrastructure is fully implemented and well-architected.

**Issue**: System is not operational because there is no trained model. The code falls back to rule-based routing.

**What's Needed**:
1. Training data collection (historical routing decisions)
2. Training script implementation
3. Model training and validation4. Model deployment

---

## Current Implementation Status

### ✅ **What EXISTS and Works Well**

#### 1. Neural Network Architecture (`llm-mesh/lib/routing/neural_router.py`)

**File**: `llm-mesh/lib/routing/neural_router.py` (371 lines)

**Components**:
- ✅ `MoERouterModel` - Full neural network class
  - Task encoder (BERT-style, 512 → 256 dimensions)
  - Context encoder (64 historical features)
  - Multi-head attention mechanism (4 heads)
  - Classifier (5 masters output)
  - Confidence predictor (0-1 score)

- ✅ `NeuralRouter` - Inference wrapper
  - Model loading/saving
  - Single task routing
  - Batch routing
  - Decision explainability

- ✅ `EnsembleRouter` - Hybrid approach
  - Neural + rule-based fallback
  - Confidence threshold-based switching
  - Graceful degradation

**Architecture Quality**: ⭐⭐⭐⭐⭐ Excellent
- Modern deep learning practices
- Proper attention mechanisms
- Good separation of concerns
- Explainable predictions

#### 2. Integration Layer (`llm-mesh/lib/integration/moe_ml_router.py`)

**File**: `llm-mesh/lib/integration/moe_ml_router.py` (207 lines)

**Components**:
- ✅ `MLEnhancedRouter` - Production integration
  - A/B testing support (configurable percentage)
  - Fallback to rule-based when ML unavailable
  - RAG integration for enhanced context
  - Statistics tracking

**Integration Quality**: ⭐⭐⭐⭐ Very Good
- Safe fallback mechanisms
- A/B testing ready
- Good error handling

#### 3. Dependencies

**PyTorch Installed**: ✅ YES
```bash
python-sdk/.venv/lib/python3.14/site-packages/torch/
python-sdk/.venv/lib/python3.14/site-packages/torchvision/
```

**Size**: ~500MB (PyTorch + torchvision)

---

### ❌ **What's MISSING**

#### 1. **No Trained Model**

**Issue**: `llm-mesh/models/` directory doesn't exist

**Evidence**:
```python
# From moe_ml_router.py line 159-161:
# "TODO: Implement actual neural routing once model is trained"
print("⚠️  Neural routing not yet implemented, falling back to rules")
```

**Impact**: System falls back to keyword routing every time

#### 2. **No Training Pipeline**

**Missing**:
- Training script
- Data preprocessing
- Hyperparameter configuration
- Validation split
- Training loop
- Checkpointing logic

#### 3. **No Training Data**

**What's Needed**:
Historical routing decisions with outcomes:
```json
{
  "task_id": "task-001",
  "task_description": "Fix authentication bug",
  "task_embedding": [0.1, 0.2, ...],  // 512-dim vector
  "context_features": [0.3, 0.1, ...], // 64-dim historical features
  "selected_master": "development-master",
  "outcome": "success",  // or "failed"
  "execution_time": 120,
  "tokens_used": 5000
}
```

**Source**: Could be generated from:
- `coordination/task-queue.json` (historical tasks)
- `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
- Worker logs in `agents/logs/workers/`

#### 4. **No Evaluation Metrics**

**Missing**:
- Accuracy tracking
- Confusion matrix
- Per-master performance
- Comparison with keyword routing

---

## Implementation Roadmap

### Phase 1: Data Collection & Preparation (1 week)

#### Step 1.1: Extract Historical Routing Data
```bash
# Script to create: scripts/ml/extract-training-data.sh
# Extracts from:
# - coordination/task-queue.json
# - coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl
# - agents/logs/workers/

# Output format:
# llm-mesh/training-data/routing-decisions.jsonl
```

**Data Fields Needed**:
- Task description (text)
- Task metadata (type, priority)
- Selected master (label)
- Execution outcome (success/failed)
- Execution time
- Tokens used

**Minimum Dataset Size**: 500 examples (100 per master)

#### Step 1.2: Generate Embeddings
```python
# Create: llm-mesh/scripts/training/generate-embeddings.py
# Use sentence-transformers (already installed)
# Model: all-MiniLM-L6-v2 (matches RAG system)
```

#### Step 1.3: Extract Context Features
```python
# Create: llm-mesh/scripts/training/extract-features.py
# 64-dim historical features:
# - Master historical success rate (5 features)
# - Recent task types (10 features)
# - Time-of-day patterns (24 features)
# - Worker availability (5 features)
# - Token budget status (5 features)
# - Other metrics (15 features)
```

---

### Phase 2: Training Pipeline (3 days)

#### Step 2.1: Training Script
```python
# Create: llm-mesh/scripts/training/train-router.py

import torch
from torch.utils.data import DataLoader, Dataset
from llm_mesh.routing.neural_router import MoERouterModel

class RoutingDataset(Dataset):
    def __init__(self, data_path):
        # Load training data
        pass

    def __getitem__(self, idx):
        # Return (task_embedding, context_features, label)
        pass

def train_model(
    train_loader,
    val_loader,
    model,
    epochs=50,
    learning_rate=0.001
):
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    criterion = torch.nn.CrossEntropyLoss()

    for epoch in range(epochs):
        # Training loop
        for batch in train_loader:
            task_emb, context, labels = batch

            logits, confidence = model(task_emb, context)
            loss = criterion(logits, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        # Validation
        val_accuracy = evaluate(model, val_loader)
        print(f"Epoch {epoch}: Val Accuracy: {val_accuracy:.2%}")

        # Save checkpoint
        if val_accuracy > best_accuracy:
            save_checkpoint(model, epoch, val_accuracy)

if __name__ == "__main__":
    # Load data
    train_dataset = RoutingDataset("llm-mesh/training-data/train.jsonl")
    val_dataset = RoutingDataset("llm-mesh/training-data/val.jsonl")

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=32)

    # Initialize model
    model = MoERouterModel()

    # Train
    train_model(train_loader, val_loader, model)
```

#### Step 2.2: Hyperparameter Configuration
```yaml
# Create: llm-mesh/config/training-config.yaml
model:
  embedding_dim: 512
  hidden_dim: 256
  num_masters: 5
  dropout: 0.1

training:
  batch_size: 32
  learning_rate: 0.001
  epochs: 50
  early_stopping_patience: 5

data:
  train_split: 0.8
  val_split: 0.1
  test_split: 0.1
  min_examples_per_master: 100
```

---

### Phase 3: Model Training & Validation (1 day)

#### Step 3.1: Train Initial Model
```bash
# Train model
python llm-mesh/scripts/training/train-router.py \
  --config llm-mesh/config/training-config.yaml \
  --data llm-mesh/training-data/routing-decisions.jsonl \
  --output llm-mesh/models/router-v1.pt

# Expected output:
# Epoch 1: Train Loss: 1.23, Val Accuracy: 45.2%
# Epoch 10: Train Loss: 0.67, Val Accuracy: 72.3%
# Epoch 30: Train Loss: 0.21, Val Accuracy: 89.1%
# Best model saved: llm-mesh/models/router-v1.pt
```

#### Step 3.2: Evaluate Model
```python
# Create: llm-mesh/scripts/training/evaluate-router.py
# Compare:
# - Neural routing accuracy
# - Keyword routing accuracy (baseline)
# - Per-master performance
# - Confusion matrix
```

**Success Criteria**:
- Neural accuracy > Keyword accuracy + 5%
- Per-master accuracy > 80%
- Low false positive rate for security/cicd tasks

---

### Phase 4: Deployment (1 day)

#### Step 4.1: Enable Neural Routing
```bash
# Update .env
echo "PYTORCH_ROUTING_ENABLED=true" >> .env
echo "MODEL_PATH=llm-mesh/models/router-v1.pt" >> .env
```

#### Step 4.2: A/B Testing
```bash
# Start with 10% traffic
echo "NEURAL_ROUTING_AB_TEST=0.1" >> .env

# Monitor for 1 week
# Compare:
# - Task success rate
# - Routing accuracy
# - Token efficiency
```

#### Step 4.3: Gradual Rollout
```bash
# Week 1: 10% → Monitor
# Week 2: 25% → Compare metrics
# Week 3: 50% → Validate performance
# Week 4: 100% → Full deployment (if successful)
```

---

## Files to Create

### Training Scripts
1. `llm-mesh/scripts/training/extract-training-data.sh` - Extract historical data
2. `llm-mesh/scripts/training/generate-embeddings.py` - Create task embeddings
3. `llm-mesh/scripts/training/extract-features.py` - Extract context features
4. `llm-mesh/scripts/training/train-router.py` - Main training script
5. `llm-mesh/scripts/training/evaluate-router.py` - Model evaluation

### Configuration
1. `llm-mesh/config/training-config.yaml` - Training hyperparameters
2. `.env` additions - Enable PyTorch routing

### Data Directories
1. `llm-mesh/training-data/` - Training/val/test splits
2. `llm-mesh/models/` - Trained model checkpoints

---

## Integration with Existing Systems

### How It Will Work

1. **Task Submission** → `coordination/task-queue.json`
2. **Coordinator Reads Task** → MoE Router
3. **Router Checks** → Neural routing enabled?
4. **If Enabled** → Load model from `llm-mesh/models/router-v1.pt`
5. **Generate Embeddings** → Use sentence-transformers
6. **Extract Context** → Historical performance features
7. **Neural Forward Pass** → Get master probabilities
8. **Confidence Check** → If > 0.5, use neural; else fallback to keywords
9. **Log Decision** → For continuous learning

### Entry Point
```bash
# File: coordination/masters/coordinator/lib/moe-router.sh
# Lines to add:

if [ "$PYTORCH_ROUTING_ENABLED" = "true" ]; then
  # Call Python neural router
  NEURAL_RESULT=$(python llm-mesh/scripts/integration/neural-route.py \
    --task-description "$TASK_DESC" \
    --model-path "$MODEL_PATH")

  CONFIDENCE=$(echo "$NEURAL_RESULT" | jq -r '.confidence')

  if (( $(echo "$CONFIDENCE > 0.5" | bc -l) )); then
    # Use neural routing
    MASTER=$(echo "$NEURAL_RESULT" | jq -r '.selected_master')
  else
    # Fallback to keyword routing
    MASTER=$(keyword_routing "$TASK_DESC")
  fi
else
  # Keyword routing only
  MASTER=$(keyword_routing "$TASK_DESC")
fi
```

---

## Estimated Effort

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Data Collection & Preparation | 3-5 days |
| 2 | Training Pipeline Development | 2-3 days |
| 3 | Model Training & Validation | 1-2 days |
| 4 | Deployment & A/B Testing | 1 week |
| **Total** | **End-to-End Implementation** | **2-3 weeks** |

---

## Risks & Mitigations

### Risk 1: Insufficient Training Data
**Impact**: Model won't learn effectively (< 500 examples)
**Mitigation**:
- Collect more historical data from logs
- Generate synthetic examples
- Start with simpler model if needed

### Risk 2: Neural Model Worse Than Keywords
**Impact**: No benefit, wasted effort
**Mitigation**:
- A/B testing before full rollout
- Ensemble approach (neural + keyword fallback)
- Easy rollback via env variable

### Risk 3: Increased Latency
**Impact**: Slower routing decisions
**Mitigation**:
- Batch inference where possible
- Model optimization (quantization)
- Async routing if needed

---

## Recommendations

### Immediate Actions (This Week)

1. **Extract Training Data** (Priority: HIGH)
   ```bash
   # Run extraction script
   ./llm-mesh/scripts/training/extract-training-data.sh

   # Verify minimum dataset size
   wc -l llm-mesh/training-data/routing-decisions.jsonl
   # Should be >= 500 examples
   ```

2. **Generate Embeddings** (Priority: HIGH)
   ```bash
   python llm-mesh/scripts/training/generate-embeddings.py
   ```

3. **Create Training Script** (Priority: HIGH)
   - Follow Phase 2 roadmap above
   - Test with small dataset first

### Next Month

1. **Train Initial Model**
2. **Run Evaluation**
3. **Start A/B Testing at 10%**
4. **Monitor Metrics Weekly**

### Long-Term (3 months)

1. **Continuous Learning**: Retrain model monthly with new data
2. **Feature Engineering**: Improve 64-dim context features
3. **Model Optimization**: Try larger models if performance plateaus
4. **Multi-task Learning**: Predict success probability + routing

---

## Success Metrics

Track these metrics to validate PyTorch routing:

| Metric | Baseline (Keyword) | Target (Neural) | Measurement |
|--------|-------------------|-----------------|-------------|
| Routing Accuracy | 87.5% | 92%+ | ML validation |
| Task Success Rate | 94% | 95%+ | Task completion |
| Avg Execution Time | - | -10% | Worker logs |
| Token Efficiency | - | -5% | Token usage |

---

## Questions for User

1. **Do you have historical routing data** from before we implemented governance?
   - Location: `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
   - Need at least 500 examples

2. **What's your target for neural routing accuracy?**
   - Is 92%+ acceptable?
   - Or need 95%+?

3. **When do you want to start training?**
   - Can begin data collection today
   - Training can start in 3-5 days once data is ready

---

**Next Steps**:
1. Review this document
2. Confirm approach
3. Start Phase 1 (Data Collection)

**Owner**: Development Master
**Timeline**: 2-3 weeks to full deployment
