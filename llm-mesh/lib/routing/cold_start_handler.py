#!/usr/bin/env python3
"""
Cold Start Handler for Routing Cascade

Handles routing to new agents not in training data using zero-shot routing.

Strategy:
1. Detect new agents not in model's vocabulary
2. Use embedding similarity for zero-shot routing
3. Gradually incorporate new agents into retraining pipeline
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print(json.dumps({
        "error": "sentence-transformers not installed",
        "agent": None,
        "confidence": 0.0
    }))
    sys.exit(1)


class ColdStartHandler:
    """
    Handles routing to new agents using zero-shot routing

    Uses embedding similarity between query and agent descriptions
    for agents not in the trained model's vocabulary.
    """

    def __init__(self, agent_index_path: Optional[Path] = None):
        """
        Initialize cold start handler

        Args:
            agent_index_path: Path to agent index JSON (optional)
        """
        # Load embedding model (same as used in training)
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

        # Find cortex home
        cortex_home = Path(__file__).resolve().parents[3]

        # Load agent index
        if agent_index_path is None:
            agent_index_path = cortex_home / 'coordination' / 'masters' / 'coordinator' / 'agent-index.json'

        self.agent_index = self._load_agent_index(agent_index_path)

        # Pre-compute agent embeddings
        self.agent_embeddings = self._compute_agent_embeddings()

    def _load_agent_index(self, path: Path) -> Dict:
        """Load agent index from JSON"""
        if not path.exists():
            # Return minimal default index
            return {
                'agents': {
                    'development-master': {
                        'description': 'Handles feature development, bug fixes, and code refactoring',
                        'capabilities': ['development', 'implementation', 'refactoring', 'bug fixes']
                    },
                    'security-master': {
                        'description': 'Handles security vulnerabilities, CVE remediation, and security audits',
                        'capabilities': ['security', 'vulnerabilities', 'CVE', 'audits', 'compliance']
                    },
                    'inventory-master': {
                        'description': 'Handles documentation, cataloging, and repository metadata',
                        'capabilities': ['documentation', 'cataloging', 'inventory', 'metadata']
                    },
                    'cicd-master': {
                        'description': 'Handles builds, tests, deployments, and CI/CD pipelines',
                        'capabilities': ['build', 'test', 'deploy', 'CI/CD', 'release']
                    }
                }
            }

        with open(path, 'r') as f:
            return json.load(f)

    def _compute_agent_embeddings(self) -> Dict[str, np.ndarray]:
        """Pre-compute embeddings for all agents"""
        agent_embeddings = {}

        for agent_name, agent_info in self.agent_index.get('agents', {}).items():
            # Combine description and capabilities
            description = agent_info.get('description', '')
            capabilities = agent_info.get('capabilities', [])

            # Create rich text representation
            text = f"{description}. Capabilities: {', '.join(capabilities)}"

            # Generate embedding
            embedding = self.model.encode(text, convert_to_numpy=True)
            agent_embeddings[agent_name] = embedding

        return agent_embeddings

    def route_zero_shot(
        self,
        query: str,
        exclude_agents: Optional[List[str]] = None,
        confidence_threshold: float = 0.6
    ) -> Tuple[Optional[str], float, Dict]:
        """
        Zero-shot routing to new agents using embedding similarity

        Args:
            query: Query string to route
            exclude_agents: Optional list of agents to exclude
            confidence_threshold: Minimum similarity threshold

        Returns:
            (agent_name, confidence, metadata)
        """
        exclude_agents = exclude_agents or []

        # Embed query
        query_emb = self.model.encode(query, convert_to_numpy=True)

        # Compute similarity with all agents
        similarities = {}
        for agent_name, agent_emb in self.agent_embeddings.items():
            if agent_name in exclude_agents:
                continue

            # Cosine similarity
            similarity = np.dot(query_emb, agent_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(agent_emb)
            )
            similarities[agent_name] = float(similarity)

        if not similarities:
            return None, 0.0, {'error': 'no_agents_available'}

        # Get best match
        best_agent = max(similarities, key=similarities.get)
        best_conf = similarities[best_agent]

        metadata = {
            'method': 'cold_start_zero_shot',
            'all_similarities': similarities,
            'top_3': sorted(
                [(k, v) for k, v in similarities.items()],
                key=lambda x: x[1],
                reverse=True
            )[:3]
        }

        if best_conf >= confidence_threshold:
            return best_agent, best_conf, metadata
        else:
            return None, best_conf, {
                **metadata,
                'reason': 'confidence_too_low',
                'best_agent': best_agent,
                'best_confidence': best_conf
            }

    def suggest_training_addition(
        self,
        query: str,
        selected_agent: str,
        confidence: float
    ) -> Dict:
        """
        Suggest adding this routing decision to training data

        Args:
            query: Query that was routed
            selected_agent: Agent that was selected
            confidence: Confidence of routing decision

        Returns:
            Dict with training data format
        """
        # Generate embedding
        query_emb = self.model.encode(query, convert_to_numpy=True)

        return {
            'query': query,
            'agent': selected_agent,
            'method': 'cold_start',
            'confidence': confidence,
            'query_embedding': query_emb.tolist(),
            'label': 1,  # Assume successful (should be updated after task completion)
            'needs_review': True,
            'source': 'cold_start_handler'
        }


def main():
    """CLI entry point for cold start routing"""
    import argparse

    parser = argparse.ArgumentParser(description='Zero-shot routing for new agents')
    parser.add_argument('query', help='Query string to route')
    parser.add_argument('--exclude', nargs='*', default=[],
                       help='Agents to exclude from routing')
    parser.add_argument('--confidence-threshold', type=float, default=0.6,
                       help='Minimum confidence threshold (default: 0.6)')
    parser.add_argument('--suggest-training', action='store_true',
                       help='Output training data format')

    args = parser.parse_args()

    # Initialize handler
    handler = ColdStartHandler()

    # Route query
    agent, confidence, metadata = handler.route_zero_shot(
        args.query,
        exclude_agents=args.exclude,
        confidence_threshold=args.confidence_threshold
    )

    # Output result
    result = {
        'agent': agent,
        'confidence': confidence,
        'method': 'cold_start',
        'needs_clarification': agent is None,
        'metadata': metadata
    }

    print(json.dumps(result, indent=2))

    # Optionally output training data format
    if args.suggest_training and agent:
        training_data = handler.suggest_training_addition(args.query, agent, confidence)
        print("\nTraining data format:", file=sys.stderr)
        print(json.dumps(training_data, indent=2), file=sys.stderr)

    # Exit code: 0 if routed, 1 if needs clarification
    sys.exit(0 if agent else 1)


if __name__ == '__main__':
    main()
