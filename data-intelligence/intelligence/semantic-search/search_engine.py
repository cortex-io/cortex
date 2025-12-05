#!/usr/bin/env python3
"""Semantic Search Engine for Task History"""

from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import json
from pathlib import Path
from typing import List, Dict


class SemanticSearchEngine:
    """Semantic search for task history and knowledge base"""

    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.index = None
        self.documents = []
        self.metadata = []

    def index_documents(self, docs: List[Dict]):
        """Index documents for search"""
        self.documents = docs
        self.metadata = [d.get('metadata', {}) for d in docs]

        # Generate embeddings
        texts = [d.get('text', '') for d in docs]
        embeddings = self.model.encode(texts)

        # Build FAISS index
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings.astype('float32'))

    def search(self, query: str, k: int = 5) -> List[Dict]:
        """Search for similar documents"""
        query_embedding = self.model.encode([query]).astype('float32')
        distances, indices = self.index.search(query_embedding, k)

        results = []
        for idx, dist in zip(indices[0], distances[0]):
            results.append({
                'document': self.documents[idx],
                'metadata': self.metadata[idx],
                'similarity': float(1 / (1 + dist))
            })

        return results


if __name__ == '__main__':
    engine = SemanticSearchEngine()
    print("Semantic search engine initialized")
