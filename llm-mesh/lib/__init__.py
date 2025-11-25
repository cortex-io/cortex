"""
LLM Mesh - ML/AI Intelligence Layer for Commit-Relay

This package provides ML-enhanced routing, RAG-powered context retrieval,
and predictive capabilities for the commit-relay orchestration system.
"""

__version__ = "0.1.0"

from .routing import NeuralRouter
from .rag import CodebaseRAG
from .prediction import TaskPredictor

__all__ = ["NeuralRouter", "CodebaseRAG", "TaskPredictor"]
