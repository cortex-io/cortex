#!/usr/bin/env python3
"""
Embeddings module for RAG system.
Generates text embeddings using sentence-transformers.
"""

import json
import logging
import os
from pathlib import Path
from typing import List, Union

import numpy as np
from sentence_transformers import SentenceTransformer

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmbeddingGenerator:
    """Generates embeddings for text using sentence-transformers."""

    def __init__(self, config_path: str = None):
        """Initialize the embedding generator.

        Args:
            config_path: Path to config.json. If None, uses default path.
        """
        if config_path is None:
            config_path = Path(__file__).parent / "config.json"

        with open(config_path, 'r') as f:
            self.config = json.load(f)

        self.model_name = self.config['embedding_model']
        self.dimension = self.config['embedding_dimension']
        self.max_length = self.config['max_sequence_length']

        logger.info(f"Loading embedding model: {self.model_name}")
        self.model = SentenceTransformer(self.model_name)
        logger.info(f"Model loaded. Embedding dimension: {self.dimension}")

    def encode(self, texts: Union[str, List[str]],
               batch_size: int = None,
               show_progress: bool = False) -> np.ndarray:
        """Generate embeddings for text(s).

        Args:
            texts: Single text string or list of texts
            batch_size: Batch size for encoding. Uses config default if None.
            show_progress: Whether to show progress bar

        Returns:
            numpy array of embeddings (shape: [n, embedding_dim])
        """
        if batch_size is None:
            batch_size = self.config['batch_size']

        if isinstance(texts, str):
            texts = [texts]

        # Truncate texts if needed
        truncated_texts = [text[:self.max_length * 4] for text in texts]  # 4 chars per token approx

        embeddings = self.model.encode(
            truncated_texts,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            normalize_embeddings=True  # Normalize for cosine similarity
        )

        return embeddings

    def encode_query(self, query: str) -> np.ndarray:
        """Encode a single query string.

        Args:
            query: Query text

        Returns:
            numpy array of shape [1, embedding_dim]
        """
        return self.encode(query)

    def encode_batch(self, texts: List[str], show_progress: bool = True) -> np.ndarray:
        """Encode a batch of texts with progress tracking.

        Args:
            texts: List of text strings
            show_progress: Whether to show progress bar

        Returns:
            numpy array of embeddings
        """
        return self.encode(texts, show_progress=show_progress)

    def get_dimension(self) -> int:
        """Get the embedding dimension."""
        return self.dimension

    def get_model_info(self) -> dict:
        """Get information about the embedding model."""
        return {
            'model_name': self.model_name,
            'dimension': self.dimension,
            'max_length': self.max_length,
            'batch_size': self.config['batch_size']
        }


def main():
    """Test the embedding generator."""
    generator = EmbeddingGenerator()

    # Test single text
    text = "Implement authentication system with JWT tokens"
    embedding = generator.encode(text)
    print(f"Single text embedding shape: {embedding.shape}")
    print(f"Embedding sample: {embedding[0][:5]}")

    # Test batch
    texts = [
        "Fix SQL injection vulnerability in user input",
        "Refactor database connection pooling",
        "Optimize query performance for large datasets"
    ]
    embeddings = generator.encode_batch(texts, show_progress=False)
    print(f"\nBatch embeddings shape: {embeddings.shape}")

    # Test similarity (cosine distance with normalized vectors)
    from numpy.linalg import norm
    sim = np.dot(embeddings[0], embeddings[1])
    print(f"\nSimilarity between texts 0 and 1: {sim:.4f}")

    print("\nModel info:")
    print(json.dumps(generator.get_model_info(), indent=2))


if __name__ == '__main__':
    main()
