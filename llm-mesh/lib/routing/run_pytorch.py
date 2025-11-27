#!/usr/bin/env python3
"""
Layer 4: PyTorch Routing Head
100-300ms latency, 95-98% accuracy (with trained model)

Uses trained neural routing head for final routing decisions.
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Dict, Optional, Tuple

# Try to import required modules
try:
    import numpy as np
    import torch
    import torch.nn as nn
    from sentence_transformers import SentenceTransformer
except ImportError as e:
    print(json.dumps({
        "error": f"Required package not installed: {e}",
        "agent": None,
        "confidence": 0.0,
        "needs_clarification": True
    }))
    sys.exit(1)


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


class PyTorchRouter:
    """
    PyTorch-based router with RAG context

    Uses trained routing head to make final decisions.
    """

    # Agent mapping (matches training script)
    AGENT_NAMES = [
        'development-master',
        'security-master',
        'inventory-master',
        'cicd-master'
    ]

    def __init__(self, model_path: Optional[Path] = None):
        """Initialize PyTorch router"""
        cortex_home = Path(__file__).resolve().parents[3]
        self.model_path = model_path or cortex_home / 'llm-mesh' / 'models' / 'routing-head.pt'

        # Check if model exists
        self.model_available = self.model_path.exists()
        self.model = None
        self.embedding_model = None

        if self.model_available:
            try:
                self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

                # Load embedding model
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

                # Load trained model
                self.model = PyTorchRoutingHead().to(self.device)
                checkpoint = torch.load(self.model_path, map_location=self.device, weights_only=True)
                self.model.load_state_dict(checkpoint['model_state_dict'])
                self.model.eval()

            except Exception as e:
                print(f"Warning: Failed to load model: {e}", file=sys.stderr)
                self.model_available = False
                self.model = None

    def route(
        self,
        query: str,
        rag_context: Optional[Dict] = None,
        confidence_threshold: float = 0.9
    ) -> Dict:
        """
        Final routing decision using PyTorch model

        Args:
            query: Query string to route
            rag_context: Optional RAG context from Layer 3
            confidence_threshold: Minimum confidence to route

        Returns:
            Dict with routing decision
        """
        # Check if model is available
        if not self.model_available or self.model is None:
            # Parse RAG context for fallback
            rag_agent = None
            rag_confidence = 0.0
            if rag_context:
                try:
                    if isinstance(rag_context, str):
                        rag_context = json.loads(rag_context)
                    rag_agent = rag_context.get('agent')
                    rag_confidence = float(rag_context.get('confidence', 0.0))
                except (json.JSONDecodeError, TypeError):
                    pass

            # Fallback: If RAG provided high-confidence result, use it
            if rag_agent and rag_confidence >= 0.85:
                return {
                    'agent': rag_agent,
                    'confidence': rag_confidence,
                    'method': 'pytorch_fallback_rag',
                    'needs_clarification': False,
                    'metadata': {
                        'note': 'Using RAG result as PyTorch model not available',
                        'rag_confidence': rag_confidence
                    }
                }

            return {
                'agent': None,
                'confidence': 0.0,
                'method': 'pytorch',
                'needs_clarification': True,
                'metadata': {
                    'error': 'model_not_available',
                    'message': 'PyTorch routing model not loaded.'
                }
            }

        # Generate query embedding
        query_emb = self.embedding_model.encode(query, convert_to_numpy=True)
        query_tensor = torch.tensor(query_emb, dtype=torch.float32).unsqueeze(0).to(self.device)

        # Get model prediction
        with torch.no_grad():
            logits, conf = self.model(query_tensor)

            # Get predicted agent
            pred_idx = torch.argmax(logits, dim=1).item()
            pred_agent = self.AGENT_NAMES[pred_idx]

            # Get confidence score
            pred_conf = conf.item()

        # Check if confidence meets threshold
        if pred_conf >= confidence_threshold:
            return {
                'agent': pred_agent,
                'confidence': float(pred_conf),
                'method': 'pytorch',
                'needs_clarification': False,
                'metadata': {
                    'model_path': str(self.model_path),
                    'device': str(self.device),
                    'predicted_index': pred_idx,
                    'all_logits': logits.squeeze().tolist()
                }
            }
        else:
            # Parse RAG context for fallback
            rag_agent = None
            rag_confidence = 0.0
            if rag_context:
                try:
                    if isinstance(rag_context, str):
                        rag_context = json.loads(rag_context)
                    rag_agent = rag_context.get('agent')
                    rag_confidence = float(rag_context.get('confidence', 0.0))
                except (json.JSONDecodeError, TypeError):
                    pass

            # If RAG has higher confidence, use it
            if rag_agent and rag_confidence > pred_conf:
                return {
                    'agent': rag_agent,
                    'confidence': rag_confidence,
                    'method': 'pytorch_fallback_rag',
                    'needs_clarification': False,
                    'metadata': {
                        'note': 'RAG confidence higher than PyTorch',
                        'pytorch_confidence': float(pred_conf),
                        'pytorch_agent': pred_agent,
                        'rag_confidence': rag_confidence
                    }
                }

            # Request clarification
            return {
                'agent': None,
                'confidence': float(pred_conf),
                'method': 'pytorch',
                'needs_clarification': True,
                'metadata': {
                    'pytorch_agent': pred_agent,
                    'pytorch_confidence': float(pred_conf),
                    'threshold': confidence_threshold,
                    'message': f'PyTorch confidence {pred_conf:.2f} below threshold {confidence_threshold}'
                }
            }


def main():
    """Main entry point for PyTorch routing CLI"""
    parser = argparse.ArgumentParser(description='PyTorch routing with trained model')
    parser.add_argument('--query', type=str, help='Query string to route')
    parser.add_argument('--rag-context', type=str, default='{}',
                       help='RAG context from Layer 3 (JSON string)')
    parser.add_argument('--confidence-threshold', type=float, default=0.9,
                       help='Minimum confidence threshold (default: 0.9)')
    parser.add_argument('query_positional', nargs='?', help='Query string (positional)')

    args = parser.parse_args()

    # Get query from either flag or positional argument
    query = args.query or args.query_positional

    if not query:
        print(json.dumps({
            "error": "No query provided",
            "agent": None,
            "confidence": 0.0,
            "needs_clarification": True
        }))
        sys.exit(1)

    try:
        # Initialize router
        router = PyTorchRouter()

        # Parse RAG context
        rag_context = None
        if args.rag_context and args.rag_context != '{}':
            try:
                rag_context = json.loads(args.rag_context)
            except json.JSONDecodeError:
                print(f"Warning: Failed to parse RAG context", file=sys.stderr)

        # Route
        result = router.route(
            query,
            rag_context=rag_context,
            confidence_threshold=args.confidence_threshold
        )

        print(json.dumps(result, indent=2))

        # Exit code: 0 if routed, 1 if needs clarification
        sys.exit(0 if not result.get('needs_clarification') else 1)

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "agent": None,
            "confidence": 0.0,
            "needs_clarification": True
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
