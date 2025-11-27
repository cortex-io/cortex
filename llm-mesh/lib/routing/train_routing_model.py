#!/usr/bin/env python3
"""
PyTorch Routing Model Training Script
Trains neural routing head on collected routing decisions
"""

import json
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np

# Try to import PyTorch
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
except ImportError:
    print("ERROR: PyTorch not installed. Install with: pip install torch")
    sys.exit(1)

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("ERROR: sentence-transformers not installed")
    sys.exit(1)


class RoutingDataset(Dataset):
    """Dataset for routing decisions"""

    def __init__(self, data_file: Path):
        self.examples = []

        with open(data_file, 'r') as f:
            for line in f:
                example = json.loads(line)
                self.examples.append(example)

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        example = self.examples[idx]

        # Get query embedding
        query_emb = torch.tensor(example['query_embedding'], dtype=torch.float32)

        # Get agent label (convert agent name to index)
        agent_label = self.agent_to_idx(example['agent'])

        # Get success label
        success_label = example.get('label', 1)

        return query_emb, agent_label, success_label

    def agent_to_idx(self, agent: str) -> int:
        """Map agent name to index"""
        agents = [
            'development-master',
            'security-master',
            'inventory-master',
            'cicd-master'
        ]

        try:
            return agents.index(agent)
        except ValueError:
            return 0  # Default to development-master


class PyTorchRoutingHead(nn.Module):
    """
    PyTorch neural routing head

    Architecture:
    - Query encoder (BERT-style embedding)
    - Attention mechanism
    - Agent classifier (4 masters)
    - Confidence predictor
    """

    def __init__(
        self,
        embedding_dim: int = 384,
        hidden_dim: int = 512,
        num_agents: int = 4,
        num_heads: int = 4,
        dropout: float = 0.1
    ):
        super().__init__()

        self.num_agents = num_agents

        # Query encoder
        self.query_encoder = nn.Sequential(
            nn.Linear(embedding_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim)
        )

        # Multi-head self-attention
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True
        )

        # Agent classifier
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, num_agents)
        )

        # Confidence predictor
        self.confidence = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 4),
            nn.ReLU(),
            nn.Linear(hidden_dim // 4, 1),
            nn.Sigmoid()
        )

    def forward(self, query_emb: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass

        Args:
            query_emb: [batch, embedding_dim]

        Returns:
            logits: [batch, num_agents]
            confidence: [batch, 1]
        """
        # Encode query
        query_enc = self.query_encoder(query_emb)  # [batch, hidden_dim]

        # Add sequence dimension for attention
        query_seq = query_enc.unsqueeze(1)  # [batch, 1, hidden_dim]

        # Self-attention
        attn_output, _ = self.attention(query_seq, query_seq, query_seq)
        attn_output = attn_output.squeeze(1)  # [batch, hidden_dim]

        # Residual connection
        combined = query_enc + attn_output

        # Classify
        logits = self.classifier(combined)

        # Predict confidence
        conf = self.confidence(combined)

        return logits, conf


def train_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    optimizer: optim.Optimizer,
    criterion: nn.Module,
    device: torch.device
) -> float:
    """Train for one epoch"""
    model.train()
    total_loss = 0.0

    for batch_idx, (query_emb, agent_label, success_label) in enumerate(dataloader):
        query_emb = query_emb.to(device)
        agent_label = agent_label.to(device)
        success_label = success_label.float().to(device)

        # Forward pass
        logits, confidence = model(query_emb)

        # Classification loss
        class_loss = criterion(logits, agent_label)

        # Confidence loss (MSE with success label)
        conf_loss = nn.MSELoss()(confidence.squeeze(), success_label)

        # Combined loss
        loss = class_loss + 0.5 * conf_loss

        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        total_loss += loss.item()

    return total_loss / len(dataloader)


def validate(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    device: torch.device
) -> Tuple[float, float]:
    """Validate model"""
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for query_emb, agent_label, success_label in dataloader:
            query_emb = query_emb.to(device)
            agent_label = agent_label.to(device)
            success_label = success_label.float().to(device)

            # Forward pass
            logits, confidence = model(query_emb)

            # Loss
            class_loss = criterion(logits, agent_label)
            conf_loss = nn.MSELoss()(confidence.squeeze(), success_label)
            loss = class_loss + 0.5 * conf_loss

            total_loss += loss.item()

            # Accuracy
            _, predicted = torch.max(logits, 1)
            correct += (predicted == agent_label).sum().item()
            total += agent_label.size(0)

    avg_loss = total_loss / len(dataloader)
    accuracy = correct / total

    return avg_loss, accuracy


def main():
    parser = argparse.ArgumentParser(description='Train PyTorch routing model')
    parser.add_argument('--train-data', type=str, required=True,
                       help='Path to training data (JSONL with embeddings)')
    parser.add_argument('--val-data', type=str, required=True,
                       help='Path to validation data')
    parser.add_argument('--output', type=str, default='models/routing-head.pt',
                       help='Output model path')
    parser.add_argument('--epochs', type=int, default=50,
                       help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=32,
                       help='Batch size')
    parser.add_argument('--lr', type=float, default=0.001,
                       help='Learning rate')
    parser.add_argument('--device', type=str, default='auto',
                       help='Device (cuda/cpu/auto)')

    args = parser.parse_args()

    # Set device
    if args.device == 'auto':
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        device = torch.device(args.device)

    print(f"Using device: {device}")

    # Load datasets
    print(f"Loading training data from {args.train_data}...")
    train_dataset = RoutingDataset(Path(args.train_data))

    print(f"Loading validation data from {args.val_data}...")
    val_dataset = RoutingDataset(Path(args.val_data))

    print(f"Training samples: {len(train_dataset)}")
    print(f"Validation samples: {len(val_dataset)}")

    # Create dataloaders
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    # Initialize model
    model = PyTorchRoutingHead().to(device)

    # Optimizer and criterion
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()

    # Training loop
    best_val_acc = 0.0

    print("\nStarting training...")
    for epoch in range(args.epochs):
        train_loss = train_epoch(model, train_loader, optimizer, criterion, device)
        val_loss, val_acc = validate(model, val_loader, criterion, device)

        print(f"Epoch {epoch+1}/{args.epochs} - "
              f"Train Loss: {train_loss:.4f}, "
              f"Val Loss: {val_loss:.4f}, "
              f"Val Acc: {val_acc:.4f}")

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc

            # Create output directory
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Save checkpoint
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_accuracy': val_acc,
                'val_loss': val_loss
            }, output_path)

            print(f"  → Saved best model (val_acc: {val_acc:.4f})")

    print(f"\nTraining complete!")
    print(f"Best validation accuracy: {best_val_acc:.4f}")
    print(f"Model saved to: {args.output}")


if __name__ == '__main__':
    main()
